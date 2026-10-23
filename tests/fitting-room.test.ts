import { beforeAll, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { importPackage, exportPackage, exportHtml } from "../packages/archive";
import {
  type Bundle,
  type Category,
  freshReview,
  sealItem,
  verifyBundle,
  previewAdmission,
  canReusePreview,
} from "../domain/model";
import { decisionBrief } from "../domain/decision";
import { publicationCopy } from "../provider/sharing";
let fixture: Bundle;
beforeAll(async () => {
  fixture = await importPackage(
    new Uint8Array(await readFile("public/samples/linen-shirt.asshown.zip")),
  );
});
async function quick(category: Category = "upper_body") {
  const asset = fixture.item.assets.find((a) => a.role === "reference")!;
  const item = await sealItem({
    schemaVersion: 3,
    itemId: "quick-test",
    revision: 1,
    title: "My find",
    description: "No condition information",
    category,
    createdAt: new Date().toISOString(),
    declaration: "not-supplied",
    assets: [{ ...asset, origin: "shopper-upload" }],
    flaws: [],
  });
  return {
    item,
    assets: { [asset.id]: fixture.assets[asset.id] },
    review: freshReview(item),
  };
}
for (const category of [
  "upper_body",
  "lower_body",
  "full_body",
  "shoes",
] as const) {
  it(`round-trips a one-reference ${category} record without inventing seller evidence`, async () => {
    const bundle = await quick(category);
    await verifyBundle(bundle);
    const admission = previewAdmission(bundle.item);
    expect(admission.category).toBe(category);
    expect(admission.declaration).toBe("not-supplied");
    expect(admission.assets).toHaveLength(1);
    expect(JSON.stringify(admission)).not.toContain("No condition information");
    const restored = await importPackage(
      await exportPackage(bundle, "decision"),
    );
    expect(restored.item.category).toBe(category);
    expect(restored.item.declaration).toBe("not-supplied");
    expect(decisionBrief(restored).title).toBe(
      "Condition information not supplied.",
    );
    expect(decisionBrief(restored).message).toContain("original front, back");
    const html = new TextDecoder().decode(await exportHtml(bundle, "decision"));
    expect(html).toContain("Condition information not supplied");
    expect(html).not.toContain("Seller reports no known flaws");
  });
}
it("Quick Try cannot carry false source views, seller flaws or a legacy schema", async () => {
  const { item } = await quick();
  const { contentDigest: _digest, ...content } = item;
  await expect(sealItem({ ...content, schemaVersion: 2 })).rejects.toThrow();
  await expect(
    sealItem({ ...content, assets: fixture.item.assets }),
  ).rejects.toThrow();
  await expect(
    sealItem({ ...content, flaws: fixture.item.flaws }),
  ).rejects.toThrow();
  await expect(
    sealItem({ ...content, declaration: "no-known-flaws" }),
  ).rejects.toThrow();
});
it("never publishes a shopper-only reference as seller evidence", async () => {
  await expect(publicationCopy(await quick())).rejects.toMatchObject({
    code: "SELLER_ONLY_REQUIRED",
  });
});
it("changing category invalidates preview reuse even for identical reference bytes", async () => {
  const { item } = await quick("lower_body");
  expect(canReusePreview(item, fixture.preview!)).toBe(false);
  expect(canReusePreview(fixture.item, fixture.preview!)).toBe(true);
});
it("continues opening all historical synthetic demonstration packages", async () => {
  for (const path of [
    "public/samples/linen-shirt.asshown.zip",
    "public/samples/navy-knit/item.asshown.zip",
    "public/samples/ivory-shirt/item.asshown.zip",
  ]) {
    const bundle = await importPackage(new Uint8Array(await readFile(path)));
    await verifyBundle(bundle);
    expect(bundle.result).toBeDefined();
  }
});
