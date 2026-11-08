import test from 'node:test';
import assert from 'node:assert/strict';
import { parseReconciliationMarkdown, parseReconciliationReferenceView, locateContentTables } from './reconciliation-markdown-ast.mjs';

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

test('the same body shares one read-only tree per process; derived views stay per call (#265)', () => {
  const body = ['## Conflicts', '', '| ID | Status |', '|---|---|', '| C-1 | open |', ''].join('\n');
  const tree = parseReconciliationReferenceView(body).tree;
  assert.equal(parseReconciliationReferenceView([...body].join('')).tree, tree);
  assert.notEqual(parseReconciliationReferenceView(`${body}\n`).tree, tree);
  for (const value of [tree, tree.children, tree.children[1], tree.children[1].position.start]) assert.ok(Object.isFrozen(value));
  assert.throws(() => tree.children.push({ type: 'text', value: 'x' }), TypeError);
  assert.notEqual(parseReconciliationMarkdown(body).occurrences, parseReconciliationMarkdown(body).occurrences);
});

test('locateContentTables: strict tables of the content view, at their offsets in the source', () => {
  // Removing the comment joins the CR and the LF into one line ending; the fenced table is no table at all.
  const source = '## Summary\r<!-- note -->\n| a | b |\n|---|---|\n| 1 | 2 | <!-- x -->\n\n\`\`\`\n| c | d |\n|---|---|\n\`\`\`\n';
  const found = locateContentTables(source);
  assert.equal(found.length, 1);
  assert.deepEqual(found[0].table.headers, ['a', 'b']);
  assert.equal(source.slice(found[0].start, found[0].end).trimEnd(), '| a | b |\n|---|---|\n| 1 | 2 |');
  // Line ends inside removed code stay in the content view, so offsets after it still land on the same characters.
  const after = '\`\`\`\n| c | d |\n|---|---|\n\`\`\`\n\n| a | b |\n|---|---|\n| 1 | 2 |';
  const [table] = locateContentTables(after);
  assert.equal(after.slice(table.start, table.end), '| a | b |\n|---|---|\n| 1 | 2 |');
});

test('locateContentTables source lines: CR-joined omitted blocks cannot enter row evidence or comment offsets', () => {
  const header = '| a | b |', separator = '|---|---|';
  const before = '| 1 ', middle = ' | 2 | ';
  const first = `${before}<!-- in cell -->${middle}<!-- after pipe -->`, second = '| 3 | 4 |';
  for (const block of ['    code <!-- ignored -->', '<pre>HTML <!-- ignored --></pre>']) {
    const rows = [
      { text: header, sourceText: header, commentOffsets: [] },
      { text: separator, sourceText: separator, commentOffsets: [] },
      { text: before + middle, sourceText: first, commentOffsets: [before.length, before.length + middle.length] },
    ];
    // Each block is non-content in the original AST. Combining both placements would leave the first
    // data line as a paragraph, whose continuation cannot be interrupted by a second indented code line.
    for (const [source, expected, endings] of [
      [`${header}\n${separator}\r${block}\n${first}`, rows, ['\n', '\r\n', '']],
      [`${header}\n${separator}\n${first}\r${block}\n${second}`,
        [...rows, { text: second, sourceText: second, commentOffsets: [] }], ['\n', '\n', '\r\n', '']],
    ]) {
      const [found] = locateContentTables(source, { includeSourceLines: true });
      assert.deepEqual(found.sourceLines, expected, block);
      assert.deepEqual(found.sourceLineEndings, endings, block);
    }
  }
});

test('locateContentTables source lines: kept bare CR and inline comment literals retain the legacy row shape', () => {
  const first = '| `<!-- literal -->` | 1 |', before = '| 2 ', after = ' | 3 |';
  const row = `${first}\r${before}<!-- actual comment -->${after}`;
  const [found] = locateContentTables(`| a | b |\n|---|---|\n${row}`, { includeSourceLines: true });
  assert.equal(found.sourceLines.length, 3);
  assert.deepEqual(found.sourceLines[2], {
    text: `${first}\r${before}${after}`,
    sourceText: row,
    commentOffsets: [first.length + 1 + before.length],
  });
});

test('locateContentTables source lines: comments outside a contributing physical row do not shift its evidence', () => {
  const first = '| 1 | 2 |', second = '| 3 | 4 |', trailing = ' <!-- row note -->';
  const source = 'p\r<!-- before -->\n'.repeat(3) + '\n| a | b |\n|---|---|\n' +
    `${first}\r<!-- outside row -->\n${second}${trailing}`;
  const [found] = locateContentTables(source, { includeSourceLines: true });
  assert.deepEqual(found.sourceLines.slice(2), [
    { text: first, sourceText: first, commentOffsets: [] },
    { text: `${second} `, sourceText: second + trailing, commentOffsets: [second.length + 1] },
  ]);
  assert.deepEqual(found.sourceLineEndings, ['\n', '\n', '\r\n', '']);
});
