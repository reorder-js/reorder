import { Page, Locator, expect } from "@playwright/test";

export class RenewalDetailPage {
  readonly page: Page;

  // Header locators
  readonly heading: Locator;
  readonly statusBadge: Locator;
  readonly actionMenuTrigger: Locator;

  // Drawer/Decision locators
  readonly drawerHeading: Locator;
  readonly reasonTextarea: Locator;

  // Approval summary locators
  readonly approvalSummaryHeading: Locator;
  readonly approvalStatusBadge: Locator;

  // Attempt history locators
  readonly attemptHistoryHeading: Locator;

  constructor(page: Page) {
    this.page = page;

    // Header
    this.heading = page.getByRole("heading", { level: 1 });

    // Look for the flex container holding header actions (status badge + dropdown)
    const headerActions = page.locator("div.flex.items-center.gap-x-2").first();
    this.statusBadge = headerActions.locator("span").first();
    this.actionMenuTrigger = headerActions.locator("button").last();
  }

  /** Navigate directly to the renewal detail page by cycle ID */
  async goto(renewalCycleId: string): Promise<void> {
    await this.page.goto(`/app/subscriptions/renewals/${renewalCycleId}`);
  }

  /** Navigate via the renewals queue — search for a subscription reference, click matching row */
  async gotoFromQueue(subscriptionReference: string): Promise<void> {
    await this.page.goto("/app/subscriptions/renewals");
    await expect(
      this.page.getByRole("heading", { name: "Renewals" }),
    ).toBeVisible({ timeout: 15_000 });

    const searchInput = this.page.getByPlaceholder(/search/i);
    await searchInput.fill(subscriptionReference);
    await this.page.keyboard.press("Enter");

    // Wait for the table to filter (crude but effective: check row content)
    await this.page.waitForTimeout(1000);
    const row = this.page
      .getByRole("row", { name: new RegExp(subscriptionReference, "i") })
      .first();
    await row.click();
  }

  /** Wait for the detail page to fully load (heading "Renewal cycle" visible) */
  async waitForLoaded(): Promise<void> {
    await expect(
      this.page.getByText("Renewal cycle", { exact: true }),
    ).toBeVisible({ timeout: 15_000 });
  }

  /** Return the current cycle status text from the header StatusBadge */
  async getCycleStatusText(): Promise<string> {
    const text = await this.statusBadge.textContent();
    return text?.trim() ?? "";
  }

  /** Assert the header StatusBadge shows the expected cycle status */
  async expectCycleStatus(
    status: "Scheduled" | "Processing" | "Succeeded" | "Failed",
  ): Promise<void> {
    await expect(this.statusBadge).toContainText(status, { timeout: 10_000 });
  }

  /** Open the action dropdown (EllipsisHorizontal icon button) */
  async openActionMenu(): Promise<void> {
    await this.actionMenuTrigger.click();
  }

  /** Click "Force renewal" in the open dropdown menu */
  async clickForceRenewal(): Promise<void> {
    await this.page.getByRole("menuitem", { name: "Force renewal" }).click();
  }

  /** Click "Approve changes" in the open dropdown menu */
  async clickApproveChanges(): Promise<void> {
    await this.page.getByRole("menuitem", { name: "Approve changes" }).click();
  }

  /** Click "Reject changes" in the open dropdown menu */
  async clickRejectChanges(): Promise<void> {
    await this.page.getByRole("menuitem", { name: "Reject changes" }).click();
  }

  /** Confirm the Medusa usePrompt confirmation dialog by clicking the confirm button */
  async confirmPrompt(confirmText: string): Promise<void> {
    await this.page
      .getByRole("button", { name: confirmText, exact: true })
      .click();
  }

  /** Assert a toast notification with the given text appears */
  async expectToast(text: string): Promise<void> {
    await expect(this.page.getByText(text)).toBeVisible({ timeout: 10_000 });
  }

  /** Fill the reason textarea in the approval/rejection Drawer */
  async fillDecisionReason(reason: string): Promise<void> {
    const textarea = this.page
      .locator("#decision-reason")
      .or(this.page.getByLabel("Reason"));
    await textarea.fill(reason);
  }

  /** Click the submit button ("Approve" or "Reject") in the decision Drawer footer */
  async submitDecision(buttonText: "Approve" | "Reject"): Promise<void> {
    const dialog = this.page.getByRole("dialog");
    await dialog.getByRole("button", { name: buttonText, exact: true }).click();
  }

  /** Assert the Approval summary section shows the expected approval status badge */
  async expectApprovalStatus(
    status: "Pending" | "Approved" | "Rejected" | "Not required",
  ): Promise<void> {
    // Look within the Approval summary section
    const section = this.page
      .locator("div", {
        has: this.page.getByRole("heading", { name: "Approval summary" }),
      })
      .first();
    // Use evaluate or generic locator within the section to find the badge
    await expect(section).toContainText(status, { timeout: 10_000 });
  }

  /** Assert a row exists in the Attempt history table with the given attempt number */
  async expectAttemptRow(attemptNo: number): Promise<void> {
    await expect(
      this.page.getByText(`#${attemptNo}`, { exact: true }),
    ).toBeVisible({ timeout: 10_000 });
  }
}
