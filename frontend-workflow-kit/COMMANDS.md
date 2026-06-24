# Commands

Run commands from the consumer repository root after copying the packed payload
to `tools/frontend-workflow/` and merging `package-scripts.template.json`.

## Daily Loop

```bash
npm run workflow:state
npm run workflow:readiness
npm run workflow:validate
```

- `workflow:state` reads `docs/frontend-workflow/` and writes `_meta/workflow-state.yaml` plus `_meta/screen-inventory.yaml`.
- `workflow:readiness` computes the highest allowed implementation mode per screen.
- `workflow:validate` checks frontmatter, manifests, routes, approval metadata, API candidates, and reconciliation structure.

## Useful Options

```bash
npm run workflow:state -- --docs docs/frontend-workflow --src src
npm run workflow:readiness -- --screen COUPON-001 --json
npm run workflow:validate -- --json
npm run workflow:doctor -- --root apps/mobile --src apps/mobile/src
```

Use `--root` when the project root is not the current working directory. Use
`--src` when source files live outside `src/`.

## Input Artifacts

```bash
npm run workflow:create-input -- --docs docs/frontend-workflow --from-json input.json
npm run workflow:create-input -- --docs docs/frontend-workflow --source planning --input-type planning --source-ref "planning://auth-copy" --title "Auth copy" --fact "Primary CTA copy is Sign in."
```

`workflow:create-input` turns normalized payloads into canonical
`inputs/{input_id}.md` files. It does not update the Reconciliation Register or
approve implementation.

## Generated Views

```bash
npm run workflow:route-tree
npm run workflow:nav-graph
npm run workflow:catalog
npm run workflow:route-cross-check
```

These commands produce read-only metadata under `docs/frontend-workflow/_meta/`
or compare existing metadata. They do not approve design decisions.

## Implementation Packets

```bash
npm run workflow:packet -- --screen COUPON-001
npm run workflow:run -- --screen COUPON-001
npm run workflow:report -- --packet docs/frontend-workflow/_meta/work-packets/WP-001.md
```

Packets consume readiness output. They do not close Open Decisions or mark
candidate facts as confirmed.

## Safety Checks

```bash
npm run workflow:forbidden-paths -- --diff changes.diff --docs docs/frontend-workflow
npm run workflow:forbidden-paths -- --diff changes.diff --docs docs/frontend-workflow --enforce
```

Without `--enforce`, path findings are reported without failing the command.

## Lint Adoption

```bash
npm run workflow:lint-gen
npm run workflow:lint-gen -- --check
npm run workflow:lint-baseline -- --counts docs/frontend-workflow/_meta/lint-counts.json
npm run workflow:lint-baseline -- --counts docs/frontend-workflow/_meta/lint-counts.json --enforce
```

Start from `templates/meta/lint-policy.template.yaml`. Keep hard CI promotion a
separate human decision.