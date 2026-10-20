"use client";
import { useState } from "react";
import { ArrowLeft, Plus, Trash2, ArrowRight, Upload } from "lucide-react";
import {
  type Asset,
  type AssetData,
  type Bundle,
  type Flaw,
  type Item,
  sealItem,
  freshReview,
} from "@/domain/model";
import { readAsset } from "@/domain/browser";
import { Photo } from "./photo";

type IssueDraft = {
  id: string;
  description: string;
  sourceRole: "front" | "back";
  asset?: Asset;
  bytes?: Uint8Array;
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
    existing?.item.flaws.map((f) => {
      const a = existing.item.assets.find((a) => a.id === f.closeupAssetIds[0]);
      return {
        id: f.id,
        description: f.description,
        sourceRole:
          existing.item.assets.find((a) => a.id === f.sourceAssetId)?.role ===
          "back"
            ? "back"
            : "front",
        asset: a,
        bytes: a ? existing.assets[a.id] : undefined,
      };
    }) || [],
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function photo(file: File, role: Asset["role"]) {
    setBusy(true);
    setError("");
    try {
      const result = await readAsset(file, role);
      setAssets((current) => [
        ...current.filter((a) => a.role !== role),
        result.asset,
      ]);
      setData((current) => ({ ...current, [result.asset.id]: result.bytes }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Photo could not be read.");
    } finally {
      setBusy(false);
    }
  }
  async function closeup(file: File, index: number) {
    setBusy(true);
    setError("");
    try {
      const result = await readAsset(file, "closeup");
      setIssues((current) =>
        current.map((issue, i) =>
          i === index
            ? { ...issue, asset: result.asset, bytes: result.bytes }
            : issue,
        ),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Close-up could not be read.");
    } finally {
      setBusy(false);
    }
  }
  async function submit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (!declaration)
        throw new Error("Explicitly choose a condition declaration.");
      if (
        ["reference", "front", "back"].some(
          (role) => !assets.some((a) => a.role === role),
        )
      )
        throw new Error(
          "Add the reference, front and back photographs before creating a record.",
        );
      const all = [...assets],
        bytes: AssetData = {};
      for (const a of assets) bytes[a.id] = data[a.id];
      const flaws: Flaw[] = [];
      if (declaration === "declared-flaws")
        for (const issue of issues) {
          if (!issue.description.trim() || !issue.asset || !issue.bytes)
            throw new Error(
              "Every declared issue needs a description and a readable close-up.",
            );
          all.push(issue.asset);
          bytes[issue.asset.id] = issue.bytes;
          flaws.push({
            id: issue.id,
            description: issue.description,
            sourceAssetId: assets.find((a) => a.role === issue.sourceRole)!.id,
            closeupAssetIds: [issue.asset.id],
          });
        }
      const item = await sealItem({
        schemaVersion: 1,
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
      onSave({ item, assets: bytes, review: freshReview(item) });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Record validation failed.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="editor-wrap">
      <button className="text-button" onClick={onCancel}>
        <ArrowLeft size={17} /> Back
      </button>
      <div className="page-heading">
        <span className="eyebrow">THE SELLER’S SIDE</span>
        <h1>
          {existing ? "Make a new revision." : "Give this item a record."}
        </h1>
        <p>One garment. Its original photos. The things a buyer should know.</p>
      </div>
      <form onSubmit={submit} className="editor-form">
        <fieldset disabled={busy}>
          <legend>
            <span>01</span> The item
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
              placeholder="Describe the garment without claiming a verified fit or condition."
            />
          </label>
        </fieldset>
        <fieldset disabled={busy}>
          <legend>
            <span>02</span> Source photographs
          </legend>
          <p className="muted">
            JPEG or PNG, 64–4096 px per side. Reference under 1.2 MB; front,
            back and close-ups under 6 MB each. Source bytes are kept unchanged.
          </p>
          <div className="upload-grid">
            {(["reference", "front", "back"] as const).map((role) => {
              const a = assets.find((a) => a.role === role);
              return (
                <label className="upload-tile" key={role}>
                  <span className="upload-title">
                    {role === "reference"
                      ? "Preview reference"
                      : `${role[0].toUpperCase() + role.slice(1)} condition view`}
                  </span>
                  <Photo
                    bytes={a ? data[a.id] : undefined}
                    mime={a?.mime}
                    alt={`${role} seller source`}
                  />
                  <span className="upload-action">
                    <Upload size={15} />
                    {a ? "Replace photo" : "Choose photo"}
                  </span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png"
                    aria-label={`${role} photograph`}
                    onChange={(e) => {
                      if (e.target.files?.[0])
                        void photo(e.target.files[0], role);
                    }}
                  />
                </label>
              );
            })}
          </div>
        </fieldset>
        <fieldset disabled={busy}>
          <legend>
            <span>03</span> Declare what you know
          </legend>
          <p className="muted">
            This is your declaration, not an independent inspection. Don’t
            invent issues to complete the form.
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
                    <h3>Issue {index + 1}</h3>
                    <button
                      type="button"
                      className="text-button"
                      onClick={() =>
                        setIssues((current) =>
                          current.filter((_, i) => i !== index),
                        )
                      }
                    >
                      <Trash2 size={15} />
                      Remove
                    </button>
                  </div>
                  <label>
                    What should the buyer know?
                    <textarea
                      required
                      maxLength={600}
                      value={issue.description}
                      onChange={(e) =>
                        setIssues((current) =>
                          current.map((x, i) =>
                            i === index
                              ? { ...x, description: e.target.value }
                              : x,
                          ),
                        )
                      }
                    />
                  </label>
                  <div className="form-two">
                    <label>
                      Which source view?
                      <select
                        value={issue.sourceRole}
                        onChange={(e) =>
                          setIssues((current) =>
                            current.map((x, i) =>
                              i === index
                                ? {
                                    ...x,
                                    sourceRole: e.target.value as
                                      "front" | "back",
                                  }
                                : x,
                            ),
                          )
                        }
                      >
                        <option value="front">Front condition view</option>
                        <option value="back">Back condition view</option>
                      </select>
                    </label>
                    <label>
                      Linked close-up photograph
                      <input
                        type="file"
                        accept="image/jpeg,image/png"
                        required={!issue.asset}
                        onChange={(e) => {
                          if (e.target.files?.[0])
                            void closeup(e.target.files[0], index);
                        }}
                      />
                    </label>
                  </div>
                  {issue.asset && (
                    <Photo
                      bytes={issue.bytes}
                      mime={issue.asset.mime}
                      alt="Selected condition close-up"
                      className="editor-closeup"
                    />
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
                    },
                  ])
                }
              >
                <Plus size={17} />
                Add an issue
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
            No account or public upload. Changes create a new revision and reset
            buyer decisions.
          </p>
          <button className="button primary" disabled={busy} type="submit">
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
