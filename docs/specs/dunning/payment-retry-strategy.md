# Reorder: Dunning Payment Retry Strategy Spec

This document covers step `2.4.8` from `documentation/implementation_plan.md`.

Goal:
- define what exactly is retried in Medusa during dunning
- define which payment artifact is the retry starting point
- define whether retry reuses or recreates payment artifacts
- define idempotency rules for payment retry
- define which payment outcomes mean temporary failure, permanent failure, or recovery

This specification builds on:
- `reorder/docs/specs/dunning/trigger-entry.md`
- `reorder/docs/specs/dunning/source-of-truth-semantics.md`
- `reorder/docs/specs/dunning/module-links.md`
- `reorder/docs/specs/dunning/state-machine.md`

The direction follows Medusa patterns:
- payment flows should use Medusa payment workflows and payment module APIs
- order-bound payment recovery should begin from the order/payment collection boundary
- a retry attempt should be represented as a new payment attempt, not as mutation of old attempt history
- workflow-level idempotency and domain-level concurrency guards must both be explicit

Implementation status:
- `Dunning` is implemented
- this document remains a design-time and decision-history specification for payment retry behavior
- runtime source-of-truth lives in `docs/architecture/dunning.md`, `docs/api/admin-dunning.md`, `docs/admin/dunning.md`, and `docs/testing/dunning.md`

## 1. Core retry semantics

`Dunning` should retry collection of the unpaid renewal debt for one failed `RenewalCycle`.

In Medusa terms, the retry operation should aim to:
- collect payment for the renewal order associated with the debt event
- use the saved off-session payment context stored on the subscription
- produce one new concrete payment recovery attempt in the `DunningAttempt` history

This means `Dunning` is not retrying:
- the whole renewal workflow from scratch
- the original `RenewalCycle`
- generic subscription lifecycle changes

It is retrying:
- the payment collection flow for the already-created renewal order

## 2. What exactly is retried

### Final decision

The retry unit should be:
- create a new payment session for the renewal order’s payment collection
- authorize that payment session with the saved off-session payment method
- capture the resulting payment when authorization succeeds

This mirrors the payment stages already used in the current renewal flow:
- payment collection
- payment session
- authorize
- capture

But for `Dunning`, the order should already exist, so the primary recovery path is payment retry on that existing order payment context.

## 3. Retry starting artifact

### Final decision

The retry should start from the renewal order’s `payment_collection`.

Operationally:
- `renewal_order_id` is the business reference on the case
- the order’s linked payment collection is the technical payment-retry starting artifact

Why this is preferred:
- Medusa’s order-payment model naturally associates payment collection with the order
- payment collection is the place where new payment sessions are created
- this avoids recreating the whole order for every retry
- it keeps the debt event tied to the same renewal order context

## 4. Why retry should not start from the old payment session

The retry should not primarily reuse the previously failed payment session as the main retry mechanism.

Why:
- a failed session represents one historical attempt
- a new retry should create a new payment attempt boundary
- provider-side payment-session state may already be terminal or stale
- reusing old sessions makes attempt history and diagnostics less clear

This means:
- the old payment session remains historical context
- the new retry should create a new session in the same payment collection when possible

## 5. Payment collection reuse versus recreation

### Final decision

In MVP, `Dunning` should reuse the existing renewal order’s payment collection and create a new payment session for each retry attempt.

Preferred behavior:
- reuse `payment_collection`
- create a new `payment_session`
- authorize the new session
- capture the resulting payment

Why this is preferred:
- it aligns with Medusa’s payment model around collections containing multiple sessions and payments over time
- it keeps the debt event tied to the same order-level payment context
- it avoids unnecessary proliferation of payment collections

## 6. When payment collection recreation is not the default

Recreating the payment collection should not be the default retry strategy in MVP.

Why:
- the order already owns its payment collection context
- the recovery problem is usually “another payment attempt is needed”, not “the order needs a brand-new payment structure”
- recreating the collection would add complexity without clear benefit for the current scope

This does not rule out later exceptions, but they are out of MVP scope.

## 7. Payment session strategy

### Final decision

Each dunning retry should create a new payment session.

Recommended flow:
1. load the renewal order
2. resolve the order’s payment collection
3. create a new payment session in that collection
4. pass the stored payment provider and saved payment method context
5. authorize the new session
6. capture the payment if authorization succeeds

This gives one clean technical attempt per dunning retry.

## 8. Payment context source

The retry should use the subscription’s saved payment context as the source for provider and payment-method identifiers.

Required context currently available in the plugin:
- `payment_provider_id`
- `payment_method_reference`
- optional related customer payment context fields

Why this is preferred:
- `Subscription` already owns recurring payment context for off-session charging
- the dunning case should not become the long-term owner of provider credentials or saved payment method identity
- this keeps payment context consistent with the renewal flow already implemented in the plugin

## 9. Suggested Medusa retry flow

The recommended MVP flow is:

1. resolve `renewal_order_id` from `DunningCase`
2. query the order’s linked `payment_collection`
3. create a new payment session with:
   - the order payment collection id
   - provider id from subscription payment context
   - customer id from subscription
   - provider data including saved payment method and off-session flags
4. authorize the new payment session
5. capture the resulting payment if authorization succeeds
6. store one `DunningAttempt`
7. update `DunningCase` according to the payment outcome

This flow is aligned with the current renewal implementation and with Medusa payment workflows.

## 10. Idempotency strategy

Payment retry must be idempotent at two levels:

- domain-level case execution guard
- payment-attempt execution guard

### 10.1 Domain-level idempotency

The dunning retry workflow must enforce:
- one in-flight retry per `DunningCase`
- no duplicate scheduler/manual execution for the same case at the same time

Recommended mechanism:
- workflow lock key scoped to `dunning:${dunning_case_id}`
- case status transition to `retrying` before payment execution starts

This matches the concurrency pattern already used in `Renewals`.

### 10.2 Payment-attempt idempotency

Each dunning retry should create at most one new payment session for one logical retry execution.

Recommended rule:
- one `DunningAttempt` corresponds to one logical payment retry execution
- if the workflow is retried internally due to technical failure before a payment attempt is committed, the same logical attempt should not spawn multiple successful payment captures

Practical MVP interpretation:
- create the `DunningAttempt` before starting payment execution
- record provider/payment references on that attempt when available
- if a retry execution has already produced a terminal attempt outcome, block duplicate re-entry for the same attempt and require a new explicit retry action

## 11. Manual retry-now semantics

Manual retry-now should reuse the same payment retry strategy as the scheduler.

It should differ only in:
- who initiated the retry
- whether due-time checks are bypassed

It should not use a separate payment path.

This keeps:
- payment behavior consistent
- failure classification consistent
- dunning attempt history comparable across scheduler and admin actions

## 12. Temporary failure, permanent failure, and recovery

Payment outcomes should be classified into three buckets:

- `recovery`
- `temporary_failure`
- `permanent_failure`

### 12.1 Recovery

Recovery means:
- authorization succeeds
- capture succeeds or the payment reaches the success condition required by the provider strategy
- the debt event is resolved

Recommended examples:
- payment authorized and captured successfully
- payment confirmed as collected through the provider’s normal success path

Domain effect:
- `DunningAttempt.status = succeeded`
- `DunningCase.status = recovered`

### 12.2 Temporary failure

Temporary failure means:
- payment did not succeed now
- another retry may still be appropriate

Recommended examples:
- transient provider outage
- temporary processor/network issue
- soft decline that policy treats as retryable
- temporary authorization or capture failure that does not invalidate the payment method itself

Domain effect:
- `DunningAttempt.status = failed`
- `DunningCase` usually transitions to `retry_scheduled`

### 12.3 Permanent failure

Permanent failure means:
- payment did not succeed
- auto-retrying the same strategy is not appropriate without human intervention or payment-method change

Recommended examples:
- expired card
- payment method detached or invalid
- provider indicates card or mandate replacement is required
- hard decline classified as non-retryable by policy

Domain effect:
- `DunningAttempt.status = failed`
- `DunningCase` usually transitions to `awaiting_manual_resolution`
  or `unrecovered` depending on policy and operator strategy

## 13. How to treat `requires_more`

If authorization returns a flow that requires customer interaction, such as `requires_more`:
- it should not count as successful recovery
- it should not be treated as a normal automatic retry success

Recommended MVP handling:
- classify it as a permanent or manual-intervention-required outcome for off-session dunning
- move the case to `awaiting_manual_resolution`

Why:
- the dunning flow is admin-driven and off-session
- customer-interactive recovery is out of current MVP scope

## 14. Capture failure semantics

If authorization succeeds but capture fails:

### Temporary capture failure

Examples:
- transient provider issue
- temporary settlement or processor unavailability

Recommended handling:
- classify as `temporary_failure`

### Permanent capture failure

Examples:
- provider marks the payment as not collectible under current conditions
- business policy treats the capture failure as non-retryable

Recommended handling:
- classify as `permanent_failure`

The case should still remain anchored to the same debt event and order context.

## 15. Why the whole renewal should not be rerun

`Dunning` should not rerun the full renewal workflow.

Why:
- the renewal cycle already owns the original failed execution history
- the renewal order should already exist for the debt event under recovery
- rerunning the whole renewal risks duplicating order creation or mixing domains
- `Dunning` is a payment recovery layer, not a second renewal execution layer

This preserves the separation:
- `Renewals` create the debt event
- `Dunning` recovers the payment for that debt event

## 16. Relation to deferred payment links

This strategy does not require payment links in MVP.

Why:
- `DunningCase` already has `renewal_order_id`
- Medusa already models order-to-payment-collection linkage
- `DunningAttempt.payment_reference` can store technical references for diagnostics

If later implementation proves that direct payment-module enrichment is needed:
- payment links may be added then
- but they are not required to define the retry strategy now

## 17. Suggested lifecycle examples

### 17.1 Retry from existing order payment collection

- case references `renewal_order_id`
- order’s payment collection is resolved
- new payment session is created in that collection
- authorization and capture succeed
- case becomes `recovered`

### 17.2 Retry with temporary provider failure

- new session is created in the existing payment collection
- authorization fails with a retryable provider issue
- attempt is recorded as failed
- case remains active and moves to `retry_scheduled`

### 17.3 Retry with permanent payment-method failure

- new session is created in the existing payment collection
- provider reports expired or unusable payment method
- attempt is recorded as failed
- case moves to `awaiting_manual_resolution`

## 18. Final recommendation

For step `2.4.8`, the final recommendation is:

- retry the renewal order payment, not the whole renewal workflow
- start from the renewal order’s `payment_collection`
- reuse the existing payment collection
- create a new payment session for each retry attempt
- authorize and then capture that new payment
- use subscription payment context as the source of provider and saved payment-method data
- enforce idempotency with:
  - one case-level in-flight execution guard
  - one logical payment attempt per `DunningAttempt`
- classify outcomes into:
  - `recovery`
  - `temporary_failure`
  - `permanent_failure`
