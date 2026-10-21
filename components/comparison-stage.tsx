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
}: {
  bundle: Bundle;
  activeFlaw?: Flaw;
  onInspect: (flaw?: Flaw) => void;
  onPreview: () => void;
}) {
  const [sourceRole, setSourceRole] = useState("front");
  const [scale, setScale] = useState(1);
  const [split, setSplit] = useState(50);
  const sourceFrame = useRef<HTMLDivElement>(null);
  const [fitWidth, setFitWidth] = useState(0);
  const source =
    bundle.item.assets.find((a) => a.id === activeFlaw?.sourceAssetId) ||
    bundle.item.assets.find((a) => a.role === sourceRole)!;
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
  return (
    <section
      className="comparison-stage"
      aria-label="Style and original condition comparison"
    >
      <div className="comparison-topline">
        <span>
          <i className="live-dot" /> THE DECISION VIEW
        </span>
        <span>One garment. Two different questions.</span>
      </div>
      <div
        className="comparison-panes"
        style={{
          gridTemplateColumns: `minmax(0, ${split}fr) minmax(0, ${100 - split}fr)`,
        }}
      >
        <article className="style-pane">
          <header>
            <span className="eyebrow">01 / HOW IT COULD LOOK</span>
            <span className="pill">
              {bundle.preview ? previewMode : "Your preview"}
            </span>
          </header>
          <div className="comparison-image style-image">
            <Photo
              bytes={
                bundle.result ||
                bundle.assets[
                  bundle.item.assets.find((a) => a.role === "reference")!.id
                ]
              }
              mime={bundle.preview?.mime}
              alt={
                bundle.result
                  ? "YouCam-generated style preview, not evidence of fit or garment condition"
                  : "Original reference garment; a personal preview has not been generated"
              }
            />
            <span className="persistent-image-label">
              {bundle.result
                ? "AI STYLE PREVIEW · YOUCAM"
                : "GARMENT REFERENCE · PREVIEW NOT GENERATED"}
            </span>
            {!bundle.result && (
              <button
                className="button primary preview-on-image"
                onClick={onPreview}
              >
                See the style on me <ArrowUpRight size={17} />
              </button>
            )}
          </div>
          <p className="comparison-caption">
            A visual impression of style. Check the original photographs for
            condition.
          </p>
        </article>
        <article className="evidence-pane">
          <header>
            <span className="eyebrow">02 / WHAT THE SELLER SHOWS</span>
            <span className="pill outline">Original source photo</span>
          </header>
          <div className="source-controls">
            <div className="view-tabs" aria-label="Choose original evidence">
              {(["reference", "front", "back"] as const).map((role) => (
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
              {source.role.toUpperCase()} · ORIGINAL EVIDENCE
            </span>
          </div>
          <p className="comparison-caption">
            {activeFlaw
              ? activeFlaw.description
              : "Select a disclosed detail below to inspect its source and close-ups."}
          </p>
        </article>
      </div>
      <label className="split-control">
        <span>Adjust the view</span>
        <input
          aria-label="Comparison pane balance"
          type="range"
          min={35}
          max={65}
          value={split}
          onChange={(e) => setSplit(e.target.valueAsNumber)}
        />
        <span>Style / evidence</span>
      </label>
      <div className="detail-navigation">
        <span className="eyebrow">
          <Focus size={15} /> LOOK CLOSER
        </span>
        {bundle.item.flaws.length ? (
          bundle.item.flaws.map((flaw, index) => (
            <button
              key={flaw.id}
              aria-pressed={activeFlaw?.id === flaw.id}
              onClick={() => {
                setScale(1);
                onInspect(flaw);
              }}
            >
              <span>0{index + 1}</span>
              {flaw.description}
              <ArrowUpRight size={16} />
            </button>
          ))
        ) : (
          <p>Seller reports no known flaws; not independently inspected.</p>
        )}
      </div>
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
