## [1.1.0] - 2026-09-06

### Features
- **subscriptions:** add payment method management for off-session renewals (758448e)
- **admin:** add hover tooltips to trend charts (7ac6a47)
- **analytics:** replace active trend with created subscriptions bar chart (8677886)
- **local-dev:** add subscription storefront discovery and concurrent startup (4c6fdb8)
- **local-dev:** enhance local-dev skill with clean port management and dual background tasks (13bee89)
- **ai:** restructure guidelines, introduce agent skills, add 2-stage sync-docs skill, and automate local dev sync script (1afae9e, 68173a8, d843fc3)
- **testing:** add wipe-test-data script and skill with safety confirmation (9d2995f)
- **testing:** add Playwright E2E PoC for admin subscriptions list (1787fb5)

### Fixes
- **subscriptions:** resolve payment method API leak and add test coverage (28690f9)
- **analytics:** namespace module alias to avoid medusa collision (3cd909b)
- **analytics:** resolve latest order fallback for renewal cycles in daily snapshots (af32d79)
- **analytics:** include initial subscription order in MRR calculation (2f83bbc)
- **admin:** update widget zones and docs to comply with layout composer (e9bb8ba)
- **local-dev:** extract publishable token in sync script and clarify restart steps (dad001d)
- **dev-env:** preserve inventory in wipe script and auto-sync publishable key (586d5d4)

### Chores & Docs
- **docs:** redesign README with social proof, screenshots, new hero, and Why Reorder section
- **chore:** add release-plugin skill for automated publishing (179e2a1)
- **test:** implement E2E specs for plan creation, cancellation, pause-resume, and renewals
- **test(integration):** use worker concurrency to prevent in-band OOM (8e11e82)
- **chore:** update to latest medusa (6fd3a9f)
