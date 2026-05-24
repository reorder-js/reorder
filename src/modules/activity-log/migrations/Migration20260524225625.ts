import { Migration } from "@mikro-orm/migrations"

export class Migration20260524225625 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table if exists "subscription_log" drop constraint if exists "subscription_log_actor_type_check";`
    )
    this.addSql(
      `alter table if exists "subscription_log" add constraint "subscription_log_actor_type_check" check("actor_type" in ('user', 'customer', 'system', 'scheduler'));`
    )
  }

  override async down(): Promise<void> {
    this.addSql(
      `alter table if exists "subscription_log" drop constraint if exists "subscription_log_actor_type_check";`
    )
    this.addSql(
      `alter table if exists "subscription_log" add constraint "subscription_log_actor_type_check" check("actor_type" in ('user', 'system', 'scheduler'));`
    )
  }
}
