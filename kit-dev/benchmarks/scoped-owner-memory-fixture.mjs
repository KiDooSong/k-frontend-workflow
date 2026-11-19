// Synthetic single-owner corpus for #331. The final committed tree is shared by
// both runtimes; input/body density and unrelated artifacts are explicit knobs.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { environment, git, hash, repositoryState } from './owner-projection-fixture.mjs';

export { environment, hash, repositoryState };
export const DOCS = 'docs/frontend-workflow';
export const OWNER = 'screen:MEMORY-001';
export const TARGETS = ['src/features/memory/screens/MemoryScreen.tsx', 'src/api/memory/results.ts'];
const inputId = (n) => `IN-20261119-meeting-${String(n + 1).padStart(4, '0')}`;
const inputRef = (n) => `input:${inputId(n)}#extracted-facts/01`;
const md = (fm, body) => `---\n${JSON.stringify(fm)}\n---\n\n${body}\n`;
const table = (headers, rows) => [`| ${headers.join(' | ')} |`, `|${headers.map(() => '---').join('|')}|`,
  ...rows.map((row) => `| ${row.join(' | ')} |`)].join('\n');

export function request(denied = false) {
  const n = denied ? 1 : 0;
  return { version: 1, origin_inputs: [{ input_id: inputId(n), source_refs: [inputRef(n)] }],
    requests: [{ owner: OWNER, authority: 'scoped', unit: denied ? 'later' : 'known',
      targets: TARGETS.map((file) => ({ path: file, change: 'M' })) }] };
}

export async function createFixture(kit, root, config) {
  assert.equal(fs.existsSync(root), false, 'refuse to replace an existing fixture');
  const lib = (name) => import(pathToFileURL(path.join(kit, 'scripts/lib', `${name}.mjs`)).href);
  const [{ REQUIRED_REGISTER_COLS }, { REQUIRED_ITEM_COLS }, { loadLayoutProfile }, { buildState }, ast, { splitFrontmatter }] = await Promise.all([
    lib('reconciliation-register'), lib('reconciliation-items'), lib('layout-profile'),
    import(pathToFileURL(path.join(kit, 'scripts/workflow-state.mjs')).href), lib('reconciliation-markdown-ast'), lib('util'),
  ]);
  const sizes = new Map();
  const put = (name, value) => {
    const file = path.join(root, name); fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, value); sizes.set(name, Buffer.byteLength(value)); return file;
  };
  const write = (name, fm, body) => put(`${DOCS}/${name}`, md(fm, body));
  put('.kit/policy.yaml', fs.readFileSync(path.join(kit, 'policies/implementation-mode-policy.yaml')));
  put('.kit/manifest.yaml', JSON.stringify({ version: 1, artifacts: {} }));
  const layoutFile = put('.kit/layout.yaml', JSON.stringify({ roles: { route_entry: 'src/app/**',
    screen: 'src/features/{domain}/screens/**', domain_component: 'src/features/{domain}/components/**',
    hook: 'src/features/{domain}/hooks/**', api_client: 'src/api/**', test: 'src/features/{domain}/tests/**' } }));
  put('.kit/adoption.yaml', JSON.stringify({ work_execution: { version: 1, owners: [OWNER],
    profiles: ['visual', 'api-contract', 'behavior'], role_limits: {
      visual: ['screen', 'domain_component', 'hook', 'test'], 'api-contract': ['api_client', 'test'],
      behavior: ['screen', 'domain_component', 'hook', 'api_client', 'test'],
    }, deny_paths: [] } }));
  put('frontend-workflow.config.yaml', 'version: 1\npolicy_overlay: .kit/adoption.yaml\n');
  put(`${DOCS}/app/navigation-map.md`, '---\nstatus: draft\n---\n\n# Navigation Map\n');
  put(`${DOCS}/design/component-catalog.md`, '# Component Catalog\n');
  for (const target of TARGETS) put(target, 'export default null;\n');
  write('domains/memory/rules/rules.md', { artifact_id: 'MEMORY-RULES', artifact_type: 'domain-rules', domain: 'memory',
    status: 'confirmed', approved_by: 'synthetic-test-owner', approved_at: '2026-11-19', decision_id: 'synthetic-memory-rules' },
  '## Rules\n\nPreserve the current result.\n\n## Later\n\nPreserve the pending source context.');
  write('domains/memory/screens/memory/screen-spec.md', { artifact_id: 'MEMORY-HOST', artifact_type: 'screen-spec',
    screen_id: 'MEMORY-001', domain: 'memory', route: '/memory', status: 'draft', api_required: true, screen_entry: TARGETS[0],
    work_execution: { version: 1, units: ['known', 'later'].map((id, n) => ({ id, kind: 'behavior',
      contracts: [`artifact:MEMORY-RULES#${n ? 'later' : 'rules'}`],
      sources: [{ input_id: inputId(n), items: ['01'], source_refs: [inputRef(n)] }],
      api_candidates: [{ method: 'GET', path: '/memory/results' }],
    })) } }, '## Notes\n\nSynthetic single-owner request.\n\n## API Candidates\n\n' +
      table(['Method', 'Path', 'Confidence', 'Gate', 'Tracking', 'Slice Paths'],
        [['GET', '/memory/results', 'confirmed', 'active', '', 'src/api/memory/**']]) +
      '\n\n## Unknowns\n\n' + table(['ID', 'Question', 'Status'], [['U-MEMORY', 'Preserve the historical question?', 'resolved']]));
  put('contracts/memory-results.md', '## MemoryResultsResponse\n\nExisting explicit result contract.\n');
  write('api/api-manifest.md', { artifact_id: 'MEMORY-API', artifact_type: 'api-manifest', status: 'draft' },
    '## Endpoints\n\n' + table(['Method', 'Path', 'Confidence', 'Linked Contract', 'Contract Kind', 'Source'],
      [['GET', '/memory/results', 'confirmed', 'MemoryResultsResponse', 'manual', 'contracts/memory-results.md']]));

  const summaries = [], items = []; let inputBytes = 0, firstInputBody;
  for (let n = 0; n < config.inputs; n++) {
    const body = '## Extracted Facts\n\n' + Array.from({ length: config.bullets }, (_, j) =>
      `- Fact ${n}/${j}: preserve **value** and [context](https://example.invalid/input/${n}/${j}).`).join('\n') + '\n\n## Notes\n\n';
    let value = md({ input_id: inputId(n), input_type: 'meeting', source_type: 'meeting', source_ref: `meeting:memory-${n}`,
      captured_at: '2026-11-19T00:00:00Z', captured_by: 'synthetic-benchmark', status: 'captured',
      affected_domains: ['memory'], affected_screens: ['MEMORY-001'] }, body);
    const padding = 'Stable captured source prose. ';
    value += padding.repeat(Math.ceil(Math.max(0, config.inputBytes - value.length) / padding.length));
    firstInputBody ??= splitFrontmatter(value).body;
    inputBytes += Buffer.byteLength(value); put(`${DOCS}/inputs/_multi/${inputId(n)}.md`, value);
    summaries.push(n < 2 ? [inputId(n), 'meeting', 'simple-update×1', n ? 'partially-reconciled' : 'reconciled',
      n ? 'pending' : 'accepted', 'artifact:MEMORY-RULES', '-', '-']
      : [inputId(n), 'meeting', 'reject-input', 'reconciled', 'rejected', '-', '-', '-']);
    items.push(n < 2 ? [inputId(n), '01', 'compatible-fact', 'simple-update', 'update',
      `artifact:MEMORY-RULES#${n ? 'later' : 'rules'}`, inputRef(n), 'inherit', 'statement', 'inherit']
      : [inputId(n), '01', 'reject', 'reject-input', 'reject', '-', inputRef(n), 'inherit', 'statement', 'inherit']);
  }
  write('_meta/reconciliation-register.md', { reconciliation_contract: 2, review_profile: 'reconcile-stage04-v1',
    structured_since: '2026-11-19T00:00:00Z' }, table(REQUIRED_REGISTER_COLS, summaries) +
      '\n\n## Reconciliation Items\n\n' + table(REQUIRED_ITEM_COLS, items));

  let denseBytes = 0, firstDenseBody;
  for (let n = 0; n < config.documents; n++) {
    const body = '## Inventory\n\n' + Array.from({ length: config.bullets }, (_, j) =>
      `- Record ${n}/${j}: preserve **value** and [context](https://example.invalid/archive/${n}/${j}).`).join('\n') + '\n';
    firstDenseBody ??= body;
    const value = md({ artifact_id: `MEMORY-ARCHIVE-${n}`, artifact_type: 'domain-rules', domain: 'archive',
      status: 'draft' }, body);
    denseBytes += Buffer.byteLength(value);
    put(`${DOCS}/domains/archive/rules/archive-${String(n).padStart(5, '0')}.md`, value);
  }
  // Node count is structural, not an estimate of V8 bytes. Count one sample
  // outside measured child processes; every dense document has this shape.
  const countNodes = (body) => {
    if (!body) return 0;
    let count = 0; const pending = [ast.parseReconciliationReferenceView(body).tree];
    while (pending.length) { const node = pending.pop(); count++; pending.push(...node.children || []); }
    return count;
  };
  const denseNodesPerDocument = countNodes(firstDenseBody), inputNodesPerDocument = countNodes(firstInputBody);
  const layout = loadLayoutProfile({ kitRoot: root, flags: { layout: layoutFile } });
  put(`${DOCS}/_meta/workflow-state.yaml`, JSON.stringify(buildState({ docsDir: path.join(root, DOCS),
    srcDir: path.join(root, 'src'), date: '2026-11-19', layout, projectRoot: root }).state));
  git(root, 'init', '--quiet', '--object-format=sha1');
  for (const [key, value] of [['maintenance.auto', 'false'], ['gc.auto', '0'], ['core.autocrlf', 'false'], ['core.filemode', 'true']]) git(root, 'config', key, value);
  git(root, 'add', '-A'); git(root, 'commit', '-qm', 'Synthetic single-owner memory corpus');
  return { root, config, owner: OWNER, commit: git(root, 'rev-parse', 'HEAD'), tree: git(root, 'rev-parse', 'HEAD^{tree}'),
    tracked_files: sizes.size, tracked_bytes: [...sizes.values()].reduce((a, b) => a + b, 0),
    input_bytes: inputBytes, dense_artifact_bytes: denseBytes, dense_nodes_per_document: denseNodesPerDocument,
    dense_artifact_nodes: denseNodesPerDocument * config.documents, input_nodes_per_document: inputNodesPerDocument,
    input_nodes_same_shape_estimate: inputNodesPerDocument * config.inputs, state: repositoryState(root) };
}
