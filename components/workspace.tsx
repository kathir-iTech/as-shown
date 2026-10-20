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
  type Asset,
  type Decision,
  type Preview,
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
import { exportPackage } from "@/packages/archive";
import { Photo } from "./photo";

type Pending = {
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
  const [view, setView] = useState(bundle.preview ? "preview" : "reference");
  const [consentOpen, setConsentOpen] = useState(openLive);
  const [shopper, setShopper] = useState<Uint8Array>();
  const [consent, setConsent] = useState(false);
  const [exportConsent, setExportConsent] = useState(false);
  const [stage, setStage] = useState<Stage>("idle");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState<Pending>();
  const [preparing, setPreparing] = useState(false);
  const [saving, setSaving] = useState(false);
  const lock = useRef(false);
  const [zoom, setZoom] = useState<{
    bytes: Uint8Array;
    mime: string;
    title: string;
  }>();
  const dialog = useRef<HTMLDialogElement>(null);
  const active = stage === "uploading" || stage === "running";
  useEffect(() => {
    if (bundle.preview && bundle.result) setView("preview");
  }, [!!bundle.preview, bundle.preview?.resultDigest]);
  useEffect(() => {
    void getLocal<Pending>("pending")
      .then((p) => {
        if (p?.itemDigest === item.contentDigest) {
          setPending(p);
          setStage(p.token ? "paused" : "unknown");
          setMessage(
            p.token
              ? "A known task can be resumed without creating another preview."
              : "An earlier submission has no confirmed task token. Do not submit again; the operator must check provider history.",
          );
        }
      })
      .catch(() => {});
  }, [item.contentDigest]);
  useEffect(() => {
    if (zoom) dialog.current?.showModal();
  }, [zoom]);
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
          await putLocal("pending", undefined);
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
          setView("preview");
          setStage("complete");
          setConsentOpen(false);
          setShopper(undefined);
          setConsent(false);
          setMessage(
            "Your real YouCam result is ready. Review original condition evidence beside it.",
          );
          await putLocal("pending", undefined);
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
    setPreparing(true);
    setMessage("");
    setConsent(false);
    try {
      setShopper(await prepareShopper(file));
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Photo preparation failed.");
    } finally {
      setPreparing(false);
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
      await putLocal("pending", intent);
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
        body: form,
        signal: AbortSignal.timeout(100000),
      });
      const result = await response.json();
      if (!response.ok) {
        if (result.code === "SUBMISSION_UNKNOWN") {
          setStage("unknown");
          setMessage(result.message);
          await putLocal("pending", { ...intent, stage: "unknown" });
          return;
        }
        await putLocal("pending", undefined);
        sent = false;
        throw new Error(result.message || "Preview could not be created.");
      }
      const next: Pending = {
        ...intent,
        stage: "running",
        token: result.token,
        createdAt: result.createdAt,
      };
      await putLocal("pending", next);
      setPending(next);
      setStage("running");
      setMessage(
        "YouCam is processing this known task. It is safe to wait; no repeated task is being created.",
      );
    } catch (e) {
      setStage(sent ? "unknown" : "error");
      setMessage(
        sent
          ? "The submission outcome is unknown. Do not submit another task; the operator must check provider history."
          : e instanceof Error
            ? e.message
            : "Preview could not start.",
      );
    } finally {
      lock.current = false;
    }
  }
  async function save(kind: "item" | "decision") {
    setSaving(true);
    try {
      if (kind === "decision" && !exportConsent)
        throw new Error(
          "Confirm the private-image warning before downloading a decision package.",
        );
      const bytes = await exportPackage(bundle, kind);
      download(bytes, `asshown-${kind}-r${item.revision}.zip`);
      onNotice(
        `${kind === "item" ? "Seller item" : "Private decision"} package downloaded. Extract it and open viewer.html offline.`,
      );
    } catch (e) {
      onNotice(e instanceof Error ? e.message : "Package could not be saved.");
    } finally {
      setSaving(false);
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
  function enlarge(asset: Asset) {
    setZoom({
      bytes: bundle.assets[asset.id],
      mime: asset.mime,
      title: asset.description,
    });
  }
  const selected = item.assets.find((a) => a.role === view) || reference;
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
            Controlled demo: fictional garment, synthetic shopper and condition
            examples. The recorded preview is an actual YouCam API result—not a
            real listing or a defect-erasure test.
          </span>
        </div>
      )}
      <div className="review-layout">
        <div className="visual-column">
          <div className="view-header">
            <span className="eyebrow">
              {view === "preview" ? "THE STYLE PREVIEW" : "THE SOURCE RECORD"}
            </span>
            <span className="pill">
              {view === "preview"
                ? bundle.preview?.mode === "live"
                  ? "Live YouCam result"
                  : "Recorded YouCam example"
                : "Original source bytes"}
            </span>
          </div>
          <div className="main-photo">
            {view === "preview" && bundle.result ? (
              <Photo
                bytes={bundle.result}
                mime={bundle.preview?.mime}
                alt="YouCam-generated style preview, not evidence of fit or garment condition"
                onClick={() =>
                  setZoom({
                    bytes: bundle.result!,
                    mime: bundle.preview!.mime,
                    title: "Generated style preview — not condition evidence",
                  })
                }
              />
            ) : (
              <Photo
                bytes={bundle.assets[selected.id]}
                mime={selected.mime}
                alt={selected.description}
                onClick={() => enlarge(selected)}
              />
            )}
            <span className="zoom-hint">
              <Expand size={13} /> Click to inspect
            </span>
          </div>
          <div
            className="view-tabs"
            aria-label="Choose source or generated view"
          >
            {bundle.preview && (
              <button
                aria-pressed={view === "preview"}
                className={view === "preview" ? "selected" : ""}
                onClick={() => setView("preview")}
              >
                Style preview
              </button>
            )}
            {(["reference", "front", "back"] as const).map((role) => (
              <button
                key={role}
                aria-pressed={view === role}
                className={view === role ? "selected" : ""}
                onClick={() => setView(role)}
              >
                {role === "reference"
                  ? "Reference"
                  : role === "front"
                    ? "Front"
                    : "Back"}
              </button>
            ))}
          </div>
          <p className="caption">
            {view === "preview"
              ? "A generated suggestion of style. Sleeves, drape, details and proportions may change. Always inspect the source photos."
              : "Seller-supplied source evidence. Its presence and file integrity do not prove the seller’s claims."}
          </p>
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
                      onClick={() => enlarge(a)}
                    />
                  </div>
                );
              })}
              <button
                className="text-button"
                onClick={() => {
                  const a = item.assets.find(
                    (a) => a.id === flaw.sourceAssetId,
                  )!;
                  setView(a.role);
                  enlarge(a);
                }}
              >
                Inspect the linked source view <Expand size={14} />
              </button>
              {flaw.region && (
                <p className="small">
                  Declared source region: {Math.round(flaw.region.x * 100)}%
                  from left, {Math.round(flaw.region.y * 100)}% from top;{" "}
                  {Math.round(flaw.region.width * 100)}% ×{" "}
                  {Math.round(flaw.region.height * 100)}%. This is not a marker
                  on the generated image.
                </p>
              )}
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
      <section className="save-section">
        <div>
          <span className="eyebrow">TAKE THE WHOLE RECORD WITH YOU</span>
          <h2>A decision you can reopen.</h2>
          <p>
            Actual photos, the item revision, your notes and the generated
            image. Not an expiring preview link.
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
            disabled={saving || active || !bundle.preview || !exportConsent}
            onClick={() => void save("decision")}
          >
            <Download size={17} />
            Download private decision
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
            Extract the ZIP and open viewer.html offline. Use the verifier to
            check file agreement—not authenticity.
          </p>
        </div>
      </section>
      <dialog
        ref={dialog}
        className="photo-dialog"
        onClose={() => setZoom(undefined)}
      >
        <div className="section-line">
          <h2>{zoom?.title}</h2>
          <button
            className="icon-button"
            aria-label="Close enlarged photo"
            onClick={() => dialog.current?.close()}
          >
            <X />
          </button>
        </div>
        {zoom && <Photo bytes={zoom.bytes} mime={zoom.mime} alt={zoom.title} />}
        <p>
          Original saved pixels. Zoom with your browser for closer inspection.
        </p>
      </dialog>
    </section>
  );
}
