"use client";
import { useEffect, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  Check,
  FileArchive,
  Fingerprint,
  Leaf,
  LockKeyhole,
  Plus,
  RotateCcw,
  X,
} from "lucide-react";
import {
  type Bundle,
  canReusePreview,
  verifyBundle,
  freshReview,
} from "@/domain/model";
import { importPackage, ARCHIVE_LIMITS } from "@/packages/archive";
import { clearLocal, getLocal } from "@/domain/browser";
import { Editor } from "./editor";
import { Workspace } from "./workspace";

type Screen = "home" | "work" | "edit" | "privacy";
export function AsShownApp() {
  const [screen, setScreen] = useState<Screen>("home");
  const [bundle, setBundle] = useState<Bundle>();
  const [historical, setHistorical] = useState<Bundle>();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [draft, setDraft] = useState(false);
  const [openLive, setOpenLive] = useState(false);
  const main = useRef<HTMLElement>(null);
  const initial = useRef(true);
  useEffect(() => {
    void getLocal<Bundle>("draft")
      .then((d) => setDraft(!!d))
      .catch(() => {});
  }, []);
  useEffect(() => {
    if (initial.current) {
      initial.current = false;
      return;
    }
    main.current?.focus();
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [screen]);
  async function perform(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setNotice("");
    try {
      await action();
    } catch (e) {
      setNotice(
        e instanceof Error ? e.message : "This action could not be completed.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function sample(live = false) {
    await perform(async () => {
      const response = await fetch("/samples/linen-shirt.asshown.zip");
      if (!response.ok)
        throw new Error("The recorded example could not be loaded.");
      const next = await importPackage(
        new Uint8Array(await response.arrayBuffer()),
      );
      setBundle(next);
      setHistorical(undefined);
      setOpenLive(live);
      setScreen("work");
    });
  }
  function newItem() {
    setEditing(false);
    setScreen("edit");
    setNotice("");
  }
  function saved(next: Bundle) {
    setHistorical(
      bundle?.preview && canReusePreview(next.item, bundle.preview)
        ? bundle
        : undefined,
    );
    setBundle(next);
    setOpenLive(false);
    setScreen("work");
    setNotice(
      "New item revision created. Buyer decisions have been reset. The record is not independently inspected.",
    );
  }
  async function restore() {
    await perform(async () => {
      const found = await getLocal<Bundle>("draft");
      if (!found) throw new Error("No saved source draft was found.");
      await verifyBundle(found);
      setBundle(found);
      setHistorical(undefined);
      setOpenLive(false);
      setScreen("work");
      setNotice(
        "Device-local source draft restored. A personal input photo or completed preview is not stored in this draft.",
      );
    });
  }
  async function reset() {
    if (
      !window.confirm(
        "Clear this app’s device-local drafts, notes and task-recovery tokens? Downloaded files and provider-held data will not be deleted.",
      )
    )
      return;
    await perform(async () => {
      await clearLocal();
      setBundle(undefined);
      setHistorical(undefined);
      setDraft(false);
      setScreen("home");
      setNotice(
        "App-local records cleared. This does not delete downloaded packages or provider-held data.",
      );
    });
  }
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <div className="topline">
        <span>SECONDHAND STYLE. FIRSTHAND EVIDENCE.</span>
        <span>
          A working YouCam-powered prototype <span className="tiny-dot" />
        </span>
      </div>
      <header className="site-header">
        <button
          className="wordmark"
          aria-label="AsShown home"
          onClick={() => setScreen("home")}
        >
          as<span className="brand-thread">/</span>shown
          <span className="brand-dot">●</span>
        </button>
        <nav aria-label="Main navigation">
          <button
            onClick={() => {
              setScreen("home");
              setTimeout(
                () =>
                  document
                    .getElementById("the-idea")
                    ?.scrollIntoView({ behavior: "smooth" }),
                50,
              );
            }}
          >
            The idea
          </button>
          <button onClick={() => setScreen("privacy")}>Privacy & limits</button>
          <button onClick={() => void reset()}>
            <RotateCcw size={14} />
            Clear local data
          </button>
        </nav>
        <button className="button nav-create" disabled={busy} onClick={newItem}>
          <Plus size={16} />
          Create a record
        </button>
      </header>
      {notice && (
        <div className="global-notice" role="status">
          <span>{notice}</span>
          <button aria-label="Dismiss message" onClick={() => setNotice("")}>
            <X size={18} />
          </button>
        </div>
      )}
      {busy && (
        <div className="global-notice" role="status">
          Opening and checking the package…
        </div>
      )}
      <main id="main" ref={main} tabIndex={-1}>
        {screen === "home" && (
          <>
            <section className="hero">
              <div className="hero-copy">
                <span className="eyebrow hero-eyebrow">
                  <span className="tiny-dot" /> A LITTLE MORE CERTAINTY. A LOT
                  MORE CONTEXT.
                </span>
                <h1>
                  The look changes.
                  <br />
                  <em>The facts stay.</em>
                </h1>
                <p className="hero-description">
                  Try the style. Inspect the condition.
                  <br />
                  Keep both sides of a secondhand story together.
                </p>
                <div className="hero-actions">
                  <button
                    className="button primary"
                    onClick={() => void sample()}
                    disabled={busy}
                  >
                    Explore the completed example
                    <ArrowUpRight size={19} />
                  </button>
                  <button
                    className="text-button"
                    onClick={() => void sample(true)}
                    disabled={busy}
                  >
                    Try a live preview
                    <ArrowRight size={17} />
                  </button>
                </div>
                <p className="hero-footnote">
                  <LockKeyhole size={14} />
                  No account here. No purchase. Your source records stay local.
                </p>
                <div className="hero-import">
                  <label className="text-button file-label">
                    <FileArchive size={16} />
                    Open an AsShown package
                    <input
                      aria-label="Import AsShown package"
                      type="file"
                      accept=".zip"
                      disabled={busy}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file)
                          void perform(async () => {
                            if (file.size > ARCHIVE_LIMITS.compressed)
                              throw new Error("Choose a package below 25 MB.");
                            const next = await importPackage(
                              new Uint8Array(await file.arrayBuffer()),
                            );
                            setBundle(next);
                            setHistorical(undefined);
                            setOpenLive(false);
                            setScreen("work");
                            setNotice(
                              "Package file agreement checked. That is not proof of seller honesty or physical condition.",
                            );
                          });
                        e.target.value = "";
                      }}
                    />
                  </label>
                  {draft && (
                    <button
                      className="text-button"
                      onClick={() => void restore()}
                    >
                      Resume saved draft
                      <ArrowRight size={15} />
                    </button>
                  )}
                </div>
              </div>
              <div className="hero-art">
                <div className="photo-index">
                  THE LINEN SHIRT / A CONTROLLED DEMO
                </div>
                <div className="hero-person">
                  <img
                    src="/samples/preview.jpg"
                    alt="Recorded real YouCam style preview on a fictional synthetic adult"
                    fetchPriority="high"
                  />
                  <span className="image-label">
                    <span className="tiny-dot" />
                    RECORDED YOUCAM RESULT
                  </span>
                </div>
                <div className="source-inset">
                  <span className="eyebrow">THE ORIGINAL REFERENCE</span>
                  <img
                    src="/samples/reference.jpg"
                    alt="Synthetic rust linen shirt reference used for the preview"
                  />
                  <span className="inset-footer">
                    Same garment reference. <ArrowUpRight size={17} />
                  </span>
                </div>
                <div className="evidence-slip">
                  <span className="slip-number">01</span>
                  <div>
                    <strong>The cuff still deserves a look.</strong>
                    <span>Synthetic source detail · not a VTO verdict</span>
                  </div>
                  <img
                    src="/samples/cuff.jpg"
                    alt="Controlled synthetic cuff-fraying example"
                  />
                </div>
                <div className="art-bottom">
                  <span>STYLE IS A PREVIEW.</span>
                  <span>CONDITION HAS ITS OWN RECORD.</span>
                </div>
              </div>
            </section>
            <section className="principles" aria-label="Product principles">
              <span>
                <Fingerprint size={18} />
                One exact item revision
              </span>
              <span>
                <Check size={18} />
                Original condition photos
              </span>
              <span>
                <FileArchive size={18} />A record you can reopen offline
              </span>
            </section>
            <section className="idea-section" id="the-idea">
              <div className="idea-intro">
                <span className="eyebrow">BEYOND “DOES IT LOOK GOOD?”</span>
                <h2>
                  A preview should never
                  <br />
                  replace the whole picture.
                </h2>
                <p>
                  A generated image can help you explore a style. It can’t tell
                  you whether a cuff is frayed, whether a seller’s claim is
                  true, or how a garment will physically fit. AsShown keeps
                  those questions separate—and their evidence together.
                </p>
              </div>
              <div className="steps-grid">
                <article>
                  <span className="step-number">01 / RECORD</span>
                  <h3>Let the item speak.</h3>
                  <p>
                    Build a versioned record with front, back and close-up
                    photos. Declare known issues, or explicitly say none are
                    known.
                  </p>
                </article>
                <article>
                  <span className="step-number">02 / PREVIEW</span>
                  <h3>See the style on you.</h3>
                  <p>
                    Send two approved images to YouCam for a real style preview.
                    Original condition evidence stays in view, unchanged.
                  </p>
                </article>
                <article>
                  <span className="step-number">03 / DECIDE</span>
                  <h3>Keep your own record.</h3>
                  <p>
                    Note what works for you and what to ask the seller. Save the
                    actual images and your review, not an expiring link.
                  </p>
                </article>
              </div>
              <div className="idea-bottom">
                <span>
                  <Leaf size={18} />
                  For thoughtful secondhand decisions. Not a marketplace.
                </span>
                <button className="text-button" onClick={newItem}>
                  Give an item its record
                  <ArrowRight size={18} />
                </button>
              </div>
            </section>
          </>
        )}
        {screen === "edit" && (
          <Editor
            key={editing && bundle ? bundle.item.contentDigest : "new"}
            existing={editing ? bundle : undefined}
            onSave={saved}
            onCancel={() => setScreen(bundle ? "work" : "home")}
          />
        )}
        {screen === "work" && bundle && (
          <>
            {historical?.preview &&
              historical.result &&
              canReusePreview(bundle.item, historical.preview) && (
                <div className="reuse-notice">
                  <p>
                    The reference photo is unchanged. You can deliberately reuse
                    the earlier style image, but the condition review has been
                    reset.
                  </p>
                  <button
                    className="button secondary"
                    onClick={() => {
                      setBundle({
                        ...bundle,
                        preview: {
                          ...historical.preview!,
                          itemDigest: bundle.item.contentDigest,
                          reusedFromItemDigest: historical.preview!.itemDigest,
                        },
                        result: historical.result,
                      });
                      setHistorical(undefined);
                      setNotice(
                        "Earlier style image reused for the unchanged reference. No new generation or unit use.",
                      );
                    }}
                  >
                    Reuse earlier style image
                  </button>
                </div>
              )}
            <Workspace
              key={bundle.item.contentDigest}
              bundle={bundle}
              onChange={setBundle}
              onEdit={() => {
                setEditing(true);
                setScreen("edit");
              }}
              onHome={() => setScreen("home")}
              onNotice={setNotice}
              openLive={openLive}
            />
          </>
        )}
        {screen === "privacy" && (
          <article className="privacy-page">
            <button className="text-button" onClick={() => setScreen("home")}>
              ← Back home
            </button>
            <span className="eyebrow">PLAIN WORDS. CLEAR BOUNDARIES.</span>
            <h1>
              Your record.
              <br />
              Your decision.
            </h1>
            <section>
              <h2>What stays here</h2>
              <p>
                Seller records, condition close-ups and buyer notes are
                processed in your browser. Source drafts are saved in IndexedDB
                only when you choose to save, or when a live preview needs a
                recoverable item record. The personal input photo stays in
                memory. You can export a seller-only package without buyer
                content.
              </p>
              <p>
                There is no account system, checkout, analytics tracker, cloud
                photo library or database in this prototype. This does not mean
                the host or provider has no operational logs.
              </p>
            </section>
            <section>
              <h2>What leaves your device</h2>
              <p>
                Only after affirmative approval, your prepared shopper image and
                the selected garment reference pass through our server to
                Perfect Corp.’s YouCam API. Source close-ups and notes are not
                part of that request. The API credential remains server-only.
              </p>
              <p>
                The provider’s policy describes storage in the USA, generally 30
                days of retention with exceptions, and potential processing of
                facial or biometric information. We cannot guarantee provider
                behavior or immediate deletion.{" "}
                <a
                  href="https://www.makeupar.com/perfectbeauty/youcam/privacy-policy-api"
                  target="_blank"
                  rel="noreferrer"
                >
                  Read the provider’s API privacy policy
                </a>
                .
              </p>
            </section>
            <section>
              <h2>What a preview cannot prove</h2>
              <p>
                Generated clothes can change drape, sleeve placement, texture,
                fine marks and body proportions. A preview is not an exact
                reconstruction, sizing recommendation, fit guarantee, condition
                inspection or authentication. Seller declarations may be
                mistaken or fabricated. Inspect the original evidence and ask
                your own questions.
              </p>
              <p>
                File digests only check that bytes agree with a supplied
                manifest. Anyone who can replace both can recompute them. They
                do not prove the seller’s identity, a trusted timestamp, or the
                state of a shipped garment.
              </p>
            </section>
            <section>
              <h2>Downloads, clearing and recovery</h2>
              <p>
                A private decision package may depict you and include personal
                notes. Store and share it carefully. Clearing local data removes
                AsShown’s device-local records and recovery tokens, not
                downloaded files, backups, host logs or provider-held data.
                During an active upload, leaving the page cannot guarantee
                cancellation of a provider task.
              </p>
              <p>
                A known task can be checked again without creating another. If
                submission becomes uncertain before a task token is received,
                the app stops instead of automatically spending more units.
                Local storage can fail or be cleared by your browser; export
                important records.
              </p>
            </section>
            <section>
              <h2>What has actually been tested</h2>
              <p>
                Initial feasibility: three real Clothes VTO V3 tasks across two
                synthetic shopper photos and one synthetic shirt, yielding two
                distinct result images. Full-body and head-to-mid-thigh inputs
                worked in those fixtures. No real-user accuracy or usefulness
                study has been performed. Public sample condition images are
                controlled synthetic examples, not evidence of provider defect
                erasure.
              </p>
              <p>
                This is a free, limited-credit hackathon prototype. Live
                generation pauses if pricing cannot be verified or the free-unit
                reserve is reached. There is no paid fallback. Disclosure
                version: asshown-2026-10-20.
              </p>
            </section>
          </article>
        )}
      </main>
      <footer className="site-footer">
        <button className="wordmark" onClick={() => setScreen("home")}>
          as<span className="brand-thread">/</span>shown
          <span className="brand-dot">●</span>
        </button>
        <p>See the style. Keep the story.</p>
        <div>
          <span>Built with YouCam Clothes VTO V3</span>
          <button onClick={() => setScreen("privacy")}>
            Privacy, provenance & limitations
            <ArrowUpRight size={13} />
          </button>
        </div>
      </footer>
    </>
  );
}
