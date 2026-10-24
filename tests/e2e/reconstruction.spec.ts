import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { importPackage } from "../../packages/archive";
import { createHash } from "node:crypto";

test("a fast completed preview remains recoverable after refresh without a second creation (controlled responses)", async ({
  page,
}) => {
  const fixture = await importPackage(
    new Uint8Array(await readFile("public/samples/linen-shirt.asshown.zip")),
  );
  const result = await readFile("public/samples/preview.jpg");
  let creations = 0,
    checks = 0;
  await page.route("**/api/preview", async (route) => {
    creations++;
    await route.fulfill({
      json: {
        state: "running",
        token: "controlled-browser-token-not-a-real-capability",
        createdAt: new Date().toISOString(),
        itemDigest: fixture.item.contentDigest,
        referenceDigest: fixture.preview!.referenceDigest,
        shopperDigest: fixture.preview!.shopperDigest,
      },
    });
  });
  await page.route("**/api/preview/status", async (route) => {
    checks++;
    await route.fulfill({ json: { state: "success" } });
  });
  await page.route("**/api/preview/result", async (route) => {
    await route.fulfill({
      body: result,
      headers: {
        "Content-Type": "image/jpeg",
        "X-AsShown-Result-Digest": createHash("sha256")
          .update(result)
          .digest("hex"),
      },
    });
  });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Try a live preview", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Use synthetic sample instead" })
    .click();
  await page
    .getByRole("checkbox", { name: /I’m an adult and have permission/ })
    .check();
  await page
    .getByRole("button", { name: "Send approved images & preview" })
    .click();
  await expect(
    page.getByText("Live YouCam result", { exact: true }),
  ).toBeVisible();
  // Wait for actual persisted state, not an arbitrary sleep or stale UI message.
  await expect
    .poll(() =>
      page.evaluate(
        (key) =>
          new Promise<boolean>((resolve) => {
            const opening = indexedDB.open("asshown-local-v1", 1);
            opening.onsuccess = () => {
              const db = opening.result;
              const read = db
                .transaction("records")
                .objectStore("records")
                .get(key);
              read.onsuccess = () => {
                resolve(
                  read.result?.stage === "complete" && !!read.result?.token,
                );
                db.close();
              };
            };
          }),
        `pending:${fixture.item.itemId}:${fixture.item.contentDigest}`,
      ),
    )
    .toBe(true);
  await page.reload();
  await page
    .getByRole("button", { name: "Check the same task", exact: true })
    .click();
  await expect(
    page.getByText("Live YouCam result", { exact: true }),
  ).toBeVisible();
  expect(creations).toBe(1);
  expect(checks).toBeGreaterThanOrEqual(2);
});

for (const [slug, title] of [
  ["navy-knit", "The navy cable knit"],
  ["ivory-shirt", "The ivory silk shirt"],
]) {
  test(`recorded scenario ${slug}: stable route and standalone offline HTML`, async ({
    page,
    browser,
  }, info) => {
    await page.goto("/examples/" + slug);
    await expect(
      page.getByRole("heading", { name: title, exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("Recorded YouCam example", { exact: true }),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByRole("heading", { name: title, exact: true }),
    ).toBeVisible();
    await page.getByRole("tab", { name: "Save", exact: true }).click();
    await page
      .getByRole("checkbox", { name: /I understand a decision package/ })
      .check();
    const waiting = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Save readable record (HTML)", exact: true })
      .click();
    const download = await waiting;
    const file = info.outputPath(slug + ".html");
    await download.saveAs(file);
    const offline = await browser.newContext({ offline: true });
    const saved = await offline.newPage();
    await saved.goto(pathToFileURL(file).href);
    await expect(
      saved.getByRole("heading", { name: title, exact: true }),
    ).toBeVisible();
    expect(await saved.locator("script").count()).toBe(0);
    expect(
      await saved
        .locator("img")
        .evaluateAll(
          (imgs) =>
            imgs.length >= 5 &&
            imgs.every(
              (img) =>
                (img as HTMLImageElement).complete &&
                (img as HTMLImageElement).naturalWidth > 0,
            ),
        ),
    ).toBe(true);
    await offline.close();
  });
}

test("editing drafts survive refresh and four linked close-ups retain order with source-region reconfirmation", async ({
  page,
}, info) => {
  await page.goto("/examples/linen-shirt");
  await page.getByRole("button", { name: "Edit record", exact: true }).click();
  await page
    .getByLabel("Seller description")
    .fill("An unfinished revision restored after refresh.");
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          new Promise<string>((resolve, reject) => {
            const request = indexedDB.open("asshown-local-v1", 1);
            request.onerror = () =>
              reject(new Error("Draft storage unavailable"));
            request.onsuccess = () => {
              const db = request.result;
              const all = db
                .transaction("records")
                .objectStore("records")
                .getAll();
              all.onsuccess = () => {
                resolve(
                  all.result.some(
                    (value) =>
                      value?.description ===
                      "An unfinished revision restored after refresh.",
                  )
                    ? "saved"
                    : "not-saved",
                );
                db.close();
              };
              all.onerror = () => {
                db.close();
                reject(new Error("Draft read failed"));
              };
            };
          }),
      ),
    )
    .toBe("saved");
  await page.reload();
  await expect(page.getByLabel("Seller description")).toHaveValue(
    "An unfinished revision restored after refresh.",
  );
  await page
    .getByLabel("Add close-ups for detail 1")
    .setInputFiles([
      "public/samples/front.jpg",
      "public/samples/back.jpg",
      "public/samples/reference.jpg",
    ]);
  await expect(
    page.getByRole("button", {
      name: "Remove close-up 4 from detail 1",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Move earlier", exact: true })
    .last()
    .click();
  await page
    .getByLabel("back photograph", { exact: true })
    .setInputFiles("public/samples/front.jpg");
  await page
    .getByRole("button", { name: "Save new revision", exact: true })
    .click();
  await expect(
    page.locator(
      ".editor-form [role='alert'], .seller-editor [role='alert'], p.error[role='alert']",
    ),
  ).toContainText(/Reconfirm each disclosure/i);
  await page
    .getByRole("checkbox", { name: /I checked this disclosure/ })
    .check();
  await page
    .getByRole("button", { name: "Save new revision", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "What changed in this record",
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Save", exact: true }).click();
  const waiting = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export seller item only", exact: true })
    .click();
  const download = await waiting;
  const path = info.outputPath("seller.zip");
  await download.saveAs(path);
  const record = await importPackage(new Uint8Array(await readFile(path)));
  expect(record.item.flaws[0].closeupAssetIds).toHaveLength(4);
  expect(record.item.flaws[0].region).toBeUndefined();
  expect(record.review.decisions["cuff-fray"]).toBe("unreviewed");
});

test("CSP gives initial scripts a nonce and blocks untrusted inline code", async ({
  page,
}) => {
  // Inject as parser-inserted document markup, not DevTools evaluate (which is
  // intentionally allowed to run code outside the page's CSP enforcement).
  await page.route("**/", async (route) => {
    const original = await route.fetch();
    const body = (await original.text()).replace(
      "</body>",
      "<script>window.__untrustedExecuted = true</script></body>",
    );
    await route.fulfill({ response: original, body });
  });
  const response = await page.goto("/");
  const policy = response!.headers()["content-security-policy"];
  expect(policy).toContain("'strict-dynamic'");
  expect(policy.split("script-src")[1].split(";")[0]).not.toContain(
    "unsafe-inline",
  );
  expect(await page.locator("script[nonce]").count()).toBeGreaterThan(0);
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { __untrustedExecuted?: boolean })
          .__untrustedExecuted,
    ),
  ).toBeUndefined();
});
