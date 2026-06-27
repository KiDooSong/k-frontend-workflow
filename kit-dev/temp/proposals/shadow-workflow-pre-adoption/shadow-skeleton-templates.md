# Shadow skeleton templates

> Status: **DRAFT / COPY TEMPLATE ONLY**. 2026-06-22.
> These templates are for a `ck-ai-mobile` shadow workflow. They align with the
> intended `frontend-workflow-kit` document shape, but they are not active kit
> inputs until the kit is explicitly adopted.

---

## 0. Copy rules

- Replace bracketed placeholders such as `[screen_id]`.
- Keep sparse sections instead of deleting them. Empty sections are useful
  migration anchors.
- Record `Unknowns` and `Open Decisions` instead of guessing.
- Use `status: draft` in frontmatter. Do not use `status: shadow`; shadow is a
  document banner/adoption phase, not a lifecycle enum.
- Do not use `status: confirmed` in shadow mode.
- Do not create generated kit files such as `design/component-catalog.md`,
  `_meta/workflow-state.yaml`, `_meta/screen-inventory.yaml`, or
  `_meta/nav-graph.yaml`.
- Keep `Visual Spec` rows evidence-based. If a value is not token-backed or
  measured, mark it as a gap.
- Treat this as a future-design-aligned pre-adoption pack. Before real kit
  adoption, run a canonicalization pass against the then-current parser,
  manifest, and readiness contracts.

## 1. Recommended target tree

```text
docs/frontend-workflow/
  README.md
  global/llm-rules.md
  app/navigation-map.md
  domains/auth/domain-rules.md
  domains/auth/screens/login/screen-spec.md
  domains/auth/screens/login/figma-component-mapping.md
  _shadow/component-index.md
  _shadow/adoption-notes.md
```

## 2. README template

```md
# Frontend Workflow Shadow Documents

> Status: shadow / pre-adoption.
> These documents align ck-ai-mobile work with the future
> frontend-workflow-kit contract, but they are not wired to kit readiness,
> validation, forbidden-paths, generated catalogs, or CI.

## Rules

- Treat these files as LLM guidance and draft contracts.
- Read the relevant document before implementation.
- Do not interpret `status: draft` as implementation approval.
- Do not set `status: confirmed`, close Open Decisions, or mark conflicts
  resolved without human instruction.
- If a document conflicts with current code, stop and record the conflict.
- Generated kit outputs are not maintained in this phase.

## Current scope

- Navigation skeleton
- Auth domain rules
- One pilot screen: login
- Screen Spec and Visual Spec template usage
- Temporary design-system component index under `_shadow/`
```

## 3. Global LLM rules template

Create `docs/frontend-workflow/global/llm-rules.md`:

```md
---
artifact_id: llm-rules
artifact_type: llm-rules
status: draft
adoption_phase: shadow
last_reviewed: "2026-06-22"
---

# LLM Rules

> Shadow mode: these rules guide implementation, but no kit gate is active.
> When unsure, write Unknowns/Open Decisions instead of guessing.

## Required reading

- Before editing a route or screen component, read the matching
  `screen-spec.md`.
- Before changing navigation, read `app/navigation-map.md`.
- Before creating or replacing a shared component, read
  `_shadow/component-index.md`.
- Before using Figma, token, or visual measurements, read the screen's
  `figma-component-mapping.md`.

## Boundaries

- Do not resolve Open Decisions.
- Do not promote any shadow artifact to `confirmed`.
- Do not move ck paths only to match current kit defaults.
- Do not hand-write generated kit artifacts.
- API endpoints, request payloads, response shapes, result codes, and query
  invalidation rules are not guessed.
- Figma and token facts must point to ck-owned sources.

## Implementation defaults

- Preserve ck's existing Expo Router and feature-folder structure.
- Keep route files thin when feasible, but do not refactor working code only for
  future kit shape.
- Follow ck's existing testID convention.
- Prefer existing design-system components before proposing new ones.
- Put unconfirmed component needs in `_shadow/component-index.md` or a gap row.
```

## 4. Navigation map template

Create `docs/frontend-workflow/app/navigation-map.md`:

```md
---
artifact_id: navigation-map
artifact_type: navigation-map
status: draft
adoption_phase: shadow
last_reviewed: "2026-06-22"
---

# Navigation Map

> Shadow mode / draft.
> This is a human-readable route and guard overview. It does not replace
> generated route-tree or nav-graph outputs.

## Structure

| Area | Route root | Notes |
|---|---|---|
| Root layout | `src/app/_layout.tsx` | [notes] |
| App group | `src/app/(app)/**` | [notes] |
| Auth group | `src/app/(auth)/**` | [notes] |

## Route Guard

| Route | Access | Guard source | Unknowns |
|---|---|---|---|
| `/(auth)/login` | guest | [auth state source] | [unknowns] |
| `/(app)` | authenticated | [auth state source] | [unknowns] |

## Cross-Domain Edges

| From | To | Trigger | Data carried | Notes |
|---|---|---|---|---|
| login | signup | signup entry | none | [notes] |
| login | reset/send-code | password reset entry | email? | [unknowns] |

## Open Decisions

| ID | Decision | Owner | Needed by |
|---|---|---|---|
| NAV-OD-001 | [question] | [owner] | [date/work] |
```

## 5. Domain rules template

Create `docs/frontend-workflow/domains/auth/domain-rules.md`:

```md
---
artifact_id: "auth-domain-rules"
artifact_type: domain-rules
domain: "auth"
status: draft
adoption_phase: shadow
last_reviewed: "2026-06-22"
---

# Auth Domain Rules

> Shadow mode / draft.

## Scope

- Routes: `src/app/(auth)/**`
- Feature code: `src/features/auth/**`
- API/query code: `src/features/auth/api/**`
- Shared auth infrastructure: `src/infrastructure/auth/**`

## Vocabulary

| Term | Meaning | Source |
|---|---|---|
| session | [meaning] | [source] |
| social login | [meaning] | [source] |

## State Rules

| State | Meaning | UI implication | Unknowns |
|---|---|---|---|
| unauthenticated | [meaning] | [behavior] | [unknowns] |
| authenticating | [meaning] | [behavior] | [unknowns] |

## API Candidates

| Operation | Candidate module | Request | Response | Status |
|---|---|---|---|---|
| email login | `src/features/auth/api/[file].ts` | [unknown] | [unknown] | candidate |

## Guardrails

- Do not add auth API calls outside the accepted auth API surface without a
  recorded decision.
- Do not invent result codes or error taxonomy.
- Keep password reset and social login branches explicit in screen specs.

## Open Decisions

| ID | Decision | Options | Owner | Needed by |
|---|---|---|---|---|
| AUTH-OD-001 | [question] | [options] | [owner] | [date/work] |
```

## 6. Screen Spec template

Create `docs/frontend-workflow/domains/auth/screens/login/screen-spec.md`:

```md
---
artifact_id: "AUTH-LOGIN-screen-spec"
artifact_type: screen-spec
domain: "auth"
screen_id: "AUTH-LOGIN"
route: "/(auth)/login"
status: draft
adoption_phase: shadow
sources:
  - { type: code, ref: "src/app/(auth)/login/index.tsx" }
  - { type: code, ref: "src/features/auth/components/login-email-form.tsx" }
  - { type: planning, ref: "docs/planning/auth-nav-screen-index.md" }
depends_on: [navigation-map]
last_reviewed: "2026-06-22"
---

# AUTH-LOGIN Screen Spec

> Shadow mode: this guides LLM implementation but does not unlock kit
> readiness.
> Keep canonical table headers unless the future kit contract explicitly
> changes them. Put ck-specific detail in notes or optional sections.

## Purpose

[One paragraph describing the screen's job.]

## Source Anchors

| Source | Role | Notes |
|---|---|---|
| `src/app/(auth)/login/index.tsx` | route | [notes] |
| `src/features/auth/components/login-email-form.tsx` | form | [notes] |
| `src/features/auth/components/social-login-buttons.tsx` | social auth | [notes] |

## UI Sections

1. Email/password form
2. Social login buttons
3. Signup and password reset links

## State Matrix

| State | Condition | UI |
|---|---|---|
| loading | login request or social auth flow is pending | loading affordance; submit/social actions disabled |
| success | authenticated session is accepted | navigation to authenticated app route |
| empty | initial form has no user input | email/password form; social buttons; signup/reset links |
| error | login request or validation fails | error copy near affected field or form summary |
| refreshing | session status is rechecked after return from provider | existing form state with refresh affordance if needed |

## Interaction Matrix

| User Action | Trigger | Result | Analytics Event |
|---|---|---|---|
| submit email login | valid form submit | call candidate login operation; on success route to authenticated app | [event or -] |
| tap social provider | provider button press | start provider flow; on return refresh session status | [event or -] |
| tap signup | signup entry press | route to signup flow | [event or -] |
| tap forgot password | password reset entry press | route to reset/send-code flow; email prefill policy is unknown | [event or -] |

## Shadow Interaction Notes

| User Action | Preconditions | Candidate data/API | Unknowns |
|---|---|---|---|
| submit email login | valid form | `src/features/auth/api/[file].ts` | response shape; session side effect |
| tap social provider | provider available | `src/features/auth/api/[file].ts` | provider taxonomy; return handling |

## API Candidates

- POST /auth/login (confidence: candidate)
- POST /auth/social/[provider] (confidence: candidate)

## Copy Keys

| Key | 문구 | Status |
|---|---|---|
| auth.login.title | [text from source] | draft |
| auth.login.submit | [text from source] | draft |
| auth.login.error.generic | TBD | tbd |

## Accessibility and testID

| Element | testID | Accessibility role/label | Notes |
|---|---|---|---|
| email input | [test-id] | [label] | [notes] |
| password input | [test-id] | [label] | [notes] |
| submit button | [test-id] | [label] | [notes] |

## Unknowns

| ID | Question | Status |
|---|---|---|
| AUTH-LOGIN-U001 | What is the confirmed login response/session side effect? | open |
| AUTH-LOGIN-U002 | Should reset flow prefill the typed email? | open |

## Open Decisions

| ID | Decision Needed | Options | Blocking Mode | Owner | Status |
|---|---|---|---|---|---|
| AUTH-LOGIN-OD001 | Which social providers are in the launch scope? | TBD | final-fixture-ui | PM | open |
```

## 7. Figma mapping and Visual Spec template

Create
`docs/frontend-workflow/domains/auth/screens/login/figma-component-mapping.md`.

The final kit direction is:

- `## Component Mapping` is the baseline section.
- `## Visual Spec` is optional and evidence-based.
- Visual rows are migration evidence, not readiness proof.
- The kit records and checks shape; ck owns Figma facts, token manifests,
  screenshots, and baselines.
- Prefer token ids. Raw values are allowed only when marked as gaps or warnings.
- Screen behavior and route ownership stay in Screen Spec. Figma mapping records
  how a screen looks and how Figma nodes map to UI components.

Use this provenance legend consistently:

| Marker | Meaning |
|---|---|
| `✔T` | token-backed value from a token manifest or named token source |
| `✔M` | measured from Figma export or frame metadata |
| `◎` | design-system component contract value, not screen-specific |
| `▱` | coordinate-derived or approximate measurement; replace when better evidence exists |
| `⚠` | warning, gap, raw value, or unstable inference |

Future warning behavior should stay compatible with the expected kit direction:

| Warning | Shadow interpretation |
|---|---|
| W1 token format | Prefer token ids; mark raw values with `⚠` |
| W2 manifest evidence | Record manifest path when available; absence is warning-only |
| W3 visual section shape | Required only for artifacts that opt into `## Visual Spec` |

Template:

```md
---
artifact_id: "AUTH-LOGIN-figma-component-mapping"
artifact_type: figma-component-mapping
domain: "auth"
screen_id: "AUTH-LOGIN"
status: draft
adoption_phase: shadow
sources:
  - { type: figma, ref: "codex-figma/[path-or-frame].json" }
  - { type: tokens, ref: "src/design-system/tokens/token-name-map.json" }
depends_on: [AUTH-LOGIN-screen-spec]
last_reviewed: "2026-06-22"
---

# AUTH-LOGIN Figma Component Mapping

> Shadow mode: this records visual intent and mapping evidence. It does not
> prove visual fidelity or activate kit readiness.
> Behavior and route facts belong in `screen-spec.md`.

## Frame

- `codex-figma/[path-or-frame].json` / node `[node-id]`

## Component Mapping

| Figma Frame / Node | UI 요소 | 매핑 컴포넌트 | 비고 |
|---|---|---|---|
| [frame] / [primary button node] | primary action | `Button` | variant=[name]; loading state noted in Screen Spec |
| [frame] / [email input node] | email field | `Input` | validation behavior belongs in Screen Spec |

## Notes

- Keep this section visual. Business behavior, state ownership, and navigation
  are single-sourced from `screen-spec.md`.
- If a mapped component is missing from the real catalog, propose it as a gap;
  do not create a new shared component from this file alone.
- If an element's existence depends on an Open Decision, note the decision id
  here and keep the mapping provisional.

## Provenance

- `✔T` token-system evidence. Prefer token id over raw value.
- `✔M` measured Figma/frame evidence.
- `◎` design-system component contract value; do not restate component internals
  as screen-specific visual facts.
- `▱` approximate geometry-derived value. Replace with `✔M` or `✔T` when
  possible.
- `⚠` raw literal, inferred value, or unresolved gap. Add a matching
  `## Gaps / Open` item.

## Visual Spec

> Optional in shadow mode. Fill this only when ck has reliable Figma/token
> evidence. Omit the section or leave a gap if visual facts are not available.

| Section/Node | direction | gap | padding | align/justify | sizing | color | type |
|---|---|---|---|---|---|---|---|
| [login form] | column ✔M | `space.4` ✔T or `raw 16` ⚠ | `space.4` ✔T | center ✔M | fill ✔M | `bg.surface` ✔T | `body.md` ✔T |

## Assets

| node | source | format | status |
|---|---|---|---|
| [provider icon] | [design-system path or asset path] | svg/tsx/png | [available/gap] |

## Gaps / Open

| ID | Gap | Impact | Resolution path |
|---|---|---|---|
| AUTH-LOGIN-VIS-001 | `raw 16` spacing has no token id | token migration ambiguity | confirm token id or add token gap |
| AUTH-LOGIN-VIS-002 | provider icon source not confirmed | asset drift risk | confirm DS asset path |

## Cross-links

- screen-spec: ./screen-spec.md
- shadow component index: ../../../_shadow/component-index.md
```

## 8. Shadow component index template

Create `docs/frontend-workflow/_shadow/component-index.md`:

```md
# Shadow Component Index

> Temporary. This is not `design/component-catalog.md` and is not consumed by
> frontend-workflow-kit. It exists only to stop LLMs from inventing components
> before catalog generation supports ck's design-system layout.

## Existing Components

| Component | Source | Import | Notes |
|---|---|---|---|
| Button | `src/design-system/components/button.tsx` | [import path] | use existing variant props |
| Input | `src/design-system/components/input.tsx` | [import path] | preserve testID behavior |
| Checkbox | `src/design-system/components/checkbox.tsx` | [import path] | signup/terms flows |
| CodeInput | `src/design-system/components/code-input.tsx` | [import path] | verification code |

## Gaps

| Need | Existing alternative | Decision needed |
|---|---|---|
| [component need] | [component] | [decision] |

## Kill Condition

Archive or delete this file once the real component catalog can read ck's
design-system root.
```

## 9. Adoption notes template

Create `docs/frontend-workflow/_shadow/adoption-notes.md`:

```md
# Shadow Adoption Notes

> Shadow mode / draft.

## What is intentionally not wired

- Kit install
- Kit CI
- `validate` as an enforced check
- `forbidden-paths` as an enforced check
- Generated component catalog
- Generated route/nav metadata

## Deferred decisions

| Decision | Why deferred | Needed before |
|---|---|---|
| ck-specific `project-layout.yaml` | path roles need human acceptance | real adoption |
| component catalog source contract | ck DS layout differs from current defaults | generated catalog |
| warning vs gate policy | avoid false confidence | CI |

## Promotion checklist

- [ ] Pilot Screen Spec was used during real implementation.
- [ ] Pilot Visual Spec has source links or explicit gaps.
- [ ] Project layout is accepted.
- [ ] Component catalog path issue is resolved.
- [ ] Humans approve which checks are warning-only and which are gates.
```

## 10. First-copy checklist

- Create the target tree under `docs/frontend-workflow/**`.
- Fill only the login pilot at first.
- Preserve ck's current catalog paths and design-system structure.
- Use `_shadow/component-index.md` instead of generated
  `design/component-catalog.md`.
- Keep frontmatter lifecycle statuses as `draft`. Express shadow/pre-adoption
  status in the document banner or `adoption_phase: shadow`, not in the
  lifecycle enum.
- Before real adoption, canonicalize these shadow docs against the active kit
  templates and parser contracts.
- Commit the skeleton separately from any app source changes.
