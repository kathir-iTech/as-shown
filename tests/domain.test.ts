import { readFile } from "node:fs/promises";
import { beforeAll, describe, it, expect } from "vitest";
import { strToU8, unzipSync, zipSync } from "fflate";
import {
  type Bundle,
  canonical,
  sealItem,
  freshReview,
  verifyBundle,
  sha256,
  canReusePreview,
  imageDimensions,
} from "../domain/model";
import {
  importPackage,
  exportPackage,
  preflight,
  staticViewer,
} from "../packages/archive";

let fixture: Bundle;
beforeAll(async () => {
  fixture = await importPackage(
    new Uint8Array(await readFile("public/samples/linen-shirt.asshown.zip")),
  );
});
const clone = () => structuredClone(fixture);
describe("item identity, review and preview bindings", () => {
  it("loads a real recorded provider result without remote image URLs", async () => {
    expect(fixture.preview?.mode).toBe("recorded-example");
    expect(fixture.result!.length).toBeGreaterThan(10000);
    await expect(verifyBundle(fixture)).resolves.toBeUndefined();
  });
  it("canonicalizes key order, preserving string and array meanings", () => {
    expect(canonical({ b: "<x>", a: [1, 2] })).toBe(
      canonical({ a: [1, 2], b: "<x>" }),
    );
    expect(canonical([1, 2])).not.toBe(canonical([2, 1]));
  });
  it("detects altered item text", async () => {
    const b = clone();
    b.item.title = "Changed without revision";
    await expect(verifyBundle(b)).rejects.toThrow("digest");
  });
  it("detects missing or changed source bytes", async () => {
    const b = clone();
    b.assets.cuff[50] ^= 1;
    await expect(verifyBundle(b)).rejects.toThrow("source image");
    delete b.assets.cuff;
    await expect(verifyBundle(b)).rejects.toThrow("missing");
  });
  it("rejects a flaw with missing source or close-up links", async () => {
    const { contentDigest, ...item } = fixture.item;
    await expect(
      sealItem({
        ...item,
        flaws: [{ ...item.flaws[0], sourceAssetId: "absent" }],
      }),
    ).rejects.toThrow();
    await expect(
      sealItem({
        ...item,
        flaws: [{ ...item.flaws[0], closeupAssetIds: ["front"] }],
      }),
    ).rejects.toThrow();
  });
  it("allows an explicit no-known-flaws declaration without inventing defects", async () => {
    const { contentDigest, ...item } = fixture.item;
    const next = await sealItem({
      ...item,
      declaration: "no-known-flaws",
      flaws: [],
    });
    expect(freshReview(next).decisions).toEqual({});
  });
  it("rejects contradictory declarations and out-of-bounds source regions", async () => {
    const { contentDigest, ...item } = fixture.item;
    await expect(
      sealItem({ ...item, declaration: "no-known-flaws" }),
    ).rejects.toThrow();
    await expect(
      sealItem({
        ...item,
        flaws: [
          {
            ...item.flaws[0],
            region: { x: 0.9, y: 0.9, width: 0.3, height: 0.3 },
          },
        ],
      }),
    ).rejects.toThrow();
  });
  it("invalidates review on a new revision and permits only deliberate unchanged-reference reuse", async () => {
    const b = clone();
    const { contentDigest, ...item } = b.item;
    b.item = await sealItem({
      ...item,
      revision: 2,
      description: "New condition note",
    });
    await expect(verifyBundle(b)).rejects.toThrow("decisions");
    expect(canReusePreview(b.item, b.preview!)).toBe(true);
    b.review = freshReview(b.item);
    await expect(verifyBundle(b)).rejects.toThrow("preview");
    b.preview = {
      ...b.preview!,
      itemDigest: b.item.contentDigest,
      reusedFromItemDigest: contentDigest,
    };
    await expect(verifyBundle(b)).resolves.toBeUndefined();
    b.item.assets[0].digest = "0".repeat(64);
    expect(canReusePreview(b.item, b.preview)).toBe(false);
  });
  it("requires actual preview bytes and matching digest", async () => {
    const b = clone();
    b.result = undefined;
    await expect(verifyBundle(b)).rejects.toThrow("actual image");
    const c = clone();
    c.result![100] ^= 1;
    await expect(verifyBundle(c)).rejects.toThrow("preview image");
  });
  it("checks image dimensions at non-zero byte offsets and rejects unsupported data", () => {
    const b = new Uint8Array(fixture.assets.back.length + 11);
    b.set(fixture.assets.back, 11);
    expect(imageDimensions(b.subarray(11)).width).toBe(1024);
    expect(() => imageDimensions(strToU8("<svg/>"))).toThrow();
  });
});
describe("portable package safety", () => {
  it("round-trips a private decision with the actual result bytes", async () => {
    const next = await importPackage(await exportPackage(fixture, "decision"));
    expect(await sha256(next.result!)).toBe(fixture.preview!.resultDigest);
    expect(next.item.contentDigest).toBe(fixture.item.contentDigest);
  });
  it("seller-only exports exclude buyer notes, personal preview and review", async () => {
    const b = clone();
    b.review.notes = "Private buyer note";
    const raw = unzipSync(await exportPackage(b, "item"));
    const record = JSON.parse(new TextDecoder().decode(raw["record.json"]));
    expect(record.preview).toBeUndefined();
    expect(record.review).toBeUndefined();
    expect(Object.keys(raw).some((n) => n.startsWith("preview."))).toBe(false);
    expect(new TextDecoder().decode(raw["viewer.html"])).not.toContain(
      "Private buyer note",
    );
  });
  it("escapes text in the standalone viewer and forbids scripts/network dependencies", () => {
    const b = clone();
    b.review.notes = "<script>alert(1)</script>";
    const html = staticViewer(b, true);
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
    expect(html).toContain("default-src 'none'");
    expect(html).not.toContain("https://");
  });
  it("rejects path traversal and arbitrary executable names before expansion", () => {
    for (const name of [
      "../oops.png",
      "assets/../../secret.jpg",
      "assets/a.svg",
      "evil.html",
      "assets/a.js",
    ])
      expect(() =>
        preflight(
          zipSync({
            "record.json": strToU8("{}"),
            "manifest.json": strToU8("{}"),
            [name]: strToU8("no"),
          }),
        ),
      ).toThrow();
  });
  it("rejects oversized declared expansion before decompression", () => {
    const zip = zipSync({
      "record.json": strToU8("{}"),
      "manifest.json": strToU8("{}"),
    });
    const view = new DataView(zip.buffer);
    for (let p = 0; p < zip.length - 46; p++)
      if (view.getUint32(p, true) === 0x02014b50) {
        view.setUint32(p + 24, 70_000_000, true);
        break;
      }
    expect(() => preflight(zip)).toThrow("expansion");
  });
  it("rejects duplicate central/local names", () => {
    const zip = zipSync({
      "record.json": strToU8("{}"),
      "manifest.json": strToU8("{}"),
      "assets/cuff.jpg": strToU8("one"),
      "assets/back.jpg": strToU8("two"),
    });
    for (let p = 0; p < zip.length - 15; p++) {
      if (
        new TextDecoder().decode(zip.subarray(p, p + 15)) === "assets/cuff.jpg"
      )
        zip.set(strToU8("assets/back.jpg"), p);
    }
    expect(() => preflight(zip)).toThrow();
  });
  it("rejects changed bytes even when ZIP structure is valid", async () => {
    const raw = unzipSync(await exportPackage(fixture, "decision"));
    raw["assets/cuff.jpg"][50] ^= 1;
    await expect(importPackage(zipSync(raw))).rejects.toThrow("manifest");
  });
  it("does not trust an imported viewer as executable app content", async () => {
    const raw = unzipSync(await exportPackage(fixture, "decision"));
    raw["viewer.html"] = strToU8("<script>window.pwned=true</script>");
    const manifest = JSON.parse(new TextDecoder().decode(raw["manifest.json"]));
    const row = manifest.files.find(
      (r: { path: string }) => r.path === "viewer.html",
    );
    row.bytes = raw["viewer.html"].length;
    row.digest = await sha256(raw["viewer.html"]);
    raw["manifest.json"] = strToU8(JSON.stringify(manifest));
    const next = await importPackage(zipSync(raw));
    expect(staticViewer(next, true)).not.toContain("window.pwned");
  });
});
