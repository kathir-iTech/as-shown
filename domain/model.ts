import { z } from "zod";

export const DISCLOSURE_VERSION = "asshown-2026-10-20";
export const MAX_ASSET_BYTES = 12_000_000;
export const MAX_INPUT_BYTES = 1_200_000;
export const categorySchema = z.enum([
  "upper_body",
  "lower_body",
  "full_body",
  "shoes",
]);
export type Category = z.infer<typeof categorySchema>;
export const CATEGORY_LABELS: Record<Category, string> = {
  upper_body: "Tops & layers",
  lower_body: "Bottoms",
  full_body: "Dresses & full looks",
  shoes: "Shoes",
};
export const CATEGORY_GUIDANCE: Record<Category, string> = {
  upper_body:
    "One adult, facing forward. Keep your torso visible, without bags or objects covering it.",
  lower_body:
    "Use a full-length adult photo with both legs and feet visible. No bags or objects covering the outfit.",
  full_body:
    "One adult, head to feet, with arms away from the body. Keep the whole outfit visible.",
  shoes:
    "One full-length adult with both feet clearly visible. Use a reference of one matching pair of shoes.",
};
const versionSchema = z.union([z.literal(1), z.literal(2), z.literal(3)]);
const declarationSchema = z.enum([
  "declared-flaws",
  "no-known-flaws",
  "not-supplied",
]);
const id = z.string().regex(/^[a-zA-Z0-9-]{1,80}$/);
export const digestSchema = z.string().regex(/^[a-f0-9]{64}$/);
export const assetSchema = z
  .object({
    id,
    role: z.enum([
      "reference",
      "front",
      "back",
      "closeup",
      "preview-reference",
    ]),
    mime: z.enum(["image/jpeg", "image/png"]),
    width: z.number().int().min(64).max(8192),
    height: z.number().int().min(64).max(8192),
    byteLength: z.number().int().positive().max(MAX_ASSET_BYTES),
    digest: digestSchema,
    description: z.string().min(1).max(240),
    origin: z.enum(["seller-upload", "synthetic-demo", "shopper-upload"]),
    transformations: z.array(z.string().max(200)).max(5),
    sourceDigest: digestSchema.optional(),
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
    schemaVersion: versionSchema,
    itemId: id,
    revision: z.number().int().min(1).max(10000),
    title: z.string().trim().min(1).max(120),
    description: z.string().max(1500),
    category: categorySchema,
    createdAt: z.iso.datetime(),
    declaration: declarationSchema,
    assets: z.array(assetSchema).min(1).max(20),
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
    if (
      item.schemaVersion !== 3 &&
      (item.category !== "upper_body" || item.declaration === "not-supplied")
    )
      issue("Quick Try and additional categories require a version 3 record.");
    const quick = item.declaration === "not-supplied";
    if (
      quick &&
      (item.flaws.length ||
        item.assets.some(
          (a) => !["reference", "preview-reference"].includes(a.role),
        ))
    )
      issue("A Quick Try cannot claim seller condition evidence.");
    for (const role of quick ? ["reference"] : ["reference", "front", "back"]) {
      if (item.assets.filter((a) => a.role === role).length !== 1)
        issue(`Add exactly one ${role} photo.`);
    }
    const prepared = item.assets.filter((a) => a.role === "preview-reference");
    if (prepared.length > 1 || (prepared.length && item.schemaVersion === 1))
      issue("Prepared preview inputs require a version 2 or 3 record.");
    if (
      prepared.some(
        (a) =>
          a.sourceDigest !==
            item.assets.find((source) => source.role === "reference")?.digest ||
          a.byteLength > MAX_INPUT_BYTES ||
          a.width > 2048 ||
          a.height > 2048,
      )
    )
      issue(
        "The prepared preview must match its original reference and input limits.",
      );
    if (item.declaration === "no-known-flaws" && item.flaws.length)
      issue("A no-known-flaws declaration cannot contain declared flaws.");
    if (item.declaration === "declared-flaws" && !item.flaws.length)
      issue(
        "Add a declared issue with a close-up, or explicitly declare no known flaws.",
      );
    if (new Set(item.flaws.map((f) => f.id)).size !== item.flaws.length)
      issue("Issue identifiers must be unique.");
    for (const flaw of item.flaws) {
      if (
        !item.assets.some(
          (a) =>
            a.id === flaw.sourceAssetId &&
            (a.role === "front" || a.role === "back"),
        )
      )
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
    category: categorySchema.optional(),
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
  return (
    item.assets.find((a) => a.role === "preview-reference") ||
    item.assets.find((a) => a.role === "reference")!
  );
}
export function canReusePreview(item: Item, preview: Preview): boolean {
  return (
    referenceOf(item).digest === preview.referenceDigest &&
    item.category === (preview.category || "upper_body")
  );
}

const admissionAsset = assetSchema.omit({
  description: true,
  origin: true,
  transformations: true,
});
export const admissionSchema = z
  .object({
    schemaVersion: versionSchema,
    itemId: id,
    revision: z.number().int().positive(),
    category: categorySchema,
    contentDigest: digestSchema,
    declaration: declarationSchema,
    assets: z.array(admissionAsset).min(1).max(20),
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
    if (
      item.schemaVersion !== 3 &&
      (item.category !== "upper_body" || item.declaration === "not-supplied")
    )
      issue("Quick Try and additional categories require a version 3 record.");
    const quick = item.declaration === "not-supplied";
    if (
      quick &&
      (item.flaws.length ||
        item.assets.some(
          (a) => !["reference", "preview-reference"].includes(a.role),
        ))
    )
      issue("Quick Try cannot claim seller condition evidence.");
    for (const role of quick ? ["reference"] : ["reference", "front", "back"])
      if (item.assets.filter((a) => a.role === role).length !== 1)
        issue("Required source view is missing or ambiguous.");
    const prepared = item.assets.filter((a) => a.role === "preview-reference");
    if (
      prepared.length > 1 ||
      (prepared.length && item.schemaVersion === 1) ||
      prepared.some(
        (a) =>
          a.sourceDigest !==
            item.assets.find((source) => source.role === "reference")?.digest ||
          a.byteLength > MAX_INPUT_BYTES ||
          a.width > 2048 ||
          a.height > 2048,
      )
    )
      issue("Prepared preview input is invalid.");
    if (
      (item.declaration === "declared-flaws" && !item.flaws.length) ||
      (item.declaration === "no-known-flaws" && item.flaws.length)
    )
      issue("Condition declaration disagrees with the issue list.");
    if (new Set(item.flaws.map((f) => f.id)).size !== item.flaws.length)
      issue("Issue identifiers must be unique.");
    for (const flaw of item.flaws) {
      if (
        !item.assets.some(
          (a) =>
            a.id === flaw.sourceAssetId &&
            (a.role === "front" || a.role === "back"),
        )
      )
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
    throw new Error("Use a JPEG or PNG image below 12 MB.");
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
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 64 ||
    height < 64 ||
    width > 8192 ||
    height > 8192 ||
    width * height > 40_000_000
  )
    throw new Error(
      "Use images between 64 and 8192 pixels per side, below 40 megapixels.",
    );
  return { mime, width, height };
}
