// Generic ScreenSpec stub scaffolder (workflow:create-screen).
//
// Canonical screen identity (screen_id / route / domain / screen-spec path) is
// workflow-owned. Source ids (planning codes, design codes, Figma node ids,
// slugs, input ids) are aliases recorded in the Screen Source Map, not identity.
// This module turns an already-decided canonical identity into a stub screen-spec
// under docs/frontend-workflow/domains/{domain}/screens/{screen-slug}/screen-spec.md.
//
// It deliberately does NOT: invent screen ids, resolve Open Decisions, promote
// status to confirmed, update navigation-map, or touch implementation code.
// Contract (frontmatter shape) single source: templates/screen/screen-spec.template.md.
import fs from 'node:fs';
import path from 'node:path';
import { exists, findFiles, isDir, readFileSafe, splitFrontmatter } from './util.mjs';

export class ScreenScaffoldError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ScreenScaffoldError';
  }
}

// screen_id / artifact_id 형식: frontmatter.schema.json 의 screen_id 패턴과 동일.
export const SCREEN_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;
// domain 형식: frontmatter.schema.json 의 domain 패턴과 동일.
export const DOMAIN_PATTERN = /^[a-z0-9-]+$/;

// canonical screen_id 에서 디렉토리 slug 를 파생한다 (대문자/구분자 정규화). --screen-slug 로 오버라이드 가능.
export function screenSlugFromId(screenId) {
  return String(screenId || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function trimmed(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function isoDate(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

// 입력 source 들을 frontmatter sources 배열({type, ref})로 정규화한다.
//   - sources: [{ type, ref }] 또는 "type:ref" 문자열 배열
//   - sourceInput: input_id 단축 입력 → { type: input, ref: <input_id> }
function normalizeSources({ sources, sourceInput }) {
  const out = [];
  for (const entry of Array.isArray(sources) ? sources : sources ? [sources] : []) {
    if (entry && typeof entry === 'object' && entry.type && entry.ref) {
      out.push({ type: String(entry.type).trim(), ref: String(entry.ref).trim() });
      continue;
    }
    const raw = String(entry).trim();
    if (!raw) continue;
    const idx = raw.indexOf(':');
    if (idx === -1) {
      out.push({ type: 'source', ref: raw });
    } else {
      out.push({ type: raw.slice(0, idx).trim() || 'source', ref: raw.slice(idx + 1).trim() });
    }
  }
  const input = trimmed(sourceInput);
  if (input) out.push({ type: 'input', ref: input });
  return out;
}

// 기존 screen-spec 들을 스캔해 screen_id / route 사용 현황을 모은다(유일성 검사용).
//   { idToPaths: Map<screen_id, [absPath]>, routeToPaths: Map<route, [absPath]> }
function scanExistingSpecs(domainsDir) {
  const idToPaths = new Map();
  const routeToPaths = new Map();
  if (!isDir(domainsDir)) return { idToPaths, routeToPaths };
  for (const file of findFiles(domainsDir, 'screen-spec.md')) {
    const { data, parseError } = splitFrontmatter(readFileSafe(file));
    if (parseError || !data) continue;
    const abs = path.resolve(file);
    const id = trimmed(data.screen_id);
    const route = trimmed(data.route);
    if (id) {
      if (!idToPaths.has(id)) idToPaths.set(id, []);
      idToPaths.get(id).push(abs);
    }
    if (route) {
      if (!routeToPaths.has(route)) routeToPaths.set(route, []);
      routeToPaths.get(route).push(abs);
    }
  }
  return { idToPaths, routeToPaths };
}

function yamlScalar(value) {
  return JSON.stringify(String(value));
}

// stub screen-spec 본문을 렌더링한다. STUB = frontmatter(canonical identity) + 안내 주석 (+ 제목).
//   본문 ## 섹션을 만들지 않으므로 readiness 의 isStub 이 true 로 유지된다(screen-skeleton 천장).
export function renderScreenSpec(spec, { frontmatterOnly = false } = {}) {
  const fm = [];
  fm.push(`artifact_id: ${spec.artifact_id}`);
  fm.push('artifact_type: screen-spec');
  fm.push(`domain: ${spec.domain}`);
  fm.push(`screen_id: ${spec.screen_id}`);
  fm.push(`route: ${yamlScalar(spec.route)}`);
  if (spec.route_entry) fm.push(`route_entry: ${yamlScalar(spec.route_entry)}`);
  if (spec.screen_entry) fm.push(`screen_entry: ${yamlScalar(spec.screen_entry)}`);
  fm.push(`status: ${spec.status}`);
  if (spec.sources.length) {
    fm.push('sources:');
    for (const s of spec.sources) fm.push(`  - { type: ${s.type}, ref: ${yamlScalar(s.ref)} }`);
  }
  fm.push('depends_on: [navigation-map]');
  if (spec.last_reviewed) fm.push(`last_reviewed: ${yamlScalar(spec.last_reviewed)}`);

  const stubNote = [
    '<!--',
    '  STUB: 화면 발굴 단계 산출물. canonical identity(frontmatter)만 채우고 본문은 비워 둔다.',
    '  source code / Figma node 매핑은 Screen Source Map(_meta/screen-source-map.md)이 단일 출처다 — 여기 적지 않는다.',
    '  구현 직전 implement-screen 절차로 본문(State Matrix 등)을 작성한다. status 승격(confirmed)은 사람만.',
    '-->',
  ];

  const lines = ['---', ...fm, '---', ''];
  lines.push(...stubNote);
  if (!frontmatterOnly) {
    lines.push('', `# ScreenSpec: ${spec.title}`);
  }
  lines.push('');
  return lines.join('\n');
}

// canonical identity 로 stub screen-spec 을 만든다(쓰지는 않음 — 순수 빌드/검증).
//   필수: docsDir, domain, screen_id(screenId), route.
export function buildScreenSpec(options = {}) {
  const errors = [];
  const domain = trimmed(options.domain);
  const screenId = trimmed(options.screenId ?? options.screen_id);
  const route = trimmed(options.route);

  if (!domain) errors.push('domain is required');
  if (!screenId) errors.push('screen_id is required');
  if (!route) errors.push('route is required');
  if (domain && !DOMAIN_PATTERN.test(domain)) {
    errors.push(`domain must match ${DOMAIN_PATTERN} (lowercase letters/digits/hyphen)`);
  }
  if (screenId && !SCREEN_ID_PATTERN.test(screenId)) {
    errors.push(`screen_id must match ${SCREEN_ID_PATTERN}`);
  }
  if (route && !route.startsWith('/')) {
    errors.push(`route must start with '/' (got: ${route})`);
  }
  if (errors.length) throw new ScreenScaffoldError(errors.join('\n'));

  const screenSlug = trimmed(options.screenSlug ?? options.screen_slug) || screenSlugFromId(screenId);
  if (!screenSlug) throw new ScreenScaffoldError('screen-slug could not be derived; pass --screen-slug');

  const spec = {
    artifact_id: `${screenId}-screen-spec`,
    domain,
    screen_id: screenId,
    route,
    route_entry: trimmed(options.routeEntry ?? options.route_entry),
    screen_entry: trimmed(options.screenEntry ?? options.screen_entry),
    status: 'draft',
    sources: normalizeSources({ sources: options.sources, sourceInput: options.sourceInput ?? options.source_input }),
    last_reviewed: trimmed(options.lastReviewed ?? options.last_reviewed ?? options.date),
    title: trimmed(options.title) || screenId,
    screenSlug,
  };
  return spec;
}

// stub screen-spec 을 docsDir 하위에 쓴다. 기본은 overwrite 거부, screen_id 유일성 강제, route 중복은 경고.
//   options: { docsDir, domain, screenId, route, screenSlug, routeEntry, screenEntry, title,
//              sources, sourceInput, lastReviewed|date, frontmatterOnly, overwrite, dryRun }
export function writeScreenSpec(options = {}) {
  const docsDir = path.resolve(options.docsDir || 'docs/frontend-workflow');
  const spec = buildScreenSpec(options);
  const domainsDir = path.join(docsDir, 'domains');
  const outputPath = path.join(domainsDir, spec.domain, 'screens', spec.screenSlug, 'screen-spec.md');
  const outputResolved = path.resolve(outputPath);

  const { idToPaths, routeToPaths } = scanExistingSpecs(domainsDir);

  // screen_id 유일성: 다른 파일이 이미 같은 screen_id 를 쓰면 거부(canonical id 충돌 = 라우팅 모호).
  const idOwners = (idToPaths.get(spec.screen_id) || []).filter((p) => p !== outputResolved);
  if (idOwners.length) {
    throw new ScreenScaffoldError(
      `screen_id already exists: ${spec.screen_id} (in ${idOwners.map((p) => path.relative(docsDir, p)).join(', ')})\n` +
        'Pick a distinct canonical screen_id, or if this is an intentional split, record it in the Screen Source Map (status: split) first.',
    );
  }

  // overwrite 거부(기본): 같은 경로에 이미 screen-spec 이 있으면 막는다.
  const outputExists = exists(outputPath);
  if (outputExists && !options.overwrite) {
    throw new ScreenScaffoldError(
      `screen-spec already exists: ${path.relative(docsDir, outputPath)}\n` +
        'Edit it directly, choose a different --screen-slug, or pass --overwrite intentionally.',
    );
  }

  const warnings = [];
  // route 유일성: 다른 파일이 이미 같은 route 를 쓰면 경고(차단 아님 — validate 검사 5 가 하드 게이트).
  const routeOwners = (routeToPaths.get(spec.route) || []).filter((p) => p !== outputResolved);
  if (routeOwners.length) {
    warnings.push(
      `route already used by ${routeOwners.map((p) => path.relative(docsDir, p)).join(', ')}: ${spec.route} ` +
        '(route must be unique — validate check 5 will fail until resolved)',
    );
  }

  const text = renderScreenSpec(spec, { frontmatterOnly: !!options.frontmatterOnly });
  if (!options.dryRun) {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, text, 'utf8');
  }

  return {
    screen_id: spec.screen_id,
    route: spec.route,
    domain: spec.domain,
    screen_slug: spec.screenSlug,
    artifact_id: spec.artifact_id,
    outputPath,
    text,
    wrote: !options.dryRun,
    overwritten: outputExists && !!options.overwrite,
    warnings,
    next_steps: nextSteps(docsDir, spec),
  };
}

function nextSteps(docsDir, spec) {
  return [
    `navigation-map 을 확인/갱신한다 (자동 수정 안 함): ${path.relative(docsDir, path.join(docsDir, 'app', 'navigation-map.md'))}`,
    `Screen Source Map 에 ${spec.screen_id} 의 source alias 행을 갱신한다: ${path.relative(docsDir, path.join(docsDir, '_meta', 'screen-source-map.md'))}`,
    'run workflow:state → workflow:readiness → workflow:validate',
  ];
}
