import "server-only";
import sharp from "sharp";
import {
  createHash,
  createHmac,
  timingSafeEqual,
  randomUUID,
} from "node:crypto";
import { z } from "zod";
import {
  LedgerError,
  ledgerConfigured,
  intentSchema,
  reserveRun,
  finishRun,
  recoverRun,
} from "./ledger";
import {
  admissionSchema,
  imageDimensions,
  MAX_INPUT_BYTES,
  DISCLOSURE_VERSION,
} from "../domain/model";

const ORIGIN = "https://yce-api-01.makeupar.com";
const TASK = "/s2s/v2.0/task/cloth-v3";
export class AppError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export const json = (body: unknown, status = 200) =>
  Response.json(body, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
export function safeError(error: unknown): Response {
  const known = error instanceof AppError || error instanceof LedgerError;
  // Log classifications only; never provider bodies, credentials, image data, tokens, or notes.
  console.error(
    JSON.stringify({
      event: "preview-request-stopped",
      code: known ? error.code : "VALIDATION_FAILED",
    }),
  );
  return json(
    {
      code: known ? error.code : "VALIDATION_FAILED",
      message: known
        ? error.message
        : "The supplied record or image could not be validated. Check its format and size.",
    },
    known ? error.status : 400,
  );
}
export function sameOrigin(request: Request): void {
  if (request.headers.get("origin") !== new URL(request.url).origin)
    throw new AppError(
      "ORIGIN_REJECTED",
      "Use the preview from the As-Shown website.",
      403,
    );
  if (
    request.headers.get("sec-fetch-site") &&
    request.headers.get("sec-fetch-site") !== "same-origin"
  )
    throw new AppError(
      "ORIGIN_REJECTED",
      "Cross-site requests are not admitted.",
      403,
    );
}
export async function boundedBytes(
  response: Request | Response,
  limit: number,
): Promise<Uint8Array> {
  const length = response.headers.get("content-length");
  if (length && (!/^\d+$/.test(length) || Number(length) > limit))
    throw new AppError(
      "PAYLOAD_LIMIT",
      "This request exceeds the supported size.",
      413,
    );
  if (!response.body)
    throw new AppError("EMPTY_BODY", "No content was supplied.");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > limit) {
        await reader.cancel();
        throw new AppError(
          "PAYLOAD_LIMIT",
          "This request exceeds the supported size.",
          413,
        );
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const result = new Uint8Array(size);
  let pos = 0;
  for (const chunk of chunks) {
    result.set(chunk, pos);
    pos += chunk.length;
  }
  return result;
}
export async function readJson(
  request: Request,
  limit = 40000,
): Promise<unknown> {
  return JSON.parse(
    new TextDecoder().decode(await boundedBytes(request, limit)),
  );
}
const hash = (bytes: Uint8Array | string) =>
  createHash("sha256").update(bytes).digest("hex");
function secret(): string {
  const value = process.env.ASSHOWN_TOKEN_SECRET;
  if (!value || value.length < 43)
    throw new AppError(
      "SERVER_NOT_CONFIGURED",
      "Live previews are not configured. Explore the recorded example instead.",
      503,
    );
  return value;
}
const claimsSchema = z
  .object({
    type: z.enum(["session", "run"]),
    sid: z.string().uuid(),
    exp: z.number().int(),
    taskId: z.string().max(1000).optional(),
    itemDigest: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
    referenceDigest: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
    shopperDigest: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
    createdAt: z.string().optional(),
  })
  .strict();
type Claims = z.infer<typeof claimsSchema>;
export function sign(claims: Claims): string {
  const payload = Buffer.from(
    JSON.stringify(claimsSchema.parse(claims)),
  ).toString("base64url");
  return (
    payload +
    "." +
    createHmac("sha256", secret()).update(payload).digest("base64url")
  );
}
export function verify(token: string, type: Claims["type"]): Claims {
  if (token.length > 4000)
    throw new AppError(
      "INVALID_TOKEN",
      "This preview session is invalid or expired.",
      401,
    );
  const [payload, signature, ...extra] = token.split(".");
  if (!payload || !signature || extra.length)
    throw new AppError(
      "INVALID_TOKEN",
      "This preview session is invalid or expired.",
      401,
    );
  const expected = Buffer.from(
    createHmac("sha256", secret()).update(payload).digest("base64url"),
  );
  const actual = Buffer.from(signature);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
    throw new AppError(
      "INVALID_TOKEN",
      "This preview session is invalid or expired.",
      401,
    );
  let claims: Claims;
  try {
    claims = claimsSchema.parse(
      JSON.parse(Buffer.from(payload, "base64url").toString("utf8")),
    );
  } catch {
    throw new AppError(
      "INVALID_TOKEN",
      "This preview session is invalid or expired.",
      401,
    );
  }
  if (claims.type !== type || claims.exp < Date.now())
    throw new AppError(
      "TOKEN_EXPIRED",
      "This preview session has expired. A completed local package still works.",
      401,
    );
  return claims;
}
export const cookieName = "__Host-asshown-session";
function requestCookieName(request: Request) {
  return new URL(request.url).protocol === "https:"
    ? cookieName
    : "asshown-session";
}
export function session(request: Request): Claims {
  const token = request.headers
    .get("cookie")
    ?.split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith(requestCookieName(request) + "="))
    ?.slice(requestCookieName(request).length + 1);
  if (!token)
    throw new AppError(
      "SESSION_REQUIRED",
      "Start a preview session first.",
      401,
    );
  return verify(token, "session");
}
export function sessionResponse(request: Request): Response {
  sameOrigin(request);
  secret();
  let sid: string;
  try {
    sid = session(request).sid;
  } catch {
    sid = randomUUID();
  }
  const token = sign({
    type: "session",
    sid,
    exp: Date.now() + 2 * 60 * 60 * 1000,
  });
  const response = json({ ready: true });
  response.headers.set(
    "Set-Cookie",
    `${requestCookieName(request)}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=7200${new URL(request.url).protocol === "https:" ? "; Secure" : ""}`,
  );
  return response;
}
function configured(): boolean {
  return (
    !!process.env.YOUCAM_API_KEY &&
    !!process.env.ASSHOWN_TOKEN_SECRET &&
    process.env.YOUCAM_ALLOW_GENERATION === "true" &&
    process.env.YOUCAM_PREPAID_ONLY_CONFIRMED === "true"
  );
}
export function capability() {
  return {
    liveEnabled: configured() && ledgerConfigured(),
    durableRequestProtection: ledgerConfigured(),
    provider: "YouCam Clothes VTO V3",
    category: "upper_body",
    categories: ["upper_body", "lower_body", "full_body", "shoes"],
    disclosureVersion: DISCLOSURE_VERSION,
  };
}
async function api(path: string, method = "GET", body?: unknown): Promise<any> {
  if (
    !process.env.YOUCAM_API_KEY ||
    (process.env.YOUCAM_API_BASE_URL || ORIGIN) !== ORIGIN
  )
    throw new AppError(
      "SERVER_NOT_CONFIGURED",
      "Live previews are not configured.",
      503,
    );
  let response: Response;
  try {
    response = await fetch(ORIGIN + path, {
      method,
      headers: {
        Authorization: `Bearer ${process.env.YOUCAM_API_KEY.trim()}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(25000),
    });
  } catch {
    throw new AppError(
      method === "POST" && path === TASK
        ? "SUBMISSION_UNKNOWN"
        : "PROVIDER_UNREACHABLE",
      method === "POST" && path === TASK
        ? "We could not confirm whether your preview started. Check this request again; your inspection record is still available."
        : "YouCam could not be reached. A known task can be checked again without recreating it.",
      502,
    );
  }
  if (!response.ok) {
    if (
      method === "POST" &&
      path === TASK &&
      ![400, 401, 403, 422, 429].includes(response.status)
    )
      throw new AppError(
        "SUBMISSION_UNKNOWN",
        "We could not confirm whether your preview started. Check this request again before starting another preview.",
        502,
      );
    throw new AppError(
      `PROVIDER_${response.status}`,
      response.status === 429
        ? "YouCam is busy. Check this known task again later."
        : "YouCam rejected this request. No automatic generation retry was made.",
      response.status === 429 ? 429 : 502,
    );
  }
  let payload: any;
  try {
    payload = JSON.parse(
      new TextDecoder().decode(await boundedBytes(response, 150000)),
    );
  } catch {
    throw new AppError(
      path === TASK ? "SUBMISSION_UNKNOWN" : "INVALID_PROVIDER_RESPONSE",
      "The provider response could not be read. Do not recreate a submitted task.",
      502,
    );
  }
  if (payload.status !== 200)
    throw new AppError(
      path === TASK ? "SUBMISSION_UNKNOWN" : "INVALID_PROVIDER_RESPONSE",
      "YouCam did not confirm the operation. No automatic retry was made.",
      502,
    );
  return payload;
}
async function authorizeBudget(): Promise<void> {
  if (!configured())
    throw new AppError(
      "LIVE_PAUSED",
      "Live previews are paused. The recorded example and your local records remain available.",
      503,
    );
  const seen = new Set<string>();
  let token: string | undefined;
  const matches: number[] = [];
  for (let page = 0; page < 50; page++) {
    const params = new URLSearchParams({ page_size: "20" });
    if (token) params.set("starting_token", token);
    const p = await api("/s2s/v2.0/credit/feature-cost?" + params);
    if (!Array.isArray(p.result?.skus))
      throw new AppError(
        "COST_UNVERIFIED",
        "Current preview pricing could not be verified.",
        503,
      );
    for (const sku of p.result.skus) {
      let url: URL;
      try {
        url = new URL(sku.run_task_url);
      } catch {
        continue;
      }
      if (url.origin === ORIGIN && url.pathname === TASK) {
        if (
          sku.unit !== "result_image" ||
          sku.proc_unit !== 1 ||
          !Number.isFinite(sku.amount)
        )
          throw new AppError(
            "COST_UNVERIFIED",
            "Preview pricing has changed; generation is paused.",
            503,
          );
        matches.push(sku.amount);
      }
    }
    token = p.result.next_token;
    if (!token) break;
    if (typeof token !== "string" || seen.has(token) || page === 49)
      throw new AppError(
        "COST_UNVERIFIED",
        "Pricing pagination could not be verified.",
        503,
      );
    seen.add(token);
  }
  if (matches.length !== 1 || matches[0] <= 0 || matches[0] > 2)
    throw new AppError(
      "COST_UNVERIFIED",
      "The two-unit preview allowance could not be confirmed.",
      503,
    );
  const balance = await api("/s2s/v1.0/client/credit");
  if (!Array.isArray(balance.results))
    throw new AppError(
      "BALANCE_UNVERIFIED",
      "Free-unit availability could not be confirmed.",
      503,
    );
  let active = 0;
  for (const row of balance.results) {
    if (
      !Number.isFinite(row.amount_dec) ||
      !Number.isFinite(row.expiry) ||
      row.amount_dec < 0
    )
      throw new AppError(
        "BALANCE_UNVERIFIED",
        "Free-unit availability could not be confirmed.",
        503,
      );
    if (row.expiry > Date.now()) active += row.amount_dec;
  }
  const reserve = Number(process.env.ASSHOWN_UNIT_RESERVE || 100);
  if (
    !Number.isFinite(reserve) ||
    reserve < 100 ||
    active < reserve + matches[0]
  )
    throw new AppError(
      "CREDITS_RESERVED",
      "Live previews are paused to preserve the remaining free-credit reserve. No paid fallback is enabled.",
      503,
    );
}
function storageUrl(value: unknown): URL {
  if (typeof value !== "string")
    throw new AppError(
      "PROVIDER_STORAGE_REJECTED",
      "The provider did not supply an approved image location.",
      502,
    );
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    !(
      url.hostname === "yce-us.s3-accelerate.amazonaws.com" ||
      /^yce-[a-z0-9-]+\.s3(?:[.-][a-z0-9-]+)*\.amazonaws\.com$/.test(
        url.hostname,
      )
    )
  )
    throw new AppError(
      "PROVIDER_STORAGE_REJECTED",
      "The provider image host requires review.",
      502,
    );
  return url;
}
async function upload(bytes: Uint8Array, role: string): Promise<string> {
  const meta = imageDimensions(bytes);
  const ext = meta.mime === "image/png" ? "png" : "jpg";
  const p = await api("/s2s/v2.0/file", "POST", {
    files: [
      {
        content_type: meta.mime,
        file_name: `${role}.${ext}`,
        file_size: bytes.length,
      },
    ],
  });
  if (!Array.isArray(p.data?.files) || p.data.files.length !== 1)
    throw new AppError(
      "UPLOAD_FAILED",
      "YouCam did not register the input file.",
      502,
    );
  const file = p.data.files[0],
    instruction = file.requests?.[0];
  if (
    typeof file.file_id !== "string" ||
    !file.file_id ||
    file.file_id.length > 1000 ||
    file.requests?.length !== 1 ||
    instruction.method !== "PUT"
  )
    throw new AppError(
      "UPLOAD_FAILED",
      "The provider upload instruction requires review.",
      502,
    );
  const url = storageUrl(instruction.url);
  const headers: Record<string, string> = {};
  for (const [name, value] of Object.entries(instruction.headers || {})) {
    if (
      !/^content-(type|length)$/i.test(name) &&
      !/^x-amz-[a-z0-9-]+$/i.test(name)
    )
      throw new AppError(
        "UPLOAD_FAILED",
        "An upload header requires review.",
        502,
      );
    headers[name] = String(value);
  }
  try {
    const r = await fetch(url, {
      method: "PUT",
      headers,
      body: Buffer.from(bytes),
      redirect: "error",
      signal: AbortSignal.timeout(25000),
    });
    if (!r.ok) throw new Error();
  } catch {
    throw new AppError(
      "UPLOAD_FAILED",
      "Image upload did not complete. No generation task was created.",
      502,
    );
  }
  return file.file_id;
}
async function decodedInput(bytes: Uint8Array): Promise<void> {
  if (bytes.length > MAX_INPUT_BYTES)
    throw new AppError(
      "INPUT_TOO_LARGE",
      "Each live-preview image must be below 1.2 MB.",
      413,
    );
  const dimensions = imageDimensions(bytes);
  if (
    dimensions.width > 4096 ||
    dimensions.height > 4096 ||
    dimensions.width < 128 ||
    dimensions.height < 128
  )
    throw new AppError(
      "INPUT_DIMENSIONS",
      "Prepared preview images must be between 128 and 4096 pixels per side.",
    );
  const info = await sharp(bytes, {
    limitInputPixels: 4096 * 4096,
    failOn: "warning",
  }).metadata();
  if (!["jpeg", "png"].includes(info.format || "") || (info.pages || 1) > 1)
    throw new AppError("UNSUPPORTED_IMAGE", "Use a single-frame JPEG or PNG.");
  // Force full pixel decoding, not only a plausible file header.
  await sharp(bytes, { limitInputPixels: 4096 * 4096, failOn: "warning" })
    .raw()
    .toBuffer();
}
export async function createPreview(request: Request): Promise<Response> {
  sameOrigin(request);
  const owner = session(request);
  const intent = intentSchema.parse(request.headers.get("Idempotency-Key"));
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.startsWith("multipart/form-data;"))
    throw new AppError("FORM_REQUIRED", "Use the preview form.");
  const raw = await boundedBytes(request, 2_800_000);
  const form = await new Response(Buffer.from(raw), {
    headers: { "Content-Type": contentType },
  }).formData();
  if (
    [...form.keys()].length !== 4 ||
    ["item", "consent", "shopper", "reference"].some(
      (k) => form.getAll(k).length !== 1,
    )
  )
    throw new AppError("FORM_REQUIRED", "The preview form is incomplete.");
  // The full record, seller text and annotations never leave the browser. Validate only structural commitments.
  // This does not independently verify the withheld evidence, its truthfulness, or the supplied item digest.
  const item = admissionSchema.parse(JSON.parse(String(form.get("item"))));
  const contentDigest = item.contentDigest;
  const referenceMeta =
    item.assets.find((a) => a.role === "preview-reference") ||
    item.assets.find((a) => a.role === "reference")!;
  const consent = z
    .object({
      affirmative: z.literal(true),
      policyVersion: z.literal(DISCLOSURE_VERSION),
      itemDigest: z.literal(contentDigest),
      approvedAt: z.iso.datetime(),
    })
    .strict()
    .parse(JSON.parse(String(form.get("consent"))));
  const age = Date.now() - Date.parse(consent.approvedAt);
  if (age < -60000 || age > 15 * 60 * 1000)
    throw new AppError(
      "CONSENT_EXPIRED",
      "Review the consent notice again before sending these images.",
    );
  const source = form.get("shopper"),
    reference = form.get("reference");
  if (!(source instanceof File) || !(reference instanceof File))
    throw new AppError("IMAGE_REQUIRED", "Select the two preview images.");
  const sourceBytes = new Uint8Array(await source.arrayBuffer()),
    referenceBytes = new Uint8Array(await reference.arrayBuffer());
  await Promise.all([decodedInput(sourceBytes), decodedInput(referenceBytes)]);
  if (hash(referenceBytes) !== referenceMeta.digest)
    throw new AppError(
      "REFERENCE_CHANGED",
      "The supplied garment image differs from the selected item revision.",
    );
  const reservation = await reserveRun(
    request,
    owner.sid,
    intent,
    [
      contentDigest,
      referenceMeta.digest,
      hash(sourceBytes),
      item.category,
      DISCLOSURE_VERSION,
    ].join(":"),
    configured(),
  );
  if (reservation.existing)
    return json({ ...reservation.existing, recovered: true });
  let submitted = false;
  try {
    await authorizeBudget();
    const sourceId = await upload(sourceBytes, "shopper");
    const referenceId = await upload(referenceBytes, "garment");
    submitted = true;
    const p = await api(TASK, "POST", {
      src_file_id: sourceId,
      ref_file_id: referenceId,
      garment_category: item.category,
      change_shoes: false,
    });
    if (
      typeof p.data?.task_id !== "string" ||
      !p.data.task_id ||
      p.data.task_id.length > 1000
    )
      throw new AppError(
        "SUBMISSION_UNKNOWN",
        "The provider did not return a usable task ID. Do not submit again automatically.",
        502,
      );
    const createdAt = new Date().toISOString();
    const token = sign({
      type: "run",
      sid: owner.sid,
      taskId: p.data.task_id,
      itemDigest: contentDigest,
      referenceDigest: referenceMeta.digest,
      shopperDigest: hash(sourceBytes),
      createdAt,
      exp: Date.now() + 2 * 60 * 60 * 1000,
    });
    const response = {
      state: "running" as const,
      token,
      createdAt,
      shopperDigest: hash(sourceBytes),
      referenceDigest: referenceMeta.digest,
      itemDigest: contentDigest,
    };
    try {
      await finishRun(reservation.key, reservation.entry, "running", response);
    } catch {
      console.error(
        JSON.stringify({
          event: "run-ledger-save-failed",
          code: "KNOWN_TASK_RETURNED",
        }),
      );
    }
    return json(response);
  } catch (error) {
    const knownRejected =
      error instanceof AppError &&
      /^PROVIDER_(400|401|403|422|429)$/.test(error.code);
    try {
      await finishRun(
        reservation.key,
        reservation.entry,
        submitted && !knownRejected ? "unknown" : "stopped",
        undefined,
        !submitted,
      );
    } catch {
      /* The existing reservation still prevents another creation. */
    }
    if (submitted && !knownRejected)
      throw new AppError(
        "SUBMISSION_UNKNOWN",
        "We could not confirm whether your preview started. Check this request again; do not create another preview for this submission.",
        502,
      );
    throw error;
  }
}
export async function previewRecovery(request: Request): Promise<Response> {
  sameOrigin(request);
  const owner = session(request);
  const input = z
    .object({ intent: intentSchema })
    .strict()
    .parse(await readJson(request, 300));
  return json({
    ...(await recoverRun(owner.sid, input.intent)),
    recovered: true,
  });
}
export async function runClaims(request: Request): Promise<Claims> {
  sameOrigin(request);
  const owner = session(request);
  const input = z
    .object({ token: z.string().max(4000) })
    .strict()
    .parse(await readJson(request, 6000));
  const claims = verify(input.token, "run");
  if (
    claims.sid !== owner.sid ||
    !claims.taskId ||
    !claims.itemDigest ||
    !claims.referenceDigest ||
    !claims.shopperDigest ||
    !claims.createdAt
  )
    throw new AppError(
      "INVALID_TOKEN",
      "This task belongs to another preview session.",
      401,
    );
  return claims;
}
async function status(claims: Claims): Promise<any> {
  const p = await api(TASK + "/" + encodeURIComponent(claims.taskId!));
  const data = p.data;
  if (!data || !["running", "success", "error"].includes(data.task_status))
    throw new AppError(
      "STATUS_UNVERIFIED",
      "The provider task state could not be confirmed. Check the same task again.",
      502,
    );
  return data;
}
export async function previewStatus(request: Request): Promise<Response> {
  const claims = await runClaims(request);
  const data = await status(claims);
  if (data.task_status === "error") {
    // The upstream task result is deliberately not logged: it may carry signed
    // image URLs or other private data. This classification is safe to surface.
    console.error(
      JSON.stringify({
        event: "preview-task-failed",
        code: "PROVIDER_TASK_FAILED",
      }),
    );
  }
  return json({
    state: data.task_status,
    ...(data.task_status === "error"
      ? {
          code: "PROVIDER_TASK_FAILED",
          message:
            "YouCam could not complete this try-on. Check that the category matches the piece and your adult photo clearly shows the required body area. No automatic retry was made.",
        }
      : {}),
  });
}
export async function previewResult(request: Request): Promise<Response> {
  const claims = await runClaims(request),
    data = await status(claims);
  if (data.task_status !== "success")
    throw new AppError(
      "RESULT_NOT_READY",
      "This task has no completed image yet.",
      409,
    );
  const url = storageUrl(data.results?.url);
  let r: Response;
  try {
    r = await fetch(url, {
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(25000),
    });
  } catch {
    throw new AppError(
      "DOWNLOAD_FAILED",
      "The completed image could not be downloaded. Check this known task again.",
      502,
    );
  }
  if (!r.ok)
    throw new AppError(
      "DOWNLOAD_FAILED",
      "The completed image link is unavailable. Saved local packages remain usable.",
      502,
    );
  const bytes = await boundedBytes(r, 3_000_000),
    meta = imageDimensions(bytes);
  await sharp(bytes, { limitInputPixels: 4096 * 4096, failOn: "warning" })
    .raw()
    .toBuffer();
  return new Response(Buffer.from(bytes), {
    headers: {
      "Content-Type": meta.mime,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "X-AsShown-Result-Digest": hash(bytes),
    },
  });
}
