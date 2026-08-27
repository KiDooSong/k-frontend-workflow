# Issue #222 minimal v1 — Evidence-bound Visual Refresh
Status: proposed minimal v1; implementation not started
Issue: #222
Baseline: `49a3a31029293eae3fd6765f75e2b5520f939a93` (`origin/main`)
Scope: one selected visual input authorizing one existing screen-entry modification
This document replaces the earlier expanded design in full. It defines only the first
implementable slice for Issue #222. It changes no source, test, fixture, policy YAML,
schema, template, manifest, skill, distributed payload, dependency, release, version,
or tag.

## 1. Problem and Scope
### 1.1 Current gap
`readiness_mode` is a progress ladder. The selected mode remains:
```text
min(fact_mode, decision_cap)
```
At `final-fixture-ui`, screen work is allowed. At `api-integrated-ui`, the authored
`{roles.screen}` work-step deny closes screen editing while hook and API wiring are
performed.
That restriction is useful for API work. It leaves no narrow path when exact visual
evidence arrives after the screen has already reached the API stage. The existing escape
routes are inappropriate:
- advancing to `production-ready` requires unrelated CI and review facts;
- reopening an Open Decision changes progress semantics only to obtain edit access.
Issue #222 v1 adds one explicit work intent, `visual-refresh`, to solve only this gap.
### 1.2 Minimal result
A positive v1 grant is bound to all of the following:
- one selected active ScreenSpec;
- one selected canonical input artifact;
- one selected Reconciliation Item group;
- one exact current Figma component-mapping row;
- one concrete, existing, non-empty Evidence bullet;
- the selected input's terminal position in its explicit `supersedes` component; and
- one existing, unique-owned ScreenSpec `screen_entry` file.
The positive implementation authority is exact-file authority. It does not authorize a
role glob or a domain component.
### 1.3 Existing trust boundary
The implementation reuses the repository's current trust boundary:
- canonical input authoring and Input Result Contract;
- Reconciliation Contract v2;
- Mapping Provenance Contract v1;
- current ScreenSpec lifecycle and structural checks;
- current layout and path policy;
- existing generated/do-not-edit ownership;
- existing Tier3, custom, shared-surface, API Candidate, and ownership restrictions;
- `workflow:validate` and review; and
- existing human-only decision transitions.
The v1 does not defend against a malicious actor who can forge trusted Markdown or
rewrite Git history. It is an accidental and tool-driven over-authorization guard inside
the current repository trust boundary.
### 1.4 Explicit non-goals
This v1 does not:
- prove repository-wide visual freshness;
- search for the newest input by timestamp;
- authorize domain components;
- authorize removal or retirement;
- create a capability or adoption artifact;
- create a Git-history approval system;
- create a reusable authorization platform for arbitrary intents; or
- authorize app-shell work.

## 2. Safety Invariants
Only the following are v1 merge blockers.
### 2.1 I1 — no-intent compatibility
When `--intent` is absent, existing readiness computation, path authorization, exit
behavior, and serialized output retain their current byte and shape meaning.
An API-mode screen remains forbidden from editing its screen path under the ordinary
no-intent contract.
### 2.2 I2 — selected dependency trust
A missing, duplicate, hard-invalid, non-v2, non-reconciled, non-authorizing, ambiguous,
or otherwise untrusted selected dependency cannot gain authority.
Failure is `applicable:false`, never a partial allow.
### 2.3 I3 — accepted and current evidence
The selected Summary must have `Reconcile Status=reconciled` and `Result=accepted`.
The selected reconciliation Effect and current Mapping Provenance row must resolve to the
same concrete, visible, non-empty, in-range Evidence bullet. Input-ID or ref-string equality
alone is insufficient.
### 2.4 I4 — selected input is a supersession leaf
The selected input must have no canonical successor that explicitly declares
`supersedes: <selected-input-id>`.
A selected input already replaced by another canonical input cannot authorize code even
when the register and mapping still point to the older Evidence.
### 2.5 I5 — exact existing screen path
The only positive implementation path is the selected active ScreenSpec's canonical
`screen_entry` when it:
- exists as a regular file;
- is declared by exactly one active ScreenSpec; and
- is owned by the selected ScreenSpec.
Role membership alone is insufficient.
### 2.6 I6 — modification-only authority
In the diff backstop, visual authority applies only to:
```text
M <authorized_path>
```
`A`, `R`, `C`, `T`, and `D` never receive visual authority. In particular, deleting the
authorized path is an explicit violation in a visual-refresh invocation.
### 2.7 I7 — non-waivable denies win
Tier3, custom, generated/do-not-edit, shared-surface, API Candidate, ownership, and every
other independent deny remain authoritative.
Only the canonical built-in API-stage `{roles.screen}` work-step deny identified by stable
rule provenance may be waived.
### 2.8 I8 — authoring and implementation writes are separate
The visual backstop does not evaluate canonical authority documents through the selected
screen's implementation envelope.
- exact selected input/register/mapping writes use existing artifact and authority
  validation;
- implementation writes use visual or ordinary screen-scoped path authorization; and
- generated/do-not-edit wins as a final deny in either route.
### 2.9 I9 — forward/backstop parity
Forward readiness and the diff backstop consume the same pure file-authorization helper
for the same selected context and exact implementation path.
The backstop may add operation-kind and write-routing checks, but it cannot broaden the
forward grant.
### 2.10 Accepted limitation
The v1 proves direct authority safety for the selected input, exact mapping target, and
exact screen entry. It does not prove that no unrelated pending input exists elsewhere.
That limitation is accepted and is not a merge blocker.

## 3. Minimal Public Contract
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
- `--screen` is required;
- `--input` is required; and
- one canonical concrete `--path` is required.
Readiness may omit `--path` for applicability inspection. Such an invocation grants no
file.
### 3.2 Readiness selector errors
The following are usage errors and exit `2` before workflow artifact loading:
- unknown or blank intent;
- visual-refresh without `--screen`;
- visual-refresh without `--input`;
- `--input` without an intent;
- `--intent` combined with `--surface`;
- existing screen/surface selector conflicts;
- blank or non-canonical `--path`; and
- existing unknown-option or malformed-value errors.
Evidence or authorization failure is not a syntax error. It returns normal output, exits
`0`, and reports `applicable:false` or `allowed:false`.
### 3.3 Backstop selector tuple
Direct visual-refresh backstop use requires the complete tuple:
```bash
npm run workflow:forbidden-paths -- \
  --screen CREATE-ATTACH \
  --intent visual-refresh \
  --input IN-20260820-figma-003 \
  --path src/features/create/screens/CreateAttachScreen.tsx \
  --staged \
  --enforce
```
For `workflow:forbidden-paths`:
- `--intent`, `--screen`, `--input`, and exact `--path` are all required together;
- omission of any member is a usage error and exit `2` before artifact, diff, or Git load;
- any of `--screen`, `--input`, or visual `--path` without `--intent` is also exit `2`;
- a valid but different `--path` is not a usage error.
For a valid mismatched path, evidence applicability remains independently computed and the
result is deterministic:
```text
applicable:true
allowed:false
```
### 3.4 Minimal output
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
`authorized_path` is derived from the selected ScreenSpec. The caller cannot retarget the
intent by supplying another path.
### 3.5 No-intent commands
These existing commands keep their current behavior and output shape:

```bash
npm run workflow:readiness -- --screen CREATE-ATTACH --json
npm run workflow:readiness -- --screen CREATE-ATTACH \
  --path src/features/create/screens/CreateAttachScreen.tsx --json
```

Neither command emits intent-specific fields.

## 4. Selected Input and Reconciliation Applicability
### 4.1 Screen and input identity
The selected ScreenSpec must:
1. resolve uniquely;
2. be active;
3. pass current lifecycle and structural trust; and
4. expose one canonical domain and one canonical `screen_entry`.
The selected input must:
1. resolve by a unique `input_id`;
2. pass the applicable Input Result hard contract;
3. contain the selected ScreenSpec ID directly in canonical `affected_screens`; and
4. contain the selected ScreenSpec domain directly in canonical `affected_domains`.
`raw:*`, a source alias, split/ambiguous mapping, or a different canonical screen/domain is
non-authorizing. Indirect Screen Source Map authorization is deferred.
### 4.2 Reverse supersession rule
Build a reverse index over canonical, uniquely identified inputs:
```text
successors(X) = { Y | Y.supersedes == X.input_id }
```
For the selected input:
- zero direct successors is required for positive authority;
- exactly one successor means the selected input is stale and `applicable:false`;
- more than one successor is structural ambiguity and `applicable:false`; and
- a supersession cycle containing or reachable from the selected input is structural
  ambiguity and `applicable:false`.
The next action for one successor is to reconcile and use the superseding input. Multiple
successors or a cycle require repairing the canonical input graph before authorization.
This is not a repository-wide newest-input search. It consumes only explicit canonical
`supersedes` edges connected to the selected dependency.
### 4.3 Register and Summary
The applicable Reconciliation Register must:
1. declare Reconciliation Contract v2;
2. have one trusted canonical Summary table and Item table;
3. contain exactly one Summary row for the selected input;
4. report `Reconcile Status=reconciled`; and
5. report authority-positive `Result=accepted`.
Every other Result is non-authorizing, including:
- `rejected`;
- `no-change`;
- `pending-user-decision`;
- `delegated`;
- `mixed`;
- `failed`;
- `pending`; and
- blank or unknown values.
### 4.4 Singular authorizing group
The public v1 CLI adds no item or mapping-key selector. The selected input must therefore
resolve to exactly one eligible authorizing Item group and one distinct mapping key.
The selected group must satisfy all of the following:
- selected dependency-closure RR/RP hard trust passes;
- every row has `Basis=visual-evidence`;
- every row has `Classification=simple-update`;
- every Effect is `update` or `create`;
- every Target is the same exact current mapping-row target; and
- no other target or effect kind is mixed into the group.
Zero or multiple eligible groups/keys is `applicable:false`. The next action is to split or
refine Stage 04 reconciliation.
### 4.5 Exact target grammar
The only authorizing target is:
```text
artifact:<screen-figma-mapping-id>#component-mapping/<M-ID>
```
The mapping artifact's canonical `screen_id` must equal the selected screen. Mapping-key
comparison is exact:
```text
M-014 != M-0140
```
Whole artifacts, section-only targets, visual-family targets, ScreenSpec targets,
component-gap targets, coarse/unkeyed targets, historical rows, and retirement/tombstone
targets create no authority.

## 5. Mapping Provenance and Evidence Authority
### 5.1 Mapping Provenance opt-in is mandatory
The selected mapping artifact must explicitly opt into Mapping Provenance Contract v1:
```text
parseMappingProvenanceContract(mapping.frontmatter).version == 1
```
The following are `applicable:false`:
- missing `provenance_contract` (`version:0` legacy behavior);
- unsupported contract value;
- duplicate canonical Component Mapping or Mapping Provenance section/table;
- unparsable required canonical table;
- non-canonical required headers;
- duplicate or ambiguous Mapping Key namespace; and
- missing/orphan 1:1 Component Mapping ↔ Mapping Provenance rows.
Authority code must not independently parse an exact-looking legacy table and bypass the
contract opt-in.
### 5.2 Selected mapping row
The selected M-ID must:
- exist exactly once in the current Component Mapping table;
- have exactly one current Mapping Provenance row;
- belong to the selected mapping artifact; and
- pass selected dependency-closure provenance trust.
Structural mapping ambiguity blocks the whole selected artifact. An unrelated local row
error may remain non-blocking only when it does not affect structural identity or the
selected dependency closure.
### 5.3 Concrete Evidence floor
String equality is insufficient. Both Effect and Mapping Provenance Evidence must
independently resolve through the same canonical resolver to:
- `status=ok`;
- the same input ID;
- the same section slug;
- the same concrete one-based bullet index;
- an in-range visible bullet; and
- non-empty text after trimming.
Section-only Evidence and out-of-range refs such as `/99` are non-authorizing even when both
records contain the same string.
### 5.4 Figma-source authority floor
The selected row must have no `MP-103` contradiction between its effective Source Ref and
the mapping artifact's explicit Figma file/frame context.
The selected Effect, Mapping Provenance row, and mapping artifact must resolve to compatible
Figma file identity. Each accepted effective source must retain a canonical file plus
node/frame anchor under the existing precision contract.
A selected row with contradictory Figma files or frames is `applicable:false`, even if the
current validator reports the contradiction as warning-first for general validation.
### 5.5 Currentness and group atomicity
Currentness is exact-row local:
```text
selected_effect.target == current exact mapping target
AND resolved_effect_evidence == resolved_current_mapping_evidence
```
If the current mapping row points to another input or bullet, the older Effect loses
authority naturally.
A group that mixes an authorizing mapping update with another effect or target is wholly
inapplicable. The helper never authorizes only a subset.

## 6. Exact Path and Deny Authorization
### 6.1 `screen_entry` ownership floor
Evidence applicability produces one possible implementation path:
```text
authorized_path = canonical(selected_screen_spec.screen_entry)
```
Positive authority requires:
- one canonical project-relative path;
- an existing regular file in the evaluated post-change tree;
- exactly one active ScreenSpec declaring that canonical path;
- the selected ScreenSpec being that unique owner; and
- no shared-surface or generated ownership conflict.
A missing, non-regular, non-canonical, or multiply owned entry is `applicable:false`.
There is no fallback to a role glob, route entry, repository search, or filename inference.
### 6.2 Exact checked path
A forward positive result requires:
```text
checked_path == authorized_path
```
`{roles.screen}` is only a classification check confirming that the exact entry lies in the
screen role under the resolved layout. It never expands authority to all matching files.
Same-domain screens, domain components, hooks, API clients, and other files receive no
visual grant.
### 6.3 Logical deny provenance
Before display deduplication, each effective allow/deny rule used for authorization retains
provenance equivalent to:
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
A preset mirror may coalesce only when synthesis deterministically proves that it is the
same built-in logical rule.
Project/domain Tier3 rules, custom rules, shared ownership, API Candidate restrictions, and
other ownership rules remain independent and non-waivable.
### 6.5 Generated ownership final deny
Generated ownership is resolved by the repository's existing generated-file single source.
The exact path's generated/do-not-edit fact is passed into the shared helper as an
independent final deny input.
The visual intent defines no second generated detector. A generated selected input,
register, mapping artifact, screen entry, or audit output remains denied where the existing
ownership contract forbids editing.

## 7. Diff Backstop Write Routing
### 7.1 Preserve changed records, not only write paths
In explicit visual context, the backstop retains canonical change records including status,
old path when present, and new path when present.
It must not discard `D` records through the existing `writePathsOf(D) => []` behavior before
visual routing. No-intent invocations retain their current deletion semantics.
### 7.2 Route classification
Each changed record is classified before the selected screen helper is called.
The routing order is:
1. generated/do-not-edit final-deny fact;
2. exact selected-authority authoring closure;
3. implementation/code path;
4. other authoring or repository-control path under existing no-intent behavior.
The exact selected-authority authoring closure is a finite set:
- the selected input artifact file;
- the selected Reconciliation Register file; and
- the selected Figma component-mapping artifact file.
No `docs/frontend-workflow/**` glob is automatically allowed.
### 7.3 Selected-authority authoring route
Canonical authority documents are not evaluated against the API-mode screen envelope.
They are evaluated against their existing artifact contracts plus the authority-specific
predicates in this document.
For the exact selected input/register/mapping paths:
- `A` or `M` may participate when the evaluated post-change tree passes all selected hard
  contracts;
- invalid input/register/mapping state creates a violation and makes the intent
  inapplicable;
- missing or unsupported Mapping Provenance opt-in creates a violation;
- generated/do-not-edit still wins;
- `R`, `C`, `T`, or `D` of a selected authority document is unsupported in v1 and creates a
  violation.
This allows a normal change set containing the selected input, register, mapping, and exact
screen modification without pretending those documents are screen implementation paths.
### 7.4 Packet and Report outputs
Packet/Report fields are audit transport, not authority. When an existing workflow writes
an exact Packet or Report output path, that path uses its existing output, generated-file,
and authoring contract.
It is never allowed merely because `visual-refresh` is active, and it is never evaluated as
the selected screen entry. If no existing contract identifies the output, existing
no-intent repository behavior applies.
### 7.5 Implementation route
Every implementation/code change record is evaluated before the existing guarded-surface
or Candidate early filter can skip it.
For each implementation record:
```text
status == M AND changed_path == authorized_path
=> evaluate with visual context
```
All other implementation records use the same selected screen's ordinary no-intent branch.
If that branch returns `allowed:false`, the backstop records a violation regardless of
whether the path belongs to the existing guarded-surface prefilter.
Only invocations without visual context retain the current project-level early-filter flow.
### 7.6 Operation-kind boundary
Visual authority is available only for `M authorized_path`.
The following never receive visual authority:

```text
A authorized_path
R old -> authorized_path
C old -> authorized_path
T authorized_path
D authorized_path
```

`A/R/C/T` use ordinary authorization and violate when it denies them.
`D authorized_path` is always an explicit visual-scope violation. The record is checked even
though existing no-intent `writePathsOf` omits deletions.
A deletion of another implementation path uses ordinary selected-screen authorization on
the deleted path. If ordinary authorization denies it, the explicit visual backstop records
a violation.
### 7.7 Normal combined change set
A valid combined change may contain:

```text
A|M selected input artifact
M   selected Reconciliation Register
M   selected provenance_contract:1 mapping artifact
M   exact authorized screen_entry
```

It passes when:
- selected authority documents pass all existing and authority-specific contracts;
- the screen modification receives the exact visual grant; and
- every remaining implementation write passes ordinary authorization.
Adding an unrelated denied screen/component implementation path creates an extra violation
and `--enforce` exits `1`.

## 8. Validation Scope and Shared Helper
### 8.1 Structured validation scope
The selected analyzer must not parse validator message text. Internal issue facts carry
stable identity sufficient to classify each issue as:
1. `structural`;
2. `selected-dependency`; or
3. `unrelated-local`.
A large new public taxonomy is not required.
### 8.2 Structural issues
A structural issue makes the selected identity space untrustworthy and always blocks.
Examples include:
- duplicate selected input ID;
- duplicate artifact ID affecting selected resolution;
- duplicate canonical register section/table;
- unsupported or missing selected mapping contract opt-in;
- duplicate/ambiguous selected Mapping Key namespace;
- multiple canonical successors of the selected input; and
- a supersession cycle connected to the selected input.
### 8.3 Selected dependency issues
A selected-dependency issue blocks when its subject belongs to the selected closure:
- selected ScreenSpec;
- selected input and explicit supersession component;
- selected Summary row and Item group;
- selected mapping artifact and M-ID;
- selected Mapping Provenance row;
- exact Evidence bullet;
- selected authority-document paths; and
- exact authorized implementation path.
### 8.4 Unrelated local issues
An unrelated local issue belongs to another independent input, Item, or mapping row and does
not alter selected identity or resolution. It does not block this invocation.
This exception never converts a selected artifact structural error into a non-blocking row
error.
### 8.5 Minimal internal issue shape
Existing validators may expose internal facts equivalent to:

```yaml
code: MP-017
scope: selected-dependency
subject_type: mapping-key
subject_id: M-014
```

The exact property names are implementation details. Existing public validator output need
not change.
### 8.6 One pure implementation helper
Forward readiness and the backstop consume the same pure implementation-file helper. Its
input includes at least:
- selected screen and input IDs;
- evidence applicability;
- exact authorized path;
- checked path;
- ordinary readiness context;
- logical deny provenance; and
- generated ownership fact.
The backstop additionally supplies change kind and route classification. Canonical authority
document validation remains a separate selected-authoring route and cannot be mistaken for
screen path authorization.

## 9. Accepted Limitations and Implementation Slice
### 9.1 Unsupported in v1
The following remain unsupported:
1. domain-component authority;
2. removal/retirement authority;
3. active/retired ledger or tombstone;
4. visual-family authority;
5. ScreenSpec visual authority;
6. unkeyed resolution table;
7. legacy adoption/grandfathering;
8. repository-wide pending-input freshness;
9. malformed-input recovery;
10. `impact_axes` expansion;
11. Git history/base-ref approval;
12. human approval digest;
13. AST-to-mapping linkage;
14. completion tracking;
15. indirect Screen Source Map authority;
16. add/rename/copy/typechange authority; and
17. Issue #223 app-shell.
Coarse or unkeyed work returns `applicable:false` and directs the author to Stage 04 exact
reconciliation.
### 9.2 Minimal implementation order
1. Add the selected ScreenSpec/input/register/mapping analyzer.
2. Add direct canonical input-scope checks.
3. Add reverse supersession leaf and ambiguity checks.
4. Require Mapping Provenance Contract v1 opt-in.
5. Add Result and concrete Evidence authority floors.
6. Add selected-row Figma-source checks.
7. Build the unique active `screen_entry` owner index.
8. Preserve logical deny provenance internally.
9. Reuse generated ownership as a final deny fact.
10. Add explicit backstop record routing for authoring versus implementation paths.
11. Extend the shared pure implementation-file helper.
12. Add readiness/backstop selectors and operation-kind handling.
13. Propagate minimal Packet/Report audit fields.
14. Add the focused regression matrix below.
No public deny schema, capability artifact, history authority, or repository-wide ledger is
introduced.

## 10. Verification Matrix and Review Closure
The implementation uses at most 20 focused regressions.

| # | Case | Expected |
|---|---|---|
| 1 | no intent on API-mode screen | existing screen forbid and output shape remain |
| 2 | readiness missing required selector; backstop missing any tuple member; stray visual selector | exit 2 before artifact/diff/Git load |
| 3 | hard-invalid/duplicate input; selected screen/domain absent from canonical input scope; raw/ambiguous alias | `applicable:false` |
| 4 | one canonical successor supersedes selected input; multiple successors; selected-component cycle | stale input inapplicable; ambiguity/cycle fail closed |
| 5 | v1/summary-only register; non-reconciled Summary; `Result!=accepted`; selected RR/RP error | `applicable:false` |
| 6 | Basis/classification/effect outside `visual-evidence` / `simple-update` / `update|create`; mixed group | `applicable:false` |
| 7 | exact-looking mapping tables with missing or unsupported `provenance_contract`; duplicate canonical mapping table | `applicable:false` |
| 8 | exact M-ID + accepted terminal input + concrete current Evidence + unique-owned entry | forward allow; backstop `M` allow |
| 9 | section-only/out-of-range/empty/different Evidence or current row points elsewhere | `applicable:false`/deny |
| 10 | selected MP-103/source contradiction or incompatible Figma file identity | `applicable:false` |
| 11 | missing/non-canonical/non-regular entry or duplicate active owner | `applicable:false`; no fallback |
| 12 | checked path is same-domain other screen/component/hook/API-client | no visual grant; ordinary deny applies |
| 13 | only canonical built-in API-stage screen work-step deny, including proven preset mirror | exact entry may be granted |
| 14 | same path also has Tier3/custom/generated/do-not-edit/shared/API Candidate deny | deny |
| 15 | unrelated invalid input/RR item/mapping row versus selected structural ambiguity | unrelated row non-blocking; selected structural issue blocks |
| 16 | selected input/register/provenance-contract:1 mapping `A/M` plus exact screen-entry `M` | authoring contracts pass; combined change passes |
| 17 | case #16 plus unrelated ordinarily denied screen/component implementation write | extra violation; `--enforce` exit 1 |
| 18 | authorized path change is `M` versus `A/R/C/T` | only `M` receives visual authority; others ordinary deny |
| 19 | `D authorized_path`; deletion of another ordinarily denied implementation path | explicit violation; ordinary deletion violation respectively |
| 20 | forward and backstop evaluate the same exact path/context | same implementation helper result |

### 10.1 Merge blockers
Review blocks on only:
- no-intent regression;
- non-authorizing or explicitly superseded selected input gaining authority;
- missing Mapping Provenance v1 opt-in or structural mapping ambiguity gaining authority;
- coarse, empty, stale, or contradictory selected evidence gaining authority;
- non-unique or missing screen-entry ownership;
- a positive implementation path other than exact `M authorized_path`;
- authorized-path deletion escaping the explicit visual backstop;
- canonical authority documents being rejected by the screen envelope or blindly allowed
  without their existing hard contracts;
- an extra ordinarily denied implementation write escaping the all-implementation evaluation;
- a non-waivable deny being waived;
- selected-only validation losing structural identity errors; or
- forward/backstop mismatch.
### 10.2 Non-blocking follow-up
These remain non-blocking:
- unrelated pending inputs;
- legacy repository completeness;
- malformed external-input recovery;
- domain-component ownership;
- visual source-category expansion;
- removal/retirement; and
- app-shell.
They must not expand this v1 design.

## 11. Issue #223 Deferred
Issue #223 is deferred until the minimal Issue #222 helper is implemented and verified in a
separate implementation PR.
This PR does not define:
- app-shell artifacts;
- shell roots;
- shell maturity;
- generic Candidate owners;
- shell Open Decisions; or
- shell ownership contracts.
No Issue #223 state, body, comment, or follow-up issue is changed.
