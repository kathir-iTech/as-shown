import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import sharp from "sharp";
import { put, get, del, list } from "@vercel/blob";
import { z } from "zod";
import { importPackage, exportPackage } from "../packages/archive";
import {
  type Bundle,
  type Asset,
  sealItem,
  freshReview,
  sha256,
  imageDimensions,
} from "../domain/model";
import {
  AppError,
  sameOrigin,
  session,
  boundedBytes,
  json,
  readJson,
} from "./youcam";
import { intentSchema, redisCommand, ledgerConfigured } from "./ledger";

export const SHARE_LIMITS = {
  archive: 3_500_000,
  lifetimeStorage: 100_000_000,
  lifetimeTransfer: 250_000_000,
  lifetimePublications: 60,
  duration: 24 * 60 * 60 * 1000,
};
const metadataSchema = z.object({
  id: z.string().regex(/^[a-f0-9]{40}$/),
  state: z.enum(["pending", "ready", "revoked", "failed"]),
  sourceDigest: z.string().length(64),
  digest: z.string().length(64).optional(),
  expiresAt: z.number(),
  bytes: z.number().int().positive(),
  title: z.string().max(120),
  revision: z.number().int().positive(),
});
type ShareMetadata = z.infer<typeof metadataSchema>;
const key = (id: string) => `asshown:v4:share:${id}`;
const path = (id: string) => `seller-records/${id}.zip`;
export function sharingConfigured() {
  return (
    process.env.ASSHOWN_SHARE_ENABLED === "true" &&
    !!(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID) &&
    ledgerConfigured()
  );
}
function requireSharing() {
  if (!sharingConfigured())
    throw new AppError(
      "SHARING_PAUSED",
      "Hosted seller links are paused. Export a seller-only record to share instead.",
      503,
    );
}
function opaque(value: string) {
  const secret = process.env.ASSHOWN_TOKEN_SECRET;
  if (!secret || secret.length < 43)
    throw new AppError("SHARING_PAUSED", "Publishing is not configured.", 503);
  return createHmac("sha256", secret)
    .update("asshown:sharing:" + value)
    .digest("base64url");
}
function validCapability(
  id: string,
  token: string,
  purpose: "read" | "manage",
) {
  const expected = Buffer.from(opaque(purpose + ":" + id));
  const actual = Buffer.from(token);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
function publicReceipt(metadata: ShareMetadata) {
  return {
    id: metadata.id,
    title: metadata.title,
    revision: metadata.revision,
    digest: metadata.digest,
    expiresAt: metadata.expiresAt,
    readToken: opaque("read:" + metadata.id),
    manageToken: opaque("manage:" + metadata.id),
  };
}
export const SHARE_RESERVE_SCRIPT = `
local existing = redis.call('GET', KEYS[1])
if existing then return {'existing', existing} end
local bytes = tonumber(ARGV[2])
if tonumber(redis.call('GET', KEYS[2]) or '0') + bytes > tonumber(ARGV[3]) then return {'quota'} end
if tonumber(redis.call('GET', KEYS[3]) or '0') >= 60 then return {'quota'} end
if tonumber(redis.call('GET', KEYS[4]) or '0') >= 3 or tonumber(redis.call('GET', KEYS[5]) or '0') >= 10 then return {'rate'} end
redis.call('SET', KEYS[1], ARGV[1], 'EX', 172800)
redis.call('INCRBY', KEYS[2], bytes)
redis.call('INCR', KEYS[3])
redis.call('INCR', KEYS[4]); redis.call('EXPIRE', KEYS[4], 7200)
redis.call('INCR', KEYS[5]); redis.call('EXPIRE', KEYS[5], 7200)
return {'reserved'}
`;
export const SHARE_READ_SCRIPT = `
local value = redis.call('GET', KEYS[1])
if not value then return {'missing'} end
local metadata = cjson.decode(value)
if metadata.state ~= 'ready' or metadata.expiresAt <= tonumber(ARGV[1]) then return {'expired'} end
if tonumber(redis.call('GET', KEYS[2]) or '0') + metadata.bytes > tonumber(ARGV[2]) then return {'quota'} end
redis.call('INCRBY', KEYS[2], metadata.bytes)
return {'ready', value}
`;

/** Publication makes an explicitly new revision with metadata-free photo copies. */
export async function publicationCopy(bundle: Bundle): Promise<Bundle> {
  if (
    bundle.item.declaration === "not-supplied" ||
    bundle.preview ||
    bundle.result ||
    bundle.review.notes ||
    Object.values(bundle.review.decisions).some((v) => v !== "unreviewed")
  )
    throw new AppError(
      "SELLER_ONLY_REQUIRED",
      "Publish a seller-only package. Personal previews, notes and buyer choices cannot be published.",
    );
  const bytes: Bundle["assets"] = {};
  const assets: Asset[] = [];
  for (const a of bundle.item.assets) {
    const prepared = new Uint8Array(
      await sharp(bundle.assets[a.id], {
        limitInputPixels: 40_000_000,
        failOn: "warning",
      })
        .rotate()
        .jpeg({ quality: a.role === "preview-reference" ? 88 : 95 })
        .toBuffer(),
    );
    const next: Asset = {
      ...a,
      ...imageDimensions(prepared),
      byteLength: prepared.length,
      digest: await sha256(prepared),
      transformations: [
        ...a.transformations.slice(-4),
        "Publication copy: orientation applied, metadata removed, JPEG encoded; source record is a separate revision.",
      ],
      sourceDigest: a.digest,
    };
    if (next.role === "preview-reference" && next.byteLength > 1_200_000)
      throw new AppError(
        "SHARE_PREPARATION",
        "The prepared reference exceeds its limit after privacy processing. Keep the local package or prepare a smaller reference.",
      );
    assets.push(next);
    bytes[next.id] = prepared;
  }
  const originalReference = assets.find((a) => a.role === "reference")!;
  const prepared = assets.find((a) => a.role === "preview-reference");
  if (prepared) prepared.sourceDigest = originalReference.digest;
  const { contentDigest: _digest, ...content } = bundle.item;
  const item = await sealItem({
    ...content,
    schemaVersion: bundle.item.schemaVersion === 3 ? 3 : 2,
    revision: bundle.item.revision + 1,
    createdAt: new Date().toISOString(),
    assets,
  });
  return { item, assets: bytes, review: freshReview(item) };
}
export async function publishSeller(request: Request): Promise<Response> {
  sameOrigin(request);
  requireSharing();
  const owner = session(request);
  if (
    request.headers.get("x-asshown-publication-consent") !==
    "seller-copy-2026-10-21"
  )
    throw new AppError(
      "PUBLICATION_CONSENT",
      "Approve publication of the seller photographs first.",
    );
  const intent = intentSchema.parse(request.headers.get("idempotency-key"));
  const input = await boundedBytes(request, SHARE_LIMITS.archive);
  const bundle = await importPackage(input);
  const id = createHmac("sha256", opaque(owner.sid))
    .update(intent)
    .digest("hex")
    .slice(0, 40);
  const old = await redisCommand(["GET", key(id)]);
  if (typeof old === "string") {
    const metadata = metadataSchema.parse(JSON.parse(old));
    if (metadata.sourceDigest !== bundle.item.contentDigest)
      throw new AppError(
        "PUBLICATION_CONFLICT",
        "This publication request belongs to another record.",
        409,
      );
    if (metadata.state === "ready" && metadata.expiresAt > Date.now())
      return json({ ...publicReceipt(metadata), recovered: true });
    throw new AppError(
      "PUBLICATION_PENDING",
      "This publication was already submitted. Its link is not available; keep the seller package and do not repeat the request automatically.",
      409,
    );
  }
  const copy = await publicationCopy(bundle);
  const archive = await exportPackage(copy, "item");
  if (archive.length > SHARE_LIMITS.archive)
    throw new AppError(
      "SHARE_SIZE",
      "This seller record is above the 3.5 MB hosted-link limit. Use the full local package, or create a smaller source record.",
      413,
    );
  const metadata: ShareMetadata = {
    id,
    state: "pending",
    sourceDigest: bundle.item.contentDigest,
    digest: copy.item.contentDigest,
    expiresAt: Date.now() + SHARE_LIMITS.duration,
    bytes: archive.length,
    title: copy.item.title,
    revision: copy.item.revision,
  };
  const hour = Math.floor(Date.now() / 3_600_000);
  const network =
    process.env.VERCEL === "1"
      ? request.headers.get("x-vercel-forwarded-for") || owner.sid
      : owner.sid;
  const reserved = await redisCommand([
    "EVAL",
    SHARE_RESERVE_SCRIPT,
    5,
    key(id),
    "asshown:v4:share-storage",
    "asshown:v4:share-count",
    `asshown:v4:share-session:${hour}:${opaque(owner.sid)}`,
    `asshown:v4:share-network:${hour}:${opaque(network.slice(0, 256))}`,
    JSON.stringify(metadata),
    archive.length,
    SHARE_LIMITS.lifetimeStorage,
  ]);
  if (!Array.isArray(reserved))
    throw new AppError(
      "SHARING_PAUSED",
      "Publication could not be admitted.",
      503,
    );
  if (reserved[0] === "existing")
    throw new AppError(
      "PUBLICATION_PENDING",
      "The same publication is already in progress. Keep this request; no second upload was started.",
      409,
    );
  if (reserved[0] !== "reserved")
    throw new AppError(
      "SHARE_LIMIT",
      "The free hosted-link allowance is currently reached. Local packages remain available.",
      429,
    );
  try {
    await put(path(id), Buffer.from(archive), {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: false,
      contentType: "application/zip",
    });
    metadata.state = "ready";
    await redisCommand(["SET", key(id), JSON.stringify(metadata), "KEEPTTL"]);
    return json(publicReceipt(metadata));
  } catch {
    throw new AppError(
      "PUBLICATION_UNCONFIRMED",
      "The seller link could not be confirmed. No automatic upload retry was made. Your local record is safe.",
      503,
    );
  }
}
const accessSchema = z
  .object({ id: metadataSchema.shape.id, token: z.string().min(40).max(90) })
  .strict();
export async function readSeller(request: Request): Promise<Response> {
  sameOrigin(request);
  requireSharing();
  const input = accessSchema.parse(await readJson(request, 500));
  if (!validCapability(input.id, input.token, "read"))
    throw new AppError(
      "SHARE_UNAVAILABLE",
      "This seller link is invalid or unavailable.",
      404,
    );
  const result = await redisCommand([
    "EVAL",
    SHARE_READ_SCRIPT,
    2,
    key(input.id),
    "asshown:v4:share-transfer",
    Date.now(),
    SHARE_LIMITS.lifetimeTransfer,
  ]);
  if (!Array.isArray(result) || result[0] !== "ready")
    throw new AppError(
      "SHARE_UNAVAILABLE",
      "This seller link expired, was revoked, or reached its free allowance. Ask the seller for an exported package.",
      410,
    );
  const blob = await get(path(input.id), {
    access: "private",
    useCache: false,
  });
  if (!blob || blob.statusCode !== 200)
    throw new AppError(
      "SHARE_UNAVAILABLE",
      "The seller record is unavailable. Ask the seller for its package.",
      410,
    );
  return new Response(blob.stream, {
    headers: {
      "Content-Type": "application/zip",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
export async function revokeSeller(request: Request): Promise<Response> {
  sameOrigin(request);
  requireSharing();
  const input = accessSchema.parse(await readJson(request, 500));
  if (!validCapability(input.id, input.token, "manage"))
    throw new AppError(
      "SHARE_UNAVAILABLE",
      "This management link is invalid.",
      404,
    );
  const value = await redisCommand(["GET", key(input.id)]);
  if (typeof value !== "string") return json({ revoked: true });
  const metadata = metadataSchema.parse(JSON.parse(value));
  metadata.state = "revoked";
  await redisCommand([
    "SET",
    key(input.id),
    JSON.stringify(metadata),
    "KEEPTTL",
  ]);
  try {
    await del(path(input.id));
  } catch {
    return json({ revoked: true, fileDeletionPending: true });
  }
  return json({ revoked: true, fileDeletionPending: false });
}
export async function cleanSellerRecords(request: Request): Promise<Response> {
  const expected = process.env.CRON_SECRET;
  const actual = request.headers.get("authorization") || "";
  if (
    !expected ||
    actual.length !== expected.length + 7 ||
    !timingSafeEqual(Buffer.from(actual), Buffer.from("Bearer " + expected))
  )
    throw new AppError("UNAUTHORIZED", "This operation is unavailable.", 401);
  requireSharing();
  const blobs = await list({ prefix: "seller-records/", limit: 100 });
  let removed = 0;
  for (const blob of blobs.blobs)
    if (
      Date.now() - new Date(blob.uploadedAt).getTime() >=
      SHARE_LIMITS.duration
    ) {
      await del(blob.url);
      removed++;
    }
  return json({ removed });
}
