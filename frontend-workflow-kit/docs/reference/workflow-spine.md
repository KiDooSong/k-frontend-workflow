# Workflow Spine

The numbered index of the frontend-workflow lifecycle. It exists so an agent that
enters a consumer repo mid-session can answer four questions fast:

1. **Which stage does this task belong to?** → start at [`workflow-stages/00-start-here.md`](workflow-stages/00-start-here.md).
2. **Which earlier stages can I skip?** → the "Skip earlier stages when" column below.
3. **Which one doc do I read?** → the stage doc for the current stage, plus only its linked references.
4. **What happens after the task?** → the "Next" column and the stage doc's "After this stage" block.

You almost never walk all eleven stages. Enter at the stage matching the task,
skip the earlier stages whose precondition is already satisfied, do the work, then
follow "Next". Read only the current stage doc and the references it links — not
the whole workflow.

## How agents use the spine

```txt
session starts
→ 00-start-here.md          (router: map the user's ask to a current stage)
→ <NN>-<stage>.md           (read ONE stage doc + its linked references)
→ do the task in that stage's lane
→ follow "Next" (often 07/08) and the stage doc's "After this stage" block
→ 08 validate and report     (session handoff summary, every session end)
```

The spine is a routing aid, not a gate. Gates live where they already live:
`workflow:readiness` / `workflow:validate`, Open Decisions, the Reconciliation
Register, and human-owned transitions. Reading a later stage doc never grants
permission the gates withhold.

## Stage table

| Stage | Name | Enter when | Skip earlier stages when | Next |
|---|---|---|---|---|
| 00 | [Start here](workflow-stages/00-start-here.md) | Any agent session starts | never | selected stage |
| 01 | [Source-specific input production](workflow-stages/01-source-specific-input-production.md) | raw source data needs conversion | no external input involved | 02 or 03 |
| 02 | [Screen identity / source mapping](workflow-stages/02-screen-identity-source-mapping.md) | source aliases must map to canonical screen ids | canonical screen id already known | 03 or 04 |
| 03 | [Create canonical input artifact](workflow-stages/03-create-canonical-input-artifact.md) | normalized input facts need `IN-*.md` | input artifact already exists | 04 |
| 04 | [Reconcile input](workflow-stages/04-reconcile-input.md) | input artifact should update workflow docs/registers | no new input involved | 05/06/08 |
| 05 | [Author workflow contracts](workflow-stages/05-author-workflow-contracts.md) | ScreenSpec/nav/API/visual/docs need authoring | contracts already current | 06/07 |
| 06 | [Implement screen or code](workflow-stages/06-implement-screen-or-code.md) | code changes are requested | no code change | 07 |
| 07 | [Regenerate derived views](workflow-stages/07-regenerate-derived-views.md) | source docs/code changed generated outputs | no generated source changed | 08 |
| 08 | [Validate and report](workflow-stages/08-validate-and-report.md) | work is ready to check/handoff | never at session end | end or route back |
| 09 | [Human decision gates](workflow-stages/09-human-decision-gates.md) | resolve/accept/confirm human-owned state | no human decision task | 07/08 |
| 10 | [Policy/layout/Tier3 changes](workflow-stages/10-policy-layout-tier3-changes.md) | project-layout/layers/policy boundaries change | no boundary change | 07/08 |

Stages 00–08 are the main spine in order. 09 and 10 are side stages you drop into
from anywhere and return to 07/08.

## Start midstream — examples

The whole point is to enter at the right stage and skip the rest.

- **"이 input 반영해줘" (an `IN-*.md` already exists)** → enter at **04**. Skip 01–03:
  no raw source to parse, identity is already on the artifact, the artifact exists.
- **"화면 구현해줘" (ScreenSpec is current, identity known)** → enter at **06**. Skip
  01–05. Run readiness, edit only `allowed_paths`, then 07/08.
- **"새 화면이 생겼어"** → enter at **02** (identity first), then `workflow:create-screen`,
  then 03/04. Never jump straight to 05/06 on an unmapped screen.
- **"route 추가했어"** → enter at **05/06** to author/implement, then **07** to
  regenerate route-tree/nav-graph, then **08**.
- **"이 화면 e2e 짜줘 / 웹 검증 돌려줘"** → use `e2e-agent`: plan beside
  **05**, generate only within **06** boundaries when requested, verify/heal as
  **08** evidence. E2E is optional evidence, not a gate.
- **"Open Decision 닫아도 돼?"** → enter at **09** (human-owned), then re-run 07/08.
- **"이 raw Figma를 workflow input으로 만들어"** → enter at **01** (consumer-owned
  parsing) → 02 (map aliases to canonical ids) → 03 (`workflow:create-input`).

When unsure which stage you are in, read [`workflow-stages/00-start-here.md`](workflow-stages/00-start-here.md);
it maps common asks to a starting stage.

## Skip previous stages when…

| Skip | when |
|---|---|
| 01 | no external/raw source is involved (you were handed a normalized payload or an existing artifact) |
| 01–02 | the canonical `screen_id` is already known and a ScreenSpec exists for it |
| 01–03 | the input artifact `docs/frontend-workflow/inputs/{input_id}.md` already exists |
| 01–04 | no new input — you are only authoring contracts or implementing existing ones |
| 05 | the ScreenSpec/nav/API/visual contracts for the target are already current |
| 06 | the task is docs-only / no code change |
| 07 | no generated-view source changed (no route, nav edge, catalog primitive, policy, or lint source touched) |

Two skips are **never** allowed:

- You cannot skip **08** at session end. Every session validates and reports.
- You cannot skip **02** to invent a canonical `screen_id` from a source code.
  New or unmapped screens route through screen identity *before* authoring or
  reconcile. See [`workflow-stages/02-screen-identity-source-mapping.md`](workflow-stages/02-screen-identity-source-mapping.md).

## Ownership — kit-owned vs consumer-repo-owned

The kit ships deterministic scripts and contracts; the consumer repo owns its
source formats and product decisions. Know which side a stage sits on before you
"fix" it.

| Stage | Owner | What that means |
|---|---|---|
| 01 | **consumer repo** | The kit does **not** parse your Figma/planning/API/QA/internal formats. You provide local skills/producers. This stage doc is a customizable template — adapt it. |
| 03 | **kit, adapter-friendly** | Default path is `workflow:create-input`. A consumer producer may wrap it or write the artifact directly **only if** it still satisfies the canonical input artifact contract. "Default implementation + safe extension points." |
| 02, 04–08, 10 | **kit** | Contracts, scripts, and gates are kit-owned. Consumer repos configure via `project-layout.yaml`, policy, and docs — not by forking the contract. |
| 09 | **human** | Resolve / accept / confirm transitions are human-owned. Agents raise gates; people lower them. |

Cross-cutting invariants that hold in every stage:

- Generated `generated/do_not_edit` files are regenerated by their owning command, never hand-edited (Stage 07, [`generated-files.md`](generated-files.md)).
- Canonical screen identity is workflow-owned; source codes are aliases (Stage 02, [`screen-identity.md`](screen-identity.md)).
- Open Decisions, Unknowns, Component Gaps, `confirmed` promotion, live policy replacement, and hard CI gates are human-owned (Stage 09).

## Related references

- Where each repeated fact is canonically owned (the progressive-disclosure map): [`doc-ownership.md`](doc-ownership.md).
- Per-task secondary updates: [`task-artifact-matrix.md`](task-artifact-matrix.md).
- Regeneration map for generated views: [`generated-files.md`](generated-files.md).
- Screen identity contract: [`screen-identity.md`](screen-identity.md).
- Input artifact + reconciliation contract: [`input-reconciliation.md`](input-reconciliation.md).
- Command syntax: [`../../COMMANDS.md`](../../COMMANDS.md).
