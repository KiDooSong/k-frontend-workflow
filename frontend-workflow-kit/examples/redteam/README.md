# Red-Team Fixtures

Adversarial sentinel fixtures consumed by `workflow:redteam` (a warning-first
observation report). These inputs are deliberately hostile - they exist to
witness fail-closed / backstop behavior and are NOT authoring examples.

- `path-backstop/diffs/guarded-api-write.txt` - a camouflaged guarded `src/api`
  write smuggled between allowed feature-path edits.
- `path-backstop/diffs/allowed-only.txt` - control diff touching allowed
  feature paths only (must stay silent).
- `path-backstop/diffs/malformed.txt` - corrupted name-status token
  (input-contract witness: forbidden-paths must exit 2, never fail open).

The project state consumed together with these diffs is the committed UNCLEARED
`examples/path-backstop/docs/frontend-workflow` fixture (no screen reaches the
api-integrated-ui clearance threshold). `workflow:redteam` never reads a live
git diff and never mutates committed fixtures. Because `examples/**` is not
vendored into consumer payloads, `workflow:redteam` reports these cases as
`skipped` (with a note) when the fixtures are absent.
