# Stage 02 — Screen identity / source mapping

First-class stage. New or unmapped screens route through here **before** authoring
(05) or reconcile (04). Index: [`../workflow-spine.md`](../workflow-spine.md).
Full contract and examples: [`../screen-identity.md`](../screen-identity.md).

**Enter when** a source alias (planning code, design code, Figma node id, slug)
must map to a canonical screen id, or a screen looks new/unmapped.

**Skip this stage when** the canonical `screen_id` is already known and stable for
the target. Then go to 03 or 04.

## Core rule

External source ids are **aliases / evidence**. Canonical identity is
**workflow-owned**:

```txt
screen_id            # globally unique canonical screen identifier
route                # canonical route
domain               # domain
screen-spec path     # docs/frontend-workflow/domains/{domain}/screens/{screen}/screen-spec.md
```

A planning `A-001`, design `J010`, node id `1:234`, or slug is a source alias —
never a `screen_id`. **Do not invent a canonical screen ID from a Figma/planning
code.** Mapping is recorded in the Screen Source Map, which is the single source of
truth.

기존 화면이 active canonical sibling에 흡수된 경우에는 새 identity를 만들지 말고
[`screen lifecycle`](../screen-lifecycle.md)의 `absorbed_into` 계약을 따른다.

## Read these first

- [`../screen-identity.md`](../screen-identity.md) — the canonical-vs-alias contract.
- `docs/frontend-workflow/_meta/screen-source-map.md` if present (template:
  [`../../../templates/meta/screen-source-map.template.md`](../../../templates/meta/screen-source-map.template.md)).
- `docs/frontend-workflow/app/navigation-map.md` — route/nav evidence.
- existing screen-specs under `domains/{domain}/screens/` — to avoid duplicating identity.

## Resolve, then scaffold

Resolve the mapping first; only then scaffold a stub. Use `workflow:create-screen`
**only after** the canonical `domain` / `screen_id` / `route` are known:

```bash
npm run workflow:create-screen -- --docs docs/frontend-workflow --domain auth --screen-id AUTH-SIGNUP-EMAIL --route /signup/email --source-input IN-20260625-visual-spec-001
```

`workflow:create-screen` writes a stub ScreenSpec only. It does not invent screen
ids, auto-edit navigation-map, resolve Open Decisions, or promote status to
`confirmed`. Command detail: [`../../../COMMANDS.md`](../../../COMMANDS.md).

## When the mapping is ambiguous

Ambiguous mapping (one source code points at several canonical candidates, or
evidence is thin) becomes:

- `scope-unclear` classification — do not auto-pick a screen,
- a `candidate` / `ambiguous` row in the Screen Source Map,
- an **Open Decision** if it would block implementation (the human owns the gate).

Never auto-resolve. `doctor` surfaces split/ambiguous-free duplicate aliases as a
warning, not a hard gate.

## When the map is absent

Cold-start is allowed. The Screen Source Map is created from
[`../../../templates/meta/screen-source-map.template.md`](../../../templates/meta/screen-source-map.template.md)
**only when** the source mapping workflow is being adopted — its absence is a
NO-OP, not a blocker.

## Examples

1. **planning A-001 + design J010 → canonical `AUTH-SIGNUP-EMAIL`.** Two source
   codes, one canonical row listing both aliases (merged axis). Different source
   codes do not make two screens.
2. **design has no code, only a node id → map via node id + route hint.** Use
   `1:234` + `/signup/email` as evidence to attach to the existing canonical; the
   route hint is evidence, not identity.
3. **a duplicate design code maps to two screens → ambiguous or split.** A copied
   layer carried a stale code. Mark both rows `ambiguous`; raise an Open Decision
   if it blocks. Do not silently merge two distinct screens.
4. **the same source code intentionally creates two code screens → split.** One
   planning `A-010` becomes list + detail. Create two canonical screen ids, mark
   both rows `split` with the split decision/notes. Intentional multiplicity is
   allowed.

## After this stage — next

| Situation | Next |
|---|---|
| external input exists and identity is now clear | [03 Create canonical input artifact](03-create-canonical-input-artifact.md) |
| canonical screen exists but the ScreenSpec is missing | run `workflow:create-screen`, then [03](03-create-canonical-input-artifact.md)/[04](04-reconcile-input.md) |
| identity is ambiguous | [04 Reconcile input](04-reconcile-input.md) with a `scope-unclear` input, or [09 Human decision gates](09-human-decision-gates.md) |
| identity clear, no new input — straight to authoring | [05 Author workflow contracts](05-author-workflow-contracts.md) |

Do not skip ahead to 05/06 on an unmapped screen. Identity is the precondition for
authoring and reconcile.
