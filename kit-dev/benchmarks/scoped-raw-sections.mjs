// Public #360 synthetic probe for custom raw section deletion.
// Usage: node scoped-raw-sections.mjs KIT_ROOT [--check]
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const [kitArgument, flag, ...extra] = process.argv.slice(2);
if (!kitArgument || extra.length || (flag && flag !== '--check')) throw new Error('Usage: node scoped-raw-sections.mjs KIT_ROOT [--check]');
const kit = path.resolve(kitArgument);
const load = (name) => import(pathToFileURL(path.join(kit, 'scripts/lib', name + '.mjs')));
const { parseReconciliationReferenceView } = await load('reconciliation-markdown-ast');
const { scopedAuthoredView, scopedAuthoredSections, sharedScopedAuthoredSections,
  withScopedDocumentSyntax } = await load('scoped-work-authored');
const body = [
  '## API Candidates', '', '| Method | Path |', '|---|---|', '| GET | /items |', '',
  '## Unknowns', '', '| ID | Question |', '|---|---|', '| U-001 | Pending? |', '',
  '## Notes', '', 'Unrelated notes.',
].join('\n');
const raw = parseReconciliationReferenceView(body);
const observe = (read) => {
  try { return read().map(({ slug, tables }) => [slug, tables.length]); }
  catch (error) { return { type: error.name, message: error.message }; }
};
const show = (name) => observe(() => scopedAuthoredSections(body, name, raw));
const before = show('unknowns');
const canonicalBefore = sharedScopedAuthoredSections(body, 'unknowns');
raw.sections.splice(raw.sections.findIndex(({ slug }) => slug === 'api-candidates'), 1);
const after = Object.fromEntries(['api candidates', 'unknowns', 'notes'].map((name) => [name, show(name)]));
const canonical = observe(() => sharedScopedAuthoredSections(body, 'unknowns'));
const canonicalReused = sharedScopedAuthoredSections(body, 'unknowns') === canonicalBefore;
const emptyBody = '## Notes\n\nNo table uses the custom container.\n';
const emptyRaw = parseReconciliationReferenceView(emptyBody), revoked = Proxy.revocable([], {});
revoked.revoke(); emptyRaw.sections[1].tables = revoked.proxy;
const unusedRevoked = observe(() => scopedAuthoredSections(emptyBody, 'notes', emptyRaw));
const active = {};
for (const kind of ['accessor', 'proxy']) {
  const activeBody = `## Notes\n\nActive ${kind} interpretation.\n`;
  active[kind] = withScopedDocumentSyntax(activeBody, (canonical) => {
    const original = scopedAuthoredView(activeBody, canonical);
    original.byName.get('notes')[0].title = 'Edited active view';
    let reads = 0;
    const custom = kind === 'accessor' ? {
      get tree() { reads += 1; return canonical.tree; },
      get sections() { reads += 1; return canonical.sections; },
    } : new Proxy(canonical, { get(target, key, receiver) {
      if (key === 'tree' || key === 'sections') reads += 1;
      return Reflect.get(target, key, receiver);
    } });
    const fresh = scopedAuthoredView(activeBody, custom);
    return { reusedActive: fresh === original, reads, title: fresh.byName.get('notes')[0].title,
      preservedActive: scopedAuthoredView(activeBody) === original };
  });
}
const result = { before, after, canonical, canonicalReused, unusedRevoked, active };
console.log(JSON.stringify(result));
if (flag === '--check') {
  assert.deepEqual(before, [['unknowns', 1]]);
  assert.deepEqual(after, { 'api candidates': [], unknowns: [['unknowns', 1]], notes: [['notes', 0]] });
  assert.deepEqual(canonical, [['unknowns', 1]]);
  assert.equal(canonicalReused, true);
  assert.deepEqual(unusedRevoked, [['notes', 0]]);
  for (const value of Object.values(active)) assert.deepEqual(value,
    { reusedActive: false, reads: 2, title: 'Notes', preservedActive: true });
}
