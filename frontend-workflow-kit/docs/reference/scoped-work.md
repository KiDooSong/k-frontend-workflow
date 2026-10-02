# Scoped work execution (`authority: scoped`)

`authority: scoped` evaluates a **task-sized work unit** of an explicitly adopted
owner with its own evidence, instead of the cumulative screen `readiness_mode`.
It replaces only the cumulative phase limits. Source, decision, schema, owner,
generated-file and claim restrictions stay in force, and every result is review
input — never product, merge or human approval.

Use [current work](current-work.md) for tasks that the existing authority already
allows. Scoped work needs a human-reviewed opt-in first; without it the scoped
request fails closed.

## Adoption is an explicit human checkpoint

Nothing is adopted by default. A repository without a policy `work_execution`
section keeps byte-compatible legacy/current/visual-refresh behavior.

1. **Policy** — the implementation-mode policy lists the adopted owners and the
   role ceilings per work kind:

   ```yaml
   work_execution:
     version: 1
     owners: [screen:RESULT-001, surface:RESULT-PANEL]
     profiles: [visual, api-contract, behavior]
     role_limits:
       visual: [screen, domain_component, hook, test]
       api-contract: [api_client, test]
       behavior: [screen, domain_component, hook, api_client, test]
     deny_paths: []
   ```

   `role_limits` is a ceiling intersected with actual owner paths, not a glob
   grant. Move any project-specific extra prohibition into `deny_paths`.

2. **Owner** — the ScreenSpec or shared-surface-spec frontmatter declares stable
   work units (not per-session permits), optional narrow private roots and test
   roots. A surface unit maps every member screen to a host unit, or to
   `legacy-current` for an unadopted member; a visual surface unit also selects
   each host's own mapping rows:

   ```yaml
   work_execution:
     version: 1
     units:
       - id: panel
         kind: visual
         contracts: [artifact:RESULT-PANEL-rules#rules]
         sources: []
         host_units: {RESULT-001: layout, RESULT-002: legacy-current}
         host_visual_evidence:
           RESULT-001: {mapping_ref: 'artifact:RESULT-001-figma-component-mapping#component-mapping', m_keys: [M-001]}
           RESULT-002: {mapping_ref: 'artifact:RESULT-002-figma-component-mapping#component-mapping', m_keys: [M-004]}
   ```

3. **Decision scope** (optional) — the canonical home of an Open Decision may
   narrow which units of an owner it blocks with `decision_work_scopes`. Without a
   current binding an open decision blocks **every** scoped unit of that owner.
   Only a person adopts, narrows or restores a binding; the tool computes and
   compares `basis_digest` but never authenticates `approval_ref`.

Pilot one owner or domain at a time, and review the migration diff (policy
ceilings, deny paths, roots, units, bindings) before relying on it.

## Request contract

The five execution CLIs accept the same document as current work. A scoped
request selects one owner **unit**:

```json
{
  "version": 1,
  "origin_inputs": [],
  "requests": [
    {
      "owner": "surface:RESULT-PANEL",
      "authority": "scoped",
      "unit": "panel",
      "coverage_reports": ["docs/frontend-workflow/_meta/reviews/result-review.md"],
      "targets": [{"path": "src/features/result/components/panel/Panel.tsx", "change": "M"}]
    }
  ]
}
```

- Keys are exactly `owner`, `authority`, `unit`, `targets` and optional
  `coverage_reports`; `requested_mode` and caller verdicts are invalid.
- Coverage report files, like every other authority file, are read from the
  committed baseline tree; commit the reviewed report before the preflight.
- Scoped targets support regular-file `A` and `M` only.
- An owner may select several distinct units; a target shared by several requests
  must plan the same change.
- `origin_inputs` has the current-work meaning: the preserved starting inputs,
  never an exclusion list.
- A document mixing current and scoped requests is an input error; submit
  separate work requests.

## Common CLI flow

Use the [representative before/after run flow](current-work.md#common-cli-flow)
with `.workflow/scoped-work.json`. Carry the same request/origins/resource options
and the pre-work packet to the post-work run, before committing the implementation.
[Packet-bound output and preservation rules](current-work.md#packet-bound-run-outputs)
apply to scoped runs too. The scoped parser/assertion binds its own authority,
directory and target read sets; a current packet cannot stand in for it.
Standalone readiness/packet/report/forbidden-paths remain diagnostic/compatible entries.

## Evaluation on the immutable baseline

Every decision is computed from the materialized `HEAD` tree. Worktree edits,
packets and serialized verdicts are not authority. For each scoped request:

- **Owner** — the unit's profile predicate (`visual`, `api-contract`, `behavior`)
  over its resolved contracts, sources/coverage and origins; the owner's canonical
  Decision scopes; and every concrete target against the owner envelope (exact
  entry, private/test roots, surface implementation paths, role ceilings, API
  claims, reservations of other owners, generated/global/route/explicit denies).
- **Surface hosts** — every member: an adopted host needs its own profile, Decision
  scopes and consent under its member role ceiling; a `legacy-current` host
  consents only through the member base envelope of the actual legacy surface
  computation, over the workflow state computed from the baseline documents and
  source tree like [current work](current-work.md#origin-and-snapshot-binding)
  (a generated `_meta/workflow-state.yaml` is never read). A visual
  surface keeps each host's mapping rows and Figma provenance; a selected component
  must resolve to one literal repository path inside the surface's own
  implementation paths.
- **Shared targets** — a target selected by several requests is allowed only when
  every responsible request allows it.
- **Legacy readiness** is preserved as information in `legacy_readiness` and its
  phase blockers appear as `future_requirements`. Invalid or structural legacy
  markers and owners missing from the computed state are errors.
- **Reference IDs** — a decision, Unknown, Conflict or gap reference resolves to
  the exact ID in the canonical table that holds the row, as in the general
  contracts: the table, not an ID prefix, decides the kind. Scoped work needs only
  an ID that fits a typed reference (`[A-Za-z0-9][A-Za-z0-9._-]*`) and does not
  start with another kind's prefix (`D-`, `U-`, `C-`, `G-`, `INV-`, `VER-`).
  Investigation and verification references keep their prefix, and Reconciliation
  Items targets keep the
  [strict grammar](input-reconciliation.md#reconciliation-contract-v2-opt-in).
- **Uncertainty audit** — Unknowns and Conflicts tables are audited in every
  document. A table-shape or row-identity problem stops the preflight when a row
  there could relate to the request: the document belongs to a selected owner's
  native scope (its own spec, a surface it hosts, a same-domain, global or
  undomained document), holds selected evidence, or contains any typed reference
  — as written, in decoded frontmatter or as a link destination, the way
  resolution reads it. Elsewhere the section is skipped and listed in
  `required_reviews` as
  `Unaudited uncertainty section <file>#<section>: <reason>`.
- **Legacy sources** — a contract's canonical source (an `IN-` entry in
  frontmatter `sources`, or a typed input reference) connects through
  Reconciliation Items whose target touches the selected contract. An input
  captured before the v2 register's `structured_since` that has no Items is the
  [summary-only legacy row](input-reconciliation.md#v2-frontmatter) the register
  contract allows. It connects through that row when the row is `reconciled`
  with a canonical Result for that status (`accepted`, `pending-user-decision`,
  `rejected`, `delegated`, `no-change`, `mixed`); the Decisions and Conflicts it
  created keep their own gates. The register parser picks the row and its cells;
  its Reconcile Status and Result must also be canonical as written in the
  Summary table the validator checks (not an example placed before it), before
  the parser drops HTML comments, so `accepted <!-- … -->` does not connect. The
  request lists it, with the row's validated cells, its line as written and the
  input sha256, in `evidence.legacy_sources` (an adopted surface host's under its
  `evidence.hosts` entry) and in `required_reviews` as
  `Legacy summary-only source <input_id> (reconciled + <result>) …`. Any Item, a
  later capture, a v1 register, another status or an annotated Result
  (`accepted — …`) keeps the item-level rule and its `source-effect-unconnected`
  denial. An Item source keeps the stricter admission (`reconciled + accepted`,
  or `pending`/partial with a current coverage receipt): history from before
  adoption has no later re-apply path, so its Result is reported, not gated.

The envelope has `work_contract: 1`, `authority: scoped`, `snapshot`,
`request_digest`, `origin_inputs`, `requests` (per request `path_authorizations`,
`prerequisite_denials`, `evidence`), `shared_targets`, `ready`, `errors`,
`denials`, `future_requirements` and `required_reviews`.

## Git backstop

After implementation, `forbidden-paths`, `report` and `run` re-read the request
(bytes and digest) and compare the actual `HEAD..worktree` (or `--staged` index)
diff with the baseline:

- every consumed authority file, the document/input inventories and every consumed
  API evidence path must be unchanged — an implementation diff cannot self-grant.
  An evidence path keeps its kind (missing, file or directory) and a directory
  keeps its members; the worktree check lists them on disk, Git-ignored entries
  included, while `--staged` reads the index only;
- only allowed, requested regular-file `A`/`M` targets with the requested change
  kind may change, and `M` keeps its file mode;
- deletes, renames, copies, type/mode changes, unrequested paths and missing
  requested changes are violations.

`workflow:forbidden-paths --work` stays advisory (exit 0) unless `--enforce`
(exit 1 on violations). Run states and exit codes are the same as
[current work](current-work.md#run-states).

## Adopted paths in fallback entries

An adopted owner's scoped paths (exact screen entry, surface implementation
paths, declared private/test roots and the adopted screens' active Candidate Slice
Paths) need `authority: scoped` with a unit. `readiness --path`, no-work
`forbidden-paths`, current work and visual-refresh v1 return
`work-selection-required` there instead of a broad allow, so a denied scoped task
cannot be retried under an older mode, another intent or current authority. Other
paths of the same owner keep their existing decisions, and no-selector readiness
summaries are unchanged.

## Rollback and downgrade

Stop scoped work first. Review the current diff and unfinished work, restore the
reviewed explicit deny boundaries, then withdraw adoption owner by owner. Do not
delete input/effect/work records to hide history. The vendored-kit upgrade planner
refuses to apply automatically a payload that cannot enforce adoption markers while
tracked `work_execution`/`decision_work_scopes` declarations remain in the consumer
repository. An older kit binary run by hand is outside this guarantee.

## What the tool does not prove

The tool checks references, statuses, digests, paths, claims and snapshots. It
does not prove semantic equivalence of mixed visual/behavior edits, pixel parity,
the completeness of prose contracts or coverage receipts, development-only
isolation, or who approved a binding. Reviewers own those judgments.

## Known limits

- A layout `preset` is read only from a kit inside the project root.
- A selected mapping component cell must hold one literal repository path
  (optionally in one inline-code pair); other forms are reported as
  `surface-visual-evidence-unresolved`.
- Git evidence is `HEAD` against the worktree, or against the index with
  `--staged`; commit ranges are not an input. Committing the implementation moves
  the baseline, so check it with the packet-bound post-work `run` before that commit (standalone
  `forbidden-paths`/`report` remain available).
- A consumed API evidence directory is compared with its committed members, so an
  uncommitted or Git-ignored file there (OS or editor metadata too) is reported in
  the worktree check. Keep such directories clean, or name the evidence files.
