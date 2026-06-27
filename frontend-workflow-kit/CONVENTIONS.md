# Consumer Conventions

## Payload Boundary

The source of truth for vendored files is `distribution-manifest.yaml`. Use the
packed output, not the full kit repository directory.

Included by default:

- `scripts/`, `catalog/`, `policies/`, `presets/`, `schemas/`
- `templates/`, `skills/`, `docs/reference/`
- `package.json`, `package-lock.json`, `package-scripts.template.json`
- `README.md`, `COMMANDS.md`, `CONVENTIONS.md`, `distribution-manifest.yaml`, `LICENSE`

Excluded by default:

- `examples/`
- `temp/`
- `docs/design/`
- `docs/workflows/`
- roadmap/history/run-report/proposal/generated diagnostic files

`docs/reference/input-reconciliation.md` is consumer-facing because it defines
the input artifact contract, Reconciliation Register schema, retry behavior, and
validate check 12 severity.

`templates/repo/AGENTS.template.md` is the short root guide to copy as
`AGENTS.md` or `CLAUDE.md`. Keep startup guidance there, project-specific policy
rules in `docs/frontend-workflow/global/llm-rules.md`, task routing in
`docs/reference/task-artifact-matrix.md`, and regeneration rules in
`docs/reference/generated-files.md`.

## Project Layout Profiles

Default Expo-like project:

```bash
npm run workflow:state -- --docs docs/frontend-workflow --src src
npm run workflow:validate -- --docs docs/frontend-workflow --src src
```

Monorepo or custom source root:

```bash
npm run workflow:state -- --root apps/mobile --src apps/mobile/src
npm run workflow:doctor -- --root apps/mobile --src apps/mobile/src
```

When the layer model differs from the default, copy
`templates/adoption/project-layout.template.yaml`, adapt it, then pass
`--layout project-layout.yaml` to state/readiness/validate/doctor commands that
need project structure.

## Thin Route, Separate Screen

Keep route files thin when possible. The route entry should import a screen from
the feature or presentation layer and pass only route params or app shell state.
Screen implementation work should happen in the screen/component layer allowed
by readiness.

ScreenSpec fields serve different purposes:

- `route_entry`: router/framework shell or route file.
- `screen_entry`: product screen implementation.

Do not infer one from the other when a project uses custom roots or generated
routes. Use `workflow:route-tree`, `workflow:nav-graph`, and
`workflow:route-cross-check` as read-only evidence.

## Screen Identity And Source Map

Canonical screen identity (`screen_id`, `route`, `domain`, screen-spec path) is workflow-owned.
External source codes — planning Figma codes, design Figma codes, Figma node ids, slugs — are
aliases, not identity. They drift, duplicate, disappear, and get copied across screens.

Map source codes to canonical Screen IDs in the Screen Source Map
(`docs/frontend-workflow/_meta/screen-source-map.md`, from
`templates/meta/screen-source-map.template.md`). Resolve mapping before creating or editing a
ScreenSpec. When identity is confirmed, scaffold a stub with `workflow:create-screen`.

- Do not invent a canonical `screen_id` from a source code. Ambiguous mapping is `scope-unclear`
  and, when it blocks work, an Open Decision.
- One source code maps to multiple canonical screens only with `split` (intentional) status.
- Route hints are evidence, not identity. The same route may belong to a different screen.

See [docs/reference/screen-identity.md](docs/reference/screen-identity.md) for the contract and examples.

## API Contract Styles

Document API candidates in `api/api-manifest.md` before treating a screen as
API-integrated. Confirmed rows can link these contract kinds:

- `zod`: exported runtime schema evidence.
- `ts-type`: exported TypeScript type/interface evidence, not runtime validation.
- `openapi`: OpenAPI/manual schema evidence when supported by the project.
- `manual`: reviewed manual contract evidence.
- `unknown`: tracking/compatibility value; it does not satisfy confirmed evidence.

Existing `Linked Schema` rows remain zod-compatible legacy evidence.

## Input Reconciliation

`workflow:create-input` belongs to the kit. Source-specific parsing belongs to
the consumer repo. Reconciliation is separate and does not run automatically
when an input artifact is created.

One `input_id` has one canonical Reconciliation Register row. Retrying the same
input updates that row; a new `input_id` is only for changed input content or a
new source snapshot.

## Tier3 Layers

Tier3 layers are supported through `project-layout.yaml`, not by editing
readiness code. Declare custom roles and access rules there, run
`workflow:doctor`, and keep policy changes as reviewed documents until the team
accepts them.

Policy draft and migration guide output is review evidence. It does not replace
`policies/implementation-mode-policy.yaml`, promote CI, or enable hard gates.

## Existing Adopters

If a previous setup copied the full `frontend-workflow-kit/` directory into
`tools/frontend-workflow/`, it is safe to remove dev-only material there:
`examples/`, `temp/`, `docs/design/`, `docs/workflows/`, roadmap files, and run
reports. Keep the included files listed above and use packed output for future
updates.
