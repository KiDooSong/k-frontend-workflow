# ck-ai-mobile pre-adoption skeleton handoff draft

> Status: **DRAFT / HANDOFF ONLY**. 2026-06-22.
> This document is meant to be copied or adapted into `ck-ai-mobile` while full
> `frontend-workflow-kit` adoption is deferred. It does **not** install the kit,
> wire CI, run readiness gates, resolve decisions, or change source code.
>
> Intent: let LLM work use the same document shape the kit will eventually
> require, without pretending that current ck documents are protected by kit
> enforcement.

---

## 0. One-line policy

Use `docs/frontend-workflow/**` as a **shadow contract**: LLMs must read and
update it before implementation, but humans must not treat it as a readiness
gate until the kit is explicitly adopted.

## 1. What to create in ck-ai-mobile

Create only authoring/shadow documents first. Do not create generated kit outputs
such as `design/component-catalog.md`, `_meta/workflow-state.yaml`,
`_meta/screen-inventory.yaml`, or `_meta/nav-graph.yaml`.

Recommended first skeleton:

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

Why this shape:

| File | Purpose | Source template |
|---|---|---|
| `README.md` | Declare shadow-mode status and boundaries | this document |
| `global/llm-rules.md` | LLM behavior rules before implementation | [`llm-rules.template.md`](../../templates/global/llm-rules.template.md) |
| `app/navigation-map.md` | App-level route guard, stack/tab/modals, cross-domain edges | [`navigation-map.template.md`](../../templates/app/navigation-map.template.md) |
| `domains/auth/domain-rules.md` | Auth-wide rules, vocabulary, data contract notes | [`domain-rules.template.md`](../../templates/domain/domain-rules.template.md) |
| `screen-spec.md` | Screen behavior, state, API candidates, copy, unknowns, decisions | [`screen-spec.template.md`](../../templates/screen/screen-spec.template.md) |
| `figma-component-mapping.md` | Visual/Figma mapping and optional visual spec | [`figma-component-mapping.template.md`](../../templates/screen/figma-component-mapping.template.md) |
| `_shadow/component-index.md` | Temporary manual DS index while catalog-gen still assumes `src/components/ui/**` | ck-specific |
| `_shadow/adoption-notes.md` | What is intentionally not wired yet | ck-specific |

## 2. Shadow-mode README text

Suggested `docs/frontend-workflow/README.md`:

```md
# Frontend Workflow Shadow Documents

> Status: shadow / pre-adoption. These documents align ck-ai-mobile work with
> the future frontend-workflow-kit contract, but they are not wired to kit
> readiness, validate, forbidden-paths, or CI yet.

## Rules

- Treat these files as LLM guidance and draft contracts.
- Do not interpret `status: draft` as implementation approval.
- Do not set `status: confirmed`, close Open Decisions, or mark conflicts
  resolved without human instruction.
- If a document conflicts with current code, stop and record the conflict.
- Generated kit outputs are not maintained in this phase.

## Current scope

- Navigation skeleton
- Auth domain rules
- One pilot screen: login
- Figma/visual mapping for the pilot screen when available
- Temporary design-system component index under `_shadow/`
```

## 3. LLM rules to add first

Start from the kit template, but add this shadow banner at the top of
`global/llm-rules.md`:

```md
> Shadow mode: these rules guide implementation, but no kit gate is active.
> When unsure, write Unknowns/Open Decisions instead of guessing.
```

Minimum ck-specific rules:

- Read the relevant `screen-spec.md` before editing a screen route or feature
  component.
- Keep route files thin when feasible, but do not refactor existing working
  screens only to satisfy the future kit layout.
- API endpoint, request, response, result code, and query invalidation rules are
  not guessed. If not confirmed, record them under `API Candidates` or
  `Unknowns`.
- Figma/token values are copied from ck-owned sources:
  `codex-figma/**`, `claude-figma/**`, and
  `src/design-system/tokens/token-name-map.json`.
- testID anchors are recommended and should follow ck's existing kebab-case
  convention.
- New shared components are proposed in `_shadow/component-index.md` or
  `component-gap-register.md` only after a human decides which path to use.
- `docs/frontend-workflow/design/component-catalog.md` is reserved for the
  future generator; do not hand-write it in shadow mode.

## 4. Navigation map starter

Suggested first `app/navigation-map.md` content should reflect current Expo
Router structure from `src/app/**`:

```md
# Navigation Map (Shadow)

## Structure
- Root layout: `src/app/_layout.tsx`
- App stack/group: `src/app/(app)/**`
- Auth stack/group: `src/app/(auth)/**`
- Interaction lab: `src/app/(app)/interaction-lab/**`

## Route Guard
- Auth routes: login, signup, reset, social verification.
- App routes: home, explore, token gallery, component gallery, interaction lab.
- Guest/auth guard policy is documented but not enforced by the kit in this phase.

## Cross-Domain Edges
| From | To | Trigger |
|---|---|---|
| login | signup | signup entry |
| login | reset/send-code | password reset entry |
| signup/done | app home | start app |
```

Use this as a route overview, not as a generated `route-tree` replacement.

## 5. Pilot screen recommendation

Use `auth/login` as the first pilot because it already has:

- visible route files under `src/app/(auth)/login/**`
- feature components under `src/features/auth/components/**`
- auth API/query modules under `src/features/auth/api/**`
- existing testID coverage
- social-login branching that benefits from explicit Open Decisions

Suggested `screen-spec.md` frontmatter:

```yaml
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
```

For the body, keep `State Matrix`, `Interaction Matrix`, `API Candidates`,
`Copy Keys`, `Unknowns`, and `Open Decisions` even if some rows are sparse.
The important migration benefit is preserving the table shapes.

## 6. Visual spec starter

`figma-component-mapping.md` should start with the baseline
`## Component Mapping` table and only opt into `## Visual Spec` where ck has
reliable Figma/token evidence.

Recommended sources:

- `codex-figma/components/**`
- `codex-figma/tokens/**`
- `codex-figma/normalized/**`
- `src/design-system/tokens/token-name-map.json`
- relevant Figma extraction notes in `docs/input-sync-reconcile/**`

Do not make the kit responsible for collection. In shadow mode, ck owns Figma
facts, token manifests, screenshots, and baselines.

## 7. Temporary component index

Because catalog generation currently assumes `src/components/ui/**` and
PascalCase filenames, ck should keep the existing design-system path and use a
temporary manual index instead:

```md
# Shadow Component Index

> Temporary. This is not `design/component-catalog.md` and is not consumed by
> frontend-workflow-kit. It exists only to stop LLMs from inventing components
> before catalog-gen supports ck's design-system layout.

| Component | Source | Notes |
|---|---|---|
| Button | `src/design-system/components/button.tsx` | use existing variant props |
| Input | `src/design-system/components/input.tsx` | forwards testID-derived ids |
| Checkbox | `src/design-system/components/checkbox.tsx` | terms/signup flows |
| CodeInput | `src/design-system/components/code-input.tsx` | verification code |
```

Kill condition: delete or archive this file once the real component catalog can
read ck's design-system root.

## 8. What not to do yet

- Do not vendor the full kit into ck.
- Do not add kit CI jobs.
- Do not run `forbidden-paths` as an enforced check.
- Do not hand-write generated kit files.
- Do not move design-system components to `src/components/ui` only for the kit.
- Do not mark shadow docs as `confirmed`.
- Do not let LLMs resolve Open Decisions.

## 9. Exit criteria for real adoption

Move from shadow mode to real kit adoption only when:

1. A ck-specific `project-layout.yaml` is accepted.
2. The component catalog path/name issue is either fixed in the kit or ck chooses
   a migration path.
3. At least one pilot screen's screen spec and visual mapping survive real work.
4. The team agrees which kit checks are warning-only and which can enter CI.
