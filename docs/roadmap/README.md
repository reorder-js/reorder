# Reorder Roadmap

Public roadmap for `Reorder`, the subscription and recurring commerce plugin for Medusa v2.

---

## What's Implemented Today

- **Subscriptions**: List, detail, pause, resume, cancel, address edit, and payment method updates.
- **Plans & Offers**: Billing intervals, discounts, trial rules, and product/variant configs.
- **Renewals**: Automated cycle processing, manual approval/rejection, and force execution.
- **Dunning**: Payment retry engine, failure tracking, and manual recovery flows.
- **Cancellations & Retention**: Churn reasons, retention offers, and pause alternatives.
- **Activity Log**: Event timelines and operational audit trail.
- **Analytics & Settings**: Daily metrics snapshots (MRR, Churn, LTV) and global settings.

---

## Upcoming Features

### Now (In Progress)

- **Payment Provider Choice**: Choose different payment gateways per subscription (e.g., Stripe, Adyen).
- **Delivery Cadence**: Separate delivery schedules from billing schedules (e.g., pay monthly, deliver weekly).
- **Custom Retry Timing**: Set specific days and hours for retries (e.g., Friday mornings when accounts are funded).
- **Smart Decline Handling**: Cancel immediately on blocked/stolen cards instead of wasting retry attempts.
- **Demo Store & Agentic Blueprints**: Real-world demo store showing agentic development workflows.

### Next (Planned)

- **Custom Bundles (Build-a-Box)**: Let customers pick items in a bundle and swap products between renewals.
- **Food & Bakery Ordering**: Handle order cutoffs, delivery time slots, and holiday pauses.
- **Dunning Discounts**: Apply a discount (e.g., 50% off) on the final retry attempt to prevent churn.
- **Stripe Migration Assistant**: CLI tool to import active subscriptions and cards from Stripe Billing.
- **Async Analytics Export**: Export large reports in the background without UI timeouts.

### Later (Future & Integrations)

- **A/B Testing for Billing**: Test and compare different retry schedules to see which recovers more revenue.
- **Payment Orchestration**: Official adapters for Primer.io, Payrails, and Gr4vy.
- **Chargeback Prevention**: Pre-chargeback dispute alerts via Ethoca / Verifi.
- **Multi-Currency Analytics**: Currency conversion for global reporting.

---

## Feedback & Ideas

Have a feature request or want to contribute? Open an issue or discussion on [GitHub](https://github.com/reorder-js/reorder).
