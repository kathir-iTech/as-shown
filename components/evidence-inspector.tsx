"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Minus, Plus, X } from "lucide-react";
import { type Bundle, type Flaw } from "@/domain/model";
import { Photo } from "./photo";

export function EvidenceInspector({
  bundle,
  flaw,
  onClose,
}: {
  bundle: Bundle;
  flaw?: Flaw;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [scale, setScale] = useState(1);
  useEffect(() => {
    if (flaw) {
      setScale(1);
      dialog.current?.showModal();
    } else dialog.current?.close();
  }, [flaw]);
  const source = bundle.item.assets.find((a) => a.id === flaw?.sourceAssetId);
  return (
    <dialog
      ref={dialog}
      className="evidence-dialog"
      onClose={onClose}
      aria-labelledby="inspector-title"
    >
      <div className="inspector-top">
        <div>
          <span className="eyebrow">
            ORIGINAL EVIDENCE / REVISION {bundle.item.revision}
          </span>
          <h2 id="inspector-title">The closer look.</h2>
        </div>
        <button
          className="icon-button"
          aria-label="Close evidence inspector"
          onClick={onClose}
        >
          <X size={23} />
        </button>
      </div>
      {flaw && source && (
        <div className="inspector-layout">
          <div className="inspector-source">
            <div className="inspector-toolbar">
              <span>{source.role.toUpperCase()} SOURCE</span>
              <div>
                <button
                  aria-label="Zoom out source"
                  disabled={scale === 1}
                  onClick={() => setScale(Math.max(1, scale - 0.5))}
                >
                  <Minus size={17} />
                </button>
                <output>{Math.round(scale * 100)}%</output>
                <button
                  aria-label="Zoom in source"
                  disabled={scale === 3}
                  onClick={() => setScale(Math.min(3, scale + 0.5))}
                >
                  <Plus size={17} />
                </button>
              </div>
            </div>
            <div
              className="source-viewport"
              tabIndex={0}
              aria-label="Source photograph; scroll to inspect when enlarged"
            >
              <div className="source-map" style={{ width: `${scale * 100}%` }}>
                <Photo
                  bytes={bundle.assets[source.id]}
                  mime={source.mime}
                  alt={source.description}
                />
                {flaw.region && (
                  <div
                    className="source-region"
                    style={{
                      left: `${flaw.region.x * 100}%`,
                      top: `${flaw.region.y * 100}%`,
                      width: `${flaw.region.width * 100}%`,
                      height: `${flaw.region.height * 100}%`,
                    }}
                  >
                    <span>SELLER MARKER</span>
                  </div>
                )}
              </div>
            </div>
            <p className="small">
              {flaw.region
                ? "Seller-selected region on the original source only. It is not an AI detection or a generated-image overlay."
                : "The seller linked this source view without a region marker."}
            </p>
          </div>
          <aside className="inspector-details">
            <span className="eyebrow">
              LINKED CONDITION DETAIL <ArrowUpRight size={16} />
            </span>
            <h3>{flaw.description}</h3>
            {flaw.closeupAssetIds.map((id) => {
              const asset = bundle.item.assets.find((a) => a.id === id)!;
              return (
                <figure key={id}>
                  <Photo
                    bytes={bundle.assets[id]}
                    mime={asset.mime}
                    alt={asset.description}
                  />
                  <figcaption>
                    Original saved close-up · {asset.width} × {asset.height}
                  </figcaption>
                </figure>
              );
            })}
            <p>
              These are seller-supplied photos. Their presence does not prove
              the physical garment’s condition.
            </p>
            <code className="source-digest">
              SOURCE SHA-256
              <br />
              {source.digest}
            </code>
          </aside>
        </div>
      )}
    </dialog>
  );
}
