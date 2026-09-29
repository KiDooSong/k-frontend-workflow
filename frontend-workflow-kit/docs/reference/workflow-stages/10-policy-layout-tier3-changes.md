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

## Narrow screen-scoped exceptions

A `layers:` entry with `scope.screen_ids` is an exception for a closed set of
canonical Screen IDs. It applies per Screen ID, so any other screen does not get
it. A shared surface gets it only when its complete `member_screens` set equals the
declared IDs. Readiness (`--path`, `forbidden-paths`), `--work`, visual refresh,
layer facts and the layer inventory all apply it this way. A policy draft leaves it
out because it is not a mode-wide rule.

```yaml
layers:
  - role: account_code_a_host        # a role of its own
    glob: src/features/account/screens/code-a-screen.tsx
    fact: dir_has_files
    scope:
      screen_ids: [ACCOUNT-CODE-A]
    access:
      allow: [api-integrated-ui]
      # Only when the mode already forbids a role that contains this exact file.
      # This drops that forbid entry for the listed screen; `allow` still limits
      # the editable path to the glob above.
      remove_forbidden:
        api-integrated-ui: ["{roles.screen}"]
```

- `remove_forbidden` is valid only on a screen-scoped layer. Each entry must equal
  a `forbidden_paths` entry as the policy or a layer writes it (for example
  `"{roles.screen}"`). An entry that matches nothing removes nothing.
- A screen-scoped layer needs a role of its own. A built-in layer role, or a role
  that another preset, project or domain layer declares, is a layout error.
- A `glob` naming one file counts that file (`dir_has_files`, layer inventory,
  `workflow:doctor`).
- Keep the glob exact and the removal list minimal. The layer is an exception to an
  existing mode boundary, not a way to reopen a domain role, and not a list of every
  unaffected screen. For code that two or more screens share, declare a
  [shared surface](../shared-surfaces.md) and put only that component's paths in
  its `implementation_paths`; host wiring stays screen-scoped.

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
