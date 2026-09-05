import { expect, Locator, Page } from "@playwright/test";

export class CancellationsListPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly searchInput: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole("heading", {
      name: "Cancellation & Retention",
    });
    this.searchInput = page.getByPlaceholder("Search");
  }

  async goto(): Promise<void> {
    await this.page.goto("/app/subscriptions/cancellations");
    await expect(this.heading).toBeVisible({ timeout: 15_000 });
  }

  getCaseRow(reference: string): Locator {
    return this.page.getByRole("row").filter({ hasText: reference });
  }

  async openCase(reference: string): Promise<void> {
    await this.searchInput.fill(reference);

    const row = this.getCaseRow(reference);
    await expect(row).toBeVisible({ timeout: 10_000 });
    await row.click();
  }

  async expectCaseOutcome(
    reference: string,
    outcome: "Retained" | "Paused" | "Canceled",
  ): Promise<void> {
    await this.searchInput.fill(reference);
    await expect(this.getCaseRow(reference)).toContainText(outcome, {
      timeout: 10_000,
    });
  }
}
