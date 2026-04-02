import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260402183116 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table if not exists "subscription_metrics_daily" ("id" text not null, "metric_date" timestamptz not null, "subscription_id" text not null, "customer_id" text not null, "product_id" text not null, "variant_id" text not null, "status" text check ("status" in ('active', 'paused', 'cancelled', 'past_due')) not null, "frequency_interval" text check ("frequency_interval" in ('week', 'month', 'year')) not null, "frequency_value" integer not null, "currency_code" text null, "is_active" boolean not null default false, "active_subscriptions_count" integer not null default 0, "mrr_amount" numeric null, "churned_subscriptions_count" integer not null default 0, "churn_reason_category" text check ("churn_reason_category" in ('price', 'product_fit', 'delivery', 'billing', 'temporary_pause', 'switched_competitor', 'other')) null, "source_snapshot" jsonb null, "metadata" jsonb null, "raw_mrr_amount" jsonb null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "subscription_metrics_daily_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_subscription_metrics_daily_deleted_at" ON "subscription_metrics_daily" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_subscription_metrics_daily_metric_date" ON "subscription_metrics_daily" ("metric_date") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_subscription_metrics_daily_subscription_id" ON "subscription_metrics_daily" ("subscription_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_subscription_metrics_daily_product_id" ON "subscription_metrics_daily" ("product_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_subscription_metrics_daily_status" ON "subscription_metrics_daily" ("status") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_subscription_metrics_daily_currency_code" ON "subscription_metrics_daily" ("currency_code") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_subscription_metrics_daily_frequency_interval" ON "subscription_metrics_daily" ("frequency_interval") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_subscription_metrics_daily_frequency_value" ON "subscription_metrics_daily" ("frequency_value") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_subscription_metrics_daily_metric_date_status" ON "subscription_metrics_daily" ("metric_date", "status") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_subscription_metrics_daily_metric_date_product_id" ON "subscription_metrics_daily" ("metric_date", "product_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_subscription_metrics_daily_metric_date_frequency_interval_frequency_value" ON "subscription_metrics_daily" ("metric_date", "frequency_interval", "frequency_value") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_subscription_metrics_daily_metric_date_currency_code" ON "subscription_metrics_daily" ("metric_date", "currency_code") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_subscription_metrics_daily_metric_date_churn_reason_category" ON "subscription_metrics_daily" ("metric_date", "churn_reason_category") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "subscription_metrics_daily" cascade;`);
  }

}
