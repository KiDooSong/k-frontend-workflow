import test from 'node:test';
import assert from 'node:assert/strict';
import { parseReconciliationMarkdown, parseReconciliationEvidence, parseReconciliationReferenceView, locateContentTables,
  parseStrictTables, parseStrictTablesWithHeaders, describeHeaderMismatch } from './reconciliation-markdown-ast.mjs';

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

const evidenceFixtures = [
  ['empty document', []],
  ['preamble and repeated or empty headings', [
    '- preamble',
    '',
    '## Extracted Facts',
    '- first',
    '',
    '## Extracted Facts',
    '- repeated',
    '',
    '##',
    '- empty heading',
    '',
    '## !!!',
    '- punctuation heading',
  ]],
  ['code and HTML', [
    '## Extracted Facts',
    '- inline `hidden IN-CODE` and [visible link](https://example.test/hidden)',
    '- inline <span data-note="hidden">visible HTML</span> and <!-- hidden --> comment',
    '- autolink <https://example.test/hidden> and <person@example.test>',
    '- fenced code:',
    '  ```md',
    '  - hidden list item',
    '  ## Hidden Heading',
    '  ```',
    '',
    '    ## Indented Code',
    '    - hidden indented item',
    '',
    '<div>',
    '## HTML Heading',
    '- hidden HTML item',
    '</div>',
    '',
    '<!--',
    '## Comment Heading',
    '- hidden comment item',
    '-->',
    '',
    '- final visible item',
  ]],
  ['document-wide definitions, image alt, and footnotes', [
    '[before]: /before',
    '[^before]: footnote before',
    '',
    '## Extracted Facts',
    '- [before link][before], [inside link][inside], [after link][after]',
    '- [missing link][missing], [before][], [after], and ![reference image][before]',
    '- ![[alt before][before]](/image) and ![[alt after][after]](/image)',
    '- ![[alt missing][missing]](/image)',
    '- footnotes [^before], [^inside], [^after], and [^missing]',
    '',
    '[inside]: /inside',
    '[^inside]: footnote inside',
    '',
    '## Following Section',
    '[after]: /after',
    '[^after]: footnote after',
    '',
    '- [following link][before]',
  ]],
  ['containers and nested bullets', [
    '## Extracted Facts',
    '- parent',
    '  - child',
    '    - grandchild',
    '- ',
    '',
    '> ## Nested Heading',
    '>',
    '> - quoted parent',
    '>   - quoted child',
    '',
    '1. ordered parent',
    '   1. ordered child',
    '',
    '   ## Heading in a List',
    '',
    '   - child after heading',
    '',
    '- [x] checked task',
    '- [ ] unchecked task',
    '',
    '## Next Root Section',
    '- next root item',
  ]],
  ['ATX and setext headings with tables', [
    '# Document Title',
    '',
    '- preamble',
    '',
    '## **Extracted** Facts ##',
    '- ATX item',
    '',
    '| Name | Value |',
    '| --- | --- |',
    '| visible | `code` |',
    '| [label](/target) | ![alt](/image) |',
    '',
    'Extracted Facts',
    '---------------',
    '',
    '- setext item',
    '',
    'Other Title',
    '===========',
    '',
    '- H1 remains in current section',
    '',
    '### Nested Depth',
    '- H3 remains in current section',
    '',
    '## Final Section',
  ]],
];

for (const [name, lines] of evidenceFixtures) {
  test(`compact evidence matches the full projection: ${name}`, () => {
    for (const lineEnding of ['\n', '\r\n', '\r']) {
      const body = lines.join(lineEnding);
      const expected = parseReconciliationMarkdown(body).occurrences
        .map(({ slug, bulletTexts }) => ({ slug, bulletTexts }));
      assert.deepEqual(parseReconciliationEvidence(body), expected, JSON.stringify(lineEnding));
    }
  });
}

test('compact evidence retains occurrence order, empty slugs, and nested bullet indexes', () => {
  const body = [
    '## Facts',
    '- parent',
    '  - child',
    '',
    '> ## Nested Heading',
    '> - quoted bullet',
    '',
    '## Facts',
    '- repeated',
    '',
    '##',
    '- empty heading',
  ].join('\n');
  assert.deepEqual(parseReconciliationEvidence(body), [
    { slug: '', bulletTexts: [] },
    { slug: 'facts', bulletTexts: ['parent', 'child', 'quoted bullet'] },
    { slug: 'facts', bulletTexts: ['repeated'] },
    { slug: '', bulletTexts: ['empty heading'] },
  ]);
});

test('compact evidence is fresh per call and cannot mutate full or native views', () => {
  const body = ['## Extracted Facts', '- parent', '  - child', '', '| a | b |', '|---|---|', '| 1 | 2 |'].join('\n');
  const full = parseReconciliationMarkdown(body);
  const native = parseReconciliationReferenceView(body);
  const expected = full.occurrences.map(({ slug, bulletTexts }) => ({ slug, bulletTexts }));
  const evidence = parseReconciliationEvidence(body);
  evidence[1].slug = 'changed';
  evidence[1].bulletTexts[0] = 'changed';
  evidence[1].bulletTexts.push('added');
  evidence.push({ slug: 'added', bulletTexts: [] });

  assert.deepEqual(parseReconciliationEvidence(body), expected);
  assert.deepEqual(parseReconciliationMarkdown(body), full);
  assert.deepEqual(parseReconciliationReferenceView(body), native);
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

const strictHeaders = ['Input ID', 'Status'];
const strictTable = (headers = strictHeaders, rows = [['IN-1', 'open']]) => [
  `| ${headers.join(' | ')} |`,
  `| ${headers.map(() => '---').join(' | ')} |`,
  ...rows.map((cells) => `| ${cells.join(' | ')} |`),
];

test('#300 header-selected tables match full strict-table filtering across Markdown boundaries', () => {
  const canonical = strictTable(), example = strictTable(['Example', 'Notes'], [['example', 'ignored']]);
  const cases = [
    [], ['plain text'], canonical,
    [...example, '', ...canonical],
    ['paragraph', ...canonical], ['paragraph', '', ...canonical],
    ['## Heading', ...canonical], ['---', ...canonical], ['>', ...canonical],
    ['<!-- boundary -->', ...canonical],
    canonical.map((line) => ` ${line}`),
    [canonical[0], canonical[1], ` ${canonical[2]}`],
    canonical.map((line) => line.slice(1)),
    canonical.map((line) => `> ${line}`),
    ['- list item', '', ...canonical.map((line) => `  ${line}`)],
    ['```md', ...canonical, '```'],
    canonical.map((line) => `    ${line}`),
    ['<div>', ...canonical, '</div>'],
    [...canonical, '', ...example, '', ...strictTable(strictHeaders, [['IN-2', 'resolved']])],
    ...[
      ['Input ID', 'inputid'], ['Input ID', 'Status', 'Extra'], ['Status', 'Input ID'],
      ['input\tID', 'STATUS'], ['**Input ID**', '*Status*'], ['`Input ID`', 'Status'],
      ['[Input ID](/header)', '![Status](/image)'], ['<em>Input ID</em>', 'Status'],
    ].map((headers) => strictTable(headers)),
  ];
  for (const ending of ['\n', '\r\n', '\r']) for (const [index, lines] of cases.entries()) {
    const body = lines.join(ending);
    const expected = parseStrictTables(body).filter((table) => describeHeaderMismatch(table, strictHeaders) === null);
    assert.deepEqual(parseStrictTablesWithHeaders(body, strictHeaders), expected, `${index}: ${JSON.stringify(ending)}`);
  }
});

test('#300 header-selected tables reject malformed headers but preserve accepted header spelling', () => {
  for (const headers of [
    ['Input ID', 'inputid'], ['Input ID', 'Status', 'Extra'], ['Status', 'Input ID'],
    ['`Input ID`', 'Status'], ['<em>Input ID</em>', 'Status'],
  ]) {
    assert.deepEqual(parseStrictTablesWithHeaders(strictTable(headers).join('\n'), strictHeaders), [], headers.join(' / '));
  }
  const [table] = parseStrictTablesWithHeaders(strictTable(['**input ID**', '*STATUS*']).join('\n'), strictHeaders);
  assert.deepEqual(table.headers, ['input ID', 'STATUS']);
  assert.deepEqual(table.rows, [{ 'input ID': 'IN-1', STATUS: 'open' }]);
});

test('#300 header-selected tables preserve column-zero and explicit block-boundary requirements', () => {
  const lines = strictTable();
  for (const body of [
    `paragraph\n${lines.join('\n')}`,
    lines.map((line) => ` ${line}`).join('\n'),
    [lines[0], lines[1], ` ${lines[2]}`].join('\n'),
    lines.map((line) => `> ${line}`).join('\n'),
    ['```md', ...lines, '```'].join('\n'),
  ]) assert.deepEqual(parseStrictTablesWithHeaders(body, strictHeaders), [], body);
  for (const prefix of ['', 'paragraph\n\n', '## Heading\n', '>\n', '<!-- boundary -->\n']) {
    const found = parseStrictTablesWithHeaders(prefix + lines.join('\n'), strictHeaders);
    assert.equal(found.length, 1, prefix);
    assert.deepEqual(found[0].rows, [{ 'Input ID': 'IN-1', Status: 'open' }], prefix);
  }
});

test('#300 header-selected tables retain every matching table in document order', () => {
  const first = strictTable(strictHeaders, [['IN-1', 'open']]).join('\n');
  const second = strictTable(strictHeaders, [['IN-2', 'resolved']]).join('\n');
  const example = strictTable(['Example', 'Notes'], [['ignored', 'example']]).join('\n');
  const found = parseStrictTablesWithHeaders(`${example}\n\n## First\n${first}\n\n${example}\n\n## Second\n${second}`, strictHeaders);
  assert.equal(found.length, 2, 'duplicate canonical tables remain visible to the caller');
  assert.deepEqual(found.map((table) => table.rows[0]['Input ID']), ['IN-1', 'IN-2']);
  assert.deepEqual(found.map((table) => table.sourceText), [first, second]);
});

test('#300 header-selected tables preserve escaped cells, short/extra rows and exact source text', () => {
  for (const ending of ['\n', '\r\n', '\r']) {
    const source = ['| Input ID | Status |', '|---|---|', '| IN-\\|1 | `a\\|b` |',
      '| IN-2 |', '| IN-3 | open | extra |'].join(ending);
    assert.deepEqual(parseStrictTablesWithHeaders(source, strictHeaders), [{
      headers: ['Input ID', 'Status'],
      rows: [{ 'Input ID': 'IN-|1', Status: '`a|b`' }, { 'Input ID': 'IN-2', Status: '' },
        { 'Input ID': 'IN-3', Status: 'open' }],
      rowCount: 3,
      sourceText: source,
    }], JSON.stringify(ending));
  }
});

test('#300 header-selected tables retain full-document reference definitions including image alt references', () => {
  const headers = ['Input ID', 'Target'];
  for (const ending of ['\n', '\r\n', '\r']) for (const label of [
    '[Input ID][outside]', '![[Input ID][outside]](/image)',
  ]) {
    const lines = strictTable([label, 'Target'], [['IN-1', '![[artifact:EXAMPLE#section/row][outside]](/image)']]);
    for (const placement of ['before', 'inside', 'after']) {
      const body = [
        ...(placement === 'before' ? ['[outside]: /url', ''] : []),
        '## Summary', ...lines,
        ...(placement === 'inside' ? ['', '[outside]: /url'] : []),
        '', '## Following',
        ...(placement === 'after' ? ['[outside]: /url'] : []),
      ].join(ending);
      // This helper filters full-document tables. Unlike the Items-section
      // helper, it must keep definitions on either side of the selected H2.
      const expected = parseStrictTables(body).filter((table) => describeHeaderMismatch(table, headers) === null);
      const found = parseStrictTablesWithHeaders(body, headers);
      assert.deepEqual(found, expected, `${placement}: ${JSON.stringify(ending)}`);
      assert.equal(found.length, 1);
      assert.deepEqual(found[0].headers, headers);
      assert.deepEqual(found[0].rows, [{ 'Input ID': 'IN-1', Target: 'artifact:EXAMPLE#section/row' }]);
      assert.equal(found[0].sourceText, lines.join(ending));
    }
    assert.deepEqual(parseStrictTablesWithHeaders(lines.join(ending), headers), [], 'an absent definition stays unresolved');
  }
});

test('#300 header-selected tables return detached projections without mutating the shared AST', () => {
  const body = strictTable().join('\n');
  const full = parseStrictTables(body), native = parseReconciliationReferenceView(body);
  const expected = structuredClone(full), found = parseStrictTablesWithHeaders(body, strictHeaders);
  found[0].headers[0] = 'changed';
  found[0].rows[0]['Input ID'] = 'changed';
  found[0].rows.push({ 'Input ID': 'added', Status: 'open' });
  found[0].rowCount = 99;
  found[0].sourceText = 'changed';
  found.push({ headers: [], rows: [], rowCount: 0, sourceText: '' });
  assert.deepEqual(parseStrictTablesWithHeaders(body, strictHeaders), expected);
  assert.deepEqual(full, expected);
  assert.deepEqual(parseStrictTables(body), expected);
  assert.deepEqual(parseReconciliationReferenceView(body), native);
  assert.deepEqual(strictHeaders, ['Input ID', 'Status']);
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

test('locateContentTables source lines: a row-owned multiline comment retains its full span exactly once', () => {
  const first = '| 1 | 2 |', second = '| 3 | 4 |';
  for (const [internal, following] of [['\r', '\n'], ['\n', ''], ['\r\n', '']]) {
    const comment = ` <!-- row note${internal}continued note -->`;
    const source = `| a <!-- x | y --> | b |\n|---|---|\n${first}${comment}${following}${second}`;
    const [found] = locateContentTables(source, { includeSourceLines: true });
    assert.deepEqual(found.sourceLines.slice(2), [
      { text: `${first} `, sourceText: first + comment, commentOffsets: [first.length + 1] },
      { text: second, sourceText: second, commentOffsets: [] },
    ], JSON.stringify(internal));
    // The internal EOL belongs to the full comment, so only the following bytes separate the source rows.
    // When the comment closes directly before the next row, there is no additional source separator.
    assert.deepEqual(found.sourceLineEndings, ['\n', '\n', following, '']);
  }
});

test('locateContentTables source lines: an external comment tail before the header is not header evidence', () => {
  const header = '| a <!-- x | y --> | b |';
  const source = `--- <!-- outside\r-->${header}\n|---|---|\n| 1 | 2 |`;
  const [found] = locateContentTables(source, { includeSourceLines: true });
  assert.deepEqual(found.sourceLines[0], { text: '| a  | b |', sourceText: header, commentOffsets: [4] });
  assert.deepEqual(found.sourceLineEndings, ['\n', '\n', '']);
});

test('locateContentTables source lines: adjacent comments remain evidence across an owned continuation', () => {
  const first = '| 1 | 2 |', second = '| 3 | 4 |', owned = ' <!-- owned\rcontinued -->';
  const header = '| a <!-- x | y --> | b |\n|---|---|\n', adjacent = '<!-- also owned -->';
  for (const gap of ['', ' ', '\t', ' \t ']) {
    const [found] = locateContentTables(`${header}${first}${owned}${gap}${adjacent}\n${second}`, { includeSourceLines: true });
    const expected = [{ text: `${first} `, sourceText: first + owned + gap + adjacent,
      commentOffsets: [first.length + 1, first.length + 1] }];
    // Nonempty horizontal whitespace between the kept CR and LF is a blank Markdown line, so only
    // the first data row is in that strict table. Its complete adjacent comment chain is still evidence.
    if (!gap) expected.push({ text: second, sourceText: second, commentOffsets: [] });
    assert.deepEqual(found.sourceLines.slice(2), expected, JSON.stringify(gap));
    assert.deepEqual(found.sourceLineEndings, gap ? ['\n', '\n', ''] : ['\n', '\n', '\n', '']);
  }
  // A CR outside any owned comment creates a distinct physical line; that standalone comment is not
  // adjacent through the owned comment's continuation and must not become evidence for the first row.
  const [standalone] = locateContentTables(`${header}${first}\r<!-- standalone -->\n${second}`, { includeSourceLines: true });
  assert.deepEqual(standalone.sourceLines.slice(2), [
    { text: first, sourceText: first, commentOffsets: [] },
    { text: second, sourceText: second, commentOffsets: [] },
  ]);
});

test('locateContentTables source lines: comment chaining stops at external newlines and other content', () => {
  const first = '| 1 | 2 |', owned = ' <!-- owned\rcontinued -->';
  const header = '| a <!-- x | y --> | b |\n|---|---|\n';
  for (const gap of ['\n', '\r', '# visible heading ', '\n```txt\nhidden code\n```\n', '<pre>hidden HTML</pre>']) {
    const source = `${header}${first}${owned}${gap}<!-- separate -->\n| 3 | 4 |`;
    const [found] = locateContentTables(source, { includeSourceLines: true });
    assert.deepEqual(found.sourceLines[2], { text: `${first} `, sourceText: first + owned,
      commentOffsets: [first.length + 1] }, JSON.stringify(gap));
  }
});
