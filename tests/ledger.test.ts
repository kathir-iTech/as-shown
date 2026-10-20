import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  finishRun,
  priorRun,
  recoverRun,
  redisCommand,
  reserveRun,
  type LedgerEntry,
  type RunResponse,
} from "../provider/ledger";
const sid = "b1395f64-a568-4afa-8162-9b86543dbc3c";
const intent = "22fbf9d0-3290-4a17-9e61-fae811e3d031";
const request = () => new Request("https://asshown.test/api/preview");
const response: RunResponse = {
  state: "running",
  token: "test-token",
  createdAt: new Date().toISOString(),
  shopperDigest: "a".repeat(64),
  referenceDigest: "b".repeat(64),
  itemDigest: "c".repeat(64),
};
beforeEach(() => {
  vi.stubEnv("KV_REST_API_URL", "https://ledger-test.upstash.io");
  vi.stubEnv("KV_REST_API_TOKEN", "test-only-no-real-credential");
  vi.stubEnv("ASSHOWN_TOKEN_SECRET", "test-only-signing-secret-".repeat(3));
  vi.stubEnv("ASSHOWN_LIFETIME_UNIT_CAP", "800");
  vi.stubEnv("VERCEL", "");
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
it("reserves through one atomic script and stores no raw session, images or IP", async () => {
  const spy = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(Response.json({ result: ["reserved"] }));
  const lease = await reserveRun(request(), sid, intent, "input-fingerprint");
  const command = JSON.parse(String(spy.mock.calls[0][1]?.body));
  expect(command[0]).toBe("EVAL");
  expect(command[2]).toBe(4);
  expect(JSON.stringify(command)).not.toContain(sid);
  expect(JSON.stringify(command)).not.toContain("input-fingerprint");
  expect(lease.entry.state).toBe("reserved");
});
it("fails closed on Redis unavailability and redacts upstream details", async () => {
  vi.spyOn(globalThis, "fetch").mockRejectedValue(
    new Error("private-upstream-token"),
  );
  await expect(
    reserveRun(request(), sid, intent, "same"),
  ).rejects.toMatchObject({ code: "LEDGER_UNAVAILABLE" });
  await expect(redisCommand(["GET", "test"])).rejects.not.toThrow(
    "private-upstream-token",
  );
});
it("rejects unsafe Redis endpoints before transmitting credentials", async () => {
  vi.stubEnv("KV_REST_API_URL", "https://attacker.test");
  const spy = vi.spyOn(globalThis, "fetch");
  await expect(redisCommand(["GET", "test"])).rejects.toThrow();
  expect(spy).not.toHaveBeenCalled();
});
it("rejects global budget exhaustion and hourly rate exhaustion", async () => {
  const spy = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(Response.json({ result: ["budget"] }));
  await expect(
    reserveRun(request(), sid, intent, "same"),
  ).rejects.toMatchObject({ code: "CREDITS_RESERVED" });
  spy.mockResolvedValue(Response.json({ result: ["rate"] }));
  await expect(
    reserveRun(request(), sid, intent, "same"),
  ).rejects.toMatchObject({ code: "PREVIEW_RATE_LIMIT" });
});
it("replays a known matching response, but refuses changed bindings", async () => {
  const spy = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(Response.json({ result: ["reserved"] }));
  const lease = await reserveRun(request(), sid, intent, "same");
  const existing = { ...lease.entry, state: "running", response };
  spy.mockImplementation(async () =>
    Response.json({ result: ["existing", JSON.stringify(existing)] }),
  );
  expect((await reserveRun(request(), sid, intent, "same")).existing).toEqual(
    response,
  );
  await expect(
    reserveRun(request(), sid, intent, "changed"),
  ).rejects.toMatchObject({ code: "INTENT_CONFLICT" });
});
it("never converts an uncertain or expired request into a fresh task", () => {
  const entry: LedgerEntry = {
    state: "reserved",
    fingerprint: "a".repeat(64),
    createdAt: Date.now(),
  };
  expect(() => priorRun(entry)).toThrow("already reserved");
  expect(() => priorRun({ ...entry, state: "unknown" })).toThrow(
    "already reserved",
  );
  expect(() =>
    priorRun({
      ...entry,
      state: "running",
      response,
      createdAt: Date.now() - 7_200_001,
    }),
  ).toThrow("expired");
});
it("persists an outcome with compare-and-set rather than overwriting a different run", async () => {
  const spy = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(Response.json({ result: 0 }));
  await expect(
    finishRun(
      "test",
      { state: "reserved", fingerprint: "a".repeat(64), createdAt: Date.now() },
      "running",
      response,
    ),
  ).rejects.toThrow("could not be saved");
  expect(spy).toHaveBeenCalledTimes(1);
});
it("recovery only reads a session-bound request", async () => {
  const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
    Response.json({
      result: JSON.stringify({
        state: "running",
        fingerprint: "a".repeat(64),
        createdAt: Date.now(),
        response,
      }),
    }),
  );
  expect(await recoverRun(sid, intent)).toEqual(response);
  expect(JSON.parse(String(spy.mock.calls[0][1]?.body))[0]).toBe("GET");
});
it("an invalid request ID or excessive lifetime cap never reaches Redis", async () => {
  const spy = vi.spyOn(globalThis, "fetch");
  await expect(reserveRun(request(), sid, "invalid", "same")).rejects.toThrow();
  vi.stubEnv("ASSHOWN_LIFETIME_UNIT_CAP", "801");
  await expect(reserveRun(request(), sid, intent, "same")).rejects.toThrow(
    "allowance",
  );
  expect(spy).not.toHaveBeenCalled();
});
