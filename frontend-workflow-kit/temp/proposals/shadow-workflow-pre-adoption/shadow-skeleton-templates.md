# Shadow skeleton templates

> Status: **DRAFT / COPY TEMPLATE ONLY**. 2026-06-22.
> These templates are for a `ck-ai-mobile` shadow workflow. They align with the
> intended `frontend-workflow-kit` document shape, but they are not consumed by
> kit commands until the kit is explicitly adopted.

---

## 0. Copy rules

- Replace bracketed placeholders such as `[screen_id]`.
- Keep sparse sections instead of deleting them. Empty sections are useful
  migration anchors.
- Record `Unknowns` and `Open Decisions` instead of guessing.
- Do not use `status: confirmed` in shadow mode.
- Do not create generated kit files such as `design/component-catalog.md`,
  `_meta/workflow-state.yaml`, `_meta/screen-inventory.yaml`, or
  `_meta/nav-graph.yaml`.
- Keep `Visual Spec` rows evidence-based. If a value is not token-backed or
  measured, mark it as a gap.

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
# Navigation Map

> Status: shadow / draft.
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
# Auth Domain Rules

> Status: shadow / draft.

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

## Purpose

[One paragraph describing the screen's job.]

## Source Anchors

| Source | Role | Notes |
|---|---|---|
| `src/app/(auth)/login/index.tsx` | route | [notes] |
| `src/features/auth/components/login-email-form.tsx` | form | [notes] |
| `src/features/auth/components/social-login-buttons.tsx` | social auth | [notes] |

## State Matrix

| State | Entry condition | Visible UI | Disabled UI | Exit |
|---|---|---|---|---|
| idle | screen opened | email/password form, social buttons | none | submit/social/signup/reset |
| submitting | login submitted | loading affordance | submit button | success/error |
| error | login failed | error copy | none | edit/retry |

## Interaction Matrix

| Trigger | Preconditions | Expected behavior | Data/API | Unknowns |
|---|---|---|---|---|
| submit email login | valid form | call candidate login operation | [candidate module] | response shape |
| tap social provider | provider available | start social login flow | [candidate module] | provider taxonomy |
| tap signup | none | navigate to signup | none | target route |
| tap forgot password | none | navigate to reset flow | email? | email prefill policy |

## API Candidates

| Operation | Candidate module | Request | Response | Cache/session effect | Status |
|---|---|---|---|---|---|
| email login | `src/features/auth/api/[file].ts` | [unknown] | [unknown] | [unknown] | candidate |
| social login | `src/features/auth/api/[file].ts` | [unknown] | [unknown] | [unknown] | candidate |

## Copy Keys

| UI copy | Current text | Source | Notes |
|---|---|---|---|
| title | [text] | [source] | [notes] |
| submit | [text] | [source] | [notes] |
| error generic | [text] | [source] | [notes] |

## Accessibility and testID

| Element | testID | Accessibility role/label | Notes |
|---|---|---|---|
| email input | [test-id] | [label] | [notes] |
| password input | [test-id] | [label] | [notes] |
| submit button | [test-id] | [label] | [notes] |

## Unknowns

| ID | Unknown | Why it matters | How to resolve |
|---|---|---|---|
| AUTH-LOGIN-U001 | [unknown] | [impact] | [source/person] |

## Open Decisions

| ID | Decision | Options | Owner | Needed by |
|---|---|---|---|---|
| AUTH-LOGIN-OD001 | [question] | [options] | [owner] | [date/work] |
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

Use this provenance legend consistently:

| Marker | Meaning |
|---|---|
| `T` | token-backed value from a token manifest or named token source |
| `M` | measured from Figma export or frame metadata |
| `H` | human/manual match with a source note |
| `I` | inferred from existing code only |
| `!` | warning, gap, or unstable value |

Future warning behavior should stay compatible with the expected kit direction:

| Warning | Shadow interpretation |
|---|---|
| W1 token format | Prefer token ids; mark raw values with `!` |
| W2 manifest evidence | Record manifest path when available; absence is warning-only |
| W3 visual section shape | Required only for artifacts that opt into `## Visual Spec` |

Template:

```md
---
artifact_id: "AUTH-LOGIN-figma-component-mapping"
artifact_type: figma-component-mapping
domain: "auth"
screen_id: "AUTH-LOGIN"
route: "/(auth)/login"
status: draft
sources:
  - { type: code, ref: "src/app/(auth)/login/index.tsx" }
  - { type: figma, ref: "codex-figma/[path-or-frame].json" }
  - { type: tokens, ref: "src/design-system/tokens/token-name-map.json" }
depends_on: [AUTH-LOGIN-screen-spec]
last_reviewed: "2026-06-22"
---

# AUTH-LOGIN Figma Component Mapping

> Shadow mode: this records visual intent and mapping evidence. It does not
> prove visual fidelity or activate kit readiness.

## Component Mapping

| Figma node | UI role | Existing component | Props/variant | State | Evidence | Gap |
|---|---|---|---|---|---|---|
| [node name/id] | primary action | `Button` | variant=[name] | idle/loading | T/M/H/I | [gap] |
| [node name/id] | email field | `Input` | type=email | idle/error | T/M/H/I | [gap] |

## Visual Spec

> Optional in shadow mode. Keep this section only when reliable visual evidence
> exists. Otherwise leave a `Visual Spec Needed` gap.

### Evidence

| Evidence | Source | Owner | Updated | Notes |
|---|---|---|---|---|
| Figma frame | `codex-figma/[path]` | ck | [date] | [frame/node id] |
| Token manifest | `src/design-system/tokens/token-name-map.json` | ck | [date] | [notes] |
| Baseline screenshot | [path] | ck | [date] | optional |

### Frame

| Property | Value | Provenance | Notes |
|---|---|---|---|
| platform | iOS/Android/web | H | [notes] |
| viewport | [width] x [height] | M | [notes] |
| safe area | [value/token] | T/M/! | [notes] |

### Layout

| Region | Position/spacing | Token or raw value | Provenance | Notes |
|---|---|---|---|---|
| screen padding | [description] | [token id or raw] | T/M/! | [notes] |
| form gap | [description] | [token id or raw] | T/M/! | [notes] |

### Typography

| Element | Text style token | Size/weight/line height | Provenance | Notes |
|---|---|---|---|---|
| title | [token id] | [values] | T/M/! | [notes] |
| button label | [token id] | [values] | T/M/! | [notes] |

### Color

| Element | Color token | Raw fallback | Provenance | Notes |
|---|---|---|---|---|
| screen background | [token id] | [raw if needed] | T/M/! | [notes] |
| primary action | [token id] | [raw if needed] | T/M/! | [notes] |

### States

| State | Visual change | Token/component variant | Evidence | Gap |
|---|---|---|---|---|
| idle | [description] | [variant/token] | T/M/H | [gap] |
| loading | [description] | [variant/token] | T/M/H | [gap] |
| error | [description] | [variant/token] | T/M/H | [gap] |

## Gaps / Open

| ID | Gap | Impact | Resolution path |
|---|---|---|---|
| AUTH-LOGIN-VIS-001 | [gap] | [impact] | [source/person] |
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

> Status: shadow / draft.

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
- Keep all statuses `draft` or `shadow`.
- Commit the skeleton separately from any app source changes.
