import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260327143452 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "subscription" drop constraint if exists "subscription_reference_unique";`);
    this.addSql(`create table if not exists "subscription" ("id" text not null, "reference" text not null, "status" text check ("status" in ('active', 'paused', 'cancelled', 'past_due')) not null default 'active', "customer_id" text not null, "product_id" text not null, "variant_id" text not null, "frequency_interval" text check ("frequency_interval" in ('week', 'month', 'year')) not null, "frequency_value" integer not null, "started_at" timestamptz not null, "next_renewal_at" timestamptz null, "last_renewal_at" timestamptz null, "paused_at" timestamptz null, "cancelled_at" timestamptz null, "cancel_effective_at" timestamptz null, "skip_next_cycle" boolean not null default false, "is_trial" boolean not null default false, "trial_ends_at" timestamptz null, "customer_snapshot" jsonb null, "product_snapshot" jsonb not null, "pricing_snapshot" jsonb null, "shipping_address" jsonb not null, "pending_update_data" jsonb null, "metadata" jsonb null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "subscription_pkey" primary key ("id"));`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_subscription_reference_unique" ON "subscription" ("reference") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_subscription_deleted_at" ON "subscription" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_subscription_status" ON "subscription" ("status") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_subscription_next_renewal_at" ON "subscription" ("next_renewal_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_subscription_customer_id" ON "subscription" ("customer_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_subscription_product_id" ON "subscription" ("product_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_subscription_variant_id" ON "subscription" ("variant_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_subscription_is_trial" ON "subscription" ("is_trial") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_subscription_skip_next_cycle" ON "subscription" ("skip_next_cycle") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "subscription" cascade;`);
  }

}
