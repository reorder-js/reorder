import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260401204521 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "subscription_log" drop constraint if exists "subscription_log_dedupe_key_unique";`);
    this.addSql(`create table if not exists "subscription_log" ("id" text not null, "subscription_id" text not null, "customer_id" text null, "event_type" text check ("event_type" in ('subscription.paused', 'subscription.resumed', 'subscription.canceled', 'subscription.plan_change_scheduled', 'subscription.shipping_address_updated', 'renewal.cycle_created', 'renewal.approval_approved', 'renewal.approval_rejected', 'renewal.force_requested', 'renewal.succeeded', 'renewal.failed', 'dunning.started', 'dunning.retry_executed', 'dunning.recovered', 'dunning.unrecovered', 'dunning.retry_schedule_updated', 'cancellation.case_started', 'cancellation.recommendation_generated', 'cancellation.offer_applied', 'cancellation.reason_updated', 'cancellation.finalized')) not null, "actor_type" text check ("actor_type" in ('user', 'system', 'scheduler')) not null, "actor_id" text null, "subscription_reference" text not null, "customer_name" text null, "product_title" text null, "variant_title" text null, "reason" text null, "dedupe_key" text not null, "previous_state" jsonb null, "new_state" jsonb null, "changed_fields" jsonb null, "metadata" jsonb null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "subscription_log_pkey" primary key ("id"));`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_subscription_log_dedupe_key_unique" ON "subscription_log" ("dedupe_key") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_subscription_log_deleted_at" ON "subscription_log" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_subscription_log_subscription_id" ON "subscription_log" ("subscription_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_subscription_log_customer_id" ON "subscription_log" ("customer_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_subscription_log_event_type" ON "subscription_log" ("event_type") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_subscription_log_created_at" ON "subscription_log" ("created_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_subscription_log_subscription_id_created_at" ON "subscription_log" ("subscription_id", "created_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_subscription_log_customer_id_created_at" ON "subscription_log" ("customer_id", "created_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_subscription_log_event_type_created_at" ON "subscription_log" ("event_type", "created_at") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "subscription_log" cascade;`);
  }

}
