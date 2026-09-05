import { expect, Locator, Page } from "@playwright/test";

type CancellationCaseStatus =
  | "Requested"
  | "Evaluating retention"
  | "Retention offered"
  | "Retained"
  | "Paused"
  | "Canceled";

export class CancellationCaseDetailPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly statusBadge: Locator;
  readonly actionMenuTrigger: Locator;
  readonly drawer: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole("heading", { level: 1 });

    const headerActions = page
      .locator("div.flex.items-center.gap-x-2")
      .first();
    this.statusBadge = headerActions.locator("span").first();
    this.actionMenuTrigger = headerActions.getByRole("button");
    this.drawer = page.getByRole("dialog");
  }

  async waitForLoaded(): Promise<void> {
    await expect(this.heading).toBeVisible({ timeout: 15_000 });
  }

  async expectCaseStatus(status: CancellationCaseStatus): Promise<void> {
    await expect(this.statusBadge).toContainText(status, { timeout: 10_000 });
  }

  async openActionMenu(): Promise<void> {
    await this.actionMenuTrigger.click();
    await expect(this.page.getByRole("menu")).toBeVisible({ timeout: 5_000 });
  }

  async openApplyRetentionOffer(): Promise<void> {
    await this.page
      .getByRole("menuitem", { name: "Apply retention offer" })
      .click();
    await expect(
      this.drawer.getByRole("heading", { name: "Apply retention offer" }),
    ).toBeVisible();
  }

  async openFinalizeCancellation(): Promise<void> {
    await this.page
      .getByRole("menuitem", { name: "Finalize cancellation" })
      .click();
    await expect(
      this.drawer.getByRole("heading", { name: "Finalize cancellation" }),
    ).toBeVisible();
  }

  async selectPauseOffer(): Promise<void> {
    await this.page.locator("#offer-type").click();
    await this.page.getByRole("option", { name: "Pause offer" }).click();
  }

  async fillPauseCycles(cycles: string): Promise<void> {
    await this.page.locator("#pause-cycles").fill(cycles);
  }

  async fillFinalizeReason(reason: string): Promise<void> {
    await this.page.locator("#finalize-reason").fill(reason);
  }

  async selectFinalizeReasonCategory(category: "Price"): Promise<void> {
    await this.page.locator("#finalize-reason-category").click();
    await this.page.getByRole("option", { name: category }).click();
  }

  async submitDrawer(buttonName: "Apply offer" | "Continue"): Promise<void> {
    await this.drawer.getByRole("button", { name: buttonName, exact: true }).click();
  }

  async confirmPrompt(
    confirmText: "Apply pause offer" | "Finalize cancellation",
  ): Promise<void> {
    const prompt = this.page.getByRole("alertdialog", {
      name: new RegExp(`^${confirmText}\\?$`),
    });
    await expect(prompt).toBeVisible({ timeout: 5_000 });
    await prompt
      .getByRole("button", { name: confirmText, exact: true })
      .click();
  }

  async expectToast(text: string): Promise<void> {
    await expect(this.page.getByText(text)).toBeVisible({ timeout: 10_000 });
  }
}
