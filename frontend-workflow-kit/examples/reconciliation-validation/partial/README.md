# Partial reconciliation regression fixtures (#232)

These are synthetic authoring fixtures, not a consumer dogfood run and not proof that an agent understands natural-language coverage. Runtime files are created, changed between rounds, parsed and validated by `scripts/lib/reconciliation-partial.test.mjs`. Visual authority uses the existing real Git/CLI helpers in `scripts/lib/visual-refresh-boundary.test.mjs`, not mocked applicable/allowed booleans.

P19 authoring guidance is wired through the [canonical protocol](../../../docs/reference/input-reconciliation.md#partial-reconciliation-checkpoints), [Stage 04](../../../docs/reference/workflow-stages/04-reconcile-input.md), [deployed skill](../../../skills/reconcile-input/SKILL.md), repository-local skill, [rubric](../../../docs/reference/reconcile-review-rubric.md), [template](../../../templates/meta/reconciliation-register.template.md) and [upgrade notes](../../../docs/reference/upgrade-notes.md#partial-reconciliation-checkpoints-232). The P19 tests check these surfaces and repeated procedures without relaxing the existing distribution/router or decision-aware tests. Test definitions below are not an execution report; the PR records actual commands, CI results and unexecuted verification. Keep `Refs #232` while any required completion/verification criterion remains unmet.

## Intended checkpoint protocol

`partially-reconciled` means the current round's real document changes, gate raising and effect records are consistent, while identified input ranges remain unreconciled. It is warning-only in default and `--enforce` validation (`RR-LIFECYCLE-101`); v2 recommends `Result=pending` under the existing warning policy. It is not interrupted `in-progress`, `failed`, or a permission to implement the remaining input.

Read the same input's canonical Summary row, immutable input, accumulated Items and resume notes before resuming. Change that same row to `in-progress` before authoring; preserve the input ID, input bytes and supersedes. Append only real new effects, keeping previous Item IDs and historical effects intact. Summary Classification/Touched Artifacts/Created Items must project **all rounds**, not just the last round. Never add a fake update/record/link-evidence for an unread range or for editing the resume note itself. A resolved-decision conflict requires Conflict create-open and Decision reopen in the same Item and same round; a partial checkpoint cannot split the pair.

Place `## Partial Reconciliation Notes` **after** the canonical Summary and Items tables, with one input-ID heading per note. Record processed scope and evidence, unprocessed source pointers, stop reason, next entry action, and owner/linked task (or explicitly unassigned). Issue comments may be additional pointers, not the only resume instructions. The next session must compare notes with the immutable source and cumulative Items, and apply the existing decision-aware preclassification to the remaining scope; reading order is not an authority hierarchy.

Finish the current round only with coherent real effects, required gate raising, complete resume notes, hard errors 0, in-scope Critical/Major 0, provenance/scope/raise-only boundaries preserved, and state → readiness → validate run. Report **current scope finished / whole input unfinished / next scope**, not accepted or whole-input complete. If nothing was processed, use the existing not-started/in-progress/failed meanings instead of manufacturing a partial checkpoint. On failure preserve the failure reason and the remaining-scope notes.

When every input range is reviewed, classified and routed, set the same row to `reconciled` with the appropriate existing Result, and mark current pending scope as none (or label the old note historical). Open child decisions do **not** make a fully routed input partial; their gates remain owned by readiness. Do not automatically close/resolve them. A normal rerun of an already reconciled input still stops. New source content is a new snapshot/input, but splitting work on unchanged bytes is not.

`partially-reconciled`, even with `Result=accepted`, must not satisfy visual-refresh's exact `reconciled + accepted` and single-item requirements. Unrelated valid partial inputs must not globally block an eligible selected input; global structural errors must still block. General no-intent mode and path permissions remain governed by the existing canonical documents and policy, not a new partial-status allow/deny. Known real conflicts must use the existing Open Decision/gate-raising route rather than being hidden in pending notes.

Upgrade the runtime **before** using the new enum. Do not backfill all v1/v2 rows or bypass structured_since exemptions. An old row incorrectly marked reconciled despite unprocessed scope can be repaired only through explicit maintenance/human confirmation against the original input and effects: preserve ID/bytes/supersedes/effects, correct the same row and restore its notes. Do not globally downgrade reconciled rows or infer partial from open children. Consumer originals are not edited by this kit PR.

## Matrix and what each test establishes

| ID | Test / evidence boundary |
|---|---|
| P01 | v1 partial validator warning with input ID and resume guidance; real validate CLI JSON/exit. |
| P02 | P01 with enforce: lifecycle warning remains advisory. |
| P03 | v2 partial + pending + actual fixture update, refs and projection. |
| P04 | P03 with enforce and unchanged public warning object shape. |
| P05 | Invalid Target/Evidence/cells/projection/provenance, duplicate effect and missing structured Items remain hard. Mutations must actually change fixture bytes before checking the exact existing diagnostic. |
| P06 | Malformed YAML/input, duplicate input/Summary, missing header and invalid status remain hard. |
| P07 | in-progress and failed remain hard in v1/v2, default/enforce. |
| P08 | Missing row and not-started preserve default-warning/enforce-error. |
| P09 | Complete routing with original U-/D- still open is reconciled, not partial. |
| P10 | Three-fact immutable fixture: one real effect in round one, remaining two in round two; single Summary, cumulative Items and unchanged source bytes. |
| P11 | Another partial round preserves earlier Item IDs/effects; last-round-only projection is rejected. |
| P12 | Missing conflict/reopen pair or split Item IDs is rejected; a later repair does not retroactively validate the earlier checkpoint. |
| P13 | partial + accepted retains lifecycle and v2 Result warning; v1 free text remains valid. |
| P14 | Existing eligible visual fixture changed to partial: real forward and staged backstop reject pending/accepted with VR-RR-005. |
| P15 | Unrelated valid partial coexists with a real visual grant; duplicate-Summary control still globally rejects. |
| P16 | Fully reconciled multi-item visual input still fails VR-RR-008 in forward/backstop. |
| P17 | Register-only status change leaves actual no-intent readiness_mode/allowed_paths/forbidden_paths unchanged. No visual-only JSON field is assumed. |
| P18 | Pre-structured_since summary-only exemption and existing v1 corpus do not gain unrelated partial warnings. |
| P19 | Seven authoring surfaces, exact severity matrix, both skill/Stage04 retry branches, reference Flow/Code Change Gate/Skill Shape/Consumer Summary, Notes ordering/fields, canonical links, old completed stop, authority boundary and deployed raw.split('\n').length <=120. Existing distribution and #231 tests remain unchanged. |
| P20 | Missing prose notes remain outside the parser's hard schema; reviewer counterexamples below and in the rubric, not an automated semantic completeness claim. |

## P20 reviewer counterexamples

**P20-a — missing notes.** A valid partial Summary/Items pair with no resume note still produces the lifecycle warning, not a new natural-language hard error. The reviewer must reject it as a normal checkpoint: the next author cannot identify the remaining scope. Add source-backed processed/unprocessed pointers, reason, next action and owner/task information before approving the round. The parser-boundary test deliberately passes the structure to demonstrate this limitation, not to approve the authoring.

**P20-b — unidentified scope or hidden conflict.** “Finish the rest later” without source pointers is not an actionable resume note. A known contradiction cannot be relabeled unread to avoid a Conflict/Open Decision. Reject the checkpoint until remaining scope is identifiable and known required gate raising is coherent. Unread facts do not authorize speculative product decisions or fake Effects.

**P20-c — repeating completed work.** A resumed round that performs the already recorded update again, renumbers prior Item IDs, deletes old effects, overwrites Summary with only the latest round, or emits an invented update for pending work is not acceptable. Compare the original source, previous register/diff and actual artifact changes. Deterministic duplicate/projection checks catch declared inconsistencies, but a semantically duplicated update under a fresh ID still needs reviewer judgment.

The fixtures do not demonstrate an agent's decision-aware classification accuracy, semantic source coverage, correct owner assignment, or a real consumer session. Existing historical #202/#227 evidence and closure criteria are unchanged.
