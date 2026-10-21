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
  ShieldCheck,
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
} from "@/domain/model";
import {
  prepareShopper,
  putLocal,
  getLocal,
  saveDraft,
  download,
} from "@/domain/browser";
import { savePackage, saveHtml } from "@/domain/archive-client";
import { prepareReference } from "@/domain/browser";
import { ComparisonStage } from "./comparison-stage";
import { SellerPublisher } from "./seller-publisher";
import { Photo } from "./photo";
import { DecisionDesk } from "./decision-desk";
import { EvidenceInspector } from "./evidence-inspector";

type Pending = {
  intent?: string;
  stage: "submitting" | "running" | "unknown";
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
}: {
  bundle: Bundle;
  onChange: (bundle: Bundle) => void;
  onEdit: () => void;
  onHome: () => void;
  onNotice: (message: string) => void;
  openLive?: boolean;
}) {
  const { item } = bundle;
  const reference = referenceOf(item);
  const [focused, setFocused] = useState<Flaw>();
  const shopperRead = useRef(0);
  const pendingKey = `pending:${item.itemId}:${item.contentDigest}`;
  const [consentOpen, setConsentOpen] = useState(openLive);
  const [shopper, setShopper] = useState<Uint8Array>();
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

  useEffect(() => {
    void getLocal<Pending>(pendingKey)
      .then(async (p) => p || (await getLocal<Pending>("pending")))
      .then((p) => {
        if (p?.itemDigest === item.contentDigest) {
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
        });
        const state = await status.json();
        if (cancelled) return;
        if (!status.ok)
          throw new Error(
            state.message || "Task status could not be confirmed.",
          );
        if (state.state === "error") {
          setStage("error");
          setMessage(state.message);
          await putLocal(pendingKey, undefined);
          return;
        }
        if (state.state === "success") {
          const response = await fetch("/api/preview/result", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token: pending!.token }),
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
          };
          const next = { ...bundle, preview, result };
          await verifyBundle(next);
          if (cancelled) return;
          onChange(next);
          setStage("complete");
          setConsentOpen(false);
          setShopper(undefined);
          setConsent(false);
          setMessage(
            "Your real YouCam result is ready. Review original condition evidence beside it.",
          );
          await putLocal(pendingKey, undefined);
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
    setConsent(false);
    try {
      const prepared = await prepareShopper(file);
      if (version === shopperRead.current) setShopper(prepared);
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
    if (lock.current || !shopper || !consent || active || stage === "unknown")
      return;
    lock.current = true;
    setStage("uploading");
    setMessage(
      "Validating the record, preparing the session, then sending only the two approved images.",
    );
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
        "YouCam is processing this known task. It is safe to wait; no repeated task is being created.",
      );
    } catch (e) {
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
        `asshown-${kind}-r${item.revision}.${html ? "html" : "zip"}`,
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
  return (
    <section className="workspace">
      <div className="workspace-top">
        <button className="text-button" onClick={onHome}>
          <ArrowLeft size={16} /> All stories
        </button>
        <div>
          <span className="pill outline">Revision {item.revision}</span>
          <button className="text-button" onClick={onEdit} disabled={active}>
            <FilePenLine size={15} />
            Edit record
          </button>
        </div>
      </div>
      <div className="item-heading">
        <div>
          <span className="eyebrow">ONE ITEM. THE WHOLE PICTURE.</span>
          <h1>{item.title}</h1>
          <p>{item.description}</p>
        </div>
        <span className="record-tag">
          <ShieldCheck size={20} />
          Files agree with this record
          <small>Not an inspection or authenticity check</small>
        </span>
      </div>
      {synthetic && (
        <div className="demo-note">
          <Info size={17} />
          <span>
            Demonstration item and photographs are synthetic.{" "}
            {bundle.preview
              ? "The style preview is an actual YouCam result."
              : "No style preview has been generated for this record."}
          </span>
        </div>
      )}
      <div className="studio-progress" aria-label="Inspection workflow">
        <span>
          <b>01</b> Source record <Check size={14} />
        </span>
        <span>
          <b>02</b> Style preview{" "}
          {bundle.preview ? <Check size={14} /> : <small>optional</small>}
        </span>
        <span>
          <b>03</b> Condition review{" "}
          <small>
            {reviewed}/{item.flaws.length}
          </small>
        </span>
        <span>
          <b>04</b> Keep your decision
        </span>
      </div>
      <div className="review-layout">
        <div className="visual-column">
          <ComparisonStage
            bundle={bundle}
            activeFlaw={focused}
            onInspect={setFocused}
            onPreview={() => setConsentOpen(true)}
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
              disabled={active || stage === "unknown"}
            >
              Preview on me <ArrowRight size={18} />
            </button>
          )}
          {consentOpen && (
            <section className="consent-panel">
              <div className="section-line">
                <h2>A preview, with permission.</h2>
                <button
                  className="icon-button"
                  aria-label="Close preview form"
                  disabled={active}
                  onClick={() => setConsentOpen(false)}
                >
                  <X size={19} />
                </button>
              </div>
              <p>
                Use one front-facing adult, an unobscured torso and arms away
                from the shirt. Full-body and head-to-mid-thigh framings worked
                in our synthetic tests; other inputs remain unverified.
              </p>
              <div className="shopper-picker">
                <label className="button secondary">
                  <Upload size={16} />
                  {preparing ? "Preparing locally…" : "Choose your photo"}
                  <input
                    type="file"
                    accept="image/jpeg,image/png"
                    disabled={active || preparing || stage === "unknown"}
                    onChange={(e) => {
                      if (e.target.files?.[0])
                        void selectShopper(e.target.files[0]);
                    }}
                  />
                </label>
                <button
                  className="text-button"
                  disabled={active || preparing || stage === "unknown"}
                  onClick={async () => {
                    setPreparing(true);
                    setConsent(false);
                    try {
                      const r = await fetch("/samples/shopper.jpg");
                      setShopper(new Uint8Array(await r.arrayBuffer()));
                    } catch {
                      setMessage("Sample photo could not be loaded.");
                    } finally {
                      setPreparing(false);
                    }
                  }}
                >
                  Use synthetic sample instead
                </button>
              </div>
              {shopper && (
                <Photo
                  bytes={shopper}
                  alt="Locally prepared shopper photo, not yet sent"
                  className="shopper-thumbnail"
                />
              )}
              <p className="small">
                Your photo is prepared locally as JPEG, with metadata removed
                and dimensions capped at 2048 px. The personal input stays in
                memory, not a saved draft.
              </p>
              <div className="consent-detail">
                <LockKeyhole size={20} />
                <p>
                  Only your prepared photo and this record’s garment reference
                  go through our server to Perfect Corp.’s YouCam API. Condition
                  close-ups and buyer notes are not sent. The provider policy
                  describes USA storage and generally 30-day retention, with
                  exceptions; clearing AsShown does not delete provider-held
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
              </div>
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={consent}
                  disabled={active || !shopper}
                  onChange={(e) => setConsent(e.target.checked)}
                />
                <span>
                  I’m an adult and have permission to use these images. I
                  approve sending the two selected images for this preview and
                  saving the item record and recovery token on this device.
                  Expected allowance: at most 2 free units. No purchase or paid
                  fallback.
                </span>
              </label>
              <button
                className="button primary wide"
                disabled={
                  !consent ||
                  !shopper ||
                  preparing ||
                  active ||
                  stage === "unknown"
                }
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
            </section>
          )}
          {message && (
            <div
              className={
                "status-box " +
                (stage === "error" || stage === "unknown" ? "warning" : "")
              }
              role="status"
            >
              {message}
              {stage === "unknown" && pending?.intent && (
                <button
                  className="button secondary"
                  onClick={() => void recover()}
                >
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
          )}
        </div>
        <aside className="condition-column">
          <div className="condition-heading">
            <span className="eyebrow">CONDITION, NOT GENERATED</span>
            <h2>Keep the details in view.</h2>
            <p>
              {item.flaws.length
                ? `${reviewed} of ${item.flaws.length} declared issues reviewed`
                : "Seller reports no known flaws; not independently inspected."}
            </p>
          </div>
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
              Stays on your device or in your download. Nothing is sent to the
              seller.
            </p>
          </section>
        </aside>
      </div>
      <DecisionDesk bundle={bundle} />
      <SellerPublisher bundle={bundle} />
      <EvidenceInspector
        bundle={bundle}
        flaw={inspected}
        onClose={() => setInspected(undefined)}
      />
      <section className="save-section">
        <div>
          <span className="eyebrow">TAKE THE WHOLE RECORD WITH YOU</span>
          <h2>A decision you can reopen.</h2>
          <p>
            Your source photographs, the exact revision and your decisions. When
            you generated a preview, its actual image is included.
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
            Export seller item only
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
                  e instanceof Error ? e.message : "Draft could not be saved.",
                );
              }
            }}
          >
            Save source draft on this device
          </button>
          <p className="small">
            Open the HTML download directly, or keep the ZIP for verified import
            and the full archival record.
          </p>
        </div>
      </section>
    </section>
  );
}
