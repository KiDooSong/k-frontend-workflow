# Issue #222 minimal v1 — Evidence-bound Visual Refresh
Status: proposed minimal v1; implementation not started
Issue: #222
Baseline: `49a3a31029293eae3fd6765f75e2b5520f939a93` (`origin/main`)
Design scope: readiness and concrete-path authorization for one selected visual refresh
This document defines the smallest implementation contract needed to start Issue #222. It replaces the earlier
expanded design in full. It changes no source, test, policy, schema, template, manifest, skill, or distributed
payload.

## 1. Problem

### 1.1 Current behavior
`readiness_mode` represents progress through one ordered ladder. The selected mode is still calculated from facts and
the Open Decision cap. The effective mode then exposes `allowed_paths` and `forbidden_paths`.
That model intentionally narrows the work performed at each stage. In `final-fixture-ui`, screen, domain-component, and
hook paths are available. In `api-integrated-ui`, hook and API-client work is available while the authored
`{roles.screen}` work-step path is forbidden.
This protects the fake-hook replacement step from unrelated screen edits. It also creates a practical gap when exact
visual evidence arrives after the screen has already reached the API stage. The workflow has no narrow way to say:

> apply this selected, reconciled, current Figma mapping update to this concrete screen or domain-component file,
> without reopening unrelated implementation authority.
Promoting to `production-ready` is not an answer because its CI and semantic-review facts are independent of the newly
arrived visual evidence. Lowering the mode by reopening an Open Decision is also not an answer because it changes
progress semantics only to obtain an edit envelope.

### 1.2 Required result
Issue #222 v1 adds one explicit work intent, `visual-refresh`. It is not a new readiness mode and does not alter the
mode ladder. It is a path-specific authorization check bound to:

- one selected screen;
- one selected canonical input artifact;
- one uniquely selected Reconciliation Item group;
- one exact current Figma component-mapping row;
- that row's exact current canonical Evidence ref; and
- one concrete project-relative implementation path.
The capability may positively authorize only the selected screen role or its domain-component role, and only after every
existing non-waivable deny has been evaluated.

### 1.3 Non-goal
This v1 does not prove that every visual input in the repository has been reconciled. It does not choose the newest
repository-wide visual input. It does not establish a cryptographic or Git-history approval system. It does not
authorize app-shell work.
The design is deliberately local to the selected input, selected target, and checked path.

## 2. Scope and Threat Model

### 2.1 Existing trust boundary
The implementation reuses the repository's existing trust boundary:

- canonical input authoring;
- the Input Result Contract;
- Reconciliation Contract v2;
- Mapping Provenance Contract v1;
- existing `workflow:validate` checks and review;
- current ScreenSpec lifecycle and structural checks;
- current layout, ownership, generated-file, Tier3, custom-path, shared-surface, and API Candidate restrictions; and
- human-only decision transitions already enforced by the workflow.
No new source-of-truth artifact is introduced. The selected input, register, mapping artifact, and generated workflow
state remain the canonical repository records used by the implementation.

### 2.2 Threat model boundary
The v1 does not defend against an actor who can maliciously forge trusted Markdown, rewrite repository history, or
bypass the existing review process. Those concerns are outside Issue #222's minimal implementation boundary.
The v1 does defend against accidental or tool-driven over-authorization caused by:

- selecting a missing, duplicate, hard-invalid, or non-reconciled input;
- using a coarse or stale reconciliation target;
- matching only the input ID while ignoring the Evidence section or bullet;
- opening a hook, API-client, shared, generated, or other-owner path;
- removing a path string from `forbidden_paths` without preserving why it was denied; or
- producing a different result in the forward readiness check and the diff backstop.
This is a focused accidental-misuse model, not an exhaustive threat model.

### 2.3 Accepted trust limitation
Positive authorization proves only that the selected input and selected mapping target are currently aligned under the
existing contracts. It does not prove that no other pending or unreconciled input exists elsewhere in the repository.
That limitation is accepted for v1 and is not a merge blocker.

### 2.4 Scope boundary
Normative scope is Issue #222 only. The design does not define:

- an app-shell artifact or target;
- shell roots or shell maturity;
- generic Candidate ownership;
- shell Open Decisions;
- shell physical ownership; or
- a reusable authorization platform for arbitrary work intents.

## 3. Minimal Decision

### 3.1 One additive intent
The first and only v1 intent enum value is:

```text
visual-refresh
```

The intent is explicit. Omitting `--intent` executes the existing readiness behavior with no semantic or output-shape
change. No implicit visual routing is inferred from changed files, input prose, source category, or a late Figma
timestamp.

### 3.2 Readiness remains unchanged
`readiness_mode`, `fact_mode`, and `decision_cap` retain their current meanings. The implementation must not:

- add a mode to the policy ladder;
- lower the selected mode;
- reopen or synthesize an Open Decision;
- treat the intent as a fact that advances readiness;
- mutate the normal `allowed_paths` array; or
- mutate the normal `forbidden_paths` array.
For an explicit intent, authorization is reported as an additional path-specific result. The normal readiness envelope
remains visible and unchanged.

### 3.3 Merge-blocking invariants
The implementation is acceptable only if all five invariants hold.

**I1 — no-intent compatibility**
When `--intent` is absent, readiness computation, path authorization, exit behavior, and serialized output retain their
existing byte/shape meaning. In particular, an API-mode screen remains forbidden from editing its screen path under the
ordinary no-intent contract.

**I2 — selected-input hard trust**
A hard-invalid, duplicate, missing, non-v2, non-reconciled, ambiguous, or otherwise untrusted selected input/group
cannot gain authority. Failure is `applicable:false`, never a partial allow.

**I3 — exact current evidence**
A historical effect cannot authorize a mapping row unless its canonical target and canonical Evidence ref exactly match
the row that is current in the selected mapping artifact. Input-ID equality alone is insufficient.

**I4 — narrow positive paths**
`visual-refresh` can positively authorize only `{roles.screen}` and `{roles.domain_component}` for the selected screen
context. No broad `src/**` fallback is a positive candidate.

**I5 — non-waivable denies win**
Tier3, custom, generated/do-not-edit, shared-surface, API Candidate, ownership, and every other existing deny remain
authoritative. The only waivable deny is the exact authored `{roles.screen}` work-step deny from `api-integrated-ui`,
and only for a path that independently passes the visual-refresh grant.

### 3.4 Selection is intentionally singular
The public v1 CLI does not add `--item`, `--effect`, or `--mapping-key` selectors. Therefore the selected input must
yield exactly one eligible authorizing item group for the selected screen and exactly one distinct exact mapping key
within that group.
If zero or more than one eligible group or mapping key remains, the intent is inapplicable. The next action is to split
or refine the Stage 04 reconciliation so one invocation has one unambiguous exact target.
This rule avoids an implicit target chooser and avoids adding another public selector in v1.

## 4. CLI Contract

### 4.1 Canonical invocation

```bash
npm run workflow:readiness -- \
  --screen CREATE-ATTACH \
  --intent visual-refresh \
  --input IN-20260820-figma-003 \
  --path src/features/create/screens/CreateAttachScreen.tsx \
  --json
```

`--screen` and `--input` select the authorization context. `--path` selects the concrete file to allow or deny. The
existing canonical concrete-path rules continue to apply.

### 4.2 Required and optional selectors
For `--intent visual-refresh`:

- `--screen <SCREEN_ID>` is required;
- `--input <INPUT_ID>` is required;
- `--path <project-relative-file>` is required for an actual file allow/deny result;
- omitting `--path` is allowed only as an applicability inspection;
- `--surface` cannot be combined with the intent; and
- no `--app-shell` option is introduced.
An applicability-only call reports whether the selected evidence can form the narrow grant. It does not authorize any
file and does not expand the readiness path arrays.

### 4.3 Usage errors
The following are CLI usage errors and exit with code `2` before loading or mutating workflow artifacts:

- unknown intent value;
- blank `--intent`;
- `visual-refresh` without `--screen`;
- `visual-refresh` without `--input`;
- `--input` without an explicit intent;
- `--intent` combined with `--surface`;
- existing `--screen`/`--surface` selector conflicts;
- a blank or non-canonical concrete `--path`; and
- any existing unknown-option or malformed-value error.
Evidence, reconciliation, mapping, or authorization failure is not a usage error. Those cases return a normal result and
exit `0` with `applicable:false` or path `allowed:false`.

### 4.4 Intent output
Intent fields are emitted only when an explicit supported intent is supplied. A successful path check has this minimum
additional shape:

```json
{
  "intent_authorization": {
    "intent": "visual-refresh",
    "input_id": "IN-20260820-figma-003",
    "applicable": true,
    "mapping_key": "M-014",
    "evidence_ref": "input:IN-20260820-figma-003#extracted-facts/02",
    "checked_path": "src/features/create/screens/CreateAttachScreen.tsx"
  },
  "path_authorization": {
    "allowed": true
  }
}
```

The surrounding screen entry keeps the existing readiness fields. The exact free-text reason may evolve, but
`applicable`, the selected identifiers, and the final path `allowed` boolean are deterministic.
An evidence failure remains a normal result:

```json
{
  "intent_authorization": {
    "intent": "visual-refresh",
    "input_id": "IN-20260820-figma-003",
    "applicable": false,
    "mapping_key": null,
    "evidence_ref": null,
    "checked_path": "src/features/create/screens/CreateAttachScreen.tsx"
  },
  "path_authorization": {
    "allowed": false
  }
}
```

The implementation should include a focused reason and a next action, but v1 does not create a large public reason-code
taxonomy.

### 4.5 No-intent compatibility rule
The existing commands remain valid and unchanged:

```bash
npm run workflow:readiness -- --screen CREATE-ATTACH --json
npm run workflow:readiness -- --screen CREATE-ATTACH --path src/features/create/screens/CreateAttachScreen.tsx --json
```

Neither command may emit `intent_authorization`. Their existing field order, values, deny behavior, and exit semantics
are the regression baseline.

## 5. Evidence Applicability

### 5.1 Applicability is an all-of predicate
`visual-refresh` is applicable only when every condition below succeeds. The analyzer returns one result; it does not
accumulate partial authority from individually valid rows.

1. The selected ScreenSpec is the canonical active screen record.
2. The ScreenSpec has no existing structural or lifecycle hard error.
3. The fact ceiling reaches at least `final-fixture-ui`.
4. The Open Decision cap reaches at least `final-fixture-ui`.
5. The selected input artifact exists exactly once.
6. The selected input passes the existing Input Result hard contract.
7. The applicable Reconciliation Register declares Contract v2.
8. The selected input has exactly one Summary row.
9. That Summary row has `Reconcile Status=reconciled`.
10. Exactly one eligible Reconciliation Item group is selected under the singular-selection rule.
11. The selected group passes all existing RR/RP hard checks.
12. Every row in the selected group has `Basis=visual-evidence`.
13. Every row in the selected group has `Classification=simple-update`.
14. Every row's Effect is `update` or `create`.
15. Every row's Target is an exact current mapping-row target owned by the selected screen.
16. The group resolves to exactly one distinct mapping key.
17. Every row's canonical Evidence ref equals that mapping row's current canonical Evidence ref.
18. The selected row and the mapping structure required to resolve it pass the existing Mapping Provenance hard contract.
Any failure makes the whole intent inapplicable.

### 5.2 Selected-only hard validation
The analyzer evaluates hard trust for the selected records. An unrelated invalid input elsewhere does not automatically
invalidate this invocation.
The selected input is nevertheless invalid when a repository-level condition directly affects its identity or trust,
including a duplicate `input_id`. The same selected-only rule applies to the register group and mapping artifact.
This boundary is necessary to keep v1 implementable and is consistent with the accepted lack of a repository-wide
pending-input freshness proof.

### 5.3 Exact authorizing target
The only authorizing target grammar is:

```text
artifact:<screen-figma-mapping-id>#component-mapping/<M-ID>
```

The target must resolve in the current selected screen's `figma-component-mapping` artifact. The artifact's canonical
`screen_id` must equal `--screen`. The `<M-ID>` must exist as the current Component Mapping row key and have the
corresponding current Mapping Provenance row.
The following do not create authority in v1:

- `artifact:<mapping-id>` for the whole mapping artifact;
- `artifact:<mapping-id>#component-mapping` without a row key;
- a visual-consistency family target;
- a whole ScreenSpec or ScreenSpec section target;
- a component-gap-register target;
- an ambiguous, coarse, or unkeyed target;
- a mapping key absent from the current mapping artifact;
- a historical mapping row no longer current; and
- a retirement or tombstone target.

### 5.4 Exact current Evidence rule
Currentness is evaluated only at the exact mapping row. It is not inferred from a repository timestamp or Git history.
The grant predicate is:

```text
selected_effect.target == current exact mapping target
AND
canonical(selected_effect.evidence_ref) == canonical(current_mapping_row.evidence_ref)
```

Canonical comparison uses the existing input Evidence grammar. The input ID, section slug, and bullet index are all part
of identity.
Therefore:

```text
input:IN-X#extracted-facts/01
!=
input:IN-X#extracted-facts/02
```

If the current Mapping Provenance row is edited to point to another input or another bullet, the older reconciliation
effect naturally loses authority. No separate revocation ledger is required.
The arrival order of inputs for different mapping keys is not compared in v1.

### 5.5 Group atomicity
A selected group cannot mix an authorizing mapping update with another effect kind or target kind. Examples include a
mapping update plus a component-gap record, decision reopen, ScreenSpec update, or coarse mapping-section update.
The implementation must not allow only the mapping subset. The whole group becomes inapplicable. The next action directs
the author to split the work into exact Stage 04 item groups.
This preserves the existing reconciliation record while avoiding partial interpretation.

### 5.6 Applicability does not imply path authority
Passing the evidence predicate creates only a narrow positive candidate. The concrete path still has to pass role
classification, ownership, and every existing deny check. An applicability-only result is never permission to edit an
arbitrary path.

## 6. Path Authorization

### 6.1 Positive role candidates
A `visual-refresh` grant can positively match only these resolved roles for the selected screen context:

- `{roles.screen}`; and
- `{roles.domain_component}`.
The concrete path must match one of those resolved role surfaces directly. A broad current-mode allowance such as
`src/**` is not sufficient by itself.
The following are never positive candidates:

- `{roles.hook}`;
- `{roles.api_client}`;
- an API Candidate Slice Path;
- a delegated shared-surface path;
- a generated or do-not-edit path;
- a path owned by another screen or domain owner;
- policy, configuration, package, manifest, or repository-control paths; and
- a repository-root or `src/**` fallback that is not the selected role surface.

### 6.2 One narrow work-step waiver
At `api-integrated-ui`, the effective policy contains an authored `{roles.screen}` work-step deny. That deny exists to
keep API wiring focused.
For an applicable visual refresh, the helper may waive exactly that one matching deny claim when:

- its source mode is exactly `api-integrated-ui`;
- its authored policy token is exactly `{roles.screen}`;
- its resolved path matches the selected screen role;
- the concrete path is the checked path; and
- the intent grant has already passed the evidence predicate.
No literal path string is globally removed from `forbidden_paths`. The waiver is evaluated only for the one
authorization decision.
A domain-component path normally needs no screen-deny waiver because the authored `api-integrated-ui` deny targets
`{roles.screen}`. It still needs the explicit visual-refresh positive grant and must pass every other deny.

### 6.3 Preserve authored rule provenance internally
The policy/layout resolution seam must retain enough internal provenance to distinguish:

- source mode;
- authored token or authored literal;
- resolved concrete glob; and
- allow versus deny disposition.
This metadata is internal to authorization evaluation. It is not a new public deny schema, capability artifact, or
adoption authority.
The implementation must not infer waivability from resolved-string equality alone. Two deny rules can resolve to the
same path while having different meanings. Only the exact authored rule described in 6.2 is waivable.

### 6.4 Deny precedence
The authorization helper evaluates the applicable intent grant together with existing path restrictions. A same-path
non-waivable deny always wins.
This includes, without redefining their schemas:

- Tier3 restrictions;
- custom layout or policy restrictions;
- generated/do-not-edit restrictions;
- shared-surface delegation;
- API Candidate deferred, conflict, active-owner, and enforced-surface rules;
- other-screen or other-owner reservations; and
- any existing concrete-path canonicality failure.
The implementation must not short-circuit these checks merely because the evidence predicate is true.

### 6.5 Authorization algorithm
The minimal pure-helper sequence is:

1. Validate the concrete path with the existing canonical path rules.
2. Resolve the selected path's explicit screen/domain-component role match.
3. Evaluate the intent applicability result.
4. Collect the existing matching allow and deny reasons with internal authored provenance.
5. Mark only the exact `api-integrated-ui` authored `{roles.screen}` deny as conditionally waivable.
6. Retain every other matching deny.
7. Apply existing shared-surface, generated, API Candidate, and ownership checks.
8. Allow only when an intent-positive role remains and no non-waivable deny remains.
9. Return one deterministic authorization result to every caller.
This is an extension of the existing pure helper seam, not a generalized deny-claim platform.

### 6.6 Ordinary authorization remains authoritative without intent
When there is no explicit intent context, the helper follows its existing branch unchanged. It must not build a
synthetic visual grant or consider the screen work-step deny waivable.
This branch separation is the primary defense for invariant I1.

## 7. Forward/Backstop Parity

### 7.1 One pure decision
`workflow:readiness --path` and `workflow:forbidden-paths` must consume the same pure file-level authorization helper
result. Neither command may reimplement evidence matching, role matching, or deny precedence.
The current shared `readinessPathAuthorization` seam remains the integration point. Implementation may add an optional
visual intent context or delegate to one focused pure helper, but there must still be one final file decision.

### 7.2 Forward check
The forward readiness path check supplies:

- selected screen ID;
- selected input ID;
- computed readiness entry and internal caps;
- selected exact mapping key;
- exact current Evidence ref;
- concrete checked path;
- existing API Candidate claims;
- existing shared/ownership/generated/Tier3/custom restrictions; and
- the internal authored path-rule provenance needed for the one narrow waiver.
The returned `path_authorization.allowed` is the edit preflight result.

### 7.3 Diff backstop
The diff backstop evaluates each changed concrete path using the same selected screen/intent/input context and the same
helper. The diff source still comes from its existing `--diff`, range, staged, base, or local mechanisms.
The backstop does not discover a visual intent from the diff. An explicit selected context must be provided through the
direct command or existing workflow-run plumbing. A direct CLI implementation may mirror only `--screen`, `--intent`,
and `--input`; it must not add mapping-key, history, adoption, or approval selectors.
Deletion remains subject to the existing backstop semantics. Pure visual retirement authority is not added by this v1.

### 7.4 Packet and Report propagation
Packet and Report may copy only the minimum audit facts needed to explain the decision:

- selected input ID;
- selected mapping key;
- exact canonical Evidence ref; and
- checked concrete path.
They may also copy the final applicable/allowed booleans already produced by the helper. They do not recompute
authorization.
No authority digest, capability artifact, completion ledger, or historical scan is added.

### 7.5 Explicitly absent mechanisms
The forward and backstop path do not add:

- Git merge-base resolution;
- `--base-ref`;
- `visual-intent-adoption`;
- an authority digest;
- a pending visual uncertainty index;
- SHA-256 effect identity;
- an implementation completion ledger; or
- a repository-wide historical scan.

## 8. Accepted Limitations
The following are explicitly outside v1. Each item is either unsupported or reserved for later evaluation. No new
schema, table, artifact, or CLI is defined for these items here.

1. **Pure removal or retirement operations** — not supported in v1.
2. **Active/retired ledgers and tombstones** — not supported in v1.
3. **Visual-family member-level authority** — follow-up only.
4. **ScreenSpec Visual Evidence authority** — not supported in v1.
5. **An unkeyed resolution table** — not supported in v1.
6. **Legacy input grandfathering or an adoption artifact** — not supported in v1.
7. **A repository-wide pending visual input freshness gate** — follow-up only.
8. **Malformed input deny-only recovery** — not supported in v1.
9. **`impact_axes` metadata** — not added in v1.
10. **Meeting or user-note visual routing expansion** — follow-up only.
11. **Git history or base-ref approval** — not supported in v1.
12. **A human approval digest** — not supported in v1.
13. **Automatic code AST to mapping-key linkage** — follow-up only.
14. **Implementation completion tracking** — not supported in v1.
15. **Issue #223 app-shell authorization** — deferred to a separate effort.
A coarse or unkeyed reconciliation has no exact authorizing mapping key. Its result is therefore:

```text
visual-refresh applicable:false
next action: reconcile the item again in Stage 04 with an exact component-mapping row target
```

The implementation does not auto-approve, grandfather, repair, or reinterpret legacy or malformed records.
Other pending inputs may exist even when the selected intent is applicable. That accepted limitation must not be
converted into a new v1 merge blocker.

## 9. Implementation Slice

### 9.1 Slice A — selected evidence analyzer
Add one focused pure analyzer for the explicit visual-refresh context. It should reuse existing parsing and
hard-validation functions rather than copy their grammar.
Responsibilities:

- resolve the canonical active selected ScreenSpec;
- expose internal fact and decision ceilings without changing public no-intent output;
- locate the unique selected input artifact;
- determine selected-input hard validity;
- locate the applicable v2 Reconciliation Register;
- select one unambiguous eligible item group;
- reject mixed or multi-key groups;
- resolve the exact current mapping artifact and M-ID;
- compare canonical effect Evidence with current Mapping Provenance Evidence; and
- return a small immutable applicability context.
The analyzer must not mutate documents or workflow state.

### 9.2 Slice B — readiness CLI and output
Extend readiness argument validation with `--intent` and `--input`. Keep the existing no-intent execution branch intact.
For explicit visual refresh:

- run the selected evidence analyzer;
- emit `intent_authorization` only for the explicit intent;
- keep ordinary readiness fields and path arrays unchanged;
- call the shared path helper when `--path` is present; and
- return exit `0` for applicability or authorization denial.
Usage failures remain exit `2` and occur before repository artifact loading where the current CLI contract already
requires that order.

### 9.3 Slice C — authored path-rule provenance
Extend the internal policy/layout resolution seam so a resolved rule retains its source mode and authored token or
literal.
The minimum consumer is the visual-refresh path decision. No public serialization or standalone deny registry is
required. The implementation should preserve existing resolved string arrays for ordinary output.
A regression must prove that two denies resolving to the same path are not both waived when only one is the authored
`api-integrated-ui` `{roles.screen}` work-step rule.

### 9.4 Slice D — shared file authorization
Extend the existing pure path authorization flow with an optional, already-validated intent context.
The helper must:

- require an explicit screen/domain-component role match;
- support the one narrow screen work-step waiver;
- preserve all other deny precedence;
- preserve current API Candidate and shared-surface behavior; and
- return the same result to readiness and forbidden-paths callers.
Do not implement this by filtering a matching resolved string from `forbidden_paths`.

### 9.5 Slice E — backstop and propagation
Pass the selected context into `workflow:forbidden-paths` and existing workflow-run plumbing. Use the shared helper per
changed concrete path.
Update Packet and Report only to copy the four minimal audit facts and final booleans. No additional persistence
contract is required.

### 9.6 Slice F — focused tests and docs
Implementation tests should be added next to the existing readiness, path-backstop, forbidden-paths, reconciliation,
mapping-provenance, Packet, and Report regressions.
The implementation PR may update user-facing command/reference documentation and distributed payloads only as required
to ship the implemented CLI. That future implementation work is not part of this design-only PR.

### 9.7 Implementation order
Recommended order:

1. selected evidence analyzer and fixtures;
2. authored path-rule provenance;
3. optional intent branch in the shared path helper;
4. readiness CLI and output;
5. forbidden-paths parity;
6. Packet/Report propagation; and
7. focused compatibility and end-to-end regressions.
Each slice must keep the no-intent test suite green before proceeding.

## 10. Verification Matrix
The implementation is verified by the following twenty focused regressions. Cases intentionally combine overlapping
compatibility or deny checks to keep the matrix bounded.

| # | Scenario | Expected result |
|---:|---|---|
| 1 | No `--intent`, API-mode screen path, existing JSON/YAML snapshots | Existing screen forbid and no-intent output byte/shape meaning remain unchanged |
| 2 | `--intent visual-refresh` without `--input` | Usage error, exit `2`, no artifact mutation |
| 3 | Unknown or blank intent | Usage error, exit `2` |
| 4 | Selected input missing, duplicate, or Input Result hard-invalid | `applicable:false`, exit `0`, path denied |
| 5 | Register is v1, lacks v2 items, or has only a Summary projection | `applicable:false`, path denied |
| 6 | Selected Summary row is absent, duplicate, or `Reconcile Status != reconciled` | `applicable:false`, path denied |
| 7 | Selected item group has an RR or RP hard error | `applicable:false`, path denied |
| 8 | Selected group `Basis != visual-evidence` | `applicable:false`, path denied |
| 9 | Selected group `Classification != simple-update` | `applicable:false`, path denied |
| 10 | Any selected effect is outside `update|create`, or the group mixes another effect/target kind | Whole group `applicable:false`; no partial allow |
| 11 | Whole mapping, section-only, coarse, unkeyed, missing, or multi-key target | `applicable:false`; Stage 04 exact-target next action |
| 12 | Exact current mapping row and exact current Evidence; selected screen path; no other deny | `applicable:true`, screen path allowed |
| 13 | Same input ID but different Evidence section or bullet | `applicable:false` or path denied; input-ID equality does not authorize |
| 14 | Current Mapping Provenance now points to another input or bullet | Older selected input denied without a revocation ledger |
| 15 | Applicable evidence with a hook path | Denied; hook is never a positive visual-refresh role |
| 16 | Applicable evidence with an API-client or API Candidate Slice Path | Denied; existing candidate rules remain authoritative |
| 17 | Applicable evidence with generated/do-not-edit, delegated shared, or other-owner path | Denied by the existing restriction |
| 18 | Same concrete screen path also has Tier3 or custom non-waivable deny | Denied; only the exact work-step deny is waivable |
| 19 | Exact current evidence and selected domain-component path with no other deny | Allowed |
| 20 | Same selected context and changed path through readiness forward check and forbidden-paths backstop | Identical allow/deny result and provenance facts |

### 10.1 Compatibility assertions
The matrix must run alongside the existing `test:spec`, example state/readiness generation, example validation,
generated-output idempotency, and platform smoke coverage.
No-intent snapshots should cover both readiness without `--path` and readiness with a concrete `--path`. The test must
assert absence of `intent_authorization` when the intent is omitted.

### 10.2 Review closure criteria
Only these failures block merge of the v1 implementation:

- an I1 no-intent regression;
- direct authority from invalid or stale selected evidence;
- a positive path outside screen/domain-component roles;
- bypass of a non-waivable deny; or
- a forward/backstop mismatch.
The following are explicitly non-blocking follow-ups:

- whether another pending input exists;
- repository completeness for every legacy input;
- recovery of malformed external inputs;
- expansion to more visual source categories;
- pure removal or retirement; and
- app-shell authorization.
Review must not reopen this design to solve those follow-ups before the minimal v1 can be implemented and tested.

## 11. Issue #223 Deferred
Issue #223 is deferred until the Issue #222 minimal authorization helper has been implemented and verified in a separate
implementation PR.
This design does not define app-shell artifacts, shell roots, shell maturity, generic Candidate owners, shell Open
Decisions, or shell ownership contracts.
Issue #223 remains a separate future design and implementation concern.
