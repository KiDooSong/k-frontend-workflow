import test from 'node:test';
import assert from 'node:assert/strict';
import { parseReconciliationMarkdown } from './reconciliation-markdown-ast.mjs';

function section(markdown, slug = 'extracted-facts') {
  const parsed = parseReconciliationMarkdown(markdown);
  return parsed.occurrences.find((occurrence) => occurrence.slug === slug);
}

test('evidence AST exposes deterministic 1-based visible bullet text without nesting duplication', () => {
  const occurrence = section([
    '## Extracted Facts',
    '- parent IN-20260803-a-001 conflicts with IN-20260802-b-001',
    '  - child IN-20260803-c-001 mutually exclusive with IN-20260801-d-001',
    '- final',
  ].join('\n'));

  assert.equal(occurrence.bulletCount, 3);
  assert.deepEqual(occurrence.bulletTexts, [
    'parent IN-20260803-a-001 conflicts with IN-20260802-b-001',
    'child IN-20260803-c-001 mutually exclusive with IN-20260801-d-001',
    'final',
  ]);
  assert.ok(!occurrence.bulletTexts[0].includes('child'));
});

test('evidence AST excludes non-visible code/HTML/destinations and preserves visible link text', () => {
  const occurrence = section([
    '## Extracted Facts',
    '- visible [IN-20260802-b-001 conflicts with](https://example.test/IN-SECRET/conflict) source',
    '- inline `IN-20260802-code-001 충돌` remains prose',
    '- html <span data-note="IN-20260802-attr-001 충돌">visible IN-20260802-c-001 상충</span>',
    '- autolink <https://example.test/IN-20260802-url-001/conflict> omitted',
    '- parent code:',
    '  ```txt',
    '  IN-20260802-fence-001 충돌',
    '  ```',
    '- comment <!-- IN-20260802-comment-001 충돌 --> omitted',
    '',
    '[IN-20260802-definition-001]: https://example.test/conflict',
  ].join('\n'));

  assert.equal(occurrence.bulletCount, 6);
  assert.match(occurrence.bulletTexts[0], /IN-20260802-b-001 conflicts with/);
  assert.ok(!occurrence.bulletTexts.join('\n').includes('IN-SECRET'));
  assert.ok(!occurrence.bulletTexts[1].includes('IN-20260802-code-001'));
  assert.ok(!occurrence.bulletTexts[2].includes('IN-20260802-attr-001'));
  assert.match(occurrence.bulletTexts[2], /visible IN-20260802-c-001 상충/);
  assert.ok(!occurrence.bulletTexts[3].includes('IN-20260802-url-001'));
  assert.ok(!occurrence.bulletTexts[4].includes('IN-20260802-fence-001'));
  assert.ok(!occurrence.bulletTexts[5].includes('IN-20260802-comment-001'));
  assert.ok(!occurrence.bulletTexts.join('\n').includes('IN-20260802-definition-001'));
});
