# Issue #202-C implementation replay bundle

Canonical report: [`../issue-202-reconciliation-dogfood-001.md`](../issue-202-reconciliation-dogfood-001.md)

Witness sequence:

- initial precision review fix: `cd269fc98b48db9ab0fb039c003dd2efd3bdac42`
- prior route-precision witness: `40e6e58ba9b9e2aac292c3635cdd0ac0377321fd`
- prior clause-coupled route-precision witness: `b1624bcd4fab8e291b99176afba3f2a11a00a6f4`
- prior coordination-boundary/epistemic precision witness: `3de27895de4eadaed64329e115dccc9b40b96c48`
- prior symmetric leading-coordination/epistemic implementation/tests witness: `9cc8ba3a368a705001c6f15cd81803cb54e477ed`
- current structured-token semantic-view/relation-span implementation/tests witness: `fae71c31c136349a0e15a8425e1992a44906dcbc`
- report witness synchronization: `b63132ca5189edbace3ca6b8829347d196def214`
- reviewed implementation HEAD: `fae71c31c136349a0e15a8425e1992a44906dcbc`; subsequent documentation/metadata-only commits do not alter analyzer/tests

- `corpus-before/`: frozen implementation candidates and controls
- `corpus-after/`: corrected states used to verify warning silence
- `outputs/`: PR #216 baseline and stored treatment-snapshot JSON outputs
- `replay.sh`: two-worktree validator replay command
- `SHA256SUMS`: tracked corpus/output manifest

Evidence classification:

- routing R1: **synthetic structural positive (detector-shaped)** — not a historical/live TP
- routing controls: synthetic — not real-corpus FP evidence
- stale Result S1: **real historical upstream finding replay** from tracked reconcile-input runs
- stored `2 → 1`: modeled review replay, not an actual consumer review-round measurement

The bundle supports implementation wiring, warning-only severity, and correction silence. It does not satisfy Issue #202's remaining actual routing TP/FP/missed and review-convergence evidence requirement; PR #217 therefore uses `Refs #202` and the issue remains open.
