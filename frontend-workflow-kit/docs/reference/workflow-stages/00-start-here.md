# Stage 00 — Start Here

Current-stage router. Map the user's ask (or the task you observed) to a starting
stage, then read **only** that stage doc and the references it links. Back to the
index: [`../workflow-spine.md`](../workflow-spine.md).

## Router

| User says / observed task | Current stage | Read |
|---|---|---|
| "이 raw Figma를 workflow input으로 만들어" | 01 → 02 → 03 | source producer + screen identity + create input |
| "기획/디자인 코드가 어떤 screen_id인지 헷갈려" | 02 | screen identity |
| "새 화면이 생겼어" | 02 → create-screen → 03/04 | screen identity + create-screen |
| "이 input 반영해줘" | 04 | reconcile-input |
| "screen-spec 새로 작성해야 해" | 02/05 | screen identity + author contracts |
| "화면 구현해줘" | 06 | implement-screen |
| "공통 컴포넌트 만들었어/만들어줘" | 06 → 07 | implement/code + generated catalog |
| "Open Decision 닫아도 돼" | 09 → 07/08 | human decision gates |
| "API 타입 추가했어" | 05/06 → 08 | API contract + validate |
| "route 추가했어" | 05/06 → 07/08 | route/screen + generated route/nav |
| "policy draft 반영할까?" | 10 | policy/layout/Tier3 |

## How to read this

- The arrow chain (`01 → 02 → 03`) is the typical path, not a mandate. Skip any
  earlier stage whose precondition already holds — see the spine's
  "Skip previous stages when…" table.
- A `02` that appears before authoring/reconcile is **not** skippable for a new or
  unmapped screen. Resolve identity first.
- **08 validate and report** always runs at session end, regardless of where you
  entered.
- **09 human decision gates** is entered only when the user explicitly asks to
  resolve/accept/confirm a human-owned transition. Merely raising or recording an
  open decision, unknown, or component gap stays in 04–06 and is reported in 08 —
  it does not pull you into 09.

## Stage docs

| NN | Stage | Owner |
|---|---|---|
| 01 | [Source-specific input production](01-source-specific-input-production.md) | consumer repo |
| 02 | [Screen identity / source mapping](02-screen-identity-source-mapping.md) | kit |
| 03 | [Create canonical input artifact](03-create-canonical-input-artifact.md) | kit, adapter-friendly |
| 04 | [Reconcile input](04-reconcile-input.md) | kit |
| 05 | [Author workflow contracts](05-author-workflow-contracts.md) | kit |
| 06 | [Implement screen or code](06-implement-screen-or-code.md) | kit |
| 07 | [Regenerate derived views](07-regenerate-derived-views.md) | kit |
| 08 | [Validate and report](08-validate-and-report.md) | kit |
| 09 | [Human decision gates](09-human-decision-gates.md) | human |
| 10 | [Policy/layout/Tier3 changes](10-policy-layout-tier3-changes.md) | kit |

When the task touches more than one artifact, use
[`../task-artifact-matrix.md`](../task-artifact-matrix.md) for the secondary
updates, and [`../generated-files.md`](../generated-files.md) before touching any
generated output.
