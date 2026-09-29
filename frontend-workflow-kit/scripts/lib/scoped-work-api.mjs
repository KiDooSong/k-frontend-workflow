// D selected API evidence on one immutable snapshot. Never a permission result.
// Reuse the owner selector parser and actual API v2 analyzer; do not synthesize a
// confirmed/integrated owner. Manifest evidence and path predicates come later.
import path from 'node:path';
import { splitFrontmatter } from './util.mjs';
import { analyzeApiCandidateContract, loadScreenSpec, parseTables, col } from './spec.mjs';
import { parseReconciliationMarkdown } from './reconciliation-markdown-ast.mjs';
import { canonicalJson, ownerParts, readCurrentBytes } from './current-work-request.mjs';
import { decodeGitUtf8 } from './visual-refresh-git-objects.mjs';
import { ScopedWorkContractError, workText, workUnitId } from './scoped-work-request.mjs';
import { parseScopedOwner } from './scoped-work-declarations.mjs';
import { createScopedReferenceResolver, scopedRawTable } from './scoped-work-refs.mjs';

const fail = (code, message) => { throw new ScopedWorkContractError(`${code}: ${message}`); };
const equal = (a, b) => canonicalJson(a) === canonicalJson(b);

export function createScopedApiResolver({ targetIndex, projectRoot, layout } = {}) {
  const refs = createScopedReferenceResolver({ targetIndex, projectRoot });
  if (typeof layout?.resolvePaths !== 'function') fail('SW-API-LAYOUT', 'resolved layout required');

  function unit(artifactId, owner, unitId) {
    workText(artifactId, 'API owner artifact');
    workUnitId(unitId);
    const identity = ownerParts(owner);
    const artifact = refs.contract(`artifact:${artifactId}`);
    const expectedType = identity.kind === 'screen' ? 'screen-spec' : 'shared-surface-spec';
    const fm = artifact.metadata;
    if (artifact.artifact_id !== artifactId || fm.artifact_type !== expectedType ||
        fm[`${identity.kind}_id`] !== identity.id || typeof fm.domain !== 'string' || !fm.domain) {
      fail('SW-API-OWNER', 'API declaration must belong to the exact canonical owner/domain');
    }
    // Load the existing spec model, then compare its body/metadata against both
    // the bounded source read and the supplied snapshot index. The surrounding
    // runtime must supply the immutable snapshot; this is not snapshot capture.
    const file = path.join(projectRoot, artifact.file);
    const current = splitFrontmatter(decodeGitUtf8(readCurrentBytes(file, 'scoped API owner'), 'scoped API owner'));
    const spec = loadScreenSpec(file);
    const indexed = targetIndex.artifacts.get(artifactId);
    if (!current.hasFrontmatter || current.parseError || !spec.hasFrontmatter || spec.parseError ||
        current.body !== indexed.body || spec.body !== current.body ||
        !equal(current.data, fm) || !equal(spec.frontmatter, fm)) {
      fail('SW-API-SNAPSHOT', 'API owner differs from its indexed snapshot');
    }
    const declared = parseScopedOwner(fm.work_execution, owner);
    const selectedUnit = declared?.units.find((entry) => entry.id === unitId);
    if (!selectedUnit) fail('SW-API-UNIT', 'declared owner/unit required');
    const selectors = selectedUnit.api_candidates;
    const result = { owner, unit: unitId, artifact_id: artifactId, file: artifact.file,
      metadata: fm, selections: selectors, candidates: [] };
    // A behavior/visual unit may validly omit APIs. Do not invent an endpoint or
    // require an unrelated API table; the later profile checks its actual needs.
    if (!selectors.length) return result;

    const sections = parseReconciliationMarkdown(current.body).occurrences
      .filter((entry) => entry.slug === 'api-candidates');
    if (sections.length !== 1) fail('SW-API-SECTION', 'one canonical API Candidates section required');
    const options = { layout, domain: fm.domain };
    const analyzeTable = (table) => analyzeApiCandidateContract({ ...spec,
      sections: { ...spec.sections, 'api candidates': table.sourceText } }, options);
    const tables = sections[0].tables.filter((table) => analyzeTable(table).version === 2);
    const analysis = analyzeApiCandidateContract(spec, options);
    if (tables.length !== 1 || analysis.version !== 2 || !analysis.valid) {
      fail('SW-API-CONTRACT', `valid unique API Candidates v2 required: ${analysis.issues.map((e) => e.code).join(', ')}`);
    }
    const table = tables[0];
    const raw = scopedRawTable(table);
    const tableAnalysis = analyzeTable(table);
    // AST establishes the real table, raw source retains all columns, and the
    // existing analyzer must consume exactly that table. Comment removal, fake
    // fenced tables, generated blocks or a different section cannot substitute it.
    const nativeTables = parseTables(spec.sections['api candidates']);
    if (!tableAnalysis.valid || !equal(tableAnalysis.candidates, analysis.candidates) ||
        nativeTables.filter((t) => equal(t.headers, raw.headers) && equal(t.cell_rows, raw.cells)).length !== 1) {
      fail('SW-API-RAW', 'raw API table differs from the existing analyzer input');
    }
    const rows = raw.rows.map((row, index) => ({ row, cells: raw.cells[index] }))
      .filter(({ row }) => ['Method', 'Path', 'Confidence', 'Gate', 'Tracking', 'Slice Paths']
        .some((name) => col(row, name)));
    if (rows.length !== analysis.candidates.length) fail('SW-API-RAW', 'candidate row correspondence is ambiguous');
    result.candidates = selectors.map((selector) => {
      const matches = analysis.candidates.map((candidate, index) => ({ candidate, index }))
        .filter(({ candidate }) => candidate.method === selector.method && candidate.path === selector.path);
      if (matches.length !== 1) fail('SW-API-SELECTION', `missing or ambiguous ${selector.method} ${selector.path}`);
      const { candidate, index } = matches[0];
      let tracking = null;
      if (candidate.gate === 'deferred' && candidate.tracking?.startsWith('unknown:')) {
        // The existing analyzer checks local Unknown status. Also require its
        // exact canonical raw row so duplicate/rendered IDs cannot supply it.
        tracking = refs.contract(`${candidate.tracking}@${artifactId}`);
        const row = Object.fromEntries(tracking.selection.headers.map((header, i) => [header, tracking.selection.cells[i]]));
        if (String(col(row, 'Status') || '').toLowerCase() !== 'open') fail('SW-API-TRACKING', 'canonical open Unknown required');
      }
      return { selection: structuredClone(selector), headers: [...raw.headers], cells: [...rows[index].cells],
        candidate: structuredClone(candidate), tracking };
    });
    // Unconfirmed/deferred facts are retained for R1; resolution must not upgrade
    // them or mistake them for selected confirmed-active permission/coverage.
    return result;
  }
  return { unit };
}
