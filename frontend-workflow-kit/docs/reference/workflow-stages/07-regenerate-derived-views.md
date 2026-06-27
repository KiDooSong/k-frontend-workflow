# Stage 07 — Regenerate derived views

Regenerate `generated/do_not_edit` outputs after their source changed. Index:
[`../workflow-spine.md`](../workflow-spine.md). Regeneration map:
[`../generated-files.md`](../generated-files.md).

**Enter when** source docs/code changed a generated output.

**Skip this stage when** no generated-view source changed.

## Rule

Generated files are derived views, never hand-edited. Update the source of truth
first (Stages 04–06), then run the **owning** command:

| Source that changed | Regenerate with |
|---|---|
| ScreenSpec frontmatter / parsed body | `workflow:state` |
| route files (`roles.route_entry`) | `workflow:route-tree` |
| nav edges / ScreenSpec interactions | `workflow:nav-graph` |
| shared UI primitives (`roles.ui_primitive`) | `workflow:catalog` |
| lint policy | `workflow:lint-gen` |
| layout/policy migration | `workflow:policy-draft -- --out <review-output-dir>` |
| API schema / codegen inputs | the repo's actual codegen command |

`workflow:check-generated` is an **advisory** drift guard (warning-first). It does
not overwrite committed files and must not be wired as a hard CI gate. See
[`../generated-files.md`](../generated-files.md) for the full map and
[`../task-artifact-matrix.md`](../task-artifact-matrix.md) for per-task triggers.

## After this stage — next

→ [08 Validate and report](08-validate-and-report.md). Report which generated files
were refreshed.
