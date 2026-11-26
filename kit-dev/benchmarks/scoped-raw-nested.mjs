// Public #364 synthetic probes. Usage: node scoped-raw-nested.mjs KIT_ROOT [--check]
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const [kit, flag, ...extra] = process.argv.slice(2);
if (!kit || extra.length || (flag && flag !== '--check')) {
  throw new Error('Usage: node scoped-raw-nested.mjs KIT_ROOT [--check]');
}
const load = (name) => import(pathToFileURL(path.resolve(kit, 'scripts/lib', name + '.mjs')));
const { parseReconciliationReferenceView } = await load('reconciliation-markdown-ast');
const { scopedAuthoredView, scopedAuthoredSections } = await load('scoped-work-authored');

function listProbe() {
  const body = '## Notes\n\n- One\n- Two\n', raw = parseReconciliationReferenceView(body);
  const notes = raw.sections.find(({ slug }) => slug === 'notes'), original = notes.nodes[0];
  let count = 1, reads = 0;
  notes.nodes[0] = { ...original, get children() {
    reads += 1;
    return original.children.slice(0, count);
  } };
  const first = scopedAuthoredView(body, raw), firstCount = first.byName.get('notes')[0].bulletNodes.length;
  count = 2;
  const second = scopedAuthoredView(body, raw), secondCount = second.byName.get('notes')[0].bulletNodes.length;
  return { firstCount, secondCount, same: first === second, reads };
}

function treeProbe() {
  const body = '## API Candidates\n\n| Method | Path |\n| --- | --- |\n| GET | /items |\n';
  const raw = parseReconciliationReferenceView(body), nativeTree = raw.tree;
  const table = raw.sections.find(({ slug }) => slug === 'api-candidates').tableNodes[0];
  let includeTable = true, reads = 0;
  const customTree = () => ({ ...nativeTree, get children() {
    reads += 1;
    return nativeTree.children.filter((node) => includeTable || node !== table);
  } });
  raw.tree = customTree();
  const count = () => scopedAuthoredSections(body, 'api candidates', raw)[0].tables.length;
  const before = count();
  includeTable = false;
  const after = count();
  raw.tree = customTree();
  const afterRebuild = count();
  return { before, after, afterRebuild, reads };
}

const result = { list: listProbe(), tree: treeProbe() };
console.log(JSON.stringify(result));
if (flag === '--check') {
  assert.deepEqual(result.list, { firstCount: 1, secondCount: 2, same: false, reads: 2 });
  assert.deepEqual(result.tree, { before: 1, after: 0, afterRebuild: 0, reads: 5 });
}
