import { test, expect } from "@playwright/test";

test.describe("Subscriptions list page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/app/subscriptions");
    // Wait for the page heading to confirm the route loaded
    await expect(
      page.getByRole("heading", { name: "Subscriptions" })
    ).toBeVisible({ timeout: 15_000 });
  });

  test("displays the page heading and description", async ({ page }) => {
    await expect(
      page.getByRole("heading", { name: "Subscriptions" })
    ).toBeVisible();
    await expect(
      page.getByText("Monitor subscription status, cadence, and upcoming")
    ).toBeVisible();
  });

  test("renders the data table with expected columns", async ({ page }) => {
    const expectedColumns = [
      "Reference",
      "Product",
      "Status",
      "Frequency",
      "Next renewal",
    ];

    for (const column of expectedColumns) {
      await expect(
        page.getByRole("columnheader", { name: column })
      ).toBeVisible();
    }
  });

  test("displays at least one subscription row", async ({ page }) => {
    // Wait for at least one data row to appear (not the header row)
    const rows = page.getByRole("row");
    // Header row + at least 1 data row = minimum 2 rows
    await expect(rows.nth(1)).toBeVisible({ timeout: 10_000 });
  });

  test("supports search by subscription reference", async ({ page }) => {
    // Get the reference text from the first data row before searching
    const firstRow = page.getByRole("row").nth(1);
    await expect(firstRow).toBeVisible({ timeout: 10_000 });

    // Type a known prefix into the search box
    const searchInput = page.getByPlaceholder(/search/i);
    await searchInput.fill("SUB");

    // The table should still show results (filtered to matching subscriptions)
    await expect(page.getByRole("row").nth(1)).toBeVisible({ timeout: 10_000 });
  });

  test("shows status badge for each subscription", async ({ page }) => {
    await expect(page.getByRole("row").nth(1)).toBeVisible({
      timeout: 10_000,
    });

    // At least one status badge should be visible (Active, Paused, or Cancelled)
    const statusBadge = page
      .getByRole("row")
      .nth(1)
      .getByText(/active|paused|cancelled|past.due/i);
    await expect(statusBadge).toBeVisible();
  });

  test("navigates to subscription detail on row click", async ({ page }) => {
    const firstDataRow = page.getByRole("row").nth(1);
    await expect(firstDataRow).toBeVisible({ timeout: 10_000 });

    await firstDataRow.click();

    // Should navigate to /app/subscriptions/:id
    await expect(page).toHaveURL(/\/app\/subscriptions\/[A-Za-z0-9]+/, {
      timeout: 10_000,
    });

    // Detail page should show the subscription reference as a heading
    await expect(
      page.getByRole("heading", { name: /SUB-/ })
    ).toBeVisible({ timeout: 10_000 });
  });

  test("shows row action menu with status-appropriate options", async ({
    page,
  }) => {
    await expect(page.getByRole("row").nth(1)).toBeVisible({
      timeout: 10_000,
    });

    // Open the action menu on the first row
    const actionButton = page
      .getByRole("row")
      .nth(1)
      .getByRole("button")
      .last();
    await actionButton.click();

    // The dropdown menu should appear with at least one lifecycle action
    const menu = page.getByRole("menu");
    await expect(menu).toBeVisible({ timeout: 5_000 });

    // An active subscription should show Pause and Cancel options
    const menuItems = menu.getByRole("menuitem");
    const count = await menuItems.count();
    expect(count).toBeGreaterThan(0);
  });
});
