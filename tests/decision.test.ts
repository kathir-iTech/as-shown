import { beforeAll, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { importPackage } from "../packages/archive";
import { type Bundle } from "../domain/model";
import { decisionBrief, revisionChanges } from "../domain/decision";
let fixture: Bundle;
beforeAll(async () => {
  fixture = await importPackage(
    new Uint8Array(await readFile("public/samples/linen-shirt.asshown.zip")),
  );
});
it("summarizes only the current buyer choices, without inferring condition", () => {
  const brief = decisionBrief(fixture);
  expect(brief.unreviewed).toHaveLength(1);
  expect(brief.reviewed).toBe(0);
  expect(brief.title).toContain("more to look");
});
it("builds questions from ask-seller choices and preserves notes as plain text", () => {
  const next = structuredClone(fixture);
  next.review.decisions["cuff-fray"] = "ask-seller";
  next.review.notes = "<script>literal user text</script>";
  const brief = decisionBrief(next);
  expect(brief.questions).toHaveLength(1);
  expect(brief.message).toContain(next.item.flaws[0].description);
  expect(brief.message).toContain(next.review.notes);
  expect(brief.reviewed).toBe(1);
});
it("a skip choice takes precedence over other summary states", () => {
  const next = structuredClone(fixture);
  next.review.decisions["cuff-fray"] = "skip";
  expect(decisionBrief(next).title).toContain("reason to pass");
});
it("does not present no-known-flaws as verified quality", () => {
  const next = structuredClone(fixture);
  next.item.flaws = [];
  next.item.declaration = "no-known-flaws";
  expect(decisionBrief(next).title).toBe("No known issues were declared.");
});
it("explains changed description, removed issue and changed reference", () => {
  const next = structuredClone(fixture.item);
  next.description = "Changed";
  next.flaws = [];
  next.assets.find((a) => a.role === "reference")!.digest = "0".repeat(64);
  const changes = revisionChanges(fixture.item, next);
  expect(changes).toContain("Seller description changed.");
  expect(changes).toContain("Reference photo changed.");
  expect(changes.some((c) => c.startsWith("Removed declared issue"))).toBe(
    true,
  );
});
it("detects close-up replacement with unchanged asset ID", () => {
  const next = structuredClone(fixture.item);
  next.assets.find((a) => a.role === "closeup")!.digest = "f".repeat(64);
  expect(
    revisionChanges(fixture.item, next).some((c) =>
      c.startsWith("Updated declared issue"),
    ),
  ).toBe(true);
});
