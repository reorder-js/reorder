import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260610101141 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "subscription" alter column "shipping_address" type jsonb using ("shipping_address"::jsonb);`);
    this.addSql(`alter table if exists "subscription" alter column "shipping_address" drop not null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "subscription" alter column "shipping_address" type jsonb using ("shipping_address"::jsonb);`);
    this.addSql(`alter table if exists "subscription" alter column "shipping_address" set not null;`);
  }

}
