import { z } from "zod";

export const DISCLOSURE_VERSION = "asshown-2026-10-20";
export const MAX_ASSET_BYTES = 6_000_000;
export const MAX_INPUT_BYTES = 1_200_000;
const id = z.string().regex(/^[a-zA-Z0-9-]{1,80}$/);
export const digestSchema = z.string().regex(/^[a-f0-9]{64}$/);
export const assetSchema = z
  .object({
    id,
    role: z.enum(["reference", "front", "back", "closeup"]),
    mime: z.enum(["image/jpeg", "image/png"]),
    width: z.number().int().min(64).max(4096),
    height: z.number().int().min(64).max(4096),
    byteLength: z.number().int().positive().max(MAX_ASSET_BYTES),
    digest: digestSchema,
    description: z.string().min(1).max(240),
    origin: z.enum(["seller-upload", "synthetic-demo"]),
    transformations: z.array(z.string().max(200)).max(5),
  })
  .strict();
export const flawSchema = z
  .object({
    id,
    description: z.string().trim().min(1).max(600),
    sourceAssetId: id,
    closeupAssetIds: z.array(id).min(1).max(4),
    region: z
      .object({
        x: z.number().min(0).max(1),
        y: z.number().min(0).max(1),
        width: z.number().positive().max(1),
        height: z.number().positive().max(1),
      })
      .strict()
      .optional(),
  })
  .strict();
export const itemSchema = z
  .object({
    schemaVersion: z.literal(1),
    itemId: id,
    revision: z.number().int().min(1).max(10000),
    title: z.string().trim().min(1).max(120),
    description: z.string().max(1500),
    category: z.literal("upper_body"),
    createdAt: z.iso.datetime(),
    declaration: z.enum(["declared-flaws", "no-known-flaws"]),
    assets: z.array(assetSchema).min(3).max(20),
    flaws: z.array(flawSchema).max(12),
    contentDigest: digestSchema,
  })
  .strict()
  .superRefine((item, ctx) => {
    const issue = (message: string) =>
      ctx.addIssue({ code: "custom", message });
    const ids = new Set(item.assets.map((a) => a.id));
    if (ids.size !== item.assets.length)
      issue("Asset identifiers must be unique.");
    for (const role of ["reference", "front", "back"]) {
      if (item.assets.filter((a) => a.role === role).length !== 1)
        issue(`Add exactly one ${role} photo.`);
    }
    if (item.declaration === "no-known-flaws" && item.flaws.length)
      issue("A no-known-flaws declaration cannot contain declared flaws.");
    if (item.declaration === "declared-flaws" && !item.flaws.length)
      issue(
        "Add a declared issue with a close-up, or explicitly declare no known flaws.",
      );
    if (new Set(item.flaws.map((f) => f.id)).size !== item.flaws.length)
      issue("Issue identifiers must be unique.");
    for (const flaw of item.flaws) {
      if (!ids.has(flaw.sourceAssetId))
        issue("An issue points to a missing source photo.");
      for (const closeup of flaw.closeupAssetIds) {
        if (!item.assets.some((a) => a.id === closeup && a.role === "closeup"))
          issue("Every declared issue needs its linked close-up photo.");
      }
      if (
        flaw.region &&
        (flaw.region.x + flaw.region.width > 1 ||
          flaw.region.y + flaw.region.height > 1)
      )
        issue("Source markers must remain inside the source image.");
    }
  });
export type Asset = z.infer<typeof assetSchema>;
export type Item = z.infer<typeof itemSchema>;
export type Flaw = z.infer<typeof flawSchema>;
export type AssetData = Record<string, Uint8Array>;
export const decisionSchema = z.enum([
  "unreviewed",
  "acceptable",
  "ask-seller",
  "skip",
]);
export type Decision = z.infer<typeof decisionSchema>;
export const reviewSchema = z
  .object({
    itemDigest: digestSchema,
    decisions: z.record(id, decisionSchema),
    notes: z.string().max(3000),
    disclosureVersion: z.literal(DISCLOSURE_VERSION),
  })
  .strict();
export type Review = z.infer<typeof reviewSchema>;
export const previewSchema = z
  .object({
    provider: z.literal("YouCam Clothes VTO V3"),
    mode: z.enum(["recorded-example", "live"]),
    itemDigest: digestSchema,
    referenceDigest: digestSchema,
    shopperDigest: digestSchema,
    resultDigest: digestSchema,
    createdAt: z.iso.datetime(),
    mime: z.enum(["image/jpeg", "image/png"]),
    disclosureVersion: z.literal(DISCLOSURE_VERSION),
    reusedFromItemDigest: digestSchema.optional(),
  })
  .strict();
export type Preview = z.infer<typeof previewSchema>;
export type Bundle = {
  item: Item;
  assets: AssetData;
  review: Review;
  preview?: Preview;
  result?: Uint8Array;
};

export function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  return (
    "{" +
    Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, v]) => JSON.stringify(key) + ":" + canonical(v))
      .join(",") +
    "}"
  );
}
export async function sha256(bytes: Uint8Array | string): Promise<string> {
  const input =
    typeof bytes === "string"
      ? new TextEncoder().encode(bytes)
      : new Uint8Array(bytes);
  const digest = await crypto.subtle.digest("SHA-256", input);
  return Array.from(new Uint8Array(digest), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}
export async function sealItem(
  input: Omit<Item, "contentDigest">,
): Promise<Item> {
  return itemSchema.parse({
    ...input,
    contentDigest: await sha256(canonical(input)),
  });
}
export function freshReview(item: Item): Review {
  return {
    itemDigest: item.contentDigest,
    decisions: Object.fromEntries(item.flaws.map((f) => [f.id, "unreviewed"])),
    notes: "",
    disclosureVersion: DISCLOSURE_VERSION,
  };
}
export function referenceOf(item: Item): Asset {
  return item.assets.find((a) => a.role === "reference")!;
}
export function canReusePreview(item: Item, preview: Preview): boolean {
  return referenceOf(item).digest === preview.referenceDigest;
}

const admissionAsset = assetSchema.omit({
  description: true,
  origin: true,
  transformations: true,
});
export const admissionSchema = z
  .object({
    schemaVersion: z.literal(1),
    itemId: id,
    revision: z.number().int().positive(),
    category: z.literal("upper_body"),
    contentDigest: digestSchema,
    declaration: z.enum(["declared-flaws", "no-known-flaws"]),
    assets: z.array(admissionAsset).min(3).max(20),
    flaws: z
      .array(
        z
          .object({
            id,
            sourceAssetId: id,
            closeupAssetIds: z.array(id).min(1).max(4),
          })
          .strict(),
      )
      .max(12),
  })
  .strict()
  .superRefine((item, ctx) => {
    const issue = (message: string) =>
      ctx.addIssue({ code: "custom", message });
    if (new Set(item.assets.map((a) => a.id)).size !== item.assets.length)
      issue("Asset identifiers must be unique.");
    for (const role of ["reference", "front", "back"])
      if (item.assets.filter((a) => a.role === role).length !== 1)
        issue("Required source view is missing or ambiguous.");
    if (
      (item.declaration === "declared-flaws" && !item.flaws.length) ||
      (item.declaration === "no-known-flaws" && item.flaws.length)
    )
      issue("Condition declaration disagrees with the issue list.");
    if (new Set(item.flaws.map((f) => f.id)).size !== item.flaws.length)
      issue("Issue identifiers must be unique.");
    for (const flaw of item.flaws) {
      if (!item.assets.some((a) => a.id === flaw.sourceAssetId))
        issue("Missing source reference.");
      for (const closeup of flaw.closeupAssetIds)
        if (!item.assets.some((a) => a.id === closeup && a.role === "closeup"))
          issue("Missing linked close-up.");
    }
  });
export function previewAdmission(item: Item): z.infer<typeof admissionSchema> {
  return admissionSchema.parse({
    schemaVersion: item.schemaVersion,
    itemId: item.itemId,
    revision: item.revision,
    category: item.category,
    contentDigest: item.contentDigest,
    declaration: item.declaration,
    assets: item.assets.map(
      ({ description, origin, transformations, ...metadata }) => metadata,
    ),
    flaws: item.flaws.map(({ id, sourceAssetId, closeupAssetIds }) => ({
      id,
      sourceAssetId,
      closeupAssetIds,
    })),
  });
}

export async function verifyBundle(bundle: Bundle): Promise<void> {
  const item = itemSchema.parse(bundle.item);
  const { contentDigest, ...content } = item;
  if ((await sha256(canonical(content))) !== contentDigest)
    throw new Error("The item record does not agree with its digest.");
  if (Object.keys(bundle.assets).length !== item.assets.length)
    throw new Error("The package has extra or missing source images.");
  for (const asset of item.assets) {
    const bytes = bundle.assets[asset.id];
    if (
      !bytes ||
      bytes.length !== asset.byteLength ||
      (await sha256(bytes)) !== asset.digest
    )
      throw new Error("A source image is missing or differs from its record.");
    const actual = imageDimensions(bytes);
    if (
      actual.mime !== asset.mime ||
      actual.width !== asset.width ||
      actual.height !== asset.height
    )
      throw new Error(
        "Source image dimensions or format disagree with the record.",
      );
  }
  const review = reviewSchema.parse(bundle.review);
  if (
    review.itemDigest !== contentDigest ||
    Object.keys(review.decisions).some(
      (key) => !item.flaws.some((f) => f.id === key),
    )
  )
    throw new Error("Buyer decisions belong to a different item revision.");
  if (item.flaws.some((f) => !(f.id in review.decisions)))
    throw new Error("A declared issue has no review state.");
  if (!!bundle.preview !== !!bundle.result)
    throw new Error("A preview needs both its record and actual image bytes.");
  if (bundle.preview && bundle.result) {
    const preview = previewSchema.parse(bundle.preview);
    if (preview.itemDigest !== contentDigest || !canReusePreview(item, preview))
      throw new Error("The preview belongs to a different item revision.");
    const actual = imageDimensions(bundle.result);
    if (
      actual.mime !== preview.mime ||
      (await sha256(bundle.result)) !== preview.resultDigest
    )
      throw new Error("The preview image differs from its saved record.");
  }
}

/** Bounded header inspection, supplemented by actual browser/Sharp decoding at upload boundaries. */
export function imageDimensions(bytes: Uint8Array): {
  mime: "image/jpeg" | "image/png";
  width: number;
  height: number;
} {
  if (bytes.length < 24 || bytes.length > MAX_ASSET_BYTES)
    throw new Error("Use a JPEG or PNG image below 6 MB.");
  const u32 = (n: number) =>
    new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(n);
  let width = 0,
    height = 0,
    mime: "image/jpeg" | "image/png";
  if (
    [137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => bytes[i] === v) &&
    u32(12) === 0x49484452
  ) {
    width = u32(16);
    height = u32(20);
    mime = "image/png";
  } else if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) {
    mime = "image/jpeg";
    let offset = 2;
    while (offset + 9 < bytes.length) {
      if (bytes[offset++] !== 255) throw new Error("Invalid JPEG marker.");
      while (bytes[offset] === 255) offset++;
      const marker = bytes[offset++];
      if (marker === 0xda || marker === 0xd9) break;
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      const length = bytes[offset] * 256 + bytes[offset + 1];
      if (length < 2 || offset + length > bytes.length)
        throw new Error("Invalid JPEG segment.");
      if (
        [
          0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd,
          0xce, 0xcf,
        ].includes(marker)
      ) {
        height = bytes[offset + 3] * 256 + bytes[offset + 4];
        width = bytes[offset + 5] * 256 + bytes[offset + 6];
        break;
      }
      offset += length;
    }
  } else throw new Error("Only real JPEG and PNG files are supported.");
  if (width < 64 || height < 64 || width > 4096 || height > 4096)
    throw new Error("Use images between 64 and 4096 pixels per side.");
  return { mime, width, height };
}
