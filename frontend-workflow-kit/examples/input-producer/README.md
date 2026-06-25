# Input Producer Fixtures

These fixtures show the generic producer boundary:

```txt
source-specific producer
→ normalized producer payload
→ workflow:create-input
→ docs/frontend-workflow/inputs/{input_id}.md
→ reconcile-input
```

The kit-owned producer does not parse Figma/OpenAPI/meeting raw formats and does not edit the Reconciliation Register.

## CLI Flags: Planning Input

```bash
node ../../scripts/create-input-artifact.mjs \
  --docs docs/frontend-workflow \
  --source planning \
  --input-type planning \
  --source-type planning-doc \
  --source-ref "planning://auth-login-copy" \
  --captured-by "example-planning-producer" \
  --date 2026-06-25 \
  --domain auth \
  --screen AUTH-001 \
  --title "Auth login planning input" \
  --summary "Planning note updates the login copy." \
  --fact "Primary CTA copy is Sign in." \
  --target "AUTH-001 screen-spec" \
  --expected "classification: simple-update"
```

## JSON Payload: Visual Spec Input

```bash
node ../../scripts/create-input-artifact.mjs \
  --docs docs/frontend-workflow \
  --from-json payloads/visual-spec.json \
  --date 2026-06-25
```

## Supersedes

This fixture seeds `docs/frontend-workflow/inputs/IN-20260625-planning-001.md`.

```bash
node ../../scripts/create-input-artifact.mjs \
  --docs docs/frontend-workflow \
  --from-json payloads/supersedes.json \
  --date 2026-06-25
```

The producer creates `IN-20260625-planning-002.md` and writes `supersedes: "IN-20260625-planning-001"`.

## Negative Cases

Duplicate explicit `input_id` refuses overwrite by default:

```bash
node ../../scripts/create-input-artifact.mjs \
  --docs docs/frontend-workflow \
  --input-id IN-20260625-planning-001 \
  --from-json payloads/supersedes.json
```

Invalid enum exits `2`:

```bash
node ../../scripts/create-input-artifact.mjs \
  --docs docs/frontend-workflow \
  --from-json payloads/invalid-enum.json \
  --dry-run
```

Deprecated fields are not emitted: the rendered artifact uses `affected_domains` / `affected_screens`, body `## Summary`, and no `artifact_type`.
