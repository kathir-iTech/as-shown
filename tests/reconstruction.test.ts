import { beforeAll, expect, it, vi, afterEach } from "vitest";
import { readFile } from "node:fs/promises";
import sharp from "sharp";
import { importPackage, exportPackage, exportHtml } from "../packages/archive";
import {
  type Bundle,
  sealItem,
  freshReview,
  referenceOf,
  canReusePreview,
} from "../domain/model";
import {
  publicationCopy,
  publishSeller,
  readSeller,
  revokeSeller,
} from "../provider/sharing";
let fixture: Bundle;
beforeAll(async () => {
  fixture = await importPackage(
    new Uint8Array(await readFile("public/samples/linen-shirt.asshown.zip")),
  );
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
it("saves and reopens an inspection decision without requiring a generated personal image", async () => {
  const { preview: _preview, result: _result, ...inspection } = fixture;
  const reviewed = {
    ...inspection,
    review: {
      ...freshReview(inspection.item),
      notes: "Ask about cuff wear",
      decisions: { "cuff-fray": "ask-seller" as const },
    },
  };
  const reopened = await importPackage(
    await exportPackage(reviewed, "decision"),
  );
  expect(reopened.preview).toBeUndefined();
  expect(reopened.review.notes).toBe("Ask about cuff wear");
  expect(reopened.review.decisions["cuff-fray"]).toBe("ask-seller");
});
it("embeds real image bytes in a script-free readable HTML record", async () => {
  const html = new TextDecoder().decode(await exportHtml(fixture, "decision"));
  expect(html).toContain('src="data:image/jpeg;base64,');
  expect(html).not.toMatch(/<script|src="https?:|src="assets\//i);
  expect(html).toContain("All photographs are embedded");
});
it("seller HTML excludes the personal preview and buyer notes", async () => {
  const input = {
    ...fixture,
    review: { ...fixture.review, notes: "private-buyer-sentinel" },
  };
  const html = new TextDecoder().decode(await exportHtml(input, "item"));
  expect(html).not.toContain("private-buyer-sentinel");
  expect(html).not.toContain("Saved generated style preview");
});
it("new sample inputs keep their source lineage and round-trip through the archive", async () => {
  const sample = await importPackage(
    new Uint8Array(await readFile("public/samples/navy-knit/item.asshown.zip")),
  );
  expect(sample.item.schemaVersion).toBe(2);
  const prepared = referenceOf(sample.item);
  expect(prepared.role).toBe("preview-reference");
  expect(prepared.sourceDigest).toBe(
    sample.item.assets.find((a) => a.role === "reference")!.digest,
  );
  expect(prepared.byteLength).toBeLessThanOrEqual(1_200_000);
  const { contentDigest: _digest, ...content } = sample.item;
  await expect(
    sealItem({
      ...content,
      assets: content.assets.map((a) =>
        a.id === prepared.id ? { ...a, sourceDigest: "0".repeat(64) } : a,
      ),
    }),
  ).rejects.toThrow();
});
it("a prepared input change prevents silent preview reuse", async () => {
  const sample = await importPackage(
    new Uint8Array(await readFile("public/samples/navy-knit/item.asshown.zip")),
  );
  expect(canReusePreview(sample.item, fixture.preview!)).toBe(false);
});
it("publication creates a new metadata-free source revision and leaves the local record intact", async () => {
  const seller = await importPackage(await exportPackage(fixture, "item"));
  const originalDigest = seller.item.contentDigest;
  const published = await publicationCopy(seller);
  expect(seller.item.contentDigest).toBe(originalDigest);
  expect(published.item.revision).toBe(seller.item.revision + 1);
  expect(published.item.contentDigest).not.toBe(originalDigest);
  expect(published.review.notes).toBe("");
  expect(published.preview).toBeUndefined();
  expect(
    (await sharp(published.assets.reference).metadata()).exif,
  ).toBeUndefined();
  expect(published.item.flaws[0].sourceAssetId).toBe(
    seller.item.flaws[0].sourceAssetId,
  );
  await expect(
    importPackage(await exportPackage(published, "item")),
  ).resolves.toHaveProperty("item.contentDigest", published.item.contentDigest);
});
it("rejects a personal decision bundle at the publication boundary", async () => {
  await expect(publicationCopy(fixture)).rejects.toMatchObject({
    code: "SELLER_ONLY_REQUIRED",
  });
});
it("sharing remains unavailable without explicit deployment enablement", async () => {
  vi.stubEnv("ASSHOWN_SHARE_ENABLED", "false");
  const spy = vi.spyOn(globalThis, "fetch");
  const request = new Request("https://asshown.test/api/share/publish", {
    method: "POST",
    headers: { Origin: "https://asshown.test" },
  });
  await expect(publishSeller(request)).rejects.toMatchObject({
    code: "SHARING_PAUSED",
  });
  expect(spy).not.toHaveBeenCalled();
});
it("sharing rejects cross-origin access before storage or ledger calls", async () => {
  const spy = vi.spyOn(globalThis, "fetch");
  const request = () =>
    new Request("https://asshown.test/api/share", {
      method: "POST",
      headers: { Origin: "https://elsewhere.test" },
    });
  for (const operation of [publishSeller, readSeller, revokeSeller])
    await expect(operation(request())).rejects.toMatchObject({
      code: "ORIGIN_REJECTED",
    });
  expect(spy).not.toHaveBeenCalled();
});
