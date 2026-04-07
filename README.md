<p align="center">
  <a href="https://www.medusajs.com">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://user-images.githubusercontent.com/59018053/229103275-b5e482bb-4601-46e6-8142-244f531cebdb.svg">
    <source media="(prefers-color-scheme: light)" srcset="https://user-images.githubusercontent.com/59018053/229103726-e5b529a3-9b3f-4970-8a1f-c6af37f087bf.svg">
    <img alt="Medusa logo" src="https://user-images.githubusercontent.com/59018053/229103726-e5b529a3-9b3f-4970-8a1f-c6af37f087bf.svg">
    </picture>
  </a>
</p>

<h1 align="center">
    Reorder
</h1>
<h1 align="center">
    Open Source Medusa Subscription Plugin
</h1>

<p align="center">
  <a href="https://github.com/tkasperski/reorder?tab=MIT-1-ov-file">
    <img alt="License" src="https://img.shields.io/badge/license-MIT-blue.svg" />
  </a>
  <a href="https://github.com/tkasperski/reorder/issues">
    <img src="https://img.shields.io/badge/PRs-welcome-brightgreen.svg?style=flat" alt="PRs welcome!" />
  <a href="https://www.reorderjs.com/contact">
    <img alt="Support" src="https://img.shields.io/badge/support-contact%20author-blueviolet.svg" />
  </a>
</p>

<h4 align="center">
  <a href="https://docs.reorderjs.com">Documentation</a> |
  <a href="https://www.reorderjs.com">Website</a>
</h4>

## What is Reorder?

`Reorder` is an open source Medusa subscription plugin.

It adds recurring commerce capabilities to a Medusa store, including subscriptions, plans and offers, renewals, dunning, cancellation and retention flows, activity logs, and analytics.

`Reorder` is built as a Medusa plugin with Medusa modules, workflow-backed mutations, Admin API routes, scheduled jobs, and Admin UI extensions.

## What it includes

- `Subscriptions`
- `Plans & Offers`
- `Renewals`
- `Dunning`
- `Cancellation & Retention`
- `Activity Log`
- `Analytics`

## Current scope

`Reorder` currently focuses on recurring commerce operations managed from the Medusa Admin.

Today, the plugin provides strong Admin coverage across the implemented domains. Customer self-service flows will be introduced in the near future as a `Reorder Subscription Starter`.

## Feature highlights

- Subscription lifecycle management
- Configurable plans and offers
- Renewal orchestration
- Dunning retries and recovery tooling
- Cancellation flows with retention offers
- Operational activity logs
- Subscription analytics and reporting

## Installation

`Reorder` is meant to be installed into an existing Medusa project.

### 1. Install the plugin

With `npm`:

```bash
npm install reorder
```

With `yarn`:

```bash
yarn add reorder
```

### 2. Add the plugin to `medusa-config.ts`

```ts
plugins: [
  // other plugins
  {
    resolve: "reorder",
    options: {},
  },
]
```

### 3. Start your Medusa app

After adding the plugin, run your normal Medusa setup flow in your store project.

## Local development

If you want to work on the plugin itself locally:

### 1. Clone the repository

```bash
git clone <your-repository-url>
cd reorder
```

### 2. Install dependencies

```bash
yarn install
```

### 3. Publish the local plugin

```bash
yarn medusa plugin:publish
```

### 4. Add the plugin in your Medusa store

```bash
yarn medusa plugin:add reorder
```

### 5. Add the plugin configuration to `medusa-config.ts`

```ts
plugins: [
  // other plugins
  {
    resolve: "reorder",
    options: {},
  },
]
```

### 6. Install store dependencies

```bash
yarn install
```

### 7. Start your Medusa store

```bash
yarn dev
```

## Requirements

- Minimum: Medusa `2.3+`
- Recommended: compatible with `@medusajs/medusa >= 2.4.0`

## Architecture

`Reorder` is organized around Medusa-native building blocks:

- domain modules for subscription data and operational records
- workflows for business mutations and orchestration
- Admin API routes for plugin operations
- Admin UI extensions for management flows
- scheduled jobs for renewals, dunning, and analytics processing

## Documentation

Project documentation lives in `docs/`.

Useful starting points:

- `docs/README.md`
- `docs/architecture/`
- `docs/api/`
- `docs/admin/`
- `docs/testing/`
- `docs/roadmap/implementation-plan.md`

## Contributing

Issues and pull requests are welcome.

Before changing behavior:

- read the runtime docs in `docs/`
- keep implementation aligned with documented behavior
- follow Medusa best practices for modules, workflows, routes, and Admin UI extensions
