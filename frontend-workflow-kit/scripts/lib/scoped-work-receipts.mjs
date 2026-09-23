// Explicit request coverage_reports -> existing Stage 04 Markdown attachments.
// This is file-backed receipt integrity, NOT semantic coverage, reviewer identity,
// human approval or an execution permit. Ordinary reconciliation is unchanged.
import path from 'node:path';
import { splitFrontmatter } from './util.mjs';
import { canonicalRepositoryPath } from './artifact-path.mjs';
import { readCurrentBytes, hashBytes } from './current-work-request.mjs';
import { decodeGitUtf8 } from './visual-refresh-git-objects.mjs';
import { parseReconciliationReferenceView } from './reconciliation-markdown-ast.mjs';
import { decodeScopedYaml, parseWorkCoverageReceipt, parseWorkCoverageReceipts } from './scoped-work-declarations.mjs';
import { workPath, workSet, ScopedWorkContractError } from './scoped-work-request.mjs';
import { scopeSet } from './scoped-work-normalize.mjs';
import { inspectScopedSourceCoverage } from './scoped-work-coverage.mjs';

const fail = (message) => { throw new ScopedWorkContractError(`SW-RECEIPT-FILE: ${message}`); };
const identity = (receipt) => JSON.stringify([receipt.owner, receipt.unit, receipt.input_id]);
function reader(projectRoot) {
  if (typeof projectRoot !== 'string' || !path.isAbsolute(projectRoot) || path.resolve(projectRoot) !== projectRoot) {
    fail('canonical absolute snapshot project root required');
  }
  return (file, expected) => {
    workPath(file, 'coverage report/read-set path');
    const canonical = canonicalRepositoryPath(projectRoot, file,
      { required: true, type: 'file', label: 'scoped coverage report' });
    const bytes = readCurrentBytes(canonical.absolute, 'scoped coverage report');
    const sha256 = hashBytes(bytes);
    if (expected !== undefined && expected !== sha256) fail(`snapshot changed: ${file}`);
    return { bytes, file, sha256 };
  };
}
function pinnedReadSet(read, rows) {
  const files = new Map();
  for (const row of rows) {
    if (files.has(row.file) && files.get(row.file) !== row.sha256) fail(`conflicting snapshots: ${row.file}`);
    files.set(row.file, row.sha256);
  }
  return scopeSet([...files].map(([file, sha256]) => {
    read(file, sha256); // Re-resolve the path too: replacement symlinks are not pins.
    return { file, sha256 };
  }));
}
function fencedValue(body, node, file) {
  const start = node.position?.start?.offset, end = node.position?.end?.offset;
  if (!Number.isInteger(start) || !Number.isInteger(end)) fail(`missing fence positions: ${file}`);
  const raw = body.slice(start, end).replace(/\r\n|\r/g, '\n');
  const lines = raw.split('\n');
  const opener = /^ {0,3}(`{3,}|~{3,})[ \t]*work-coverage[ \t]*$/.exec(lines[0]);
  if (!opener || node.meta) fail(`noncanonical work-coverage fence: ${file}`);
  const closing = new RegExp(`^ {0,3}${opener[1][0]}{${opener[1].length},}[ \t]*$`);
  if (lines.length < 2 || !closing.test(lines.at(-1))) fail(`unclosed work-coverage fence: ${file}`);
  return decodeScopedYaml(node.value.replace(/\r\n|\r/g, '\n'), `work-coverage in ${file}`);
}

export function loadScopedCoverageReports({ projectRoot, coverage_reports = [] } = {}) {
  const read = reader(projectRoot);
  const paths = workSet(coverage_reports, (file) => workPath(file, 'coverage report'), 'coverage_reports');
  const records = [], reads = [];
  for (const file of paths) {
    const raw = read(file);
    reads.push({ file, sha256: raw.sha256 });
    const document = splitFrontmatter(decodeGitUtf8(raw.bytes, 'scoped coverage report'));
    if (document.parseError) fail(`invalid report frontmatter: ${file}`);
    // B §7 attaches to existing review Markdown; no new required directory,
    // artifact type or report frontmatter is invented. The receipt owns its
    // version/review_scope; v2 Items remain enforced by the source resolver.
    const body = document.body;
    const nodes = parseReconciliationReferenceView(body).tree.children
      .filter((node) => node.type === 'code' && node.lang === 'work-coverage');
    if (!nodes.length) fail(`no root work-coverage fence: ${file}`);
    for (const node of nodes) records.push({
      file, sha256: raw.sha256,
      receipt: parseWorkCoverageReceipt(fencedValue(body, node, file)),
    });
  }
  // Across files as well as blocks: never pick the first/latest matching receipt.
  const receipts = parseWorkCoverageReceipts(records.map((record) => record.receipt));
  const byIdentity = new Map(records.map((record) => [identity(record.receipt), record]));
  return { receipts, records: receipts.map((receipt) => byIdentity.get(identity(receipt))),
    read_set: pinnedReadSet(read, reads) };
}

export function inspectScopedSourceCoverageFromReports({ coverage_reports = [], ...options } = {}) {
  if (Object.hasOwn(options, 'receipts')) fail('in-memory receipts cannot replace selected report files');
  const reports = loadScopedCoverageReports({ projectRoot: options.projectRoot, coverage_reports });
  const result = inspectScopedSourceCoverage({ ...options, receipts: reports.receipts });
  const selected = result.receipt ? reports.records.find((record) => identity(record.receipt) === identity(result.receipt)) : null;
  return { ...result, coverage_report: selected ? { file: selected.file, sha256: selected.sha256 } : null,
    coverage_reports: reports.records,
    read_set: pinnedReadSet(reader(options.projectRoot), [...reports.read_set, ...result.read_set]) };
}
