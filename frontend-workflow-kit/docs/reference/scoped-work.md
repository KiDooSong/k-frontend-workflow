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

4. **Unknown and Conflict scope** (optional) — the document that holds an
   Unknown or Conflict row may narrow which units of an owner its open row blocks
   with `uncertainty_work_scopes`: the same binding, with `unknown_id` or
   `conflict_id` in place of `decision_id`, and the same digest and approval
   rules. It answers only what the tool cannot judge (`scope-review-needed`); a
   unit whose selected evidence reaches the row stays blocked. Reopening a
   resolved row removes its binding.

   ```yaml
   uncertainty_work_scopes:
     version: 1
     bindings:
       - conflict_id: C-012
         owner: screen:RESULT-001
         known_units: [result-layout, save-action]
         blocks: [save-action]
         basis_digest: sha256:<computed-by-tool>
         approval_ref: <existing-human-approval-evidence>
   ```

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
- Scoped targets support regular-file `A`, `M` and `D` (#276). A `D` target must
  be a regular file in the baseline (`delete-target-missing` when it is absent)
  and passes the same unit gates and path checks as `A`/`M`. A path the owner
  declares exactly — its screen entry, an exact surface, private or test path,
  or a Slice Paths entry of its API Candidates tables as written (whether or not
  the requesting unit selects that API, and even when the entry is not usable
  API evidence) — is denied as `declared-path-delete`: deleting it changes the
  owner's declaration, which a person reviews. A code block (fenced or indented)
  is an example, not a declaration. Renames, copies and type/mode changes stay
  separate work.
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
  Investigation and verification references keep their prefix. Reconciliation
  Items targets use the
  [same grammar](input-reconciliation.md#reconciliation-contract-v2-opt-in) (#274),
  so a scoped reference and an Items target read one token the same way.
- **Uncertainty audit** — Unknowns and Conflicts tables are audited in every
  document. A table-shape or row-identity problem stops the preflight when a row
  there could relate to the request: the document belongs to a selected owner's
  native scope (its own spec, a surface it hosts, a same-domain, global or
  undomained document), holds selected evidence, or contains any typed reference
  — as written, in decoded frontmatter or as a link destination, the way
  resolution reads it. Elsewhere the section is skipped and listed in
  `required_reviews` as
  `Unaudited uncertainty section <file>#<section>: <reason>`.
- **Uncertainty relations** — an Unknown or Conflict row applies to a unit
  through the unit's selected evidence, through a row or Decision it reaches, or
  natively: to every unit of an owner whose spec, hosted surface, domain or a
  global or undomained document holds it. A resolved row does not block (an
  Unknown with Status `resolved` in any case, a Conflict with `resolved`). An
  open Conflicts row outside every owner spec keeps that native relation only for
  the owners its `영향 화면` cell names, for a named surface's member screens,
  and for a surface that hosts a named screen still on legacy readiness (a
  `legacy-current` host checks no Unknown or Conflict), when the cell lists only
  known screen or surface IDs separated by `,` or `·`; `global` in any letter
  case (even when a screen has that ID), a blank, prose, markup or an unknown ID
  keeps it for every owner. A resolved row keeps its relations whatever the cell
  names. A current
  `uncertainty_work_scopes` binding on an open row keeps the native relation
  only for its `blocks`, unless the unit still reaches the row through another
  row it keeps; a binding on a resolved row changes nothing.
  The request lists each row whose home declares a binding for its owner in
  `evidence.uncertainty_scopes` (an adopted surface host's under its
  `evidence.hosts` entry), and each binding that narrows in `required_reviews`
  as `Uncertainty scope <ref> for <owner> is narrowed …`.
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
- only allowed, requested regular-file `A`/`M`/`D` targets with the requested
  change kind may change; `M` keeps its file mode, and `D` may remove only a
  baseline regular file. In the worktree a deleted target must be gone: a
  directory left at the path, even empty or holding only ignored files, is a type
  violation. A regular file put back at the path is no delete: the requested `D`
  is missing, and unless the file keeps its baseline bytes and mode, Git sees an
  unrequested modify. Under a directory left there Git reports only the files it
  does not ignore, as adds, and an add the request does not name is unrequested;
- renames, copies, type/mode changes, unrequested paths (an unrequested delete
  included) and missing requested changes are violations. The diff detects
  renames, so a requested `D` and `A` whose contents Git pairs as a rename are
  still a rename.

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

## While a unit is blocked

A request under a blocked unit is not ready, whatever it changes — for example
while an open Decision, Unknown or Conflict reaches the unit. Maintenance
unrelated to the blocking row (a comment cleanup, a dead-file delete) is blocked
too: there is no maintenance exception, and the fallback guard above keeps current
work from taking the change over (#276). To unblock the unit, a person:

- resolves the blocking row through its normal workflow;
- adds or re-judges the row's binding (`decision_work_scopes` or
  `uncertainty_work_scopes`) so the row blocks fewer units, with a recomputed
  `basis_digest` and its `approval_ref`. A Decision binding's `blocks` applies as
  written; an Unknown or Conflict binding narrows only the row's native relation,
  so a unit whose selected evidence reaches that row stays blocked; or
- withdraws the owner's adoption ([rollback](#rollback-and-downgrade)), which
  returns its paths to the legacy authority.

## Rollback and downgrade

Stop scoped work first. Review the current diff and unfinished work, restore the
reviewed explicit deny boundaries, then withdraw adoption owner by owner. Do not
delete input/effect/work records to hide history. The vendored-kit upgrade planner
refuses to apply automatically a payload that cannot enforce adoption markers while
tracked `work_execution`/`decision_work_scopes`/`uncertainty_work_scopes` declarations
remain in the consumer repository. An older kit binary run by hand is outside this guarantee.

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
- The CLI reads one baseline snapshot. It does not see a row reopened with its
  binding left in place, because the reopened row has the bytes the binding was
  recorded for. As for Decisions, a library check that pairs `HEAD` with the
  index reports such a reopen, but no command runs it yet; reviewers check that
  a reopen diff removes the binding.
- A consumed API evidence directory is compared with its committed members, so an
  uncommitted or Git-ignored file there (OS or editor metadata too) is reported in
  the worktree check. Keep such directories clean, or name the evidence files.
