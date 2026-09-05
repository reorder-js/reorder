import { Page, Locator, expect } from "@playwright/test";

export class PlanFormPage {
  readonly page: Page;
  
  // Locators
  readonly createPlanButton: Locator;
  readonly nameInput: Locator;
  readonly scopeSelectTrigger: Locator;
  readonly selectProductBtn: Locator;
  readonly productSearchInput: Locator;
  readonly productModalApplyBtn: Locator;
  
  // Frequencies
  readonly addFrequencyBtn: Locator;
  
  // Submit
  readonly createSaveBtn: Locator;
  
  constructor(page: Page) {
    this.page = page;
    
    // Page list actions
    this.createPlanButton = page.getByRole("button", { name: "Create" }).filter({ hasText: "Create" });
    
    // Form fields
    this.nameInput = page.getByRole("textbox", { name: /name/i }).first(); // id="create-name"
    this.scopeSelectTrigger = page.getByRole("combobox", { name: /scope/i }).first();
    
    // The "Select" or "Change" button for the product selection is the first secondary button in the product section.
    // Let's use a more robust locator based on the Text "Product" above it.
    this.selectProductBtn = page.locator("div.grid.gap-3.rounded-lg").filter({ hasText: "Product" }).getByRole("button", { name: /Select|Change/i }).first();
    
    // Product picker modal
    this.productSearchInput = page.getByPlaceholder(/Search products/i);
    this.productModalApplyBtn = page.getByRole("button", { name: "Apply" });
    
    // Frequencies section
    this.addFrequencyBtn = page.getByRole("button", { name: "Add frequency" });
    
    // Save/Submit
    // It's in the modal header
    this.createSaveBtn = page.getByRole("button", { name: "Create" }).filter({ hasText: "Create" }).last(); // the modal action
  }
  
  async goto() {
    await this.page.goto("/app/subscriptions/plans-offers");
    await expect(this.page.getByRole("heading", { name: "Plans & Offers" })).toBeVisible({ timeout: 15_000 });
  }

  async openCreateModal() {
    await this.createPlanButton.click();
    await expect(this.page.getByRole("heading", { name: "Create plan offer" })).toBeVisible({ timeout: 10_000 });
  }

  async fillName(name: string) {
    await this.nameInput.fill(name);
  }

  async selectScope(scope: "Product" | "Variant") {
    await this.scopeSelectTrigger.click();
    await this.page.getByRole("option", { name: scope }).click();
  }

  async setMinimumCycles(cycles: number) {
    const minCyclesInput = this.page.locator('input#minimum-cycles');
    await minCyclesInput.fill(cycles.toString());
  }

  async selectProduct(productTitle: string) {
    await this.selectProductBtn.click();
    await expect(this.page.getByRole("heading", { name: "Select product" })).toBeVisible({ timeout: 5_000 });
    
    await this.productSearchInput.fill(productTitle);
    
    // Wait for the row to appear in the table
    const row = this.page.getByRole("row", { name: productTitle }).first();
    await expect(row).toBeVisible({ timeout: 10_000 });
    
    // Click its checkbox
    const checkbox = row.getByRole("checkbox");
    await checkbox.click();
    
    await this.productModalApplyBtn.click();
    await expect(this.page.getByRole("heading", { name: "Select product" })).toBeHidden({ timeout: 5_000 });
  }
  
  async setFrequencyRow(index: number, interval: "Weekly" | "Monthly" | "Yearly", value: number) {
    const intervalTrigger = this.page.locator('label').filter({ hasText: /^Interval$/ }).nth(index).locator('..').getByRole("combobox"); 
    await intervalTrigger.click();
    await this.page.getByRole("option", { name: interval }).click();
    
    const valueInput = this.page.locator('label').filter({ hasText: /^Value$/ }).nth(index).locator('..').getByRole("spinbutton");
    await valueInput.fill(value.toString());
  }
  
  async setDiscount(index: number, discountType: "Percentage" | "Fixed", discountValue: number) {
    // The switch for discount
    // It might be in a parent div that contains "Discount for this frequency" text
    const discountContainer = this.page.locator('div.flex.items-center.justify-between.rounded-lg').filter({ hasText: "Discount for this frequency" }).nth(index);
    const discountSwitch = discountContainer.getByRole("switch");
    
    const isChecked = await discountSwitch.getAttribute("aria-checked");
    if (isChecked !== "true") {
      await discountSwitch.click();
    }
    
    // Now type and value appear
    const typeTrigger = this.page.locator('label').filter({ hasText: "Discount type" }).nth(index).locator('..').getByRole("combobox");
    await typeTrigger.click();
    await this.page.getByRole("option", { name: discountType }).click();
    
    const dValueInput = this.page.locator('label').filter({ hasText: "Discount value" }).nth(index).locator('..').getByRole("spinbutton");
    await dValueInput.fill(discountValue.toString());
  }

  async submit() {
    // Because the "Create" button is the submit button for the form.
    // Note: The form header might have two 'Create' buttons if we aren't careful.
    // Let's use the one in the FocusModal.Header that has type="submit".
    const submitBtn = this.page.locator("form").getByRole("button", { name: "Create" });
    await submitBtn.click();
  }
}
