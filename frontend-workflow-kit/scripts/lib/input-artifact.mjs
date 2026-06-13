// 입력 결과물(inputs/*.md) 검증 — validate.mjs 검사 11 의 순수 로직.
// 계약 단일 출처: input-reconciliation.md "Input Result Contract" + templates/input/input-artifact.template.md
// (정본 flat frontmatter). reconcile 파이프라인 전체가 input_id 한 키에 걸려 있어
// (멱등성·역추적·supersede·미처리 감지), 그 키의 누락/중복/형식오류를 여기서 잡는다.
//
// 이 모듈은 순수하다 — { errors:[{file,message}], warnings:[{file,message}] } 를 반환하고
// file 은 항상 절대경로다. validate.mjs 가 add()/warn() 으로 상대화한다.
// splitFrontmatter/walkFiles/exists 등은 util.mjs 를 재사용한다(중복 구현 금지).
import path from 'node:path';
import { splitFrontmatter, readFileSafe, walkFiles, isDir } from './util.mjs';

// input_id 형식: IN-{YYYYMMDD}-{source}-{NNN}. source 토큰은 하나 이상의 영소문자/숫자 세그먼트(하이픈 연결),
// seq 는 3자리 이상 숫자. (input-reconciliation.md: "IN-{날짜}-{source}-{seq}")
export const INPUT_ID_PATTERN = /^IN-\d{8}-[a-z0-9]+(?:-[a-z0-9]+)*-\d{3,}$/;

// normalized category(입력 성격 라벨) — input frontmatter 의 input_type.
export const INPUT_TYPE_VALUES = ['planning', 'figma', 'api', 'meeting', 'qa', 'user-note'];
// concrete source adapter/type — input frontmatter 의 source_type.
export const SOURCE_TYPE_VALUES = ['planning-doc', 'figma', 'api-doc', 'meeting', 'qa', 'user-note'];
// 입력의 확신도(optional). 있으면 enum 검사만, 누락은 검사하지 않는다.
export const INPUT_CONFIDENCE_VALUES = ['unknown', 'candidate', 'confirmed'];

// 정본 required 9필드. affected_domains/affected_screens 는 deprecated suggested_scope alias 로도
// 충족될 수 있어(아래 ALIAS-RESOLVES 규칙) 별도 처리한다.
export const INPUT_REQUIRED_FIELDS = [
  'input_id',
  'input_type',
  'source_type',
  'source_ref',
  'captured_at',
  'captured_by',
  'status',
  'affected_domains',
  'affected_screens',
];

// frontmatter 값이 "비었는지" 판정. 빈 문자열·빈 배열·null/undefined 를 비었다고 본다.
function isEmptyValue(v) {
  if (v === undefined || v === null) return true;
  if (typeof v === 'string') return v.trim() === '';
  if (Array.isArray(v)) return v.length === 0;
  return false;
}

// 리스트형 scope 필드가 채워졌는지 — 비어있지 않은 항목이 1개 이상인 배열, 또는 비지 않은 문자열.
function hasScopeValue(v) {
  if (Array.isArray(v)) return v.some((x) => !isEmptyValue(x));
  return !isEmptyValue(v);
}

// 입력 파일 1건을 로드한다. parseError 면 검사 1 이 이미 보고하므로 표시만 하고 넘긴다.
//   { file, fm, hasFrontmatter, parseError }
export function loadInputArtifact(file) {
  const { data, hasFrontmatter, parseError } = splitFrontmatter(readFileSafe(file));
  return { file, fm: data || {}, hasFrontmatter, parseError };
}

// inputs 디렉토리 전체를 수집한다. 디렉토리가 없으면 빈 배열(NO-OP 의 근거).
// 검사 11·12 가 같은 수집 결과를 공유하도록 validate.mjs 가 한 번만 부른다.
export function collectInputArtifacts(inputsDir) {
  if (!inputsDir || !isDir(inputsDir)) return [];
  return walkFiles(inputsDir, ['.md']).map((f) => loadInputArtifact(f));
}

// 입력 결과물 검증(검사 11). artifacts 는 collectInputArtifacts 결과.
// inputs 디렉토리가 없으면 artifacts 가 비어 자연히 NO-OP 가 된다.
export function validateInputArtifacts(artifacts) {
  const errors = [];
  const warnings = [];
  const add = (file, message) => errors.push({ file, message });
  const warn = (file, message) => warnings.push({ file, message });

  // input_id 전역 중복 집계 (parseError 파일은 제외 — id 를 신뢰할 수 없다).
  const idCount = new Map();
  for (const a of artifacts) {
    if (a.parseError) continue;
    const id = a.fm.input_id;
    if (typeof id === 'string' && id.trim() !== '') {
      idCount.set(id, (idCount.get(id) || 0) + 1);
    }
  }
  // supersedes 해소용: 존재하는 input_id 집합.
  const knownIds = new Set(
    [...idCount.keys()],
  );

  for (const a of artifacts) {
    // 검사 1(util.splitFrontmatter parseError)이 이미 YAML 파싱 실패를 보고하므로 여기선 건너뛴다.
    if (a.parseError) continue;

    const { file, fm, hasFrontmatter } = a;

    // frontmatter 자체가 없으면 입력 결과물로서 불완전 — 단일 에러로 끝낸다(필드별 누락 폭주 방지).
    if (!hasFrontmatter) {
      add(file, 'frontmatter 없음 — 입력 결과물은 canonical frontmatter 필수');
      continue;
    }

    // --- required 9필드 누락 ---
    for (const field of INPUT_REQUIRED_FIELDS) {
      // affected_domains/affected_screens 는 ALIAS-RESOLVES 규칙으로 따로 처리.
      if (field === 'affected_domains' || field === 'affected_screens') continue;
      if (isEmptyValue(fm[field])) {
        add(file, `필수 frontmatter 누락: ${field} (정본 입력 스키마)`);
      }
    }

    // ALIAS-RESOLVES 규칙: affected_domains 는 canonical(affected_domains) 또는
    // deprecated alias(suggested_scope.domains) 중 하나라도 비어있지 않으면 충족.
    // alias 로만 충족되면 required-누락 에러를 내지 않는다 — 아래 deprecated 경고가 대신 커버한다.
    // 둘 다 없을 때만 누락 에러.
    const ss = fm.suggested_scope || {};
    if (!hasScopeValue(fm.affected_domains) && !hasScopeValue(ss.domains)) {
      add(file, '필수 frontmatter 누락: affected_domains (정본 입력 스키마)');
    }
    if (!hasScopeValue(fm.affected_screens) && !hasScopeValue(ss.screens)) {
      add(file, '필수 frontmatter 누락: affected_screens (정본 입력 스키마)');
    }

    // --- input_id 형식 / 중복 ---
    const id = fm.input_id;
    if (typeof id === 'string' && id.trim() !== '') {
      if (!INPUT_ID_PATTERN.test(id)) {
        add(file, `input_id 형식 위반: '${id}' (기대 IN-{YYYYMMDD}-{source}-{NNN})`);
      }
      const n = idCount.get(id) || 0;
      if (n > 1) {
        add(file, `input_id 중복: '${id}' (${n}건) — input_id 는 전역 유일`);
      }
    }

    // --- input_type / source_type enum ---
    if (!isEmptyValue(fm.input_type) && !INPUT_TYPE_VALUES.includes(fm.input_type)) {
      add(file, `input_type enum 위반: '${fm.input_type}' (기대 ${INPUT_TYPE_VALUES.join('|')})`);
    }
    if (!isEmptyValue(fm.source_type) && !SOURCE_TYPE_VALUES.includes(fm.source_type)) {
      add(file, `source_type enum 위반: '${fm.source_type}' (기대 ${SOURCE_TYPE_VALUES.join('|')})`);
    }

    // --- supersedes 해소 ---
    // null/빈값이면 검사하지 않는다(대체 안 함이 정상). 값이 있으면 inputs/ 의 실제 input_id 여야 하고,
    // 자기 자신을 가리킬 수 없다 — supersedes 는 '이전' 입력↔입력 축이다(self-supersede 무의미).
    if (!isEmptyValue(fm.supersedes)) {
      if (typeof id === 'string' && fm.supersedes === id) {
        add(file, `supersedes 가 자기 자신을 가리킴: '${fm.supersedes}' (이전 input_id 여야 함)`);
      } else if (!knownIds.has(fm.supersedes)) {
        add(file, `supersedes 대상 '${fm.supersedes}' 가 존재하지 않음`);
      }
    }

    // --- confidence enum (optional — 있을 때만 검사, 누락은 통과) ---
    if (!isEmptyValue(fm.confidence) && !INPUT_CONFIDENCE_VALUES.includes(fm.confidence)) {
      add(file, `confidence enum 위반: '${fm.confidence}' (기대 ${INPUT_CONFIDENCE_VALUES.join('|')})`);
    }

    // --- 경고 (exit code 무영향) ---
    // deprecated alias: suggested_scope (중첩 범위 필드) → affected_domains/affected_screens 로 이전.
    if (fm.suggested_scope !== undefined && fm.suggested_scope !== null) {
      warn(file, "deprecated 'suggested_scope' 사용 → affected_domains/affected_screens 로 이전");
    }
    // deprecated alias: frontmatter summary → body 의 ## Summary 가 정본.
    if (fm.summary !== undefined && fm.summary !== null) {
      warn(file, "deprecated frontmatter 'summary' 사용 → body 의 ## Summary 가 정본");
    }
    // 파일명 규약: {input_id}.md. id 가 유효할 때만(빈 id 누락은 위에서 이미 에러) 비교.
    if (typeof id === 'string' && id.trim() !== '') {
      const base = path.basename(file, '.md');
      if (base !== id) {
        warn(file, `파일명이 input_id 와 다름: '${base}' ≠ '${id}' (규약 {input_id}.md)`);
      }
    }
  }

  return { errors, warnings };
}
