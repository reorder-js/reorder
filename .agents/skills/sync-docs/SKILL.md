---
name: sync-docs
description: Syncs internal technical documentation (reorder/docs/) and the public Mintlify documentation (../docs/). Triggered automatically after pushing code changes, or manually by the user.
---

# Sync Documentation (Internal Docs & Public Mintlify)

This skill manages the two-stage documentation synchronization workflow:
1. **Internal Technical Docs (`reorder/docs/`)**: Source of truth for developers and AI agents (architecture, APIs, testing, admin UX, scripts).
2. **Public Mintlify Docs (`../docs/`)**: Customer-facing documentation (MDX format) for merchants and developers using the plugin.

## When to trigger
- **Automatically**: Whenever you successfully `git push` code changes to the `reorder` repository, ALWAYS ask the user: *"Czy zmiany wymagają aktualizacji dokumentacji (wewnętrznej w reorder/docs lub publicznej Mintlify w ../docs)? Jeśli tak, użyję skilla sync-docs."*
- **Manually**: When the user asks to "sync docs", "update documentation", "zaktualizuj docs", or runs `/sync-docs`.

## 2-Stage Synchronization Workflow

### Stage 1: Verify & Update Internal Technical Docs (`reorder/docs/`)
Before updating public docs, ensure the internal source of truth is 100% accurate:
1. Check changed code, workflows, API contracts, domain models, or scripts in `reorder`.
2. Update the corresponding documents in `reorder/docs/`:
   - `docs/architecture/` for domain architecture or lifecycle changes
   - `docs/api/` for Admin or Store route changes
   - `docs/admin/` for UI flow, filter, or widget changes
   - `docs/testing/` for new test utilities, scripts, or coverage
   - `docs/README.md` for index and roadmap updates
3. If changes were made to `reorder/docs/`, commit them to the `reorder` repository (propose Conventional Commit e.g. `docs: update internal documentation for <feature>`).

### Stage 2: Sync to Public Mintlify Repository (`../docs/`)
Only after internal docs are accurate:
1. Navigate to `../docs` and ensure your local branch is synchronized with remote before making any edits (`git pull`).
2. Read `../docs/AGENTS.md` to review style guidelines, terminology, and content boundaries (do not expose internal locking/scheduler details).
3. Update or create corresponding `.mdx` files in `../docs`.
4. Update `../docs/docs.json` navigation structure if new pages were introduced.
5. Review changes with `git status` and `git diff`.
6. Propose a Conventional Commit message (e.g. `docs: update <feature> guide`), wait for approval, and push to the `docs` remote repository (`git push`).
7. Report completion to the user.
