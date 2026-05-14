import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260512142623 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "subscription" drop constraint if exists "subscription_frequency_interval_check";`);

    this.addSql(`alter table if exists "subscription" add constraint "subscription_frequency_interval_check" check("frequency_interval" in ('day', 'week', 'month', 'year'));`);
  }

  override async down(): Promise<void> {
    this.addSql(`update "subscription" set "frequency_interval" = 'week', "frequency_value" = ceil("frequency_value" / 7.0) where "frequency_interval" = 'day';`);

    this.addSql(`alter table if exists "subscription" drop constraint if exists "subscription_frequency_interval_check";`);

    this.addSql(`alter table if exists "subscription" add constraint "subscription_frequency_interval_check" check("frequency_interval" in ('week', 'month', 'year'));`);
  }

}
