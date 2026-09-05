import { test, expect, request } from "@playwright/test";
import { PlanFormPage } from "./pages/PlanFormPage";

const BASE_URL = process.env.ADMIN_BASE_URL ?? "http://localhost:9000";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "admin@medusa-test.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "supersecret";

test.describe("Plans & Offers - Subscription Plan Creation", () => {
  let seededProductId: string;
  let seededProductTitle: string;
  
  test.beforeEach(async ({ page }) => {
    const api = await request.newContext({ baseURL: BASE_URL });

    // 1. Authenticate to get a JWT
    const authRes = await api.post("/auth/user/emailpass", {
      data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
    });
    expect(authRes.ok()).toBeTruthy();
    const { token } = await authRes.json();
    
    // 2. Seed a test product via Medusa API
    seededProductTitle = `E2E Plan Product ${Date.now()}`;
    const productRes = await api.post("/admin/products", {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        title: seededProductTitle,
        options: [{ title: "Default", values: ["Default"] }],
        variants: [
          {
            title: "Default Variant",
            prices: [{ currency_code: "usd", amount: 1000 }],
            options: { "Default": "Default" }
          }
        ]
      }
    });
    
    // Sometimes Medusa API requires specific fields, let's keep it minimal but valid.
    // Let's ensure product was created
    expect(productRes.ok()).toBeTruthy();
    const productData = await productRes.json();
    seededProductId = productData.product.id;
    
    await api.dispose();
  });

  test("creates a product-level subscription plan successfully", async ({ page }) => {
    const planForm = new PlanFormPage(page);
    
    // 1. Setup API Intercept before action
    const apiPromise = page.waitForResponse(
      (response) => response.url().includes("/admin/subscription-offers") && response.request().method() === "POST"
    );
    
    // 2. Navigate and Open form
    await planForm.goto();
    await planForm.openCreateModal();
    
    // 3. Fill the form
    const planName = `E2E Plan ${Date.now()}`;
    await planForm.fillName(planName);
    
    // Default scope is Product in the UI, but we can re-select it
    await planForm.selectScope("Product");
    
    await planForm.selectProduct(seededProductTitle);
    
    // 4. Fill frequency row (index 0 is already present by default)
    await planForm.setFrequencyRow(0, "Monthly", 1);
    
    // 5. Fill discount for frequency row 0
    await planForm.setDiscount(0, "Percentage", 10);
    
    // 6. Save
    await planForm.submit();
    
    // 7. Verify API payload
    const response = await apiPromise;
    expect(response.ok()).toBeTruthy();
    
    const requestPayload = response.request().postDataJSON();
    expect(requestPayload).toMatchObject({
      name: planName,
      scope: "product",
      product_id: seededProductId,
      allowed_frequencies: [
        {
          interval: "month",
          value: 1
        }
      ],
      discounts: [
        {
          interval: "month",
          frequency_value: 1,
          type: "percentage",
          value: 10
        }
      ],
    });
    
    // 8. Verify UI Toast
    await expect(page.getByText("Plan offer created")).toBeVisible({ timeout: 5_000 });
    
    // 9. Verify the created plan appears in the table
    // It should navigate back or modal should close, and data table should show the plan name
    await expect(page.getByRole("heading", { name: "Create plan offer" })).toBeHidden({ timeout: 5_000 });
    
    // Search for the plan in the list to ensure it's there
    const searchInput = page.getByPlaceholder(/search/i);
    await searchInput.fill(planName);
    
    const row = page.getByRole("row", { name: planName });
    await expect(row).toBeVisible({ timeout: 10_000 });
  });
});
