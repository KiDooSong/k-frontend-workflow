// Figma Mapping Provenance Contract v1 — opted-in figma-component-mapping 문서의
// Mapping Key(M-xxx) ↔ row provenance 1:1 계약. validate.mjs check 12가 소비한다.
import { readFileSafe, splitFrontmatter } from './util.mjs';
import {
  describeHeaderMismatch,
  parseReconciliationMarkdown,
} from './reconciliation-markdown-ast.mjs';
import {
  INHERIT,
  SOURCE_UNIT_VALUES,
  buildInputArtifactIndex,
  isRfc3339,
  resolveInputEvidence,
} from './provenance.mjs';

export const MAPPING_PROVENANCE_CONTRACT_V1 = 1;
export const COMPONENT_MAPPING_SECTION = 'component-mapping';
export const MAPPING_PROVENANCE_SECTION = 'mapping-provenance';
export const COMPONENT_MAPPING_COLUMNS = [
  'Figma Frame / Node',
  'UI 요소',
  '매핑 컴포넌트',
  '비고',
];
export const MAPPING_PROVENANCE_COLUMNS = [
  'Mapping Key',
  'Source Ref',
  'Source Unit',
  'Captured At',
  'Evidence',
];

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object || {}, key);
}

function display(value) {
  return JSON.stringify(value ?? null);
}

export function parseMappingProvenanceContract(fm) {
  if (!hasOwn(fm, 'provenance_contract')) return { version: 0, errors: [] };
  const raw = fm?.provenance_contract;
  if (raw === MAPPING_PROVENANCE_CONTRACT_V1 || raw === String(MAPPING_PROVENANCE_CONTRACT_V1)) {
    return { version: 1, errors: [] };
  }
  return {
    version: null,
    errors: [
      `MP-001: provenance_contract ${display(raw)} 미지원 — Mapping Provenance v1은 숫자 1(읽기 호환: 정확한 문자열 "1")만 허용`,
    ],
  };
}

function sectionOccurrences(parsed, slug) {
  return (parsed?.occurrences || []).filter((occurrence) => occurrence.slug === slug);
}

function mappingKeyFromFirstCell(cell) {
  const text = String(cell || '').trim();
  const candidates = [...text.matchAll(/`?([Mm]-\d+)`?/g)].map((match) => match[1]);
  const anchored = /^`(M-\d{3,})`\s*·(?:\s+|$)/.exec(text);
  if (!anchored) {
    if (candidates.length === 0) return { key: null, error: 'Mapping Key 누락 (첫 셀 맨 앞에 `M-001` · … 형식)' };
    return {
      key: null,
      error: `Mapping Key 위치/형식 위반: '${text}' (첫 셀 맨 앞의 대문자 M-[0-9]{3,}만 허용)`,
    };
  }
  if (candidates.length !== 1) {
    return { key: null, error: `첫 셀에 Mapping Key 후보가 ${candidates.length}개 — 정확히 1개여야 함` };
  }
  return { key: anchored[1], error: null };
}

function provenanceKey(cell) {
  const text = String(cell || '').trim();
  const unwrapped = /^`([^`]+)`$/.exec(text)?.[1] || text;
  if (!/^M-\d{3,}$/.test(unwrapped)) return null;
  return unwrapped;
}

function explicitFigmaPointer(value) {
  if (typeof value !== 'string') return null;
  const match = /^figma:\/\/file\/([^/\s]+)(?:\/(node|frame)\/([^/\s?#]+))?/.exec(value.trim());
  if (!match) return null;
  return { file: match[1], axis: match[2] || null, id: match[3] || null, raw: value.trim() };
}

function explicitSourcePointers(fm, parsed) {
  const values = [];
  if (Array.isArray(fm?.sources)) {
    for (const source of fm.sources) {
      if (typeof source?.ref === 'string') values.push(source.ref);
    }
  }
  for (const occurrence of sectionOccurrences(parsed, 'frame')) {
    values.push(...(occurrence.text.match(/figma:\/\/file\/[^\s|)`]+/g) || []));
  }
  return values.map(explicitFigmaPointer).filter(Boolean);
}

function contradictionMessage(sourceRef, explicitPointers) {
  const direct = explicitFigmaPointer(sourceRef);
  if (!direct || explicitPointers.length === 0) return null;
  const fileKeys = [...new Set(explicitPointers.map((pointer) => pointer.file))];
  if (fileKeys.length === 1 && fileKeys[0] !== direct.file) {
    return `MP-103: direct Source Ref의 Figma file '${direct.file}'이 문서 sources/Frame의 명시 file '${fileKeys[0]}'과 모순됨 (warning-first)`;
  }
  if (direct.axis === 'frame') {
    const sameFileFrames = explicitPointers.filter(
      (pointer) => pointer.file === direct.file && pointer.axis === 'frame' && pointer.id,
    );
    const frameIds = [...new Set(sameFileFrames.map((pointer) => pointer.id))];
    if (frameIds.length === 1 && frameIds[0] !== direct.id) {
      return `MP-103: direct Source Ref의 frame '${direct.id}'이 문서 Frame의 명시 frame '${frameIds[0]}'과 모순됨 (warning-first)`;
    }
  }
  return null;
}

function validateOptedInMapping({ doc, inputIndex }) {
  const errors = [];
  const warnings = [];
  const add = (message) => errors.push({ file: doc.file, message });
  const warn = (message) => warnings.push({ file: doc.file, message });
  const { body } = splitFrontmatter(readFileSafe(doc.file));
  const parsed = parseReconciliationMarkdown(body || '');

  const componentSections = sectionOccurrences(parsed, COMPONENT_MAPPING_SECTION);
  const provenanceSections = sectionOccurrences(parsed, MAPPING_PROVENANCE_SECTION);

  if (componentSections.length !== 1) {
    add(`MP-002: opted-in mapping은 \`## Component Mapping\` heading이 정확히 1개여야 함 (현재 ${componentSections.length})`);
  }
  if (provenanceSections.length !== 1) {
    add(`MP-005: opted-in mapping은 \`## Mapping Provenance\` heading이 정확히 1개여야 함 (현재 ${provenanceSections.length})`);
  }

  const componentSection = componentSections.length === 1 ? componentSections[0] : null;
  const provenanceSection = provenanceSections.length === 1 ? provenanceSections[0] : null;
  if (componentSection && componentSection.tables.length !== 1) {
    add(`MP-003: Component Mapping 섹션의 canonical 표는 정확히 1개여야 함 (현재 ${componentSection.tables.length})`);
  }
  if (provenanceSection && provenanceSection.tables.length !== 1) {
    add(`MP-006: Mapping Provenance 섹션의 canonical 표는 정확히 1개여야 함 (현재 ${provenanceSection.tables.length})`);
  }

  const componentTable = componentSection?.tables.length === 1 ? componentSection.tables[0] : null;
  const provenanceTable = provenanceSection?.tables.length === 1 ? provenanceSection.tables[0] : null;
  if (componentTable) {
    const issue = describeHeaderMismatch(componentTable, COMPONENT_MAPPING_COLUMNS);
    if (issue) add(`MP-004: Component Mapping header 불일치 (${issue}) — 기존 canonical 4컬럼 순서를 유지하세요`);
  }
  if (provenanceTable) {
    const issue = describeHeaderMismatch(provenanceTable, MAPPING_PROVENANCE_COLUMNS);
    if (issue) add(`MP-007: Mapping Provenance header 불일치 (${issue}) — canonical 5컬럼 순서를 사용하세요`);
  }

  const componentUsable = componentTable && describeHeaderMismatch(componentTable, COMPONENT_MAPPING_COLUMNS) === null;
  const provenanceUsable = provenanceTable && describeHeaderMismatch(provenanceTable, MAPPING_PROVENANCE_COLUMNS) === null;
  const mappingKeys = new Map();
  if (componentUsable) {
    componentTable.rows.forEach((row, index) => {
      const parsedKey = mappingKeyFromFirstCell(row['Figma Frame / Node']);
      if (parsedKey.error) {
        add(`MP-008: Component Mapping row ${index + 1}: ${parsedKey.error}`);
        return;
      }
      if (mappingKeys.has(parsedKey.key)) {
        add(`MP-009: Component Mapping Mapping Key 중복: ${parsedKey.key}`);
        return;
      }
      mappingKeys.set(parsedKey.key, row);
    });
  }

  const provenanceRows = new Map();
  if (provenanceUsable) {
    provenanceTable.rows.forEach((row, index) => {
      const key = provenanceKey(row['Mapping Key']);
      if (!key) {
        add(`MP-010: Mapping Provenance row ${index + 1}의 Mapping Key 형식 위반: ${display(row['Mapping Key'])} (기대 M-[0-9]{3,})`);
        return;
      }
      if (provenanceRows.has(key)) {
        add(`MP-011: Mapping Provenance Mapping Key 중복: ${key}`);
        return;
      }
      provenanceRows.set(key, row);
    });
  }

  if (componentUsable && provenanceUsable) {
    for (const key of mappingKeys.keys()) {
      if (!provenanceRows.has(key)) add(`MP-012: Mapping Key ${key}의 Mapping Provenance 행 누락`);
    }
    for (const key of provenanceRows.keys()) {
      if (!mappingKeys.has(key)) add(`MP-012: orphan Mapping Provenance 행: ${key} (Component Mapping에 같은 key 없음)`);
    }
  }

  const explicitPointers = explicitSourcePointers(doc.fm, parsed);
  if (provenanceUsable) {
    for (const [key, row] of provenanceRows) {
      const sourceRef = String(row['Source Ref'] || '').trim();
      const sourceUnit = String(row['Source Unit'] || '').trim();
      const capturedAt = String(row['Captured At'] || '').trim();
      const evidenceText = String(row.Evidence || '').trim();
      const missing = [
        ['Source Ref', sourceRef],
        ['Source Unit', sourceUnit],
        ['Captured At', capturedAt],
        ['Evidence', evidenceText],
      ].filter(([, value]) => !value).map(([name]) => name);
      if (missing.length) add(`MP-013: ${key} provenance 필수 셀 빈값: ${missing.join(', ')}`);

      const evidence = evidenceText ? resolveInputEvidence(inputIndex, evidenceText) : { status: 'invalid', ref: null };
      if (evidenceText) {
        if (evidence.status === 'invalid') {
          add(`MP-014: ${key} Evidence '${evidenceText}' 문법 위반 (input:<input_id>#<section-slug>[/NN])`);
        } else if (evidence.status === 'missing-input') {
          add(`MP-014: ${key} Evidence input '${evidence.ref.inputId}'가 inputs/**에서 해소되지 않음`);
        } else if (evidence.status === 'ambiguous-input') {
          add(`MP-014: ${key} Evidence input '${evidence.ref.inputId}'가 중복 input_id라 모호함`);
        } else if (evidence.status === 'missing-section') {
          add(`MP-014: ${key} Evidence section '#${evidence.ref.section}'이 input '${evidence.ref.inputId}'에 없음`);
        } else if (evidence.status === 'bullet-out-of-range') {
          warn(`MP-101: ${key} Evidence bullet /${String(evidence.ref.bulletIndex).padStart(2, '0')}가 '#${evidence.ref.section}' bullet 수(${evidence.bulletCount})를 넘음 (warning-first)`);
        }
      }

      if (sourceRef) {
        if (sourceRef === INHERIT) {
          const inherited = evidence.artifact?.fm?.source_ref;
          if (typeof inherited !== 'string' || inherited.trim() === '') {
            add(`MP-015: ${key} Source Ref=inherit인데 Evidence input의 source_ref를 해소할 수 없음`);
          }
        } else if (sourceRef.startsWith('input:')) {
          add(`MP-015: ${key} Source Ref에 input: evidence를 넣을 수 없음 — Evidence 열로 이동하세요`);
        } else {
          const contradiction = contradictionMessage(sourceRef, explicitPointers);
          if (contradiction) warn(contradiction);
        }
      }

      if (sourceUnit) {
        if (!SOURCE_UNIT_VALUES.includes(sourceUnit)) {
          add(`MP-016: ${key} Source Unit enum 위반: '${sourceUnit}' (기대 ${SOURCE_UNIT_VALUES.join('|')})`);
        } else if (sourceUnit === 'n/a') {
          warn(`MP-102: ${key} Mapping Provenance의 Source Unit=n/a는 정밀도 바닥을 제공하지 못함 (warning-first)`);
        }
      }

      if (capturedAt) {
        if (capturedAt === INHERIT) {
          const inherited = evidence.artifact?.fm?.captured_at;
          if (!isRfc3339(inherited)) {
            add(`MP-017: ${key} Captured At=inherit인데 Evidence input의 captured_at이 유효한 RFC3339+timezone이 아님 (현재 ${display(inherited)})`);
          }
        } else if (!isRfc3339(capturedAt)) {
          add(`MP-017: ${key} Captured At '${capturedAt}'은 inherit 또는 RFC3339(with timezone)이어야 함`);
        }
      }
    }
  }

  return { errors, warnings };
}

export function validateMappingProvenance({ docs = [], inputArtifacts = [] } = {}) {
  const errors = [];
  const warnings = [];
  const inputIndex = buildInputArtifactIndex(inputArtifacts);

  for (const doc of docs || []) {
    if (doc?.fm?.artifact_type !== 'figma-component-mapping') continue;
    const contract = parseMappingProvenanceContract(doc.fm || {});
    if (contract.version === 0) continue; // legacy mapping: complete silence
    if (contract.version !== 1) {
      for (const message of contract.errors) errors.push({ file: doc.file, message });
      continue;
    }
    const result = validateOptedInMapping({ doc, inputIndex });
    errors.push(...result.errors);
    warnings.push(...result.warnings);
  }

  return { errors, warnings };
}
