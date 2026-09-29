import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildReconciliationTargetIndex } from './reconciliation-target-index.mjs';
import { createScopedReferenceResolver } from './scoped-work-refs.mjs';
const clone = (value) => structuredClone(value);

// Actual Markdown files -> existing target index -> D's exact selection resolver.
// These are selection tests, not scope-digest/permission/approval model tests.
function referenceFixture(t, entries) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'scoped-refs-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const docs = entries.map(({ id = 'DOC', type = 'screen-spec', body, fm = {} }, i) => {
    const file = path.join(root, `${i}.md`);
    const metadata = { artifact_id: id, artifact_type: type, status: 'draft', ...fm };
    fs.writeFileSync(file, `---\n${JSON.stringify(metadata)}\n---\n${body}`);
    return { file, fm: metadata };
  });
  const targetIndex = buildReconciliationTargetIndex({ docs });
  return { root, docs, targetIndex, resolver: createScopedReferenceResolver({ targetIndex, projectRoot: root }) };
}

test('D refs: selected section includes child headings, preserves LF content and owning metadata', (t) => {
  const body = '# Title\r\n\r\n## Rules\r\nAlpha\r\n### Detail\r\nBeta\r\n\r\n## Other\r\nIgnored';
  const { resolver, targetIndex } = referenceFixture(t, [{ body, fm: { domain: 'result', screen_id: 'RESULT-001' } }]);
  const result = resolver.contract('artifact:DOC#rules');
  assert.deepEqual(result.selection, { type: 'section', section: 'rules', content: 'Alpha\n### Detail\nBeta\n\n' });
  assert.equal(result.file, '0.md');
  assert.equal(result.metadata.screen_id, 'RESULT-001');
  result.metadata.status = 'confirmed';
  assert.equal(targetIndex.artifacts.get('DOC').fm.status, 'draft', 'do not mutate canonical facts');
  assert.equal(resolver.contract('artifact:DOC').selection.content, body.replace(/\r\n/g, '\n'));
  assert.equal(Object.hasOwn(result, 'ready'), false);
  assert.equal(Object.hasOwn(result, 'basis_digest'), false);
});

test('D refs: missing/duplicate artifacts and real sections fail, fenced/comment headings do not count', (t) => {
  const { resolver } = referenceFixture(t, [{ body: '```md\n## Rules\nfake\n```\n\n<!--\n## Rules\nhidden\n-->\n\n## Rules\nreal\n' }]);
  assert.equal(resolver.contract('artifact:DOC#rules').selection.content, 'real\n');
  for (const ref of ['artifact:MISSING', 'artifact:DOC#missing', 'input:IN-20260910-visual-spec-001', '-', ' artifact:DOC']) {
    assert.throws(() => resolver.contract(ref));
  }
  const duplicate = referenceFixture(t, [{ body: '## Rules\na\n\n## Rules\nb' }]);
  assert.throws(() => duplicate.resolver.contract('artifact:DOC#rules'), /SW-REF-AMBIGUOUS/);
  const artifacts = referenceFixture(t, [{ body: 'a' }, { body: 'b' }]);
  assert.throws(() => artifacts.resolver.contract('artifact:DOC'), /SW-REF-AMBIGUOUS/);
});

test('D refs: exact raw row identity rejects substring, case and Markdown label lookalikes', (t) => {
  for (const key of ['001', '01-extra', '**01**', '[01](https://example.invalid)', '0<!--x-->1', 'r-01']) {
    const { resolver } = referenceFixture(t, [{ body: `## Rows\n| ID | Value |\n|---|---|\n| ${key} | kept |\n` }]);
    assert.throws(() => resolver.contract(`artifact:DOC#rows/${key === 'r-01' ? 'R-01' : '01'}`), /SW-REF-MISSING/, key);
  }
  const { resolver } = referenceFixture(t, [{ body: '## Rows\n| ID | Value |\n|---|---|\n| 01 | a \\| b |\n| 02 | other |\n' }]);
  assert.deepEqual(resolver.contract('artifact:DOC#rows/01').selection,
    { type: 'row', section: 'rows', key: '01', headers: ['ID', 'Value'], cells: ['01', 'a | b'] });
});

test('D refs: duplicate rows/columns, malformed widths and noncanonical tables cannot resolve', (t) => {
  for (const body of [
    '## Rows\n| ID | Value |\n|---|---|\n| 01 | a |\n| 01 | b |',
    '## Rows\n| ID | Value |\n|---|---|\n| 01 | a |\n\n| ID | Value |\n|---|---|\n| 01 | b |',
    '## Rows\n| ID | id |\n|---|---|\n| 01 | 01 |',
    '## Rows\n| ID | Value |\n|---|---|\n| 01 |',
    '## Rows\n| ID | Value |\n|---|---|\n| 01 | a | extra |',
    '## Rows\n```md\n| ID | Value |\n|---|---|\n| 01 | fake |\n```',
    '## Rows\n<!--\n| ID | Value |\n|---|---|\n| 01 | fake |\n-->',
    '## Rows\n> | ID | Value |\n> |---|---|\n> | 01 | fake |',
  ]) {
    const { resolver } = referenceFixture(t, [{ body }]);
    assert.throws(() => resolver.contract('artifact:DOC#rows/01'), /SW-REF-/, body);
  }
});

test('D refs: canonical child rows retain question/options/status and reject alternative homes', (t) => {
  const table = '| ID | Status | Blocking Mode | Decision Needed | Options |\n|---|---|---|---|---|\n| D-SAVE | open | final-fixture-ui | Save? | A/B |';
  const { resolver } = referenceFixture(t, [{ body: `## Open Decisions\n${table}` }]);
  assert.deepEqual(resolver.contract('decision:D-SAVE@DOC').selection.cells, ['D-SAVE', 'open', 'final-fixture-ui', 'Save?', 'A/B']);
  for (const body of [`## Notes\n${table}`, `## Open Decisions\n${table}\n\n${table}`,
    `## Open Decisions\n${table}\n\n## Open Decisions\n${table}`]) {
    assert.throws(() => referenceFixture(t, [{ body }]).resolver.contract('decision:D-SAVE@DOC'), /SW-REF-/);
  }
  const unknown = referenceFixture(t, [{ body: '## Unknowns\n| ID | Question |\n|---|---|\n| U-ONE | Which? |' }]);
  assert.deepEqual(unknown.resolver.contract('unknown:U-ONE@DOC').selection.cells, ['U-ONE', 'Which?']);
  assert.throws(() => unknown.resolver.contract('decision:D-ONE@DOC'), /SW-REF-MISSING/);
});

test('D refs: INV/VER require visible tokens, and selection sets neither mutate nor grant authority', (t) => {
  for (const body of ['`INV-ONE`', '[label](https://example.invalid/INV-ONE)', '```\nINV-ONE\n```']) {
    assert.throws(() => referenceFixture(t, [{ body }]).resolver.contract('investigation:INV-ONE@DOC'), /SW-REF-MISSING/);
  }
  const { resolver } = referenceFixture(t, [{ body: 'INV-ONE\n\n## Rules\nvalue' }]);
  assert.equal(resolver.contract('investigation:INV-ONE@DOC').selection.type, 'body-token');
  const refs = ['artifact:DOC#rules', 'artifact:DOC'];
  const before = clone(refs);
  assert.deepEqual(resolver.contracts(refs), resolver.contracts([...refs].reverse()));
  assert.deepEqual(refs, before);
  assert.throws(() => resolver.contracts(['artifact:DOC', 'artifact:DOC']), /duplicate selector/);
  assert.throws(() => resolver.contracts([]), /nonempty array required/);
});

test('D refs: indexed artifact path cannot escape or be repaired into the snapshot namespace', (t) => {
  const { targetIndex, root } = referenceFixture(t, [{ body: '## Rules\nvalue' }]);
  const record = targetIndex.artifacts.get('DOC');
  for (const file of [path.join(root, '..', 'outside.md'), `${root}/sub/../0.md`, 'relative.md']) {
    record.file = file;
    assert.throws(() => createScopedReferenceResolver({ targetIndex, projectRoot: root }).contract('artifact:DOC'));
  }
});
