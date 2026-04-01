import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260401143914 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table if not exists "cancellation_case" ("id" text not null, "subscription_id" text not null, "status" text check ("status" in ('requested', 'evaluating_retention', 'retention_offered', 'retained', 'paused', 'canceled')) not null default 'requested', "reason" text null, "reason_category" text check ("reason_category" in ('price', 'product_fit', 'delivery', 'billing', 'temporary_pause', 'switched_competitor', 'other')) null, "notes" text null, "recommended_action" text check ("recommended_action" in ('pause_offer', 'discount_offer', 'bonus_offer', 'direct_cancel')) null, "final_outcome" text check ("final_outcome" in ('retained', 'paused', 'canceled')) null, "finalized_at" timestamptz null, "finalized_by" text null, "cancellation_effective_at" timestamptz null, "metadata" jsonb null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "cancellation_case_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_cancellation_case_deleted_at" ON "cancellation_case" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_cancellation_case_subscription_id" ON "cancellation_case" ("subscription_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_cancellation_case_status" ON "cancellation_case" ("status") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_cancellation_case_final_outcome" ON "cancellation_case" ("final_outcome") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_cancellation_case_reason_category" ON "cancellation_case" ("reason_category") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_cancellation_case_created_at" ON "cancellation_case" ("created_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_cancellation_case_subscription_id_status" ON "cancellation_case" ("subscription_id", "status") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_cancellation_case_status_created_at" ON "cancellation_case" ("status", "created_at") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "retention_offer_event" ("id" text not null, "cancellation_case_id" text not null, "offer_type" text check ("offer_type" in ('pause_offer', 'discount_offer', 'bonus_offer')) not null, "offer_payload" jsonb null, "decision_status" text check ("decision_status" in ('proposed', 'accepted', 'rejected', 'applied', 'expired')) not null default 'proposed', "decision_reason" text null, "decided_at" timestamptz null, "decided_by" text null, "applied_at" timestamptz null, "metadata" jsonb null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "retention_offer_event_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_retention_offer_event_cancellation_case_id" ON "retention_offer_event" ("cancellation_case_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_retention_offer_event_deleted_at" ON "retention_offer_event" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_retention_offer_event_offer_type" ON "retention_offer_event" ("offer_type") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_retention_offer_event_decision_status" ON "retention_offer_event" ("decision_status") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_retention_offer_event_created_at" ON "retention_offer_event" ("created_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_retention_offer_event_cancellation_case_id_created_at" ON "retention_offer_event" ("cancellation_case_id", "created_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_retention_offer_event_offer_type_decision_status" ON "retention_offer_event" ("offer_type", "decision_status") WHERE deleted_at IS NULL;`);

    this.addSql(`alter table if exists "retention_offer_event" add constraint "retention_offer_event_cancellation_case_id_foreign" foreign key ("cancellation_case_id") references "cancellation_case" ("id") on update cascade;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "retention_offer_event" drop constraint if exists "retention_offer_event_cancellation_case_id_foreign";`);

    this.addSql(`drop table if exists "cancellation_case" cascade;`);

    this.addSql(`drop table if exists "retention_offer_event" cascade;`);
  }

}
