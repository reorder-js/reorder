# Lessons Learned

In this file, we record recurring patterns, encountered issues, and mistakes to avoid when working with the Reorder plugin.
It should be reviewed at the start of a session and updated after fixing any bug or resolving a complex issue.

## Rules for AI Agents

### Repository Language Constraint

- **Rule**: All files, code comments, documentation, specs, lessons, and commit messages added or modified in the repository on GitHub MUST be written in English. Even if the user interacts with you in another language (e.g., Polish), do not write Polish code comments, skill files, specs, or repository files.
- **Context**: The repository codebase and its meta-configuration (like AI agents instructions) must maintain a unified English language standard.

### Git Commits and Push Approval

- **Rule**: Before proposing a commit or git push to GitHub, always construct a Conventional Commits message format: `type(scope): description` and present it to the user. Wait for the user's explicit approval before proceeding with the commit and push.
- **Context**: Helps the user audit and accept individual changes, ensuring only well-formed commits with correct scopes are pushed.

## General Lessons

### Zod must be imported from the Medusa re-export in backend code

- **Rule**: In backend code (`src/api/`, `src/workflows/`, `src/modules/`, `src/jobs/`), import Zod as `import { z } from "@medusajs/framework/zod"`, never from `"zod"`. Admin dashboard customizations under `src/admin/` keep importing from `"zod"` directly, since the dashboard supplies it.
- **Context**: Medusa re-exports the exact Zod version the framework validates against, so `validateAndTransformBody` and the project's schemas can never drift apart. Importing `"zod"` in backend code relies on hoisting, which is how the project silently crossed Zod 3 -> 4 during the 2.13.6 -> 2.19.0 upgrade. Run `npx medusa codemod replace-zod-imports` to fix violations.

### `plugin:build` type-checks more files since Medusa 2.19.0

- **Rule**: Keep `scripts/` and `src/**/__tests__/` type-clean. Do not assume a type error there is harmless because the build is green.
- **Context**: Up to 2.13.6, `medusa plugin:build` compiled only a subset of the project (one script, no spec files). From 2.19.0 it compiles all of `scripts/` and `__tests__/`, so latent type errors in those directories become build failures. Three pre-existing errors surfaced this way during the 2.19.0 upgrade. Side effect: spec files are now emitted into `.medusa/server` and therefore into the published package.
