# Reorder Docs

`Reorder` is a Medusa.js plugin for recurring commerce flows managed from the Admin.

At the moment, the `Subscriptions` area is implemented and tested. The remaining areas from the implementation plan are still in progress:
- `Plans & Offers`
- `Renewals`
- `Dunning`

## Current Status

Completed:
- `Subscriptions` domain model
- `Subscriptions` admin API routes
- `Subscriptions` Admin UI: list, details, actions, plan change, shipping address edit
- backend integration tests
- admin flow integration test

In progress:
- next implementation stages from the roadmap

## Documentation Map

Use these documents depending on what you need:

- `specs/`
  Early design and planning documents created before or during implementation.
- `architecture/`
  Technical documentation describing how each domain area is structured.
- `api/`
  Current API contracts used by the Admin and other consumers.
- `admin/`
  Admin UI behavior, screens, actions, filters, and UX conventions.
- `testing/`
  How tests are structured, what is covered, and how to run them.

## Recommended Reading Order

For a new developer joining the project:
1. Read this file.
2. Read the architecture document for the area you work on.
3. Read the API document for that area.
4. Read the Admin UI document if you touch dashboard flows.
5. Read the testing document before changing behavior.

## Active Area

The first fully implemented area is `Subscriptions`.

This area includes:
- subscription list in Admin
- subscription details page
- pause, resume, and cancel actions
- schedule plan change
- edit shipping address
- filters, sorting, pagination, and loading/error states

## Notes

- The documents under `specs/` are design-time documents. They are useful for context, but they should not be treated as the final source of truth once implementation evolves.
- The implementation plan remains the roadmap for future work, while the documents in `architecture/`, `api/`, `admin/`, and `testing/` should describe the current state of the plugin.
