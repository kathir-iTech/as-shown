"use client";
import { useLayoutEffect, useRef, useState } from "react";
import { ArrowUpRight, Focus, Minus, Plus } from "lucide-react";
import { type Bundle, type Flaw } from "@/domain/model";
import { Photo } from "./photo";

export function ComparisonStage({
  bundle,
  activeFlaw,
  onInspect,
  onPreview,
  shopper,
  processing = false,
  stage,
  showInput = false,
}: {
  bundle: Bundle;
  activeFlaw?: Flaw;
  onInspect: (flaw?: Flaw) => void;
  onPreview: () => void;
  shopper?: Uint8Array;
  processing?: boolean;
  stage?: string;
  showInput?: boolean;
}) {
  const [sourceRole, setSourceRole] = useState("front");
  const [scale, setScale] = useState(1);
  const [split, setSplit] = useState(50);
  const [mobileView, setMobileView] = useState<"look" | "source">("look");
  const sourceFrame = useRef<HTMLDivElement>(null);
  const [fitWidth, setFitWidth] = useState(0);
  const source =
    bundle.item.assets.find((a) => a.id === activeFlaw?.sourceAssetId) ||
    bundle.item.assets.find((a) => a.role === sourceRole) ||
    bundle.item.assets.find((a) => a.role === "reference")!;
  const closeups =
    activeFlaw?.closeupAssetIds.map((id) =>
      bundle.item.assets.find((a) => a.id === id)!,
    ) || [];
  useLayoutEffect(() => {
    const element = sourceFrame.current;
    if (!element) return;
    const measure = () =>
      setFitWidth(
        Math.min(
          element.clientWidth,
          (element.clientHeight * source.width) / source.height,
        ),
      );
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [source.width, source.height]);
  const previewMode =
    bundle.preview?.mode === "live"
      ? "Live YouCam result"
      : "Recorded YouCam example";
  const showResult = !!bundle.result && !showInput;
  return (
    <section
      className={"comparison-stage " + (processing ? "is-processing" : "")}
      aria-label="Style and original condition comparison"
    >
      <div className="mobile-photo-switch" role="group" aria-label="Photo view">
        <button
          aria-pressed={mobileView === "look"}
          onClick={() => setMobileView("look")}
        >
          {showResult ? "The look" : "Your photo"}
        </button>
        <button
          aria-pressed={mobileView === "source"}
          onClick={() => setMobileView("source")}
        >
          The piece
        </button>
      </div>
      <div
        className={"comparison-panes mobile-" + mobileView}
        style={{
          gridTemplateColumns: `minmax(0, ${split}fr) minmax(0, ${100 - split}fr)`,
        }}
      >
        <article className="style-pane">
          <header>
            <span className="eyebrow">
              {showResult ? "The look" : "Your photo"}
            </span>
            <span className="pill">
              {showResult ? previewMode : "Not generated"}
            </span>
          </header>
          <div className="comparison-image style-image" aria-busy={processing}>
            {showResult || shopper ? (
              <Photo
                bytes={
                  (showResult ? bundle.result : undefined) ||
                  shopper ||
                  bundle.assets[
                    bundle.item.assets.find((a) => a.role === "reference")!.id
                  ]
                }
                mime={bundle.preview?.mime}
                alt={
                  showResult
                    ? "YouCam-generated style preview, not evidence of fit or garment condition"
                    : shopper
                      ? "Your locally prepared photo; no generated result yet"
                      : "Original reference garment; a personal preview has not been generated"
                }
              />
            ) : (
              <div className="fitting-empty">
                <svg
                  viewBox="0 0 180 310"
                  width="180"
                  height="310"
                  aria-hidden="true"
                >
                  <circle cx="90" cy="35" r="25" />
                  <path d="M60 78q30-12 60 0l24 83q3 15-8 18t-15-12l-14-47 8 75-3 99q-1 12-12 12t-12-12l2-82-2 82q-1 12-12 12t-12-12l-3-99 8-75-14 47q-4 15-15 12t-8-18z" />
                </svg>
                <strong>Your next look.</strong>
                <span>Add a clear photo to start.</span>
              </div>
            )}
            <span className="persistent-image-label">
              {showResult
                ? "AI preview · not a fit guarantee"
                : shopper
                  ? "Your photo · not a result"
                  : "No result yet"}
            </span>
            {!showResult && !shopper && (
              <button
                className="button primary preview-on-image"
                onClick={onPreview}
              >
                Add your photo <ArrowUpRight size={17} />
              </button>
            )}
            {processing && (
              <div className="processing-curtain" role="status">
                <span className="processing-orbit" aria-hidden="true" />
                <strong>
                  {stage === "uploading"
                    ? "Sending your approved images"
                    : "YouCam is creating the look"}
                </strong>
                <div className="task-steps">
                  <span className="done">Approved</span>
                  <span className={stage === "running" ? "done" : "current"}>
                    Sent
                  </span>
                  <span className={stage === "running" ? "current" : ""}>
                    Processing
                  </span>
                </div>
              </div>
            )}
          </div>
        </article>
        <article className="evidence-pane">
          <header>
            <span className="eyebrow">
              {bundle.item.declaration === "not-supplied"
                ? "Your piece"
                : "Original photos"}
            </span>
            <span className="pill outline">Unchanged</span>
          </header>
          <div className="source-controls">
            <div className="view-tabs" aria-label="Choose original evidence">
              {(["reference", "front", "back"] as const)
                .filter((role) =>
                  bundle.item.assets.some((a) => a.role === role),
                )
                .map((role) => (
                  <button
                    key={role}
                    aria-pressed={source.role === role}
                    onClick={() => {
                      setSourceRole(role);
                      setScale(1);
                      if (activeFlaw) onInspect(undefined);
                    }}
                  >
                    {role === "reference"
                      ? "Reference"
                      : role === "front"
                        ? "Front"
                        : "Back"}
                  </button>
                ))}
            </div>
            <div className="inline-zoom">
              <button
                aria-label="Zoom out comparison source"
                disabled={scale === 1}
                onClick={() => setScale((s) => Math.max(1, s - 0.5))}
              >
                <Minus size={15} />
              </button>
              <output>{Math.round(scale * 100)}%</output>
              <button
                aria-label="Zoom in comparison source"
                disabled={scale === 3}
                onClick={() => setScale((s) => Math.min(3, s + 0.5))}
              >
                <Plus size={15} />
              </button>
            </div>
          </div>
          <div
            className="comparison-image source-evidence"
            ref={sourceFrame}
            tabIndex={0}
            aria-label="Original evidence; scroll when zoomed"
          >
            <div
              className="source-map"
              style={{
                width: fitWidth ? fitWidth * scale : "100%",
                minHeight: 0,
                margin: "0 auto",
              }}
            >
              <Photo
                bytes={bundle.assets[source.id]}
                mime={source.mime}
                alt={source.description}
              />
              {activeFlaw?.region && source.id === activeFlaw.sourceAssetId && (
                <div
                  className="source-region"
                  style={{
                    left: `${activeFlaw.region.x * 100}%`,
                    top: `${activeFlaw.region.y * 100}%`,
                    width: `${activeFlaw.region.width * 100}%`,
                    height: `${activeFlaw.region.height * 100}%`,
                  }}
                >
                  <span>SELLER-SELECTED DETAIL</span>
                </div>
              )}
            </div>
            <span className="persistent-image-label source-label">
              Original {source.role === "reference" ? "reference" : source.role}
            </span>
          </div>
          {activeFlaw && (
            <p className="comparison-caption">
              {activeFlaw
                ? activeFlaw.description
                : bundle.item.declaration === "not-supplied"
                  ? "Your supplied reference, unchanged. No additional condition views were provided."
                  : "Select a disclosed detail below to inspect its source and close-ups."}
            </p>
          )}
        </article>
      </div>
      <label className="split-control">
        <span>Compare</span>
        <input
          aria-label="Comparison pane balance"
          type="range"
          min={35}
          max={65}
          value={split}
          onChange={(e) => setSplit(e.target.valueAsNumber)}
        />
        <span>Original / look</span>
      </label>
      {bundle.item.flaws.length > 0 && (
        <div className="detail-navigation">
          <span className="eyebrow">
            <Focus size={15} /> Look closer
          </span>
          {bundle.item.flaws.length ? (
            bundle.item.flaws.map((flaw, index) => (
              <button
                key={flaw.id}
                aria-pressed={activeFlaw?.id === flaw.id}
                onClick={() => {
                  setScale(1);
                  setMobileView("source");
                  onInspect(flaw);
                }}
              >
                <span>0{index + 1}</span>
                {flaw.description}
                <ArrowUpRight size={16} />
              </button>
            ))
          ) : (
            <p>
              {bundle.item.declaration === "not-supplied"
                ? "Condition information not supplied. Do not infer condition from the generated look."
                : "Seller reports no known flaws; not independently inspected."}
            </p>
          )}
        </div>
      )}
      {!!closeups.length && (
        <div
          className="linked-closeup-strip"
          aria-label="Close-ups of selected detail"
        >
          {closeups.map((a, index) => (
            <figure key={a.id}>
              <Photo
                bytes={bundle.assets[a.id]}
                mime={a.mime}
                alt={a.description}
              />
              <figcaption>Linked close-up {index + 1}</figcaption>
            </figure>
          ))}
        </div>
      )}
    </section>
  );
}
