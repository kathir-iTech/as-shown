"use client";
import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Plus,
  Trash2,
  ArrowRight,
  Upload,
  Check,
  Save,
} from "lucide-react";
import { z } from "zod";
import {
  type Asset,
  type AssetData,
  type Bundle,
  type Flaw,
  type Item,
  assetSchema,
  flawSchema,
  sealItem,
  freshReview,
  imageDimensions,
  sha256,
} from "@/domain/model";
import { readAsset, prepareInput, getLocal, putLocal } from "@/domain/browser";
import { Photo } from "./photo";
import { SourceRegionEditor } from "./source-region-editor";

const photoSchema = z.object({
  asset: assetSchema,
  bytes: z.instanceof(Uint8Array),
});
const issueSchema = z.object({
  id: z.string(),
  description: z.string().max(600),
  sourceRole: z.enum(["front", "back"]),
  photos: z.array(photoSchema).max(4),
  region: flawSchema.shape.region,
  needsReview: z.boolean().optional(),
});
const draftSchema = z.object({
  title: z.string().max(120),
  description: z.string().max(1500),
  declaration: z.enum(["", "declared-flaws", "no-known-flaws"]),
  assets: z.array(assetSchema).max(20),
  data: z.record(z.string(), z.instanceof(Uint8Array)),
  issues: z.array(issueSchema).max(12),
});
type IssueDraft = Omit<z.infer<typeof issueSchema>, "photos"> & {
  photos: { asset: Asset; bytes: Uint8Array }[];
};

export function Editor({
  existing,
  onSave,
  onCancel,
}: {
  existing?: Bundle;
  onSave: (bundle: Bundle) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(existing?.item.title || "");
  const [description, setDescription] = useState(
    existing?.item.description || "",
  );
  const [assets, setAssets] = useState<Asset[]>(
    existing?.item.assets.filter((a) => a.role !== "closeup") || [],
  );
  const [data, setData] = useState<AssetData>(existing?.assets || {});
  const [declaration, setDeclaration] = useState<Item["declaration"] | "">(
    existing?.item.declaration || "",
  );
  const [issues, setIssues] = useState<IssueDraft[]>(
    existing?.item.flaws.map((f) => ({
      id: f.id,
      description: f.description,
      sourceRole:
        existing.item.assets.find((a) => a.id === f.sourceAssetId)?.role ===
        "back"
          ? "back"
          : "front",
      region: f.region,
      photos: f.closeupAssetIds.map((id) => ({
        asset: existing.item.assets.find((a) => a.id === id)!,
        bytes: existing.assets[id],
      })),
    })) || [],
  );
  const [error, setError] = useState("");
  const [draftMessage, setDraftMessage] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const pendingOperations = useRef(0);
  const readVersions = useRef<Record<string, string>>({});
  const [pendingCount, setPendingCount] = useState(0);
  // A draft belongs to this exact base revision, not every revision of an item.
  const draftKey = "seller-draft:" + (existing?.item.contentDigest || "new");
  const busy = pendingCount > 0;
  useEffect(() => {
    let cancelled = false;
    void getLocal(draftKey)
      .then((raw) => {
        if (cancelled) return;
        const saved = draftSchema.safeParse(raw);
        if (saved.success) {
          setTitle(saved.data.title);
          setDescription(saved.data.description);
          setDeclaration(saved.data.declaration);
          setAssets(saved.data.assets);
          setData(saved.data.data);
          setIssues(saved.data.issues);
          setDraftMessage(
            "Your unfinished listing was restored on this device.",
          );
        }
      })
      .catch(() =>
        setDraftMessage(
          "Device storage is unavailable. Keep this tab open until you export.",
        ),
      )
      .finally(() => {
        if (!cancelled) setHydrated(true);
      });
    return () => {
      cancelled = true;
    };
  }, [draftKey, existing]);
  useEffect(() => {
    if (!hydrated || busy) return;
    setDraftMessage("Saving draft on this device…");
    const timer = setTimeout(() => {
      void putLocal(draftKey, {
        title,
        description,
        declaration,
        assets,
        data,
        issues,
      })
        .then(() => setDraftMessage("Draft saved on this device"))
        .catch(() =>
          setDraftMessage(
            "Draft could not be saved. Keep this tab open until you export.",
          ),
        );
    }, 600);
    return () => clearTimeout(timer);
  }, [
    title,
    description,
    declaration,
    assets,
    data,
    issues,
    hydrated,
    busy,
    draftKey,
  ]);
  function beginWork() {
    pendingOperations.current++;
    setPendingCount(pendingOperations.current);
  }
  function endWork() {
    pendingOperations.current--;
    setPendingCount(pendingOperations.current);
  }
  async function photo(file: File, role: Asset["role"]) {
    beginWork();
    const version = crypto.randomUUID();
    readVersions.current[role] = version;
    setError("");
    try {
      const original = await readAsset(file, role);
      let prepared: { asset: Asset; bytes: Uint8Array } | undefined;
      if (role === "reference") {
        const bytes = await prepareInput(file);
        prepared = {
          bytes,
          asset: {
            id: crypto.randomUUID(),
            role: "preview-reference",
            ...imageDimensions(bytes),
            byteLength: bytes.length,
            digest: await sha256(bytes),
            sourceDigest: original.asset.digest,
            description: "Prepared preview input; original reference retained",
            origin: "seller-upload",
            transformations: [
              "Locally resized to at most 2048 px; JPEG encoded; metadata removed; original evidence retained.",
            ],
          },
        };
      }
      if (readVersions.current[role] !== version) return;
      const additions = prepared ? [original, prepared] : [original];
      setAssets((current) => [
        ...current.filter(
          (a) =>
            a.role !== role &&
            !(role === "reference" && a.role === "preview-reference"),
        ),
        ...additions.map((entry) => entry.asset),
      ]);
      setData((current) => ({
        ...current,
        ...Object.fromEntries(
          additions.map((entry) => [entry.asset.id, entry.bytes]),
        ),
      }));
      if (role === "front" || role === "back")
        setIssues((current) =>
          current.map((issue) =>
            issue.sourceRole === role
              ? { ...issue, region: undefined, needsReview: true }
              : issue,
          ),
        );
    } catch (e) {
      if (readVersions.current[role] === version)
        setError(e instanceof Error ? e.message : "Photo could not be read.");
    } finally {
      endWork();
    }
  }
  async function closeup(file: File, issueId: string, replace?: string) {
    beginWork();
    const key = issueId + ":" + (replace || crypto.randomUUID());
    const version = crypto.randomUUID();
    readVersions.current[key] = version;
    setError("");
    try {
      const result = await readAsset(file, "closeup");
      if (readVersions.current[key] !== version) return;
      setIssues((current) =>
        current.map((issue) =>
          issue.id !== issueId
            ? issue
            : {
                ...issue,
                photos: replace
                  ? issue.photos.map((entry) =>
                      entry.asset.id === replace ? result : entry,
                    )
                  : [...issue.photos, result].slice(0, 4),
              },
        ),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Close-up could not be read.");
    } finally {
      endWork();
    }
  }
  function updateIssue(id: string, update: Partial<IssueDraft>) {
    setIssues((current) =>
      current.map((issue) =>
        issue.id === id ? { ...issue, ...update } : issue,
      ),
    );
  }
  async function submit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pendingOperations.current > 0) return;
    beginWork();
    setError("");
    try {
      if (!declaration) throw new Error("Choose your condition declaration.");
      if (
        ["reference", "front", "back"].some(
          (role) => !assets.some((a) => a.role === role),
        )
      )
        throw new Error("Add the reference, front and back photographs.");
      const all = [...assets],
        bytes: AssetData = Object.fromEntries(
          assets.map((a) => [a.id, data[a.id]]),
        ),
        flaws: Flaw[] = [];
      if (declaration === "declared-flaws")
        for (const issue of issues) {
          if (issue.needsReview)
            throw new Error(
              "Reconfirm each disclosure linked to a replaced source photo.",
            );
          if (!issue.description.trim() || !issue.photos.length)
            throw new Error(
              "Each issue needs a description and at least one close-up.",
            );
          for (const entry of issue.photos) {
            if (!all.some((a) => a.id === entry.asset.id))
              all.push(entry.asset);
            bytes[entry.asset.id] = entry.bytes;
          }
          flaws.push({
            id: issue.id,
            description: issue.description,
            sourceAssetId: assets.find((a) => a.role === issue.sourceRole)!.id,
            closeupAssetIds: issue.photos.map((entry) => entry.asset.id),
            ...(issue.region ? { region: issue.region } : {}),
          });
        }
      if (all.length > 20)
        throw new Error(
          "This record supports 20 images. Remove a close-up before saving.",
        );
      const item = await sealItem({
        schemaVersion: assets.some((a) => a.role === "preview-reference")
          ? 2
          : 1,
        itemId: existing?.item.itemId || crypto.randomUUID(),
        revision: (existing?.item.revision || 0) + 1,
        title,
        description,
        category: "upper_body",
        createdAt: new Date().toISOString(),
        declaration,
        assets: all,
        flaws,
      });
      await putLocal(draftKey, undefined);
      onSave({ item, assets: bytes, review: freshReview(item) });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Record could not be saved.");
    } finally {
      endWork();
    }
  }
  return (
    <section className="editor-wrap">
      <button className="text-button" onClick={onCancel}>
        <ArrowLeft size={17} /> Back
      </button>
      <div className="page-heading">
        <span className="eyebrow">THE SELLER’S STUDIO</span>
        <h1>
          {existing ? "Make a new revision." : "Give this item a record."}
        </h1>
        <p>The photographs, the details, and a little less guesswork.</p>
      </div>
      <nav className="editor-steps" aria-label="Listing preparation">
        <a href="#seller-item">01 / The garment</a>
        <a href="#seller-photos">02 / The photographs</a>
        <a href="#seller-condition">03 / The condition</a>
        <span role="status">
          <Save size={14} /> {draftMessage || "Opening device storage…"}
        </span>
      </nav>
      <form onSubmit={submit} className="editor-form">
        <fieldset id="seller-item" disabled={!hydrated}>
          <legend>
            <span>01</span> The garment
          </legend>
          <div className="form-two">
            <label>
              Item title
              <input
                required
                maxLength={120}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Rust linen button-up"
              />
            </label>
            <label>
              Category
              <input value="Upper-body shirt / top" readOnly />
            </label>
          </div>
          <label>
            Seller description
            <textarea
              maxLength={1500}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Material, measurements and the details you know."
            />
          </label>
        </fieldset>
        <fieldset id="seller-photos" disabled={!hydrated}>
          <legend>
            <span>02</span> Source photographs
          </legend>
          <p className="muted">
            JPEG or PNG, up to 12 MB and 40 megapixels. Original evidence is
            retained; a separate smaller copy is prepared for YouCam.
          </p>
          <label className="batch-upload">
            <Upload size={18} /> Add three photos together: reference, front,
            then back
            <input
              aria-label="Add reference front and back together"
              type="file"
              accept="image/jpeg,image/png"
              multiple
              onChange={(e) => {
                const files = Array.from(e.target.files || []);
                if (files.length !== 3) {
                  setError(
                    "Choose exactly three photos in reference, front, back order, or use the individual slots below.",
                  );
                  return;
                }
                files.forEach(
                  (file, i) =>
                    void photo(
                      file,
                      (["reference", "front", "back"] as const)[i],
                    ),
                );
                e.target.value = "";
              }}
            />
          </label>
          <div className="upload-grid">
            {(["reference", "front", "back"] as const).map((role) => {
              const a = assets.find((entry) => entry.role === role);
              return (
                <label className="upload-tile" key={role}>
                  <span className="upload-title">
                    {role === "reference"
                      ? "Preview reference"
                      : role[0].toUpperCase() +
                        role.slice(1) +
                        " condition view"}
                  </span>
                  <Photo
                    bytes={a ? data[a.id] : undefined}
                    mime={a?.mime}
                    alt={role + " seller source"}
                  />
                  <span className="upload-action">
                    <Upload size={15} />
                    {a ? "Replace photo" : "Choose photo"}
                  </span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png"
                    aria-label={role + " photograph"}
                    onChange={(e) => {
                      if (e.target.files?.[0])
                        void photo(e.target.files[0], role);
                      e.target.value = "";
                    }}
                  />
                </label>
              );
            })}
          </div>
          {assets.some((a) => a.role === "preview-reference") && (
            <p className="preparation-note">
              <Check size={16} /> Preview copy prepared locally. Your original
              garment reference stays in the record.
            </p>
          )}
        </fieldset>
        <fieldset id="seller-condition" disabled={!hydrated}>
          <legend>
            <span>03</span> Declare what you know
          </legend>
          <p className="muted">
            Show what a buyer should see. Your condition declaration stays
            beside the style preview.
          </p>
          <div className="declaration-options">
            <label>
              <input
                type="radio"
                name="declaration"
                checked={declaration === "declared-flaws"}
                onChange={() => {
                  setDeclaration("declared-flaws");
                  if (!issues.length)
                    setIssues([
                      {
                        id: crypto.randomUUID(),
                        description: "",
                        sourceRole: "front",
                        photos: [],
                      },
                    ]);
                }}
              />{" "}
              There are known issues to show
            </label>
            <label>
              <input
                type="radio"
                name="declaration"
                checked={declaration === "no-known-flaws"}
                onChange={() => setDeclaration("no-known-flaws")}
              />{" "}
              I’m not aware of any flaws
            </label>
          </div>
          {declaration === "declared-flaws" && (
            <>
              {issues.map((issue, index) => (
                <article className="issue-editor" key={issue.id}>
                  <div className="section-line">
                    <h3>Detail {String(index + 1).padStart(2, "0")}</h3>
                    <button
                      type="button"
                      className="text-button"
                      onClick={() =>
                        setIssues((current) =>
                          current.filter((entry) => entry.id !== issue.id),
                        )
                      }
                    >
                      <Trash2 size={15} /> Remove issue
                    </button>
                  </div>
                  <label>
                    What should the buyer know?
                    <textarea
                      required
                      maxLength={600}
                      value={issue.description}
                      onChange={(e) =>
                        updateIssue(issue.id, { description: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    Which source view?
                    <select
                      value={issue.sourceRole}
                      onChange={(e) =>
                        updateIssue(issue.id, {
                          sourceRole: e.target.value as "front" | "back",
                          region: undefined,
                          needsReview: true,
                        })
                      }
                    >
                      <option value="front">Front condition view</option>
                      <option value="back">Back condition view</option>
                    </select>
                  </label>
                  <div className="closeup-grid">
                    {issue.photos.map((entry, slot) => (
                      <figure key={entry.asset.id}>
                        <Photo
                          bytes={entry.bytes}
                          mime={entry.asset.mime}
                          alt={
                            "Close-up " +
                            (slot + 1) +
                            ": " +
                            (issue.description || "condition detail")
                          }
                        />
                        <figcaption>
                          Close-up {slot + 1}
                          <button
                            type="button"
                            aria-label={
                              "Remove close-up " +
                              (slot + 1) +
                              " from detail " +
                              (index + 1)
                            }
                            onClick={() =>
                              updateIssue(issue.id, {
                                photos: issue.photos.filter(
                                  (p) => p.asset.id !== entry.asset.id,
                                ),
                              })
                            }
                          >
                            <Trash2 size={14} />
                          </button>
                        </figcaption>
                        <label className="text-button">
                          Replace
                          <input
                            type="file"
                            accept="image/jpeg,image/png"
                            aria-label={
                              "Replace close-up " +
                              (slot + 1) +
                              " of detail " +
                              (index + 1)
                            }
                            onChange={(e) => {
                              if (e.target.files?.[0])
                                void closeup(
                                  e.target.files[0],
                                  issue.id,
                                  entry.asset.id,
                                );
                            }}
                          />
                        </label>
                        {slot > 0 && (
                          <button
                            className="text-button"
                            type="button"
                            onClick={() => {
                              const next = [...issue.photos];
                              [next[slot - 1], next[slot]] = [
                                next[slot],
                                next[slot - 1],
                              ];
                              updateIssue(issue.id, { photos: next });
                            }}
                          >
                            Move earlier
                          </button>
                        )}
                      </figure>
                    ))}
                  </div>
                  {issue.photos.length < 4 && (
                    <label className="batch-upload">
                      <Plus size={16} /> Add close-ups ({issue.photos.length}/4)
                      <input
                        type="file"
                        multiple
                        accept="image/jpeg,image/png"
                        aria-label={"Add close-ups for detail " + (index + 1)}
                        onChange={(e) => {
                          const files = Array.from(e.target.files || []);
                          if (files.length + issue.photos.length > 4) {
                            setError(
                              "Each detail supports up to four close-ups.",
                            );
                            return;
                          }
                          files.forEach((file) => void closeup(file, issue.id));
                          e.target.value = "";
                        }}
                      />
                    </label>
                  )}
                  <SourceRegionEditor
                    source={assets.find((a) => a.role === issue.sourceRole)}
                    bytes={
                      data[
                        assets.find((a) => a.role === issue.sourceRole)?.id ||
                          ""
                      ]
                    }
                    region={issue.region}
                    onChange={(region) => updateIssue(issue.id, { region })}
                  />
                  {issue.needsReview !== undefined && (
                    <label className="check-label warning">
                      <input
                        type="checkbox"
                        checked={!issue.needsReview}
                        onChange={(e) =>
                          updateIssue(issue.id, {
                            needsReview: !e.target.checked,
                          })
                        }
                      />{" "}
                      I checked this disclosure and its close-ups against the
                      replacement source photo.
                    </label>
                  )}
                </article>
              ))}
              <button
                type="button"
                className="button secondary"
                disabled={issues.length >= 12}
                onClick={() =>
                  setIssues((current) => [
                    ...current,
                    {
                      id: crypto.randomUUID(),
                      description: "",
                      sourceRole: "front",
                      photos: [],
                    },
                  ])
                }
              >
                <Plus size={17} /> Add an issue
              </button>
            </>
          )}
        </fieldset>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="editor-save">
          <p>
            Your record is saved locally. Changes create a revision for the
            buyer to review.
          </p>
          <button
            className="button primary"
            disabled={busy || !hydrated}
            type="submit"
          >
            {busy
              ? "Preparing…"
              : existing
                ? "Save new revision"
                : "Create item record"}
            <ArrowRight size={18} />
          </button>
        </div>
      </form>
    </section>
  );
}
