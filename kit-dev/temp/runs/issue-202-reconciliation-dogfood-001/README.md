# Issue #202-C implementation replay bundle

Canonical report: [`../issue-202-reconciliation-dogfood-001.md`](../issue-202-reconciliation-dogfood-001.md)

Review-fix tree witness: `05200f61a15a8a27f49ac4267e4cf2063eb2cc8e` (summary trust, evidence reclassification, and temporary workflow cleanup).

Route-precision follow-up witness: `40e6e58ba9b9e2aac292c3635cdd0ac0377321fd` (fail-closed missing/ambiguous visible input IDs, whole-segment relative path/query/URI exclusion, broader marker-local polarity regressions, and uniquely indexed integration positive).

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
