import { test as setup, expect } from "@playwright/test";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "admin@medusa-test.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "supersecret";
const AUTH_FILE = "e2e/.auth/admin.json";

setup("authenticate as admin", async ({ page }) => {
  await page.goto("/app/login");

  // Medusa Admin login form: "Email" label, unlabeled password field,
  // and "Continue with Email" button
  await page.getByRole("textbox", { name: "Email" }).fill(ADMIN_EMAIL);

  // Password field is the second textbox (no accessible name)
  const passwordField = page.getByRole("textbox").nth(1);
  await passwordField.fill(ADMIN_PASSWORD);

  await page
    .getByRole("button", { name: /continue with email/i })
    .click();

  // Wait for redirect to dashboard after successful login
  await expect(page).toHaveURL(/\/app/, { timeout: 15_000 });

  // Ensure the sidebar has loaded (proves the session is valid)
  await expect(page.getByRole("navigation").first()).toBeVisible({
    timeout: 10_000,
  });

  await page.context().storageState({ path: AUTH_FILE });
});
