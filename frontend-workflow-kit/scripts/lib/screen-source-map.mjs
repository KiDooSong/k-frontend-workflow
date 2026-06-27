// Screen Source Map parser + warning-first diagnostics (doctor).
//
// The map (docs/frontend-workflow/_meta/screen-source-map.md) joins external source
// aliases (planning codes, design codes, Figma node ids) to workflow-owned canonical
// Screen IDs. Source ids are evidence, not identity. These diagnostics are advisory
// only (doctor severity warning/info) and never hard-fail — the map is optional and
// cold-start adoption must not break.
import path from 'node:path';
import {
  exists,
  findFiles,
  isDir,
  readFileSafe,
  splitFrontmatter,
} from './util.mjs';
import { parseTables, col, hasHeader } from './spec.mjs';
import { collectInputArtifacts } from './input-artifact.mjs';

export const SCREEN_SOURCE_MAP_STATUS_VALUES = [
  'candidate',
  'confirmed',
  'ambiguous',
  'split',
  'merged',
  'deprecated',
];

// 권장 위치: docs/frontend-workflow/_meta/screen-source-map.md (reconciliation-register 와 같은 meta-register).
export function screenSourceMapPath(docsDir) {
  return path.join(docsDir, '_meta', 'screen-source-map.md');
}

// 셀에서 alias 토큰들을 뽑는다 — 콤마/공백 구분, '-'·빈칸·템플릿 placeholder({X})는 버린다.
function splitAliases(cell) {
  if (!cell) return [];
  return String(cell)
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter((s) => s && s !== '-' && !s.startsWith('{'));
}

// 단일 값 셀 정리 — '-'·placeholder 는 빈 문자열로.
function cleanCell(value) {
  const v = (value || '').trim();
  if (!v || v === '-' || v.startsWith('{')) return '';
  return v;
}

// screen-source-map.md 본문을 파싱한다.
//   { exists, table, rows: [{ canonicalId, domain, route, screenSpecPath, planning[], design[], figmaNodes[], sourceInputs[], status, notes }] }
// signature(Canonical Screen ID + Mapping Status) 표만 고른다 — Mapping Status 범례/다중성 표에 속지 않게.
export function parseScreenSourceMap(raw) {
  if (raw == null) return { exists: false, table: false, rows: [] };
  const { body } = splitFrontmatter(raw);
  const tables = parseTables(body);
  const table =
    tables.find((t) => hasHeader(t.headers, 'Canonical Screen ID') && hasHeader(t.headers, 'Mapping Status')) ||
    null;
  if (!table) return { exists: true, table: false, rows: [] };
  const rows = [];
  for (const r of table.rows) {
    const canonicalId = (col(r, 'Canonical Screen ID') || '').trim();
    if (!canonicalId || canonicalId.startsWith('{')) continue; // 빈 행 / 템플릿 placeholder
    rows.push({
      canonicalId,
      domain: cleanCell(col(r, 'Domain')),
      route: cleanCell(col(r, 'Route')),
      screenSpecPath: cleanCell(col(r, 'ScreenSpec Path')),
      planning: splitAliases(col(r, 'Planning IDs')),
      design: splitAliases(col(r, 'Design IDs')),
      figmaNodes: splitAliases(col(r, 'Figma Node IDs')),
      sourceInputs: splitAliases(col(r, 'Source Inputs')),
      status: (col(r, 'Mapping Status') || '').trim().toLowerCase(),
      notes: (col(r, 'Decision / Notes') || '').trim(),
    });
  }
  return { exists: true, table: true, rows };
}

// 기존 screen-spec 들의 screen_id → { route, file } 색인.
function indexScreenSpecs(docsDir) {
  const ids = new Map();
  const domainsDir = path.join(docsDir, 'domains');
  if (!isDir(domainsDir)) return ids;
  for (const file of findFiles(domainsDir, 'screen-spec.md')) {
    const { data, parseError } = splitFrontmatter(readFileSafe(file));
    if (parseError || !data) continue;
    const id = (data.screen_id || '').toString().trim();
    if (id) ids.set(id, { route: (data.route || '').toString().trim(), file });
  }
  return ids;
}

function asScreenList(value) {
  if (Array.isArray(value)) return value;
  return value === undefined || value === null || value === '' ? [] : [value];
}

// warning-first 진단 (doctor 가 호출). map 파일이 없으면 NO-OP(cold-start 안전).
//   - screen-source-map-screen-missing : canonical id 에 ScreenSpec 부재 (create-screen 필요)
//   - screen-source-map-route-mismatch  : map route ≠ ScreenSpec route (route 는 evidence)
//   - screen-source-map-duplicate-alias : 같은 source alias 가 여러 canonical 에, split/ambiguous 없이
//   - screen-source-map-input-unmapped  : input affected_screens 가 canonical 도 map 도 아님 (raw alias)
//   - screen-source-map-status-enum     : Mapping Status enum 위반
//   - screen-source-map-unparsable      : map 은 있으나 표를 못 읽음
export function collectScreenSourceMapFindings({ docsDir } = {}) {
  const findings = [];
  if (!docsDir || !isDir(docsDir)) return findings;
  const mapFile = screenSourceMapPath(docsDir);
  if (!exists(mapFile)) return findings; // 선택적 artifact — 도입 전이면 조용히 통과

  const parsed = parseScreenSourceMap(readFileSafe(mapFile));
  if (!parsed.table) {
    findings.push({
      severity: 'warning',
      check: 'screen-source-map-unparsable',
      message:
        'screen-source-map.md exists but no parsable mapping table (Canonical Screen ID + Mapping Status columns) was found',
    });
    return findings;
  }

  const specIds = indexScreenSpecs(docsDir);
  const aliasToRows = new Map(); // alias -> [{ canonicalId, status }]

  for (const row of parsed.rows) {
    if (row.status && !SCREEN_SOURCE_MAP_STATUS_VALUES.includes(row.status)) {
      findings.push({
        severity: 'warning',
        check: 'screen-source-map-status-enum',
        screen_id: row.canonicalId,
        status: row.status,
        message: `Mapping Status '${row.status}' for ${row.canonicalId} is not one of ${SCREEN_SOURCE_MAP_STATUS_VALUES.join('|')}`,
      });
    }

    const spec = specIds.get(row.canonicalId);
    if (!spec) {
      // deprecated/merged 행은 의도적으로 ScreenSpec 이 없을 수 있어 제외.
      if (row.status !== 'deprecated' && row.status !== 'merged') {
        findings.push({
          severity: 'warning',
          check: 'screen-source-map-screen-missing',
          screen_id: row.canonicalId,
          status: row.status || '(none)',
          message: `screen-source-map maps ${row.canonicalId} (status: ${row.status || '(none)'}) but no ScreenSpec has that screen_id — run workflow:create-screen once identity is confirmed`,
        });
      }
    } else if (row.route && spec.route && row.route !== spec.route) {
      findings.push({
        severity: 'warning',
        check: 'screen-source-map-route-mismatch',
        screen_id: row.canonicalId,
        map_route: row.route,
        spec_route: spec.route,
        message: `screen-source-map route '${row.route}' for ${row.canonicalId} differs from ScreenSpec route '${spec.route}' (route hints are evidence, not identity — reconcile the route)`,
      });
    }

    for (const alias of [...row.planning, ...row.design, ...row.figmaNodes]) {
      if (!aliasToRows.has(alias)) aliasToRows.set(alias, []);
      aliasToRows.get(alias).push({ canonicalId: row.canonicalId, status: row.status });
    }
  }

  // duplicate alias → multiple canonical screens. split/ambiguous 가 다중성을 명시하면 허용.
  const ACKNOWLEDGED = new Set(['split', 'ambiguous']);
  for (const [alias, list] of [...aliasToRows].sort((a, b) => a[0].localeCompare(b[0]))) {
    const canon = new Set(list.map((x) => x.canonicalId));
    if (canon.size < 2) continue;
    const acknowledged = list.every((x) => ACKNOWLEDGED.has(x.status));
    if (!acknowledged) {
      findings.push({
        severity: 'warning',
        check: 'screen-source-map-duplicate-alias',
        alias,
        canonical_ids: [...canon].sort(),
        message: `source alias '${alias}' maps to multiple canonical screens (${[...canon].sort().join(', ')}) without split/ambiguous status — do not auto-route; mark split (intentional) or ambiguous (needs decision)`,
      });
    }
  }

  // input affected_screens 가 canonical 도 map entry 도 아니면 raw source alias 로 본다(scope-unclear).
  // map 이 존재한다는 것 자체가 매핑 흐름에 opt-in 한 신호이므로 이때만 발화한다.
  const canonicalIds = new Set([...specIds.keys(), ...parsed.rows.map((r) => r.canonicalId)]);
  for (const a of collectInputArtifacts(path.join(docsDir, 'inputs'))) {
    if (a.parseError) continue;
    const inputId = a.fm.input_id || path.basename(a.file, '.md');
    for (const s of asScreenList(a.fm.affected_screens)) {
      const token = String(s).trim();
      if (!token || token.startsWith('{')) continue;
      if (!canonicalIds.has(token)) {
        findings.push({
          severity: 'warning',
          check: 'screen-source-map-input-unmapped',
          input_id: inputId,
          screen: token,
          message: `input ${inputId} references affected_screen '${token}' that is neither a canonical screen_id nor a Screen Source Map entry — treat it as a source alias (scope-unclear) and map it before implementation`,
        });
      }
    }
  }

  return findings.sort((x, y) =>
    `${x.check}:${x.screen_id || ''}:${x.alias || ''}:${x.input_id || ''}:${x.screen || ''}`.localeCompare(
      `${y.check}:${y.screen_id || ''}:${y.alias || ''}:${y.input_id || ''}:${y.screen || ''}`,
    ),
  );
}
