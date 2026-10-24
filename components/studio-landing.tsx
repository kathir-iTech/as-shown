"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  ArrowDown,
  ArrowUpRight,
  Check,
  ImagePlus,
  LoaderCircle,
  MoveUpRight,
  X,
} from "lucide-react";
import { CATEGORY_LABELS, type Bundle, type Category } from "@/domain/model";
import { createQuickTry } from "@/domain/browser";
import { EXAMPLES } from "./catalogue";

const pictures = [
  "/samples/preview.jpg",
  "/samples/reference.jpg",
  "/samples/cuff.jpg",
];
const pictureLabels = [
  "Recorded YouCam style preview of a synthetic adult in the linen shirt",
  "Original synthetic garment reference",
  "Original synthetic close-up of the declared cuff wear",
];

export function StudioLanding({
  busy,
  onExplore,
  onLive,
  onCreate,
  onReady,
  importControl,
  onExample,
}: {
  busy: boolean;
  onExplore: () => void;
  onLive: () => void;
  onCreate: () => void;
  onReady: (bundle: Bundle) => Promise<void>;
  onExample: (slug: string) => void;
  importControl: ReactNode;
}) {
  const [category, setCategory] = useState<Category>("upper_body");
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setReady(true);
  }, []);
  const [title, setTitle] = useState("");
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const [lens, setLens] = useState(0);
  const [demos, setDemos] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const demoDialog = useRef<HTMLDialogElement>(null);
  const lock = useRef(false);
  async function upload(file?: File) {
    if (!file || !ready || busy || lock.current) return;
    lock.current = true;
    setPreparing(true);
    setError("");
    try {
      const name =
        title.trim() || file.name.replace(/\.[^.]+$/, "").replace(/[-_]/g, " ");
      await onReady(await createQuickTry(file, category, name));
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "The photograph could not be opened.",
      );
    } finally {
      lock.current = false;
      setPreparing(false);
    }
  }
  return (
    <>
      <section className="fit-home" aria-labelledby="fit-title">
        <div className="fit-intro">
          <p className="fit-kicker">
            <span /> A fitting room for secondhand finds.
          </p>
          <h1 id="fit-title">
            Try on your
            <br />
            next <span>thrift find.</span>
            <MoveUpRight aria-hidden="true" />
          </h1>
          <p className="fit-description">
            Your photo. A piece you’ve found.
            <br />
            See the look. Check the real details.
          </p>
          <div
            className={"quick-drop " + (dragging ? "is-dragging" : "")}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              if (e.dataTransfer.files.length !== 1)
                setError("Drop one garment photograph at a time.");
              else void upload(e.dataTransfer.files[0]);
            }}
          >
            <div className="quick-fields">
              <label>
                What’s the piece?
                <select
                  aria-label="Garment category"
                  value={category}
                  disabled={!ready || preparing || busy}
                  onChange={(e) => setCategory(e.target.value as Category)}
                >
                  {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Name it <span className="optional">(optional)</span>
                <input
                  aria-label="Name your find"
                  maxLength={120}
                  placeholder="The one you can’t stop thinking about"
                  value={title}
                  disabled={!ready || preparing || busy}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </label>
            </div>
            <button
              className="fit-upload"
              aria-label="Try my item"
              disabled={!ready || preparing || busy}
              onClick={() => input.current?.click()}
            >
              {preparing ? (
                <LoaderCircle className="spin" size={25} />
              ) : (
                <ImagePlus size={25} />
              )}
              <span>
                {!ready
                  ? "Opening the fitting room…"
                  : preparing
                    ? "Preparing your piece…"
                    : "Try my item"}
                <small>
                  {preparing
                    ? "Checking the image on this device"
                    : "Upload or drop a garment photo"}
                </small>
              </span>
              <ArrowUpRight size={25} />
            </button>
            <input
              ref={input}
              type="file"
              className="sr-only"
              aria-label="Garment photo"
              accept="image/jpeg,image/png"
              disabled={!ready || preparing || busy}
              onChange={(e) => {
                void upload(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
            <p className="upload-explainer">
              JPEG / PNG · 12 MB max. One piece, clearly visible. Use authorized
              adult or garment-only photos.
            </p>
          </div>
          {error && (
            <p role="alert" className="fit-error">
              {error}
            </p>
          )}
          <noscript>
            <p>
              Enable JavaScript to prepare your photographs locally and use the
              fitting room.
            </p>
          </noscript>
          <div className="fit-entry-actions">
            <button
              className="text-button"
              aria-label="Explore the completed example"
              disabled={busy || preparing}
              onClick={onExplore}
            >
              Try a demo <ArrowUpRight size={18} />
            </button>
            <button
              className="text-button"
              onClick={() => {
                setDemos(true);
                demoDialog.current?.showModal();
              }}
            >
              Choose a demo
            </button>
            <button
              className="text-button live-demo-link"
              onClick={onLive}
              disabled={busy}
            >
              Try a live preview <ArrowUpRight size={17} />
            </button>
          </div>
          <p className="fit-limit">
            A style preview, not a fit or condition guarantee.
          </p>
        </div>
        <div className="fit-stage">
          <div className="fit-stage-head">
            <span>One find. The whole picture.</span>
            <span className="fit-case">Demo 01</span>
          </div>
          <div className={"fit-model lens-" + lens}>
            <img
              key={lens}
              src={pictures[lens]}
              alt={pictureLabels[lens]}
              width={800}
              height={1200}
              fetchPriority="high"
            />
            <div className="fit-image-caption">
              {
                [
                  "Actual YouCam output · synthetic demo",
                  "Original reference · synthetic demo",
                  "Original cuff detail · synthetic demo",
                ][lens]
              }
            </div>
            <button
              className="detail-ticket"
              onClick={() => setLens(lens === 2 ? 0 : 2)}
            >
              <span className="ticket-ring">↗</span>
              <span>
                {lens === 2
                  ? "Back to the look"
                  : "Looks good. But look closer."}
                <small>
                  {lens === 2
                    ? "Style and condition are different questions."
                    : "A little cuff wear, in the original photo."}
                </small>
              </span>
            </button>
          </div>
          <div
            className="fit-lenses"
            aria-label="Explore the example photographs"
          >
            {["The look", "The piece", "The detail"].map((name, i) => (
              <button
                key={name}
                aria-pressed={lens === i}
                onClick={() => setLens(i)}
              >
                <span>0{i + 1}</span>
                {name}
                {lens === i ? <Check size={17} /> : <ArrowUpRight size={17} />}
              </button>
            ))}
          </div>
        </div>
      </section>
      <section className="fit-bottom">
        <div>
          <ArrowDown size={24} />
          <p>
            <strong>Not a shop. Your decision space.</strong> Bring a find from
            wherever you browse. Keep its original details beside the generated
            look.
          </p>
        </div>
        <div className="fit-tools">
          {importControl}
          <button className="text-button" onClick={onCreate}>
            I’m selling a piece <ArrowUpRight size={17} />
          </button>
          <Link href="/privacy">Privacy & limits</Link>
        </div>
      </section>
      <dialog
        ref={demoDialog}
        className="demo-drawer"
        aria-labelledby="demo-title"
        onClose={() => setDemos(false)}
      >
        <div className="section-line">
          <h2 id="demo-title">Take a test spin.</h2>
          <button
            className="icon-button"
            aria-label="Close demo chooser"
            onClick={() => demoDialog.current?.close()}
          >
            <X />
          </button>
        </div>
        <p>
          Three synthetic examples with actual recorded YouCam results. Your own
          rack isn’t limited to these pieces.
        </p>
        {demos && (
          <div className="demo-choices">
            {EXAMPLES.map((example) => (
              <button
                key={example.slug}
                disabled={busy}
                onClick={() => {
                  demoDialog.current?.close();
                  onExample(example.slug);
                }}
              >
                <img
                  src={example.image}
                  alt={"Synthetic " + example.title}
                  width={250}
                  height={375}
                />
                <span>
                  {example.title} <ArrowUpRight size={18} />
                </span>
              </button>
            ))}
          </div>
        )}
      </dialog>
    </>
  );
}
