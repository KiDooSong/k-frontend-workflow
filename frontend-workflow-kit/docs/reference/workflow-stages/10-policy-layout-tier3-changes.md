# Stage 10 — Policy / layout / Tier3 changes

The side stage for project-structure and policy boundaries. You drop into it from
anywhere and return to 07/08. Index: [`../workflow-spine.md`](../workflow-spine.md).
Conventions: [`../../../CONVENTIONS.md`](../../../CONVENTIONS.md).

**Enter when** `project-layout.yaml`, custom layers, or policy boundaries change.

**Skip this stage when** no boundary change is involved.

## Scope

- **project-layout** (`project-layout.yaml`) — layer roles, globs, source roots.
  Tier3/custom layers are declared here, not by editing readiness code. Start from
  [`../../../templates/adoption/project-layout.template.yaml`](../../../templates/adoption/project-layout.template.yaml).
- **layers / access boundaries** — `layers:` declarations and layer inventory.
- **policy** — implementation-mode policy. Changes are handled as **review drafts**,
  not live replacement.

## Draft, do not replace

```bash
npm run workflow:doctor -- --root <root> --src <src>      # inspect layout
npm run workflow:policy-draft -- --out docs/frontend-workflow/_meta/policy-drafts
```

Policy draft and migration output is **review evidence**. It does not replace
`policies/implementation-mode-policy.yaml`, promote CI, or enable hard gates. Those
promotions are human-owned ([09](09-human-decision-gates.md)). Report the four
states separately: readiness access wired / policy draft generated / live policy
not replaced / hard gate not promoted.

## After this stage — next

→ [07](07-regenerate-derived-views.md) to refresh layer-inventory / affected views
(`workflow:state`), then → [08](08-validate-and-report.md). Per-task follow-ups:
[`../task-artifact-matrix.md`](../task-artifact-matrix.md).
