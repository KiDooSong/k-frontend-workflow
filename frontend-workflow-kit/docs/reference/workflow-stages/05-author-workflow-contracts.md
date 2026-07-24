# Stage 05 — Author workflow contracts

Author or update the workflow contracts once identity is known. Index:
[`../workflow-spine.md`](../workflow-spine.md). Secondary updates:
[`../task-artifact-matrix.md`](../task-artifact-matrix.md).

**Enter when** ScreenSpec / shared surface / nav / API / visual / docs need authoring.

**Skip this stage when** the contracts for the target are already current. Then go
to 06/07.

## What this stage covers

- **ScreenSpec** writing / updating — the behavior source of truth.
- **shared-surface-spec** — uniform non-route behavior composed into two or more same-domain canonical screens. Membership lives only in surface frontmatter; route transitions stay in member ScreenSpecs. See [`../shared-surfaces.md`](../shared-surfaces.md).
- **Navigation map** (`app/navigation-map.md`) edges and route targets.
- **API manifest** (`api/api-manifest.md`) candidates and confirmed contract evidence.
- **figma-component-mapping** (`figma-component-mapping.md`) — visual mapping, kept
  separate from behavior.
- **domain rules** (`domains/{domain}/domain-rules.md`).
- **component gap register** (`global/component-gap-register.md`) — propose `G-xxx`
  `open` for missing shared components.
- **Open Decisions / Unknowns** — raise them here; do not close them (Stage 09).
  Keep single-screen rows local; put a cross-screen row in the optional global
  register and reference it from each affected ScreenSpec or shared surface. A surface never owns a local decision table. See
  [`../open-decisions.md`](../open-decisions.md).

## ScreenSpec authoring after identity

This is where a ScreenSpec is authored **after identity is known** (Stage 02).

- For an existing canonical screen, edit its ScreenSpec body (State Matrix,
  interactions, copy keys, API candidates) within scope.
- For a result/transition screen with **no own API call**, set ScreenSpec
  frontmatter `api_required: false` and write the API Candidates section as prose
  such as `없음 — upstream 화면의 API 결과/route params 를 표시`. Do not add a fake
  confirmed endpoint.
- When only some API contracts are actionable, use the opt-in structured v2 table
  and assign every row a narrow Slice Path. A deferred row needs open-Unknown or
  issue tracking and does not authorize its code slice. See
  [`../api-candidate-deferral.md`](../api-candidate-deferral.md).
- For a **brand-new screen**, Stage 02 / `workflow:create-screen` may have created a
  **stub** (canonical frontmatter only). Stage 05 fills the body, or — when facts
  are still missing — records open decisions / unknowns instead of guessing.
- **Reconcile-input may perform simple source-backed updates here** (Stage 04
  routes a `simple-update` straight into these contracts). Larger authoring or
  anything needing a human decision stops and surfaces it.

## Boundaries

- Do not invent API endpoints, DTOs, copy, design values, routes, or selector
  conventions. Input-provided copy lands in Copy Keys as `draft`, never `confirmed`.
- Do not resolve Open Decisions, close Unknowns, accept Component Gaps, or promote
  `confirmed` — those are human-owned (Stage 09).
- Canonical screen identity stays workflow-owned; if a referenced screen is unmapped,
  return to [02](02-screen-identity-source-mapping.md).

## After this stage — next

| Next | when |
|---|---|
| [06 Implement screen or code](06-implement-screen-or-code.md) | code changes are requested for the authored screen |
| [07 Regenerate derived views](07-regenerate-derived-views.md) | a generated-view source changed (route, nav edge, catalog primitive) |
| [08 Validate and report](08-validate-and-report.md) | docs-only authoring — run `workflow:state` then validate |

If ScreenSpec frontmatter or parsed body sections changed, run `workflow:state`
before readiness/validate. The same trigger applies to a shared-surface-spec; then run `workflow:readiness -- --surface <SURFACE_ID> --json` and readiness for every member.
