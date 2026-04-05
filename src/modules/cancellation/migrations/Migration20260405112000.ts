import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260405112000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table if exists "cancellation_case" drop column if exists "recommended_action";`
    );
  }

  override async down(): Promise<void> {
    this.addSql(
      `alter table if exists "cancellation_case" add column if not exists "recommended_action" text check ("recommended_action" in ('pause_offer', 'discount_offer', 'bonus_offer', 'direct_cancel')) null;`
    );
  }
}
