import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260506000543 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "subscription" add column if not exists "source_snapshot" jsonb not null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "subscription" drop column if exists "source_snapshot";`);
  }

}
