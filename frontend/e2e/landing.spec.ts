import { test, expect } from "@playwright/test";

test.describe("Landing page", () => {
  test("loads and shows hero section", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("text=x402-Powered")).toBeVisible();
    await expect(page.locator("text=Agent Services")).toBeVisible();
  });

  test("shows features section", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("#features")).toBeVisible();
    await expect(page.locator("text=x402 Payment Protocol")).toBeVisible();
  });

  test("nav links scroll to sections", async ({ page }) => {
    await page.goto("/");
    await page.click('a[href="#playground"]');
    await expect(page.locator("#playground")).toBeInViewport();
  });

  test("copy button works in hero", async ({ page }) => {
    await page.goto("/");
    await page.click("text=Copy");
    await expect(page.locator("text=Copied!")).toBeVisible();
  });

  test("playground shows send button after services load", async ({ page }) => {
    await page.goto("/");
    await page.click('a[href="#playground"]');
    await expect(page.locator("text=Send Request")).toBeVisible({ timeout: 10000 });
  });
});
