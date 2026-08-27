# Issue #222 minimal v1 — Evidence-bound Visual Refresh
Status: proposed minimal v1; implementation not started Issue: #222 Baseline: `49a3a31029293eae3fd6765f75e2b5520f939a93` (`origin/main`) Scope: one selected visual input authorizing one existing screen-entry modification
This document replaces the earlier expanded design in full. It defines only the first implementable slice for Issue #222. It changes no source, test, fixture, policy YAML, schema, template, manifest, skill, distributed payload, dependency, release, version, or tag.

## 1. Problem and Scope
### 1.1 Current gap
`readiness_mode` is a progress ladder. The selected mode remains:

```text
min(fact_mode, decision_cap)
```
At `final-fixture-ui`, screen work is allowed. At `api-integrated-ui`, the authored `{roles.screen}` work-step deny closes screen editing while hook and API wiring are performed.
That restriction is useful for API work. It leaves no narrow path when exact visual evidence arrives after the screen has already reached the API stage. The existing escape routes are inappropriate:
- advancing to `production-ready` requires unrelated CI and review facts;
- reopening an Open Decision changes progress semantics only to obtain edit access.
Issue #222 v1 adds one explicit work intent, `visual-refresh`, to solve only this gap.
### 1.2 Minimal result
A positive v1 grant is bound to all of the following:
- one destination snapshot selected by the diff source;
- one selected active ScreenSpec in that snapshot;
- one selected canonical input artifact in that snapshot;
- one unambiguous terminal branch in the selected input's explicit `supersedes` component;
- one selected Reconciliation Item group;
- one exact current Mapping Provenance Contract v1 row;
- one concrete, existing, non-empty Evidence bullet;
- `fact_mode` and `decision_cap` at least `final-fixture-ui`; and
- one existing, unique-owned ScreenSpec `screen_entry` file.
The positive implementation authority is exact-file authority. It does not authorize a role glob, a domain component, a file creation, or a replacement operation.
### 1.3 Existing trust boundary
The implementation reuses the repository's current trust boundary:
- canonical input authoring and Input Result Contract;
- Reconciliation Contract v2;
- Mapping Provenance Contract v1;
- current ScreenSpec lifecycle and structural checks;
- current readiness fact and Open Decision cap computation;
- current layout and path policy;
- existing generated/do-not-edit ownership;
- existing Tier3, custom, shared-surface, API Candidate, and ownership restrictions;
- `workflow:validate` and review; and
- existing human-only decision transitions.
The v1 does not defend against a malicious actor who can forge trusted Markdown or rewrite Git history. It is an accidental and tool-driven over-authorization guard inside the current repository trust boundary.
### 1.4 Explicit non-goals
This v1 does not:
- prove repository-wide visual freshness;
- search for the newest input by timestamp;
- authorize domain components;
- authorize removal or retirement;
- authorize file add, rename, copy, or typechange operations;
- create a capability or adoption artifact;
- create a Git-history approval system;
- create a reusable authorization platform for arbitrary intents; or
- authorize app-shell work.

## 2. Safety Invariants
Only the following are v1 merge blockers.
### 2.1 I1 — no-intent compatibility
When `--intent` is absent, existing readiness computation, path authorization, diff-source behavior, exit behavior, and serialized output retain their current byte and shape meaning. An API-mode screen remains forbidden from editing its screen path under the ordinary no-intent contract.
### 2.2 I2 — one destination snapshot
Every trusted input to an explicit visual backstop invocation comes from one destination snapshot derived from the selected diff source. Working-tree or checkout files outside that snapshot cannot influence authority.
### 2.3 I3 — final visual-readiness floor
The snapshot's existing readiness computation must report:

```text
fact_mode >= final-fixture-ui
AND
decision_cap >= final-fixture-ui
```
The selected mapping must also be non-deprecated. Lower ordinary modes keep their existing no-intent behavior, but they cannot create evidence-bound visual intent authority.
### 2.4 I4 — selected supersession component is unambiguous
The selected input must be the only terminal leaf of its connected explicit `supersedes` component. Any ancestor fork, competing terminal branch, duplicate connected identity, malformed connected successor, or cycle is structural ambiguity and fails closed.
### 2.5 I5 — accepted and current evidence
The selected Summary must have `Reconcile Status=reconciled` and `Result=accepted`. The selected reconciliation Effect and current Mapping Provenance row must resolve to the same concrete, visible, non-empty, in-range Evidence bullet. Input-ID or ref-string equality alone is insufficient.
### 2.6 I6 — exact existing screen modification
The only positive implementation operation is:

```text
M <selected unique-owned existing screen_entry>
```
`A`, `R`, `C`, `T`, and `D` never receive visual authority. Deleting the authorized path is an explicit violation in a visual-refresh invocation.
### 2.7 I7 — non-waivable denies win
Tier3, custom, generated/do-not-edit, shared-surface, API Candidate, ownership, and every other independent deny remain authoritative. Only the canonical built-in API-stage `{roles.screen}` work-step deny identified by stable rule provenance may be waived.
### 2.8 I8 — authoring and implementation routes are separate
The visual backstop does not evaluate canonical authority documents through the selected screen's implementation envelope.
- exact selected input/register/mapping writes use snapshot-consistent artifact validation;
- recognized existing authoring/output paths use their existing contract;
- every other changed record uses the selected screen's ordinary path authorization; and
- generated/do-not-edit wins as a final deny in every route.
There is no unclassified-path `continue` in explicit visual context.
### 2.9 I9 — forward/backstop parity
Forward readiness and the diff backstop consume the same pure implementation-file helper for the same selected context and exact implementation path. The backstop adds snapshot, record-routing, and operation-kind checks but cannot broaden the forward grant.
### 2.10 Accepted limitation
The v1 proves direct authority safety for the selected explicit supersession component, exact mapping target, and exact screen entry. It does not prove that no unrelated pending input exists elsewhere. That limitation is accepted and is not a merge blocker.

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
The first and only v1 intent enum value is `visual-refresh`. For an actual readiness file authorization:
- `--screen` is required;
- `--input` is required; and
- one canonical concrete `--path` is required.
Readiness may omit `--path` for applicability inspection. Such an invocation grants no file and reads the ordinary current repository view, because it does not inspect a diff.
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
For `workflow:forbidden-paths`, `--intent`, `--screen`, `--input`, and exact `--path` are required together. Any missing tuple member or visual selector without `--intent` is a usage error and exits `2` before artifact, diff, Git, or snapshot loading.
A valid but different `--path` is not a usage error. Evidence applicability is computed independently and the result is deterministic:

```text
applicable:true
allowed:false
```
### 3.3 Common selector constraints
`visual-refresh` cannot be combined with `--surface`. No `--app-shell`, capability-artifact, item, effect, mapping-key, or public authority-snapshot selector is introduced.
The following remain usage errors and exit `2`:
- unknown or blank intent;
- visual-refresh without `--screen` or `--input`;
- `--input` without an intent;
- `--intent` combined with `--surface`;
- existing screen/surface selector conflicts;
- blank or non-canonical `--path`; and
- existing unknown-option or malformed-value errors.
Evidence or authorization failure is not a syntax error. It returns normal output and exits `0` with `applicable:false` or `allowed:false`, except that backstop `--enforce` still exits `1` when violations exist.
### 3.4 Diff source to destination snapshot
Explicit visual backstop authority uses this fixed mapping:
| Diff source | Changed records | Authority snapshot |
|---|---|---|
| `--staged` | existing index diff | Git index tree |
| `--range A..B` or `A...B` | existing range semantics | resolved `B^{tree}` |
| `--base <ref>` | existing base-to-HEAD semantics | resolved `HEAD^{tree}` |
| default local mode | existing HEAD-based local records | resolved `HEAD^{tree}` |
| `--diff <name-status-file>` | name/status only | unsupported with visual context; exit `2` |
The implementation may read index blobs directly or materialize the logical index tree. It must not substitute the working tree for the index tree.
A visual `--range` must contain a resolvable right-hand destination revision. If the existing range parser cannot expose one deterministic destination tree, the visual invocation exits `2`; no current-checkout fallback is allowed.
### 3.5 Snapshot-consistent reads
The selected snapshot supplies all authority inputs:
- ScreenSpecs, lifecycle, domains, and `screen_entry` ownership;
- selected input bytes and the complete connected supersession component;
- Reconciliation Register bytes;
- selected mapping artifact and Mapping Provenance bytes;
- layout and policy inputs used by readiness/path resolution;
- Open Decision inputs;
- generated/shared ownership facts;
- regular-file existence and type; and
- generated workflow state or equivalent in-memory derived facts.
The preferred implementation derives workflow facts in memory from snapshot files through existing pure collectors. Reading snapshot `_meta/workflow-state.yaml` is acceptable only when the same snapshot proves it is the generated output for those snapshot inputs.
The analyzer must never mix snapshot docs with current working-tree `_meta` files.
### 3.6 Working-tree isolation
For `--staged`, unstaged authority documents do not exist for the invocation. For `--range`, files from the current checkout do not exist for the invocation. For `--base` and default local visual mode, the authority snapshot is `HEAD`.
Consequences:
- staged screen `M` plus unstaged authority docs cannot authorize;
- range `A..B` uses B's authority even when another commit is checked out;
- default local mode can use authority already in `HEAD`;
- uncommitted selected-authority document changes cannot authorize default local code work;
- to validate authority docs and code together before committing, stage the entire set and use `--staged`.
### 3.7 Minimal output
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
`authorized_path` is derived from the selected snapshot ScreenSpec. The caller cannot retarget the intent by supplying another path.
### 3.8 No-intent commands
These existing commands keep their current behavior and output shape:

```bash
npm run workflow:readiness -- --screen CREATE-ATTACH --json
npm run workflow:readiness -- --screen CREATE-ATTACH \
  --path src/features/create/screens/CreateAttachScreen.tsx --json
```
Neither command emits intent-specific fields. Existing no-intent diff sources, including `--diff`, retain their current behavior.

## 4. Readiness and Selected Input Applicability
### 4.1 Readiness floor from the existing single source
The analyzer consumes the existing readiness computation for the selected snapshot with its internal caps exposed. It does not reimplement mode selection.
Positive applicability requires:

```text
index(fact_mode) >= index(final-fixture-ui)
AND
index(decision_cap) >= index(final-fixture-ui)
```
The comparison uses the snapshot's effective mode order. If `final-fixture-ui` is absent or either cap cannot be resolved, visual-refresh is `applicable:false`.
This floor is intent-specific. A lower mode may continue to allow ordinary no-intent screen work under the existing policy.
### 4.2 Mapping lifecycle floor
The selected mapping artifact must have a usable non-deprecated lifecycle status at least `draft`. Authority-positive statuses are:

```text
draft | review | confirmed | implemented | verified
```
`missing`, blank, invalid, or `deprecated` mapping status is `applicable:false`, even when an exact-looking table and Evidence row remain in the file.
### 4.3 Screen and input identity
The selected ScreenSpec must:
1. resolve uniquely in the snapshot;
2. be active;
3. pass current lifecycle and structural trust;
4. expose one canonical domain and one canonical `screen_entry`; and
5. satisfy the final visual-readiness floor.
The selected input must:

```yaml
input_id: IN-20260827-figma-001
affected_domains: [auth]
affected_screens: [AUTH-LOGIN]
supersedes: IN-20260820-figma-003
```

1. resolve by a unique `input_id` in the snapshot;
2. pass the applicable Input Result hard contract;
3. contain the selected ScreenSpec ID directly in canonical `affected_screens`; and
4. contain the selected ScreenSpec domain directly in canonical `affected_domains`.
`raw:*`, a source alias, split or ambiguous mapping, or a different canonical screen/domain is non-authorizing. Indirect Screen Source Map authorization is deferred.
### 4.4 Supersession component construction
The supersession analyzer does not begin from a map that has already discarded duplicate identities. It first collects every snapshot input record with:
- source file identity;
- raw and parsed `input_id`;
- raw and parsed `supersedes`; and
- Input Result identity defects.
Canonical edges use:

```text
child --supersedes--> parent
```
For selected-component safety, a record whose `supersedes` points to a node in the component remains relevant even when the child has a malformed or duplicate identity. Such a record is a connected structural defect, not an unrelated input that may be filtered out.
### 4.5 Unique terminal branch
Starting from the selected node, compute the connected component using parent and reverse successor relations. Positive authority requires all of the following:
1. every component `input_id` resolves to exactly one record;
2. every `supersedes` edge in the component resolves to exactly one parent;
3. no malformed or duplicate successor identity points into the component;
4. the component is acyclic;
5. the component has exactly one terminal leaf;
6. the selected input is that terminal leaf; and
7. every ancestor on the selected chain has exactly one canonical successor, namely the next node on that chain.
Therefore this fork is structural ambiguity:

```text
ROOT
|- A  (supersedes ROOT)
`- B  (supersedes ROOT)
```
Selecting A remains inapplicable even though A has no direct successor. The same applies when B continues to C: A and C are competing terminal leaves.
One direct successor makes the selected input stale and yields a next action to reconcile and use the successor. Forks, duplicate connected successors, or cycles require repairing the explicit input graph.
This rule is not a timestamp-based repository-wide freshness scan. It evaluates only the selected explicit supersession component.
### 4.6 Register and Summary
The applicable Reconciliation Register must:
1. declare Reconciliation Contract v2;
2. have one trusted canonical Summary table and Item table;
3. contain exactly one Summary row for the selected input;
4. report `Reconcile Status=reconciled`; and
5. report authority-positive `Result=accepted`.
Every other Result is non-authorizing, including `rejected`, `no-change`, `pending-user-decision`, `delegated`, `mixed`, `failed`, `pending`, blank, or unknown.
### 4.7 Singular authorizing group
The public v1 CLI adds no item or mapping-key selector. The selected input must therefore resolve to exactly one eligible authorizing Item group and one distinct mapping key.
The selected group must satisfy all of the following:
- selected dependency-closure RR/RP hard trust passes;
- every row has `Basis=visual-evidence`;
- every row has `Classification=simple-update`;
- every Effect is `update` or `create`;
- every Target is the same exact current mapping-row target; and
- no other target or effect kind is mixed into the group.
Zero or multiple eligible groups or keys is `applicable:false`. The next action is to split or refine Stage 04 reconciliation.

## 5. Mapping Provenance and Evidence Authority
### 5.1 Mapping Provenance opt-in is mandatory
The selected mapping artifact must explicitly opt into Mapping Provenance Contract v1:

```text
parseMappingProvenanceContract(mapping.frontmatter).version == 1
```
The following are `applicable:false`:
- missing `provenance_contract` and its `version:0` legacy behavior;
- unsupported contract value;
- duplicate canonical Component Mapping or Mapping Provenance section/table;
- unparsable required canonical table;
- non-canonical required headers;
- duplicate or ambiguous Mapping Key namespace; and
- missing or orphan 1:1 Component Mapping to Mapping Provenance rows.
Authority code must not independently parse an exact-looking legacy table and bypass the contract opt-in.
### 5.2 Exact selected target
The only authorizing target is:

```text
artifact:<screen-figma-mapping-id>#component-mapping/<M-ID>
```
The mapping artifact's canonical `screen_id` must equal the selected screen. The selected M-ID must exist exactly once in the current Component Mapping table and have exactly one current Mapping Provenance row.
Mapping-key comparison is exact:

```text
M-014 != M-0140
```
Whole artifacts, section-only targets, visual-family targets, ScreenSpec targets, component-gap targets, coarse or unkeyed targets, historical rows, and retirement or tombstone targets create no authority.
### 5.3 Concrete Evidence floor
String equality is insufficient. Both Effect and Mapping Provenance Evidence must independently resolve through the same canonical resolver to:
- `status=ok`;
- the same input ID;
- the same section slug;
- the same concrete one-based bullet index;
- an in-range visible bullet; and
- non-empty text after trimming.
Section-only Evidence and out-of-range refs such as `/99` are non-authorizing even when both records contain the same string.
### 5.4 Figma-source authority floor
The selected row must have no `MP-103` contradiction between its effective Source Ref and the mapping artifact's explicit Figma file/frame context.
The selected Effect, Mapping Provenance row, and mapping artifact must resolve to compatible Figma file identity. Each accepted effective source must retain a canonical file plus node/frame anchor under the existing precision contract.
A selected row with contradictory Figma files or frames is `applicable:false`, even if the current validator reports the contradiction as warning-first for general validation.
### 5.5 Currentness and group atomicity
Currentness is exact-row local:

```text
selected_effect.target == current exact mapping target
AND
resolved_effect_evidence == resolved_current_mapping_evidence
```
If the current mapping row points to another input or bullet, the older Effect loses authority naturally.
A group that mixes an authorizing mapping update with another effect or target is wholly inapplicable. The helper never authorizes only a subset.
### 5.6 Selected-only validation scope
The analyzer never parses validator message text to decide whether an issue matters. Internal issue facts carry stable structured identity sufficient to classify them as:
1. `structural`;
2. `selected-dependency`; or
3. `unrelated-local`.
Structural issues block the selected identity space. Selected-dependency issues block when their subject lies in the selected input, supersession component, Summary, Item group, mapping artifact, M-ID, Mapping Provenance row, Evidence, or screen-entry closure.
An unrelated local row error remains non-blocking only when it cannot alter selected identity, component shape, structural table trust, or selected dependency resolution. Free-text message filtering is forbidden. Existing public validator output need not change.

## 6. Exact Path and Deny Authorization
### 6.1 `screen_entry` ownership floor
Evidence applicability produces one possible implementation path:

```text
authorized_path = canonical(selected_screen_spec.screen_entry)
```
Positive authority requires:
- one canonical project-relative path;
- an existing regular file in the selected authority snapshot;
- exactly one active ScreenSpec declaring that canonical path;
- the selected ScreenSpec being that unique owner; and
- no shared-surface or generated ownership conflict.
A missing, non-regular, non-canonical, or multiply owned entry is `applicable:false`. There is no fallback to a role glob, route entry, repository search, or filename inference.
### 6.2 Exact checked path and operation
A forward positive result requires:

```text
checked_path == authorized_path
```
`{roles.screen}` is only a classification check confirming that the exact entry lies in the screen role under the resolved layout. It never expands authority to all matching files. Same-domain screens, domain components, hooks, API clients, and other files receive no visual grant.
The diff backstop adds:

```text
change_kind == M
```
as a positive-operation predicate. The snapshot and changed-record source together must identify the path as a modification, not an add, replacement, copy, typechange, or deletion.
### 6.3 Logical deny provenance
Before display deduplication, each effective allow or deny rule used for authorization retains provenance equivalent to:
- `source_mode`;
- `authored_path`;
- `resolved_path`;
- `disposition`;
- `origin_kind`;
- `origin_scope`; and
- `stable_rule_id`.
Rules are logical records, not path strings. String equality does not prove identity.
### 6.4 The only waivable rule
The helper may waive only the canonical built-in logical rule with:

```text
origin_kind = mode-policy
source_mode = api-integrated-ui
authored_path = {roles.screen}
disposition = deny
stable_rule_id = canonical API-stage screen work-step deny
```
A preset mirror may coalesce only when synthesis deterministically proves it is the same built-in logical rule. String equality alone is not proof.
### 6.5 Independent final denies
These remain independent and non-waivable:
- project or domain Tier3 rules;
- custom path rules;
- generated or do-not-edit ownership;
- delegated shared-surface ownership;
- API Candidate deferred, conflict, or unowned restrictions;
- other ownership restrictions; and
- policy, configuration, or package paths.
Any matching independent deny wins.
### 6.6 Generated ownership input
Generated ownership is resolved from the selected snapshot through the repository's existing generated-file single source. The exact path's generated or do-not-edit fact is passed into the shared helper as an independent final deny input.
The visual intent does not define a second detector. A generated selected screen entry or selected authority document is denied even when all other predicates pass.

## 7. Backstop Routing and Forward Parity
### 7.1 Preserve raw changed records
Explicit visual context retains every parsed change record, including `D`, before calling legacy write-path helpers or guarded-surface filters. Each record preserves:
- status kind;
- old path when present;
- destination path when present; and
- the selected diff source's destination snapshot identity.
This is required to reject `D authorized_path` and to prevent `A`, `R`, `C`, or `T` from masquerading as an existing-file refresh.
### 7.2 Fail-closed routing order
Every record is routed in this order:
1. **Generated/do-not-edit:** an existing generated ownership deny is a violation.
2. **Selected-authority authoring closure:** exact selected input, canonical register, and selected mapping paths use snapshot-consistent artifact validation.
3. **Recognized existing authoring/output contract:** a manifest-known artifact, Packet, Report, or generated output uses its existing determinate allow/deny contract.
4. **All remaining paths:** evaluate through the selected screen's ordinary no-intent file helper, without the legacy guarded-surface early `continue`.
A route that cannot produce a determinate positive result is a violation. Explicit visual context never treats "unclassified" as "ignore".
### 7.3 Selected-authority authoring closure
The selected-authority closure contains only the snapshot-resolved exact paths for:
- the selected input artifact;
- the canonical Reconciliation Register used by the selected Summary and Item group; and
- the selected Figma mapping artifact.
It is not `docs/frontend-workflow/**` and does not authorize unrelated documentation.
`A` or `M` for these exact files is authoring-positive only when:
- the destination snapshot contains the exact destination bytes;
- all existing hard artifact contracts pass in that snapshot;
- the selected authority predicate passes in that snapshot; and
- generated or do-not-edit ownership is absent.
`R`, `C`, `T`, or `D` for a selected authority document is a violation in v1. In default local visual mode, uncommitted authority-document changes are not in the HEAD snapshot and therefore cannot take this route; stage them and use `--staged`.
### 7.4 Recognized output and other authoring paths
Packet and Report remain audit transport, not authority. A changed recognized output or other manifest-known authoring artifact is accepted only when its existing contract returns an explicit positive result for the selected snapshot and operation.
Generated output remains denied by route 1. A path with no existing determinate contract falls through to route 4; it is never broadly allowed because it is under `docs/**` or has a Markdown extension.
### 7.5 All remaining implementation and unknown paths
Every path not handled by routes 1 through 3 is evaluated through the selected screen's ordinary no-intent file authorization, regardless of:
- guarded-surface membership;
- API-surface membership;
- Candidate prefilter membership;
- default Expo path shape;
- custom-layout path shape; or
- file extension.
This includes same-domain screens and components, custom source roots such as `packages/mobile/**`, repository scripts, and otherwise unclassified `.ts`, `.tsx`, or `.mjs` files.
If the ordinary helper returns `allowed:false`, lacks a selected-screen entry, cannot classify the path, or has no matching positive rule, the record is a violation. The existing project-level early filter remains only for invocations without visual context.
### 7.6 Visual operation and deletion rules
For the exact authorized implementation path:

```text
M authorized_path
=> evaluate with visual context
```
For all other records, including the authorized path with another status:

```text
A | R | C | T
=> no visual authority; evaluate ordinary route and deny when not ordinarily authorized
```

```text
D authorized_path
=> explicit visual-scope violation
```
Other deletions are evaluated through their selected route using the raw old path. A denied implementation deletion is a violation. The ordinary no-intent deletion contract outside visual context is unchanged.
### 7.7 Forward and backstop helper parity
Forward readiness and backstop route 4 consume the same pure implementation-file helper. The helper input includes:
- snapshot-derived selected screen and input context;
- evidence applicability and final-readiness floor;
- exact authorized path and checked path;
- logical deny provenance; and
- generated ownership fact.
The backstop supplies operation kind and record routing separately. It cannot turn a forward deny into a visual allow.
### 7.8 Packet and Report
Packet and Report may transport only:
- selected input ID;
- selected mapping key;
- exact Evidence ref;
- authority snapshot identity;
- authorized path; and
- checked path.
These fields are audit data, not an authority artifact. The backstop always resolves its own snapshot and re-evaluates current snapshot contracts. A stale Packet cannot authorize a new snapshot or path.

## 8. Accepted Limitations and Deferred Work
The following remain unsupported in v1:
1. domain-component authority;
2. removal or retirement authority;
3. active or retired ledger and tombstones;
4. visual-family authority;
5. ScreenSpec visual authority;
6. unkeyed resolution tables;
7. legacy adoption or grandfathering;
8. repository-wide pending-input freshness;
9. malformed unrelated input recovery;
10. indirect Screen Source Map authority;
11. `impact_axes` expansion;
12. Git-history approval or human approval digest;
13. AST-to-mapping linkage;
14. completion tracking;
15. `A`, `R`, `C`, or `T` visual authority;
16. name-status `--diff` visual authority without a destination snapshot; and
17. Issue #223 app-shell.
Coarse or unkeyed work returns `applicable:false` and directs the author to Stage 04 exact reconciliation. A visual update that needs a domain component remains denied until a separate exact ownership contract exists.
No legacy or malformed state is automatically approved or repaired.

## 9. Implementation Slice
### 9.1 Snapshot adapter
Add one read-only destination-snapshot abstraction shared by the visual backstop analyzers. It must support:
- index blobs for `--staged`;
- a resolved right-hand tree for `--range`;
- `HEAD` for `--base` and default local visual mode; and
- snapshot-relative regular-file and ownership queries.
Do not add a public snapshot artifact. Reject visual `--diff` instead of inventing a new snapshot selector in v1.
### 9.2 Selected authority analyzers
Add pure analyzers for:
- snapshot ScreenSpec and final readiness floors;
- canonical input scope;
- the complete selected supersession component, including connected identity defects;
- Contract v2 Summary and Item selection;
- Mapping Provenance v1 opt-in and exact selected-row trust;
- concrete non-empty Evidence and Figma-source authority floors; and
- unique active `screen_entry` ownership.
Selected-only filtering uses structured scope and subject identity, never diagnostic text.
### 9.3 Rule provenance and shared helper
Preserve independent logical deny origins through policy/layout synthesis and display deduplication. Extend the existing pure file helper with an optional visual context.
No-intent calls take the existing branch unchanged. Intent calls:
1. require snapshot-consistent applicability;
2. require final readiness floors;
3. require `checked_path == authorized_path`;
4. require screen-role classification;
5. waive only the canonical logical work-step deny;
6. apply every remaining independent deny; and
7. return one deterministic file result.
### 9.4 Backstop router and CLI
Add only the selectors and routing necessary for this contract:
- readiness: `--intent`, `--input`;
- forbidden-paths: `--screen`, `--intent`, `--input`, `--path`;
- explicit visual diff-source to snapshot resolution;
- raw record preservation, including `D`;
- selected-authority, recognized-contract, and fail-closed fallback routes; and
- `M`-only visual operation handling.
Existing no-intent diff-source and early-filter behavior remain unchanged.
### 9.5 Packet/report propagation
Propagate the minimal selected identifiers, snapshot identity, and exact path. Do not add:
- adoption authority;
- authority digests;
- pending-uncertainty indexes;
- effect-ref hash identity;
- completion ledgers; or
- repository-wide historical scans.

## 10. Verification Matrix and Review Closure
The implementation uses at most 20 focused regressions.
| # | Case | Expected |
|---|---|---|
| 1 | no intent on API-mode screen or no-intent `--diff` | existing path, diff, exit, and output compatibility remain |
| 2 | readiness missing required selector; backstop incomplete visual tuple; stray visual selector; visual `--diff` | exit `2` before artifact, diff, Git, or snapshot load |
| 3 | staged authorized screen `M` with authority docs only unstaged | deny; unstaged files cannot influence index snapshot |
| 4 | `--range A..B` while checkout C contains different authority docs | evaluate only B tree; checkout C is irrelevant |
| 5 | `fact_mode` or `decision_cap` below `final-fixture-ui`, missing target mode, or mapping `deprecated` | `applicable:false` |
| 6 | invalid/duplicate/out-of-scope selected input | `applicable:false` |
| 7 | direct successor replaces selected input | selected input stale; `applicable:false` with successor next action |
| 8 | ancestor fork, competing terminal leaves, duplicate connected successor identity, or cycle | structural ambiguity; `applicable:false` |
| 9 | non-v2 register, non-reconciled Summary, `Result!=accepted`, selected RR/RP error, or mixed group | `applicable:false` |
| 10 | missing/unsupported mapping provenance contract, duplicate canonical table/key, or orphan provenance | `applicable:false` |
| 11 | coarse target, `M-014` versus `M-0140`, section-only/out-of-range/empty/different Evidence | exact-key rules; invalid selected dependency is inapplicable |
| 12 | selected `MP-103` or Effect/row/artifact Figma identity contradiction | `applicable:false` |
| 13 | missing/non-canonical/non-regular entry, duplicate active owner, or mismatched checked path | no fallback; inapplicable or allowed false as specified |
| 14 | accepted exact authority in snapshot plus built-in API-stage screen deny only | forward allow; backstop allows only `M authorized_path` |
| 15 | same path also has Tier3/custom/shared/API Candidate/generated deny | deny; independent rule wins |
| 16 | snapshot-valid selected input/register/mapping `A/M` plus exact authorized screen `M` | selected authoring route and visual implementation route pass together |
| 17 | case 16 plus denied extra screen/component/custom-root/script path | every record evaluated; extra violation; `--enforce` exits `1` |
| 18 | unrelated invalid input/RR/mapping row outside selected component and dependency closure | non-blocking when structural selected trust is unaffected |
| 19 | authorized path has `A/R/C/T/D`, or selected authority doc has `R/C/T/D` | no visual grant; authorized `D` and unsupported authoring operations are violations |
| 20 | forward and backstop use the same snapshot/context/path; range and staged fixtures cover snapshot isolation | same pure helper result; no authority broadening |
### 10.1 Merge blockers
Review blocks on only:
- no-intent regression;
- authority read outside the selected destination snapshot;
- final visual-readiness floor regression;
- a stale or ambiguous selected supersession component gaining authority;
- non-authorizing Summary, legacy mapping, coarse Evidence, or contradictory source gaining authority;
- non-unique or missing screen-entry ownership;
- a positive operation other than exact `M authorized_path`;
- selected-authority documents being treated as ordinary API-mode implementation paths;
- an unclassified changed path bypassing ordinary authorization;
- a non-waivable deny being waived;
- selected-only validation losing structural identity errors; or
- forward/backstop mismatch.
### 10.2 Non-blocking follow-up
These remain non-blocking:
- unrelated pending inputs;
- legacy repository completeness outside the selected dependency;
- malformed unrelated external-input recovery;
- domain-component ownership;
- visual source-category expansion;
- removal or retirement; and
- app-shell.
They must not expand this v1 design.

## 11. Issue #223 Deferred
Issue #223 is deferred until the minimal Issue #222 helper is implemented and verified in a separate implementation PR.
This PR does not define:
- app-shell artifacts;
- shell roots;
- shell maturity;
- generic Candidate owners;
- shell Open Decisions; or
- shell ownership contracts.
No Issue #223 state, body, comment, or follow-up issue is changed.
