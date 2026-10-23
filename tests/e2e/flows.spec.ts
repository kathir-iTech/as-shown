import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { unzipSync } from "fflate";
import { importPackage } from "../../packages/archive";

test("recorded workflow, private export, separate-context seller import and offline saved viewer", async ({
  page,
  browser,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  let creations = 0;
  page.on("request", (r) => {
    if (r.url().endsWith("/api/preview") && r.method() === "POST") creations++;
  });
  await page.goto("/");
  await expect(
    page.getByRole("link", { name: "As-Shown home", exact: true }),
  ).toHaveText("as-shown✳");
  await expect(page).toHaveTitle(/As-Shown/);
  await page
    .getByRole("button", { name: "Explore the completed example" })
    .click();
  await expect(
    page.getByRole("heading", { name: "The rust linen shirt", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Recorded YouCam example", { exact: true }),
  ).toBeVisible();
  await page.getByRole("radio", { name: "Ask seller", exact: true }).check();
  await page
    .getByLabel("Your questions & notes")
    .fill(
      "Could you show the reverse of the cuff? <script>not executable</script>",
    );
  await expect(
    page.getByRole("button", { name: "Download private decision" }),
  ).toBeDisabled();
  await page
    .getByRole("checkbox", { name: /I understand a decision package/ })
    .check();
  const privateDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download private decision" }).click();
  const privateFile = await privateDownload;
  expect(privateFile.suggestedFilename()).toMatch(/^as-shown-decision-/);
  const privatePath = info.outputPath("private.zip");
  await privateFile.saveAs(privatePath);
  const bytes = new Uint8Array(await readFile(privatePath));
  const restored = await importPackage(bytes);
  expect(restored.review.decisions["cuff-fray"]).toBe("ask-seller");
  expect(restored.result).toBeDefined();
  const extract = info.outputPath("offline-record");
  await mkdir(extract, { recursive: true });
  for (const [name, content] of Object.entries(unzipSync(bytes))) {
    const target = resolve(extract, name);
    expect(target.startsWith(resolve(extract))).toBe(true);
    await mkdir(resolve(target, ".."), { recursive: true });
    await writeFile(target, content);
  }
  const offline = await browser.newContext({ offline: true });
  const saved = await offline.newPage();
  await saved.goto(pathToFileURL(resolve(extract, "viewer.html")).href);
  await expect(
    saved.getByRole("heading", { name: "The rust linen shirt", exact: true }),
  ).toBeVisible();
  expect(
    await saved
      .locator("img")
      .evaluateAll((imgs) =>
        imgs.every(
          (i) =>
            (i as HTMLImageElement).complete &&
            (i as HTMLImageElement).naturalWidth > 0,
        ),
      ),
  ).toBe(true);
  await expect(saved.getByText(/Could you show the reverse/)).toBeVisible();
  await offline.close();
  const sellerDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export seller item only" }).click();
  const seller = await sellerDownload;
  const sellerPath = info.outputPath("seller.zip");
  await seller.saveAs(sellerPath);
  const sellerBundle = await importPackage(
    new Uint8Array(await readFile(sellerPath)),
  );
  expect(sellerBundle.preview).toBeUndefined();
  expect(sellerBundle.review.notes).toBe("");
  const buyer = await browser.newContext();
  const buyerPage = await buyer.newPage();
  await buyerPage.goto("/");
  await buyerPage
    .getByLabel("Import As-Shown package")
    .setInputFiles(sellerPath);
  await expect(
    buyerPage.getByRole("heading", {
      name: "The rust linen shirt",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    buyerPage.getByRole("radio", { name: "Not reviewed", exact: true }),
  ).toBeChecked();
  await expect(
    buyerPage.getByRole("button", { name: "Download private decision" }),
  ).toBeDisabled();
  await buyer.close();
  expect(creations).toBe(0);
  expect(errors).toEqual([]);
});

test("seller creates a no-known-flaws item and a revision resets old review without spending units", async ({
  page,
}) => {
  // Deliberately overlap file decodes. A completed early read must not clear the
  // busy state while another image is still being decoded.
  await page.addInitScript(() => {
    const decode = window.createImageBitmap.bind(window);
    let calls = 0;
    window.createImageBitmap = (async (...args: Parameters<typeof decode>) => {
      const delay = ++calls === 1 ? 100 : 700;
      await new Promise((resolve) => setTimeout(resolve, delay));
      return decode(...args);
    }) as typeof window.createImageBitmap;
  });
  await page.goto("/");
  await page
    .getByRole("banner")
    .getByRole("button", { name: "Create a record", exact: true })
    .click();
  await page.getByLabel("Item title").fill("My test shirt");
  await page
    .getByLabel("Seller description")
    .fill("A source record created in the browser test.");
  for (const role of ["reference", "front", "back"])
    await page
      .getByLabel(`${role} photograph`, { exact: true })
      .setInputFiles(`public/samples/${role}.jpg`);
  await page.getByRole("radio", { name: "I’m not aware of any flaws" }).check();
  await page
    .getByRole("button", { name: "Create item record", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "My test shirt", exact: true }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("complementary")
      .getByText(
        "Seller reports no known flaws; not independently inspected.",
        { exact: true },
      ),
  ).toBeVisible();
  await page.getByRole("button", { name: "All stories" }).click();
  await page
    .getByRole("button", { name: "Explore the completed example" })
    .click();
  await page
    .getByRole("radio", { name: "Acceptable to me", exact: true })
    .check();
  await page.getByRole("button", { name: "Edit record", exact: true }).click();
  await page
    .getByLabel("Seller description")
    .fill("A revised condition description.");
  await page.getByRole("button", { name: "Save new revision" }).click();
  await expect(
    page.getByRole("radio", { name: "Not reviewed", exact: true }),
  ).toBeChecked();
  await page.getByRole("button", { name: "Reuse earlier style image" }).click();
  await expect(
    page.getByText("Recorded YouCam example", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/No new generation or unit use/)).toBeVisible();
});

test("consent gates transmission; double click and unknown submission never auto-recreate", async ({
  page,
}) => {
  let submissions = 0;
  await page.route("**/api/preview", async (route) => {
    submissions++;
    expect(route.request().postData() || "").not.toContain(
      "controlled synthetic condition example",
    );
    await route.abort("failed");
  });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Try a live preview", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Use synthetic sample instead" })
    .click();
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
    page.getByText(/The submission outcome is unknown/),
  ).toBeVisible();
  await page.waitForTimeout(1500);
  expect(submissions).toBe(1);
  await page.reload();
  await expect(
    page.getByText(/An earlier submission has no confirmed task token/),
  ).toBeVisible();
  expect(submissions).toBe(1);
});

test("desktop and mobile core screens have no serious/critical automated accessibility findings or horizontal overflow", async ({
  page,
}) => {
  for (const viewport of [
    { width: 1440, height: 1000 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: /Try on your/ }),
    ).toBeVisible();
    await expect(page).toHaveTitle(/As-Shown/);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    let result = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(
      result.violations.filter((v) =>
        ["critical", "serious"].includes(v.impact || ""),
      ),
    ).toEqual([]);
    await page
      .getByRole("button", { name: "Explore the completed example" })
      .click();
    await expect(
      page.getByRole("heading", { name: "The rust linen shirt", exact: true }),
    ).toBeVisible();
    await expect(page).toHaveTitle(/As-Shown/);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    result = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(
      result.violations.filter((v) =>
        ["critical", "serious"].includes(v.impact || ""),
      ),
    ).toEqual([]);
  }
});

test("interactive lenses, source inspector, question brief and revision diff work without generation", async ({
  page,
}) => {
  let generations = 0;
  page.on("request", (r) => {
    if (r.url().endsWith("/api/preview") && r.method() === "POST")
      generations++;
  });
  await page.goto("/");
  await page.getByRole("button", { name: "The detail", exact: false }).click();
  await expect(
    page.getByText("Original cuff detail · synthetic demo", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Explore the completed example" })
    .click();
  await page
    .getByRole("button", { name: "Inspect the linked source view" })
    .click();
  const inspector = page.getByRole("dialog", { name: "The closer look." });
  await expect(inspector).toBeVisible();
  await inspector.getByRole("button", { name: "Zoom in source" }).click();
  await expect(inspector.getByText("150%", { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(inspector).not.toBeVisible();
  await page.getByRole("radio", { name: "Ask seller", exact: true }).check();
  await page
    .getByRole("button", { name: "Prepare questions for the seller" })
    .click();
  await expect(page.getByLabel("Seller question draft")).toHaveValue(/cuff/i);
  await expect(
    page.getByRole("heading", { name: "A conversation comes next." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Edit record", exact: true }).click();
  await page
    .getByLabel("Seller description")
    .fill("Updated disclosure for this review.");
  await page.getByRole("button", { name: "Save new revision" }).click();
  await expect(
    page.getByText("Seller description changed.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("radio", { name: "Not reviewed", exact: true }),
  ).toBeChecked();
  expect(generations).toBe(0);
});

test("mobile source dialog, seller editor and privacy screens remain accessible", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  async function check() {
    await expect(page).toHaveTitle(/As-Shown/);
    const result = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(
      result.violations.filter((v) =>
        ["critical", "serious"].includes(v.impact || ""),
      ),
    ).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  }
  await page.goto("/");
  await page
    .getByRole("button", { name: "Explore the completed example" })
    .click();
  await page
    .getByRole("button", { name: "Inspect the linked source view" })
    .click();
  await expect(
    page.getByRole("dialog", { name: "The closer look." }),
  ).toBeVisible();
  await check();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Inspect the linked source view" }),
  ).toBeFocused();
  await page.getByRole("button", { name: "Edit record", exact: true }).click();
  await expect(page).toHaveURL(/\/seller\//);
  await expect(page.getByLabel("Seller description")).toBeEditable();
  await check();
  await page
    .getByRole("link", { name: "Privacy & limits", exact: true })
    .click();
  await expect(page).toHaveURL(/\/privacy$/);
  await expect(
    page.getByRole("heading", { name: /A clear view/ }),
  ).toBeVisible();
  await check();
});
