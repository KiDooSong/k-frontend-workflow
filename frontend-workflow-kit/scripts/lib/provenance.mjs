import { readFileSafe, splitFrontmatter } from './util.mjs';
import { parseReconciliationMarkdown } from './reconciliation-markdown-ast.mjs';

// Provenance 공통 파서 — RFC3339 timestamp · Source Unit enum · inherit 토큰의 단일 출처.
// 계약: input-reconciliation.md "Reconciliation Contract v2" §Provenance.
// 소비처: 검사 11 input `captured_at`, 검사 12 v2 item 표, figma-component-mapping
// `## Mapping Provenance`의 timestamp / Source Unit / effective source precision.
// 여기 두는 이유: 세 소비처가 같은 형식 판정을 공유해 표류하지 않게 한다(설계 §9.1).

// item 셀에서 input-level 값(frontmatter source_ref/captured_at) 상속을 뜻하는 토큰.
export const INHERIT = 'inherit';

// Source Unit enum — evidence 가 무엇을 세거나 가리키는지의 정밀도 바닥 어휘.
// `n/a` 는 reject 또는 source 없는 purely procedural item 에만 허용(호출부가 판정).
export const SOURCE_UNIT_VALUES = [
  'document',
  'statement',
  'record',
  'instance',
  'node',
  'frame',
  'token',
  'screenshot',
  'measurement',
  'aggregate',
  'n/a',
];

// RFC3339 with timezone: `2026-07-20T10:15:30+09:00` / `2026-07-20T01:15:30Z` (+선택 소수초).
// date-only(`2026-07-20`)·슬래시·타임존 없는 로컬 표기는 거부한다 — capture 시점 비교의 전제가
// 타임존 명시이기 때문(설계 §9.1 금지 목록).
const RFC3339_RE = /^(\d{4})-(\d{2})-(\d{2})[Tt](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?([Zz]|[+-]\d{2}:\d{2})$/;

// 달력 구성요소를 명시 검증한다. Date.parse 에 위임하면 fail-open 이다 — V8 은 `T24:00:00`(자정 이월)
// 같은 값을 스펙상 유효로 정규화하므로, "존재하지 않는 시각이 통과"하는 구멍이 된다. 여기서는
// 월 1–12 · 일 1–(달별, 윤년 반영) · 시 0–23 · 분 0–59 · 초 0–59(윤초 60 은 결정성 위해 거부) ·
// 오프셋 시 0–23/분 0–59 를 직접 확인한다.
function calendarComponentsValid(m) {
  const [, y, mo, d, h, mi, s, tz] = m;
  const year = Number(y);
  const month = Number(mo);
  const day = Number(d);
  if (month < 1 || month > 12) return false;
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const daysInMonth = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
  if (day < 1 || day > daysInMonth) return false;
  if (Number(h) > 23 || Number(mi) > 59 || Number(s) > 59) return false;
  if (tz !== 'Z' && tz !== 'z') {
    const [tzH, tzM] = tz.slice(1).split(':').map(Number);
    if (tzH > 23 || tzM > 59) return false;
  }
  return true;
}

// 문자열이 RFC3339(with timezone) 인지 — 형식 + 달력 구성요소 검증.
export function isRfc3339(value) {
  if (typeof value !== 'string') return false;
  const m = RFC3339_RE.exec(value.trim());
  if (!m) return false;
  return calendarComponentsValid(m);
}

// RFC3339 문자열 → epoch ms. 형식 위반이면 null (호출부가 fail-closed 판단).
export function parseRfc3339(value) {
  if (!isRfc3339(value)) return null;
  return Date.parse(String(value).trim());
}

// Figma/node precision floor shared by Mapping Provenance and visual-evidence
// reconciliation items. SOURCE_UNIT_VALUES remains the enum single source; this
// policy only decides which enum values are sufficiently precise in a Figma
// context. Every accepted unit must still be anchored to an explicit file plus
// node/frame identifier — unit is never inferred from the pointer.
const FIGMA_PRECISION_COARSE_UNITS = new Set(['document', 'statement', 'n/a']);
export const FIGMA_PRECISION_SOURCE_UNITS = SOURCE_UNIT_VALUES.filter(
  (value) => !FIGMA_PRECISION_COARSE_UNITS.has(value),
);
const FIGMA_SOURCE_POINTER_RE = /^figma:\/\/file\/([^/\s?#]+)\/(node|frame)\/([^/\s?#]+)$/;

export function parseFigmaSourcePointer(value) {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  const match = FIGMA_SOURCE_POINTER_RE.exec(text);
  if (!match) return null;
  return {
    file: match[1],
    axis: match[2],
    id: match[3],
    raw: text,
  };
}

export function resolveEffectiveSourceRef(sourceRef, evidenceArtifact) {
  if (typeof sourceRef !== 'string') return null;
  const text = sourceRef.trim();
  if (!text) return null;
  if (text !== INHERIT) return text;
  const inherited = evidenceArtifact?.fm?.source_ref;
  return typeof inherited === 'string' && inherited.trim() !== '' ? inherited.trim() : null;
}

export function inspectFigmaSourcePrecision({ sourceRef, sourceUnit } = {}) {
  const unit = typeof sourceUnit === 'string' ? sourceUnit.trim() : '';
  const ref = typeof sourceRef === 'string' ? sourceRef.trim() : '';
  if (!SOURCE_UNIT_VALUES.includes(unit)) {
    return { ok: false, reason: 'invalid-unit', pointer: null, sourceRef: ref, sourceUnit: unit };
  }
  if (FIGMA_PRECISION_COARSE_UNITS.has(unit)) {
    return { ok: false, reason: 'coarse-unit', pointer: null, sourceRef: ref, sourceUnit: unit };
  }
  const pointer = parseFigmaSourcePointer(ref);
  if (!pointer) {
    return { ok: false, reason: 'missing-anchor', pointer: null, sourceRef: ref, sourceUnit: unit };
  }
  return { ok: true, reason: null, pointer, sourceRef: ref, sourceUnit: unit };
}


// Shared input evidence grammar. Reconciliation Items and Mapping Provenance must
// never drift into separate regexes. Bullet indices are 1-based; `/00` is invalid.
export function parseInputEvidenceRef(token) {
  const text = String(token || '').trim();
  const match = /^input:([A-Za-z0-9][A-Za-z0-9._-]*)#([a-z0-9][a-z0-9-]*)(?:\/(\d+))?$/.exec(text);
  if (!match) return null;
  const bulletIndex = match[3] ? Number(match[3]) : null;
  if (bulletIndex !== null && bulletIndex < 1) return null;
  return {
    inputId: match[1],
    section: match[2],
    bulletIndex,
    raw: text,
  };
}

// Preserve every occurrence of an input_id. Consumers must distinguish a unique
// target from an ambiguous duplicate instead of silently taking the first file.
export function buildInputArtifactIndex(inputArtifacts = []) {
  const byId = new Map();
  for (const artifact of inputArtifacts || []) {
    if (!artifact || artifact.parseError) continue;
    const id = artifact.fm?.input_id;
    if (typeof id !== 'string' || id.trim() === '') continue;
    if (!byId.has(id)) byId.set(id, []);
    byId.get(id).push(artifact);
  }
  return {
    byId,
    sectionCache: new Map(),
    sectionDetailsCache: new Map(),
  };
}

export function resolveInputArtifact(index, inputId) {
  const matches = index?.byId?.get(inputId) || [];
  if (matches.length === 0) return { status: 'missing', artifact: null, artifacts: [] };
  if (matches.length > 1) return { status: 'ambiguous', artifact: null, artifacts: matches };
  return { status: 'ok', artifact: matches[0], artifacts: matches };
}

function inputArtifactBody(artifact) {
  if (typeof artifact?.body === 'string') return artifact.body;
  if (!artifact?.file) return '';
  return splitFrontmatter(readFileSafe(artifact.file)).body || '';
}

// H2 section slug -> actual Markdown list item count + exact visible bullet prose.
// One shared AST parse populates both views. Fenced/indented code, HTML comments,
// raw HTML attributes, link destinations, URL-only autolinks, definitions, and image
// destinations do not become evidence text. Duplicate real H2 slugs are concatenated
// in source order, preserving the existing aggregate bullet-count behavior.
export function inputSectionDetails(index, artifact) {
  if (!artifact) return null;
  const cacheKey = artifact.file || artifact;
  if (index?.sectionDetailsCache?.has(cacheKey)) return index.sectionDetailsCache.get(cacheKey);

  const sections = new Map();
  const bulletTexts = new Map();
  for (const occurrence of parseReconciliationMarkdown(inputArtifactBody(artifact)).occurrences) {
    if (!occurrence.slug) continue;
    const existingTexts = bulletTexts.get(occurrence.slug) || [];
    const occurrenceTexts = Array.isArray(occurrence.bulletTexts) ? occurrence.bulletTexts : [];
    const combinedTexts = [...existingTexts, ...occurrenceTexts];
    bulletTexts.set(occurrence.slug, combinedTexts);
    sections.set(occurrence.slug, combinedTexts.length);
  }

  const details = { sections, bulletTexts };
  if (index) {
    if (!index.sectionCache) index.sectionCache = new Map();
    if (!index.sectionDetailsCache) index.sectionDetailsCache = new Map();
    index.sectionCache.set(cacheKey, sections);
    index.sectionDetailsCache.set(cacheKey, details);
  }
  return details;
}

export function inputSectionIndex(index, artifact) {
  if (!artifact) return null;
  const cacheKey = artifact.file || artifact;
  if (index?.sectionCache?.has(cacheKey)) return index.sectionCache.get(cacheKey);
  return inputSectionDetails(index, artifact)?.sections || null;
}

// Resolve the shared evidence pointer without imposing caller-specific severity.
// Callers translate status to RR-REF/MP diagnostics and keep the shared grammar,
// duplicate handling, section semantics, and bullet count aligned.
export function resolveInputEvidence(index, token) {
  const ref = parseInputEvidenceRef(token);
  if (!ref) {
    return {
      status: 'invalid',
      ref: null,
      artifact: null,
      sections: null,
      bulletCount: null,
      bulletTexts: null,
      bulletIndex: null,
      evidenceText: null,
    };
  }
  const resolution = resolveInputArtifact(index, ref.inputId);
  if (resolution.status !== 'ok') {
    return {
      status: resolution.status === 'ambiguous' ? 'ambiguous-input' : 'missing-input',
      ref,
      artifact: null,
      artifacts: resolution.artifacts,
      sections: null,
      bulletCount: null,
      bulletTexts: null,
      bulletIndex: ref.bulletIndex,
      evidenceText: null,
    };
  }
  const details = inputSectionDetails(index, resolution.artifact);
  const sections = details?.sections || null;
  if (!sections?.has(ref.section)) {
    return {
      status: 'missing-section',
      ref,
      artifact: resolution.artifact,
      sections,
      bulletCount: null,
      bulletTexts: null,
      bulletIndex: ref.bulletIndex,
      evidenceText: null,
    };
  }
  const bulletTexts = details.bulletTexts.get(ref.section) || [];
  const bulletCount = sections.get(ref.section) || 0;
  const status =
    ref.bulletIndex !== null && ref.bulletIndex > bulletCount ? 'bullet-out-of-range' : 'ok';
  return {
    status,
    ref,
    artifact: resolution.artifact,
    sections,
    bulletCount,
    bulletTexts,
    bulletIndex: ref.bulletIndex,
    evidenceText:
      status === 'ok' && ref.bulletIndex !== null
        ? bulletTexts[ref.bulletIndex - 1] ?? ''
        : null,
  };
}
