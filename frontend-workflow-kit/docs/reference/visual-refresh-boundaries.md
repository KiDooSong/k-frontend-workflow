# Visual refresh boundary and audit transport

This reference supplements [implement-screen](../../skills/implement-screen/SKILL.md).
It does not grant permission or replace readiness/forbidden-paths. The selected
input, stable screen identity and snapshot authority chain remain authoritative.

## Canonical paths

A visual grant targets one stable, existing, canonical `screen_entry`. Source and
destination must resolve that exact repository-relative spelling without any
symlink/junction segment. A second spelling of the same physical file is not a
second authorized path. Case-only spelling differences are rejected, including
on case-insensitive filesystems.

The same path resolver protects generated manifest declarations and validate
check 6. Every generated/do-not-edit `path` and `outputs[].path` is checked before
ownership matching. A declaration with `.`, `..`, an empty segment, backslash,
absolute/drive path or control character is invalid; it is not silently folded
into a different path. Existing literal segments must match directory-entry
spelling and must not be symlinks. Glob traversal applies the same checks to
static segments after placeholders as well as before them.

Manifest patterns use the shared mini-glob contract: `*`, `?`, a whole-segment
`**`, and named single-segment placeholders such as `{domain}`. Brace alternation
is not supported. Brackets are literal filename characters, not character
classes. Concrete screen paths can retain literal bracket/brace route filenames.

Invalid manifest declarations produce a check-6 diagnostic in validate and a
configuration error (exit 2) in visual CLI evaluation. A valid generated output
with a generated header remains a final deny. `status: planned` describes the
generator's availability, not permission to edit the generated file. The
`generated` descriptive field cannot override `kind: generated` plus
`do_not_edit: true`.

## Normal negative results

An evaluator can return `intent_authorization.applicable: false` before it has a
full readiness entry: for example, no HEAD, missing selected input or screen, or
unavailable stable identity. This is not a malformed subprocess result.

The public `visual_refresh_audit` always carries the requested screen/input/path
and original reasons. Unknown authorized paths, readiness entries and tree IDs
stay null; the collector must not invent them. Packet records a non-executable
negative result, and Run stops at `HALT_AMBIGUITY` with exit 0 while retaining
`visual_prework.reasons` in JSON and status Markdown. No implementation is run.
Actual CLI, Git, resource or transport errors remain `HALT_TOOL_ERROR`/exit 2.

A positive pre-work result still requires the exact screen/input/authorized path/
checked path tuple and an explicit current `path_authorization.allowed: true`.
Saved readiness JSON cannot replace the visual evaluator. Packet audit is never
a reusable grant; the post-work backstop recalculates authority from its snapshot.

## Bounded child JSON capture

Visual Packet, Report and Run use `workflow-json-capture.mjs`. Child stdout and
stderr go to private temporary files rather than synchronous pipe buffers. Each
file is checked before it is read or parsed. The shared limit is **64 MiB per
child stream**, with a 120-second subprocess timeout. Temporary files are removed
after collection. This is a bounded read contract, not unlimited output support.

Transport failures carry structured `capture_error` / `tool_error` data. In
particular, `WF-JSON-OUTPUT-LIMIT` preserves `limit_bytes`, `observed_bytes` and
`stream`; truncated text is never interpreted as a successful authority result.
Report can record this as `forbidden.status: error` evidence, but Run must stop at
`HALT_TOOL_ERROR`. A real policy denial (`ok: false`) remains distinct: its
violations are evidence, not a newly promoted merge gate.

The outer report dispatcher continues streaming and remains import-safe.
Ordinary/no-intent child-capture behavior is not changed by this visual transport.

## Lossless changed-record audit

Backstop resolves tree OIDs once and obtains its records from that exact pair.
The audit contains every record, including changes outside the selected monorepo
root. Each single-path record carries `repository_path`, nullable `project_path`,
`outside_selected_root`, and an unchanged `repository_record`.

Rename/copy records preserve both `old_path_identity` and `new_path_identity`.
Each endpoint has the same repository/project/outside metadata. Report and Run
consume these records without issuing a second diff or dropping outside-root
entries. `Files Changed` marks outside-root records explicitly; it must not say
"none observed" merely because every changed path was outside the project.
An unavailable backstop record set is reported as unavailable, not an empty diff.

## Raw Git names and object snapshots

Git `-z` names are not user-entered operating-system paths. The visual resolver
never replaces backslashes, removes a leading `./`, trims, case-folds, or
Unicode-normalizes a repository name. Prefix removal matches only the original
`/` boundary. Unsupported names in captured trees or diff endpoints (including
literal backslashes, control characters, wildcard filenames, and non-UTF-8 names)
produce an explicit exit 2 before authorization. Rename/copy checks cover both
endpoints. No repaired name can inherit another file's exact-screen grant.

Snapshot materialization uses `ls-tree -r -t -z --full-tree` and raw OID-addressed
`cat-file --batch`, not `read-tree`/`checkout-index`. Blob bytes are binary and
hash-verified against their original OID. Replacement objects are disabled.
Current `.gitattributes`, smudge/textconv filters, `core.autocrlf`, EOL conversion,
and working-tree encoding do not rewrite the authority snapshot. Git reads keep
the 128 MiB per-invocation buffer bound; overflow aborts and removes the partial
snapshot rather than evaluating partial data.

Modes are preserved from the Git tree: `100644`/`100755` become regular files,
`120000` becomes an actual symlink (created last, never followed while writing),
and `160000` remains an opaque gitlink directory. Unsupported symlink creation or
physical filename collisions fail closed, never falling back to regular files.
The visual CLI independently checks the selected screen's original entry in
both snapshots: only regular blob modes may proceed. `git_screen_entries` records
the original tree, path, mode, type and object ID; a nonregular entry adds final
deny `VR-GIT-002` even if its materialized file appears regular. Forward retains
the documented authoring-doc overlay, but the screen's original Git mode cannot
be promoted by current worktree facts.
