import { Page, Locator, expect } from "@playwright/test";

export class SubscriptionDetailPage {
  readonly page: Page;

  // Header locators
  readonly heading: Locator;
  readonly statusBadge: Locator;
  readonly actionMenuTrigger: Locator;

  constructor(page: Page) {
    this.page = page;

    // The h1 heading contains the subscription reference (e.g. "SUB-01J…")
    this.heading = page.getByRole("heading", { name: /SUB-/ });

    // StatusBadge sits in the header flex row, to the left of the action trigger.
    // It is the only element containing the status text next to the icon button.
    this.statusBadge = page
      .locator("div.flex.items-center.gap-x-2")
      .first()
      .locator("span")
      .first();

    // The IconButton that triggers the DropdownMenu — the last button in the
    // header actions area (the only transparent icon button there).
    this.actionMenuTrigger = page
      .locator("div.flex.items-center.gap-x-2")
      .first()
      .getByRole("button");
  }

  /** Navigate directly to the subscription detail page by ID. */
  async goto(subscriptionId: string): Promise<void> {
    await this.page.goto(`/app/subscriptions/${subscriptionId}`);
    await this.waitForLoaded();
  }

  /**
   * Navigate via the list page — searches for `reference` and clicks the
   * matching row.
   */
  async gotoFromList(reference: string): Promise<void> {
    await this.page.goto("/app/subscriptions");
    await expect(
      this.page.getByRole("heading", { name: "Subscriptions" })
    ).toBeVisible({ timeout: 15_000 });

    // Search for the specific reference
    const searchInput = this.page.getByPlaceholder(/search/i);
    await searchInput.fill(reference);

    // Wait for the row matching this reference to appear and click it
    const matchingRow = this.page.getByRole("row", { name: reference });
    await expect(matchingRow).toBeVisible({ timeout: 10_000 });
    await matchingRow.click();

    await this.waitForLoaded();
  }

  /** Wait for the detail page to fully load (heading visible). */
  async waitForLoaded(): Promise<void> {
    await expect(this.heading).toBeVisible({ timeout: 15_000 });
  }

  /** Return the current status text from the header StatusBadge. */
  async getStatusText(): Promise<string> {
    // The StatusBadge in the header: locate it via the container that holds
    // both the badge and the action button.
    const badge = this.page
      .locator("div.flex.items-start.justify-between")
      .getByText(/^(Active|Paused|Cancelled|Past due)$/i)
      .first();
    return (await badge.textContent()) ?? "";
  }

  /** Assert the header StatusBadge shows the expected status. */
  async expectStatus(
    status: "Active" | "Paused" | "Cancelled" | "Past due"
  ): Promise<void> {
    const badge = this.page
      .locator("div.flex.items-start.justify-between")
      .getByText(status)
      .first();
    await expect(badge).toBeVisible({ timeout: 10_000 });
  }

  /** Open the action dropdown (EllipsisHorizontal icon button). */
  async openActionMenu(): Promise<void> {
    await this.actionMenuTrigger.click();
    await expect(this.page.getByRole("menu")).toBeVisible({ timeout: 5_000 });
  }

  /** Click a named action in the open dropdown menu. */
  async clickAction(name: "Pause" | "Resume" | "Cancel"): Promise<void> {
    await this.page.getByRole("menuitem", { name }).click();
  }

  /**
   * Confirm the Medusa usePrompt confirmation dialog by clicking the button
   * whose text exactly matches `confirmText`.
   */
  async confirmPrompt(confirmText: string): Promise<void> {
    // Medusa usePrompt uses Radix AlertDialog which renders as role="alertdialog"
    const dialog = this.page.locator('[role="dialog"], [role="alertdialog"]');
    await expect(dialog).toBeVisible({ timeout: 5_000 });
    await dialog.getByRole("button", { name: confirmText, exact: true }).click();
  }

  /** Assert a toast notification containing `text` appears. */
  async expectToast(text: string): Promise<void> {
    await expect(this.page.getByText(text)).toBeVisible({ timeout: 10_000 });
  }

  /**
   * Full action flow: open menu → click action → confirm prompt → wait for
   * toast.
   */
  async executeAction(
    action: "Pause" | "Resume" | "Cancel",
    confirmText: string,
    toastText: string
  ): Promise<void> {
    await this.openActionMenu();
    await this.clickAction(action);
    await this.confirmPrompt(confirmText);
    await this.expectToast(toastText);
  }
}
