# Issue #202-C dogfood evidence bundle

Canonical report: [`../issue-202-reconciliation-dogfood-001.md`](../issue-202-reconciliation-dogfood-001.md)

- `corpus-before/`: frozen semantic-drift candidates and negative controls
- `corpus-after/`: source-backed correction used for stop-condition replay
- `outputs/`: baseline/treatment JSON outputs
- `replay.sh`: two-worktree replay command
- `SHA256SUMS`: tracked corpus/output manifest

The routing positive is an anonymized structural reconstruction of the maintainer-recorded LRN-0017 finding family; it is not a copy of private consumer prose. The stale Result positive is a v2 replay of the tracked `reconcile-input-001` S5 finding and `reconcile-input-002` correction.
