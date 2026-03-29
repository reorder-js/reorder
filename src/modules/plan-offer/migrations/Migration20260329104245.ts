import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260329104245 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`drop index if exists "IDX_plan_offer_created_at";`);
    this.addSql(`drop index if exists "IDX_plan_offer_updated_at";`);
    this.addSql(`drop index if exists "IDX_plan_offer_frequency_intervals";`);
    this.addSql(`drop index if exists "IDX_plan_offer_product_target_unique";`);
    this.addSql(`drop index if exists "IDX_plan_offer_variant_target_unique";`);
  }

  override async down(): Promise<void> {
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_plan_offer_created_at" ON "plan_offer" ("created_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_plan_offer_updated_at" ON "plan_offer" ("updated_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_plan_offer_frequency_intervals" ON "plan_offer" USING GIN ("frequency_intervals") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_plan_offer_product_target_unique" ON "plan_offer" ("product_id") WHERE scope = 'product' AND deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_plan_offer_variant_target_unique" ON "plan_offer" ("variant_id") WHERE scope = 'variant' AND deleted_at IS NULL;`);
  }

}
