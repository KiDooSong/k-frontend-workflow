// Input Fidelity Contract v2 — confidence와 독립된 원본→input 전사/검증 메타데이터.
// Validator(check 11)는 warning-first, producer는 같은 순수 분석 결과를 write 전에 hard reject한다.
import {
  buildInputArtifactIndex,
  resolveInputArtifact,
} from './provenance.mjs';

export const INPUT_CONTRACT_V2 = 2;
export const FIDELITY_EXTRACTION_VALUES = [
  'direct-text',
  'vision-verbatim',
  'structured-source',
  'manual-transcription',
  'inherited',
];
export const FIDELITY_VERIFICATION_VALUES = [
  'unverified',
  'verified',
  'inherited',
  'not-applicable',
];
export const FIDELITY_KEYS = [
  'extraction',
  'verification',
  'verified_against',
  'unreadable_count',
];
const REQUIRED_FIDELITY_KEYS = ['extraction', 'verification', 'unreadable_count'];

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object || {}, key);
}

function isPlainMapping(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function display(value) {
  return JSON.stringify(value ?? null);
}

export function parseInputContract(fm) {
  if (!hasOwn(fm, 'input_contract')) return { version: 1, raw: undefined, issues: [] };
  const raw = fm?.input_contract;
  if (raw === INPUT_CONTRACT_V2 || raw === String(INPUT_CONTRACT_V2)) {
    return { version: 2, raw, issues: [] };
  }
  return {
    version: null,
    raw,
    issues: [
      `IF-101: input_contract ${display(raw)} 미지원 — v2는 숫자 2(읽기 호환: 정확한 문자열 "2")만 허용`,
    ],
  };
}

function rawArtifactsInfo(fm) {
  if (!hasOwn(fm, 'raw_artifacts')) return { present: false, valid: true, values: [] };
  const raw = fm.raw_artifacts;
  if (!Array.isArray(raw)) return { present: true, valid: false, values: [] };
  const valid = raw.every((entry) => typeof entry === 'string' && entry.trim() !== '');
  return { present: true, valid, values: valid ? raw : [] };
}

// Local shape/cross-field inspection only. Inherited target resolution and cycles are
// handled globally because they need the duplicate-preserving input index.
export function inspectInputFidelity(fm) {
  const contract = parseInputContract(fm || {});
  if (contract.version === 1) {
    return { version: 1, fidelity: null, issues: [], locallyValid: true };
  }
  if (contract.version !== 2) {
    return { version: null, fidelity: null, issues: [...contract.issues], locallyValid: false };
  }

  const issues = [];
  const fidelity = fm?.fidelity;
  if (!isPlainMapping(fidelity)) {
    issues.push(
      `IF-102: input_contract: 2이면 fidelity는 mapping이어야 함 (현재 ${display(fidelity)})`,
    );
    return { version: 2, fidelity: null, issues, locallyValid: false };
  }

  const unknown = Object.keys(fidelity).filter((key) => !FIDELITY_KEYS.includes(key));
  if (unknown.length) {
    issues.push(`IF-103: fidelity 알 수 없는 key: ${unknown.sort().join(', ')} — 허용: ${FIDELITY_KEYS.join('|')}`);
  }
  const missing = REQUIRED_FIDELITY_KEYS.filter((key) => !hasOwn(fidelity, key));
  if (missing.length) {
    issues.push(`IF-104: fidelity 필수 key 누락: ${missing.join(', ')}`);
  }

  const extraction = fidelity.extraction;
  const verification = fidelity.verification;
  const unreadableCount = fidelity.unreadable_count;
  if (!FIDELITY_EXTRACTION_VALUES.includes(extraction)) {
    issues.push(
      `IF-105: fidelity.extraction enum 위반: ${display(extraction)} (기대 ${FIDELITY_EXTRACTION_VALUES.join('|')})`,
    );
  }
  if (!FIDELITY_VERIFICATION_VALUES.includes(verification)) {
    issues.push(
      `IF-106: fidelity.verification enum 위반: ${display(verification)} (기대 ${FIDELITY_VERIFICATION_VALUES.join('|')})`,
    );
  }
  if (!Number.isInteger(unreadableCount) || unreadableCount < 0) {
    issues.push(
      `IF-107: fidelity.unreadable_count는 0 이상의 실제 정수여야 함 (문자열/소수/boolean coercion 없음, 현재 ${display(unreadableCount)})`,
    );
  }

  const rawArtifacts = rawArtifactsInfo(fm || {});
  if (!rawArtifacts.valid) {
    issues.push('IF-108: raw_artifacts는 비어 있지 않은 문자열 배열이어야 함');
  }

  const againstPresent = hasOwn(fidelity, 'verified_against');
  const against = fidelity.verified_against;
  if (verification === 'verified') {
    const match = typeof against === 'string' ? /^raw_artifact:(.+)$/.exec(against) : null;
    if (!match || match[1].trim() === '') {
      issues.push(
        'IF-109: verification=verified이면 verified_against는 raw_artifact:<pointer> 필수 (input: 참조 금지)',
      );
    } else if (!rawArtifacts.valid || !rawArtifacts.values.includes(match[1])) {
      issues.push(
        `IF-110: verified_against '${against}'의 pointer가 현재 raw_artifacts 배열에 exact match로 존재하지 않음`,
      );
    }
  } else if (verification === 'inherited') {
    if (extraction !== 'inherited') {
      issues.push('IF-111: verification=inherited이면 extraction도 inherited여야 함');
    }
    if (typeof against !== 'string' || !/^input:[A-Za-z0-9][A-Za-z0-9._-]*$/.test(against)) {
      issues.push('IF-112: verification=inherited이면 verified_against는 정확히 input:<input_id> 문법이어야 함');
    }
  } else if (verification === 'unverified' || verification === 'not-applicable') {
    if (againstPresent && against !== null && against !== undefined) {
      issues.push(
        `IF-113: verification=${verification}이면 verified_against는 생략 또는 null이어야 함 (현재 ${display(against)})`,
      );
    }
  }

  if (extraction === 'inherited' && verification !== 'inherited') {
    issues.push('IF-114: extraction=inherited이면 verification도 inherited여야 함');
  }

  return {
    version: 2,
    fidelity,
    issues,
    locallyValid: issues.length === 0,
  };
}

function targetIdFromInherited(info) {
  if (info?.version !== 2 || !info?.fidelity || info.fidelity.verification !== 'inherited') return null;
  const against = info.fidelity.verified_against;
  const match = typeof against === 'string' ? /^input:([A-Za-z0-9][A-Za-z0-9._-]*)$/.exec(against) : null;
  return match ? match[1] : null;
}

function inheritanceIssue(startArtifact, index, localByArtifact) {
  const startInfo = localByArtifact.get(startArtifact);
  if (!startInfo?.locallyValid || startInfo.fidelity?.verification !== 'inherited') return null;

  const startId = startArtifact.fm?.input_id;
  let current = startArtifact;
  const visitedArtifacts = new Set([current]);
  const visitedIds = new Set(typeof startId === 'string' ? [startId] : []);

  while (true) {
    const info = localByArtifact.get(current) || inspectInputFidelity(current.fm || {});
    const currentId = current.fm?.input_id || '(unknown-input)';
    if (info.version !== 2 || !info.locallyValid) {
      return `IF-118: inherited chain 대상 '${currentId}'의 input_contract:2 fidelity가 well-formed가 아님`;
    }
    if (info.fidelity.verification === 'verified') return null;
    if (info.fidelity.verification !== 'inherited') {
      return `IF-119: inherited chain이 verification=verified terminal에 도달하지 못함 (terminal '${currentId}'=${info.fidelity.verification})`;
    }

    const targetId = targetIdFromInherited(info);
    if (!targetId) return `IF-115: inherited target 문법을 해소할 수 없음: ${display(info.fidelity.verified_against)}`;
    if (targetId === currentId) {
      return `IF-116: inherited fidelity가 자기 자신을 가리킴: '${targetId}'`;
    }
    const resolution = resolveInputArtifact(index, targetId);
    if (resolution.status === 'missing') {
      return `IF-115: inherited target '${targetId}'가 inputs/**에서 해소되지 않음`;
    }
    if (resolution.status === 'ambiguous') {
      return `IF-117: inherited target '${targetId}'가 중복 input_id(${resolution.artifacts.length}건)라 모호함`;
    }
    const target = resolution.artifact;
    if (visitedArtifacts.has(target) || visitedIds.has(targetId)) {
      return `IF-120: inherited fidelity cycle 감지: '${targetId}'`;
    }
    const targetInfo = localByArtifact.get(target) || inspectInputFidelity(target.fm || {});
    if (targetInfo.version !== 2 || !targetInfo.locallyValid) {
      return `IF-118: inherited target '${targetId}'는 well-formed input_contract:2 fidelity가 아님`;
    }
    visitedArtifacts.add(target);
    visitedIds.add(targetId);
    current = target;
  }
}

// Generic issue collector. Every returned issue is warning-first in validate, while
// producer callers may turn the exact same issue set into an InputProducerError.
export function collectInputFidelityIssues(inputArtifacts = []) {
  const index = buildInputArtifactIndex(inputArtifacts);
  const localByArtifact = new Map();
  const issues = [];

  for (const artifact of inputArtifacts || []) {
    if (!artifact || artifact.parseError || !artifact.hasFrontmatter) continue;
    const info = inspectInputFidelity(artifact.fm || {});
    localByArtifact.set(artifact, info);
    for (const message of info.issues) issues.push({ file: artifact.file, artifact, message });
  }

  for (const artifact of inputArtifacts || []) {
    const info = localByArtifact.get(artifact);
    if (!info?.locallyValid || info.fidelity?.verification !== 'inherited') continue;
    const message = inheritanceIssue(artifact, index, localByArtifact);
    if (message) issues.push({ file: artifact.file, artifact, message });
  }

  return { issues, index, localByArtifact };
}

export function validateInputFidelityArtifacts(inputArtifacts = []) {
  const { issues } = collectInputFidelityIssues(inputArtifacts);
  return {
    errors: [],
    warnings: issues.map(({ file, message }) => ({ file, message })),
  };
}

// Producer-only normalization: v1 stays absent; v2 is canonicalized to numeric 2
// and deterministic nested keys. Fidelity without an explicit version is rejected
// so adapters cannot accidentally write inert metadata.
export function normalizeProducerInputFidelity(payload = {}) {
  const hasContract = hasOwn(payload, 'input_contract');
  const hasFidelity = hasOwn(payload, 'fidelity');
  if (!hasContract) {
    return {
      fields: {},
      issues: hasFidelity
        ? ['IF-100: producer payload에 fidelity가 있으면 input_contract: 2를 명시해야 함']
        : [],
    };
  }

  const info = inspectInputFidelity(payload);
  if (info.version !== 2 || !info.locallyValid) return { fields: {}, issues: info.issues };
  const fidelity = {
    extraction: info.fidelity.extraction,
    verification: info.fidelity.verification,
  };
  if (hasOwn(info.fidelity, 'verified_against') && info.fidelity.verified_against != null) {
    fidelity.verified_against = info.fidelity.verified_against;
  }
  fidelity.unreadable_count = info.fidelity.unreadable_count;
  return {
    fields: { input_contract: 2, fidelity },
    issues: [],
  };
}
