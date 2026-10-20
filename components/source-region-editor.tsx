"use client";
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
        Mark the area yourself on the original {source?.role || "source"} photo.
        This is not automatic defect detection.
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
          <div className="source-map" style={{ maxWidth: 310 }}>
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
