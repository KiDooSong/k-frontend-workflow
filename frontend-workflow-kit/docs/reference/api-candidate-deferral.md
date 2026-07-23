# API Candidate Deferral And Slice Paths

Use this contract when a screen has multiple API candidates and some contracts are
intentionally not actionable yet.

## Legacy v1

Existing bullets remain supported and every row is active:

```md
## API Candidates
- GET /coupons (confidence: confirmed)
```

No migration is required. Legacy screens keep their historical broad hook/API
client readiness paths.

## Structured v2

Opt in by replacing the section with exactly one six-column table:

```md
## API Candidates
| Method | Path | Confidence | Gate | Tracking | Slice Paths |
|---|---|---|---|---|---|
| GET | /create/attachments | confirmed | active | - | src/features/create/hooks/useAttachments.ts; src/api/create/attachments/** |
| GET | /stock/curations | candidate | deferred | unknown:U-CREATE-STOCK-001 | src/features/create/hooks/useStock.ts; src/api/create/stock/** |
```

- `Gate`: `active|deferred`; blank means `active`.
- `Tracking`: a deferred row requires `unknown:U-...` resolving to an `open`
  Unknown in the same ScreenSpec, or local syntax `issue:#123`.
- `Slice Paths`: `;`-separated project-root-relative paths/globs. Every row needs
  them, including active rows.
- Deferred confidence is `unknown|candidate`; `confirmed + deferred` is invalid.

Do not mix legacy bullets with the table. When a candidate-like table exists, it is
the complete authorization contract.

## Slice Path Rules

Each path must be strictly inside the resolved hook or API-client role for the
screen's domain/layout. Use `/`; do not use absolute/drive paths, `..`, empty
segments, backslashes, or blanket `src/**`. A broad role glob such as the whole
`src/api/**` is not a valid v2 slice.

Forbidden wins over allowed. Active/deferred overlap and cross-screen explicit
ownership overlap fail closed. A deferred path remains forbidden even when another
legacy screen has broad API integration authority.

## Runtime Meaning

For v2, `api-integrated-ui` requires at least one valid confirmed active candidate,
a complete State Matrix, and a valid deferral/ownership contract. Its API-related
`allowed_paths` are the active Slice Paths only; deferred/conflicted paths appear in
`forbidden_paths`.

`workflow:forbidden-paths` consumes the same effective readiness authorization.
With `--enforce`, a deferred/conflicted diff exits 1, while a valid active slice
owned by an API-integrated screen passes.

Validate check 15 reports v2 authoring defects as warnings. The warning surface is
not a hard-gate promotion; readiness remains the fail-closed live gate.

After editing this section, run:

```bash
npm run workflow:state
npm run workflow:readiness -- --screen <SCREEN_ID> --json
npm run workflow:validate
npm run workflow:forbidden-paths -- --diff <name-status-file> --enforce
```
