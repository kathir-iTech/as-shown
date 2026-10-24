import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";

async function ownItem(page: Page) {
  // These state-machine regressions use controlled session/provider responses;
  // signed session admission is exercised by the server/unit and legacy flows.
  await page.route("**/api/session", (route) =>
    route.fulfill({ json: { ok: true } }),
  );
  await page.goto("/try");
  await expect(
    page.getByLabel("Name your find", { exact: true }),
  ).toBeEnabled();
  await page
    .getByLabel("Name your find", { exact: true })
    .fill("My weekend find");
  await page
    .getByLabel("Garment photo", { exact: true })
    .setInputFiles("public/samples/reference.jpg");
  await expect(
    page.getByRole("heading", { name: "My weekend find", exact: true }),
  ).toBeVisible();
}
async function approve(page: Page) {
  await page
    .getByRole("button", { name: "Use synthetic sample instead" })
    .click();
  await page
    .getByRole("checkbox", { name: /I’m an adult and have permission/ })
    .check();
  await page
    .getByRole("button", { name: "Send approved images & preview" })
    .click();
}
async function resultRoute(page: Page) {
  const result = await readFile("public/samples/preview.jpg");
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
}

test("focused tools are keyboard usable; quick editing keeps one rack item and never requires seller photos", async ({
  page,
}) => {
  let creations = 0;
  await page.route("**/api/preview", (route) => {
    creations++;
    return route.abort();
  });
  await ownItem(page);
  await expect(
    page.getByRole("tab", { name: "Try on", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(page.getByLabel("Your questions & notes")).not.toBeVisible();
  await expect(page.locator(".decision-counts")).not.toBeVisible();
  await page.getByRole("tab", { name: "Try on", exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(
    page.getByRole("tab", { name: "Inspect", exact: true }),
  ).toBeFocused();
  await page
    .getByLabel("Your questions & notes")
    .fill("Please share the measurements.");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Edit record", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Edit your piece." });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Name", { exact: true }).fill("Weekend trousers");
  await dialog
    .getByLabel("Category", { exact: true })
    .selectOption("lower_body");
  await dialog.getByRole("button", { name: "Save piece", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Weekend trousers", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".consent-panel")).toContainText(
    "both legs and feet visible",
  );
  await page.getByRole("tab", { name: "Inspect", exact: true }).click();
  await expect(page.getByLabel("Your questions & notes")).toHaveValue(
    "Please share the measurements.",
  );
  await page.getByRole("button", { name: "Edit record", exact: true }).click();
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: "Edit record", exact: true }),
  ).toBeFocused();
  await page
    .getByRole("link", { name: "My rack", exact: true })
    .first()
    .click();
  await expect(page.locator(".rack-card")).toHaveCount(1);
  await expect(page.locator(".rack-card h2")).toHaveText("Weekend trousers");
  expect(creations).toBe(0);
});

test("failed provider task stays next to controls, resets approval and never substitutes an input as a result", async ({
  page,
}) => {
  let creations = 0;
  await page.route("**/api/preview", (route) => {
    creations++;
    return route.fulfill({
      json: {
        token: "controlled-failure-token",
        createdAt: new Date().toISOString(),
      },
    });
  });
  await page.route("**/api/preview/status", (route) =>
    route.fulfill({
      json: {
        state: "error",
        code: "PROVIDER_TASK_FAILED",
        message:
          "Controlled provider task failed. Check the photo and category; no retry was made.",
      },
    }),
  );
  await ownItem(page);
  await approve(page);
  await expect(page.locator(".consent-panel [role=alert]")).toContainText(
    "No new preview was created.",
  );
  await expect(
    page.getByRole("checkbox", { name: /I’m an adult and have permission/ }),
  ).not.toBeChecked();
  await expect(
    page.getByRole("button", { name: "Send approved images & preview" }),
  ).toBeDisabled();
  await expect(page.getByText("Not generated", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Live YouCam result", { exact: true }),
  ).toHaveCount(0);
  await page.getByText("Technical details", { exact: true }).click();
  await expect(
    page.getByText("PROVIDER_TASK_FAILED", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Check piece & category", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Edit your piece." }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  expect(creations).toBe(1);
});

test("paused known task cannot create another intent; checking it retrieves the same controlled result", async ({
  page,
}) => {
  let creations = 0,
    checks = 0;
  await page.route("**/api/preview", (route) => {
    creations++;
    return route.fulfill({
      json: {
        token: "controlled-existing-token",
        createdAt: new Date().toISOString(),
      },
    });
  });
  await page.route("**/api/preview/status", (route) => {
    checks++;
    return checks === 1
      ? route.fulfill({
          status: 502,
          json: { message: "Controlled temporary status outage" },
        })
      : route.fulfill({ json: { state: "success" } });
  });
  await resultRoute(page);
  await ownItem(page);
  await approve(page);
  await expect(
    page.getByRole("button", { name: "Check the same task", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Send approved images & preview" }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Use synthetic sample instead" }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Edit record", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Check the same task", exact: true })
    .click();
  await expect(
    page.getByText("Live YouCam result", { exact: true }),
  ).toBeVisible();
  expect(creations).toBe(1);
  expect(checks).toBe(2);
});

test("selecting a new photo does not present a previous result as its new preview", async ({
  page,
}) => {
  await page.goto("/examples/linen-shirt");
  await expect(
    page.getByText("Recorded YouCam example", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Preview on me", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Use synthetic sample instead" })
    .click();
  await expect(
    page.getByAltText("Your locally prepared photo; no generated result yet"),
  ).toBeVisible();
  await expect(page.getByText("Not generated", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Recorded YouCam example", { exact: true }),
  ).not.toBeVisible();
  await page
    .getByRole("button", { name: "Close preview form", exact: true })
    .click();
  await expect(
    page.getByText("Recorded YouCam example", { exact: true }),
  ).toBeVisible();
});

test("every focused view is accessible on mobile without word-wall or horizontal overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await ownItem(page);
  for (const tab of ["Try on", "Inspect", "Save"]) {
    await page.getByRole("tab", { name: tab, exact: true }).click();
    const result = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(
      result.violations.filter((v) =>
        ["serious", "critical"].includes(v.impact || ""),
      ),
    ).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(
      await page
        .locator(".workspace")
        .evaluate(
          (node) => (node as HTMLElement).innerText.trim().split(/\s+/).length,
        ),
    ).toBeLessThan(280);
  }
});
