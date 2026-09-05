import { test, expect } from "@playwright/test";
import { execFileSync } from "child_process";
import { SubscriptionDetailPage } from "./pages/SubscriptionDetailPage";

const DB_URL =
  process.env.DATABASE_URL ??
  "postgres://postgres:Kasperski1@localhost/medusa-my-medusa-store";

/**
 * Seed a fresh active subscription via psql and return its reference.
 *
 * Each call produces a unique reference so tests are fully isolated from one
 * another and from any pre-existing data.
 */
function seedActiveSubscription(): string {
  const ts = Date.now();
  const reference = `SUB-E2E-STATUS-${ts}`;
  const now = new Date().toISOString();
  const futureRenewal = new Date(ts + 30 * 24 * 60 * 60 * 1000).toISOString();

  const sql = [
    `INSERT INTO subscription (`,
    `  id, reference, status,`,
    `  customer_id, cart_id, product_id, variant_id,`,
    `  frequency_interval, frequency_value,`,
    `  started_at, next_renewal_at,`,
    `  skip_next_cycle, is_trial,`,
    `  customer_snapshot, product_snapshot, pricing_snapshot,`,
    `  shipping_address, payment_context,`,
    `  created_at, updated_at`,
    `) VALUES (`,
    `  gen_random_uuid()::text,`,
    `  '${reference}', 'active',`,
    `  'cus_e2e_status_${ts}', 'cart_e2e_status_${ts}',`,
    `  'prod_e2e_status_${ts}', 'variant_e2e_status_${ts}',`,
    `  'month', 1,`,
    `  '${now}', '${futureRenewal}',`,
    `  false, false,`,
    `  '{"email":"e2e-status@test.com","full_name":"E2E Status Test"}'::jsonb,`,
    `  '{"product_id":"prod_e2e","product_title":"E2E Status Product","variant_id":"var_e2e","variant_title":"Default","sku":"E2E-SKU-STATUS"}'::jsonb,`,
    `  '{"discount_type":"percentage","discount_value":0,"label":null}'::jsonb,`,
    `  '{"first_name":"E2E","last_name":"Status","address_1":"Test St 1","city":"Warsaw","postal_code":"00-001","country_code":"PL"}'::jsonb,`,
    `  '{"payment_provider_id":"pp_stripe_stripe"}'::jsonb,`,
    `  '${now}', '${now}'`,
    `);`,
  ].join(" ");

  execFileSync("psql", [DB_URL, "-c", sql], { stdio: "pipe" });
  return reference;
}

test.describe("Subscription status transitions (pause & resume)", () => {
  let reference: string;
  let detailPage: SubscriptionDetailPage;

  test.beforeEach(async ({ page }) => {
    reference = seedActiveSubscription();
    detailPage = new SubscriptionDetailPage(page);
    // Navigate to the detail page via the list so we exercise real navigation
    await detailPage.gotoFromList(reference);
  });

  test("pauses and resumes an active subscription", async ({ page }) => {
    // ── Initial state ────────────────────────────────────────────────────────
    await detailPage.expectStatus("Active");

    // ── PAUSE ─────────────────────────────────────────────────────────────────

    // Intercept the pause API call before triggering the action
    const pauseResponse = page.waitForResponse(
      (res) =>
        res.url().includes("/admin/subscriptions/") &&
        res.url().endsWith("/pause") &&
        res.request().method() === "POST"
    );

    await detailPage.openActionMenu();

    // When active, "Pause" must be visible and "Resume" must be absent
    await expect(page.getByRole("menuitem", { name: "Pause" })).toBeVisible();
    await expect(
      page.getByRole("menuitem", { name: "Resume" })
    ).not.toBeVisible();

    await detailPage.clickAction("Pause");
    // The usePrompt dialog title is "Pause subscription?"
    await detailPage.confirmPrompt("Pause");

    // Verify API response
    const pauseRes = await pauseResponse;
    expect(pauseRes.status()).toBe(200);
    const pauseBody = await pauseRes.json();
    expect(pauseBody.subscription.status).toBe("paused");

    // Verify UI feedback
    await detailPage.expectToast("Subscription paused");
    await detailPage.expectStatus("Paused");

    // Open menu again: "Resume" visible, "Pause" absent
    await detailPage.openActionMenu();
    await expect(page.getByRole("menuitem", { name: "Resume" })).toBeVisible();
    await expect(
      page.getByRole("menuitem", { name: "Pause" })
    ).not.toBeVisible();
    // Close the menu by pressing Escape
    await page.keyboard.press("Escape");

    // ── RESUME ────────────────────────────────────────────────────────────────

    const resumeResponse = page.waitForResponse(
      (res) =>
        res.url().includes("/admin/subscriptions/") &&
        res.url().endsWith("/resume") &&
        res.request().method() === "POST"
    );

    await detailPage.openActionMenu();
    await detailPage.clickAction("Resume");
    // The usePrompt dialog title is "Resume subscription?"
    await detailPage.confirmPrompt("Resume");

    // Verify API response
    const resumeRes = await resumeResponse;
    expect(resumeRes.status()).toBe(200);
    const resumeBody = await resumeRes.json();
    expect(resumeBody.subscription.status).toBe("active");

    // Verify UI feedback
    await detailPage.expectToast("Subscription resumed");
    await detailPage.expectStatus("Active");

    // Open menu again: "Pause" visible, "Resume" absent
    await detailPage.openActionMenu();
    await expect(page.getByRole("menuitem", { name: "Pause" })).toBeVisible();
    await expect(
      page.getByRole("menuitem", { name: "Resume" })
    ).not.toBeVisible();
    await page.keyboard.press("Escape");
  });
});
