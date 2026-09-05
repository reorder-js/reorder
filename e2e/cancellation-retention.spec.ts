import { execFileSync } from "child_process";
import { expect, test } from "@playwright/test";
import { CancellationCaseDetailPage } from "./pages/CancellationCaseDetailPage";
import { CancellationsListPage } from "./pages/CancellationsListPage";
import { SubscriptionDetailPage } from "./pages/SubscriptionDetailPage";

const DB_URL =
  process.env.DATABASE_URL ??
  "postgres://postgres:Kasperski1@localhost/medusa-my-medusa-store";

type SeededCancellationCase = {
  cancellationCaseId: string;
  reference: string;
  subscriptionId: string;
};

function seedActiveCancellationCase(): SeededCancellationCase {
  const timestamp = Date.now();
  const subscriptionId = `sub_e2e_cancellation_${timestamp}`;
  const cancellationCaseId = `case_e2e_cancellation_${timestamp}`;
  const reference = `SUB-E2E-CANCELLATION-${timestamp}`;
  const now = new Date().toISOString();
  const nextRenewalAt = new Date(
    timestamp + 30 * 24 * 60 * 60 * 1000,
  ).toISOString();

  const sql = [
    "INSERT INTO subscription (",
    "  id, reference, status,",
    "  customer_id, cart_id, product_id, variant_id,",
    "  frequency_interval, frequency_value,",
    "  started_at, next_renewal_at,",
    "  skip_next_cycle, is_trial,",
    "  customer_snapshot, product_snapshot, pricing_snapshot,",
    "  shipping_address, payment_context,",
    "  created_at, updated_at",
    ") VALUES (",
    `  '${subscriptionId}', '${reference}', 'active',`,
    `  'cus_e2e_cancellation_${timestamp}', 'cart_e2e_cancellation_${timestamp}',`,
    `  'prod_e2e_cancellation_${timestamp}', 'variant_e2e_cancellation_${timestamp}',`,
    "  'month', 1,",
    `  '${now}', '${nextRenewalAt}',`,
    "  false, false,",
    `  '{"email":"e2e-cancellation@test.com","full_name":"E2E Cancellation Test"}'::jsonb,`,
    `  '{"product_id":"prod_e2e_cancellation","product_title":"E2E Cancellation Product","variant_id":"var_e2e_cancellation","variant_title":"Default","sku":"E2E-SKU-CANCELLATION"}'::jsonb,`,
    `  '{"discount_type":"percentage","discount_value":0,"label":null}'::jsonb,`,
    `  '{"first_name":"E2E","last_name":"Cancellation","address_1":"Test St 1","city":"Warsaw","postal_code":"00-001","country_code":"PL"}'::jsonb,`,
    `  '{"payment_provider_id":"pp_stripe_stripe"}'::jsonb,`,
    `  '${now}', '${now}'`,
    ");",
    "INSERT INTO cancellation_case (",
    "  id, subscription_id, status, reason, reason_category, metadata,",
    "  created_at, updated_at",
    ") VALUES (",
    `  '${cancellationCaseId}', '${subscriptionId}', 'requested',`,
    "  'Customer requested cancellation', 'price', '{}'::jsonb,",
    `  '${now}', '${now}'`,
    ");",
  ].join(" ");

  execFileSync("psql", [DB_URL, "-c", sql], { stdio: "pipe" });

  return { cancellationCaseId, reference, subscriptionId };
}

test.describe("Cancellation & Retention", () => {
  let cancellationDetailPage: CancellationCaseDetailPage;
  let cancellationsListPage: CancellationsListPage;
  let subscriptionDetailPage: SubscriptionDetailPage;

  test.beforeEach(async ({ page }) => {
    cancellationDetailPage = new CancellationCaseDetailPage(page);
    cancellationsListPage = new CancellationsListPage(page);
    subscriptionDetailPage = new SubscriptionDetailPage(page);
  });

  test("applies a pause retention offer to an active case", async ({ page }) => {
    const seededCase = seedActiveCancellationCase();

    await cancellationsListPage.goto();
    await cancellationsListPage.openCase(seededCase.reference);
    await cancellationDetailPage.waitForLoaded();
    await cancellationDetailPage.expectCaseStatus("Requested");

    const applyOfferResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes(
          `/admin/cancellations/${seededCase.cancellationCaseId}/apply-offer`,
        ) && response.request().method() === "POST",
    );

    await cancellationDetailPage.openActionMenu();
    await cancellationDetailPage.openApplyRetentionOffer();
    await cancellationDetailPage.selectPauseOffer();
    await cancellationDetailPage.fillPauseCycles("2");
    await cancellationDetailPage.submitDrawer("Apply offer");
    await cancellationDetailPage.confirmPrompt("Apply pause offer");

    const applyOfferResponse = await applyOfferResponsePromise;
    const applyOfferBody = await applyOfferResponse.json();
    expect(
      applyOfferResponse.status(),
      `Failed with ${JSON.stringify(applyOfferBody)}`,
    ).toBe(200);
    expect(applyOfferResponse.request().postDataJSON()).toMatchObject({
      offer_type: "pause_offer",
      offer_payload: {
        pause_offer: {
          pause_cycles: 2,
          resume_at: null,
        },
      },
    });
    expect(applyOfferBody.cancellation).toMatchObject({
      id: seededCase.cancellationCaseId,
      status: "paused",
      final_outcome: "paused",
    });

    await cancellationDetailPage.expectToast("Retention offer applied");
    await expect(cancellationDetailPage.drawer).toBeHidden();
    await cancellationDetailPage.expectCaseStatus("Paused");

    await subscriptionDetailPage.goto(seededCase.subscriptionId);
    await subscriptionDetailPage.expectStatus("Paused");
  });

  test("finalizes cancellation when retention is rejected", async ({ page }) => {
    const seededCase = seedActiveCancellationCase();
    const reason = "Customer declined every retention option";

    await cancellationsListPage.goto();
    await cancellationsListPage.openCase(seededCase.reference);
    await cancellationDetailPage.waitForLoaded();
    await cancellationDetailPage.expectCaseStatus("Requested");

    const finalizeResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes(
          `/admin/cancellations/${seededCase.cancellationCaseId}/finalize`,
        ) && response.request().method() === "POST",
    );

    await cancellationDetailPage.openActionMenu();
    await cancellationDetailPage.openFinalizeCancellation();
    await cancellationDetailPage.fillFinalizeReason(reason);
    await cancellationDetailPage.selectFinalizeReasonCategory("Price");
    await cancellationDetailPage.submitDrawer("Continue");
    await cancellationDetailPage.confirmPrompt("Finalize cancellation");

    const finalizeResponse = await finalizeResponsePromise;
    const finalizeBody = await finalizeResponse.json();
    expect(
      finalizeResponse.status(),
      `Failed with ${JSON.stringify(finalizeBody)}`,
    ).toBe(200);
    expect(finalizeResponse.request().postDataJSON()).toMatchObject({
      reason,
      reason_category: "price",
    });
    expect(finalizeBody.cancellation).toMatchObject({
      id: seededCase.cancellationCaseId,
      status: "canceled",
      final_outcome: "canceled",
    });

    await cancellationDetailPage.expectToast("Cancellation finalized");
    await expect(cancellationDetailPage.drawer).toBeHidden();
    await cancellationDetailPage.expectCaseStatus("Canceled");

    await cancellationsListPage.goto();
    await cancellationsListPage.expectCaseOutcome(
      seededCase.reference,
      "Canceled",
    );

    await subscriptionDetailPage.goto(seededCase.subscriptionId);
    await subscriptionDetailPage.expectStatus("Cancelled");
  });
});
