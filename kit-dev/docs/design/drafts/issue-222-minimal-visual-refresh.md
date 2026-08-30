# Issue #222 minimal v1 — Evidence-bound Visual Refresh

Status: proposed minimal v1; implementation not started


Issue: #222


Baseline: `49a3a31029293eae3fd6765f75e2b5520f939a93` (`origin/main`)


Scope: one selected input authorizes one stable existing screen-entry modification.


Design-only; replaces the expanded draft.


## 1. Problem and Scope

### 1.1 Gap

`readiness_mode=min(fact_mode,decision_cap)` is a ladder.


`final-fixture-ui` permits screen work; `api-integrated-ui` denies `{roles.screen}` during API wiring.


Late exact Figma evidence has no narrow route.


`production-ready` or reopening a decision are not substitutes.


### 1.2 Decision

Add one explicit intent: `visual-refresh`.


It is not a mode and does not change the ladder.


It authorizes one exact existing file only.


### 1.3 Existing trust boundary

Reuse existing input, reconciliation, mapping, Fidelity, ScreenSpec, readiness, path, ownership, validation, review, and human-transition contracts.


Malicious Markdown or Git-history forgery is outside v1.


### 1.4 Non-goals

No global freshness, component/removal/new-file authority, ownership transfer, mandatory Fidelity, capability/history platform, or app-shell.


## 2. Safety Invariants

### 2.1 No-intent compatibility

No intent: all existing semantics and output stay unchanged.


### 2.2 One backstop context

One resolver returns `{records, source_tree, destination_tree, diff_kind}`.


Records and tree IDs are never resolved separately.


Outside files cannot grant.


### 2.3 Stable ownership

Backstop compares source→destination; forward compares `HEAD`→current view.


Tuple and owner set stay stable.


### 2.4 Visual readiness floor

Destination `fact_mode` and `decision_cap` are both at least `final-fixture-ui`.


Selected mapping is non-deprecated.


### 2.5 Supersession integrity

Selected input is the sole terminal leaf of its connected explicit component.


Forks, duplicate/malformed identities, conflicts, and cycles fail closed.


### 2.6 Accepted exact evidence

Summary is `reconciled + accepted`.


Effect and row resolve to one visible, in-range, non-empty bullet.


### 2.7 Input identity

Selected input is `status: captured`.


Legacy may omit `input_contract`; opt-in needs v2 and no chain `IF-*` issue.


Existing selected input is immutable; changes need new ID + `supersedes`.


### 2.8 Modification-only authority

Only `M <stable exact screen_entry>` can receive visual authority.


`A/R/C/T/D` never do; authorized-path deletion is a violation.


### 2.9 Deny precedence
Tier3/custom/generated/shared/Candidate/ownership denies win.

Only canonical built-in API-stage screen deny may waive.

### 2.10 Route separation
Authority documents use artifact validation; implementation uses file authorization.

Generated ownership is final; visual context has no unclassified-path `continue`.

### 2.11 Parity
Forward and backstop use one pure implementation-file helper.

Backstop adds checks but cannot broaden.

### 2.12 Accepted limitation
Only selected dependency is proven; unrelated inputs may remain.

## 3. Public CLI and Snapshot Contract
### 3.1 Readiness
```bash
npm run workflow:readiness -- \
  --screen CREATE-ATTACH \
  --intent visual-refresh \
  --input IN-20260820-figma-003 \
  --path src/features/create/screens/CreateAttachScreen.tsx \
  --json
```
`--screen` and `--input` are required.

`--path` authorizes a file; omission only inspects applicability.

### 3.2 Forward ownership baseline
Source is the selected worktree's `HEAD^{tree}`; destination is the current repository view.

Compare only authority-bearing ScreenSpec identity and exact owner set.

Current evidence may be read; dirty ownership cannot grant.

No `HEAD` means `applicable:false`, without fallback.

### 3.3 Backstop
```bash
npm run workflow:forbidden-paths -- \
  --screen CREATE-ATTACH \
  --intent visual-refresh \
  --input IN-20260820-figma-003 \
  --path src/features/create/screens/CreateAttachScreen.tsx \
  --staged --enforce
```
Incomplete/stray visual tuple exits `2` before load.

Mismatched valid path may report `applicable:true, allowed:false`.

### 3.4 Diff source mapping
| Source | Records | Source tree | Destination tree |
|---|---|---|---|
| `--staged` | index diff | `HEAD^{tree}` | index tree |
| `--range A..B` | two-dot | `A^{tree}` | `B^{tree}` |
| `--range A...B` | three-dot | merge-base tree | `B^{tree}` |
| `--base <ref>` | base-to-HEAD | exact diff-left tree | `HEAD^{tree}` |
| default local | branch-local | exact local merge-base tree | `HEAD^{tree}` |
| visual `--diff` | name/status only | unavailable | exit `2` |
Default local uses its actual merge-base.

Resolver returns records and trees together; no recompute/fallback.

### 3.5 Snapshot reads
Destination supplies all positive-authority inputs.

Source supplies ScreenSpecs, owners, tuple, and file identity.

Prefer pure derivation; never mix live `_meta`.

### 3.6 Option confinement
`--root` identifies one Git worktree realpath.

Authority options are canonical worktree-relative snapshot paths.

Absolute/escape/other-tree/live overrides exit `2`.

`--src` grants no visual authority and is never read live.

### 3.7 Built-in resources
Only omitted overrides may use bundled immutable resources.

Record package version/hash; no shadowing.

### 3.8 Output
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
  "path_authorization": { "allowed": true }
}
```
Intent fields are explicit-only; path cannot retarget.

## 4. Screen Authority Stability
### 4.1 Authority contexts
Backstop contexts come from the resolved diff pair.

Forward contexts are `HEAD` and current view.

Require equal ID, domain, lifecycle, and `screen_entry`.

### 4.2 Owner set
Canonical source path equals destination path.

Both owner sets equal `{selected_screen_id}`.

### 4.3 No self-claim
Path/ID/domain/lifecycle/owner changes cannot grant.

Owner-set change is inapplicable.

ScreenSpec body edits receive no visual grant.

### 4.4 Existing regular file
The path is a regular file in both authority contexts.

No role/route/search fallback.

## 5. Selected Input and Supersession Integrity
### 5.1 Canonical input
```yaml
status: captured
input_id: IN-20260827-figma-001
affected_domains: [auth]
affected_screens: [AUTH-LOGIN]
supersedes: IN-20260820-figma-003
```
Input ID is unique and Input Result hard trust passes.

Screen/domain are direct canonical members; aliases do not grant.

### 5.2 Fidelity single source
Use `parseInputContract(...).version == 2`; no invented parser.

Local shape uses `inspectInputFidelity` or its pure equivalent.

Chain uses `collectInputFidelityIssues(universe)` or pure equivalent.

Version parsing alone is insufficient.

### 5.3 Supersession observations
Collect input frontmatter `supersedes` and Register Summary `Supersedes`.

Normalize no-parent values; both observations must match.

No source is silently preferred.

### 5.4 Component integrity
Build before dropping duplicate identities.

IDs/edges resolve uniquely; connected defects remain.

Component is acyclic with selected as sole leaf.

Every selected-chain ancestor has exactly one successor.

### 5.5 Selected input operation
Source-absent `A` may add one unique ID.

Source-existing input is byte-identical and unchanged.

Existing input `M/R/C/T/D` violates; use new ID + `supersedes`.

### 5.6 Register and group
Register v2 has one trusted `accepted` Summary.

One group/key: visual-evidence, simple-update, update|create, exact target.

Mixed groups are inapplicable.

## 6. Mapping Provenance and Evidence Authority
### 6.1 Mapping contract
Mapping explicitly opts into contract v1 and is non-deprecated.

Missing/invalid contract or structural provenance error is inapplicable.

### 6.2 Exact target
Only `artifact:<mapping-id>#component-mapping/<M-ID>` authorizes.

Mapping `screen_id` equals selected screen; key comparison is exact.

Coarse/historical/unkeyed targets do not grant.

### 6.3 Evidence floor
Both refs resolve `ok` to one exact bullet.

Bullet is visible, in-range, non-empty.

Section-only and `/99` refs do not authorize.

### 6.4 Figma floor
Selected row has no `MP-103` contradiction.

Effect/row/mapping have compatible anchored Figma identity.

## 7. Exact Path and Deny Authorization
### 7.1 Exact path
`authorized_path` is the stable destination `screen_entry`.

Forward requires exact checked-path equality.

`{roles.screen}` is classification only and never expands the grant.

### 7.2 Logical provenance
Each rule retains source, authored/resolved path, disposition, origin, scope, and stable ID.

Rules are logical records; string equality is not identity.

### 7.3 Waiver
Only canonical built-in API-stage screen deny may waive.

Only proven preset mirror coalesces; other rules stay independent.

### 7.4 Generated ownership
Reuse generated-file result as final deny.

No second detector is introduced.

## 8. Backstop Record Routing
### 8.1 Preserve records
Preserve raw `A/M/R/C/T/D` before filters.

No visual record is skipped.

### 8.2 Routing order
1. Generated/do-not-edit final deny.
2. Exact selected-authority authoring closure.
3. Manifest-known authoring/output contract.
4. Every remaining path through ordinary selected-screen helper.
Route 4 is fail-closed; unclassified path is violation.

### 8.3 Authority closure
Closure is exact input/Register/mapping paths.

ScreenSpec is outside closure; broad docs permission is forbidden.

### 8.4 Authoring operations
New selected input: `A` only.

Existing selected input: no changed record.

Register/mapping allow valid `A|M`; other ops violate.

Generated ownership still denies.

### 8.5 Implementation operations
Only exact authorized `M` uses visual context.

Ordinary `allowed:false` is violation.

Authorized `A/R/C/T/D` receive no visual grant; authorized `D` explicitly violates.

### 8.6 Packet and Report
Transport selected IDs, trees, and paths as audit only.

Backstop always re-evaluates authority.

## 9. Accepted Limitations and Implementation Slice
### 9.1 Unsupported
Components, removal, families, unkeyed/legacy/global recovery, impact axes, history/digest/AST/completion, indirect scope, non-M ops, ownership transfer, visual `--diff`, app-shell.

### 9.2 Implementation order
1. One diff-context resolver returning records and both tree IDs.
2. Confined authority-bearing options.
3. Readiness floors and owner indexes.
4. Backstop source→destination and forward `HEAD`→current stability.
5. Input scope, captured status, real Fidelity APIs, and input immutability.
6. Full supersession component from both observations.
7. Contract v2 and Mapping v1 analyzers.
8. Logical deny provenance and generated ownership.
9. Pure implementation-file helper and fail-closed router.
10. Minimal Packet/Report audit fields and focused tests.
No public deny schema, authority artifact, or global ledger.

## 10. Verification Matrix and Review Closure
| # | Case | Expected |
|---|---|---|
| 1 | no intent | existing behavior and shape remain |
| 2 | missing tuple; visual `--diff` | exit 2 before authority load |
| 3 | staged/unstaged or range/checkout mix | only resolved context counts |
| 4 | default-local merge-base owner differs from HEAD | `applicable:false` |
| 5 | external/escaping override | exit 2 or no influence |
| 6 | fact/decision below final; deprecated mapping | `applicable:false` |
| 7 | backstop tuple/owner drift | `applicable:false` |
| 8 | forward `HEAD`→current tuple/owner drift | `applicable:false` |
| 9 | missing/non-regular entry; duplicate owner | `applicable:false` |
| 10 | non-captured or broken opted-in Fidelity | `applicable:false` |
| 11 | input scope mismatch; raw alias | `applicable:false` |
| 12 | supersession mismatch/fork/duplicate/cycle | structural ambiguity |
| 13 | non-accepted Summary or RR/RP error | `applicable:false` |
| 14 | missing Mapping contract; coarse/mixed target | `applicable:false` |
| 15 | exact row and concrete current Evidence | forward allow; exact `M` allow |
| 16 | empty/stale Evidence; `MP-103`; Figma conflict | inapplicable or deny |
| 17 | new input `A` + valid Register/mapping + screen `M` | may pass |
| 18 | existing selected input `M/R/C/T/D` | violation; new ID required |
| 19 | extra denied path or authorized `A/R/C/T/D` | violation; enforce exit 1 |
| 20 | same stable helper context | forward/backstop helper matches |
### 10.1 Merge blockers
Block: no-intent drift; snapshot/config/ownership drift; floor bypass; same-ID rewrite; Fidelity/supersession/Summary/Mapping/Evidence error; wrong path/op; skipped write; waived deny; parity failure.

### 10.2 Non-blocking follow-up
Unrelated inputs, legacy completeness, unrelated recovery, components, categories, removal, mandatory Fidelity, app-shell.

These do not expand v1.

## 11. Issue #223 Deferred
Issue #223 waits for a separate implemented and verified #222 PR.

No app-shell artifact, root, maturity, Candidate owner, decision, or ownership contract.

Normative scope remains Issue #222 only.

No Issue #223 state, body, comment, or follow-up issue is changed.
