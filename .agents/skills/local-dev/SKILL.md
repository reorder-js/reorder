---
name: local-dev
description: Guidelines for local development, syncing, and testing of the reorder plugin with an external Medusa backend project and subscription storefront as background tasks in Antigravity.
---

# Local development in Medusa backend & Storefront

This skill describes how to sync local changes in the `reorder` plugin with an external Medusa backend and run both the Medusa backend and the subscription storefront as separate Antigravity background tasks.

## Workflow Execution Steps for Agents

When requested to run `/local-dev` or start the local development environment:

### Step 1: Initial Sync or Plugin Rebuild (Only when code changed)
If you modified the `reorder` plugin code and need to rebuild and push changes to `yalc`:
```bash
./.agents/scripts/sync-local-env.sh
```
> [!NOTE]
> If the user simply requests to **restart** or **start** the backend/storefront without code changes, **do NOT** run `sync-local-env.sh`. Skip directly to Step 2 and restart the process.

### Step 2: Start Medusa Backend (Background Task)
Start the Medusa backend dev server using `run_command` with `IsDaemon: true` and working directory set to the backend directory (`Cwd: /Users/tomaszkasperski/Desktop/Development/medusa-reorder/my-medusa-store`):
```bash
yarn dev
```

### Step 3: Wait for Backend Readiness
Poll `http://localhost:9000/health` until the backend responds with HTTP 200 OK before starting the storefront:
```bash
until curl -s -f http://localhost:9000/health >/dev/null 2>&1; do sleep 1; done
```

### Step 4: Start Subscription Storefront (Background Task)
Start the storefront dev server as a separate background daemon task using `run_command` with `IsDaemon: true` and working directory set to the storefront directory (`Cwd: /Users/tomaszkasperski/Desktop/Development/medusa-reorder/subscription-storefront`):
```bash
yarn dev
```

### Step 5: Report URLs to the User
Always immediately provide the clickable URLs:
- **Medusa Backend API**: `http://localhost:9000`
- **Medusa Admin Dashboard**: `http://localhost:9000/app`
- **Subscription Storefront**: `http://localhost:8000`

---

## Manual Setup & Storefront Connection Requirements

### 1. Medusa Backend
1. Install `yalc` globally if needed: `npm i yalc -g`
2. In the Medusa backend's `package.json`, declare the plugin dependency using yalc:
   ```json
   "@reorderjs/reorder": "file:.yalc/@reorderjs/reorder"
   ```
3. Ensure the plugin is registered in `medusa-config.ts`.
4. Ensure PostgreSQL database is running and `DATABASE_URL` is configured in `.env`.
5. Ensure CORS settings in backend `.env` allow storefront access (`STORE_CORS=http://localhost:8000,...`).

### 2. Subscription Storefront (`subscription-storefront`)
1. Ensure `.env.local` is present in the storefront directory with:
   ```env
   MEDUSA_BACKEND_URL=http://localhost:9000
   NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY=<active_publishable_api_key>
   NEXT_PUBLIC_BASE_URL=http://localhost:8000
   NEXT_PUBLIC_DEFAULT_REGION=us
   ```
2. The publishable API key in the storefront must match an active publishable key in the Medusa backend database that is linked to the appropriate sales channel.
