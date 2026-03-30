# Reorder: Dunning Trigger Entry Spec

This document covers step `2.4.1` from `documentation/implementation_plan.md`.

Goal:
- define when a failed `Renewal` should enter `Dunning`
- distinguish payment-recovery failures from non-payment renewal failures
- define how failures from payment provider and Medusa payment artifacts are classified
- define whether `Dunning` starts only from the first failed renewal payment or also from later recovery attempts

This specification builds on:
- `reorder/docs/specs/subscriptions/domain-model.md`
- `reorder/docs/specs/renewals/source-of-truth-semantics.md`
- `reorder/docs/architecture/renewals.md`

The direction follows Medusa patterns:
- payment operations should be expressed through Medusa payment workflows and payment module APIs
- business recovery flows should distinguish payment failures from order and domain failures
- workflows remain the mutation boundary, while modules own domain state
- Admin-facing operational areas should use explicit status and failure classification rather than parsing UI assumptions

Implementation status:
- `Dunning` is not implemented yet
- this document is a design-time specification for the trigger boundary
- runtime source-of-truth docs for `Dunning` will be added after implementation

## 1. Trigger definition

`Dunning` starts only when a renewal attempt fails because the commerce payment recovery failed.

In practical terms:
- the renewal attempt already reached the payment phase
- the failure comes from payment initialization, authorization, or capture
- the failure means the subscription may still be recoverable through a later retry or manual operator action

`Dunning` does not start for renewal failures that happen before the payment phase or outside payment recovery semantics.

## 2. Responsibility boundary

The three areas keep separate responsibilities:

- `Subscriptions` own the customer subscription lifecycle and operational state
- `Renewals` own one due billing cycle, its execution history, and whether a renewal attempt failed
- `Dunning` owns recovery of failed renewal payment attempts after a payment-qualified failure

This means:
- not every failed renewal becomes a dunning case
- `Dunning` is a specialized recovery layer for payment failure, not a generic retry bucket for all renewal errors
- the source event for `Dunning` is a failed renewal attempt with a payment-classified failure reason

## 3. Renewal failure categories

For `Dunning`, renewal failures are divided into two top-level groups:

### 3.1 Payment-qualified failures

These failures qualify for creating or updating a `DunningCase`.

They include:
- payment session initialization failure for the renewal payment collection
- provider rejection during payment authorization
- provider or payment-module failure during payment capture
- later failed recovery payment retries for an already open dunning case

Common business meaning:
- the renewal order and payment path were valid enough to attempt charging
- the failure indicates the debt is collectible in principle, but the charge did not succeed now
- later retries, payment method updates, or operator actions may recover the subscription

### 3.2 Non-payment renewal failures

These failures do not qualify for `Dunning`.

They include:
- subscription not eligible for renewal
- approval not granted for applicable pending changes
- active offer policy no longer allows the renewal or pending change
- source cart or subscription data is invalid or incomplete
- renewal order creation failure before payment recovery can begin
- concurrency, duplicate execution, or locking conflicts
- unexpected infrastructure failures unrelated to the payment attempt

Common business meaning:
- there is no collectible payment debt yet
- the failure must be handled in `Renewals`, `Subscriptions`, or operational observability
- retrying payment later would not solve the underlying problem

## 4. Payment-stage classification

The current renewal flow in `reorder` uses these payment-related stages:

1. create or update payment collection for the renewal order
2. create payment session for the selected provider
3. authorize payment session
4. capture payment

For `Dunning`, the trigger boundary is defined per stage as follows.

### 4.1 Payment collection stage

Failure while creating or attaching the renewal payment collection is **not** a dunning trigger by default.

Reasoning:
- payment collection creation is still payment setup, not a real charge attempt
- failure here usually means a workflow, configuration, or order/payment artifact problem
- this should stay a `Renewal` failure until a later implementation proves a recoverable debt already exists at this stage

Decision:
- `createOrUpdateOrderPaymentCollectionWorkflow` failure => `renewal failed`, not `dunning`
- missing payment collection after the workflow => `renewal failed`, not `dunning`

### 4.2 Payment session stage

Failure while creating the payment session is a dunning trigger only when the failure is provider-payment related.

Qualifies for `Dunning`:
- provider rejects initialization of an off-session charge
- stored payment method is invalid, expired, detached, or unusable
- provider returns a payment-specific failure while creating the session

Does not qualify for `Dunning`:
- payment provider is missing from subscription payment context
- workflow input is structurally invalid
- region, order, or payment-collection setup is inconsistent

Decision:
- provider/payment-method rejection during session initialization => `dunning`
- local configuration or workflow setup failure => `renewal failed`

### 4.3 Authorization stage

Failure during `authorizePaymentSession` is a dunning trigger by default, unless the failure is clearly not a payment recovery failure.

Qualifies for `Dunning`:
- insufficient funds
- expired card
- card declined
- payment method requires replacement
- off-session authorization rejected by the provider
- authorization temporarily unavailable but still payment-related

Does not qualify for `Dunning`:
- code misuse or invalid workflow state
- provider/session identifiers are missing because of local data corruption
- explicit `requires_more` style flows that need customer interaction and are not recoverable off-session in Admin-driven renewal

Decision:
- provider-level authorization rejection => `dunning`
- non-payment technical misuse of the authorization API => `renewal failed`

### 4.4 Capture stage

Failure during capture is a dunning trigger only when the authorization succeeded but funds were not captured due to a payment recovery issue.

Qualifies for `Dunning`:
- provider capture rejection after successful authorization
- temporary payment processor capture failure
- settlement-related payment error that still represents unpaid debt

Does not qualify for `Dunning`:
- local invocation failure not tied to provider charge outcome
- internal workflow state corruption unrelated to payment collectability

Decision:
- provider/payment capture rejection => `dunning`
- local non-payment failure around capture call => `renewal failed`

## 5. Mapping by failure source

The trigger should classify failures by source, not only by raw message text.

Recommended source buckets:

- `payment_provider`
- `payment_session`
- `payment_capture`
- `payment_collection`
- `renewal_order`
- `subscription_state`
- `offer_policy`
- `approval_gate`
- `concurrency`
- `unexpected`

Recommended dunning trigger rule:

- `payment_provider`, `payment_session`, and selected `payment_capture` failures may open or update `Dunning`
- `payment_collection` failures do not open `Dunning` in MVP
- all other buckets remain plain `Renewal` failures

## 6. Mapping examples

The following examples define the intended semantics.

### Enters `Dunning`

- payment provider declines off-session authorization because the card has insufficient funds
- stored payment method is expired or no longer usable at provider session-init time
- payment authorization fails with a provider decline code
- capture fails after authorization because the provider rejects settlement
- an open dunning case runs another retry and the provider rejects the charge again

### Does not enter `Dunning`

- subscription is paused or cancelled before the cycle date
- pending change needs approval and approval is still pending or rejected
- active `PlanOffer` no longer allows the pending frequency
- renewal order could not be created
- payment provider id or payment method reference is missing in local subscription data
- the scheduler hit a duplicate-execution or lock conflict
- a generic unexpected exception occurs before any payment attempt semantics are established

## 7. Trigger timing

`Dunning` should start only after a failed renewal payment attempt is established.

In MVP semantics:
- the renewal attempt is created first
- the renewal cycle transitions to `failed`
- the failure is classified
- only then may a `start-dunning` workflow create or update a `DunningCase`

This preserves clean boundaries:
- `Renewals` still record the failed execution attempt
- `Dunning` reacts to a classified failure event
- the same renewal failure remains auditable even if `Dunning` later succeeds or closes unrecovered

## 8. First failure vs later recovery failures

`Dunning` starts from the first payment-qualified failed renewal attempt and continues to own later recovery failures for the same debt event.

Decision:
- initial qualifying renewal failure creates or reuses the active `DunningCase`
- later dunning retry failures do not create a new renewal cycle
- later retry failures update the same `DunningCase` and append `DunningAttempt`

Why:
- one unpaid renewal debt event should map to one active recovery case
- repeated recovery attempts are part of dunning history, not repeated renewal execution history
- this keeps Admin operational review simpler and avoids duplicate open cases for the same missed payment

## 9. Debt-event boundary

The debt event for MVP is the failed payment attempt of one concrete `RenewalCycle`.

Implications:
- a dunning case is anchored to one failed renewal cycle
- the renewal cycle is the originating operational event
- later retries may use order or payment artifacts, but they still belong to the same originating debt event

This is the recommended boundary for the next step that defines source-of-truth and case ownership.

## 10. Recommended implementation direction

For implementation in later steps, the plugin should stop relying only on broad `renewal_failed` errors and introduce explicit failure classification for payment-related paths.

Recommended direction:
- classify renewal failures close to the payment operations
- persist enough structured failure data to decide whether `Dunning` should start
- treat provider-decline and payment-method problems as payment-recovery candidates
- keep data/configuration/eligibility problems in the `Renewals` domain only

This aligns with Medusa patterns:
- workflow orchestration stays explicit
- payment concerns are modeled around payment artifacts and provider outcomes
- recovery logic is driven by domain classification, not by UI behavior

## 11. Final decision summary

For step `2.4.1`, the final decisions are:

- `Dunning` is entered only for payment-qualified failures
- `Dunning` is not a generic retry area for all failed renewals
- payment collection creation failures remain plain renewal failures in MVP
- payment session failures enter `Dunning` only when they represent provider/payment-method rejection
- authorization failures enter `Dunning` by default when they come from the payment provider
- capture failures enter `Dunning` when they represent unpaid debt after authorization
- subsequent failed recovery attempts stay in the same dunning case rather than creating new renewal-origin cases
