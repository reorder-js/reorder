# Reorder agent guidelines

This file defines how coding agents should work in the official `reorder` repository.

## Before writing code

1. Identify which Reorder area you are changing.
2. Read the relevant runtime documentation in `docs/` before reading implementation files.
3. If local Reorder docs do not answer the question, query the Reorder MCP server.
4. If there is any doubt about the correct Medusa approach, query the Medusa MCP server before implementing.
5. Use Medusa agentic skills whenever they fit the task.
6. If the change spans multiple layers, make a short plan first.
7. Prefer implemented runtime docs over old planning notes.
8. Keep changes minimal and local to the affected area.

## Source of truth

The source of truth for implemented behavior is:

- `docs/README.md`
- `docs/architecture/`
- `docs/api/`
- `docs/admin/`
- `docs/testing/`

Treat `docs/specs/` as design-time context, not as the final description of current behavior.

External documentation sources that must be used when needed:

- Reorder public docs MCP server: `https://docs.reorderjs.com/mcp`
- Medusa docs MCP server: `https://docs.medusajs.com/mcp`
- Medusa agentic skills docs: `https://docs.medusajs.com/learn/introduction/build-with-llms-ai/agentic-skills`

Use the Reorder MCP server to fetch missing information about Reorder architecture, API behavior, feature coverage, and documentation.

Use the Medusa MCP server whenever there is any uncertainty about Medusa conventions, implementation patterns, APIs, workflows, modules, admin extensions, testing, or plugin architecture.

Following the best Medusa.js standards is the highest priority in this repository because Reorder is a Medusa plugin.

Use Medusa agentic skills whenever they are relevant to the task.

## Task router

Match the task to all relevant rows before researching or coding.

| Task | Read first |
|------|------------|
| Plugin overview, current scope, implemented domains | `docs/README.md` |
| Subscription domain changes | `docs/architecture/subscriptions.md`, `docs/api/admin-subscriptions.md`, `docs/testing/subscriptions.md` |
| Plan and offer changes | `docs/architecture/plan-offers.md`, `docs/api/admin-plan-offers.md`, `docs/testing/plan-offers.md` |
| Renewal changes | `docs/architecture/renewals.md`, `docs/api/admin-renewals.md`, `docs/testing/renewals.md` |
| Dunning changes | `docs/architecture/dunning.md`, `docs/api/admin-dunning.md`, `docs/testing/dunning.md` |
| Cancellation and retention changes | `docs/architecture/cancellation.md`, `docs/api/admin-cancellations.md`, `docs/testing/cancellations.md` |
| Activity log changes | `docs/architecture/activity-log.md`, `docs/api/admin-activity-log.md`, `docs/testing/activity-log.md` |
| Analytics changes | `docs/architecture/analytics.md`, `docs/api/admin-analytics.md`, `docs/testing/analytics.md` |
| Subscription settings changes | `docs/architecture/settings.md`, `docs/api/admin-subscription-settings.md`, `docs/testing/subscription-settings.md` |
| Storefront and customer account subscription APIs | `docs/api/store-subscription-checkout.md`, `docs/api/store-subscription-offers.md`, `docs/api/store-customer-cancellations.md`, `docs/architecture/subscriptions.md` |
| Admin UI routes and widgets | matching files in `docs/admin/`, then `src/admin/README.md` |
| Admin or store API route implementation | `src/api/README.md`, then matching `docs/api/*.md` |
| Workflow-backed mutations | `src/workflows/README.md`, then matching architecture and API docs |
| Module or model changes | `src/modules/README.md`, then matching architecture doc |
| Jobs and scheduled processing | matching architecture doc and matching testing doc |

## Repository map

Important areas:

- `src/modules/` domain modules and persistence
- `src/workflows/` business mutations and orchestration
- `src/api/admin/` Admin API routes
- `src/api/store/` Store API routes
- `src/admin/` Admin dashboard routes, widgets, types, and client helpers
- `src/jobs/` scheduled processing
- `src/links/` Medusa entity links
- `integration-tests/` integration coverage
- `docs/` runtime documentation

## Architecture rules

- Keep business rules in workflows or module services, not in route handlers or React components.
- Route handlers should validate input, resolve dependencies from `req.scope`, call workflows or services, and return DTOs.
- Keep domain ownership clear:
  - `subscription`
  - `plan-offer`
  - `renewal`
  - `dunning`
  - `cancellation`
  - `activity-log`
  - `analytics`
  - `settings`
- Reuse existing workflow patterns for state-changing operations.
- Preserve snapshot-based read models where the docs describe them.
- Keep store responses separate from Admin DTOs.
- Do not introduce unnecessary cross-domain coupling when an existing workflow or link boundary already exists.

## Medusa conventions

- File-based routes must use `route.ts`.
- Use `req.scope.resolve(...)` for Medusa services and registered resources.
- Keep custom modules under `src/modules/<domain>/`.
- Put module models under `models/`, migrations under `migrations/`, and shared helpers under `utils/` or `types/`.
- Keep workflows in `src/workflows/` and steps in `src/workflows/steps/`.
- Scheduled jobs belong in `src/jobs/`.
- Admin extensions belong in `src/admin/`.

## Coding rules

- Prefer existing domain types and validators.
- Avoid `any`.
- Keep naming consistent with existing domains, DTOs, and route names.
- Use explicit, descriptive names.
- Prefer small helpers over deeply nested inline logic.
- Follow existing response shapes for each area.
- Do not refactor unrelated files while fixing a local issue.

## Documentation rules

- If behavior changes, update the matching runtime docs in `docs/`.
- Document implemented behavior, not intended future behavior.
- Use repository terminology consistently:
  - `subscription`
  - `plan`
  - `offer`
  - `renewal cycle`
  - `dunning case`
  - `cancellation case`
  - `activity log`

## Testing rules

- Run focused tests for the area you changed whenever possible.
- Prefer existing integration test patterns in `integration-tests/http/`.
- Add or update tests when changing:
  - API contracts
  - workflow behavior
  - scheduler logic
  - cross-domain state transitions
- Keep tests self-contained. Do not depend on pre-seeded data.
- If you change documented behavior, verify implementation and docs remain aligned.

## Local Medusa backend workflow

To use the local `reorder` plugin in a Medusa backend during development:

- add this dependency in the Medusa backend `package.json`:
  - `"@reorderjs/reorder": "file:../reorder"`
- run `yarn install` in the Medusa backend after adding or updating that dependency

When you make changes in this `reorder` repository and want the Medusa backend to use the newest local version, use this sequence:

1. In `reorder`, run `yarn medusa plugin:publish`
2. In the Medusa backend, run `yarn medusa db:migrate`
3. In the Medusa backend, run `yarn install`

Do not assume the Medusa backend is using the newest local plugin code until that sequence has completed.

Useful commands:

```bash
yarn dev
yarn build
yarn test:integration:http
yarn test:integration:modules
```
