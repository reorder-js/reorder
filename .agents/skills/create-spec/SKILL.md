---
name: create-spec
description: Instructions for creating design specifications (SPECs) before coding (Spec-driven development). Use this skill at the start of any non-trivial task (requiring >3 steps or architectural decisions) to align on architecture and requirements before implementation.
---

# Spec-driven development (Design Before Coding)

This skill enforces the "specification before code" approach inspired by OpenMercato's best practices. It prevents design mistakes and provides structure to the implementation process.

## When to Create a Specification?

For any non-trivial task (e.g., adding a new entity, modifying subscription renewal logic, integrating a payment gateway) that requires **at least 3 implementation steps** or **architectural decisions**, you must first write a technical specification.

## Workflow

**Language Requirement:** The specification file MUST ALWAYS be written 100% in English, regardless of the conversation language.

1. **Create a Skeleton Spec**:
   - Create a file at `.agents/specs/{date}-{title}.md`.
   - Use the `YYYY-MM-DD` format for `date` and kebab-case for the `title`.
   - The skeleton should include a brief description (TLDR/Overview) and key objectives.

2. **Open Questions Section**:
   - Before expanding the full specification, list key unknowns as a numbered list (`Q1`, `Q2`...).
   - Focus on questions about architecture, data models, or scope, where an incorrect assumption would force you to rewrite large parts of the code.
   - **STOP** and ask the user for answers to these questions. Do not write code or the full specification until the user responds.

3. **Complete the Specification**:
   - After receiving answers from the user, complete the specification file with technical details (database schema, API contracts, implementation steps).
   - Remove the Open Questions section.

4. **Implementation Phases**:
   - Split the work into phases (e.g., Phase 1: Database & Module setup, Phase 2: Workflows & APIs, Phase 3: UI integration).
   - Each step should represent a testable unit of work.

## Specification Template

Each specification file should follow this structure:

```markdown
# Spec: [Feature Name]

## TLDR & Overview
A brief summary of the problem and the proposed solution.

## Open Questions (Skeleton Phase Only - remove after resolving)
- Q1: ...
- Q2: ...

## Proposed Architecture & Data Model
Describe new database tables, entity changes, module services, new workflows, or API endpoints.

## Step-by-Step Implementation Plan
### Phase 1: [Phase Name]
- [ ] Step 1 (e.g., database migration & entities)
- [ ] Step 2
### Phase 2: [Phase Name]
- [ ] Step 1 (e.g., API route.ts)

## Verification & Testing
How will you verify correctness? What integration HTTP tests will be added?
```
