import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { splitFrontmatter } from './util.mjs';
import { CURRENT_WORK_INPUT_LIMIT, hashBytes } from './current-work-request.mjs';
import { reconciliationParseStats, reconciliationSyntaxCacheStats } from './reconciliation-markdown-ast.mjs';
import { createScopedReferenceResolver, scopedReferenceResolverView } from './scoped-work-refs.mjs';
import { resolveScopedContractGraph, resolveScopedCandidateGraph } from './scoped-work-graph.mjs';

const ID = 'GRAPH-READ-RULES', REF = `artifact:${ID}#contract`;
const metadata = { artifact_id: ID, artifact_type: 'domain-rules', domain: 'graph-read', status: 'draft' };
const markdown = (body, fm = metadata) => `---\n${JSON.stringify(fm)}\n---\n\n${body}`;
const smallBody = '## Contract\n\nOne selected paragraph.\n\n## Notes\n\nUnselected appendix.\n';
const runs = {
  strict: (options, project) => resolveScopedContractGraph({ ...options, contracts: [REF], project }),
  candidate: (options, project) => resolveScopedCandidateGraph({ ...options, roots: [{ ref: REF, mode: 'ordinary' }], project }),
};

function fixture(t, body = smallBody) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'scoped-graph-read-view-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const file = path.join(root, 'rules.md');
  const write = (value, fm = metadata) => fs.writeFileSync(file, markdown(value, fm));
  write(body);
  const options = () => {
    const { data: fm, body: currentBody } = splitFrontmatter(fs.readFileSync(file, 'utf8'));
    return { projectRoot: root, inputArtifacts: [],
      targetIndex: { artifacts: new Map([[ID, { file, fm, body: currentBody }]]), duplicates: new Set() } };
  };
  return { root, file, write, options };
}

test('#339 graph view: an exact-body handoff uses only this resolver\'s already selected immutable syntax', (t) => {
  const f = fixture(t), options = f.options(), refs = createScopedReferenceResolver(options);
  const body = options.targetIndex.artifacts.get(ID).body, before = reconciliationParseStats();
  assert.equal(scopedReferenceResolverView(refs, ID, body), null, 'lookup cannot parse or preselect an unused artifact');
  assert.deepEqual(reconciliationParseStats(), before);
  refs.contract(REF);
  const view = scopedReferenceResolverView(refs, ID, body);
  assert.ok(Object.isFrozen(view) && Object.isFrozen(view.sections) && Object.isFrozen(view.tree));
  assert.ok(view.sections.some((section) => section.slug === 'contract'));
  assert.equal(scopedReferenceResolverView(refs, ID, `${body}\nChanged.`), null, 'equal artifact IDs cannot substitute a different body');
  assert.equal(scopedReferenceResolverView(refs, 'OTHER', body), null);
  assert.equal(scopedReferenceResolverView({ ...refs }, ID, body), null, 'a copied resolver does not acquire its private view cache');
});

test('#339 graph view: oversized syntax is parsed once per graph and released between independent evaluations', (t) => {
  const f = fixture(t), options = f.options();
  const expected = Object.fromEntries(Object.entries(runs).map(([name, run]) => [name, run(options)]));
  const body = `${smallBody}\n<!-- ${'x'.repeat(reconciliationSyntaxCacheStats().max_source_chars)} -->\n`;
  f.write(body);
  assert.ok(body.length > reconciliationSyntaxCacheStats().max_source_chars);
  assert.ok(fs.statSync(f.file).size < CURRENT_WORK_INPUT_LIMIT, 'an oversized retained-cache entry is still a supported file');
  const oversized = f.options(), expectedReadSet = [{ file: 'rules.md', sha256: hashBytes(fs.readFileSync(f.file)) }];
  for (const [name, run] of Object.entries(runs)) {
    const before = reconciliationParseStats().parsed, first = run(oversized);
    assert.equal(reconciliationParseStats().parsed - before, 1, `${name}: reference selection and audited read share one parse`);
    assert.deepEqual(first, { ...expected[name], read_set: expectedReadSet }, 'unselected padding changes only the observed file hash');
    const repeated = reconciliationParseStats().parsed, second = run(oversized);
    assert.equal(reconciliationParseStats().parsed - repeated, 1, `${name}: another graph cannot inherit the oversized view`);
    assert.deepEqual(second, first, 'holding the earlier public graph does not retain an internal view for another call');
  }
  const cache = reconciliationSyntaxCacheStats();
  assert.ok(cache.source_chars <= cache.max_source_chars && cache.nodes <= cache.max_nodes && cache.entries <= cache.max_entries);
});

test('#339 graph view: reusing parsed syntax still checks current body and frontmatter before graph use', (t) => {
  for (const [name, run] of Object.entries(runs)) for (const field of ['body', 'metadata']) {
    const f = fixture(t), options = f.options(), open = fs.openSync;
    let changed = false;
    const hook = t.mock.method(fs, 'openSync', function (file, ...args) {
      if (file === f.file && !changed) {
        changed = true;
        if (field === 'body') f.write(smallBody.replace('selected paragraph', 'changed paragraph'));
        else f.write(smallBody, { ...metadata, status: 'confirmed' });
      }
      return open.call(this, file, ...args);
    });
    try {
      assert.throws(() => run(options), /evidence differs from its indexed snapshot/, `${name}: ${field}`);
      assert.equal(changed, true, 'mutation occurred after the reference view was selected, at the real current-file read');
    } finally { hook.mock.restore(); }
  }
});

test('#339 graph view: final audit rejects a late edit and a failed call leaves no oversized view pin', (t) => {
  const f = fixture(t), body = `${smallBody}\n<!-- ${'z'.repeat(reconciliationSyntaxCacheStats().max_source_chars)} -->\n`;
  for (const [name, run] of Object.entries(runs)) {
    f.write(body);
    const options = f.options(), before = reconciliationParseStats().parsed;
    let changed = false;
    assert.throws(() => run(options, (record) => {
      changed = true;
      fs.appendFileSync(f.file, '\nChanged after resolving the selected node.\n');
      return record;
    }), /evidence changed during graph resolution/, name);
    assert.equal(changed, true);
    assert.equal(reconciliationParseStats().parsed - before, 1);
    f.write(body);
    const afterFailure = reconciliationParseStats().parsed;
    const fresh = run(f.options());
    assert.equal(fresh.nodes.length, 1);
    assert.equal(reconciliationParseStats().parsed - afterFailure, 1, `${name}: failure did not retain a later reusable view`);
  }
});
