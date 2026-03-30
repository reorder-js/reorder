import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260330190157 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "dunning_attempt" drop constraint if exists "dunning_attempt_dunning_case_id_attempt_no_unique";`);
    this.addSql(`create table if not exists "dunning_case" ("id" text not null, "subscription_id" text not null, "renewal_cycle_id" text not null, "renewal_order_id" text null, "status" text check ("status" in ('open', 'retry_scheduled', 'retrying', 'awaiting_manual_resolution', 'recovered', 'unrecovered')) not null default 'open', "attempt_count" integer not null default 0, "max_attempts" integer not null, "retry_schedule" jsonb null, "next_retry_at" timestamptz null, "last_payment_error_code" text null, "last_payment_error_message" text null, "last_attempt_at" timestamptz null, "recovered_at" timestamptz null, "closed_at" timestamptz null, "recovery_reason" text null, "metadata" jsonb null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "dunning_case_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_dunning_case_deleted_at" ON "dunning_case" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_dunning_case_subscription_id" ON "dunning_case" ("subscription_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_dunning_case_renewal_cycle_id" ON "dunning_case" ("renewal_cycle_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_dunning_case_renewal_order_id" ON "dunning_case" ("renewal_order_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_dunning_case_status" ON "dunning_case" ("status") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_dunning_case_next_retry_at" ON "dunning_case" ("next_retry_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_dunning_case_last_attempt_at" ON "dunning_case" ("last_attempt_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_dunning_case_recovered_at" ON "dunning_case" ("recovered_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_dunning_case_closed_at" ON "dunning_case" ("closed_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_dunning_case_status_next_retry_at" ON "dunning_case" ("status", "next_retry_at") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "dunning_attempt" ("id" text not null, "dunning_case_id" text not null, "attempt_no" integer not null, "started_at" timestamptz not null, "finished_at" timestamptz null, "status" text check ("status" in ('processing', 'succeeded', 'failed')) not null default 'processing', "error_code" text null, "error_message" text null, "payment_reference" text null, "metadata" jsonb null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "dunning_attempt_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_dunning_attempt_dunning_case_id" ON "dunning_attempt" ("dunning_case_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_dunning_attempt_deleted_at" ON "dunning_attempt" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_dunning_attempt_attempt_no" ON "dunning_attempt" ("attempt_no") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_dunning_attempt_status" ON "dunning_attempt" ("status") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_dunning_attempt_started_at" ON "dunning_attempt" ("started_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_dunning_attempt_finished_at" ON "dunning_attempt" ("finished_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_dunning_attempt_dunning_case_id_attempt_no_unique" ON "dunning_attempt" ("dunning_case_id", "attempt_no") WHERE deleted_at IS NULL;`);

    this.addSql(`alter table if exists "dunning_attempt" add constraint "dunning_attempt_dunning_case_id_foreign" foreign key ("dunning_case_id") references "dunning_case" ("id") on update cascade;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "dunning_attempt" drop constraint if exists "dunning_attempt_dunning_case_id_foreign";`);

    this.addSql(`drop table if exists "dunning_case" cascade;`);

    this.addSql(`drop table if exists "dunning_attempt" cascade;`);
  }

}
