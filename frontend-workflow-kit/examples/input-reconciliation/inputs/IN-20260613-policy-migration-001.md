---
input_id: "IN-20260613-policy-migration-001"
input_type: "policy-migration"
source_type: "architecture"
source_ref: "adoption-probe/multilayer-001"
captured_at: "2026-06-13T00:00:00+09:00"
captured_by: "sample-policy-migration-input-skill"
status: "captured"
confidence: "candidate"
affected_domains: ["global"]
affected_screens: ["global"]
supersedes: null
---

# Input: Tier3 layer access migration draft

## Summary
Tier3 adoption probe proposes layer access boundaries for view_model and repository layers, plus generated review artifacts for policy migration. This input is a draft/review surface, not a live policy replacement.

## Extracted Facts
- `project-layout.yaml` includes `layers:` declarations for presentation view models and domain/data repositories.
- readiness access is wired from resolved layer access into allowed/forbidden path reporting.
- `implementation-mode-policy.draft.yaml` was generated as a review artifact.
- `implementation-mode-policy.migration.md` compares live policy and draft policy.
- live `policies/implementation-mode-policy.yaml` remains unchanged.
- CI hard gate, required check, and pre-edit hook enforcement are not promoted.

## Suggested Target Artifacts
- project-layout.yaml / `layers:` declarations
- layer-inventory
- readiness output
- implementation-mode-policy.draft.yaml
- implementation-mode-policy.migration.md
- Open Decisions / Conflicts if the input asks to replace live policy

## Expected Reconciliation
- classification: simple-update + conflict + new-decision
- Record that readiness access is wired and policy draft/migration artifacts exist.
- If the input proposes adopting draft policy as live policy, create Conflict + Open Decision instead of replacing the live policy.
- Keep generated review artifacts as draft/review artifacts only.

## Should Not Do
- Do not replace `policies/implementation-mode-policy.yaml`.
- Do not promote hard gates, CI, required checks, or pre-edit hook enforcement.
- Do not auto-resolve Open Decisions or promote confirmed status.
- Do not edit generated files directly.
