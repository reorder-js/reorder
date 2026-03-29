import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260329194835 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "subscription" add column if not exists "cart_id" text null, add column if not exists "payment_context" jsonb null;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_subscription_cart_id" ON "subscription" ("cart_id") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop index if exists "IDX_subscription_cart_id";`);
    this.addSql(`alter table if exists "subscription" drop column if exists "cart_id", drop column if exists "payment_context";`);
  }

}
