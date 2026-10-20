import { readFile } from "node:fs/promises";
import { beforeAll, beforeEach, afterEach, it, expect, vi } from "vitest";
import { importPackage } from "../packages/archive";
import {
  DISCLOSURE_VERSION,
  type Bundle,
  previewAdmission,
} from "../domain/model";
import {
  createPreview,
  sign,
  verify,
  sameOrigin,
  boundedBytes,
  previewResult,
} from "../provider/youcam";
import { reserveRun, finishRun } from "../provider/ledger";
vi.mock("../provider/ledger", async (original) => {
  const actual = await original<typeof import("../provider/ledger")>();
  return {
    ...actual,
    reserveRun: vi.fn(),
    finishRun: vi.fn(),
    ledgerConfigured: () => true,
  };
});
let fixture: Bundle;
const sid = "b1395f64-a568-4afa-8162-9b86543dbc3c";
beforeAll(async () => {
  fixture = await importPackage(
    new Uint8Array(await readFile("public/samples/linen-shirt.asshown.zip")),
  );
});
beforeEach(() => {
  vi.stubEnv(
    "ASSHOWN_TOKEN_SECRET",
    "unit-test-secret-not-a-real-credential-".repeat(2),
  );
  vi.stubEnv("YOUCAM_API_KEY", "unit-test-not-a-real-key");
  vi.stubEnv("YOUCAM_ALLOW_GENERATION", "true");
  vi.stubEnv("YOUCAM_PREPAID_ONLY_CONFIRMED", "true");
  vi.stubEnv("ASSHOWN_UNIT_RESERVE", "100");
  vi.mocked(reserveRun).mockResolvedValue({
    key: "test-run",
    entry: {
      fingerprint: "0".repeat(64),
      state: "reserved",
      createdAt: Date.now(),
    },
    existing: undefined,
  });
  vi.mocked(finishRun).mockResolvedValue(undefined);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
const cookie = () =>
  `asshown-session=${sign({ type: "session", sid, exp: Date.now() + 60000 })}`;
async function request(
  consent: unknown = {
    affirmative: true,
    policyVersion: DISCLOSURE_VERSION,
    itemDigest: fixture.item.contentDigest,
    approvedAt: new Date().toISOString(),
  },
) {
  const form = new FormData();
  form.set("item", JSON.stringify(previewAdmission(fixture.item)));
  form.set("consent", JSON.stringify(consent));
  form.set(
    "shopper",
    new Blob([await readFile("public/samples/shopper.jpg")], {
      type: "image/jpeg",
    }),
    "s.jpg",
  );
  form.set(
    "reference",
    new Blob([new Uint8Array(fixture.assets.reference)], {
      type: "image/jpeg",
    }),
    "r.jpg",
  );
  return new Request("https://asshown.test/api/preview", {
    method: "POST",
    headers: {
      Origin: "https://asshown.test",
      Cookie: cookie(),
      "Idempotency-Key": "b1395f64-a568-4afa-8162-9b86543dbc3c",
    },
    body: form,
  });
}
function providerMock({
  units = 994,
  cost = 2,
  unknown = false,
  failureStatus = 0,
}: {
  units?: number;
  cost?: number;
  unknown?: boolean;
  failureStatus?: number;
} = {}) {
  return vi
    .spyOn(globalThis, "fetch")
    .mockImplementation(async (url, options) => {
      const u = String(url);
      if (u.includes("feature-cost"))
        return Response.json({
          status: 200,
          result: {
            skus: [
              {
                run_task_url:
                  "https://yce-api-01.makeupar.com/s2s/v2.0/task/cloth-v3",
                amount: cost,
                unit: "result_image",
                proc_unit: 1,
              },
            ],
          },
        });
      if (u.endsWith("/client/credit"))
        return Response.json({
          status: 200,
          results: [{ amount_dec: units, expiry: Date.now() + 60000 }],
        });
      if (u.endsWith("/s2s/v2.0/file"))
        return Response.json({
          status: 200,
          data: {
            files: [
              {
                file_id: "test-file-id",
                requests: [
                  {
                    method: "PUT",
                    url: "https://yce-us.s3-accelerate.amazonaws.com/unit-test-input",
                    headers: { "Content-Type": "image/jpeg" },
                  },
                ],
              },
            ],
          },
        });
      if (options?.method === "PUT") return new Response("", { status: 200 });
      if (u.endsWith("/task/cloth-v3")) {
        if (failureStatus) return new Response("", { status: failureStatus });
        if (unknown) throw new Error("not logged secret body");
        return Response.json({
          status: 200,
          data: { task_id: "unit-test-task" },
        });
      }
      throw new Error("Unexpected mocked request");
    });
}
it("rejects changed, expired, wrong-purpose and oversized signed tokens", () => {
  const token = sign({ type: "session", sid, exp: Date.now() + 60000 });
  expect(verify(token, "session").sid).toBe(sid);
  expect(() => verify(token + "a", "session")).toThrow();
  expect(() => verify(token, "run")).toThrow();
  expect(() =>
    verify(sign({ type: "session", sid, exp: Date.now() - 1 }), "session"),
  ).toThrow("expired");
  expect(() => verify("x".repeat(5000), "session")).toThrow();
});
it("rejects missing/cross-site origin", () => {
  expect(() => sameOrigin(new Request("https://asshown.test/api"))).toThrow();
  expect(() =>
    sameOrigin(
      new Request("https://asshown.test/api", {
        headers: { Origin: "https://attacker.test" },
      }),
    ),
  ).toThrow();
});
it("bounds actual body bytes without trusting content-length", async () => {
  await expect(
    boundedBytes(new Response("x".repeat(200)), 100),
  ).rejects.toThrow("size");
});
it("has zero outbound calls when consent is not affirmative", async () => {
  const spy = providerMock();
  await expect(
    createPreview(
      await request({
        affirmative: false,
        policyVersion: DISCLOSURE_VERSION,
        itemDigest: fixture.item.contentDigest,
        approvedAt: new Date().toISOString(),
      }),
    ),
  ).rejects.toThrow();
  expect(spy).not.toHaveBeenCalled();
});
it("stops before upload when free units reach reserve or cost changes", async () => {
  const spy = providerMock({ units: 101 });
  await expect(createPreview(await request())).rejects.toThrow("reserve");
  expect(spy.mock.calls.some(([url]) => String(url).endsWith("/file"))).toBe(
    false,
  );
  spy.mockRestore();
  const changed = providerMock({ cost: 3 });
  await expect(createPreview(await request())).rejects.toThrow("two-unit");
  expect(changed.mock.calls).toHaveLength(1);
});
it("creates one mocked task with exact input binding and without forwarding API auth to signed storage", async () => {
  const spy = providerMock();
  const response = await createPreview(await request());
  const body = await response.json();
  expect(body.state).toBe("running");
  expect(verify(body.token, "run").itemDigest).toBe(fixture.item.contentDigest);
  expect(
    spy.mock.calls.filter(
      ([url, opts]) =>
        String(url).endsWith("/task/cloth-v3") && opts?.method === "POST",
    ),
  ).toHaveLength(1);
  for (const [, opts] of spy.mock.calls.filter(([, o]) => o?.method === "PUT"))
    expect(JSON.stringify(opts?.headers)).not.toContain("Authorization");
  expect(JSON.stringify(body)).not.toContain("unit-test-not-a-real-key");
});
it("does not recreate a task on an ambiguous submission failure", async () => {
  const spy = providerMock({ unknown: true });
  await expect(createPreview(await request())).rejects.toMatchObject({
    code: "SUBMISSION_UNKNOWN",
  });
  expect(
    spy.mock.calls.filter(([url]) => String(url).endsWith("/task/cloth-v3")),
  ).toHaveLength(1);
});

it("treats an upstream HTTP 500 after submission as unknown, without a second creation", async () => {
  const spy = providerMock({ failureStatus: 500 });
  await expect(createPreview(await request())).rejects.toMatchObject({
    code: "SUBMISSION_UNKNOWN",
  });
  expect(
    spy.mock.calls.filter(([url]) => String(url).endsWith("/task/cloth-v3")),
  ).toHaveLength(1);
});

it("minimal admission excludes seller text, annotations and buyer notes", () => {
  const input = previewAdmission(fixture.item);
  const text = JSON.stringify(input);
  expect(text).not.toContain(fixture.item.title);
  expect(text).not.toContain(fixture.item.description);
  expect(text).not.toContain(fixture.item.flaws[0].description);
  expect(text).not.toContain("region");
});
it("rejects provider result hosts rather than fetching arbitrary browser-supplied URLs", async () => {
  const token = sign({
    type: "run",
    sid,
    taskId: "unit-test-task",
    itemDigest: fixture.item.contentDigest,
    referenceDigest: fixture.item.assets[0].digest,
    shopperDigest: "0".repeat(64),
    createdAt: new Date().toISOString(),
    exp: Date.now() + 60000,
  });
  const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
    Response.json({
      status: 200,
      data: {
        task_status: "success",
        results: { url: "https://attacker.test/private" },
      },
    }),
  );
  await expect(
    previewResult(
      new Request("https://asshown.test/api/preview/result", {
        method: "POST",
        headers: { Origin: "https://asshown.test", Cookie: cookie() },
        body: JSON.stringify({ token }),
      }),
    ),
  ).rejects.toMatchObject({ code: "PROVIDER_STORAGE_REJECTED" });
  expect(spy).toHaveBeenCalledTimes(1);
});
it("returns an already-reserved known task with zero new provider calls", async () => {
  const spy = providerMock();
  const first = await (await createPreview(await request())).json();
  spy.mockClear();
  vi.mocked(reserveRun).mockResolvedValue({
    key: "test-run",
    entry: {
      fingerprint: "0".repeat(64),
      state: "running",
      createdAt: Date.now(),
      response: first,
    },
    existing: first,
  });
  const second = await (await createPreview(await request())).json();
  expect(second.token).toBe(first.token);
  expect(second.recovered).toBe(true);
  expect(spy).not.toHaveBeenCalled();
});
it("a ledger failure prevents all provider calls", async () => {
  const spy = providerMock();
  vi.mocked(reserveRun).mockRejectedValue(new Error("Ledger unavailable"));
  await expect(createPreview(await request())).rejects.toThrow(
    "Ledger unavailable",
  );
  expect(spy).not.toHaveBeenCalled();
});
it("a failed outcome save still returns the known task without recreating it", async () => {
  const spy = providerMock();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.mocked(finishRun).mockRejectedValue(new Error("unavailable"));
  const result = await (await createPreview(await request())).json();
  expect(result.state).toBe("running");
  expect(
    spy.mock.calls.filter(([url]) => String(url).endsWith("/task/cloth-v3")),
  ).toHaveLength(1);
});
