import { Unzip, UnzipInflate, zipSync, strToU8, strFromU8 } from "fflate";
import { z } from "zod";
import {
  type Bundle,
  type AssetData,
  itemSchema,
  reviewSchema,
  previewSchema,
  freshReview,
  verifyBundle,
  sha256,
  DISCLOSURE_VERSION,
} from "../domain/model";

export const ARCHIVE_LIMITS = {
  compressed: 25_000_000,
  expanded: 60_000_000,
  entries: 50,
};
const allowedName =
  /^(record\.json|manifest\.json|viewer\.html|preview\.(jpg|png)|assets\/[a-zA-Z0-9-]{1,80}\.(jpg|png))$/;
const recordSchema = z
  .object({
    format: z.literal("asshown/1"),
    kind: z.enum(["item", "decision"]),
    item: itemSchema,
    review: reviewSchema.optional(),
    preview: previewSchema.optional(),
  })
  .strict();
const manifestSchema = z
  .object({
    format: z.literal("asshown-manifest/1"),
    files: z
      .array(
        z
          .object({
            path: z.string().regex(allowedName),
            bytes: z.number().int().nonnegative(),
            digest: z.string().regex(/^[a-f0-9]{64}$/),
          })
          .strict(),
      )
      .max(49),
  })
  .strict();
const filename = (asset: Bundle["item"]["assets"][number]) =>
  `assets/${asset.id}.${asset.mime === "image/png" ? "png" : "jpg"}`;
const escape = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
export function staticViewer(bundle: Bundle, decision: boolean): string {
  const { item } = bundle;
  const picture = (id: string) => {
    const a = item.assets.find((a) => a.id === id)!;
    return `<figure><img src="${filename(a)}" alt="${escape(a.description)}"><figcaption>${escape(a.description)} · ${escape(a.origin)}</figcaption></figure>`;
  };
  const preview =
    decision && bundle.preview && bundle.result
      ? `<section><h2>Style preview · ${escape(bundle.preview.mode)}</h2><p>Generated with YouCam Clothes VTO V3. Not evidence of fit, sizing or condition.</p><figure><img alt="Saved generated style preview" src="preview.${bundle.preview.mime === "image/png" ? "png" : "jpg"}"></figure></section>`
      : "";
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src 'self' file:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
<title>${escape(item.title)} — AsShown saved record</title>
<style>body{max-width:960px;margin:40px auto;padding:0 24px;background:#f5f2eb;color:#222f29;font:17px/1.6 system-ui}h1,h2{font-family:Georgia,serif}img{max-width:100%;max-height:650px;object-fit:contain}figure{display:inline-block;vertical-align:top;max-width:42%;margin:12px}section{border-top:1px solid #abb6aa;padding:20px 0}pre{white-space:pre-wrap;overflow-wrap:anywhere}small{overflow-wrap:anywhere} @media(max-width:600px){figure{max-width:100%;margin:10px 0}}</style>
<header><p>AsShown / saved ${decision ? "private buyer decision" : "seller item"} record</p><h1>${escape(item.title)}</h1><p>Revision ${item.revision} · seller-declared evidence, not independently inspected.</p><p>${escape(item.description)}</p></header>
${preview}<section><h2>Original source evidence</h2>${item.assets.map((a) => picture(a.id)).join("")}</section>
<section><h2>Declared condition</h2>${item.declaration === "no-known-flaws" ? "<p>Seller reports no known flaws; not independently inspected.</p>" : item.flaws.map((f) => `<article><h3>${escape(f.description)}</h3><p>Source: ${escape(item.assets.find((a) => a.id === f.sourceAssetId)!.description)}</p>${f.closeupAssetIds.map(picture).join("")}${decision ? `<p>Buyer preference: ${escape(bundle.review.decisions[f.id])}</p>` : ""}</article>`).join("")}</section>
${decision ? `<section><h2>Buyer notes</h2><pre>${escape(bundle.review.notes || "No notes recorded.")}</pre><p>Unreviewed issues remain unanswered. No message or purchase was sent.</p></section>` : ""}
<footer><p>Offline snapshot. Extract the complete ZIP before opening this viewer. No external network dependencies. This HTML viewer does not verify itself: use the accompanying manifest and verifier.</p><p>Digests establish file agreement, not seller identity, honesty, trusted time or physical condition.</p><small>Item digest: ${item.contentDigest}<br>Disclosure: ${DISCLOSURE_VERSION}</small></footer></html>`;
}

export async function exportPackage(
  bundle: Bundle,
  kind: "item" | "decision",
): Promise<Uint8Array> {
  await verifyBundle(bundle);
  if (kind === "decision" && (!bundle.preview || !bundle.result))
    throw new Error(
      "Generate or open a recorded preview before saving a decision package.",
    );
  const record = {
    format: "asshown/1",
    kind,
    item: bundle.item,
    ...(kind === "decision"
      ? { review: bundle.review, preview: bundle.preview }
      : {}),
  };
  const files: Record<string, Uint8Array> = {
    "record.json": strToU8(JSON.stringify(record)),
    "viewer.html": strToU8(staticViewer(bundle, kind === "decision")),
  };
  for (const asset of bundle.item.assets)
    files[filename(asset)] = bundle.assets[asset.id];
  if (kind === "decision")
    files[`preview.${bundle.preview!.mime === "image/png" ? "png" : "jpg"}`] =
      bundle.result!;
  const entries = await Promise.all(
    Object.entries(files).map(async ([path, bytes]) => ({
      path,
      bytes: bytes.length,
      digest: await sha256(bytes),
    })),
  );
  files["manifest.json"] = strToU8(
    JSON.stringify({ format: "asshown-manifest/1", files: entries }),
  );
  if (
    Object.values(files).reduce((sum, b) => sum + b.length, 0) >
    ARCHIVE_LIMITS.expanded
  )
    throw new Error(
      "This package exceeds the expanded-size limit. Use fewer or smaller source images.",
    );
  const result = zipSync(files, { level: 4 });
  if (result.length > ARCHIVE_LIMITS.compressed)
    throw new Error("This package exceeds the 25 MB import limit.");
  return result;
}

/** Inspect the central directory before starting the streaming decompressor. ZIP64/encrypted/multi-volume archives are not supported. */
export function preflight(bytes: Uint8Array): Map<string, number> {
  if (bytes.length < 22 || bytes.length > ARCHIVE_LIMITS.compressed)
    throw new Error("Choose an AsShown ZIP below 25 MB.");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.length);
  let end = -1;
  for (let p = bytes.length - 22; p >= Math.max(0, bytes.length - 65557); p--) {
    if (
      view.getUint32(p, true) === 0x06054b50 &&
      p + 22 + view.getUint16(p + 20, true) === bytes.length
    ) {
      end = p;
      break;
    }
  }
  if (end < 0 || view.getUint16(end + 4, true) || view.getUint16(end + 6, true))
    throw new Error("Unsupported or incomplete ZIP.");
  const count = view.getUint16(end + 10, true),
    centralSize = view.getUint32(end + 12, true),
    start = view.getUint32(end + 16, true);
  if (
    count < 2 ||
    count > ARCHIVE_LIMITS.entries ||
    count !== view.getUint16(end + 8, true) ||
    start + centralSize !== end
  )
    throw new Error("ZIP directory limits or layout are invalid.");
  const entries = new Map<string, number>();
  let offset = start,
    total = 0;
  const decoder = new TextDecoder("utf-8", { fatal: true });
  for (let i = 0; i < count; i++) {
    if (offset + 46 > end || view.getUint32(offset, true) !== 0x02014b50)
      throw new Error("Invalid ZIP directory.");
    const flags = view.getUint16(offset + 8, true),
      method = view.getUint16(offset + 10, true),
      compressed = view.getUint32(offset + 20, true),
      expanded = view.getUint32(offset + 24, true);
    const n = view.getUint16(offset + 28, true),
      extra = view.getUint16(offset + 30, true),
      comment = view.getUint16(offset + 32, true),
      local = view.getUint32(offset + 42, true);
    if (
      offset + 46 + n + extra + comment > end ||
      local + 30 > start ||
      flags & 1 ||
      ![0, 8].includes(method) ||
      compressed === 0xffffffff ||
      expanded === 0xffffffff
    )
      throw new Error("Unsupported ZIP entry.");
    const name = decoder.decode(bytes.subarray(offset + 46, offset + 46 + n));
    if (!allowedName.test(name) || entries.has(name))
      throw new Error("Unexpected, duplicate or unsafe archive filename.");
    if (view.getUint32(local, true) !== 0x04034b50)
      throw new Error("Missing ZIP local header.");
    const ln = view.getUint16(local + 26, true),
      le = view.getUint16(local + 28, true);
    if (
      local + 30 + ln + le + compressed > start ||
      decoder.decode(bytes.subarray(local + 30, local + 30 + ln)) !== name ||
      view.getUint16(local + 8, true) !== method
    )
      throw new Error("ZIP local and directory records disagree.");
    const limit =
      name === "viewer.html"
        ? 30_000_000
        : name.endsWith(".json")
          ? 250_000
          : 6_000_000;
    if (expanded > limit || (total += expanded) > ARCHIVE_LIMITS.expanded)
      throw new Error("Archive expansion limit exceeded.");
    entries.set(name, expanded);
    offset += 46 + n + extra + comment;
  }
  if (
    offset !== end ||
    !entries.has("record.json") ||
    !entries.has("manifest.json")
  )
    throw new Error("Required package records are missing.");
  return entries;
}

export async function importPackage(bytes: Uint8Array): Promise<Bundle> {
  const expected = preflight(bytes),
    files: Record<string, Uint8Array> = {};
  let total = 0,
    failure: Error | undefined;
  const seen = new Set<string>();
  const unzip = new Unzip((file) => {
    if (!expected.has(file.name) || seen.has(file.name))
      throw new Error("Unexpected or duplicate local ZIP entry.");
    seen.add(file.name);
    const chunks: Uint8Array[] = [];
    let length = 0;
    file.ondata = (error, data, final) => {
      if (error) {
        failure = error;
        return;
      }
      length += data.length;
      total += data.length;
      if (
        length > expected.get(file.name)! ||
        total > ARCHIVE_LIMITS.expanded
      ) {
        file.terminate();
        throw new Error("Archive expanded beyond its declared limits.");
      }
      chunks.push(data);
      if (final) {
        if (length !== expected.get(file.name))
          throw new Error("Incomplete ZIP entry.");
        const joined = new Uint8Array(length);
        let pos = 0;
        for (const c of chunks) {
          joined.set(c, pos);
          pos += c.length;
        }
        files[file.name] = joined;
      }
    };
    file.start();
  });
  unzip.register(UnzipInflate);
  // Small pushes bound the output produced before the callback can reject expansion.
  for (let i = 0; i < bytes.length; i += 1024) {
    unzip.push(bytes.subarray(i, i + 1024), i + 1024 >= bytes.length);
    if (failure) throw failure;
  }
  if (Object.keys(files).length !== expected.size)
    throw new Error("The archive is incomplete.");
  const manifest = manifestSchema.parse(
    JSON.parse(strFromU8(files["manifest.json"])),
  );
  const names = new Set(manifest.files.map((f) => f.path));
  if (
    names.size !== manifest.files.length ||
    names.size !== expected.size - 1 ||
    names.has("manifest.json")
  )
    throw new Error("Invalid manifest file list.");
  for (const row of manifest.files) {
    if (
      !files[row.path] ||
      files[row.path].length !== row.bytes ||
      (await sha256(files[row.path])) !== row.digest
    )
      throw new Error("A package file differs from its manifest.");
  }
  const record = recordSchema.parse(
    JSON.parse(strFromU8(files["record.json"])),
  );
  const assets: AssetData = {};
  const permitted = new Set(["record.json", "manifest.json", "viewer.html"]);
  for (const asset of record.item.assets) {
    const path = filename(asset);
    permitted.add(path);
    assets[asset.id] = files[path];
  }
  let result: Uint8Array | undefined;
  if (record.kind === "decision") {
    if (!record.preview || !record.review)
      throw new Error("Decision package lacks its preview or review.");
    const path = `preview.${record.preview.mime === "image/png" ? "png" : "jpg"}`;
    permitted.add(path);
    result = files[path];
  } else if (record.preview || record.review)
    throw new Error("An item package must not contain personal buyer data.");
  if (Object.keys(files).some((name) => !permitted.has(name)))
    throw new Error("Package contains unreferenced content.");
  const bundle = {
    item: record.item,
    assets,
    review: record.review || freshReview(record.item),
    preview: record.preview,
    result,
  };
  await verifyBundle(bundle);
  // Never render/execute the supplied viewer.html. The app uses validated records; exports regenerate the viewer.
  return bundle;
}
