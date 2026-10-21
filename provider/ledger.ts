import "server-only";
import { createHmac } from "node:crypto";
import { z } from "zod";

export class LedgerError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 503,
  ) {
    super(message);
  }
}
const tokenResponseSchema = z
  .object({
    state: z.literal("running"),
    token: z.string().max(4000),
    createdAt: z.iso.datetime(),
    shopperDigest: z.string().length(64),
    referenceDigest: z.string().length(64),
    itemDigest: z.string().length(64),
  })
  .strict();
export type RunResponse = z.infer<typeof tokenResponseSchema>;
const entrySchema = z
  .object({
    fingerprint: z.string().length(64),
    state: z.enum([
      "reserved",
      "running",
      "stopped",
      "unknown",
      "success",
      "failed",
    ]),
    createdAt: z.number(),
    response: tokenResponseSchema.optional(),
    released: z.boolean().optional(),
  })
  .strict();
export type LedgerEntry = z.infer<typeof entrySchema>;
export const intentSchema = z.string().uuid();

export function ledgerConfigured() {
  return !!(
    (process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL) &&
    (process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN)
  );
}
function opaque(value: string) {
  const secret = process.env.ASSHOWN_TOKEN_SECRET;
  if (!secret || secret.length < 43)
    throw new LedgerError(
      "LEDGER_UNAVAILABLE",
      "Preview protection is not configured.",
    );
  return createHmac("sha256", secret).update(value).digest("hex");
}
function runKey(sid: string, intent: string) {
  return `asshown:v3:run:${opaque(sid + ":" + intentSchema.parse(intent))}`;
}
function budgetLimit() {
  const limit = Number(process.env.ASSHOWN_LIFETIME_UNIT_CAP || "800");
  if (!Number.isInteger(limit) || limit < 2 || limit > 800)
    throw new LedgerError(
      "BUDGET_INVALID",
      "The free-preview allowance requires review.",
    );
  return limit;
}
export async function redisCommand(
  command: (string | number)[],
): Promise<unknown> {
  try {
    const url = new URL(
      process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || "",
    );
    const token =
      process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
    if (
      url.protocol !== "https:" ||
      !/^[a-z0-9-]+\.upstash\.io$/.test(url.hostname) ||
      url.username ||
      url.password ||
      url.port ||
      url.search ||
      (url.pathname !== "/" && url.pathname !== "") ||
      !token
    )
      throw new Error();
    const response = await fetch(url.origin, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(command),
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok || !response.body) throw new Error();
    const reader = response.body.getReader();
    const parts: Uint8Array[] = [];
    let length = 0;
    try {
      for (;;) {
        const chunk = await reader.read();
        if (chunk.done) break;
        length += chunk.value.length;
        if (length > 12000) {
          await reader.cancel();
          throw new Error();
        }
        parts.push(chunk.value);
      }
    } finally {
      reader.releaseLock();
    }
    const payload = JSON.parse(Buffer.concat(parts).toString("utf8"));
    if ("error" in payload || !("result" in payload)) throw new Error();
    return payload.result;
  } catch {
    // Never expose Redis URLs, bearer tokens, stored task tokens, or upstream bodies.
    throw new LedgerError(
      "LEDGER_UNAVAILABLE",
      "Preview protection could not be reached. No new generation is admitted; your local record still works.",
    );
  }
}

// The aggregate includes completed usage plus unresolved reservations. Only an
// outcome proved to precede submission may release a reservation automatically.
// Existing v3 keys are retained: a release must never reset the lifetime allowance.
export const RESERVE_SCRIPT = `
local old = redis.call('GET', KEYS[1])
if old then return {'existing', old} end
if ARGV[3] ~= '1' then return {'paused'} end
local spent = tonumber(redis.call('GET', KEYS[2]) or '0')
if spent + 2 > tonumber(ARGV[2]) then return {'budget'} end
local sessions = tonumber(redis.call('GET', KEYS[3]) or '0')
local networks = tonumber(redis.call('GET', KEYS[4]) or '0')
if sessions >= 10 or networks >= 20 then return {'rate'} end
redis.call('SET', KEYS[1], ARGV[1], 'EX', 86400)
redis.call('INCRBY', KEYS[2], 2)
redis.call('INCR', KEYS[3])
redis.call('EXPIRE', KEYS[3], 7200)
redis.call('INCR', KEYS[4])
redis.call('EXPIRE', KEYS[4], 7200)
return {'reserved'}
`;
export const FINISH_SCRIPT = `
local old = redis.call('GET', KEYS[1])
if not old then return 0 end
local parsed = cjson.decode(old)
if parsed.fingerprint ~= ARGV[1] or parsed.state ~= 'reserved' then return 0 end
local next = cjson.decode(ARGV[2])
if next.state == 'stopped' and ARGV[3] == 'release-before-submission' then
  local held = tonumber(redis.call('GET', KEYS[2]) or '0')
  if held < 2 then return 0 end
  redis.call('DECRBY', KEYS[2], 2)
  next.released = true
end
redis.call('SET', KEYS[1], cjson.encode(next), 'KEEPTTL')
return 1
`;
export function priorRun(entry: LedgerEntry): RunResponse {
  if (
    ["running", "success", "failed"].includes(entry.state) &&
    entry.response &&
    Date.now() - entry.createdAt < 2 * 60 * 60 * 1000
  )
    return entry.response;
  if (entry.state === "stopped")
    throw new LedgerError(
      "INTENT_STOPPED",
      "This request stopped without a confirmed task. Your record is safe; review the error before starting a new preview.",
      409,
    );
  if (["running", "success", "failed"].includes(entry.state))
    throw new LedgerError(
      "RECOVERY_EXPIRED",
      "The recovery window has expired. This request will not be recreated. Saved packages still work.",
      410,
    );
  throw new LedgerError(
    "SUBMISSION_UNKNOWN",
    "This request is already reserved and its outcome is uncertain. Check this request again; inspection and saving remain available.",
    409,
  );
}
export async function reserveRun(
  request: Request,
  sid: string,
  intent: string,
  fingerprint: string,
  allowNew = true,
) {
  const key = runKey(sid, intent);
  const hour = Math.floor(Date.now() / 3_600_000);
  // Trust forwarding metadata only on Vercel. Never store an IP address in Redis.
  const network =
    process.env.VERCEL === "1"
      ? request.headers.get("x-vercel-forwarded-for") ||
        request.headers.get("x-forwarded-for")
      : undefined;
  const entry: LedgerEntry = {
    fingerprint: opaque(fingerprint),
    state: "reserved",
    createdAt: Date.now(),
  };
  const result = await redisCommand([
    "EVAL",
    RESERVE_SCRIPT,
    4,
    key,
    "asshown:v3:units-reserved",
    `asshown:v3:session:${hour}:${opaque(sid)}`,
    `asshown:v3:network:${hour}:${opaque(network?.slice(0, 256) || sid)}`,
    JSON.stringify(entry),
    budgetLimit(),
    allowNew ? "1" : "0",
  ]);
  if (!Array.isArray(result))
    throw new LedgerError(
      "LEDGER_UNAVAILABLE",
      "The request reservation could not be confirmed.",
    );
  if (result[0] === "budget")
    throw new LedgerError(
      "CREDITS_RESERVED",
      "The deployment’s free-preview allowance is reserved. Recorded examples and offline records remain available.",
    );
  if (result[0] === "paused")
    throw new LedgerError(
      "LIVE_PAUSED",
      "Live previews are paused. You can still inspect, save and recover an existing request.",
    );
  if (result[0] === "rate")
    throw new LedgerError(
      "PREVIEW_RATE_LIMIT",
      "This session or network has reached its hourly preview allowance. Check an existing task or return later.",
      429,
    );
  if (result[0] === "existing") {
    const existing = entrySchema.parse(JSON.parse(result[1]));
    if (existing.fingerprint !== entry.fingerprint)
      throw new LedgerError(
        "INTENT_CONFLICT",
        "This request identifier is already bound to different images or a different record.",
        409,
      );
    return { key, entry: existing, existing: priorRun(existing) };
  }
  if (result[0] !== "reserved")
    throw new LedgerError(
      "LEDGER_UNAVAILABLE",
      "The request reservation could not be confirmed.",
    );
  return { key, entry, existing: undefined };
}
export async function finishRun(
  key: string,
  entry: LedgerEntry,
  state: "running" | "unknown" | "stopped",
  response?: RunResponse,
  releaseBeforeSubmission = false,
) {
  const next = entrySchema.parse({
    ...entry,
    state,
    ...(response ? { response } : {}),
  });
  const done = await redisCommand([
    "EVAL",
    FINISH_SCRIPT,
    2,
    key,
    "asshown:v3:units-reserved",
    entry.fingerprint,
    JSON.stringify(next),
    releaseBeforeSubmission ? "release-before-submission" : "retain",
  ]);
  if (done !== 1)
    throw new LedgerError(
      "LEDGER_UNAVAILABLE",
      "The request outcome could not be saved.",
    );
}
export async function recoverRun(
  sid: string,
  intent: string,
): Promise<RunResponse> {
  const result = await redisCommand(["GET", runKey(sid, intent)]);
  if (typeof result !== "string")
    throw new LedgerError(
      "RECOVERY_NOT_FOUND",
      "No reservation was found for this request. Do not assume the provider cancelled it; check the previous message.",
      404,
    );
  return priorRun(entrySchema.parse(JSON.parse(result)));
}
