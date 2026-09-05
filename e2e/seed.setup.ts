import { execFileSync } from "child_process";
import { test as setup, expect, request } from "@playwright/test";

const BASE_URL = process.env.ADMIN_BASE_URL ?? "http://localhost:9000";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "admin@medusa-test.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "supersecret";
const DB_URL =
  process.env.DATABASE_URL ??
  "postgres://postgres:Kasperski1@localhost/medusa-my-medusa-store";

/**
 * Seed a subscription record if none exist.
 *
 * The Reorder plugin has no admin "create subscription" endpoint — subscriptions
 * are created through the store checkout flow. For E2E test isolation we insert
 * directly into the subscription module table, which is the same approach the
 * Jest integration tests use (via module service).
 */
setup("seed subscription for e2e", async ({}) => {
  const api = await request.newContext({ baseURL: BASE_URL });

  // 1. Verify backend is healthy
  const health = await api.get("/health");
  expect(health.ok()).toBeTruthy();

  // 2. Authenticate to get a JWT
  const authRes = await api.post("/auth/user/emailpass", {
    data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  });
  expect(authRes.ok()).toBeTruthy();
  const { token } = await authRes.json();

  // 3. Check if there's already at least one subscription
  const listRes = await api.get("/admin/subscriptions?limit=1", {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(listRes.ok()).toBeTruthy();
  const { subscriptions } = await listRes.json();

  if (subscriptions.length > 0) {
    console.log(
      `[e2e-seed] Found ${subscriptions.length} existing subscription(s), skipping seed.`
    );
    await api.dispose();
    return;
  }

  // 4. Insert subscription via psql (mirrors integration-tests/helpers/subscription-fixtures.ts)
  const now = new Date().toISOString();
  const futureRenewal = new Date(
    Date.now() + 30 * 24 * 60 * 60 * 1000
  ).toISOString();
  const ts = Date.now();
  const reference = `E2E-SUB-${ts}`;

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
    `  'cus_e2e_${ts}', 'cart_e2e_${ts}',`,
    `  'prod_e2e_${ts}', 'variant_e2e_${ts}',`,
    `  'month', 1,`,
    `  '${now}', '${futureRenewal}',`,
    `  false, false,`,
    `  '{"email":"e2e@test.com","full_name":"E2E Customer"}'::jsonb,`,
    `  '{"product_id":"prod_e2e","product_title":"E2E Product","variant_id":"var_e2e","variant_title":"Default","sku":"E2E-SKU-001"}'::jsonb,`,
    `  '{"discount_type":"percentage","discount_value":0,"label":null}'::jsonb,`,
    `  '{"first_name":"E2E","last_name":"Tester","address_1":"Test St 1","city":"Warsaw","postal_code":"00-001","country_code":"PL"}'::jsonb,`,
    `  '{"payment_provider_id":"pp_stripe_stripe"}'::jsonb,`,
    `  '${now}', '${now}'`,
    `);`,
  ].join(" ");

  execFileSync("psql", [DB_URL, "-c", sql], { stdio: "pipe" });
  console.log(`[e2e-seed] Inserted subscription ${reference}`);

  // 5. Verify the subscription appears in the admin API
  const verifyRes = await api.get(
    `/admin/subscriptions?q=${reference}&limit=1`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  expect(verifyRes.ok()).toBeTruthy();
  const verified = await verifyRes.json();
  expect(verified.subscriptions.length).toBe(1);

  await api.dispose();
});
