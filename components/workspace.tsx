"use client";
import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Download,
  Expand,
  FilePenLine,
  Info,
  LoaderCircle,
  LockKeyhole,
  RefreshCw,
  Upload,
  X,
} from "lucide-react";
import {
  type Bundle,
  type Decision,
  type Preview,
  type Flaw,
  DISCLOSURE_VERSION,
  referenceOf,
  sha256,
  imageDimensions,
  verifyBundle,
  previewAdmission,
  CATEGORY_GUIDANCE,
  CATEGORY_LABELS,
} from "@/domain/model";
import {
  prepareShopper,
  putLocal,
  getLocal,
  saveDraft,
  download,
  rememberLook,
  prepareReference,
} from "@/domain/browser";
import { savePackage, saveHtml } from "@/domain/archive-client";
import { ComparisonStage } from "./comparison-stage";
import { SellerPublisher } from "./seller-publisher";
import { Photo } from "./photo";
import { DecisionDesk } from "./decision-desk";
import { EvidenceInspector } from "./evidence-inspector";
import { QuickEdit } from "./quick-edit";
import styles from "./workspace.module.css";

type Pending = {
  intent?: string;
  stage: "submitting" | "running" | "unknown" | "complete";
  itemDigest: string;
  referenceDigest: string;
  shopperDigest: string;
  createdAt: string;
  token?: string;
};
type Stage =
  | "idle"
  | "uploading"
  | "running"
  | "complete"
  | "error"
  | "unknown"
  | "paused";
const choices: [Decision, string][] = [
  ["unreviewed", "Not reviewed"],
  ["acceptable", "Acceptable to me"],
  ["ask-seller", "Ask seller"],
  ["skip", "Skip item"],
];

export function Workspace({
  bundle,
  onChange,
  onEdit,
  onHome,
  onNotice,
  openLive = false,
  initialShopper,
  onShopperChange,
}: {
  bundle: Bundle;
  onChange: (bundle: Bundle) => void;
  onEdit: () => void;
  onHome: () => void;
  onNotice: (message: string) => void;
  openLive?: boolean;
  initialShopper?: Uint8Array;
  onShopperChange: (photo?: Uint8Array) => void;
}) {
  const { item } = bundle;
  const reference = referenceOf(item);
  const [focused, setFocused] = useState<Flaw>();
  const shopperRead = useRef(0);
  const pendingKey = `pending:${item.itemId}:${item.contentDigest}`;
  const initialLiveResult = useRef(
    bundle.preview?.mode === "live" && !!bundle.result,
  );
  const [consentOpen, setConsentOpen] = useState(openLive || !bundle.result);
  const [view, setView] = useState<"try" | "inspect" | "save">("try");
  const [quickEditing, setQuickEditing] = useState(false);
  const [errorCode, setErrorCode] = useState("");
  const shopperInput = useRef<HTMLInputElement>(null);
  const [shopper, setShopper] = useState<Uint8Array | undefined>(
    initialShopper,
  );
  const [lookSaved, setLookSaved] = useState(false);
  const [lookSaving, setLookSaving] = useState(false);
  const lookVersion = useRef(0);
  const [consent, setConsent] = useState(false);
  const [exportConsent, setExportConsent] = useState(false);
  const [stage, setStage] = useState<Stage>("idle");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState<Pending>();
  const [preparing, setPreparing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [inspected, setInspected] = useState<Flaw>();
  const lock = useRef(false);
  const active = stage === "uploading" || stage === "running";
  const unresolved = active || stage === "unknown" || stage === "paused";
  const quick = item.declaration === "not-supplied";
  useEffect(() => {
    let cancelled = false;
    const version = ++lookVersion.current;
    void getLocal<Pick<Bundle, "preview">>("look:" + item.itemId)
      .then((look) => {
        if (!cancelled && version === lookVersion.current)
          setLookSaved(
            !!look?.preview &&
              look.preview.itemDigest === item.contentDigest &&
              look.preview.resultDigest === bundle.preview?.resultDigest,
          );
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [item.itemId, item.contentDigest, bundle.preview?.resultDigest]);

  useEffect(() => {
    void getLocal<Pending>(pendingKey)
      .then(async (p) => p || (await getLocal<Pending>("pending")))
      .then((p) => {
        if (
          p?.itemDigest === item.contentDigest &&
          !(p.stage === "complete" && initialLiveResult.current)
        ) {
          setPending(p);
          setStage(p.token ? "paused" : "unknown");
          setMessage(
            p.token
              ? "A known task can be resumed without creating another preview."
              : "An earlier submission has no confirmed task token. Check this request again; you can continue inspecting and saving.",
          );
        }
      })
      .catch(() => {});
  }, [item.contentDigest, pendingKey]);

  useEffect(() => {
    if (stage !== "running" || !pending?.token) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let count = 0;
    async function poll() {
      if (cancelled) return;
      if (document.hidden) {
        timer = setTimeout(poll, 10000);
        return;
      }
      try {
        const status = await fetch("/api/preview/status", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: pending!.token }),
          signal: AbortSignal.timeout(30000),
        });
        const state = await status.json();
        if (cancelled) return;
        if (!status.ok)
          throw new Error(
            state.message || "Task status could not be confirmed.",
          );
        if (state.state === "error") {
          setStage("error");
          setMessage(
            state.message ||
              "YouCam did not create a preview. Check your photos and category before trying again.",
          );
          setErrorCode(state.code || "PROVIDER_TASK_FAILED");
          setConsent(false);
          setPending(undefined);
          await putLocal(pendingKey, undefined);
          return;
        }
        if (state.state === "success") {
          const response = await fetch("/api/preview/result", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token: pending!.token }),
            signal: AbortSignal.timeout(70000),
          });
          if (!response.ok) {
            const body = await response.json();
            throw new Error(body.message || "Result download failed.");
          }
          const result = new Uint8Array(await response.arrayBuffer());
          const meta = imageDimensions(result);
          const digest = await sha256(result);
          if (digest !== response.headers.get("X-AsShown-Result-Digest"))
            throw new Error("The downloaded result digest did not match.");
          const preview: Preview = {
            provider: "YouCam Clothes VTO V3",
            mode: "live",
            itemDigest: item.contentDigest,
            referenceDigest: pending!.referenceDigest,
            shopperDigest: pending!.shopperDigest,
            resultDigest: digest,
            createdAt: pending!.createdAt,
            mime: meta.mime,
            disclosureVersion: DISCLOSURE_VERSION,
            category: item.category,
          };
          const next = { ...bundle, preview, result };
          await verifyBundle(next);
          if (cancelled) return;
          onChange(next);
          setStage("complete");
          setConsentOpen(false);
          setShopper(undefined);
          setConsent(false);
          setMessage("Your YouCam look is ready.");
          // Retain only the known capability, never the personal input/result.
          // A completed image can be re-fetched after refresh until token expiry.
          await putLocal(pendingKey, { ...pending, stage: "complete" });
          return;
        }
        if (++count >= 18) {
          setStage("paused");
          setMessage(
            "The waiting period ended, not necessarily the task. Check the same known task again; no new generation is needed.",
          );
          return;
        }
        timer = setTimeout(poll, 10000);
      } catch (e) {
        if (cancelled) return;
        setStage("paused");
        setMessage(
          e instanceof Error
            ? e.message
            : "The known task could not be checked.",
        );
      }
    }
    void poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
    // Freeze the item/review snapshot only while this task is running. Editing is disabled; review controls remain usable after completion.
  }, [stage, pending?.token]); // eslint-disable-line react-hooks/exhaustive-deps

  async function selectShopper(file: File) {
    const version = ++shopperRead.current;
    setShopper(undefined);
    setPreparing(true);
    setMessage("");
    if (!unresolved) setStage("idle");
    setConsent(false);
    setErrorCode("");
    onShopperChange(undefined);
    try {
      const prepared = await prepareShopper(file);
      if (version === shopperRead.current) {
        setShopper(prepared);
        onShopperChange(prepared);
      }
    } catch (e) {
      if (version === shopperRead.current)
        setMessage(
          e instanceof Error ? e.message : "Photo preparation failed.",
        );
    } finally {
      if (version === shopperRead.current) setPreparing(false);
    }
  }
  async function start() {
    if (lock.current || !shopper || !consent || unresolved) return;
    lock.current = true;
    setStage("uploading");
    setConsent(false);
    setErrorCode("");
    setMessage("Sending your two approved photos…");
    let sent = false;
    try {
      await verifyBundle(bundle);
      const sourceDigest = await sha256(shopper);
      const intent: Pending = {
        intent: crypto.randomUUID(),
        stage: "submitting",
        itemDigest: item.contentDigest,
        referenceDigest: reference.digest,
        shopperDigest: sourceDigest,
        createdAt: new Date().toISOString(),
      };
      const session = await fetch("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
        signal: AbortSignal.timeout(15000),
      });
      if (!session.ok) {
        const p = await session.json();
        throw new Error(p.message || "Preview session could not start.");
      }
      // A local intent survives a refresh. Never persist the personal input photo.
      await saveDraft(bundle);
      await putLocal(pendingKey, intent);
      setPending(intent);
      const form = new FormData();
      form.set("item", JSON.stringify(previewAdmission(item)));
      form.set(
        "consent",
        JSON.stringify({
          affirmative: true,
          policyVersion: DISCLOSURE_VERSION,
          itemDigest: item.contentDigest,
          approvedAt: new Date().toISOString(),
        }),
      );
      form.set(
        "shopper",
        new Blob([new Uint8Array(shopper)], { type: "image/jpeg" }),
        "shopper.jpg",
      );
      form.set(
        "reference",
        new Blob([new Uint8Array(bundle.assets[reference.id])], {
          type: reference.mime,
        }),
        "reference." + (reference.mime === "image/png" ? "png" : "jpg"),
      );
      sent = true;
      const response = await fetch("/api/preview", {
        method: "POST",
        headers: { "Idempotency-Key": intent.intent! },
        body: form,
        signal: AbortSignal.timeout(100000),
      });
      const result = await response.json();
      if (!response.ok) {
        setErrorCode(result.code || "PREVIEW_NOT_CREATED");
        if (result.code === "SUBMISSION_UNKNOWN") {
          setStage("unknown");
          setMessage(result.message);
          await putLocal(pendingKey, { ...intent, stage: "unknown" });
          return;
        }
        await putLocal(pendingKey, undefined);
        sent = false;
        throw new Error(result.message || "Preview could not be created.");
      }
      const next: Pending = {
        ...intent,
        stage: "running",
        token: result.token,
        createdAt: result.createdAt,
      };
      await putLocal(pendingKey, next);
      setPending(next);
      setStage("running");
      setMessage(
        "YouCam is creating your look. You can keep inspecting the piece.",
      );
    } catch (e) {
      if (!sent) {
        setPending(undefined);
        await putLocal(pendingKey, undefined).catch(() => {});
      }
      setStage(sent ? "unknown" : "error");
      setMessage(
        sent
          ? "The submission outcome is unknown. Check this request again; inspection and saving remain available."
          : e instanceof Error
            ? e.message
            : "Preview could not start.",
      );
    } finally {
      lock.current = false;
    }
  }
  async function save(kind: "item" | "decision", html = false) {
    setSaving(true);
    try {
      if (kind === "decision" && !exportConsent)
        throw new Error(
          "Confirm the private-image warning before downloading a decision package.",
        );
      const bytes = html
        ? await saveHtml(bundle, kind)
        : await savePackage(bundle, kind);
      download(
        bytes,
        `as-shown-${kind}-r${item.revision}.${html ? "html" : "zip"}`,
        html ? "text/html;charset=utf-8" : "application/zip",
      );
      onNotice(
        html
          ? "Saved record downloaded. Open the HTML file to read its embedded photographs offline."
          : `${kind === "item" ? "Seller item" : "Private decision"} archive downloaded. You can import it directly here or extract it for the offline viewer.`,
      );
    } catch (e) {
      onNotice(e instanceof Error ? e.message : "Package could not be saved.");
    } finally {
      setSaving(false);
    }
  }
  async function recover() {
    if (!pending?.intent || lock.current) return;
    lock.current = true;
    try {
      const response = await fetch("/api/preview/recover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intent: pending.intent }),
        signal: AbortSignal.timeout(30000),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(
          data.message || "The submitted request could not be recovered.",
        );
      const next: Pending = {
        ...pending,
        token: data.token,
        stage: "running",
        createdAt: data.createdAt,
      };
      await putLocal(pendingKey, next);
      setPending(next);
      setStage("running");
      setMessage(
        "Recovered the existing task. No new generation or units requested.",
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Recovery could not be confirmed.",
      );
    } finally {
      lock.current = false;
    }
  }
  function decide(id: string, value: Decision) {
    onChange({
      ...bundle,
      review: {
        ...bundle.review,
        decisions: { ...bundle.review.decisions, [id]: value },
      },
    });
  }
  const reviewed = item.flaws.filter(
    (f) => bundle.review.decisions[f.id] !== "unreviewed",
  ).length;
  const synthetic = item.assets.some((a) => a.origin === "synthetic-demo");
  const taskNotice = message && (
    <div
      className={
        "task-notice " +
        (stage === "error" || stage === "unknown" || stage === "paused"
          ? "is-warning"
          : "")
      }
      role={stage === "error" ? "alert" : "status"}
    >
      {stage === "error" && <strong>No new preview was created.</strong>}
      <p>{message}</p>
      {errorCode && (
        <details>
          <summary>Technical details</summary>
          <code>{errorCode}</code>
        </details>
      )}
      {stage === "error" && !unresolved && (
        <div className="task-actions">
          <button
            className="text-button"
            onClick={() => {
              setConsentOpen(true);
              requestAnimationFrame(() => shopperInput.current?.click());
            }}
          >
            Change my photo <Upload size={15} />
          </button>
          {quick && (
            <button
              className="text-button"
              onClick={() => setQuickEditing(true)}
            >
              Check piece & category <ArrowRight size={15} />
            </button>
          )}
        </div>
      )}
      {stage === "unknown" && pending?.intent && (
        <button className="button secondary" onClick={() => void recover()}>
          <RefreshCw size={15} />
          Recover submitted request
        </button>
      )}
      {stage === "paused" && pending?.token && (
        <button
          className="button secondary"
          onClick={() => setStage("running")}
        >
          <RefreshCw size={15} />
          Check the same task
        </button>
      )}
    </div>
  );
  return (
    <section className={"workspace " + styles.root}>
      <div className="item-heading">
        <div>
          <span className="eyebrow">
            {CATEGORY_LABELS[item.category]} ·{" "}
            {quick ? "Your find" : "Seller record"}
          </span>
          <h1>{item.title}</h1>
          {!quick && <p>{item.description}</p>}
        </div>
        <div className="piece-actions">
          <button
            className="icon-button"
            aria-label="Back to fitting room"
            onClick={onHome}
          >
            <ArrowLeft size={18} />
          </button>
          {!quick && (
            <span className="pill outline">Revision {item.revision}</span>
          )}
          <button
            className="text-button"
            onClick={() => (quick ? setQuickEditing(true) : onEdit())}
            disabled={unresolved}
          >
            <FilePenLine size={17} />
            Edit record
          </button>
        </div>
      </div>
      {synthetic && (
        <div className="demo-note">
          <Info size={17} />
          <span>
            Synthetic demo ·{" "}
            {bundle.preview ? "actual YouCam output" : "no generated result"}
          </span>
        </div>
      )}
      <div
        className="workspace-tabs"
        role="tablist"
        aria-label="Fitting room tools"
      >
        {(
          [
            ["try", "Try on"],
            ["inspect", "Inspect"],
            ["save", "Save"],
          ] as const
        ).map(([key, label], index, tabs) => (
          <button
            key={key}
            id={"work-tab-" + key}
            role="tab"
            aria-controls={"work-panel-" + key}
            aria-selected={view === key}
            tabIndex={view === key ? 0 : -1}
            onClick={() => setView(key)}
            onKeyDown={(event) => {
              const next =
                event.key === "ArrowRight"
                  ? (index + 1) % tabs.length
                  : event.key === "ArrowLeft"
                    ? (index + tabs.length - 1) % tabs.length
                    : event.key === "Home"
                      ? 0
                      : event.key === "End"
                        ? tabs.length - 1
                        : -1;
              if (next < 0) return;
              event.preventDefault();
              setView(tabs[next][0]);
              document.getElementById("work-tab-" + tabs[next][0])?.focus();
            }}
          >
            <span aria-hidden="true">0{index + 1}</span>
            {label}
          </button>
        ))}
        <span className="workspace-privacy">
          <LockKeyhole size={14} /> On this device
        </span>
      </div>
      <div
        className="review-layout"
        role="tabpanel"
        id="work-panel-try"
        aria-labelledby="work-tab-try"
        hidden={view !== "try"}
      >
        <div className="visual-column">
          <ComparisonStage
            bundle={bundle}
            activeFlaw={focused}
            onInspect={setFocused}
            onPreview={() => setConsentOpen(true)}
            shopper={shopper}
            processing={active}
            stage={stage}
            showInput={consentOpen && !!shopper}
          />
          {(reference.byteLength > 1_200_000 ||
            reference.width > 4096 ||
            reference.height > 4096) && (
            <div className="status-box">
              <p>
                This imported reference needs a smaller preview copy. Its
                original evidence will be retained in a new revision.
              </p>
              <button
                className="button secondary"
                onClick={async () => {
                  try {
                    onChange(await prepareReference(bundle));
                    onNotice(
                      "Preview input prepared locally. Review this new revision before approving generation.",
                    );
                  } catch (e) {
                    onNotice(
                      e instanceof Error ? e.message : "Preparation failed.",
                    );
                  }
                }}
              >
                Prepare this record for YouCam
              </button>
            </div>
          )}
          {!consentOpen && (
            <button
              className="button primary wide"
              onClick={() => {
                setConsentOpen(true);
                setMessage("");
              }}
              disabled={active}
            >
              Preview on me <ArrowRight size={18} />
            </button>
          )}
          {consentOpen && (
            <section className="consent-panel">
              <div className="section-line">
                <h2>{bundle.result ? "Try a new look." : "Make it yours."}</h2>
                <button
                  className="icon-button"
                  aria-label="Close preview form"
                  disabled={active || preparing}
                  onClick={() => setConsentOpen(false)}
                >
                  <X size={19} />
                </button>
              </div>
              {taskNotice}
              <p>{CATEGORY_GUIDANCE[item.category]}</p>
              <div className="shopper-picker">
                <label className="button secondary">
                  <Upload size={16} />
                  {preparing ? "Preparing locally…" : "Choose your photo"}
                  <input
                    ref={shopperInput}
                    type="file"
                    accept="image/jpeg,image/png"
                    disabled={unresolved || preparing}
                    onChange={(e) => {
                      if (e.target.files?.[0])
                        void selectShopper(e.target.files[0]);
                      e.target.value = "";
                    }}
                  />
                </label>
                <button
                  className="text-button"
                  aria-label="Use synthetic sample instead"
                  disabled={unresolved || preparing}
                  onClick={async () => {
                    setPreparing(true);
                    setConsent(false);
                    setShopper(undefined);
                    onShopperChange(undefined);
                    setErrorCode("");
                    setMessage("");
                    setStage("idle");
                    try {
                      const version = ++shopperRead.current;
                      const r = await fetch("/samples/shopper.jpg");
                      if (!r.ok) throw new Error();
                      const bytes = await prepareShopper(
                        new File([await r.arrayBuffer()], "demo-model.jpg", {
                          type: "image/jpeg",
                        }),
                      );
                      if (version === shopperRead.current) {
                        setShopper(bytes);
                        onShopperChange(bytes);
                      }
                    } catch {
                      setMessage("Sample photo could not be loaded.");
                    } finally {
                      setPreparing(false);
                    }
                  }}
                >
                  Use demo model instead
                </button>
              </div>
              <details className="consent-detail">
                <summary>Photo privacy & processing</summary>
                <LockKeyhole size={20} />
                <p>
                  Only your prepared photo and this record’s garment reference
                  go through our server to Perfect Corp.’s YouCam API. Condition
                  close-ups and buyer notes are not sent. The provider policy
                  describes USA storage and generally 30-day retention, with
                  exceptions; clearing As-Shown does not delete provider-held
                  data.{" "}
                  <a
                    href="https://www.makeupar.com/perfectbeauty/youcam/privacy-policy-api"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Read provider policy
                  </a>
                  .
                </p>
              </details>
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={consent}
                  disabled={unresolved || !shopper}
                  onChange={(e) => setConsent(e.target.checked)}
                />
                <span>
                  I’m an adult and have permission to use these images. Send the
                  two selected photos to YouCam.
                </span>
              </label>
              <p className="preview-cost">
                Up to 2 free units · Never auto-retried
              </p>
              <button
                className="button primary wide"
                disabled={!consent || !shopper || preparing || unresolved}
                onClick={() => void start()}
              >
                {active ? (
                  <LoaderCircle size={17} className="spin" />
                ) : (
                  <ArrowRight size={17} />
                )}{" "}
                {active
                  ? "Processing this task…"
                  : "Send approved images & preview"}
              </button>
              {shopper && !active && (
                <button
                  className="text-button"
                  onClick={() => {
                    ++shopperRead.current;
                    setShopper(undefined);
                    onShopperChange(undefined);
                    setConsent(false);
                  }}
                >
                  Remove my photo from this session
                </button>
              )}
            </section>
          )}
          {!consentOpen && taskNotice}
          {!consentOpen && bundle.result && (
            <div className="result-next">
              <button
                className="button primary"
                onClick={() => {
                  setView("save");
                  document.getElementById("work-tab-save")?.focus();
                }}
              >
                Keep this look <Download size={17} />
              </button>
              <button
                className="text-button"
                onClick={() => {
                  setView("inspect");
                  document.getElementById("work-tab-inspect")?.focus();
                }}
              >
                Inspect the piece <ArrowRight size={17} />
              </button>
            </div>
          )}
        </div>
      </div>
      <div
        className="inspection-panel"
        role="tabpanel"
        id="work-panel-inspect"
        aria-labelledby="work-tab-inspect"
        hidden={view !== "inspect"}
      >
        <aside className="condition-column">
          <div className="condition-heading">
            <h2>
              {quick ? "Condition information not supplied." : "Look closer."}
            </h2>
            <p>
              {quick
                ? "A try-on shows style, not wear or fit. Ask for original condition photos and measurements."
                : item.flaws.length
                  ? `${reviewed} of ${item.flaws.length} declared issues reviewed`
                  : "Seller reports no known flaws; not independently inspected."}
            </p>
          </div>
          {quick && (
            <section className="missing-condition">
              <button className="text-button" onClick={onEdit}>
                I’m the seller—add condition details <ArrowRight size={17} />
              </button>
            </section>
          )}
          {item.flaws.map((flaw, index) => (
            <article className="condition-card" key={flaw.id}>
              <div className="section-line">
                <span className="issue-number">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className="small">
                  Seller-declared · not independently inspected
                </span>
              </div>
              <h3>{flaw.description}</h3>
              {flaw.closeupAssetIds.map((id) => {
                const a = item.assets.find((a) => a.id === id)!;
                return (
                  <div className="condition-photo" key={id}>
                    <Photo
                      bytes={bundle.assets[id]}
                      mime={a.mime}
                      alt={a.description}
                      onClick={() => setInspected(flaw)}
                    />
                  </div>
                );
              })}
              <button
                className="text-button"
                onClick={() => setInspected(flaw)}
              >
                Inspect the linked source view <Expand size={14} />
              </button>
              <fieldset className="decision-options" disabled={active}>
                <legend>Your preference—not a condition verdict</legend>
                {choices.map(([value, label]) => (
                  <label
                    className={
                      bundle.review.decisions[flaw.id] === value ? "chosen" : ""
                    }
                    key={value}
                  >
                    <input
                      type="radio"
                      name={"review-" + flaw.id}
                      value={value}
                      checked={bundle.review.decisions[flaw.id] === value}
                      onChange={() => decide(flaw.id, value)}
                    />
                    {label}
                    {bundle.review.decisions[flaw.id] === value && (
                      <Check size={15} />
                    )}
                  </label>
                ))}
              </fieldset>
            </article>
          ))}
          <section className="buyer-notes">
            <label>
              Your questions & notes
              <textarea
                maxLength={3000}
                value={bundle.review.notes}
                disabled={active}
                onChange={(e) =>
                  onChange({
                    ...bundle,
                    review: { ...bundle.review, notes: e.target.value },
                  })
                }
                placeholder="What would you ask the seller before deciding?"
              />
            </label>
            <p className="small">
              Private on this device. Nothing is sent to the seller.
            </p>
          </section>
        </aside>
        <DecisionDesk bundle={bundle} />
        {!quick && <SellerPublisher bundle={bundle} />}
      </div>
      <EvidenceInspector
        bundle={bundle}
        flaw={inspected}
        onClose={() => setInspected(undefined)}
      />
      <div
        role="tabpanel"
        id="work-panel-save"
        aria-labelledby="work-tab-save"
        hidden={view !== "save"}
      >
        <section className="save-section">
          <div>
            <h2>Keep the whole picture.</h2>
            <p>
              Download the original photos, your notes
              {bundle.result ? " and this generated look" : ""}. Reopen them
              later, even offline.
            </p>
            <label className="check-label">
              <input
                type="checkbox"
                checked={exportConsent}
                onChange={(e) => setExportConsent(e.target.checked)}
              />
              <span>
                I understand a decision package may contain my likeness and
                private notes. I’ll store and share it carefully.
              </span>
            </label>
          </div>
          <div className="save-actions">
            {bundle.result && (
              <label className="check-label local-look-consent">
                <input
                  type="checkbox"
                  checked={lookSaved}
                  disabled={lookSaving}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    const previous = lookSaved;
                    ++lookVersion.current;
                    setLookSaved(checked);
                    setLookSaving(true);
                    void rememberLook(bundle, checked)
                      .then(() => {
                        onNotice(
                          checked
                            ? "Generated look saved only on this device. Your input photo was not saved. Remove it here or clear device data at any time."
                            : "Saved generated look removed from this device. The open session and downloaded copies remain.",
                        );
                      })
                      .catch((error) => {
                        setLookSaved(previous);
                        onNotice(
                          error instanceof Error
                            ? error.message
                            : "The saved-look preference could not be changed.",
                        );
                      })
                      .finally(() => setLookSaving(false));
                  }}
                />
                <span>
                  Keep this generated look in My Rack on this device. Contains
                  my likeness; no cloud upload.
                </span>
              </label>
            )}
            <button
              className="button primary"
              disabled={saving || active || !exportConsent}
              onClick={() => void save("decision")}
            >
              <Download size={17} />
              Download private decision
            </button>
            <button
              className="button secondary"
              disabled={saving || active || !exportConsent}
              onClick={() => void save("decision", true)}
            >
              <Download size={17} />
              Save readable record (HTML)
            </button>
            <button
              className="button secondary"
              disabled={saving || active}
              onClick={() => void save("item")}
            >
              <Download size={17} />
              {quick ? "Export reference only" : "Export seller item only"}
            </button>
            <button
              className="text-button"
              disabled={saving || active}
              onClick={async () => {
                try {
                  await saveDraft(bundle);
                  onNotice(
                    "Source record and buyer notes saved on this device. Personal photo and generated preview were not stored in the draft.",
                  );
                } catch (e) {
                  onNotice(
                    e instanceof Error
                      ? e.message
                      : "Draft could not be saved.",
                  );
                }
              }}
            >
              Save source draft on this device
            </button>
            <p className="small">
              HTML opens offline. ZIP can be imported back into As-Shown.
            </p>
          </div>
        </section>
      </div>
      {quickEditing && (
        <QuickEdit
          bundle={bundle}
          onClose={() => setQuickEditing(false)}
          onSave={onChange}
        />
      )}
    </section>
  );
}
