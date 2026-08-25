# Issue #222 minimal v1 — Evidence-bound Visual Refresh
Status: proposed minimal v1; implementation not started Issue: #222 Baseline:
`49a3a31029293eae3fd6765f75e2b5520f939a93` (`origin/main`) Design scope: one selected visual input authorizing one
selected screen entry path This document defines the smallest implementation contract needed to start Issue #222. It
replaces the earlier expanded design in full. It changes no source, test, fixture, policy YAML, schema, template,
manifest, skill, distributed payload, dependency, release, version, or tag.

## 1. Problem and Scope

### 1.1 Current gap
`readiness_mode` is a progress ladder. The selected mode still comes from the fact ceiling and Open Decision cap. At
`final-fixture-ui`, screen work is allowed. At `api-integrated-ui`, the authored `{roles.screen}` work-step deny
intentionally closes screen editing while hook/API wiring is performed. When exact visual evidence arrives after a
screen has reached the API stage, there is no narrow way to apply that visual update without either:
- advancing to `production-ready` for unrelated reasons; or
- reopening an Open Decision only to lower the readiness mode.
Issue #222 v1 adds one explicit work intent, `visual-refresh`, to solve only that gap.

### 1.2 Minimal result
A positive v1 grant is bound to all of the following:
- one selected active ScreenSpec;
- one selected canonical input artifact;
- one selected Reconciliation Item group;
- one exact current Figma component-mapping row;
- that row's exact canonical Evidence ref; and
- the selected ScreenSpec's exact canonical `screen_entry` file.
The v1 grant does not authorize a role glob. The role is only a classification check around an already exact file.

### 1.3 Scope reduction after review
The previous draft allowed `{roles.domain_component}` as a positive candidate. That is removed from v1. The current
layout resolves both `{roles.screen}` and `{roles.domain_component}` at domain-wide granularity. Without a separate
exact code-path ownership contract, a selected screen's evidence could otherwise authorize another screen or another
domain component in the same domain. Therefore v1 supports only the selected ScreenSpec's exact `screen_entry`.
Domain-component authorization is deferred until a separate exact ownership relation exists. This is a deliberate
reduction, not a temporary role-glob heuristic.

### 1.4 Non-goals
This v1 does not:
- prove repository-wide visual freshness;
- prove that no other pending input exists;
- infer code ownership from Figma prose;
- authorize domain components;
- authorize removal or retirement operations;
- create a Git-history approval system;
- create a general deny-claim authorization platform; or
- authorize app-shell work.

## 2. Threat Model and Safety Invariants

### 2.1 Existing trust boundary
The implementation reuses the repository's existing trust boundary:
- canonical input authoring;
- Input Result Contract;
- Reconciliation Contract v2;
- Mapping Provenance Contract v1;
- existing `workflow:validate` and review;
- ScreenSpec lifecycle and structural checks;
- current layout and path policy;
- current Tier3/custom/generated/shared/API Candidate/ownership restrictions; and
- existing human-only decision transitions.
The v1 does not defend against an actor who can maliciously forge trusted Markdown or rewrite Git history. It is an
accidental/tool-driven over-authorization guard inside the existing repository trust boundary.

### 2.2 Merge-blocking invariants
Only the following are v1 merge blockers. **I1 — no-intent compatibility** When `--intent` is absent, existing
readiness computation, path authorization, exit behavior, and serialized output keep their current byte/shape meaning.
An API-mode screen remains forbidden from editing its screen path under the ordinary no-intent contract. **I2 —
selected-input hard trust** A missing, duplicate, hard-invalid, non-v2, non-reconciled, ambiguous, or otherwise
untrusted selected dependency cannot gain authority. Failure is `applicable:false`, never a partial allow. **I3 —
exact current evidence** The selected reconciliation effect authorizes only when its exact canonical target and exact
canonical Evidence ref match the current selected Mapping Provenance row. Input-ID equality alone is insufficient.
**I4 — exact selected screen path** The only positive implementation path in v1 is the selected active ScreenSpec's
exact canonical `screen_entry`. A same-domain screen file, a domain component, a hook, an API client, a shared path,
or any other file is never positive merely because it matches a role glob. **I5 — non-waivable denies win** Tier3,
custom, generated/do-not-edit, shared-surface, API Candidate, ownership, and all other independent deny rules remain
authoritative. Only the one legacy API-stage screen work-step rule identified by stable rule provenance may be waived.
**I6 — forward/backstop exact-path parity** The same exact authorized path is part of the visual-refresh context in
both forward readiness and diff backstop evaluation. A visual intent cannot fan out from one selected path to every
changed path in a diff.

### 2.3 Accepted limitation
The v1 proves direct authority safety for the selected input, exact mapping target, and exact `screen_entry`. It does
not prove repository completeness or absence of unrelated pending visual inputs. That limitation is accepted and is
not a merge blocker.

## 3. Minimal Public Contract

### 3.1 Canonical invocation
```bash
npm run workflow:readiness -- \
  --screen CREATE-ATTACH \
  --intent visual-refresh \
  --input IN-20260820-figma-003 \
  --path src/features/create/screens/CreateAttachScreen.tsx \
  --json
```
The first and only v1 intent enum value is `visual-refresh`. For an actual file authorization:
- `--screen` is required;
- `--input` is required; and
- one canonical concrete `--path` is required.
An applicability-only invocation may omit `--path`. Such an invocation never grants a file.

### 3.2 Selector constraints
`visual-refresh` cannot be combined with `--surface`. No `--app-shell`, `--base-ref`, capability-artifact selector, or
additional public target selector is introduced. The public CLI does not add `--item`, `--effect`, or `--mapping-key`
in v1. The selected input must therefore resolve to exactly one eligible authorizing group and one exact mapping key
for the selected screen. Zero or multiple eligible groups/keys means `applicable:false`. The next action is to refine
Stage 04 reconciliation.

### 3.3 Usage errors
The following are usage errors and exit `2`:
- unknown intent;
- blank intent;
- visual-refresh without `--screen`;
- visual-refresh without `--input`;
- `--input` without an intent;
- `--intent` with `--surface`;
- existing selector conflicts;
- blank/non-canonical `--path`; and
- existing unknown-option or malformed-value errors.
Evidence or authorization failure is not a syntax error. Those cases return normal output, exit `0`, and report
`applicable:false` or `allowed:false`.

### 3.4 Minimal intent output
Intent-specific fields are emitted only for an explicit supported intent.
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
`authorized_path` is derived from the selected ScreenSpec's canonical `screen_entry`. When `--path` is supplied,
`checked_path` must equal `authorized_path` before a positive grant is possible.

### 3.5 No-intent compatibility
These existing commands keep their current output shape and behavior:
```bash
npm run workflow:readiness -- --screen CREATE-ATTACH --json
npm run workflow:readiness -- --screen CREATE-ATTACH --path src/features/create/screens/CreateAttachScreen.tsx --json
```
Neither command emits intent-specific fields.

## 4. Evidence Applicability

### 4.1 All-of predicate
`visual-refresh` is applicable only when all of the following hold.
1. The selected ScreenSpec resolves uniquely and is active.
2. The selected ScreenSpec passes structural/lifecycle trust.
3. The selected ScreenSpec has one canonical, non-empty, project-relative `screen_entry`.
4. `screen_entry` passes concrete-path canonicality, exists as a regular file, and has exactly one active ScreenSpec owner: the selected screen.
5. The fact ceiling reaches at least `final-fixture-ui`.
6. The Open Decision cap reaches at least `final-fixture-ui`.
7. The selected input resolves uniquely.
8. The selected input passes the applicable Input Result hard contract.
9. The selected Reconciliation Register is Contract v2.
10. The selected input has one Summary row with `Reconcile Status=reconciled`.
11. That Summary row has authority-positive `Result=accepted`; all other Result values are non-authorizing in v1.
12. Exactly one eligible Reconciliation Item group remains.
13. The selected dependency closure for that group passes RR/RP hard trust.
14. Every row in the group has `Basis=visual-evidence`.
15. Every row has `Classification=simple-update`.
16. Every authorizing Effect is `update` or `create`.
17. Every authorizing Target is the same exact current mapping-row target.
18. The mapping artifact belongs to the selected screen.
19. Every selected Effect and the selected Mapping Provenance row resolve to the same concrete, existing Evidence bullet.
20. `authorized_path` is the selected ScreenSpec's unique-owned canonical `screen_entry`.
Any failure makes the intent inapplicable.

### 4.2 Exact authorizing target
The only authorizing target grammar is:
```text
artifact:<screen-figma-mapping-id>#component-mapping/<M-ID>
```
The mapping artifact's canonical `screen_id` must equal the selected `--screen`. The M-ID must resolve as an exact
key. Prefix matching is forbidden:
```text
M-014 != M-0140
```
The following do not create authority:
- whole mapping artifact;
- mapping section without M-ID;
- visual-consistency family;
- whole ScreenSpec;
- ScreenSpec section;
- component-gap-register;
- ambiguous/coarse/unkeyed target;
- historical mapping row;
- retirement/tombstone target.

### 4.3 Summary outcome and exact current Evidence
`Reconcile Status=reconciled` is necessary but not sufficient for authority. The v1 authority-positive Result
allowlist contains exactly one value:
```text
accepted
```
`rejected`, `no-change`, `failed`, `pending`, `pending-user-decision`, `delegated`, `mixed`, a blank Result, or any
other Result never creates visual-refresh authority. This authority floor is stricter than the current warning-first
Summary Result compatibility checks and is local to this intent.

Currentness is exact-row local, but string equality is not sufficient. Both refs must independently resolve to the
same concrete visible bullet:
```text
selected_effect.target == current exact mapping target
AND
resolve(selected_effect.evidence_ref).status == ok
AND
resolve(current_mapping_row.evidence_ref).status == ok
AND
selected_effect.evidence_ref has a concrete 1-based bullet index
AND
current_mapping_row.evidence_ref has the same concrete bullet index
AND
resolved Evidence identity is equal
```
Section-only refs are non-authorizing. Out-of-range refs such as `/99` are non-authorizing even when both records
contain the same string. The input ID, section slug, and bullet index are all identity. Therefore:
```text
input:IN-X#extracted-facts/01
!=
input:IN-X#extracted-facts/02
```
The implementation should resolve Effect and Mapping Provenance Evidence through one shared canonical Evidence
resolver/object so the two authority checks cannot drift. If the current Mapping Provenance row changes to another
input or bullet, the older effect loses authority naturally. No timestamp ordering, Git history, revocation ledger, or
repository-wide scan is needed.

### 4.4 Group atomicity
A selected group that mixes the authorizing mapping update with any non-authorizing Effect or Target is wholly
inapplicable. The helper does not take a valid subset. The next action is to split or refine the Stage 04 item group.

### 4.5 Selected-only hard-validation scope
The v1 analyzer must not parse validator message text to decide whether an error matters. Internal validation facts
consumed by the analyzer must carry stable structured identity sufficient to classify each hard issue into one of
these scopes:
1. `structural`
2. `selected-dependency`
3. `unrelated-local`
A large new public error taxonomy is not required. The scope metadata may remain internal.
#### Structural
A structural issue makes the selected artifact or identity space untrustworthy regardless of which row was selected.
Examples:
- duplicate selected `input_id`;
- duplicate artifact ID affecting selected resolution;
- duplicate canonical register section/table;
- unparsable required canonical table;
- duplicate/ambiguous Mapping Key namespace in the selected mapping artifact;
- duplicate selected M-ID.
Structural issues block the invocation.
#### Selected dependency
A selected-dependency issue blocks only when its `subject_id` lies in the selected dependency closure. The closure
consists of:
- selected input;
- selected Summary row;
- selected Reconciliation Item group;
- selected exact target artifact;
- selected M-ID;
- selected Mapping Provenance row; and
- exact Evidence reference required by those records.
Examples:
- invalid selected item Effect;
- invalid selected item Target;
- invalid selected Evidence ref;
- selected mapping row provenance failure.
#### Unrelated local
An unrelated-local issue belongs to a different independent input, RR item, or mapping row and does not alter selected
identity or selected dependency resolution. It does not block this invocation. Examples include an invalid unrelated
input or a row-level provenance error on another exact mapping key, provided the selected artifact's structural
identity remains trustworthy.

### 4.6 Minimal internal issue shape
Existing validators may be refactored internally to expose structured facts equivalent to:
```yaml
code: MP-017
scope: selected-dependency
subject_type: mapping-key
subject_id: M-014
```
The exact property names are implementation details. The normative requirement is that selection filtering uses
structured code/scope/subject identity, never free-text message parsing. Existing public validator output need not
change in v1.

## 5. Exact Path Authorization

### 5.1 `screen_entry` is the authority path
For v1, evidence applicability produces exactly one possible positive path:
```text
authorized_path = canonical(selected_screen_spec.screen_entry)
```
A positive grant requires:
```text
checked_path == authorized_path
```
Role membership alone is insufficient. `{roles.screen}` is still used to verify that the exact `screen_entry` is a
screen-role path under the resolved layout. It does not expand the grant to every file under the role glob.

### 5.2 Same-domain files remain denied
For selected screen `AUTH-LOGIN`:
```text
authorized_path:
src/features/auth/screens/AuthLoginScreen.tsx
```
these are not positive candidates:
```text
src/features/auth/screens/AuthSignupScreen.tsx
src/features/auth/components/AuthCard.tsx
src/features/auth/hooks/useAuth.ts
src/features/auth/api/client.ts
```
This remains true even if those files match the same domain's resolved role globs and no independent deny happens to
match. The visual-refresh helper is exact-file authority, not domain authority.

### 5.3 `screen_entry` ownership floor
Treating `screen_entry` as authority requires more than exact path equality. Positive authority requires:
```text
canonical screen_entry
AND existing regular file
AND exactly one active ScreenSpec declares that canonical screen_entry
AND that unique owner is the selected ScreenSpec
AND no shared-surface/generated ownership conflicts with the path
```
The active-ScreenSpec ownership index compares canonicalized `screen_entry` values repository-wide. Two active
ScreenSpecs declaring the same path are a structural ambiguity and make visual-refresh `applicable:false` for that
path. This v1 is a refresh contract, not a file-creation contract, so a missing target file is also inapplicable.

If the selected ScreenSpec lacks `screen_entry`, declares a non-canonical path, points to a missing/non-regular file,
or fails the unique-owner predicate, visual-refresh is `applicable:false`. The helper must not fall back to:
- `{roles.screen}`;
- file-name inference from screen ID;
- repository search;
- route entry;
- `src/**`; or
- the mapping table's human-readable component text.

### 5.4 Domain components are deferred
`{roles.domain_component}` is never a positive v1 candidate. A future design may add component edits only after there
is a machine-readable exact ownership relation between selected visual evidence and finite code paths. The current
Mapping table's human-readable "mapped component" cell is not promoted into that ownership contract by this PR.

## 6. Deny Provenance and Waiver Rule

### 6.1 Why string removal is forbidden
The implementation must not remove a resolved path string from `forbidden_paths`. Multiple independent rules can
resolve to the same concrete glob. Removing the string would erase the distinction between a waivable work-step rule
and a non-waivable Tier3/custom rule.

### 6.2 Minimum internal rule provenance
Before deduplication, each effective allow/deny rule used for concrete authorization must retain provenance equivalent
to:
- `source_mode`;
- `authored_path` token or literal;
- `resolved_path`;
- `disposition`;
- `origin_kind`;
- `origin_scope`; and
- `stable_rule_id`.
Required origin values for v1 are at least:
```text
origin_kind: mode-policy | layout-layer
origin_scope: preset | project | domain
```
`stable_rule_id` may be a deterministic source location or another stable internal identity. It is not a new public
schema.

### 6.3 Logical coalescing
Rules may be deduplicated for display only after their independent origins have been retained. The authorization model
is a set of logical rules, not a set of path strings. The built-in preset layer may mirror the default mode-policy
screen restriction. When synthesis can prove that the preset rule is only the canonical mirror of the same built-in
logical rule, both observations may coalesce under one stable logical rule identity. That coalescing must be explicit
and deterministic. String equality alone is not proof of logical identity.

### 6.4 Project/domain layer rules remain independent
A project or domain layer declaration is an independent rule even when it resolves to exactly the same token and path
as the built-in policy rule. Therefore:
```text
mode-policy screen work-step deny
+ project/domain layout-layer deny on same path
=> non-waivable deny remains
=> visual-refresh denied
```
Likewise, a custom authored token or literal that resolves to the same concrete path remains an indepent
non-waivable rule.

### 6.5 The only waivable logical rule
The helper may waive exactly one logical rule:
- `origin_kind=mode-policy`;
- built-in/default work-step origin;
- `source_mode=api-integrated-ui`;
- `authored_path={roles.screen}`;
- `disposition=deny`; and
- the rule's stable identity is the canonical API-stage screen work-step deny.
A proven preset mirror of that same logical rule may be coalesced with it. No `layout-layer` project/domain rule is
waivable. If any other deny rule matches `authorized_path`, deny wins.

### 6.6 Existing deny families
Without trying to enumerate every future restriction, v1 explicitly preserves the existing non-waivable classes,
including:
- Tier3/project/domain layer deny;
- custom path deny;
- generated/do-not-edit;
- delegated shared surface;
- API Candidate deferred/conflict/unowned restrictions;
- other ownership restrictions; and
- ordinary policy/config/package paths outside the exact screen entry.

### 6.6 Generated/do-not-edit is an independent final deny
Generated ownership is not inferred from mode/layout logical rules. The implementation must query the repository's
existing generated-file ownership source (manifest/status/do-not-edit/header semantics) and pass the exact path's
result into the shared authorization helper as an independent non-waivable deny fact. A valid visual grant for the
selected `screen_entry` still resolves to `allowed:false` when that exact file is generated or do-not-edit. This final
deny cannot be waived by the API-stage screen work-step exception. The v1 reuses the existing generated-file detection
source; it does not define a second detector.

## 7. Forward and Diff Backstop Parity

### 7.1 One pure helper
Forward readiness and `workflow:forbidden-paths` must consume the same pure visual-refresh authorization helper. The
helper input includes at least:
- selected screen ID;
- selected input ID;
- selected evidence applicability result;
- exact `authorized_path`;
- `checked_path`;
- ordinary readiness/path context; and
- independent deny-rule provenance.
The helper returns one allow/deny result for one concrete checked path.

### 7.2 Forward check
In the forward CLI:
```text
checked_path = --path
authorized_path = selected ScreenSpec.screen_entry
```
Intent-positive evaluation occurs only if the paths are exactly equal. Every other checked path uses no visual grant.

### 7.3 Backstop selector contract
For direct visual-refresh backstop use, the same exact path must be supplied as part of the intent context. The
minimum public form is:
```bash
npm run workflow:forbidden-paths -- \
  --screen CREATE-ATTACH \
  --intent visual-refresh \
  --input IN-20260820-figma-003 \
  --path src/features/create/screens/CreateAttachScreen.tsx \
  --staged \
  --enforce
```
For visual-refresh, `--path` is an exact authorized-path selector, not a diff source. The backstop derives
`authorized_path` independently from the selected ScreenSpec and requires:
```text
--path == authorized_path
```
A mismatched selector is a normal deny/inapplicable authorization result, not permission to retarget the intent.

### 7.4 Multi-file diff rule
The backstop iterates every changed write path, but intent-positive authority is available to exactly one path:
```text
changed_path == authorized_path
```
For every other changed path:
- the visual intent is not applied;
- ordinary existing authorization is evaluated; and
- a failure cannot be cleared by reusing the selected input/M-ID/Evidence.
Therefore one invocation cannot fan out a visual grant to multiple files.

### 7.5 Authorized path absent or duplicated by change records
If the exact authorized path is not present in the changed write set, the visual intent grants nothing. Rename
handling uses the existing write-path semantics. Only the canonical rename destination can equal `authorized_path`. A
separate modified path in the same diff receives no visual grant. If diff parsing produces ambiguous/non-canonical
write-path identity, existing backstop fail-closed behavior applies.

### 7.6 Workflow-run, Packet, and Report
When workflow-run/Packet invokes the backstop, it propagates the same exact authorized path selected by the forward
context. Packet/Report may copy only the minimal audit fields:
- selected input ID;
- selected mapping key;
- exact Evidence ref;
- authorized path; and
- checked path.
These fields are audit/transport data, not a new authority artifact. The backstop still re-evaluates repository state
and exact-path equality. A stale Packet cannot authorize a different path.

## 8. Accepted Limitations and Deferred Work
The following are not supported in v1 and must not be expanded into new contracts in this PR:
1. domain-component authorization;
2. pure removal or retirement operations;
3. active/retired ledger or tombstone;
4. visual-family member authority;
5. ScreenSpec Visual Evidence authority;
6. unkeyed resolution table;
7. legacy input grandfathering/adoption artifact;
8. repository-wide pending visual freshness;
9. malformed input deny-only recovery;
10. `impact_axes` or new visual source categories;
11. Git history/base-ref approval;
12. human approval digest;
13. code AST to mapping-key automatic linkage;
14. implementation completion tracking; and
15. Issue #223 app-shell.
For coarse or unkeyed reconciliation:
```text
no exact authorizing mapping key
=> visual-refresh applicable:false
=> next action: reconcile again in Stage 04 with an exact mapping-row target
```
For a visual update that needs a domain component:
```text
screen_entry-only v1 cannot authorize it
=> visual-refresh allowed:false
=> follow-up ownership design required
```
No legacy or malformed state is automatically approved or repaired.

## 9. Implementation Slice
The first implementation should remain small.

### 9.1 Selected evidence analyzer
Add a pure analyzer that:
- reuses existing parsers/validators;
- resolves one selected ScreenSpec/input/group/M-ID;
- classifies hard issues using structured scope/subject facts;
- compares the selected Effect target/Evidence with the current exact Mapping Provenance row;
- derives exact canonical `screen_entry`; and
- returns `applicable:false` without partial authority on any failure.

### 9.2 Rule provenance preservation
Adjust internal policy/layout resolution only as needed to preserve independent logical deny origins through
synthesis/deduplication. Do not introduce a public deny schema. The implementation must be able to distinguish the
canonical waivable mode-policy work-step rule from project/domain/custom layer rules that resolve to the same string.

### 9.3 Shared path helper
Extend the existing pure concrete-path authorization seam with an optional visual-refresh context. No-intent calls
take the existing branch unchanged. Intent calls:
1. require exact evidence applicability;
2. require `checked_path == authorized_path`;
3. require screen-role classification;
4. waive only the canonical logical work-step deny;
5. apply every remaining deny rule; and
6. return the final deterministic path result.

### 9.4 CLI and backstop
Add only the selectors necessary for the contract:
- readiness: `--intent`, `--input`;
- forbidden-paths: `--screen`, `--intent`, `--input`, `--path` for explicit visual context.
Existing diff selectors retain their meanings.

### 9.5 Packet/report propagation
Propagate the minimal selected identifiers and exact path. Do not add:
- Git merge-base;
- `--base-ref`;
- adoption authority;
- authority digest;
- pending-uncertainty index;
- effect-ref hash identity;
- completion ledger; or
- repository-wide historical scan.

## 10. Verification Matrix and Review Closure
The implementation needs at most 20 focused regressions.
| # | Case | Expected |
|---|---|---|
| 1 | no intent on API-mode screen | existing screen forbid and output compatibility remain |
| 2 | missing `--input`, unknown/blank intent, or selector conflict | exit 2 |
| 3 | hard-invalid selected input or duplicate selected input ID | `applicable:false` |
| 4 | v1/summary-only register, non-reconciled Summary, selected RR/RP-invalid group, or `Result!=accepted` including `rejected/no-change/mixed` | `applicable:false` |
| 5 | Basis/classification/effect outside `visual-evidence` / `simple-update` / `update|create` | `applicable:false` |
| 6 | whole mapping, section-only, coarse, unkeyed, or mixed target group | `applicable:false` |
| 7 | exact M-ID + concrete in-range current Evidence bullet + unique-owned existing selected `screen_entry` | allow |
| 8 | section-only Evidence, out-of-range `/99`, same input/different bullet, or current row points to another input | `applicable:false`/deny |
| 9 | selected AUTH-LOGIN evidence checked against same-domain AUTH-SIGNUP `screen_entry` | deny |
| 10 | selected screen evidence checked against same-domain component/hook/API-client path | deny |
| 11 | missing/non-canonical/nonexistent `screen_entry`, or two active ScreenSpecs declare the same canonical `screen_entry` | `applicable:false`, no role fallback |
| 12 | ordinary default API-stage `{roles.screen}` work-step deny only | exact screen entry may be granted |
| 13 | proven preset mirror of the same built-in logical rule | same result as #12 |
| 14 | same path also has project/domain Tier3 deny or generated/do-not-edit ownership | deny |
| 15 | different authored custom rule resolves to same concrete path | deny |
| 16 | unrelated invalid input/RR item/mapping row with no selected dependency impact | non-blocking |
| 17 | selected artifact structural ambiguity or duplicate selected M-ID (`M-014` exact; never `M-0140`) | `applicable:false` |
| 18 | backstop diff has authorized screen path plus another screen/component path | only exact authorized path may receive intent-positive evaluation |
| 19 | backstop rename destination equals authorized path plus another modified path, or authorized path absent | no fan-out; only exact destination may use intent, absent path grants nothing |
| 20 | forward and backstop evaluate the same exact path/context | same helper result |

### 10.1 Merge blockers
For this v1, review must block on only:
- no-intent regression;
- rejected/non-authorizing Summary outcome or unresolved/coarse Evidence gaining authority;
- invalid/stale selected evidence gaining direct authority;
- non-unique/missing `screen_entry` ownership or any positive path other than the exact selected entry;
- exact-path fan-out in the diff backstop;
- waiving an independent non-waivable deny, including generated/do-not-edit;
- selected-only validation losing structural/identity errors; or
- forward/backstop mismatch.

### 10.2 Non-blocking follow-up
The following remain non-blocking follow-up:
- whether another pending input exists;
- repository completeness of legacy inputs;
- malformed external-input recovery;
- domain-component ownership and authorization;
- visual source-category expansion;
- pure removal/retirement; and
- app-shell.
These items must not be solved by expanding this v1 design.

## 11. Issue #223 Deferred
Issue #223 is deferred until the minimal Issue #222 authorization helper is implemented and verified in a separate
implementation PR. This PR does not define app-shell artifacts, shell roots, shell maturity, generic Candidate owners,
shell Open Decisions, or shell ownership contracts. No Issue #223 state, body, comment, or follow-up issue is changed
by this design.
