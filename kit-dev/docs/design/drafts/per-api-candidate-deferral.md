# Per-API Candidate Deferral And Slice Ownership

Status: implemented draft
Issue: #210
Date: 2026-07-24

## Problem

The legacy `## API Candidates` bullet grammar has screen-wide confidence only.
One intentionally unresolved endpoint therefore lowers `api_confidence_min` for the
whole screen. Merely excluding a `deferred` row from that minimum would fail open:
`api-integrated-ui` would still expose broad hook/API-client globs, and the diff
backstop would still clear the whole API-client surface when any screen reached that
mode.

This design treats deferral as a path authorization contract:

```txt
candidate syntax
  → parsed gate facts + candidate provenance
  → per-screen effective allowed/forbidden paths
  → project-aware diff backstop using the same readiness output
```

## Authoring Contract

The legacy bullet grammar remains v1:

```md
- GET /coupons (confidence: confirmed)
```

Every v1 candidate is active. Its state/readiness output remains byte-compatible and
the historical broad hook/API-client authorization remains available.

The optional v2 grammar is one structured table:

```md
## API Candidates
| Method | Path | Confidence | Gate | Tracking | Slice Paths |
|---|---|---|---|---|---|
| GET | /create/attachments | confirmed | active | - | src/features/create/hooks/useAttachments.ts; src/api/create/attachments/** |
| GET | /stock/curations | candidate | deferred | unknown:U-CREATE-STOCK-001 | src/features/create/hooks/useStock.ts; src/api/create/stock/** |
```

All six columns occur exactly once. Selecting v2 means every concrete row owns one
or more semicolon-separated project-root-relative Slice Paths. `Gate` is
`active|deferred`; blank means `active`.

Deferred rows require either:

- `unknown:U-...`, resolving to an `open` Unknown in the same ScreenSpec; or
- `issue:#123`, syntax-checked locally without network access.

`deferred` accepts only `unknown|candidate`. `confirmed + deferred` is contradictory.

## Path Safety And Ownership

Slice Paths:

- use `/`, remain project-root-relative, and contain no absolute/drive prefix,
  empty segment, `..`, or blanket `src/**`;
- must be strictly narrower than a broad resolved `{roles.hook}` or
  `{roles.api_client}` surface; an exact file-bound role may be owned;
- are checked after domain/layout overrides are resolved;
- are not silently rewritten into another location.

Forbidden wins over allowed. Active/deferred overlap within one ScreenSpec is a
conflict. Any overlap between explicit v2 claims from different screens is also a
conflict, including active/active and deferred/deferred. Conflicted paths remain
forbidden until ownership is made disjoint.

Explicit deferred/conflict paths are projected into every screen's effective
`forbidden_paths`. This prevents a different legacy screen's broad allowance from
silently clearing an explicitly deferred slice.

## Facts And Mode

`api_confidence_min` remains the minimum across every candidate and preserves its
telemetry meaning.

V2 additionally emits:

- `api_actionable_confidence_min`: minimum of valid active candidates;
- `api_actionable_candidates_count`;
- `api_candidate_deferrals_valid`;
- actionable/deferred candidate provenance and ownership conflicts.

`api-integrated-ui` requires:

```yaml
- api_actionable_confidence_min == confirmed
- api_actionable_candidates_count > 0
- api_candidate_deferrals_valid == true
- state_matrix_complete == true
```

Legacy state files derive compatibility values from `api_confidence_min`, so their
readiness output does not change. `api_required:false` keeps its existing
no-API special case and still strips API-client edit authority.

All-deferred v2 screens cannot enter `api-integrated-ui`. Malformed v2 does not
force docs-only by itself, but the live gate cannot cross into API integration
because `api_candidate_deferrals_valid=false`.

## Forward Guard

At `api-integrated-ui`, a valid v2 screen replaces broad hook/API-client policy
allows with the union of its confirmed active Slice Paths. Deferred and conflicted
paths are explicit forbidden entries. Readiness also carries a structured
`api_candidate_authorization` block with endpoint, tracking, owner screen, and path
provenance.

Work Packet and Run Report Markdown/JSON copy that block and the narrowed
allowed/forbidden paths without re-deriving them.

## Diff Backstop

`workflow:forbidden-paths` consumes `computeReadiness()` output file by file:

1. a matching deferred/conflict claim is always a violation;
2. an explicit active claim passes only when its owning screen is at or above
   `api-integrated-ui` and its effective allowed/forbidden paths authorize the file;
3. an API-client write passes when at least one screen's effective authorization
   allows it; v2 screens require a matching active claim, while legacy screens keep
   broad compatibility;
4. non-API guarded surfaces retain the historical project-level clearance behavior.

Reasons name candidate endpoint, tracking reference, owner screen, and conflict
provenance. Rename/copy inspect only the new path. Windows separators are converted
before matching.

The pure `pathAuthorization()` helper is the single forbidden-over-allowed rule
used by the backstop.

## Validator Boundary

Validate check 15 is warning-only for:

- missing/duplicate v2 table columns or multiple candidate tables;
- invalid Gate/Confidence and `confirmed + deferred`;
- missing, unresolved, or closed-Unknown Tracking;
- missing, unsafe, broad, or out-of-layout Slice Paths;
- active/deferred and cross-screen ownership overlap.

Legacy bullet-only documents emit no check-15 warning. Check 15 does not become a
new hard gate and `--enforce` does not promote it. The independent live readiness
gate remains fail-closed.

## Migration

No migration is required for legacy screens.

To adopt v2 for one ScreenSpec:

1. replace all API candidate bullets in that section with exactly one v2 table;
2. assign Slice Paths to every row, not only deferred rows;
3. add an open local Unknown or issue reference for every deferred row;
4. run state, readiness, validate, and forbidden-paths against representative
   active/deferred diffs;
5. update Work Packets after readiness changes.

Do not mix v1 bullets and a v2 table in one section. Once a candidate-like table is
present, it is the contract and bullets are not an additional authorization source.

## Known Limits

- Legacy screens intentionally retain broad authorization for backward
  compatibility. They may authorize unowned API-client paths, but never override an
  explicit v2 deferred/conflict path.
- V2 narrowing is materialized directly in `allowed_paths` at
  `api-integrated-ui`. At `production-ready`, broad non-API policy paths cannot be
  subtracted with the current glob-only output shape; the diff backstop therefore
  enforces v2 active ownership for API-related files at that mode.
- A malformed row with no safe, recoverable Slice Path cannot project an exact
  project-wide forbidden path. Its owning screen still fails the live API gate and
  check 15 surfaces the defect.
- Tracking `issue:#N` is syntax-only by design; validator execution has no network
  dependency and does not check issue state.
- Shared-surface v2 rows receive parsing/path warnings and per-surface readiness
  facts, but cross-owner conflict analysis in this slice is defined for canonical
  screens. Shared surface implementation-path intersection remains the higher-level
  authorization boundary.

## Verification

Focused regressions cover legacy compatibility, four-active/one-deferred readiness,
all-deferred and malformed fail-closed behavior, layout overrides, same/cross-screen
overlap, active/deferred diffs, legacy cross-screen bypass prevention, Work
Packet/Run Report provenance, Windows separators, and rename/copy handling.
