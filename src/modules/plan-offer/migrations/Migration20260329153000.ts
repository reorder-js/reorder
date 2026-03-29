import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260329153000 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table if not exists "plan_offer" ("id" text not null, "name" text not null, "scope" text check ("scope" in ('product', 'variant')) not null, "product_id" text not null, "variant_id" text null, "is_enabled" boolean not null default true, "allowed_frequencies" jsonb not null, "frequency_intervals" text[] not null default '{}', "discount_per_frequency" jsonb null, "rules" jsonb null, "metadata" jsonb null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "plan_offer_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_plan_offer_deleted_at" ON "plan_offer" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_plan_offer_scope" ON "plan_offer" ("scope") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_plan_offer_product_id" ON "plan_offer" ("product_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_plan_offer_variant_id" ON "plan_offer" ("variant_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_plan_offer_is_enabled" ON "plan_offer" ("is_enabled") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_plan_offer_name" ON "plan_offer" ("name") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_plan_offer_created_at" ON "plan_offer" ("created_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_plan_offer_updated_at" ON "plan_offer" ("updated_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_plan_offer_frequency_intervals" ON "plan_offer" USING GIN ("frequency_intervals") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_plan_offer_product_target_unique" ON "plan_offer" ("product_id") WHERE scope = 'product' AND deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_plan_offer_variant_target_unique" ON "plan_offer" ("variant_id") WHERE scope = 'variant' AND deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "plan_offer" cascade;`);
  }

}
