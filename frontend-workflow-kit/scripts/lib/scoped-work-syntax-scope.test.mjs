import test from 'node:test';
import assert from 'node:assert/strict';
import { parseReconciliationReferenceView, sharedReconciliationReferenceView, reconciliationParseStats,
  reconciliationSyntaxCacheStats, withReconciliationSyntax } from './reconciliation-markdown-ast.mjs';
import { scopedAuthoredView, scopedAuthoredCacheStats, withScopedDocumentSyntax } from './scoped-work-authored.mjs';

const longBody = '## Unknowns\n\n| ID | Question | Status |\n|---|---|---|\n| U-SCOPE | Keep the original row? | open |\n\n' +
  `## Appendix\n\n<!-- ${'x'.repeat(reconciliationSyntaxCacheStats().max_source_chars)} -->\n`;
const bounded = (stats) => {
  assert.ok(stats.source_chars <= stats.max_source_chars);
  assert.ok(stats.nodes <= stats.max_nodes);
  assert.ok(stats.entries <= stats.max_entries);
};

test('#331 active syntax scope pins an existing cache hit through real global entry eviction', () => {
  const body = '## Cached scope source\n\n- Preserve this exact parsed tree.\n';
  const original = sharedReconciliationReferenceView(body), before = reconciliationSyntaxCacheStats();
  assert.equal(withReconciliationSyntax(body, () => {
    assert.equal(sharedReconciliationReferenceView(body).tree, original.tree);
    for (let i = 0; i <= before.max_entries; i += 1) {
      parseReconciliationReferenceView(`## Scope pressure ${i}\n\nUnrelated syntax ${i}.\n`);
    }
    assert.ok(reconciliationSyntaxCacheStats().evictions > before.evictions);
    assert.equal(sharedReconciliationReferenceView(body).tree, original.tree,
      'a hit present before entering the scope stays pinned when unrelated documents evict its global entry');
    return 17;
  }), 17);
  bounded(reconciliationSyntaxCacheStats());
});

test('#331 active document scope restores nested A-B-A views on return and throw, then releases oversized syntax', () => {
  const other = '## Unknowns\n\n| ID | Question | Status |\n|---|---|---|\n| U-OTHER | Other scope? | open |\n';
  const sentinel = new Error('original nested work failure'), before = reconciliationParseStats();
  let firstRaw, firstAuthored;
  assert.throws(() => withScopedDocumentSyntax(longBody, (raw) => {
    firstRaw = raw; firstAuthored = scopedAuthoredView(longBody, raw);
    assert.ok(Object.isFrozen(raw.tree));
    withScopedDocumentSyntax(other, (otherRaw) => {
      const otherAuthored = scopedAuthoredView(other, otherRaw);
      assert.notEqual(otherRaw.tree, raw.tree);
      assert.equal(withScopedDocumentSyntax(longBody, (nestedRaw) => {
        assert.equal(nestedRaw, raw);
        assert.equal(scopedAuthoredView(longBody), firstAuthored);
        return 23;
      }), 23);
      assert.equal(scopedAuthoredView(other), otherAuthored);
      assert.throws(() => withScopedDocumentSyntax(longBody, (nestedRaw) => {
        assert.equal(nestedRaw, raw);
        throw sentinel;
      }), (error) => error === sentinel);
      assert.equal(sharedReconciliationReferenceView(other), otherRaw);
      assert.equal(scopedAuthoredView(other), otherAuthored, 'the failed inner A restores B');
      assert.equal(sharedReconciliationReferenceView(longBody), raw, 'the outer A remains available below B');
    });
    assert.equal(sharedReconciliationReferenceView(longBody), raw);
    assert.equal(scopedAuthoredView(longBody), firstAuthored, 'returning from B restores the original A authored view');
    assert.equal(reconciliationParseStats().parsed - before.parsed, 2, 'one real parse for each distinct active body');
    throw sentinel;
  }), (error) => error === sentinel);
  const afterFailure = reconciliationParseStats();
  withScopedDocumentSyntax(longBody, (freshRaw) => {
    assert.notEqual(freshRaw.tree, firstRaw.tree,
      'a later independent call cannot inherit the completed oversized pin, even while its old result is held');
    assert.notEqual(scopedAuthoredView(longBody), firstAuthored);
  });
  assert.equal(reconciliationParseStats().parsed - afterFailure.parsed, 1);
  bounded(reconciliationSyntaxCacheStats()); bounded(scopedAuthoredCacheStats());
});

test('#331 active syntax scopes are synchronous and do not survive escaped async continuations', async () => {
  for (const scope of [
    (run) => withReconciliationSyntax(longBody, () => run(sharedReconciliationReferenceView(longBody))),
    (run) => withScopedDocumentSyntax(longBody, run),
  ]) {
    let first, later;
    const before = reconciliationParseStats();
    assert.equal(scope((raw) => {
      first = raw;
      later = Promise.resolve().then(() => scope((fresh) => fresh));
      return 31;
    }), 31);
    const fresh = await later;
    assert.notEqual(fresh.tree, first.tree, 'a queued continuation starts a fresh oversized parse after the callback returns');
    assert.equal(reconciliationParseStats().parsed - before.parsed, 2);
  }
});

test('#331 active authored syntax honors explicit parser generations and custom raw sections', async () => {
  const { parseReconciliationReferenceView: reparse } = await import('./reconciliation-markdown-ast.mjs?active-scope-generation');
  withScopedDocumentSyntax(longBody, (raw) => {
    const original = scopedAuthoredView(longBody, raw);
    assert.equal(scopedAuthoredView(longBody, { ...raw, occurrences: raw.sections }), original,
      'the reference resolver wrapper retains the internally shared sections');
    const custom = { ...raw, sections: raw.sections.map((section) => section.slug === 'unknowns'
      ? { ...section, title: 'Custom raw Unknowns title' } : section) };
    const customized = scopedAuthoredView(longBody, custom);
    assert.equal(customized.tree, raw.tree);
    assert.equal(customized.sections.find((section) => section.slug === 'unknowns').title, 'Custom raw Unknowns title',
      'matching tree identity alone cannot replace explicitly supplied raw section contents with the active view');
    const fresh = reparse(longBody);
    assert.notEqual(fresh.tree, raw.tree);
    const fromFresh = scopedAuthoredView(longBody, fresh);
    assert.equal(fromFresh.tree, fresh.tree, 'an explicit raw generation keeps its own native node identities');
    assert.equal(scopedAuthoredView(longBody), original, 'custom and foreign views cannot replace the active authored view');
    assert.equal(sharedReconciliationReferenceView(longBody), raw, 'an unrelated parser generation cannot replace the active tree');
  });
});
