// Advisory authoring diagnostics only. Never feed these findings into contract.issues,
// derived facts or path authorization. The caller supplies the actual v2 analysis.
import { parseApiCandidates } from './spec.mjs';
import { splitFrontmatter } from './util.mjs';
import { fromMarkdown } from 'mdast-util-from-markdown';
import { gfmFromMarkdown } from 'mdast-util-gfm';
import { gfm } from 'micromark-extension-gfm';

export const UNREPRESENTED_LEGACY_API_CODE = 'API-V2-LEGACY-UNREPRESENTED';

const endpointKey = (candidate) => JSON.stringify([candidate.method, candidate.path]);
const blankKeepingLines = (text) => text.replace(/[^\r\n]/g, ' ');

// Pure: source is the original whole file, and contract is the unmodified result of
// analyzeApiCandidateContract for that file. Tables and endpoints are NOT reparsed
// with a competing authority grammar. Empty/invalid v2 tables stay v2, never legacy.
export function diagnoseUnrepresentedLegacyApiCandidates({ source, contract, file }) {
  if (contract?.version !== 2 || typeof source !== 'string') return [];
  const represented = new Set(contract.candidates.map(endpointKey));
  const { body } = splitFrontmatter(source);
  const prefix = source.slice(0, source.length - body.length);
  const lineOffset = prefix.split(/\r?\n/).length - 1;
  // Same generated-block boundary as loadScreenSpec, but keep its original lines.
  const scopedBody = body.replace(
    /<!--\s*GENERATED:START[\s\S]*?GENERATED:END[^\n]*-->/g,
    blankKeepingLines,
  );
  const rawLines = scopedBody.split(/\r?\n/);
  // Existing reconciliation Markdown helpers discard list-item positions. Use the
  // same installed CommonMark/GFM AST stack here; it is observation, not authority.
  const tree = fromMarkdown(scopedBody, {
    extensions: [gfm()],
    mdastExtensions: [gfmFromMarkdown()],
  });
  let inApiSection = false;
  let sectionLines = new Set();
  for (let index = 0; index < rawLines.length; index += 1) {
    // Match getSections' H2 scope/last-occurrence rule, not a second table parser.
    const heading = /^##\s+(.+?)\s*$/.exec(rawLines[index]);
    if (heading) {
      inApiSection = heading[1].trim().toLowerCase() === 'api candidates';
      if (inApiSection) sectionLines = new Set();
      continue;
    }
    if (inApiSection) sectionLines.add(index);
  }

  const declarationLines = [];
  function visit(node) {
    // Do not descend into paragraphs, code, HTML, quotes or tables. Thus fenced,
    // indented and inline-code examples, link definitions and prose cannot become
    // candidate declarations merely because a physical line starts with '- GET'.
    if (!['root', 'list', 'listItem'].includes(node.type)) return;
    if (node.type === 'listItem' && node.children[0]?.type === 'paragraph') {
      const index = node.position.start.line - 1;
      if (sectionLines.has(index)) {
        const text = rawLines[index].slice(node.position.start.column - 1);
        if (/^-[\t ]+/.test(text)) declarationLines.push({ text, line: index + lineOffset + 1 });
      }
    }
    for (const child of node.children || []) visit(child);
  }
  visit(tree);

  const unrepresented = new Map();
  for (const { text, line } of declarationLines) {
    // Reuse the unchanged legacy method/path normalization on a single bullet.
    const candidate = parseApiCandidates(text)[0];
    if (!candidate?.method || !candidate.path) continue;
    // Only a literal endpoint-leading declaration, not '- See GET /x for context'.
    const firstToken = candidate.raw.split(/\s+/)[0].toUpperCase();
    if (firstToken !== candidate.method) continue;
    const key = endpointKey(candidate);
    if (represented.has(key)) continue; // Gate and confidence do not affect identity.
    if (!unrepresented.has(key)) {
      unrepresented.set(key, { method: candidate.method, path: candidate.path, lines: [] });
    }
    unrepresented.get(key).lines.push(line);
  }

  return [...unrepresented.values()].map(({ method, path, lines }) => ({
    code: UNREPRESENTED_LEGACY_API_CODE,
    method,
    path,
    line: lines[0],
    lines,
    message:
      `${UNREPRESENTED_LEGACY_API_CODE}: ${file}:${lines[0]} ` +
      `(source lines: ${lines.join(', ')}) ${method} ${path} — ` +
      'legacy candidate declaration is ignored because API Candidates uses a v2 table. ' +
      '실제 후보라면 저자가 v2 표에 좁은 Slice Paths와 필요한 Gate/Tracking을 명시하세요. ' +
      '참고/역사/미채택 설명이라면 별도 ## API Candidate History 절로 옮기거나 후보 선언 형식에서 분리하세요. ' +
      '자동 표 삽입·active/confirmed 승격·경로 권한 추가는 하지 않습니다.',
  }));
}
