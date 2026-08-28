# Reset: Transactional Test Data Wipe

This document describes the destructive test data wipe script that truncates all transactional and operational records across core Medusa tables and the `reorder` plugin while leaving the product catalog, store configuration, and admin accounts untouched.

## Script

- [wipe-test-data.ts](../../scripts/wipe-test-data.ts)

## Purpose

Use this script during local testing or QA passes when you want to return the backend to a completely fresh operational state without losing:
- products and product variants
- categories and collections
- admin users and permissions
- sales channels and store settings

## What It Removes

The script performs a `TRUNCATE ... CASCADE` on all operational and plugin tables:

### Core Medusa Tables
- `order`
- `cart`
- `customer`
- `payment`
- `payment_collection`
- `reservation_item`
- `inventory_item`
- `fulfillment`

### Reorder Plugin Tables
- `subscription`
- `plan_offer`
- `renewal_cycle`
- `dunning_case`
- `cancellation_case`
- `subscription_log`
- `subscription_metrics_daily`
- `retention_offer_event`
- `dunning_attempt`
- `renewal_attempt`
- `subscription_settings`

## What It Does Not Remove

The script preserves:
- `product` and `product_variant`
- `user` (Admin accounts)
- store configurations and API keys

## How to Run

From the root of your Medusa backend application:

```bash
cd my-medusa-store
npx medusa exec ../reorder/scripts/wipe-test-data.ts
```

## AI Agent Integration

This script is wrapped in the `wipe-test-data` AI skill (`.agents/skills/wipe-test-data/SKILL.md`). When triggered via AI prompts (e.g. *"wyczyść bazę"*, *"reset data"*), the agent will warn the user and require confirmation before running the script.
