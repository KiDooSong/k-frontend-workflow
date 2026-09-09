# Decision-aware reconciliation — synthetic review matrix

Issue #227. These are authored, privacy-safe examples, not an actual agent run,
consumer dogfood, or evidence of reduced review rounds. The canonical procedure is
[Decision-aware preclassification](../../../docs/reference/input-reconciliation.md#decision-aware-preclassification).
The executable examples live in
[decision-aware-reconciliation.test.mjs](../../../scripts/lib/decision-aware-reconciliation.test.mjs)
and are included in both `npm test` and `npm run test:spec`.

## Cases and verification strength

| ID | Scoped evidence / input | Expected disposition | Verification |
|---|---|---|---|
| T1 | AUTH-227 mobile v2 has a resolved local choice of non-blocking guest entry. QA reports blocked entry but asks for the same chosen behavior; reproduction is not verified. | Record reported implementation drift and Stage 05/06 follow-up in an actual ScreenSpec Notes update. Preserve the decision and Unknown; no new D-/C-/G-. | Executable before/after fixture: native v2 validation, exact changed-document set, original decision row preserved, native state/readiness cap unchanged. |
| T2 | A resolved Unknown U-LOAD in the relevant screen answers “retain the previous image while loading”; its linked, still-current product note supplies the answer, but the body has no corresponding rule. | Verify scope and actual answer, then distinguish body omission from an implementation defect. Add useful source-backed documentation only; do not create a new choice or close/reopen the resolved Unknown. | Reviewer example, not an automated natural-language classification test. |
| T3 | The current scoped decision explicitly says “no dedicated guest-entry copy”; implementation omits it. An intake note reports that absence. | Treat absence as compliance. Do not invent a Copy Key, mark a defect, create a conflict, or promote copy status. A useful new evidence note may be an actual artifact update; otherwise do not fabricate an update. | Reviewer example; existing Copy Keys and decision status must remain unchanged in an actual run. |
| T4 | AUTH-227 has no local decision answer; `decision_refs` reaches the global canonical D-GLOBAL-227 row with the same non-blocking choice. | Use the global row's actual choice and scope, not a local-body-only lookup. Add the real QA evidence note without reopening the global decision. | Executable fixture: native typed refs and v2 projection, resolved reference provenance visible in state, global file byte-unchanged, no unnecessary readiness cap. |
| T5 | A new requirement explicitly demands a mandatory blocking prompt on AUTH-227 mobile v2, contrary to current resolved D-GLOBAL-227. | Preserve the old non-blocking choice in C-227, create that Conflict open and reopen the canonical Decision in the same item. Do not choose the new option or resolve either row. | Executable fixture: native v2 validation and native readiness cap to rough-fixture-ui; negative test splits the paired effects into different items and expects routing rejection. |
| T6 | A historical web-v1 choice requires a prompt; a linked later record replaces it with non-blocking entry for mobile v2. The new input concerns mobile v2. | Follow the replacement and check actual scope. The older resolved string and similarly named IDs in another scope are not current authority. Unclear replacement evidence remains uncertainty, not a guessed selection. | Reviewer example; no history parser or new canonical history artifact is introduced. |
| T7 | A manually authored input has no producer hint and no decision log. Relevant current documents may be sufficient; alternatively, the validity of an old choice remains unproven. | Apply the same comparison. Log absence alone is neither a new decision nor a global gate. Where evidence is insufficient, use existing Unknown/INV-/VER- paths; add an Open Decision only when an implementation choice actually must be blocked. | T1/T4 execute without a history artifact. Insufficient-evidence and manual-input semantics remain reviewer checks, not an automated classifier claim. |
| T8 | An originally open Unknown or Open Decision receives a proposed answer with source evidence. | Keep unknown-answer/resolves-unknown or decision-answer/resolves-decision and link-evidence to the canonical typed target. Preserve open status and human ownership of closure. | Two executable fixtures validate existing routing, actual evidence additions, original open rows and state. |

## What the executable tests establish

The test writes isolated temporary canonical input/document/register trees. It
uses the existing input collector, target index, register parser and
`validateReconciliationV2`, and uses `buildState` / `computeReadiness` rather than
reimplementing readiness. As in the existing Open Decision tests, unrelated fact
ceilings are stubbed only in memory so the decision cap is isolated. This does
not promote the fixture documents or prove production readiness.

The non-conflict examples actually add useful Notes evidence. “Product behavior
unchanged” is not “no document changes”; `compatible-fact / simple-update /
update / artifact:AUTH-227-screen-spec#notes` describes that real edit, with no
Created Items. A negative fixture keeps the projection coherent but substitutes
`link-evidence`; the existing hard routing matrix must reject it. No new no-op
or drift enum is introduced.

These checks establish authored output structure, references, projections,
state preservation and native caps. They do **not** prove that an LLM searched
all decisions or correctly interpreted prose. T2/T3/T6 and the uncertain part of
T7 are small review examples, not recorded agent results. Do not label these
files `actual-llm-after`, compare them to human-final output, overwrite historical
runs, or claim #202 dogfood completion from these tests.
