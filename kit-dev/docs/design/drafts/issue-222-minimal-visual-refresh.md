# Issue #222 minimal v1 — Evidence-bound Visual Refresh
Status: proposed minimal v1; implementation not started Issue: #222 Baseline:
`49a3a31029293eae3fd6765f75e2b5520f939a93` (`origin/main`) Scope: one selected visual input authorizing
one existing screen entry modification This document replaces the earlier expanded design in full. It
defines only the first implementable slice for Issue #222. It changes no source, test, fixture, policy
YAML, schema, template, manifest, skill, distributed payload, dependency, release, version, or tag.

## 1. Problem

### 1.1 Current gap
`readiness_mode` is a progress ladder. The selected mode remains:
```text
min(fact_mode, decision_cap)
```
At `final-fixture-ui`, screen work is allowed. At `api-integrated-ui`, the authored `{roles.screen}`
work-step deny closes screen editing while hook and API wiring are performed. That restriction is useful
for API work. It leaves no narrow path when exact visual evidence arrives after the screen has already
reached the API stage. The existing escape routes are inappropriate:
- advancing to `production-ready` requires unrelated CI/review facts;
- reopening an Open Decision changes progress semantics to obtain edit access.
Issue #222 v1 adds one explicit work intent:
```text
visual-refresh
```
It is not a readiness mode. It is an evidence-bound, exact-file authorization check.

### 1.2 Minimal result
One invocation binds:
- one active ScreenSpec;
- one canonical input;
- one Reconciliation Item group;
- one exact current Figma mapping row;
- one exact current Evidence bullet;
- one existing canonical `screen_entry`; and
- one concrete checked path.
Positive authority is exact-file authority. Role membership is only classification around that exact
file.

### 1.3 Why components are excluded
The current layout resolves both:
```text
{roles.screen}
{roles.domain_component}
```
at domain-wide granularity. That is too broad for evidence from one selected screen. Therefore v1
supports only the selected ScreenSpec's exact `screen_entry`. `{roles.domain_component}` is not a
positive v1 candidate. Component authorization is deferred until a finite machine-readable ownership
relation exists.

## 2. Scope and Threat Model

### 2.1 Normative scope
This PR defines Issue #222 only. It defines:
- one intent enum value;
- selected-evidence applicability;
- exact screen-entry authority;
- one narrowly waivable work-step deny;
- forward/backstop parity; and
- focused implementation regressions.
It does not define a reusable authorization platform.

### 2.2 Existing trust boundary
The implementation reuses:
- canonical input authoring;
- Input Result Contract;
- Reconciliation Contract v2;
- Mapping Provenance Contract v1;
- existing `workflow:validate` and review;
- ScreenSpec lifecycle checks;
- current path/layout policy;
- generated-file ownership;
- shared-surface ownership;
- API Candidate restrictions;
- Tier3/custom restrictions; and
- human-only decision transitions.
No new source-of-truth artifact is introduced.

### 2.3 Threat boundary
v1 does not defend against an actor who can maliciously forge trusted Markdown, rewrite Git history, or
bypass repository review. It prevents accidental or tool-driven over-authorization inside the existing
trust boundary.

### 2.4 Accepted limitation
A positive result proves direct safety only for:
- the selected input;
- the selected exact mapping row;
- the selected Evidence bullet; and
- the selected exact screen entry.
It does not prove that no unrelated pending input exists elsewhere. Repository-wide completeness is not
a v1 merge blocker.

## 3. Minimal Decision and Safety Invariants

### 3.1 Intent behavior
The first and only v1 intent is:
```text
visual-refresh
```
The intent is explicit. It is never inferred from:
- input prose;
- source type;
- timestamps;
- diff paths; or
- a Figma URL.
`readiness_mode`, `fact_mode`, and `decision_cap` remain unchanged. The intent must not:
- add a mode;
- lower a mode;
- reopen an Open Decision;
- mutate ordinary `allowed_paths`;
- mutate ordinary `forbidden_paths`; or
- advance readiness.

### 3.2 Singular selection
The public v1 CLI does not add:
```text
--item
--effect
--mapping-key
```
The selected input must resolve to exactly one eligible group and one exact mapping key for the selected
screen. Zero or multiple candidates means:
```text
applicable:false
```
The next action is to refine Stage 04 reconciliation.

### 3.3 Merge-blocking invariants
**I1 — no-intent compatibility**
Without `--intent`, existing readiness computation, path authorization, exit behavior, and serialized
output retain their current byte/shape meaning.
**I2 — selected dependency trust**
Missing, duplicate, hard-invalid, non-v2, non-reconciled, canonically out-of-scope, or otherwise
untrusted selected dependencies gain no authority.
**I3 — exact current evidence**
Input-ID equality is insufficient. Target, Evidence input, section, bullet, visible text, and
selected-row Figma source must satisfy the authority floor.
**I4 — exact selected screen path**
The only positive path is the selected active ScreenSpec's unique-owned, existing, canonical
`screen_entry`.
**I5 — non-waivable denies win**
Tier3, custom, generated/do-not-edit, shared, API Candidate, and ownership denies remain authoritative.
**I6 — forward/backstop operation parity**
Both consumers use the same pure helper. The visual backstop evaluates every write and grants visual
authority only for `M` on the exact authorized path.

## 4. CLI Contract

### 4.1 Canonical readiness invocation
```bash
npm run workflow:readiness -- \
  --screen CREATE-ATTACH \
  --intent visual-refresh \
  --input IN-20260820-figma-003 \
  --path src/features/create/screens/CreateAttachScreen.tsx \
  --json
```

### 4.2 Readiness selector tuple
For `workflow:readiness`:
```text
intent + screen + input, no path
=> applicability-only
=> exit 0
=> no file grant
```
```text
intent + screen + input + path
=> applicability plus path authorization
```
The existing no-intent `screen + path` form remains valid and unchanged. The following are usage errors
with exit `2` before artifact loading:
- unknown or blank intent;
- intent without screen;
- intent without input;
- input without intent;
- intent combined with surface;
- selector conflict;
- blank/non-canonical path; and
- existing malformed/unknown options.

### 4.3 Forbidden-paths selector tuple
For explicit visual context, `workflow:forbidden-paths` requires all four:
```text
--intent visual-refresh
--screen <SCREEN_ID>
--input <INPUT_ID>
--path <authorized-path>
```
Missing any one is a usage error:
```text
exit 2
artifact/diff/git load = none
```
Supplying `screen`, `input`, or `path` without `intent` is also exit `2`. Existing non-visual
invocations retain their current selector contract.

### 4.4 Valid path mismatch
A canonical but mismatched `--path` is not a usage error. When evidence is otherwise valid:
```text
intent_authorization.applicable = true
path_authorization.allowed = false
```
The selector cannot retarget authority.

### 4.5 Minimal output
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
Intent fields are absent from no-intent output.

## 5. Evidence Applicability

### 5.1 All-of predicate
`visual-refresh` is applicable only when all conditions hold.
1. The selected ScreenSpec resolves uniquely.
2. It is active and structurally valid.
3. Its `screen_entry` is canonical.
4. The entry exists as a regular file.
5. Exactly one active ScreenSpec owns that canonical entry.
6. The selected ScreenSpec is that owner.
7. The fact ceiling reaches `final-fixture-ui` or above.
8. The decision cap reaches `final-fixture-ui` or above.
9. The selected input resolves uniquely.
10. The input passes the Input Result hard contract.
11. Canonical `affected_screens` directly contains the selected screen ID.
12. Canonical `affected_domains` directly contains the selected domain.
13. The selected register is Contract v2.
14. The selected input has one Summary row.
15. `Reconcile Status=reconciled`.
16. `Result=accepted`.
17. Exactly one eligible Item group remains.
18. The selected dependency closure passes RR/RP hard trust.
19. Every group row has `Basis=visual-evidence`.
20. Every group row has `Classification=simple-update`.
21. Every authorizing Effect is `update` or `create`.
22. Every authorizing Target is the same exact mapping-row target.
23. The mapping artifact belongs to the selected screen.
24. The M-ID resolves exactly, never by prefix.
25. The selected Mapping Provenance row passes its authority floor.
26. Every Effect and the row resolve to the same Evidence bullet.
27. The Evidence text is non-empty after trimming.
28. Effective Figma file identity is consistent.
29. The checked path equals the authorized path for a grant.
30. No independent non-waivable deny remains.
Any failure yields:
```text
applicable:false
```
except a valid checked-path mismatch, which preserves applicability and denies the path.

### 5.2 Summary authority outcome
`Reconcile Status=reconciled` is necessary but insufficient. The only authority-positive Result is:
```text
accepted
```
The following never authorize:
- `rejected`;
- `no-change`;
- `pending-user-decision`;
- `delegated`;
- `mixed`;
- `failed`;
- `pending`;
- blank; or
- any unknown Result.
This floor is stricter than existing warning-first Summary compatibility.

### 5.3 Canonical input scope
The selected ScreenSpec ID must directly appear in canonical:
```text
affected_screens
```
The selected ScreenSpec domain must directly appear in canonical:
```text
affected_domains
```
Non-authorizing scope includes:
- a different canonical screen;
- a different domain;
- `raw:*` identity;
- an unresolved source alias;
- ambiguous mapping;
- split mapping; or
- scope inferred from prose.
v1 does not use Screen Source Map as an indirect authority bridge. Authors must reconcile the input to
direct canonical scope first.

### 5.4 Exact authorizing target
The only authorizing target grammar is:
```text
artifact:<screen-figma-mapping-id>#component-mapping/<M-ID>
```
The artifact's canonical `screen_id` must equal `--screen`. M-ID matching is exact:
```text
M-014 != M-0140
```
These do not authorize:
- whole mapping artifact;
- mapping section without M-ID;
- whole ScreenSpec;
- ScreenSpec section;
- visual family;
- component gap;
- coarse/unkeyed target;
- historical row;
- retirement/tombstone; or
- mixed target group.

### 5.5 Concrete Evidence authority floor
String equality alone is insufficient. Effect and Mapping Provenance Evidence must independently resolve
through the same canonical resolver. Both resolutions require:
```text
concrete 1-based bullet index
status == ok
same input ID
same section slug
same bullet index
trimmed visible evidence text != empty
```
Section-only refs are non-authorizing. Out-of-range refs such as `/99` are non-authorizing even when
both strings match. The resolved object is shared by both authority checks so they cannot drift.

### 5.6 Selected-row Figma source floor
The selected Mapping Provenance row must have no explicit source contradiction. In particular:
```text
MP-103 on selected M-ID
=> applicable:false
```
The selected row's effective Figma file must agree with the mapping artifact's explicit `sources` / `##
Frame` file identity. Every selected Effect's effective Figma file must equal the selected row's
effective Figma file. Different node/frame anchors within the same file remain acceptable when their
existing precision contracts pass. A contradiction on an unrelated mapping row is non-blocking unless it
makes the artifact's structural identity ambiguous.

### 5.7 Group atomicity
A selected group that mixes an authorizing mapping update with any other Effect or Target is wholly
inapplicable. The helper never takes a valid subset. The next action is to split the Stage 04 group.

### 5.8 Selected-only validation scope
The analyzer must not parse validator message text. Internal issue facts must expose stable structured
identity sufficient for:
1. `structural`;
2. `selected-dependency`; and
3. `unrelated-local`.
Structural examples:
- duplicate selected input ID;
- duplicate selected artifact ID;
- duplicate canonical section/table;
- unparsable required table;
- ambiguous Mapping Key namespace;
- duplicate selected M-ID.
Selected-dependency examples:
- invalid selected Effect;
- invalid selected Target;
- invalid selected Evidence;
- selected MP-103;
- selected mapping provenance failure.
Unrelated-local examples:
- an independent invalid input;
- another independent RR item; or
- another exact mapping row's local provenance error.
Public validator output need not change.

## 6. Exact Path Authorization

### 6.1 Authority path
```text
authorized_path = canonical(selected_screen_spec.screen_entry)
```
Positive path authority requires:
```text
checked_path == authorized_path
```
Role membership alone is insufficient. `{roles.screen}` only verifies that the exact entry is classified
as a screen path under the resolved layout.

### 6.2 Ownership floor
Positive authority requires:
```text
canonical screen_entry
AND existing regular file
AND exactly one active ScreenSpec owner
AND selected ScreenSpec is that owner
```
Two active ScreenSpecs declaring the same canonical entry create structural ambiguity. The result is:
```text
applicable:false
```
The helper must not fall back to:
- a role glob;
- screen-ID filename inference;
- repository search;
- route entry;
- mapping prose; or
- `src/**`.

### 6.3 Other paths
For selected screen `AUTH-LOGIN`, none of these is positive:
```text
src/features/auth/screens/AuthSignupScreen.tsx
src/features/auth/components/AuthCard.tsx
src/features/auth/hooks/useAuth.ts
src/features/auth/api/client.ts
```
This remains true even when no independent deny matches.

### 6.4 Refresh-only path operation
The authority is for an existing file refresh. It is not a creation, replacement, copy, rename, or
type-change contract. The forward check authorizes a concrete existing file edit. The backstop
additionally requires `change_kind=M`.

## 7. Deny Provenance and Final Denies

### 7.1 Logical rules, not strings
The implementation must not remove a resolved path string from `forbidden_paths`. Multiple independent
rules can resolve to the same glob. Before display deduplication, each rule retains at least:
- `source_mode`;
- `authored_path`;
- `resolved_path`;
- `disposition`;
- `origin_kind`;
- `origin_scope`; and
- `stable_rule_id`.
Required origin categories include:
```text
origin_kind: mode-policy | layout-layer
origin_scope: preset | project | domain
```

### 7.2 The only waivable rule
The helper may waive only the canonical built-in logical rule with:
```text
origin_kind = mode-policy
source_mode = api-integrated-ui
authored_path = {roles.screen}
disposition = deny
stable_rule_id = canonical API-stage screen work-step deny
```
A preset mirror may coalesce only when synthesis deterministically proves it is the same built-in
logical rule. String equality is not proof of identity.

### 7.3 Independent non-waivable rules
These remain independent and non-waivable:
- project/domain Tier3 rules;
- custom path rules;
- generated/do-not-edit ownership;
- delegated shared-surface ownership;
- API Candidate deferred/conflict/unowned restrictions;
- other ownership restrictions; and
- policy/config/package paths.
Any matching independent deny wins.

### 7.4 Generated ownership input
Generated ownership is resolved by the repository's existing generated-file single source. The exact
path's generated/do-not-edit fact is passed into the shared helper as an independent final deny input.
The visual intent does not define a second detector. A generated selected screen entry is denied even
when all evidence predicates pass.

## 8. Forward and Backstop Parity

### 8.1 One pure helper
Forward readiness and `workflow:forbidden-paths` consume the same pure helper. The input includes:
- selected screen ID;
- selected input ID;
- evidence applicability;
- exact authorized path;
- checked path;
- change kind when applicable;
- ordinary readiness context;
- logical deny provenance; and
- generated ownership fact.

### 8.2 Forward behavior
```text
checked_path = --path
authorized_path = selected ScreenSpec.screen_entry
```
Exact equality is required for a grant. A mismatched path receives no visual waiver.

### 8.3 Backstop invocation
```bash
npm run workflow:forbidden-paths -- \
  --screen CREATE-ATTACH \
  --intent visual-refresh \
  --input IN-20260820-figma-003 \
  --path src/features/create/screens/CreateAttachScreen.tsx \
  --staged \
  --enforce
```
`--path` selects the sole authorized path. It is not a diff-source selector. The backstop derives the
ScreenSpec entry independently and verifies equality.

### 8.4 Every write is evaluated first
With explicit visual context, every parsed write path is evaluated before the existing guarded-surface
early filter can skip it. For each write:
```text
changed_path == authorized_path AND change_kind == M
=> evaluate with visual context
```
```text
all other writes
=> evaluate through the same selected screen's ordinary no-intent branch
```
When the ordinary branch returns `allowed:false`:
```text
violation = true
```
This is independent of guarded-surface, API-surface, or Candidate prefilter membership. With
`--enforce`, any violation yields exit `1`. Only invocations without visual context retain the existing
project-level early filter flow.

### 8.5 Change-kind boundary
Visual authority is available only for:
```text
M authorized_path
```
These never receive visual authority:
```text
A authorized_path
R old -> authorized_path
C old -> authorized_path
T authorized_path
```
They use ordinary authorization and violate when it denies them. `D` retains existing no-write treatment
and creates no authority. Working-tree existence alone does not prove pre-existing file identity.
Supporting `A/R/C/T` would require the Git/base and old-path contract excluded from v1. If the
authorized path is absent from the write set, the intent grants nothing.

### 8.6 Packet and Report
Packet/Report may transport only:
- selected input ID;
- selected mapping key;
- exact Evidence ref;
- authorized path; and
- checked path.
These fields are audit data, not an authority artifact. The backstop always re-evaluates current
repository state.

## 9. Accepted Limitations and Implementation Slice

### 9.1 Unsupported in v1
The following remain unsupported:
1. domain-component authority;
2. removal/retirement;
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
Coarse/unkeyed work returns `applicable:false` and directs the author to Stage 04 exact reconciliation.

### 9.2 Minimal implementation order
1. Add a selected-evidence analyzer.
2. Add direct canonical input-scope checks.
3. Add Result and concrete Evidence authority floors.
4. Add selected-row Figma-source checks.
5. Build the unique active `screen_entry` owner index.
6. Preserve logical deny provenance internally.
7. Reuse generated ownership as a final deny fact.
8. Extend the shared pure path helper.
9. Add readiness and backstop selectors.
10. Propagate minimal Packet/Report audit fields.
11. Add the focused regression matrix below.
No public deny schema, capability artifact, history authority, or repository-wide ledger is introduced.

## 10. Verification Matrix and Review Closure
The implementation uses at most 20 focused regressions.
| # | Case | Expected |
|---|---|---|
| 1 | no intent on API-mode screen | existing screen forbid and output shape remain |
| 2 | readiness missing required intent selector; backstop missing any visual tuple selector; stray backstop selector without intent | exit 2 before artifact/diff/git load |
| 3 | hard-invalid/duplicate input; selected screen/domain absent from canonical scope; raw/ambiguous alias | `applicable:false` |
| 4 | v1/summary-only register; non-reconciled Summary; selected RR/RP error; `Result!=accepted` | `applicable:false` |
| 5 | Basis/classification/effect outside `visual-evidence` / `simple-update` / `update|create` | `applicable:false` |
| 6 | whole/section/coarse/unkeyed/mixed target | `applicable:false` |
| 7 | exact M-ID + accepted scoped input + non-empty current Evidence + unique-owned entry | forward allow; backstop `M` allow |
| 8 | section-only/out-of-range/empty/different Evidence; selected MP-103/source contradiction | `applicable:false`/deny |
| 9 | valid evidence but checked selector is same-domain other screen entry | `applicable:true`, `allowed:false` |
| 10 | component/hook/API-client checked path | deny |
| 11 | missing/non-canonical/non-regular entry or duplicate active owner | `applicable:false`; no fallback |
| 12 | ordinary built-in API-stage screen work-step deny only | exact entry may be granted |
| 13 | proven preset mirror of the same built-in rule | same result as #12 |
| 14 | same path also has Tier3 or generated/do-not-edit deny | deny |
| 15 | custom independent rule resolves to same path | deny |
| 16 | unrelated invalid input/RR item/mapping row | non-blocking |
| 17 | selected structural ambiguity or duplicate exact M-ID | `applicable:false` |
| 18 | backstop diff has authorized path plus another ordinarily denied screen/component path | every write evaluated; extra violation; `--enforce` exit 1 |
| 19 | authorized path is `M` vs `A/R/C/T`, or absent | only `M` receives visual grant; others ordinary deny; absent grants nothing |
| 20 | forward and backstop evaluate same exact path/context | same helper result |

### 10.1 Merge blockers
Review blocks on only:
- no-intent regression;
- non-authorizing Summary gaining authority;
- canonically out-of-scope input gaining authority;
- coarse, empty, stale, or contradictory selected evidence gaining authority;
- non-unique/missing screen-entry ownership;
- a positive path other than the exact selected entry;
- backstop skipping an ordinarily denied extra write;
- visual authority expanding from `M` to `A/R/C/T`;
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
Issue #223 is deferred until the minimal Issue #222 helper is implemented and verified in a separate
implementation PR. This PR does not define:
- app-shell artifacts;
- shell roots;
- shell maturity;
- generic Candidate owners;
- shell Open Decisions; or
- shell ownership contracts.
No Issue #223 state, body, comment, or follow-up issue is changed.
