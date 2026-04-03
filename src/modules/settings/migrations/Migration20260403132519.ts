import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260403132519 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "subscription_settings" drop constraint if exists "subscription_settings_settings_key_unique";`);
    this.addSql(`create table if not exists "subscription_settings" ("id" text not null, "settings_key" text not null default 'global', "default_trial_days" integer not null default 0, "dunning_retry_intervals" jsonb not null, "max_dunning_attempts" integer not null default 3, "default_renewal_behavior" text check ("default_renewal_behavior" in ('process_immediately', 'require_review_for_pending_changes')) not null default 'process_immediately', "default_cancellation_behavior" text check ("default_cancellation_behavior" in ('recommend_retention_first', 'allow_direct_cancellation')) not null default 'recommend_retention_first', "version" integer not null default 0, "updated_by" text null, "metadata" jsonb null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "subscription_settings_pkey" primary key ("id"));`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_subscription_settings_settings_key_unique" ON "subscription_settings" ("settings_key") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_subscription_settings_deleted_at" ON "subscription_settings" ("deleted_at") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "subscription_settings" cascade;`);
  }

}
