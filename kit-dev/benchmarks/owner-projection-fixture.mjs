// Deterministic synthetic corpus shared by the two owner-projection CLIs.
// No consumer documents or identifiers are used. A fixture is committed once;
// every measured invocation reads that same immutable tree.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export const OWNER = 'screen:BENCH-001';
export const DOCS = 'docs/frontend-workflow';
export const ENTRY = 'src/features/benchmark/screens/BenchScreen.tsx';
const HOST = `${DOCS}/domains/benchmark/screens/bench/screen-spec.md`;
const ZERO = `sha256:${'0'.repeat(64)}`;
export const hash = (value) => createHash('sha256').update(value).digest('hex');
export const environment = (extra = {}) => ({ ...process.env,
  GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_SYSTEM: os.devNull, GIT_CONFIG_GLOBAL: os.devNull,
  GIT_ATTR_NOSYSTEM: '1', GIT_OPTIONAL_LOCKS: '0',
  GIT_AUTHOR_NAME: 'Synthetic Benchmark', GIT_AUTHOR_EMAIL: 'benchmark@example.invalid',
  GIT_COMMITTER_NAME: 'Synthetic Benchmark', GIT_COMMITTER_EMAIL: 'benchmark@example.invalid',
  GIT_AUTHOR_DATE: '2026-11-19T00:00:00Z', GIT_COMMITTER_DATE: '2026-11-19T00:00:00Z', ...extra });
export const git = (root, ...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8',
  env: environment(), maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const table = (headers, rows) => [`| ${headers.join(' | ')} |`, `|${headers.map(() => '---').join('|')}|`,
  ...rows.map((row) => `| ${row.join(' | ')} |`)].join('\n');
const md = (fm, body) => `---\n${JSON.stringify(fm)}\n---\n\n${body}\n`;
const inputId = (i) => `IN-20261119-meeting-${String(i + 1).padStart(4, '0')}`;
const inputRef = (i) => `input:${inputId(i)}#extracted-facts/01`;

export async function createFixture(kit, root, config) {
  assert.equal(fs.existsSync(root), false, 'refuse to replace an existing fixture');
  const lib = (name) => import(pathToFileURL(path.join(kit, 'scripts/lib', `${name}.mjs`)).href);
  const [{ REQUIRED_REGISTER_COLS }, { REQUIRED_ITEM_COLS }, { loadLayoutProfile }, { buildState }] = await Promise.all([
    lib('reconciliation-register'), lib('reconciliation-items'), lib('layout-profile'),
    import(pathToFileURL(path.join(kit, 'scripts/workflow-state.mjs')).href),
  ]);
  const sizes = new Map();
  const put = (name, value) => {
    const file = path.join(root, name); fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, value); sizes.set(name, Buffer.byteLength(value)); return file;
  };
  put('.kit/policy.yaml', fs.readFileSync(path.join(kit, 'policies/implementation-mode-policy.yaml')));
  put('.kit/manifest.yaml', JSON.stringify({ version: 1, artifacts: {} }));
  const layoutFile = put('.kit/layout.yaml', JSON.stringify({ roles: {
    route_entry: 'src/app/**', screen: 'src/features/{domain}/screens/**',
    domain_component: 'src/features/{domain}/components/**', hook: 'src/features/{domain}/hooks/**',
    api_client: 'src/api/**', test: 'src/features/{domain}/tests/**',
  } }));
  put('.kit/adoption.yaml', JSON.stringify({ work_execution: { version: 1, owners: [OWNER],
    profiles: ['visual', 'behavior'], role_limits: {
      visual: ['screen', 'domain_component', 'hook', 'test'],
      behavior: ['screen', 'domain_component', 'hook', 'api_client', 'test'],
    }, deny_paths: [] } }));
  put('frontend-workflow.config.yaml', 'version: 1\npolicy_overlay: .kit/adoption.yaml\n');
  put(`${DOCS}/app/navigation-map.md`, '---\nstatus: draft\n---\n\n# Navigation Map\n');
  put(`${DOCS}/design/component-catalog.md`, '# Component Catalog\n');
  put(ENTRY, 'export default null;\n');
  put(`${DOCS}/domains/benchmark/rules/domain-rules.md`, md({ artifact_id: 'BENCH-RULES',
    artifact_type: 'domain-rules', domain: 'benchmark', status: 'confirmed',
    approved_by: 'synthetic-test-owner', approved_at: '2026-11-19', decision_id: 'synthetic-fixture-rules' },
  '## Rules\n\nPreserve the displayed synthetic result.\n\n## Later\n\nPreserve the captured source context.'));
  const unitIds = Array.from({ length: config.units }, (_, i) => `unit-${String(i + 1).padStart(2, '0')}`);
  const units = unitIds.map((id, i) => ({ id, kind: 'behavior',
    contracts: [i === config.units - 1 ? 'artifact:BENCH-RULES#later' : 'artifact:BENCH-RULES#rules'],
    sources: i === config.units - 1 ? [{ input_id: inputId(0), items: ['01'], source_refs: [inputRef(0)] }] : [] }));
  const decisions = Array.from({ length: Math.ceil(config.rows / 2) }, (_, i) =>
    [`D-BENCH-${String(i + 1).padStart(4, '0')}`, `Synthetic historical choice ${i + 1}`, 'choice-a / choice-b', 'final-fixture-ui', 'PM', 'resolved']);
  const unknowns = Array.from({ length: Math.floor(config.rows / 2) }, (_, i) =>
    [`U-BENCH-${String(i + 1).padStart(4, '0')}`, `Synthetic historical question ${i + 1}?`, 'resolved']);
  const bindings = decisions.slice(0, 2).map(([decision_id]) => ({ owner: OWNER, decision_id,
    known_units: unitIds, blocks: [], basis_digest: ZERO, approval_ref: 'review:synthetic-unverified' }));
  put(HOST, md({ artifact_id: 'BENCH-HOST', artifact_type: 'screen-spec', screen_id: 'BENCH-001',
    domain: 'benchmark', route: '/benchmark', status: 'draft', api_required: false, screen_entry: ENTRY,
    work_execution: { version: 1, units }, decision_work_scopes: { version: 1, bindings } },
  `## Notes\n\nSynthetic owner-projection corpus.\n\n## Open Decisions\n\n${table(['ID', 'Decision Needed', 'Options', 'Blocking Mode', 'Owner', 'Status'], decisions)}\n\n## Unknowns\n\n${table(['ID', 'Question', 'Status'], unknowns)}`));
  const summaries = [], items = []; let inputBytes = 0;
  for (let i = 0; i < config.inputs; i++) {
    const id = inputId(i), ref = inputRef(i);
    const body = `## Extracted Facts\n\n- Preserve synthetic captured result ${i}.\n\n## Inventory\n\n` +
      table(['Item', 'Behavior'], Array.from({ length: 16 }, (_, n) =>
        [`control-${i}-${n}`, `Preserve state ${i}/${n} while loading.`])) + '\n\n## Notes\n\n';
    let value = md({ input_id: id, input_type: 'meeting', source_type: 'meeting', source_ref: `meeting:benchmark-${i}`,
      captured_at: '2026-11-19T00:00:00Z', captured_by: 'synthetic-benchmark', status: 'captured',
      affected_domains: ['benchmark'], affected_screens: ['BENCH-001'] }, body);
    const padding = 'Stable synthetic captured source prose. ';
    const size = Math.max(value.length + 1, config.inputBytes);
    value += padding.repeat(Math.ceil((size - value.length) / padding.length));
    value = value.slice(0, size - 1) + '\n'; inputBytes += Buffer.byteLength(value);
    put(`${DOCS}/inputs/_multi/${id}.md`, value);
    summaries.push(i === 0 ? [id, 'meeting', 'simple-update×1', 'partially-reconciled', 'pending', 'artifact:BENCH-RULES', '-', '-']
      : [id, 'meeting', 'reject-input', 'reconciled', 'rejected', '-', '-', '-']);
    items.push(i === 0 ? [id, '01', 'compatible-fact', 'simple-update', 'update', 'artifact:BENCH-RULES#later', ref, 'inherit', 'statement', 'inherit']
      : [id, '01', 'reject', 'reject-input', 'reject', '-', ref, 'inherit', 'statement', 'inherit']);
  }
  put(`${DOCS}/_meta/reconciliation-register.md`, md({ reconciliation_contract: 2,
    review_profile: 'reconcile-stage04-v1', structured_since: '2026-11-19T00:00:00Z' },
  `${table(REQUIRED_REGISTER_COLS, summaries)}\n\n## Reconciliation Items\n\n${table(REQUIRED_ITEM_COLS, items)}`));
  const layout = loadLayoutProfile({ kitRoot: root, flags: { layout: layoutFile } });
  put(`${DOCS}/_meta/workflow-state.yaml`, JSON.stringify(buildState({ docsDir: path.join(root, DOCS),
    srcDir: path.join(root, 'src'), date: '2026-11-19', layout, projectRoot: root }).state));
  git(root, 'init', '--quiet', '--object-format=sha1');
  for (const [key, value] of [['maintenance.auto', 'false'], ['gc.auto', '0'], ['core.autocrlf', 'false'], ['core.filemode', 'true']]) git(root, 'config', key, value);
  git(root, 'add', '-A'); git(root, 'commit', '-qm', 'Synthetic shared owner-projection benchmark');
  return { root, config, owner: OWNER, unit_ids: unitIds, decision_rows: decisions.length, unknown_rows: unknowns.length,
    declared_decision_bindings: bindings.length, commit: git(root, 'rev-parse', 'HEAD'), tree: git(root, 'rev-parse', 'HEAD^{tree}'),
    tracked_files: sizes.size, tracked_bytes: [...sizes.values()].reduce((a, b) => a + b, 0), input_bytes: inputBytes };
}

export function repositoryState(root) {
  const files = execFileSync('git', ['ls-files', '-z'], { cwd: root, env: environment(), maxBuffer: 64 * 1024 * 1024 })
    .toString('utf8').split('\0').filter(Boolean);
  const digest = createHash('sha256');
  for (const name of files) {
    const file = path.join(root, name), stat = fs.lstatSync(file);
    digest.update(JSON.stringify([name, stat.mode & 0o777])).update('\0')
      .update(stat.isSymbolicLink() ? fs.readlinkSync(file) : fs.readFileSync(file)).update('\0');
  }
  return { commit: git(root, 'rev-parse', 'HEAD'), tree: git(root, 'rev-parse', 'HEAD^{tree}'),
    index_sha256: hash(fs.readFileSync(path.join(root, '.git/index'))), contents_sha256: digest.digest('hex'),
    status: git(root, 'status', '--porcelain') };
}
