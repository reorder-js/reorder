import { test, expect } from "@playwright/test";
import { execFileSync } from "child_process";
import { RenewalDetailPage } from "./pages/RenewalDetailPage";

const DB_URL =
  process.env.DATABASE_URL ??
  "postgres://postgres:Kasperski1@localhost/medusa-my-medusa-store";

interface SeedOptions {
  approvalRequired: boolean;
  approvalStatus: string | null;
  cycleStatus?: string;
}

/**
 * Seed a fresh active subscription and linked renewal cycle via psql.
 * Returns the generated reference and cycle ID for navigation.
 */
function seedSubscriptionWithRenewalCycle(options: SeedOptions) {
  const ts = Date.now();
  const subId = `sub_${ts}`;
  const cycleId = `cycle_${ts}`;
  const reference = `SUB-E2E-RENEWAL-${ts}`;

  const now = new Date();
  const nowStr = now.toISOString();

  const futureRenewal = new Date(
    now.getTime() + 30 * 24 * 60 * 60 * 1000,
  ).toISOString();
  const pastScheduled = new Date(
    now.getTime() - 24 * 60 * 60 * 1000,
  ).toISOString();

  const cycleStatus = options.cycleStatus || "scheduled";
  const approvalStatusVal = options.approvalStatus
    ? `'${options.approvalStatus}'`
    : "NULL";

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
    `  '${subId}', '${reference}', 'active',`,
    `  'cus_e2e_renewal_${ts}', 'cart_e2e_renewal_${ts}',`,
    `  'prod_e2e_renewal_${ts}', 'variant_e2e_renewal_${ts}',`,
    `  'month', 1,`,
    `  '${nowStr}', '${futureRenewal}',`,
    `  true, false,`,
    `  '{"email":"e2e-renewal@test.com","full_name":"E2E Renewal Test"}'::jsonb,`,
    `  '{"product_id":"prod_e2e","product_title":"E2E Renewal Product","variant_id":"var_e2e","variant_title":"Default","sku":"E2E-SKU-RENEWAL"}'::jsonb,`,
    `  '{"discount_type":"percentage","discount_value":0,"label":null}'::jsonb,`,
    `  '{"first_name":"E2E","last_name":"Renewal","address_1":"Test St 1","city":"Warsaw","postal_code":"00-001","country_code":"PL"}'::jsonb,`,
    `  '{"payment_provider_id":"pp_stripe_stripe"}'::jsonb,`,
    `  '${nowStr}', '${nowStr}'`,
    `);`,

    `INSERT INTO renewal_cycle (`,
    `  id, subscription_id, scheduled_for,`,
    `  status, approval_required, approval_status,`,
    `  attempt_count,`,
    `  created_at, updated_at`,
    `) VALUES (`,
    `  '${cycleId}', '${subId}', '${pastScheduled}',`,
    `  '${cycleStatus}', ${options.approvalRequired}, ${approvalStatusVal},`,
    `  0,`,
    `  '${nowStr}', '${nowStr}'`,
    `);`,
  ].join(" ");

  execFileSync("psql", [DB_URL, "-c", sql], { stdio: "pipe" });
  return { reference, cycleId };
}

test.describe("Renewal force execution & approval", () => {
  let detailPage: RenewalDetailPage;

  test.beforeEach(async ({ page }) => {
    detailPage = new RenewalDetailPage(page);
    // Login flow is handled globally via Playwright setup/auth state in this repo.
  });

  test("forces a scheduled renewal cycle", async ({ page }) => {
    // 1. Seed subscription + renewal_cycle (scheduled, no approval)
    const { reference, cycleId } = seedSubscriptionWithRenewalCycle({
      approvalRequired: false,
      approvalStatus: null,
      cycleStatus: "scheduled",
    });

    // 2-6. Navigate via queue and wait for load
    await detailPage.gotoFromQueue(reference);
    await detailPage.waitForLoaded();

    // 7. Assert initial status
    await detailPage.expectCycleStatus("Scheduled");

    // 8. Set up API intercept
    const forceResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes(`/admin/renewals/${cycleId}/force`) &&
        response.request().method() === "POST",
    );

    // 9-11. Open action dropdown and click Force renewal
    await detailPage.openActionMenu();
    await expect(
      page.getByRole("menuitem", { name: "Force renewal" }),
    ).toBeVisible();
    await detailPage.clickForceRenewal();

    // 12. Confirm prompt
    await detailPage.confirmPrompt("Force renewal");

    // 13. Assert API response 200
    const forceResponse = await forceResponsePromise;
    const responseBody = await forceResponse.json();
    expect(
      forceResponse.status(),
      `Failed with ${JSON.stringify(responseBody)}`,
    ).toBe(200);

    // 14. Assert API response body
    expect(responseBody.renewal).toBeDefined();
    expect(responseBody.renewal.status).toBeDefined();

    // 15. Assert toast
    await detailPage.expectToast("Renewal forced");

    // 16. Assert StatusBadge updates (wait for it NOT to be Scheduled)
    await expect(detailPage.statusBadge).not.toContainText("Scheduled", {
      timeout: 10_000,
    });

    // 17. Assert attempt history shows row #1
    await detailPage.expectAttemptRow(1);
  });

  test("approves pending changes on a renewal cycle", async ({ page }) => {
    // 1. Seed subscription + renewal_cycle (approval pending)
    const { reference, cycleId } = seedSubscriptionWithRenewalCycle({
      approvalRequired: true,
      approvalStatus: "pending",
      cycleStatus: "scheduled",
    });

    // 2-4. Navigate via queue and wait for load
    await detailPage.gotoFromQueue(reference);
    await detailPage.waitForLoaded();

    // 5. Assert initial status
    await detailPage.expectCycleStatus("Scheduled");

    // 6-8. Open action dropdown and assert items
    await detailPage.openActionMenu();
    await expect(
      page.getByRole("menuitem", { name: "Approve changes" }),
    ).toBeVisible();
    await expect(
      page.getByRole("menuitem", { name: "Reject changes" }),
    ).toBeVisible();

    // 9-10. Click Approve and check drawer
    await detailPage.clickApproveChanges();
    await expect(
      page.getByRole("heading", { name: "Approve changes" }),
    ).toBeVisible();

    // 11. Fill reason
    await detailPage.fillDecisionReason("Approved by E2E test");

    // 12. Set up API intercept
    const approveResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes(`/admin/renewals/${cycleId}/approve-changes`) &&
        response.request().method() === "POST",
    );

    // 13. Submit drawer
    await detailPage.submitDecision("Approve");

    // 14. Confirm prompt
    await detailPage.confirmPrompt("Approve");

    // 15-16. Assert API response 200 and request payload
    const approveResponse = await approveResponsePromise;
    const approveResponseBody = await approveResponse.json();
    expect(
      approveResponse.status(),
      `Failed with ${JSON.stringify(approveResponseBody)}`,
    ).toBe(200);

    const requestPayload = approveResponse.request().postDataJSON();
    expect(requestPayload).toMatchObject({ reason: "Approved by E2E test" });

    // 17. Assert toast
    await detailPage.expectToast("Pending changes approved");

    // 18. Assert drawer closes
    await expect(page.getByRole("dialog")).toBeHidden();

    // 19. Assert approval summary
    await detailPage.expectApprovalStatus("Approved");

    // 20-21. Open action dropdown and verify item visibility
    await detailPage.openActionMenu();
    await expect(
      page.getByRole("menuitem", { name: "Approve changes" }),
    ).toBeHidden();
    await expect(
      page.getByRole("menuitem", { name: "Reject changes" }),
    ).toBeHidden();
    await expect(
      page.getByRole("menuitem", { name: "Force renewal" }),
    ).toBeVisible();
  });
});
