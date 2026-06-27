# Stage 01 — Source-specific input production

> **This stage is consumer-owned.** Adapt it to your environment. The text below
> is a customizable template and commentary, not a kit-owned implementation.
> Index: [`../workflow-spine.md`](../workflow-spine.md).

**Enter when** raw source data (a Figma file, a planning doc, an OpenAPI spec, a QA
report, an internal export) needs to be turned into normalized facts the workflow
can consume.

**Skip this stage when** no external/raw source needs parsing:

- you were handed a normalized payload → start at 02 (resolve identity) or 03 (create the artifact);
- the input artifact `docs/frontend-workflow/inputs/{input_id}.md` already exists → start at 04 (reconcile). Do not re-create it here or in 03 — that duplicates the artifact and can leave the register unreconciled.

## What the kit does and does not do here

- **The kit does not parse your raw Figma, planning, API, QA, or internal export
  formats.** There is no kit-owned source parser, and the kit will not learn your
  folder layout, your design-tool conventions, or your planning-doc schema.
- **Consumer repos may provide local skills/producers** for each source. These are
  yours to write, name, and maintain.
- **The producer outputs normalized facts (a producer payload)** — it does not
  mutate workflow docs.

This is the one stage you are expected to customize. Everything downstream (02–10)
consumes the normalized handoff; it does not care how you produced it.

## Customize this section for your environment

```text
<!-- Consumer repo customization:
Describe your local producers here:
- figma-screen-input: ...
- planning-input: ...
- openapi-input: ...
- qa-input: ...
The producer should hand off normalized payload to Stage 02/03.
-->
```

Examples of local skills a consumer repo may provide:

- `figma-screen-input` — read a design source, extract frames/nodes and source screen codes.
- `planning-doc-input` — read a planning doc, extract intents and planning screen codes.
- `openapi-input` — read an OpenAPI/schema source, extract endpoint/DTO facts.
- `qa-input` — read a QA report, extract selector/acceptance facts.
- `testid-input` — extract testID/selector proposals.
- internal source sync adapters — pull from an internal export/sync system.

The kit only expects a **normalized handoff** carrying enough for Stage 02/03:

- source facts,
- source aliases,
- raw refs,
- candidate affected domain/screen info,
- optional `source_screen_refs`,
- enough data for Stage 02/03 to resolve identity and create the input artifact.

## Normalized payload — example fields

A producer payload (or producer-set facts) typically carries:

```txt
source_type            # concrete adapter/type: figma | planning-doc | api-doc | qa | testid | ...
source_ref             # link or path to the original source
captured_at            # when the source was captured
captured_by            # which local producer/skill captured it
raw_artifacts          # optional pointers to screenshots/exports (refs, not copies)
source_screen_refs     # source aliases as evidence (planning ids, design ids, node ids, route hints)
extracted_facts        # normalized facts the workflow can read
candidate affected     # candidate affected domains/screens (NOT canonical ids yet)
```

`source_screen_refs` is the bridge to Stage 02. Shape it as alias evidence, never
as canonical identity:

```json
{
  "source_screen_refs": [
    { "source": "planning-figma", "source_id": "A-001", "route_hint": "/signup/email", "node_id": null, "confidence": "candidate" },
    { "source": "design-figma",   "source_id": "J010", "node_id": "1:234", "confidence": "candidate" }
  ]
}
```

## Boundaries (consumer producers must hold these)

- **Do not mutate workflow docs directly in this stage.** No ScreenSpec, no
  navigation-map, no register edits. Produce a payload; let 03/04 write docs.
- **Do not invent canonical screen IDs.** A planning code (`A-001`) or design code
  (`J010`) is a source alias, not a `screen_id`. Mapping is Stage 02's job and the
  Screen Source Map's single source of truth.
- **If source screen aliases are present, pass them forward to Stage 02** as
  `source_screen_refs` (or in `extracted_facts`) so identity can be resolved.

## After this stage — where you exit

A source-specific producer may call `workflow:create-input` directly (Stage 03)
**only after** screen identity is resolved enough to produce valid
`affected_screens` (canonical ids). Otherwise it should **stop at the payload** and
hand off to Stage 02.

```txt
identity resolvable now   → produce canonical affected_screens → 03 (workflow:create-input)
identity ambiguous/new    → stop at payload + source_screen_refs → 02 (screen identity)
```

When a producer does call `workflow:create-input` (Stage 03), choose the output
grouping from the resolved scope (flat output stays the default):

- single resolved domain → `--group-by domain` (`inputs/{domain}/`);
- cross-domain input → `--group-by domain` (`inputs/_multi/`) or an explicit `--input-subdir`;
- source not yet mapped to identity → `--group-by domain` lands in `inputs/_unknown/`, or
  keep it flat until Stage 02 resolves identity.

Grouping only changes the file's directory — never its `input_id` and never the
`source_screen_refs` evidence, both of which must survive into reconcile.

| Next | when |
|---|---|
| [02 Screen identity / source mapping](02-screen-identity-source-mapping.md) | aliases need to map to canonical screen ids before an artifact can be valid |
| [03 Create canonical input artifact](03-create-canonical-input-artifact.md) | identity is already clear; emit normalized facts as `IN-*.md` |

References: [`../screen-identity.md`](../screen-identity.md) (alias vs identity),
[`../input-reconciliation.md`](../input-reconciliation.md) (producer boundary,
`source_screen_refs` rendering).
