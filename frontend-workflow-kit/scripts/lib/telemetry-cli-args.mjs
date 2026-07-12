// telemetry-cli-args.mjs — public workflow:telemetry option syntax allowlist.
//
// Keep this as the single source consumed by both the CLI boundary and its
// table-driven contract tests. Semantic dependencies between valid options
// remain owned by scripts/telemetry.mjs.
export const TELEMETRY_VALUE_FLAGS = new Set([
  'root',
  'docs',
  'src',
  'out',
  'check',
  'determinism-runs',
  'include',
  'surface',
  'visual-domain',
  'visual-screen',
  'visual-contract',
  'adoption-run',
  'adoption-summary',
  'redteam-include',
  'redteam-case',
  'doc-drift-include',
]);

export const TELEMETRY_BOOLEAN_FLAGS = new Set([
  'json',
  'list-surfaces',
  'skip-visual-bootstrap',
  'skip-visual-consistency',
  'skip-adoption-visual',
  'help',
]);
