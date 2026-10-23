import { test, expect, type Page } from "@playwright/test";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import AxeBuilder from "@axe-core/playwright";
import { importPackage, exportPackage } from "../../packages/archive";

async function upload(page: Page, title: string, category = "upper_body") {
  await page.goto("/try", { waitUntil: "domcontentloaded" });
  await expect(page.getByLabel("Garment photo", { exact: true })).toBeEnabled();
  await page.getByLabel("Name your find", { exact: true }).fill(title);
  await page
    .getByLabel("Garment category", { exact: true })
    .selectOption(category);
  await page
    .getByLabel("Garment photo", { exact: true })
    .setInputFiles("public/samples/reference.jpg");
  await expect(
    page.getByRole("heading", { name: title, exact: true }),
  ).toBeVisible();
}
async function stored(page: Page, key: string) {
  return page.evaluate(
    (key) =>
      new Promise<unknown>((resolve, reject) => {
        const request = indexedDB.open("asshown-local-v1", 1);
        request.onsuccess = () => {
          const db = request.result;
          const read = db
            .transaction("records")
            .objectStore("records")
            .get(key);
          read.onsuccess = () => {
            resolve(read.result);
            db.close();
          };
          read.onerror = () => {
            reject(new Error("Read failed"));
            db.close();
          };
        };
        request.onerror = () => reject(new Error("Storage failed"));
      }),
    key,
  );
}

test("uploads cannot race hydration and the first typed title survives", async ({
  page,
}) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/_next/static/**/*.js*", async (route) => {
    await gate;
    await route.continue();
  });
  try {
    await page.goto("/try", { waitUntil: "commit" });
    await expect(
      page.getByLabel("Garment category", { exact: true }),
    ).toBeDisabled();
    await expect(
      page.getByLabel("Name your find", { exact: true }),
    ).toBeDisabled();
    await expect(
      page.getByRole("button", { name: "Try my item", exact: true }),
    ).toBeDisabled();
  } finally {
    release();
  }
  await expect(
    page.getByLabel("Name your find", { exact: true }),
  ).toBeEnabled();
  await page
    .getByLabel("Name your find", { exact: true })
    .fill("The first typed title");
  await page
    .getByLabel("Garment photo", { exact: true })
    .setInputFiles("public/samples/reference.jpg");
  await expect(
    page.getByRole("heading", { name: "The first typed title", exact: true }),
  ).toBeVisible();
});

test("own-item rack filters, persists decisions/collections, reorders and removes only the selected record", async ({
  page,
}) => {
  let submissions = 0;
  await page.route("**/api/preview", async (route) => {
    submissions++;
    await route.abort();
  });
  for (const [title, category] of [
    ["Weekend shirt", "upper_body"],
    ["Vintage trousers", "lower_body"],
  ]) {
    await upload(page, title, category);
    await expect(
      page.getByRole("heading", {
        name: "Condition information not supplied.",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Publish seller link", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Back", exact: true }),
    ).toHaveCount(0);
  }
  await page
    .getByRole("banner")
    .getByRole("link", { name: "My rack", exact: true })
    .click();
  await expect(page.locator(".rack-card")).toHaveCount(2);
  await page
    .getByLabel("Decision for Weekend shirt", { exact: true })
    .selectOption("shortlisted");
  await page
    .getByLabel("Collection for Weekend shirt", { exact: true })
    .fill("Weekend finds");
  await page.getByLabel("Collection for Weekend shirt", { exact: true }).blur();
  await expect(page.getByLabel("Filter rack collection")).toContainText(
    "Weekend finds",
  );
  await page.reload();
  await expect(
    page.getByLabel("Decision for Weekend shirt", { exact: true }),
  ).toHaveValue("shortlisted");
  await page.getByLabel("Filter rack category").selectOption("lower_body");
  await expect(page.locator(".rack-card")).toHaveCount(1);
  await expect(page.locator(".rack-card h2")).toHaveText("Vintage trousers");
  await page.getByLabel("Filter rack category").selectOption("all");
  await page.getByLabel("Filter rack collection").selectOption("Weekend finds");
  await expect(page.locator(".rack-card")).toHaveCount(1);
  await page.getByLabel("Filter rack collection").selectOption("all");
  await page.getByLabel("Search your rack").fill("trousers");
  await expect(page.locator(".rack-card")).toHaveCount(1);
  await page.getByLabel("Search your rack").fill("");
  await page
    .getByRole("button", { name: "Move Weekend shirt earlier", exact: true })
    .click();
  await expect(page.locator(".rack-card h2").first()).toHaveText(
    "Weekend shirt",
  );
  await page
    .getByRole("button", { name: "Remove Vintage trousers", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Remove from device", exact: true })
    .click();
  await expect(page.locator(".rack-card")).toHaveCount(1);
  await page.reload();
  await expect(page.locator(".rack-card")).toHaveCount(1);
  expect(submissions).toBe(0);
});

for (const [category, title, guidance] of [
  ["full_body", "Evening dress", "head to feet"],
  ["shoes", "Sunday sneakers", "both feet clearly visible"],
]) {
  test(`Quick Try ${category} has its own photo guidance and survives refresh`, async ({
    page,
  }) => {
    await upload(page, title, category);
    await expect(page.locator(".consent-panel")).toContainText(guidance);
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(
      page.getByRole("heading", { name: title, exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Preview on me", exact: true })
      .click();
    await expect(page.locator(".consent-panel")).toContainText(guidance);
  });
}

test("Quick Try binds consent/category, keeps the actual controlled result only after opt-in and reopens without a second creation", async ({
  page,
}) => {
  const result = await readFile("public/samples/preview.jpg");
  let submissions = 0;
  await page.route("**/api/preview", async (route) => {
    submissions++;
    const body = route.request().postData() || "";
    expect(body).toContain('"category":"lower_body"');
    expect(body).toContain('"declaration":"not-supplied"');
    expect(body).not.toContain("controlled private buyer question");
    await route.fulfill({
      json: {
        token: "controlled-category-token-not-real",
        createdAt: new Date().toISOString(),
      },
    });
  });
  await page.route("**/api/preview/status", (route) =>
    route.fulfill({ json: { state: "success" } }),
  );
  await page.route("**/api/preview/result", (route) =>
    route.fulfill({
      body: result,
      headers: {
        "Content-Type": "image/jpeg",
        "X-AsShown-Result-Digest": createHash("sha256")
          .update(result)
          .digest("hex"),
      },
    }),
  );
  await upload(page, "My own trousers", "lower_body");
  const id = decodeURIComponent(new URL(page.url()).pathname.split("/")[2]);
  await page
    .getByLabel("Your questions & notes")
    .fill("controlled private buyer question");
  await page
    .locator(".shopper-picker input[type=file]")
    .setInputFiles("public/samples/shopper.jpg");
  await expect(
    page.getByRole("button", { name: "Send approved images & preview" }),
  ).toBeDisabled();
  expect(submissions).toBe(0);
  await page
    .getByRole("checkbox", { name: /I’m an adult and have permission/ })
    .check();
  await page
    .getByRole("button", { name: "Send approved images & preview" })
    .dblclick();
  await expect(
    page.getByText("Live YouCam result", { exact: true }),
  ).toBeVisible();
  expect(await stored(page, "look:" + id)).toBeUndefined();
  const save = page.getByRole("checkbox", {
    name: /Keep this generated look in My Rack/,
  });
  await expect(save).not.toBeChecked();
  await save.check();
  await expect
    .poll(async () => !!(await stored(page, "look:" + id)))
    .toBe(true);
  const draft = (await stored(page, "record:" + id)) as Record<string, unknown>;
  expect(draft.preview).toBeUndefined();
  expect(draft.result).toBeUndefined();
  expect(draft.shopper).toBeUndefined();
  await page.reload();
  await expect(
    page.getByText("Live YouCam result", { exact: true }),
  ).toBeVisible();
  await expect(save).toBeChecked();
  await save.uncheck();
  await expect.poll(() => stored(page, "look:" + id)).toBeUndefined();
  expect(submissions).toBe(1);
});

test("Quick Try exports a verifiable reference package with missing-condition disclosure and no invented front/back evidence", async ({
  page,
}, info) => {
  await upload(page, "My source photo");
  const waiting = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export reference only", exact: true })
    .click();
  const downloaded = await waiting;
  const path = info.outputPath("quick-reference.zip");
  await downloaded.saveAs(path);
  const bundle = await importPackage(new Uint8Array(await readFile(path)));
  expect(bundle.item.schemaVersion).toBe(3);
  expect(bundle.item.declaration).toBe("not-supplied");
  expect(
    bundle.item.assets.filter((a) => a.role !== "preview-reference"),
  ).toHaveLength(1);
  expect(bundle.preview).toBeUndefined();
  expect(bundle.review.notes).toBe("");
});

test("bad uploads never enter the rack or start transmission; reduced-motion home and demo drawer are keyboard usable", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.getByLabel("Garment photo", { exact: true })).toBeEnabled();
  await page.getByLabel("Garment photo", { exact: true }).setInputFiles({
    name: "not-an-image.png",
    mimeType: "image/png",
    buffer: Buffer.from("This is not a photograph"),
  });
  await expect(page.locator(".fit-error[role=alert]")).toContainText(
    /JPEG|PNG|image/i,
  );
  await page
    .getByRole("button", { name: "Choose a demo", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Take a test spin." }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Choose a demo", exact: true }),
  ).toBeFocused();
  expect(
    await page
      .locator(".fit-stage")
      .evaluate((node) => getComputedStyle(node).transform),
  ).toBe("none");
  await page.goto("/rack");
  await expect(
    page.getByRole("heading", { name: "Start with the piece you found." }),
  ).toBeVisible();
});

test("seller collection links expose read capabilities only and recipients can inspect seller-only copies (controlled storage response)", async ({
  page,
  browser,
}) => {
  const fixture = await importPackage(
    new Uint8Array(await readFile("public/samples/linen-shirt.asshown.zip")),
  );
  const receipt = {
    id: "a".repeat(40),
    readToken: "b".repeat(43),
    manageToken: "private-management-sentinel-never-shared",
    expiresAt: Date.now() + 60000,
  };
  await page.goto("/examples/linen-shirt");
  await expect(
    page.getByRole("heading", { name: "The rust linen shirt", exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("Your questions & notes")
    .fill("private-buyer-note-never-shared");
  await expect
    .poll(async () => !!(await stored(page, "record:" + fixture.item.itemId)))
    .toBe(true);
  await page.evaluate(
    ({ key, receipt }) =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open("asshown-local-v1", 1);
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction("records", "readwrite");
          tx.objectStore("records").put({ receipt }, key);
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => {
            db.close();
            reject(new Error("Receipt fixture failed"));
          };
        };
        request.onerror = () => reject(new Error("Storage failed"));
        Object.defineProperty(navigator, "clipboard", {
          configurable: true,
          value: {
            writeText: async () => {
              throw new Error("Controlled clipboard unavailable");
            },
          },
        });
      }),
    { key: "publication:" + fixture.item.contentDigest, receipt },
  );
  await page
    .getByRole("banner")
    .getByRole("link", { name: "My rack", exact: true })
    .click();
  await page.getByLabel("Select The rust linen shirt", { exact: true }).check();
  await page
    .getByRole("button", { name: "Copy seller collection link", exact: true })
    .click();
  const url = await page
    .getByLabel("Seller collection link", { exact: true })
    .inputValue();
  expect(JSON.parse(decodeURIComponent(new URL(url).hash.slice(1)))).toEqual([
    { id: receipt.id, token: receipt.readToken },
  ]);
  expect(url).not.toContain("private-");
  const seller = await exportPackage(fixture, "item");
  const recipient = await browser.newContext();
  try {
    const other = await recipient.newPage();
    let reads = 0;
    await other.route("**/api/share/read", (route) => {
      reads++;
      expect(route.request().postDataJSON()).toEqual({
        id: receipt.id,
        token: receipt.readToken,
      });
      return route.fulfill({
        body: Buffer.from(seller),
        contentType: "application/zip",
      });
    });
    await other.goto(url);
    await other.getByRole("button", { name: /Inspect this piece/ }).click();
    await expect(
      other.getByRole("heading", { name: "The rust linen shirt", exact: true }),
    ).toBeVisible();
    await expect(other.getByLabel("Your questions & notes")).toHaveValue("");
    await expect(
      other.getByText("Recorded YouCam example", { exact: true }),
    ).toHaveCount(0);
    expect(reads).toBe(1);
  } finally {
    await recipient.close();
  }
});

test("invalid or oversized seller collection links perform no reads", async ({
  page,
}) => {
  let reads = 0;
  await page.route("**/api/share/read", async (route) => {
    reads++;
    await route.abort();
  });
  const links = Array.from({ length: 9 }, (_, i) => ({
    id: String(i).repeat(40),
    token: "x".repeat(43),
  }));
  await page.goto("/collection#" + encodeURIComponent(JSON.stringify(links)));
  await expect(
    page.getByText(/collection link is incomplete or invalid/),
  ).toBeVisible();
  expect(reads).toBe(0);
});

for (const width of [1440, 390]) {
  test(`upload-first screens stay readable and accessible at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    await upload(page, "Accessible find");
    for (const path of [new URL(page.url()).pathname, "/rack", "/try"]) {
      await page.goto(path, { waitUntil: "domcontentloaded" });
      if (path.startsWith("/inspect/"))
        await expect(
          page.getByRole("heading", { name: "Accessible find", exact: true }),
        ).toBeVisible();
      if (path === "/rack")
        await expect(page.locator(".rack-card").first()).toBeVisible();
      const findings = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze();
      expect(
        findings.violations.filter((v) =>
          ["critical", "serious"].includes(v.impact || ""),
        ),
      ).toEqual([]);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      if (path === "/try")
        expect(
          await page
            .locator(".upload-explainer")
            .evaluate((node) => parseFloat(getComputedStyle(node).fontSize)),
        ).toBeGreaterThanOrEqual(14);
    }
  });
}
