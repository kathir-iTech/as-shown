"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
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
import { ARCHIVE_LIMITS } from "@/packages/archive";
import { openPackage } from "@/domain/archive-client";
import { clearLocal, getLocal, saveDraft } from "@/domain/browser";
import { Editor } from "./editor";
import { Workspace } from "./workspace";
import { StudioLanding } from "./studio-landing";
import { PrivacyPage } from "./privacy-page";
import { Catalogue, EXAMPLES } from "./catalogue";
import { EvidencePage } from "./evidence-page";
import { SharedRecord } from "./shared-record";

export function AsShownApp({ children }: { children?: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const navigate = (path: string) => router.push(path, { scroll: false });
  const [bundle, setBundle] = useState<Bundle>();
  const [historical, setHistorical] = useState<Bundle>();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [draft, setDraft] = useState(false);
  const [openLive, setOpenLive] = useState(false);
  const [opening, setOpening] = useState(false);
  const main = useRef<HTMLElement>(null);
  const clearDialog = useRef<HTMLDialogElement>(null);
  const actionLock = useRef(false);
  const lastPath = useRef(pathname);
  const screen =
    pathname === "/privacy"
      ? "privacy"
      : pathname === "/evidence"
        ? "evidence"
        : pathname === "/storefront"
          ? "storefront"
          : pathname === "/examples"
            ? "examples"
            : pathname.startsWith("/seller")
              ? "edit"
              : pathname.startsWith("/inspect/") ||
                  pathname.startsWith("/examples/")
                ? "work"
                : "home";
  const editing = pathname.startsWith("/seller/");
  useEffect(() => {
    void getLocal<Bundle>("draft")
      .then((d) => setDraft(!!d))
      .catch(() => {});
  }, []);
  useEffect(() => {
    if (lastPath.current !== pathname) {
      lastPath.current = pathname;
      main.current?.focus({ preventScroll: true });
      window.scrollTo({ top: 0, behavior: "instant" });
    }
  }, [pathname]);
  useEffect(() => {
    if (!bundle) return;
    const timer = setTimeout(() => {
      void saveDraft(bundle)
        .then(() => setDraft(true))
        .catch(() =>
          setNotice(
            "Device storage could not save this record. Export it before closing this tab.",
          ),
        );
    }, 650);
    return () => clearTimeout(timer);
  }, [bundle]);
  useEffect(() => {
    let cancelled = false;
    const example = EXAMPLES.find((e) => pathname === "/examples/" + e.slug);
    const id =
      pathname.startsWith("/inspect/") || pathname.startsWith("/seller/")
        ? decodeURIComponent(pathname.split("/")[2] || "")
        : "";
    if (
      (!example && (!id || bundle?.item.itemId === id)) ||
      (example && bundle?.item.itemId === example.itemId)
    ) {
      setOpening(false);
      return;
    }
    setOpening(true);
    void (async () => {
      try {
        const found = example
          ? await fetch(example.archive).then(async (r) => {
              if (!r.ok)
                throw new Error("This demonstration could not be loaded.");
              return openPackage(new Uint8Array(await r.arrayBuffer()));
            })
          : await getLocal<Bundle>("record:" + id);
        if (cancelled) return;
        if (!found) {
          setBundle(undefined);
          setNotice(
            "This record is not on this device. Open its AsShown package to continue.",
          );
          return;
        }
        await verifyBundle(found);
        if (cancelled) return;
        setBundle(found);
        setHistorical(undefined);
      } catch (e) {
        if (!cancelled) {
          setBundle(undefined);
          setNotice(
            e instanceof Error ? e.message : "Record could not be opened.",
          );
        }
      } finally {
        if (!cancelled) setOpening(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pathname, bundle?.item.itemId]);
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
  async function sample(live = false, slug = "linen-shirt") {
    await perform(async () => {
      const example = EXAMPLES.find((e) => e.slug === slug)!;
      const response = await fetch(example.archive);
      if (!response.ok)
        throw new Error("The recorded example could not be loaded.");
      const next = await openPackage(
        new Uint8Array(await response.arrayBuffer()),
      );
      setBundle(next);
      setHistorical(undefined);
      setOpenLive(live);
      navigate("/examples/" + slug);
    });
  }
  function newItem() {
    setOpenLive(false);
    setNotice("");
    navigate("/seller");
  }
  function saved(next: Bundle) {
    setHistorical(editing ? bundle : undefined);
    setBundle(next);
    setOpenLive(false);
    void saveDraft(next)
      .then(() => setDraft(true))
      .catch(() =>
        setNotice(
          "Save a package before closing this tab; device storage is unavailable.",
        ),
      );
    navigate("/inspect/" + encodeURIComponent(next.item.itemId));
    setNotice(
      "New revision saved. Review the photographs and disclosures before recording your decision.",
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
      navigate("/inspect/" + encodeURIComponent(found.item.itemId));
      setNotice(
        "Device-local record restored. Personal input photos and completed previews are kept in your exports, not source drafts.",
      );
    });
  }
  async function reset() {
    clearDialog.current?.close();
    await perform(async () => {
      await clearLocal();
      setBundle(undefined);
      setHistorical(undefined);
      setDraft(false);
      navigate("/");
      setNotice(
        "Device-local records cleared. Downloads and provider-held data are not deleted.",
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
                const next = await openPackage(
                  new Uint8Array(await file.arrayBuffer()),
                );
                await saveDraft(next);
                setBundle(next);
                setHistorical(undefined);
                setOpenLive(false);
                navigate("/inspect/" + encodeURIComponent(next.item.itemId));
                setNotice(
                  "Record opened. Its saved photographs match the supplied record.",
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
        <Link className="wordmark" aria-label="AsShown home" href="/">
          as<span className="brand-thread">/</span>shown
          <span className="brand-dot" aria-hidden="true">
            ✳
          </span>
        </Link>
        <nav aria-label="Main navigation">
          <Link href="/" aria-current={screen === "home" ? "page" : undefined}>
            The studio
          </Link>
          <Link
            href="/examples"
            aria-current={screen === "examples" ? "page" : undefined}
          >
            The collection
          </Link>
          {bundle && (
            <Link
              href={"/inspect/" + encodeURIComponent(bundle.item.itemId)}
              aria-current={screen === "work" ? "page" : undefined}
            >
              Current record
            </Link>
          )}
          <Link href="/privacy">Privacy & limits</Link>
          <button
            onClick={() => clearDialog.current?.showModal()}
            aria-label="Clear local data"
          >
            <RotateCcw size={14} />
            <span className="clear-label">Clear local data</span>
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
      {(busy || opening) && (
        <div className="global-notice" role="status">
          Opening and checking the record…
        </div>
      )}
      <main id="main" ref={main} tabIndex={-1}>
        {(pathname.startsWith("/share/") ||
          pathname.startsWith("/manage/")) && (
          <SharedRecord
            id={pathname.split("/")[2]}
            manage={pathname.startsWith("/manage/")}
            onOpen={(next) => {
              setBundle(next);
              setHistorical(undefined);
              setOpenLive(false);
              navigate("/inspect/" + encodeURIComponent(next.item.itemId));
              setNotice(
                "Published seller copy opened. Review this revision before deciding.",
              );
            }}
          />
        )}
        {opening && (
          <section
            className="studio-skeleton"
            aria-busy="true"
            aria-label="Opening your garment record"
          >
            <span className="eyebrow">YOUR INSPECTION STUDIO</span>
            <h1>Getting the whole picture…</h1>
            <div>
              <span />
              <span />
            </div>
          </section>
        )}
        {screen === "home" && pathname === "/" && (
          <StudioLanding
            busy={busy}
            onExplore={() => void sample()}
            onLive={() => void sample(true)}
            onCreate={newItem}
            importControl={importControl}
          />
        )}
        {(screen === "examples" || screen === "storefront") && (
          <Catalogue
            storefront={screen === "storefront"}
            onOpen={(slug) => void sample(false, slug)}
          />
        )}
        {screen === "evidence" && <EvidencePage />}
        {screen === "edit" && (!editing || bundle) && (
          <Editor
            key={editing && bundle ? bundle.item.contentDigest : "new"}
            existing={editing ? bundle : undefined}
            onSave={saved}
            onCancel={() =>
              navigate(
                bundle
                  ? "/inspect/" + encodeURIComponent(bundle.item.itemId)
                  : "/",
              )
            }
          />
        )}
        {screen === "work" && bundle && !opening && (
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
                <p>Review the revised evidence before deciding again.</p>
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
              onEdit={() =>
                navigate("/seller/" + encodeURIComponent(bundle.item.itemId))
              }
              onHome={() => navigate("/")}
              onNotice={setNotice}
              openLive={openLive}
            />
          </>
        )}
        {(screen === "work" || editing) && !bundle && !opening && (
          <section className="empty-record">
            <span className="eyebrow">YOUR RECORD</span>
            <h1>Bring the photographs with you.</h1>
            <p>
              Device-local records are available where you saved them. Open an
              exported package here, or explore a complete demonstration.
            </p>
            {importControl}
            <Link className="button primary" href="/examples">
              Explore the collection <ArrowUpRight size={17} />
            </Link>
          </section>
        )}
        {screen === "privacy" && <PrivacyPage onHome={() => navigate("/")} />}
        {children}
      </main>
      <footer className="site-footer">
        <Link className="wordmark" href="/">
          as<span className="brand-thread">/</span>shown
        </Link>
        <p>Secondhand deserves a closer look.</p>
        <div>
          <span>Powered by YouCam Clothes VTO V3</span>
          <Link href="/storefront">
            Demo storefront <ArrowUpRight size={14} />
          </Link>
          <Link href="/evidence">How it works & release evidence</Link>
          <Link href="/privacy">Privacy, provenance & limitations</Link>
        </div>
      </footer>
      <dialog
        ref={clearDialog}
        className="clear-dialog"
        aria-labelledby="clear-title"
      >
        <span className="eyebrow">THIS DEVICE</span>
        <h2 id="clear-title">Clear your local records?</h2>
        <p>
          This removes saved drafts, notes and recovery tokens on this device.
          Downloaded files and provider-held data remain.
        </p>
        <div className="message-actions">
          <button
            className="button secondary"
            onClick={() => clearDialog.current?.close()}
          >
            Keep my records
          </button>
          <button className="button primary" onClick={() => void reset()}>
            Clear device records
          </button>
        </div>
      </dialog>
    </>
  );
}
