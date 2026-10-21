"use client";
import { useRef } from "react";
import { type Flaw, type Asset } from "@/domain/model";
import { Photo } from "./photo";

type Region = NonNullable<Flaw["region"]>;
export function SourceRegionEditor({
  source,
  bytes,
  region,
  onChange,
}: {
  source?: Asset;
  bytes?: Uint8Array;
  region?: Region;
  onChange: (region?: Region) => void;
}) {
  const current = region || { x: 0.35, y: 0.35, width: 0.3, height: 0.3 };
  const anchor = useRef<{ x: number; y: number } | undefined>(undefined);
  function update(field: keyof Region, percent: number) {
    if (!Number.isFinite(percent)) return;
    const next = {
      ...current,
      [field]: Math.min(
        1,
        Math.max(
          field === "width" || field === "height" ? 0.01 : 0,
          percent / 100,
        ),
      ),
    };
    if (field === "x") next.x = Math.min(next.x, 1 - next.width);
    if (field === "y") next.y = Math.min(next.y, 1 - next.height);
    if (field === "width") next.width = Math.min(next.width, 1 - next.x);
    if (field === "height") next.height = Math.min(next.height, 1 - next.y);
    onChange(next);
  }
  return (
    <details className="region-editor">
      <summary>
        {region
          ? "Edit the source-region marker"
          : "Add an optional source-region marker"}
      </summary>
      <p className="small">
        Draw over the original {source?.role || "source"} photo with a mouse or
        finger. Use arrow keys to move the marker, Shift + arrows to resize, or
        the precise controls below.
      </p>
      <label className="check-label">
        <input
          type="checkbox"
          checked={!!region}
          onChange={(e) => onChange(e.target.checked ? current : undefined)}
        />
        Include a seller-selected region
      </label>
      {region && source && bytes && (
        <>
          <div className="region-fields">
            {(["x", "y", "width", "height"] as const).map((field) => (
              <label key={field}>
                {
                  {
                    x: "Left (%)",
                    y: "Top (%)",
                    width: "Width (%)",
                    height: "Height (%)",
                  }[field]
                }
                <input
                  type="number"
                  min={field === "x" || field === "y" ? 0 : 1}
                  max={100}
                  step={1}
                  value={Math.round(region[field] * 100)}
                  onChange={(e) => update(field, e.target.valueAsNumber)}
                />
              </label>
            ))}
          </div>
          <div
            className="source-map region-drawing"
            tabIndex={0}
            role="group"
            aria-label="Draw or adjust the seller-selected source region"
            onPointerDown={(event) => {
              if (event.button !== 0) return;
              const rect = event.currentTarget.getBoundingClientRect();
              anchor.current = {
                x: Math.max(
                  0,
                  Math.min(0.98, (event.clientX - rect.left) / rect.width),
                ),
                y: Math.max(
                  0,
                  Math.min(0.98, (event.clientY - rect.top) / rect.height),
                ),
              };
              event.currentTarget.setPointerCapture(event.pointerId);
              event.preventDefault();
            }}
            onPointerMove={(event) => {
              if (!anchor.current) return;
              const rect = event.currentTarget.getBoundingClientRect();
              const x = Math.max(
                0,
                Math.min(1, (event.clientX - rect.left) / rect.width),
              );
              const y = Math.max(
                0,
                Math.min(1, (event.clientY - rect.top) / rect.height),
              );
              const left = Math.min(anchor.current.x, x, 0.98),
                top = Math.min(anchor.current.y, y, 0.98);
              onChange({
                x: left,
                y: top,
                width: Math.min(
                  1 - left,
                  Math.max(0.02, Math.abs(x - anchor.current.x)),
                ),
                height: Math.min(
                  1 - top,
                  Math.max(0.02, Math.abs(y - anchor.current.y)),
                ),
              });
            }}
            onPointerUp={() => {
              anchor.current = undefined;
            }}
            onPointerCancel={() => {
              anchor.current = undefined;
            }}
            onKeyDown={(event) => {
              const arrows: Record<string, [keyof Region, number]> = {
                ArrowLeft: [event.shiftKey ? "width" : "x", -1],
                ArrowRight: [event.shiftKey ? "width" : "x", 1],
                ArrowUp: [event.shiftKey ? "height" : "y", -1],
                ArrowDown: [event.shiftKey ? "height" : "y", 1],
              };
              const change = arrows[event.key];
              if (change) {
                event.preventDefault();
                update(change[0], current[change[0]] * 100 + change[1]);
              }
            }}
          >
            <Photo
              bytes={bytes}
              mime={source.mime}
              alt="Source photograph with your declared region"
            />
            <div
              className="source-region"
              style={{
                left: `${region.x * 100}%`,
                top: `${region.y * 100}%`,
                width: `${region.width * 100}%`,
                height: `${region.height * 100}%`,
              }}
            >
              <span>SELLER MARKER</span>
            </div>
          </div>
        </>
      )}
    </details>
  );
}
