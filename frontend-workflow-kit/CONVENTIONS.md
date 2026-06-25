# Consumer Conventions

## Payload Boundary

The source of truth for vendored files is `distribution-manifest.yaml`. Use the
packed output, not the full kit repository directory.

Included by default:

- `scripts/`, `catalog/`, `policies/`, `presets/`, `schemas/`, `templates/`, `skills/`
- `package.json`, `package-lock.json`, `package-scripts.template.json`
- `README.md`, `COMMANDS.md`, `CONVENTIONS.md`, `LICENSE`

Excluded by default:

- `examples/`
- `temp/`
- `docs/design/`
- historical workflow notes and roadmap files
- generated diagnostics unless a command writes them to an explicit output path

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
`--layout project-layout.yaml`.

## Thin Route, Separate Screen

Keep route files thin when possible. The route entry should import a screen from
the feature or presentation layer and pass only route params or app shell state.
Screen implementation work should happen in the screen/component layer allowed
by readiness.

## API Contract Styles

Use the TypeScript contract path when an API shape already has stable exported
types. Use the Zod/schema path when runtime validation is the project norm or
when the response shape is still being confirmed.

For either style, document candidates in `api/api-manifest.md` before treating a
screen as API-integrated.

## Tier 3 Layers

Tier 3 layers are supported through `project-layout.yaml`, not by editing
readiness code. Declare custom roles and access rules there, run
`workflow:doctor`, and keep policy changes as reviewed documents until the team
accepts them.

## Existing Adopters

If a previous setup copied the full `frontend-workflow-kit/` directory into
`tools/frontend-workflow/`, it is safe to remove dev-only material there:
`examples/`, `temp/`, `docs/design/`, historical workflow notes, roadmap files,
and run reports. Keep the included files listed above and use packed output for
future updates.
