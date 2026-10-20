"use client";
import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  FileArchive,
  Plus,
  RotateCcw,
  X,
} from "lucide-react";
import { type Bundle, canReusePreview, verifyBundle } from "@/domain/model";
import { revisionChanges } from "@/domain/decision";
import { importPackage, ARCHIVE_LIMITS } from "@/packages/archive";
import { clearLocal, getLocal } from "@/domain/browser";
import { Editor } from "./editor";
import { Workspace } from "./workspace";
import { StudioLanding } from "./studio-landing";
import { PrivacyPage } from "./privacy-page";

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
  const actionLock = useRef(false);
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
    if (actionLock.current) return;
    actionLock.current = true;
    setBusy(true);
    setNotice("");
    try {
      await action();
    } catch (e) {
      setNotice(
        e instanceof Error ? e.message : "This action could not be completed.",
      );
    } finally {
      actionLock.current = false;
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
    setHistorical(editing ? bundle : undefined);
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
        "Device-local source draft restored. Personal input photos and completed previews are not stored in this draft.",
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
        "App-local records cleared. Downloaded packages, operational run records and provider-held data are not deleted.",
      );
    });
  }
  const importControl = (
    <div className="import-controls">
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
                  "Package file agreement checked. This does not prove seller honesty or physical condition.",
                );
              });
            e.target.value = "";
          }}
        />
      </label>
      {draft && (
        <button className="text-button" onClick={() => void restore()}>
          Resume saved draft <ArrowRight size={15} />
        </button>
      )}
    </div>
  );
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="site-header">
        <button
          className="wordmark"
          aria-label="AsShown home"
          onClick={() => setScreen("home")}
        >
          as<span className="brand-thread">/</span>shown
          <span className="brand-dot" aria-hidden="true">
            ✳
          </span>
        </button>
        <nav aria-label="Main navigation">
          <button
            aria-current={screen === "home" ? "page" : undefined}
            onClick={() => setScreen("home")}
          >
            The studio
          </button>
          {bundle && (
            <button
              aria-current={screen === "work" ? "page" : undefined}
              onClick={() => setScreen("work")}
            >
              Current record
            </button>
          )}
          <button
            aria-current={screen === "privacy" ? "page" : undefined}
            onClick={() => setScreen("privacy")}
          >
            Privacy & limits
          </button>
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
          <StudioLanding
            busy={busy}
            onExplore={() => void sample()}
            onLive={() => void sample(true)}
            onCreate={newItem}
            importControl={importControl}
          />
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
            {historical && (
              <section className="revision-diff" aria-label="Revision changes">
                <span className="eyebrow">
                  REVISION {historical.item.revision} → {bundle.item.revision}
                </span>
                <h2>What changed in this record</h2>
                <ul>
                  {revisionChanges(historical.item, bundle.item).map(
                    (change, i) => (
                      <li key={i}>{change}</li>
                    ),
                  )}
                </ul>
                <p>
                  Your previous choices were cleared. Review the revised
                  evidence before deciding again.
                </p>
                {historical.preview &&
                  historical.result &&
                  canReusePreview(bundle.item, historical.preview) && (
                    <button
                      className="button secondary"
                      onClick={() => {
                        setBundle({
                          ...bundle,
                          preview: {
                            ...historical.preview!,
                            itemDigest: bundle.item.contentDigest,
                            reusedFromItemDigest:
                              historical.preview!.itemDigest,
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
                  )}
              </section>
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
          <PrivacyPage onHome={() => setScreen("home")} />
        )}
      </main>
      <footer className="site-footer">
        <button className="wordmark" onClick={() => setScreen("home")}>
          as<span className="brand-thread">/</span>shown
        </button>
        <p>Secondhand deserves a closer look.</p>
        <div>
          <span>Powered by YouCam Clothes VTO V3</span>
          <button onClick={() => setScreen("privacy")}>
            Privacy, provenance & limitations <ArrowUpRight size={14} />
          </button>
        </div>
      </footer>
    </>
  );
}
