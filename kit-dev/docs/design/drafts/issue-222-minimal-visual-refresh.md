# Issue #222 minimal v1 — Evidence-bound Visual Refresh
Status: proposed minimal v1; implementation not started
Issue: #222
Baseline: `49a3a31029293eae3fd6765f75e2b5520f939a93` (`origin/main`)
Scope: one selected visual input authorizing one stable existing screen-entry modification
This document defines the first implementable slice for Issue #222. It changes no source, test, fixture, policy YAML, schema, template, manifest, skill, distributed payload, dependency, release, version, or tag.

## 1. Problem and Scope
### 1.1 Current gap
`readiness_mode` is a progress ladder. The selected mode remains:

```text
min(fact_mode, decision_cap)
```

At `final-fixture-ui`, screen work is allowed. At `api-integrated-ui`, the authored `{roles.screen}` work-step deny closes screen editing while hook and API wiring are performed.
That restriction is useful for API work. It leaves no narrow path when exact visual evidence arrives after the screen has already reached the API stage.
The existing escape routes are inappropriate:
- advancing to `production-ready` requires unrelated CI and review facts; reopening an Open Decision changes progress semantics only to obtain edit access.
Issue #222 v1 adds one explicit work intent, `visual-refresh`, to solve only this gap.
### 1.2 Minimal result
A positive v1 grant is bound to all of the following:
- one source snapshot and one destination snapshot selected by the diff source; one selected active ScreenSpec whose authority-bearing identity is stable across those
  snapshots; one selected canonical input artifact in the destination snapshot; one unambiguous terminal branch in the selected input's explicit `supersedes` component;
  agreement between input frontmatter and Register Summary supersession edges; one selected Reconciliation Item group; one exact current Mapping Provenance Contract v1 row; one
  concrete, existing, non-empty Evidence bullet; `fact_mode` and `decision_cap` at least `final-fixture-ui`; one captured input whose opted-in Fidelity contract is internally
  valid; and one existing, unique-owned ScreenSpec `screen_entry` file.
The positive implementation authority is exact-file authority. It does not authorize a role glob, a domain component, a file creation, an ownership transfer, or a replacement operation.
### 1.3 Existing trust boundary
The implementation reuses the repository's current trust boundary:
- canonical input authoring and Input Result Contract; Reconciliation Contract v2; Mapping Provenance Contract v1; optional Input Fidelity Contract v2; current ScreenSpec
  lifecycle and structural checks; current readiness fact and Open Decision cap computation; current layout and path policy; existing generated/do-not-edit ownership; existing
  Tier3, custom, shared-surface, API Candidate, and ownership restrictions; `workflow:validate` and review; and existing human-only decision transitions.
The v1 does not defend against a malicious actor who can forge trusted Markdown or rewrite Git history.
It is an accidental and tool-driven over-authorization guard inside the current repository trust boundary.
### 1.4 Explicit non-goals
This v1 does not:
- prove repository-wide visual freshness; search for the newest input by timestamp; authorize domain components; authorize removal or retirement; authorize file add, rename,
  copy, or typechange operations; authorize a ScreenSpec ownership transfer; make Input Fidelity Contract v2 mandatory for legacy inputs; create a capability or adoption
  artifact; create a Git-history approval system; create a reusable authorization platform for arbitrary intents; or authorize app-shell work.

## 2. Safety Invariants
Only the following are v1 merge blockers.
### 2.1 I1 — no-intent compatibility
When `--intent` is absent, existing readiness computation, path authorization, diff-source behavior, option behavior, exit behavior, and serialized output retain their current byte and shape meaning.
An API-mode screen remains forbidden from editing its screen path under the ordinary no-intent contract.
### 2.2 I2 — one snapshot pair
Every trusted input to an explicit visual backstop invocation comes from one source/destination snapshot pair derived from the selected diff source.
Working-tree, checkout, external override, or another-worktree files outside that pair cannot influence authority.
### 2.3 I3 — stable screen authority
The selected ScreenSpec must identify the same screen and the same exact implementation path in both source and destination snapshots.
The active owner set for that path must be exactly the selected screen in both snapshots.
A visual-refresh invocation cannot create authority by changing `screen_entry`, domain, lifecycle, screen identity, or another ScreenSpec's ownership declaration in the same change set.
### 2.4 I4 — final visual-readiness floor
The destination snapshot's existing readiness computation must report:

```text
fact_mode >= final-fixture-ui
AND
decision_cap >= final-fixture-ui
```

The selected mapping must also be non-deprecated.
Lower ordinary modes keep their existing no-intent behavior, but they cannot create evidence-bound visual intent authority.
### 2.5 I5 — selected supersession component is unambiguous
The selected input must be the only terminal leaf of its connected explicit `supersedes` component.
Any ancestor fork, competing terminal branch, duplicate connected identity, malformed connected successor, frontmatter/Register edge contradiction, or cycle is structural ambiguity and fails closed.
### 2.6 I6 — accepted and current evidence
The selected Summary must have `Reconcile Status=reconciled` and `Result=accepted`.
The selected reconciliation Effect and current Mapping Provenance row must resolve to the same concrete, visible, non-empty, in-range Evidence bullet.
Input-ID or ref-string equality alone is insufficient.
### 2.7 I7 — selected input authority floor
The selected input must declare canonical `status: captured`.
An input without `input_contract` may use the legacy path.
When `input_contract` is present, it must be supported version `2`, and the selected Fidelity dependency chain must have no structured `IF-*` issue.
### 2.8 I8 — exact existing screen modification
The only positive implementation operation is:

```text
M <stable selected unique-owned existing screen_entry>
```

`A`, `R`, `C`, `T`, and `D` never receive visual authority.
Deleting the authorized path is an explicit violation in a visual-refresh invocation.
### 2.9 I9 — non-waivable denies win
Tier3, custom, generated/do-not-edit, shared-surface, API Candidate, ownership, and every other independent deny remain authoritative.
Only the canonical built-in API-stage `{roles.screen}` work-step deny identified by stable rule provenance may be waived.
### 2.10 I10 — authoring and implementation routes are separate
The visual backstop does not evaluate canonical authority documents through the selected screen's implementation envelope.
- exact selected input/register/mapping writes use snapshot-consistent artifact validation; recognized existing authoring/output paths use their existing contract; every other
  changed record uses the selected screen's ordinary path authorization; and generated/do-not-edit wins as a final deny in every route.
There is no unclassified-path `continue` in explicit visual context.
### 2.11 I11 — forward/backstop parity
Forward readiness and the diff backstop consume the same pure implementation-file helper for the same selected context and exact implementation path.
The backstop adds snapshot, stable-ownership, record-routing, and operation-kind checks but cannot broaden the forward grant.
### 2.12 Accepted limitation
The v1 proves direct authority safety for the selected explicit supersession component, exact mapping target, and exact stable screen entry.
It does not prove that no unrelated pending input exists elsewhere.
That limitation is accepted and is not a merge blocker.

## 3. Public CLI and Snapshot Contract
### 3.1 Readiness invocation

```bash
npm run workflow:readiness -- \
  --screen CREATE-ATTACH \
  --intent visual-refresh \
  --input IN-20260820-figma-003 \
  --path src/features/create/screens/CreateAttachScreen.tsx \
  --json
```

The first and only v1 intent enum value is `visual-refresh`.
For an actual readiness file authorization:
- `--screen` is required; `--input` is required; and one canonical concrete `--path` is required.
Readiness may omit `--path` for applicability inspection.
Such an invocation grants no file and reads the ordinary current repository view because it does not inspect a diff.
### 3.2 Backstop invocation

```bash
npm run workflow:forbidden-paths -- \
  --screen CREATE-ATTACH \
  --intent visual-refresh \
  --input IN-20260820-figma-003 \
  --path src/features/create/screens/CreateAttachScreen.tsx \
  --staged \
  --enforce
```

For `workflow:forbidden-paths`, `--intent`, `--screen`, `--input`, and exact `--path` are required together.
Any missing tuple member or visual selector without `--intent` is a usage error and exits `2` before artifact, diff, Git, or snapshot loading.
A valid but different `--path` is not a usage error.
Evidence applicability is computed independently and the result is deterministic:

```text
applicable:true
allowed:false
```

### 3.3 Common selector constraints
`visual-refresh` cannot be combined with `--surface`.
No `--app-shell`, capability-artifact, item, effect, mapping-key, or public authority-snapshot selector is introduced.
The following remain usage errors and exit `2`:
- unknown or blank intent; visual-refresh without `--screen` or `--input`; `--input` without an intent; `--intent` combined with `--surface`; existing screen/surface selector
  conflicts; blank or non-canonical `--path`; and existing unknown-option or malformed-value errors.
Evidence or authorization failure is not a syntax error.
It returns normal output and exits `0` with `applicable:false` or `allowed:false`, except that backstop `--enforce` still exits `1` when violations exist.
### 3.4 Diff source to snapshot pair
Explicit visual backstop authority uses this fixed mapping:

| Diff source | Changed records | Source snapshot | Destination snapshot |
|---|---|---|---|
| `--staged` | existing index diff | `HEAD^{tree}` | Git index tree |
| `--range A..B` | existing two-dot semantics | resolved `A^{tree}` | resolved `B^{tree}` |
| `--range A...B` | existing three-dot semantics | resolved merge-base tree | resolved `B^{tree}` |
| `--base <ref>` | existing base-to-HEAD semantics | exact tree used as the diff's left side | resolved `HEAD^{tree}` |
| default local mode | existing local records | resolved `HEAD^{tree}` | resolved `HEAD^{tree}` |
| `--diff <name-status-file>` | name/status only | unavailable | unsupported with visual context; exit `2` |
The implementation may read index blobs directly or materialize the logical index tree.
It must not substitute the working tree for the index tree.
A visual range must expose deterministic left and right trees.
If the existing parser cannot do so, the visual invocation exits `2`; no current-checkout fallback is allowed.
### 3.5 Snapshot-consistent authority reads
The destination snapshot supplies:
- selected input bytes and the connected supersession component; Reconciliation Register bytes; selected mapping artifact and Mapping Provenance bytes; Open Decision inputs;
  destination ScreenSpecs and owner index; generated/shared ownership facts; regular-file existence and type; and generated workflow state or equivalent in-memory derived facts.
The source snapshot supplies:
- source ScreenSpecs and owner index; source authority-bearing ScreenSpec fields; and source regular-file identity for the authorized path.
The preferred implementation derives workflow facts in memory from snapshot files through existing pure collectors.
Reading snapshot `_meta/workflow-state.yaml` is acceptable only when the same snapshot proves it is the generated output for those snapshot inputs.
The analyzer must never mix snapshot docs with current working-tree `_meta` files.
### 3.6 Authority-bearing option confinement
In explicit visual context, existing path options cannot inject authority from outside the selected worktree or snapshot pair.
`--root` identifies one Git worktree by canonical realpath.
Explicit `--docs`, `--policy`, `--manifest`, and `--layout` values must:
- be canonical project-relative paths under that worktree; contain no absolute path, `..` escape, symlink escape, or other-worktree target; resolve to the expected file or
  directory kind; and be read from the selected snapshots, never from the live filesystem.
An explicit override outside those rules is a usage or snapshot-input error and exits `2` before authority evaluation.
`--src` is retained for CLI compatibility.
In v1 visual context it contributes no authority input; if provided, it must still be canonical and worktree-relative, and it is not read from the live filesystem.
### 3.7 Trusted built-in resources
An omitted override may use only immutable resources bundled with the executing kit package.
Such a built-in resource is trusted runtime input, not consumer-repository authority, only when:
- it resolves inside the executing package realpath; its package version and content hash are captured in the authorization context; and no consumer path can shadow or replace it.
External absolute files and another installed or checked-out kit are not accepted as built-in substitutes.
A project-specific policy, manifest, or layout remains snapshot-owned and must use the confined override path.
### 3.8 Working-tree isolation
For `--staged`, unstaged authority documents and config overrides do not exist for the invocation.
For `--range`, files from the current checkout do not exist for the invocation.
For `--base` and default local visual mode, destination authority is `HEAD`.
Consequences:
- staged screen `M` plus unstaged authority docs cannot authorize; staged screen `M` plus unstaged or external policy cannot authorize; range `A..B` uses B's authority even when
  another commit is checked out; default local mode can use authority already in `HEAD`; uncommitted authority-document or ScreenSpec identity changes cannot authorize default
  local code work; to validate authority docs and code together before committing, stage the entire set and use `--staged`.
### 3.9 Minimal output
Intent-specific fields appear only for an explicit supported intent.

```json
{
  "intent_authorization": {
    "intent": "visual-refresh",
    "input_id": "IN-20260820-figma-003",
    "applicable": true,
    "mapping_key": "M-014",
    "evidence_ref": "input:IN-20260820-figma-003#extracted-facts/02",
    "authorized_path": "src/features/create/screens/CreateAttachScreen.tsx",
    "checked_path": "src/features/create/screens/CreateAttachScreen.tsx"
  },
  "path_authorization": {
    "allowed": true
  }
}
```

`authorized_path` is derived from the destination snapshot ScreenSpec only after source/destination stability succeeds.
The caller cannot retarget the intent by supplying another path.
### 3.10 No-intent commands
These existing commands keep their current behavior and output shape:

```bash
npm run workflow:readiness -- --screen CREATE-ATTACH --json
npm run workflow:readiness -- --screen CREATE-ATTACH \
  --path src/features/create/screens/CreateAttachScreen.tsx --json
```

Neither command emits intent-specific fields.
Existing no-intent diff sources, overrides, and `--diff` behavior remain unchanged.

## 4. Screen Authority Stability
### 4.1 Authority-bearing ScreenSpec identity
For explicit visual backstop use, normalize these fields in both source and destination snapshots:

```text
screen_id
domain
screen_lifecycle
screen_entry
```

`screen_lifecycle` means the canonical active/absorbed/deprecated lifecycle interpretation already used by the repository, not a new frontmatter field.
Positive applicability requires exact equality of the normalized tuple.
A missing, ambiguous, non-canonical, or changed tuple is `applicable:false`.
### 4.2 Stable owner set
Let:

```text
source_path =
  canonical(source_selected_screen.screen_entry)

destination_path =
  canonical(destination_selected_screen.screen_entry)
```

Positive applicability requires:

```text
source_path == destination_path
```

and:

```text
active_owners(source_snapshot, source_path)
  == { selected_screen_id }

active_owners(destination_snapshot, destination_path)
  == { selected_screen_id }
```

The owner index compares canonical `screen_entry` values across all active ScreenSpecs in each snapshot.
### 4.3 Ownership transfer is not visual authoring
Any changed ScreenSpec that adds or removes ownership of the authorized path makes the visual intent inapplicable.
This includes:
- changing the selected ScreenSpec's `screen_entry`; changing its `screen_id` or domain; changing its lifecycle so ownership appears or disappears; removing another ScreenSpec's
  competing `screen_entry`; adding a new ScreenSpec owner; or absorbing, deprecating, or reactivating a ScreenSpec to alter the owner set.
The selected ScreenSpec body may change under its ordinary authoring contract only when the authority-bearing tuple and owner set remain stable.
The visual intent never grants permission to perform the ScreenSpec change.
### 4.4 Existing regular file floor
The stable authorized path must be an existing regular file in both source and destination snapshots.
This v1 is a content-refresh contract, not a creation, ownership-transfer, symlink, or replacement contract.
There is no fallback to:
- `{roles.screen}`; route entry; filename inference; repository search; `src/**`; or mapping-table component prose.

## 5. Selected Input and Supersession Integrity
### 5.1 Screen and input identity
```yaml
status: captured
input_contract: 2
affected_domains: [auth]
affected_screens: [AUTH-LOGIN]
supersedes: IN-20260820-figma-003
```

The selected input must:
1. resolve by a unique `input_id` in the destination snapshot;
2. pass the applicable Input Result hard contract;
3. declare canonical `status: captured`;
4. contain the selected ScreenSpec ID directly in canonical `affected_screens`; and
5. contain the selected ScreenSpec domain directly in canonical `affected_domains`.
`raw:*`, a source alias, split or ambiguous mapping, a non-captured status, or a different canonical screen/domain is non-authorizing.
Indirect Screen Source Map authorization is deferred.
### 5.2 Fidelity opt-in floor
The absence of `input_contract` retains legacy eligibility.
When `input_contract` is present:

```text
parseInputFidelityContract(input.frontmatter).version == 2
```

is required.
Every structured `IF-*` issue in the selected input's resolved Fidelity dependency chain is authority-blocking, including:
- unsupported contract version; missing required Fidelity keys; invalid inherited/direct value; unresolved or ambiguous `verified_against`; duplicate target identity; inherited cycle;
  and contradictory chain state.
This authority floor does not require every legacy input to adopt Fidelity v2.
It also does not independently require `verification=verified` or `unreadable_count=0`.
It only prevents a selected input from opting into a broken contract and still creating authority.
### 5.3 Two supersession observations
For every input record in the selected connected component, collect:
- `input.frontmatter.supersedes`; and the same input's Reconciliation Register Summary `Supersedes`, when a Summary row exists.
Normalize:

```text
null | missing | empty | "-"  => no parent
non-empty input ID             => that parent ID
```

When both observations exist, they must be exactly equal.
No implementation may silently prefer frontmatter or Register data.
### 5.4 Register/frontmatter mismatch
The following is structural contradiction:

```text
input B supersedes: null
Register B Supersedes: A
```

The reverse mismatch is also structural contradiction:

```text
input B supersedes: A
Register B Supersedes: -
```

For a historical component input with no Summary row, a valid frontmatter edge may be used.
A Register-only edge whose input record exists but whose frontmatter has no matching edge remains a contradiction.
A Register edge to a missing, duplicate, or ambiguous input is a connected structural defect.
The selected input itself must always have its one trusted Summary row under the Reconciliation Contract v2 requirements.
### 5.5 Component construction before identity filtering
The supersession analyzer does not begin from a map that has already discarded duplicate identities.
It first collects every destination-snapshot input record with:
- source file identity; raw and parsed `input_id`; raw and normalized frontmatter `supersedes`; raw and normalized Register `Supersedes`, when present; and Input Result and
  consistency defects.
Canonical edges use:

```text
child --supersedes--> parent
```

A malformed or duplicate child that points into the component remains a connected structural defect, not an unrelated input that may be filtered out.
### 5.6 Unique terminal branch
Starting from the selected node, compute the connected component using parent and reverse successor relations.
Positive authority requires all of the following:
1. every component `input_id` resolves to exactly one record;
2. every input/Register supersession observation agrees;
3. every canonical edge resolves to exactly one parent;
4. no malformed or duplicate successor identity points into the component;
5. the component is acyclic;
6. the component has exactly one terminal leaf;
7. the selected input is that terminal leaf; and
8. every ancestor on the selected chain has exactly one canonical successor, namely the next node on that chain.
Therefore this fork is structural ambiguity:

```text
ROOT
|- A  (supersedes ROOT)
`- B  (supersedes ROOT)
```

Selecting A remains inapplicable even though A has no direct successor.
One direct successor makes the selected input stale and yields a next action to reconcile and use the successor.
Forks, observation mismatches, duplicate connected successors, or cycles require repairing the explicit input graph.
This is not a timestamp-based repository-wide freshness scan.
It evaluates only the selected explicit supersession component.
### 5.7 Register and Summary outcome
The applicable Reconciliation Register must:
1. declare Reconciliation Contract v2;
2. have one trusted canonical Summary table and Item table;
3. contain exactly one Summary row for the selected input;
4. report `Reconcile Status=reconciled`; and
5. report authority-positive `Result=accepted`.
Every other Result is non-authorizing, including:
- `rejected`; `no-change`; `pending-user-decision`; `delegated`; `mixed`; `failed`; `pending`; and blank or unknown values.
### 5.8 Singular authorizing group
The public v1 CLI adds no item or mapping-key selector.
The selected input must therefore resolve to exactly one eligible authorizing Item group and one distinct mapping key.
The selected group must satisfy all of the following:
- selected dependency-closure RR/RP hard trust passes; every row has `Basis=visual-evidence`; every row has `Classification=simple-update`; every Effect is `update` or `create`;
  every Target is the same exact current mapping-row target; and no other target or effect kind is mixed into the group.
Zero or multiple eligible groups or keys is `applicable:false`.
The next action is to split or refine Stage 04 reconciliation.

## 6. Mapping Provenance and Evidence Authority
### 6.1 Exact target grammar
The only authorizing target is:

```text
artifact:<screen-figma-mapping-id>#component-mapping/<M-ID>
```

The mapping artifact's canonical `screen_id` must equal the selected screen.
Mapping-key comparison is exact:

```text
M-014 != M-0140
```

Whole artifacts, section-only targets, visual-family targets, ScreenSpec targets, component-gap targets, coarse or unkeyed targets, historical rows, and retirement/tombstone targets create no authority.
### 6.2 Mapping Provenance opt-in is mandatory
The selected mapping artifact must explicitly opt into Mapping Provenance Contract v1:

```text
parseMappingProvenanceContract(mapping.frontmatter).version == 1
```

The following are `applicable:false`:
- missing `provenance_contract` and legacy version `0`; unsupported contract value; duplicate canonical Component Mapping or Mapping Provenance section/table; unparsable required
  canonical table; non-canonical required headers; duplicate or ambiguous Mapping Key namespace; and missing or orphan 1:1 Component Mapping and Mapping Provenance rows.
Authority code must not independently parse an exact-looking legacy table and bypass the contract opt-in.
### 6.3 Selected mapping row
The selected M-ID must:
- exist exactly once in the current Component Mapping table; have exactly one current Mapping Provenance row; belong to the selected mapping artifact; and pass
  selected dependency-closure provenance trust.
Structural mapping ambiguity blocks the selected artifact.
An unrelated local row error may remain non-blocking only when it does not affect structural identity or the selected dependency closure.
### 6.4 Concrete Evidence floor
String equality is insufficient.
Both Effect and Mapping Provenance Evidence must independently resolve through the same canonical resolver to:
- `status=ok`; the same input ID; the same section slug; the same concrete one-based bullet index; an in-range visible bullet; and non-empty text after trimming.
Section-only Evidence and out-of-range refs such as `/99` are non-authorizing even when both records contain the same string.
### 6.5 Figma-source authority floor
The selected row must have no `MP-103` contradiction between its effective Source Ref and the mapping artifact's explicit Figma file/frame context.
The selected Effect, Mapping Provenance row, and mapping artifact must resolve to compatible Figma file identity.
Each accepted effective source must retain a canonical file plus node/frame anchor under the existing precision contract.
A selected row with contradictory Figma files or frames is `applicable:false`, even if general validation reports that contradiction as warning-first.
### 6.6 Currentness and group atomicity
Currentness is exact-row local:

```text
selected_effect.target == current exact mapping target
AND
resolved_effect_evidence == resolved_current_mapping_evidence
```

If the current mapping row points to another input or bullet, the older Effect loses authority naturally.
A group that mixes an authorizing mapping update with another effect or target is wholly inapplicable.
The helper never authorizes only a subset.

## 7. Exact Path and Deny Authorization
### 7.1 Exact checked path
After stable ScreenSpec ownership succeeds:

```text
authorized_path =
  canonical(destination_selected_screen.screen_entry)
```

A forward positive result requires:

```text
checked_path == authorized_path
```

`{roles.screen}` is only a classification check confirming that the exact entry lies in the screen role under the resolved layout.
It never expands authority to all matching files.
Same-domain screens, domain components, hooks, API clients, and other files receive no visual grant.
### 7.2 Logical deny provenance
Before display deduplication, each effective allow or deny rule used for authorization retains provenance equivalent to:
- `source_mode`; `authored_path`; `resolved_path`; `disposition`; `origin_kind`; `origin_scope`; and `stable_rule_id`.
Rules are logical records, not path strings.
String equality does not prove identity.
### 7.3 The only waivable rule
The helper may waive only the canonical built-in logical rule with:

```text
origin_kind = mode-policy
source_mode = api-integrated-ui
authored_path = {roles.screen}
disposition = deny
stable_rule_id = canonical API-stage screen work-step deny
```

A preset mirror may coalesce only when synthesis deterministically proves it is the same built-in logical rule.
String equality is not proof of identity.
### 7.4 Independent non-waivable rules
These remain independent and non-waivable:
- project or domain Tier3 rules; custom path rules; generated/do-not-edit ownership; delegated shared-surface ownership; API Candidate deferred, conflict, or unowned restrictions;
  other ownership restrictions; and policy, config, package, or repository-control restrictions.
Any matching independent deny wins.
### 7.5 Generated ownership input
Generated ownership is resolved by the repository's existing generated-file single source.
The exact path's generated/do-not-edit fact is passed into the shared helper as an independent final deny input.
The visual intent defines no second detector.
A generated selected screen entry or authority document is denied even when all evidence predicates pass.

## 8. Backstop Record Routing
### 8.1 Raw record preservation
Explicit visual context preserves every raw `A/M/R/C/T/D` record before the existing `writePathsOf` deletion filtering or guarded-surface filtering.
No record is skipped merely because it is outside guarded, API, Candidate, or known role surfaces.
### 8.2 Routing order
Every record is processed in this order:
1. generated/do-not-edit final deny;
2. exact selected-authority authoring closure;
3. manifest-known existing authoring/output contract;
4. every remaining path through the selected screen's ordinary no-intent file helper.
Route 4 is the fail-closed fallback.
If the helper cannot classify the path or finds no positive ordinary rule, the record is a violation.
Custom-layout source, repository scripts, package paths, and role-unknown `.ts`, `.tsx`, or `.mjs` files cannot pass through an unclassified `continue`.
### 8.3 Selected-authority authoring closure
The exact selected-authority closure contains only the destination paths for:
- selected input artifact; selected Reconciliation Register; and selected Figma mapping artifact.
A ScreenSpec is not part of this authority closure.
ScreenSpec changes use their existing authoring contract and cannot change the authority-bearing tuple or owner set defined in Section 4.
Broad `docs/frontend-workflow/**` permission is forbidden.
### 8.4 Authoring operation rules
For exact selected-authority documents:
- `A` or `M` may pass only when the destination snapshot exists and all applicable artifact, selected-dependency, supersession, provenance, and authority predicates pass; `R`, `C`,
  `T`, and `D` are violations in visual context.
Recognized non-authority authoring or output paths use their existing contract.
They receive no visual grant.
Generated/do-not-edit remains a final deny.
### 8.5 Implementation operation rules
For implementation records:

```text
changed_path == authorized_path
AND
change_kind == M
=> evaluate with visual context
```

Every other implementation record uses the selected screen's ordinary no-intent helper.
When the ordinary helper returns `allowed:false`, the record is a violation, independent of guarded-surface membership.
These never receive visual authority:

```text
A authorized_path
R old -> authorized_path
C old -> authorized_path
T authorized_path
D authorized_path
```

`D authorized_path` is always an explicit violation.
Supporting those operations would require a larger identity, old-path, symlink, and history contract excluded from v1.
### 8.6 Stable ScreenSpec evaluation order
Source/destination ScreenSpec stability is evaluated before any visual path grant.
A change that retargets `screen_entry` cannot first create a destination owner and then consume that new ownership.
A change that removes a competing owner cannot manufacture unique ownership for the same invocation.
If stability fails:

```text
intent_authorization.applicable = false
```

and all changed implementation records continue through ordinary fail-closed routing.
### 8.7 Packet and Report
Packet and Report may transport only:
- selected input ID; selected mapping key; exact Evidence ref; source snapshot identity; destination snapshot identity; authorized path; and checked path.
These fields are audit data, not an authority artifact.
The backstop always re-evaluates current selected snapshots, option confinement, ScreenSpec stability, and all authority predicates.

## 9. Accepted Limitations and Implementation Slice
### 9.1 Unsupported in v1
The following remain unsupported:
1. domain-component authority;
2. removal or retirement authority;
3. active/retired ledger or tombstone;
4. visual-family authority;
5. ScreenSpec visual authority;
6. unkeyed resolution table;
7. legacy adoption or grandfathering;
8. repository-wide pending-input freshness;
9. malformed unrelated-input recovery;
10. `impact_axes` expansion;
11. Git-history approval or digest;
12. human approval digest;
13. AST-to-mapping linkage;
14. completion tracking;
15. indirect Screen Source Map authority;
16. add, rename, copy, or typechange visual authority;
17. ScreenSpec ownership transfer;
18. snapshot-less visual `--diff`; and
19. Issue #223 app-shell.
Coarse or unkeyed work returns `applicable:false` and directs the author to Stage 04 exact reconciliation.
### 9.2 Minimal implementation order
1. Add a read-only source/destination snapshot adapter.
2. Constrain authority-bearing CLI options to the selected worktree and snapshots.
3. Derive snapshot readiness floors and source/destination ScreenSpec owner indexes.
4. Add stable authority-bearing ScreenSpec tuple comparison.
5. Add direct input scope, `status: captured`, and Fidelity opt-in checks.
6. Build the complete selected supersession component from both frontmatter and Register observations.
7. Add Contract v2 and Mapping Provenance v1 selected-dependency analyzers.
8. Preserve logical deny provenance and reuse generated ownership.
9. Extend the shared pure implementation-file helper.
10. Add the fail-closed backstop record router and CLI tuple checks.
11. Propagate minimal Packet/Report audit fields.
12. Add the focused regression matrix below.
No public deny schema, capability artifact, history authority, or repository-wide ledger is introduced.

## 10. Verification Matrix and Review Closure
The implementation uses at most 20 focused regressions.

| # | Case | Expected |
|---|---|---|
| 1 | no intent on API-mode screen | existing screen forbid, option behavior, and output shape remain |
| 2 | readiness missing intent selector; backstop missing tuple member; stray selector; visual `--diff` | exit 2 before authority load |
| 3 | staged screen `M` plus unstaged authority docs or config; range B plus checkout C authority | only selected snapshot pair is used; missing authority denies |
| 4 | absolute/outside/symlink/other-worktree override; external policy/layout/manifest | exit 2 or no authority influence |
| 5 | fact or decision cap below `final-fixture-ui`; deprecated mapping | `applicable:false` |
| 6 | selected ScreenSpec tuple/path changes source to destination; another ScreenSpec changes owner set | `applicable:false`; no ownership self-claim |
| 7 | missing/non-regular entry or duplicate active owner in either snapshot | `applicable:false`; no fallback |
| 8 | selected input status not `captured`; unsupported/broken opted-in Fidelity chain | `applicable:false` |
| 9 | selected screen/domain absent from canonical input scope; raw/ambiguous alias | `applicable:false` |
| 10 | input/Register `Supersedes` mismatch, Register-only contradiction, missing connected target | structural ambiguity |
| 11 | ancestor fork, competing leaf, duplicate connected successor, or cycle | structural ambiguity |
| 12 | v1/summary-only register; non-reconciled or `Result!=accepted`; selected RR/RP error | `applicable:false` |
| 13 | whole/coarse/unkeyed/mixed target; missing/unsupported Mapping Provenance contract | `applicable:false` |
| 14 | exact M-ID plus concrete non-empty current Evidence and stable owner | forward allow; backstop exact `M` allow |
| 15 | section-only/out-of-range/empty/different Evidence; selected `MP-103` or Figma contradiction | `applicable:false` or deny |
| 16 | ordinary built-in work-step deny only vs same path with Tier3/custom/generated deny | built-in may waive; any independent deny wins |
| 17 | selected input/register/mapping `A/M` plus exact screen `M` | pass only when destination snapshot contracts all pass |
| 18 | case 17 plus unrelated denied screen/component/custom-root/script path | extra violation; `--enforce` exit 1 |
| 19 | authorized path `A/R/C/T/D`, or selected authority document `R/C/T/D` | no visual grant; explicit violation where required |
| 20 | forward/backstop same snapshots, stable tuple, evidence, path, and deny context | same pure helper result |
### 10.1 Merge blockers
Review blocks on only:
- no-intent regression; authority read from outside the selected snapshot pair; an external or escaping config override influencing authority; source/destination ScreenSpec
  identity or owner-set drift creating authority; final visual-readiness floor bypass; non-captured selected input or broken opted-in Fidelity creating authority;
  input/Register supersession contradiction; ambiguous or stale selected supersession component; non-authorizing Summary or invalid Mapping Provenance contract gaining
  authority; coarse, empty, stale, or contradictory selected evidence gaining authority; a positive path other than the stable exact selected entry; backstop skipping an
  ordinarily denied extra write; visual authority expanding beyond exact `M`; a non-waivable deny being waived; selected-only validation losing structural identity errors; or
  forward/backstop mismatch.
### 10.2 Non-blocking follow-up
These remain non-blocking:
- unrelated pending inputs; legacy repository completeness; malformed unrelated-input recovery; domain-component ownership; visual source-category expansion; removal/retirement; making Fidelity v2 mandatory for all inputs; and app-shell.
They must not expand this v1 design.

## 11. Issue #223 Deferred
Issue #223 is deferred until the minimal Issue #222 helper is implemented and verified in a separate implementation PR.
This PR does not define:
- app-shell artifacts; shell roots; shell maturity; generic Candidate owners; shell Open Decisions; or shell ownership contracts.
No Issue #223 state, body, comment, or follow-up issue is changed.
