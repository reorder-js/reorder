import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260512142622 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "subscription_metrics_daily" drop constraint if exists "subscription_metrics_daily_frequency_interval_check";`);

    this.addSql(`alter table if exists "subscription_metrics_daily" add constraint "subscription_metrics_daily_frequency_interval_check" check("frequency_interval" in ('day', 'week', 'month', 'year'));`);
  }

  override async down(): Promise<void> {
    this.addSql(`delete from "subscription_metrics_daily" where "frequency_interval" = 'day';`);

    this.addSql(`alter table if exists "subscription_metrics_daily" drop constraint if exists "subscription_metrics_daily_frequency_interval_check";`);

    this.addSql(`alter table if exists "subscription_metrics_daily" add constraint "subscription_metrics_daily_frequency_interval_check" check("frequency_interval" in ('week', 'month', 'year'));`);
  }

}
