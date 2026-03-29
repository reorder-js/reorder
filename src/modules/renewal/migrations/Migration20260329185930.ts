import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260329185930 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "renewal_attempt" drop constraint if exists "renewal_attempt_renewal_cycle_id_attempt_no_unique";`);
    this.addSql(`create table if not exists "renewal_cycle" ("id" text not null, "subscription_id" text not null, "scheduled_for" timestamptz not null, "processed_at" timestamptz null, "status" text check ("status" in ('scheduled', 'processing', 'succeeded', 'failed')) not null default 'scheduled', "approval_required" boolean not null default false, "approval_status" text check ("approval_status" in ('pending', 'approved', 'rejected')) null, "approval_decided_at" timestamptz null, "approval_decided_by" text null, "approval_reason" text null, "generated_order_id" text null, "applied_pending_update_data" jsonb null, "last_error" text null, "attempt_count" integer not null default 0, "metadata" jsonb null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "renewal_cycle_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_renewal_cycle_deleted_at" ON "renewal_cycle" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_renewal_cycle_subscription_id" ON "renewal_cycle" ("subscription_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_renewal_cycle_scheduled_for" ON "renewal_cycle" ("scheduled_for") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_renewal_cycle_status" ON "renewal_cycle" ("status") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_renewal_cycle_approval_required" ON "renewal_cycle" ("approval_required") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_renewal_cycle_approval_status" ON "renewal_cycle" ("approval_status") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_renewal_cycle_generated_order_id" ON "renewal_cycle" ("generated_order_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_renewal_cycle_scheduled_for_status" ON "renewal_cycle" ("scheduled_for", "status") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "renewal_attempt" ("id" text not null, "renewal_cycle_id" text not null, "attempt_no" integer not null, "started_at" timestamptz not null, "finished_at" timestamptz null, "status" text check ("status" in ('processing', 'succeeded', 'failed')) not null default 'processing', "error_code" text null, "error_message" text null, "payment_reference" text null, "order_id" text null, "metadata" jsonb null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "renewal_attempt_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_renewal_attempt_renewal_cycle_id" ON "renewal_attempt" ("renewal_cycle_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_renewal_attempt_deleted_at" ON "renewal_attempt" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_renewal_attempt_attempt_no" ON "renewal_attempt" ("attempt_no") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_renewal_attempt_status" ON "renewal_attempt" ("status") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_renewal_attempt_started_at" ON "renewal_attempt" ("started_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_renewal_attempt_finished_at" ON "renewal_attempt" ("finished_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_renewal_attempt_renewal_cycle_id_attempt_no_unique" ON "renewal_attempt" ("renewal_cycle_id", "attempt_no") WHERE deleted_at IS NULL;`);

    this.addSql(`alter table if exists "renewal_attempt" add constraint "renewal_attempt_renewal_cycle_id_foreign" foreign key ("renewal_cycle_id") references "renewal_cycle" ("id") on update cascade;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "renewal_attempt" drop constraint if exists "renewal_attempt_renewal_cycle_id_foreign";`);

    this.addSql(`drop table if exists "renewal_cycle" cascade;`);

    this.addSql(`drop table if exists "renewal_attempt" cascade;`);
  }

}
