import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import {
  DEFAULTS,
  KIT_ROOT,
  readFileSafe,
  splitFrontmatter,
  walkFiles,
  yamlParse,
} from './util.mjs';
import { buildState } from '../workflow-state.mjs';
import { computeReadiness } from '../readiness-legacy.mjs';
import { loadLayoutProfile } from './layout-profile.mjs';
import { globMatches, readinessPathAuthorization } from './path-backstop.mjs';
import { collectInputArtifacts, validateInputArtifacts } from './input-artifact.mjs';
import {
  collectInputFidelityIssues,
  inspectInputFidelity,
  parseInputContract,
} from './input-fidelity.mjs';
import {
  parseReconciliationRegister,
  validateReconciliationRegister,
} from './reconciliation-register.mjs';
import {
  parseReconciliationItems,
  parseRegisterContract,
  parseTargetRef,
  validateReconciliationV2,
} from './reconciliation-items.mjs';
import { buildReconciliationTargetIndex } from './reconciliation-target-index.mjs';
import { validateMappingProvenance } from './mapping-provenance.mjs';
import { buildInputArtifactIndex, resolveInputEvidence } from './provenance.mjs';
import { col, getSections, loadScreenSpec, parseTable } from './spec.mjs';
import { analyzeScreenLifecycles, screenLifecycleOf } from './screen-lifecycle.mjs';
import { discoverArtifacts } from './check-generated-files.mjs';
import { stripProjectPrefix } from './visual-refresh-git.mjs';

export const VISUAL_REFRESH_INTENT = 'visual-refresh';
const FINAL_VISUAL_MODE = 'final-fixture-ui';
const REGISTER_RELATIVE = '_meta/reconciliation-register.md';
const MAPPING_ARTIFACT_TYPE = 'figma-component-mapping';
const MAPPING_SECTION = 'component-mapping';
const MAPPING_SECTION_KEY = 'component mapping';
const MAPPING_PROVENANCE_SECTION_KEY = 'mapping provenance';

export class VisualRefreshError extends Error {
  constructor(message) {
    super(message);
    this.name = 'VisualRefreshError';
  }
}

function toPosix(value) {
  return String(value).split(path.sep).join('/');
}

function own(object, key) {
  return Object.prototype.hasOwnProperty.call(object || {}, key);
}

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function strings(value) {
  if (Array.isArray(value)) return value.map(text).filter(Boolean);
  const one = text(value);
  return one ? [one] : [];
}

function stable(values) {
  return [...values].sort((left, right) => String(left).localeCompare(String(right)));
}

function sameArray(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function sha256(value) {
  return createHash('sha256').update(String(value ?? ''), 'utf8').digest('hex');
}

function reason(code, message, extra = {}) {
  return { code, message, ...extra };
}

function rel(root, file) {
  return toPosix(path.relative(root, file) || '.');
}

export function canonicalAuthorityPath(raw, label = 'path') {
  if (typeof raw !== 'string' || raw.trim() === '') {
    throw new VisualRefreshError(`${label}는 비어 있지 않은 worktree-relative 경로여야 함`);
  }
  if (raw.includes('\0')) throw new VisualRefreshError(`${label}에 NUL 문자를 사용할 수 없음`);
  const slash = raw.replace(/\\/g, '/');
  if (path.posix.isAbsolute(slash) || /^[A-Za-z]:\//.test(slash)) {
    throw new VisualRefreshError(`${label}는 절대경로일 수 없음: ${raw}`);
  }
  if (/[?*]/.test(slash)) {
    throw new VisualRefreshError(`${label}는 글롭이 아닌 구체 경로여야 함: ${raw}`);
  }
  const normalized = path.posix.normalize(slash);
  if (
    normalized === '.' ||
    normalized === '..' ||
    normalized.startsWith('../') ||
    normalized.startsWith('./') ||
    normalized !== slash ||
    slash.endsWith('/')
  ) {
    throw new VisualRefreshError(`${label}는 canonical worktree-relative 경로여야 함: ${raw}`);
  }
  return normalized;
}

function confined(root, raw, label) {
  const relative = canonicalAuthorityPath(raw, label);
  const absolute = path.resolve(root, ...relative.split('/'));
  const normalizedRoot = path.resolve(root);
  if (absolute !== normalizedRoot && !absolute.startsWith(`${normalizedRoot}${path.sep}`)) {
    throw new VisualRefreshError(`${label}가 --root 밖으로 이탈함: ${raw}`);
  }
  return { relative, absolute };
}

function regular(root, relative) {
  const { absolute } = confined(root, relative, 'screen_entry');
  try {
    const stat = fs.lstatSync(absolute);
    if (!stat.isFile() || stat.isSymbolicLink()) return false;
    const realRoot = fs.realpathSync(root);
    const realFile = fs.realpathSync(absolute);
    return realFile.startsWith(`${realRoot}${path.sep}`);
  } catch {
    return false;
  }
}

function readYaml(file, label) {
  const raw = readFileSafe(file);
  if (raw == null) throw new VisualRefreshError(`${label} 파일 없음: ${toPosix(file)}`);
  try {
    const value = yamlParse(raw);
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('top-level mapping이 아님');
    }
    return { value, raw };
  } catch (error) {
    throw new VisualRefreshError(`${label} YAML 파싱 실패: ${toPosix(file)} — ${error.message}`);
  }
}

function packageVersion() {
  try {
    return JSON.parse(readFileSafe(path.join(KIT_ROOT, 'package.json')) || '{}').version || null;
  } catch {
    return null;
  }
}

function artifactDocs(docsDir) {
  if (!fs.existsSync(docsDir)) return [];
  return walkFiles(docsDir, ['.md'])
    .filter((file) => !file.split(path.sep).includes('_meta'))
    .map((file) => {
      const raw = readFileSafe(file) || '';
      const parsed = splitFrontmatter(raw);
      return {
        file,
        fm: parsed.data || {},
        body: parsed.body || '',
        raw,
        hasFrontmatter: parsed.hasFrontmatter,
        parseError: parsed.parseError || null,
      };
    })
    .filter((doc) => doc.fm?.artifact_type);
}

function screenSpecs(docsDir) {
  const root = path.join(docsDir, 'domains');
  if (!fs.existsSync(root)) return [];
  return walkFiles(root, ['.md'])
    .filter((file) => path.basename(file) === 'screen-spec.md')
    .map((file) => loadScreenSpec(file));
}

function idOf(spec) {
  return text(spec?.frontmatter?.screen_id);
}

function entryOf(spec) {
  return text(spec?.frontmatter?.screen_entry);
}

function identityOf(spec, docsDir) {
  return {
    screen_id: idOf(spec),
    domain: text(spec?.frontmatter?.domain),
    lifecycle: screenLifecycleOf(spec),
    screen_entry: entryOf(spec),
    spec_path: spec ? rel(docsDir, spec.path) : null,
  };
}

function ownerSet(specs, entry) {
  return stable(
    specs
      .filter((spec) => screenLifecycleOf(spec) === 'active' && entryOf(spec) === entry)
      .map(idOf)
      .filter(Boolean),
  );
}

function stableScreenAuthority({ sourceRoot, destinationRoot, docsRelative, selectedScreen }) {
  const reasons = [];
  const sourceDocs = path.join(sourceRoot, ...docsRelative.split('/'));
  const destinationDocs = path.join(destinationRoot, ...docsRelative.split('/'));
  const sourceSpecs = screenSpecs(sourceDocs);
  const destinationSpecs = screenSpecs(destinationDocs);
  const sourceMatches = sourceSpecs.filter((spec) => idOf(spec) === selectedScreen);
  const destinationMatches = destinationSpecs.filter((spec) => idOf(spec) === selectedScreen);
  if (sourceMatches.length !== 1 || destinationMatches.length !== 1) {
    reasons.push(
      reason(
        'VR-SCREEN-001',
        `selected screen_id는 source와 destination에서 각각 정확히 1개여야 함 (source=${sourceMatches.length}, destination=${destinationMatches.length})`,
      ),
    );
    return { reasons, sourceSpecs, destinationSpecs };
  }

  const sourceSpec = sourceMatches[0];
  const destinationSpec = destinationMatches[0];
  const sourceLifecycle = analyzeScreenLifecycles({ specs: sourceSpecs, docsDir: sourceDocs });
  const destinationLifecycle = analyzeScreenLifecycles({ specs: destinationSpecs, docsDir: destinationDocs });
  if (
    sourceLifecycle.records.find((record) => record.spec === sourceSpec)?.errors.length ||
    destinationLifecycle.records.find((record) => record.spec === destinationSpec)?.errors.length
  ) {
    reasons.push(reason('VR-SCREEN-002', 'selected ScreenSpec lifecycle 계약이 source 또는 destination에서 유효하지 않음'));
  }

  const sourceIdentity = identityOf(sourceSpec, sourceDocs);
  const destinationIdentity = identityOf(destinationSpec, destinationDocs);
  for (const field of ['screen_id', 'domain', 'lifecycle', 'screen_entry', 'spec_path']) {
    if (!sourceIdentity[field] || sourceIdentity[field] !== destinationIdentity[field]) {
      reasons.push(
        reason('VR-SCREEN-003', `ScreenSpec authority identity drift: ${field}`, {
          field,
          source: sourceIdentity[field] || null,
          destination: destinationIdentity[field] || null,
        }),
      );
    }
  }
  if (destinationIdentity.lifecycle !== 'active') {
    reasons.push(reason('VR-SCREEN-004', 'visual-refresh는 active ScreenSpec만 권한을 부여할 수 있음'));
  }

  let authorizedPath = null;
  if (!destinationIdentity.screen_entry) {
    reasons.push(reason('VR-SCREEN-005', 'ScreenSpec screen_entry가 명시되지 않음'));
  } else {
    try {
      authorizedPath = canonicalAuthorityPath(destinationIdentity.screen_entry, 'ScreenSpec screen_entry');
    } catch (error) {
      reasons.push(reason('VR-SCREEN-006', error.message));
    }
  }
  if (authorizedPath) {
    const expectedOwners = [selectedScreen];
    const sourceOwners = ownerSet(sourceSpecs, authorizedPath);
    const destinationOwners = ownerSet(destinationSpecs, authorizedPath);
    if (!sameArray(sourceOwners, expectedOwners) || !sameArray(destinationOwners, expectedOwners)) {
      reasons.push(
        reason('VR-SCREEN-007', 'screen_entry owner set이 source/destination에서 selected screen 단독 소유가 아님', {
          source_owners: sourceOwners,
          destination_owners: destinationOwners,
        }),
      );
    }
    if (!regular(sourceRoot, authorizedPath) || !regular(destinationRoot, authorizedPath)) {
      reasons.push(reason('VR-SCREEN-008', 'screen_entry가 source와 destination 모두의 기존 regular file이 아님'));
    }
  }
  return {
    reasons,
    sourceSpecs,
    destinationSpecs,
    sourceSpec,
    destinationSpec,
    sourceIdentity,
    destinationIdentity,
    authorizedPath,
  };
}

function parentValue(value) {
  const normalized = text(value);
  if (!normalized || normalized === '-' || /^(none|null|n\/a)$/i.test(normalized)) return null;
  return normalized;
}

export function analyzeSupersessionComponent({ inputArtifacts = [], registerRows = [], selectedInputId }) {
  const reasons = [];
  const byId = new Map();
  const fmParents = new Map();
  const registerParents = new Map();
  const graph = new Map();
  const ensure = (id) => {
    if (!graph.has(id)) graph.set(id, new Set());
  };
  const link = (left, right) => {
    if (!left || !right) return;
    ensure(left);
    ensure(right);
    graph.get(left).add(right);
    graph.get(right).add(left);
  };

  for (const artifact of inputArtifacts) {
    const id = text(artifact?.fm?.input_id);
    if (!id) continue;
    if (!byId.has(id)) byId.set(id, []);
    if (!fmParents.has(id)) fmParents.set(id, []);
    byId.get(id).push(artifact);
    const parent = parentValue(artifact.fm?.supersedes);
    fmParents.get(id).push(parent);
    ensure(id);
    if (parent) link(id, parent);
  }
  for (const row of registerRows) {
    const id = text(row?.inputId);
    if (!id) continue;
    if (!registerParents.has(id)) registerParents.set(id, []);
    const parent = parentValue(row.supersedes);
    registerParents.get(id).push(parent);
    ensure(id);
    if (parent) link(id, parent);
  }

  ensure(selectedInputId);
  const component = new Set();
  const queue = [selectedInputId];
  while (queue.length) {
    const id = queue.shift();
    if (component.has(id)) continue;
    component.add(id);
    for (const neighbor of graph.get(id) || []) queue.push(neighbor);
  }

  const selectedMatches = byId.get(selectedInputId) || [];
  if (selectedMatches.length !== 1) {
    reasons.push(reason('VR-SUPER-001', `selected input_id는 정확히 1개여야 함: ${selectedInputId}`, { count: selectedMatches.length }));
  }

  const parentById = new Map();
  for (const id of component) {
    const artifacts = byId.get(id) || [];
    const fromInput = fmParents.get(id) || [];
    const fromRegister = registerParents.get(id) || [];
    if (artifacts.length !== 1 || fromInput.length !== 1) {
      reasons.push(reason('VR-SUPER-002', `connected input identity가 unique하지 않음: ${id}`, { count: artifacts.length }));
      continue;
    }
    if (fromRegister.length !== 1) {
      reasons.push(reason('VR-SUPER-003', `connected input의 Register Summary 행이 정확히 1개가 아님: ${id}`, { count: fromRegister.length }));
      continue;
    }
    if (fromInput[0] !== fromRegister[0]) {
      reasons.push(
        reason('VR-SUPER-004', `frontmatter와 Register Summary의 Supersedes가 불일치: ${id}`, {
          frontmatter: fromInput[0],
          register: fromRegister[0],
        }),
      );
      continue;
    }
    if (fromInput[0] && (byId.get(fromInput[0]) || []).length !== 1) {
      reasons.push(reason('VR-SUPER-005', `supersedes parent가 unique input으로 해소되지 않음: ${id} -> ${fromInput[0]}`));
      continue;
    }
    parentById.set(id, fromInput[0]);
  }

  const children = new Map();
  for (const [child, parent] of parentById) {
    if (!parent) continue;
    if (!children.has(parent)) children.set(parent, []);
    children.get(parent).push(child);
  }
  const leaves = [...component].filter((id) => (children.get(id) || []).length === 0);
  if (leaves.length !== 1 || leaves[0] !== selectedInputId) {
    reasons.push(reason('VR-SUPER-006', 'selected input이 connected component의 sole terminal leaf가 아님', { leaves: stable(leaves) }));
  }
  for (const id of component) {
    if (id === selectedInputId) continue;
    const successors = (children.get(id) || []).filter((child) => component.has(child));
    if (successors.length !== 1) {
      reasons.push(reason('VR-SUPER-007', `selected-chain ancestor는 successor가 정확히 1개여야 함: ${id}`, { successors: stable(successors) }));
    }
  }
  for (const start of component) {
    const seen = new Set();
    let cursor = start;
    while (cursor) {
      if (seen.has(cursor)) {
        reasons.push(reason('VR-SUPER-008', `supersession cycle 감지: ${cursor}`));
        break;
      }
      seen.add(cursor);
      cursor = parentById.get(cursor) || null;
    }
  }

  return {
    reasons,
    componentIds: stable(component),
    selectedArtifact: selectedMatches.length === 1 ? selectedMatches[0] : null,
    parentById,
    childrenById: children,
  };
}

function issueInComponent(issue, files, ids) {
  if (files.has(issue.file)) return true;
  const message = String(issue.message || '');
  return ids.some((id) => message.includes(id));
}

function selectedInputAuthority({ sourceRoot, destinationRoot, docsRelative, identity, selectedInputId, register }) {
  const reasons = [];
  const destinationDocs = path.join(destinationRoot, ...docsRelative.split('/'));
  const sourceDocs = path.join(sourceRoot, ...docsRelative.split('/'));
  const destinationInputs = collectInputArtifacts(path.join(destinationDocs, 'inputs'));
  const sourceInputs = collectInputArtifacts(path.join(sourceDocs, 'inputs'));
  const supersession = analyzeSupersessionComponent({
    inputArtifacts: destinationInputs,
    registerRows: register.rows,
    selectedInputId,
  });
  reasons.push(...supersession.reasons);
  const selected = supersession.selectedArtifact;
  if (!selected) return { reasons, destinationInputs, sourceInputs, supersession };

  const fm = selected.fm || {};
  if (fm.status !== 'captured') {
    reasons.push(reason('VR-INPUT-001', `selected input status는 captured여야 함 (현재 ${JSON.stringify(fm.status ?? null)})`));
  }
  const affectedDomains = strings(fm.affected_domains);
  const affectedScreens = strings(fm.affected_screens);
  if (!sameArray(affectedDomains, [identity.domain]) || !sameArray(affectedScreens, [identity.screen_id])) {
    reasons.push(
      reason('VR-INPUT-002', 'selected input scope가 selected screen/domain의 direct canonical singleton이 아님', {
        affected_domains: affectedDomains,
        affected_screens: affectedScreens,
      }),
    );
  }

  const componentFiles = new Set(
    destinationInputs
      .filter((artifact) => supersession.componentIds.includes(artifact.fm?.input_id))
      .map((artifact) => artifact.file),
  );
  for (const issue of validateInputArtifacts(destinationInputs).errors || []) {
    if (issueInComponent(issue, componentFiles, supersession.componentIds)) {
      reasons.push(reason('VR-INPUT-003', issue.message, { file: rel(destinationRoot, issue.file) }));
    }
  }

  const contract = parseInputContract(fm);
  if (contract.version === 1) {
    if (own(fm, 'fidelity')) {
      reasons.push(reason('VR-INPUT-004', 'legacy selected input은 fidelity를 가질 수 없음; input_contract: 2가 필요함'));
    }
  } else if (contract.version === 2) {
    for (const message of inspectInputFidelity(fm).issues) reasons.push(reason('VR-INPUT-005', message));
    for (const issue of collectInputFidelityIssues(destinationInputs).issues) {
      if (issueInComponent(issue, componentFiles, supersession.componentIds)) {
        reasons.push(reason('VR-INPUT-006', issue.message, { file: rel(destinationRoot, issue.file) }));
      }
    }
  } else {
    for (const message of contract.issues) reasons.push(reason('VR-INPUT-007', message));
  }

  const selectedRelative = rel(destinationRoot, selected.file);
  const sourceMatches = sourceInputs.filter((artifact) => artifact.fm?.input_id === selectedInputId);
  let sourceSelected = null;
  if (sourceMatches.length > 1) {
    reasons.push(reason('VR-INPUT-008', 'source tree에 selected input_id가 중복됨'));
  } else if (sourceMatches.length === 1) {
    sourceSelected = sourceMatches[0];
    const sourceRelative = rel(sourceRoot, sourceSelected.file);
    if (sourceRelative !== selectedRelative) {
      reasons.push(reason('VR-INPUT-009', 'existing selected input path가 source→destination에서 변경됨'));
    } else if ((readFileSafe(sourceSelected.file) || '') !== (readFileSafe(selected.file) || '')) {
      reasons.push(reason('VR-INPUT-010', 'existing selected input은 byte-identical이어야 함; 새 ID + supersedes가 필요함'));
    }
  }
  return {
    reasons,
    destinationInputs,
    sourceInputs,
    supersession,
    selected,
    selectedRelative,
    sourceSelected,
    sourceSelectedExists: Boolean(sourceSelected),
  };
}

function rowsFor(section) {
  return parseTable(section || '')?.rows || [];
}

function mappingKey(row) {
  const direct = text(col(row, 'Mapping Key'));
  if (direct) return direct;
  const source = text(col(row, 'Figma Frame / Node'));
  return /`(M-[A-Z0-9-]+)`/.exec(source)?.[1] || '';
}

function selectedMappingIssues(validation, destinationRoot, mappingFile, tokens) {
  const out = [];
  for (const issue of [...(validation.errors || []), ...(validation.warnings || [])]) {
    const message = String(issue.message || '');
    const sameFile = issue.file && path.resolve(issue.file) === path.resolve(mappingFile);
    if (sameFile || tokens.some((token) => token && message.includes(token))) {
      out.push({ message, file: issue.file ? rel(destinationRoot, issue.file) : null });
    }
  }
  return out;
}

function registerMappingEvidenceAuthority({
  destinationRoot,
  docsRelative,
  selectedScreen,
  selectedDomain,
  selectedInputId,
  inputContext,
  docs,
}) {
  const reasons = [];
  const docsDir = path.join(destinationRoot, ...docsRelative.split('/'));
  const registerFile = path.join(docsDir, ...REGISTER_RELATIVE.split('/'));
  const register = parseReconciliationRegister(registerFile);
  if (!register.exists) {
    reasons.push(reason('VR-RR-001', 'Reconciliation Register가 없음'));
    return { reasons, register, registerFile };
  }

  const base = validateReconciliationRegister({
    register,
    inputArtifacts: inputContext.destinationInputs,
    registerFile,
    enforce: true,
  });
  for (const issue of base.errors || []) {
    const message = String(issue.message || '');
    if (
      message.includes(selectedInputId) ||
      /frontmatter|필수 컬럼|파싱 가능한 Reconciliation Register 표|중복/.test(message)
    ) {
      reasons.push(reason('VR-RR-002', message));
    }
  }

  const contract = parseRegisterContract(register.fm || {});
  if (contract.version !== 2 || contract.errors.length) {
    const messages = contract.errors.length
      ? contract.errors
      : ['Reconciliation Register는 reconciliation_contract: 2가 필수'];
    for (const message of messages) reasons.push(reason('VR-RR-003', message));
  }

  const summaries = register.rows.filter((row) => row.inputId === selectedInputId);
  if (summaries.length !== 1) {
    reasons.push(reason('VR-RR-004', `selected input Summary row가 정확히 1개가 아님: ${summaries.length}`));
    return { reasons, register, registerFile };
  }
  const summary = summaries[0];
  if (summary.reconcileStatus !== 'reconciled' || summary.result !== 'accepted') {
    reasons.push(reason('VR-RR-005', 'selected input Summary는 reconciled + accepted여야 함'));
  }
  if (summary.classification !== 'simple-update') {
    reasons.push(reason('VR-RR-006', `selected input Summary Classification은 simple-update여야 함 (현재 ${summary.classification})`));
  }

  const parsedItems = parseReconciliationItems(register.body || '');
  if (
    !parsedItems.sectionExists ||
    parsedItems.sectionCount !== 1 ||
    parsedItems.tableCount !== 1 ||
    parsedItems.headerIssue
  ) {
    reasons.push(reason('VR-RR-007', 'Reconciliation Items는 canonical 단일 section/단일 10컬럼 표여야 함'));
    return { reasons, register, registerFile, summary, parsedItems };
  }
  const selectedItems = parsedItems.rows.filter((row) => row.inputId === selectedInputId);
  if (selectedItems.length !== 1) {
    reasons.push(reason('VR-RR-008', `selected input Reconciliation Item이 정확히 1개가 아님: ${selectedItems.length}`));
    return { reasons, register, registerFile, summary, parsedItems };
  }
  const item = selectedItems[0];
  if (
    item.basis !== 'visual-evidence' ||
    item.classification !== 'simple-update' ||
    !['update', 'create'].includes(item.effect)
  ) {
    reasons.push(
      reason('VR-RR-009', 'selected item은 visual-evidence/simple-update/update|create여야 함', {
        basis: item.basis,
        classification: item.classification,
        effect: item.effect,
      }),
    );
  }

  const target = parseTargetRef(item.target);
  if (
    !target ||
    target.kind !== 'artifact' ||
    target.section !== MAPPING_SECTION ||
    !target.rowKey
  ) {
    reasons.push(reason('VR-RR-010', 'selected target은 artifact:<mapping-id>#component-mapping/<M-ID> exact form이어야 함'));
    return { reasons, register, registerFile, summary, parsedItems, item };
  }

  const v2 = validateReconciliationV2({
    register,
    registerFile,
    inputArtifacts: inputContext.destinationInputs,
    targetIndex: buildReconciliationTargetIndex({ docs }),
  });
  for (const issue of v2.errors || []) {
    const message = String(issue.message || '');
    if (
      message.startsWith('RR-SCHEMA-') ||
      inputContext.supersession.componentIds.some((id) => message.includes(id)) ||
      [target.artifactId, target.rowKey, item.evidence, item.target].some((token) => token && message.includes(token))
    ) {
      reasons.push(reason('VR-RR-011', message));
    }
  }
  for (const issue of v2.warnings || []) {
    const message = String(issue.message || '');
    if (
      inputContext.supersession.componentIds.some((id) => message.includes(id)) ||
      [target.artifactId, target.rowKey, item.evidence, item.target].some((token) => token && message.includes(token))
    ) {
      reasons.push(reason('VR-RR-012', message));
    }
  }

  const mappings = docs.filter((doc) => doc.fm?.artifact_id === target.artifactId);
  if (mappings.length !== 1) {
    reasons.push(reason('VR-MAP-001', `mapping artifact_id가 unique하게 해소되지 않음: ${target.artifactId}`, { count: mappings.length }));
    return { reasons, register, registerFile, summary, parsedItems, item, target };
  }
  const mapping = mappings[0];
  const fm = mapping.fm || {};
  if (
    fm.artifact_type !== MAPPING_ARTIFACT_TYPE ||
    ![1, '1'].includes(fm.provenance_contract) ||
    fm.status === 'deprecated'
  ) {
    reasons.push(reason('VR-MAP-002', 'mapping은 figma-component-mapping + provenance_contract: 1 + non-deprecated여야 함'));
  }
  if (text(fm.screen_id) !== selectedScreen || text(fm.domain) !== selectedDomain) {
    reasons.push(reason('VR-MAP-003', 'mapping screen_id/domain이 selected screen/domain과 불일치'));
  }

  const sections = getSections(mapping.body || '');
  const componentRows = rowsFor(sections[MAPPING_SECTION_KEY]);
  const provenanceRows = rowsFor(sections[MAPPING_PROVENANCE_SECTION_KEY]);
  const componentMatches = componentRows.filter((row) => mappingKey(row) === target.rowKey);
  const provenanceMatches = provenanceRows.filter(
    (row) => text(col(row, 'Mapping Key')) === target.rowKey,
  );
  if (componentMatches.length !== 1 || provenanceMatches.length !== 1) {
    reasons.push(
      reason('VR-MAP-004', 'target M-key가 Component Mapping과 Mapping Provenance에 각각 정확히 1개여야 함', {
        component_rows: componentMatches.length,
        provenance_rows: provenanceMatches.length,
      }),
    );
  }

  const mappingValidation = validateMappingProvenance({
    docs,
    inputArtifacts: inputContext.destinationInputs,
  });
  for (const issue of selectedMappingIssues(
    mappingValidation,
    destinationRoot,
    mapping.file,
    [target.rowKey, target.artifactId, item.evidence],
  )) {
    if (/^MP-/.test(issue.message) || /MP-103/.test(issue.message)) {
      reasons.push(reason('VR-MAP-005', issue.message, { file: issue.file }));
    }
  }

  const provenanceEvidence = provenanceMatches.length === 1
    ? text(col(provenanceMatches[0], 'Evidence'))
    : '';
  if (!provenanceEvidence || provenanceEvidence !== item.evidence) {
    reasons.push(reason('VR-EVIDENCE-001', 'Reconciliation Item과 Mapping Provenance의 Evidence ref가 exact match가 아님'));
  }
  const evidence = resolveInputEvidence(
    buildInputArtifactIndex(inputContext.destinationInputs),
    item.evidence,
  );
  if (
    evidence.status !== 'ok' ||
    evidence.ref?.inputId !== selectedInputId ||
    evidence.ref?.bulletIndex == null ||
    !text(evidence.evidenceText)
  ) {
    reasons.push(
      reason('VR-EVIDENCE-002', 'Evidence는 selected input의 visible, in-range, non-empty exact bullet로 해소되어야 함', {
        status: evidence.status,
      }),
    );
  }

  const touched = String(summary.touched || '').split(';').map((value) => value.trim()).filter(Boolean);
  const created = String(summary.created || '').split(';').map((value) => value.trim()).filter(Boolean);
  if (!touched.includes(`artifact:${target.artifactId}`)) {
    reasons.push(reason('VR-RR-013', 'Summary Touched Artifacts가 selected mapping artifact를 포함하지 않음'));
  }
  if (item.effect === 'create' && !created.includes(item.target)) {
    reasons.push(reason('VR-RR-014', 'effect=create인데 exact target이 Summary Created Items에 없음'));
  }
  if (item.effect === 'update' && created.includes(item.target)) {
    reasons.push(reason('VR-RR-015', 'effect=update인데 target이 Summary Created Items에 생성물로 기록됨'));
  }

  return {
    reasons,
    register,
    registerFile,
    summary,
    item,
    target,
    mapping,
    mappingRelative: rel(destinationRoot, mapping.file),
    mappingKey: target.rowKey,
    evidenceRef: item.evidence,
  };
}

function snapshotResources(root, options) {
  const docsRelative = canonicalAuthorityPath(options.docs || DEFAULTS.docs, '--docs');
  const srcRelative = canonicalAuthorityPath(options.src || DEFAULTS.src, '--src');
  const policyRef = options.policy
    ? confined(root, options.policy, '--policy')
    : { relative: null, absolute: DEFAULTS.policy };
  const manifestRef = options.manifest
    ? confined(root, options.manifest, '--manifest')
    : { relative: null, absolute: DEFAULTS.manifest };
  const layoutRef = options.layout
    ? confined(root, options.layout, '--layout')
    : { relative: null, absolute: path.join(KIT_ROOT, 'policies', 'project-layout.yaml') };
  const ciRef = options.ci ? confined(root, options.ci, '--ci') : null;

  const policy = readYaml(policyRef.absolute, 'policy');
  const manifest = readYaml(manifestRef.absolute, 'manifest');
  const ci = ciRef ? readYaml(ciRef.absolute, 'ci').value : {};
  const flags = Object.create(null);
  if (options.layout) flags.layout = layoutRef.absolute;
  const layout = loadLayoutProfile({ kitRoot: KIT_ROOT, flags });

  const canonicalBuiltIn =
    sha256(policy.raw) === sha256(readFileSafe(DEFAULTS.policy) || '') &&
    sha256(readFileSafe(layoutRef.absolute) || '') ===
      sha256(readFileSafe(path.join(KIT_ROOT, 'policies', 'project-layout.yaml')) || '') &&
    layout.layerTelemetryDeclared !== true;

  return {
    docsRelative,
    srcRelative,
    docsDir: path.join(root, ...docsRelative.split('/')),
    srcDir: path.join(root, ...srcRelative.split('/')),
    policy: policy.value,
    manifest: manifest.value,
    ci,
    layout,
    canonicalBuiltIn,
    resourceProvenance: {
      package_version: packageVersion(),
      policy: { source: policyRef.relative || 'bundled', sha256: sha256(policy.raw) },
      manifest: { source: manifestRef.relative || 'bundled', sha256: sha256(manifest.raw) },
      layout: {
        source: layoutRef.relative || 'bundled',
        sha256: sha256(readFileSafe(layoutRef.absolute) || ''),
      },
      ...(ciRef
        ? { ci: { source: ciRef.relative, sha256: sha256(readFileSafe(ciRef.absolute) || '') } }
        : {}),
    },
  };
}

function freshReadiness(root, selectedScreen, options) {
  const resources = snapshotResources(root, options);
  const { state } = buildState({
    docsDir: resources.docsDir,
    srcDir: resources.srcDir,
    date: '1970-01-01',
    layout: resources.layout,
    projectRoot: root,
  });
  const output = computeReadiness({
    state,
    policy: resources.policy,
    ci: resources.ci,
    manifest: resources.manifest,
    layout: resources.layout,
    screenOnlyId: selectedScreen,
    exposeCaps: true,
    skipSurfaces: true,
  });
  return { ...resources, state, output, entry: output?.[selectedScreen] || null };
}

function atLeast(entry, actual, minimum) {
  const order = Array.isArray(entry?.__mode_order) ? entry.__mode_order : [];
  const floor = order.indexOf(minimum);
  const current = order.indexOf(actual);
  return floor >= 0 && current >= floor;
}

function generatedPatterns(manifest, docsRelative) {
  const out = [];
  for (const artifact of discoverArtifacts(manifest, { allowlist: [] })) {
    if (!artifact.generated || artifact.do_not_edit !== true) continue;
    const paths = [artifact.path, ...(artifact.outputs || []).map((entry) => entry.path)].filter(Boolean);
    for (let raw of paths) {
      raw = String(raw).replace(/\\/g, '/');
      if (raw.startsWith('docs/frontend-workflow/')) {
        raw = `${docsRelative}/${raw.slice('docs/frontend-workflow/'.length)}`;
      }
      out.push({
        artifact_id: artifact.id,
        path: raw.replace(/\{domain\}|\{screen\}|\{surface\}/g, '*'),
      });
    }
  }
  return out;
}

function generatedOwner(file, patterns) {
  return patterns.find((entry) => globMatches(entry.path, file)) || null;
}

function roleMatches(layout, role, domain, file) {
  try {
    return layout
      .resolvePaths([`{roles.${role}}`], { domain })
      .filter((pattern) => globMatches(pattern, file));
  } catch {
    return [];
  }
}

export function visualImplementationAuthorization({
  file,
  authorizedPath,
  selectedScreen,
  readiness,
  layout,
  domain,
  canonicalBuiltIn,
  generated,
}) {
  const checkedPath = canonicalAuthorityPath(file, '--path');
  if (checkedPath !== authorizedPath) {
    return {
      allowed: false,
      checked_path: checkedPath,
      reason: 'checked path does not equal the stable exact screen_entry',
    };
  }
  if (generated) {
    return {
      allowed: false,
      checked_path: checkedPath,
      reason: `generated/do-not-edit ownership is final (${generated.artifact_id})`,
      generated_owner: generated,
    };
  }

  const ordinary = readinessPathAuthorization({
    file: checkedPath,
    screenId: selectedScreen,
    entry: readiness,
    modeOrder: readiness?.__mode_order || [],
  });
  if (ordinary.allowed) {
    return { allowed: true, checked_path: checkedPath, grant: 'ordinary-readiness', ordinary };
  }

  const screenRole = roleMatches(layout, 'screen', domain, checkedPath);
  const otherRoles = ['route_entry', 'domain_component', 'hook', 'api_client', 'api_schema']
    .flatMap((role) => roleMatches(layout, role, domain, checkedPath));
  const forbiddenBy = ordinary.forbidden_by || [];
  const allowedBy = ordinary.allowed_by || [];
  const canonicalWaiver =
    canonicalBuiltIn === true &&
    readiness?.readiness_mode === 'api-integrated-ui' &&
    screenRole.length > 0 &&
    otherRoles.length === 0 &&
    allowedBy.some((pattern) => screenRole.includes(pattern)) &&
    forbiddenBy.length > 0 &&
    forbiddenBy.every((pattern) => screenRole.includes(pattern)) &&
    !(ordinary.candidate_matches || []).length &&
    !String(ordinary.reason || '').includes('delegated to shared surface');
  if (canonicalWaiver) {
    return {
      allowed: true,
      checked_path: checkedPath,
      grant: 'visual-refresh-canonical-api-stage-screen-waiver',
      ordinary,
      waived_rules: forbiddenBy.map((pattern) => ({
        source: 'bundled implementation-mode-policy.yaml',
        origin: 'api-integrated-ui.forbidden_paths',
        resolved_path: pattern,
        disposition: 'waived-for-exact-visual-refresh-path',
      })),
    };
  }
  return {
    allowed: false,
    checked_path: checkedPath,
    reason: ordinary.reason || 'ordinary readiness denied the path',
    ordinary,
  };
}

function earlyResult(inputId, reasons, extra = {}) {
  return {
    intent_authorization: {
      intent: VISUAL_REFRESH_INTENT,
      input_id: inputId,
      applicable: false,
      reasons,
      ...extra,
    },
  };
}

export function evaluateVisualRefreshAuthority({
  sourceRoot,
  destinationRoot,
  selectedScreen,
  selectedInputId,
  checkedPath,
  options = {},
  snapshot = {},
}) {
  const reasons = [];
  let destination;
  try {
    destination = freshReadiness(destinationRoot, selectedScreen, options);
  } catch (error) {
    return earlyResult(selectedInputId, [reason('VR-READY-001', error.message)]);
  }
  const readiness = destination.entry;
  if (!readiness) {
    return earlyResult(selectedInputId, [reason('VR-READY-002', `destination readiness에 screen이 없음: ${selectedScreen}`)]);
  }
  if (!atLeast(readiness, readiness.__fact_mode, FINAL_VISUAL_MODE)) {
    reasons.push(reason('VR-READY-003', `destination fact_mode가 ${FINAL_VISUAL_MODE} 미만`, { fact_mode: readiness.__fact_mode || null }));
  }
  if (!atLeast(readiness, readiness.__decision_cap, FINAL_VISUAL_MODE)) {
    reasons.push(reason('VR-READY-004', `destination decision_cap이 ${FINAL_VISUAL_MODE} 미만`, { decision_cap: readiness.__decision_cap || null }));
  }

  const screen = stableScreenAuthority({
    sourceRoot,
    destinationRoot,
    docsRelative: destination.docsRelative,
    selectedScreen,
  });
  reasons.push(...screen.reasons);
  if (!screen.destinationIdentity || !screen.authorizedPath) {
    return earlyResult(selectedInputId, reasons, {
      fact_mode: readiness.__fact_mode || null,
      decision_cap: readiness.__decision_cap || null,
      snapshot,
      resource_provenance: destination.resourceProvenance,
    });
  }

  const registerFile = path.join(destination.docsDir, ...REGISTER_RELATIVE.split('/'));
  const register = parseReconciliationRegister(registerFile);
  const input = selectedInputAuthority({
    sourceRoot,
    destinationRoot,
    docsRelative: destination.docsRelative,
    identity: screen.destinationIdentity,
    selectedInputId,
    register,
  });
  reasons.push(...input.reasons);
  if (!input.selected) {
    return earlyResult(selectedInputId, reasons, {
      authorized_path: screen.authorizedPath,
      fact_mode: readiness.__fact_mode || null,
      decision_cap: readiness.__decision_cap || null,
      snapshot,
      resource_provenance: destination.resourceProvenance,
    });
  }

  const docs = artifactDocs(destination.docsDir);
  const evidence = registerMappingEvidenceAuthority({
    destinationRoot,
    docsRelative: destination.docsRelative,
    selectedScreen,
    selectedDomain: screen.destinationIdentity.domain,
    selectedInputId,
    inputContext: input,
    docs,
  });
  reasons.push(...evidence.reasons);

  const generated = generatedPatterns(destination.manifest, destination.docsRelative);
  const authorizedGeneratedOwner = generatedOwner(screen.authorizedPath, generated);
  if (authorizedGeneratedOwner) {
    reasons.push(reason('VR-PATH-001', `authorized screen_entry가 generated/do-not-edit output임: ${authorizedGeneratedOwner.artifact_id}`));
  }

  let canonicalChecked = null;
  let pathAuthorization = null;
  if (checkedPath !== undefined) {
    try {
      canonicalChecked = canonicalAuthorityPath(checkedPath, '--path');
      pathAuthorization = visualImplementationAuthorization({
        file: canonicalChecked,
        authorizedPath: screen.authorizedPath,
        selectedScreen,
        readiness,
        layout: destination.layout,
        domain: screen.destinationIdentity.domain,
        canonicalBuiltIn: destination.canonicalBuiltIn,
        generated: generatedOwner(canonicalChecked, generated),
      });
    } catch (error) {
      pathAuthorization = { allowed: false, reason: error.message };
    }
  }

  const applicable = reasons.length === 0;
  if (!applicable && pathAuthorization) pathAuthorization = { ...pathAuthorization, allowed: false };
  const intentAuthorization = {
    intent: VISUAL_REFRESH_INTENT,
    input_id: selectedInputId,
    applicable,
    ...(reasons.length ? { reasons } : {}),
    ...(evidence.mappingKey ? { mapping_key: evidence.mappingKey } : {}),
    ...(evidence.evidenceRef ? { evidence_ref: evidence.evidenceRef } : {}),
    authorized_path: screen.authorizedPath,
    ...(canonicalChecked ? { checked_path: canonicalChecked } : {}),
    fact_mode: readiness.__fact_mode || null,
    decision_cap: readiness.__decision_cap || null,
    snapshot,
    resource_provenance: destination.resourceProvenance,
  };
  return {
    intent_authorization: intentAuthorization,
    ...(pathAuthorization ? { path_authorization: pathAuthorization } : {}),
    _context: {
      docs_relative: destination.docsRelative,
      readiness,
      selected_screen: selectedScreen,
      domain: screen.destinationIdentity.domain,
      authorized_path: screen.authorizedPath,
      selected_input_path: input.selectedRelative,
      selected_input_existed_at_source: input.sourceSelectedExists,
      register_path: rel(destinationRoot, evidence.registerFile || registerFile),
      mapping_path: evidence.mappingRelative || null,
      generated_patterns: generated,
    },
  };
}

function pathsOf(record) {
  if (record?.status === 'R' || record?.status === 'C') {
    return [record.oldPath, record.newPath].filter(Boolean);
  }
  return record?.path ? [record.path] : [];
}

function exactOperation(record, relative, allowedStatuses) {
  return allowedStatuses.includes(record?.status) && record?.path === relative;
}

function violation(file, record, code, message, extra = {}) {
  return {
    file,
    change: record?.raw || record?.status || '?',
    code,
    reason: message,
    ...extra,
  };
}

export function routeVisualBackstopRecords({ records, authority, projectPrefix = '' }) {
  const context = authority._context;
  if (!context) {
    return {
      violations: [violation('(authority)', null, 'VR-BACKSTOP-001', 'visual authority context is unavailable')],
    };
  }
  const exact = {
    screen: context.authorized_path,
    input: context.selected_input_path,
    register: context.register_path,
    mapping: context.mapping_path,
  };
  const violations = [];

  for (const record of records) {
    const projectPaths = pathsOf(record).map((repositoryPath) => ({
      repositoryPath,
      projectPath: stripProjectPrefix(repositoryPath, projectPrefix),
    }));
    const outside = projectPaths.filter((entry) => entry.projectPath == null);
    if (outside.length) {
      for (const entry of outside) {
        violations.push(violation(entry.repositoryPath, record, 'VR-BACKSTOP-002', 'changed path is outside selected --root'));
      }
      continue;
    }
    const paths = projectPaths.map((entry) => entry.projectPath);

    const generatedViolations = paths
      .map((file) => ({ file, owner: generatedOwner(file, context.generated_patterns || []) }))
      .filter((entry) => entry.owner);
    if (generatedViolations.length) {
      for (const entry of generatedViolations) {
        violations.push(
          violation(entry.file, record, 'VR-BACKSTOP-003', `generated/do-not-edit ownership is final (${entry.owner.artifact_id})`, {
            generated_owner: entry.owner,
          }),
        );
      }
      continue;
    }

    const touches = (relative) => relative && paths.includes(relative);
    if (touches(exact.screen)) {
      if (!exactOperation(record, exact.screen, ['M'])) {
        violations.push(violation(exact.screen, record, 'VR-BACKSTOP-004', 'authorized screen_entry receives visual authority only for exact M; A/R/C/T/D are forbidden'));
      }
      continue;
    }
    if (touches(exact.input)) {
      const allowed =
        !context.selected_input_existed_at_source && exactOperation(record, exact.input, ['A']);
      if (!allowed) {
        violations.push(
          violation(
            exact.input,
            record,
            'VR-BACKSTOP-005',
            context.selected_input_existed_at_source
              ? 'existing selected input is immutable; use a new input_id + supersedes'
              : 'new selected input authoring permits exact A only',
          ),
        );
      }
      continue;
    }
    if (touches(exact.register) || touches(exact.mapping)) {
      const target = touches(exact.register) ? exact.register : exact.mapping;
      if (!exactOperation(record, target, ['A', 'M'])) {
        violations.push(violation(target, record, 'VR-BACKSTOP-006', 'authority authoring closure permits exact Register/mapping A|M only'));
      }
      continue;
    }

    // No visual record is skipped. ScreenSpec and every unclassified old/new path are routed through
    // the ordinary selected-screen helper; deletes and rename old sides are therefore fail-closed.
    for (const file of paths) {
      let ordinary;
      try {
        ordinary = readinessPathAuthorization({
          file,
          screenId: context.selected_screen,
          entry: context.readiness,
          modeOrder: context.readiness?.__mode_order || [],
        });
      } catch (error) {
        ordinary = { allowed: false, reason: error.message };
      }
      if (!ordinary.allowed) {
        violations.push(
          violation(file, record, 'VR-BACKSTOP-007', ordinary.reason || 'ordinary selected-screen authorization denied the path', {
            ...(ordinary.would_clear ? { would_clear: ordinary.would_clear } : {}),
          }),
        );
      }
    }
  }
  return { violations };
}
