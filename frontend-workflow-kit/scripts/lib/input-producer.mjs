// Generic canonical input artifact producer.
// Source-specific adapters collect/interpret raw source data; this module only
// turns normalized facts into docs/frontend-workflow/inputs/{input_id}.md.
import fs from 'node:fs';
import path from 'node:path';
import {
  INPUT_CONFIDENCE_VALUES,
  INPUT_ID_PATTERN,
  INPUT_TYPE_VALUES,
  SOURCE_TYPE_VALUES,
} from './input-artifact.mjs';
import { exists, isDir, readFileSafe, splitFrontmatter, walkFiles, yamlParse } from './util.mjs';

export class InputProducerError extends Error {
  constructor(message) {
    super(message);
    this.name = 'InputProducerError';
  }
}

export function normalizeInputSourceToken(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function asArray(value) {
  if (value === undefined || value === null || value === '') return [];
  if (Array.isArray(value)) {
    return value
      .map((item) => String(item).trim())
      .filter(Boolean);
  }
  return String(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function trimOrNull(value) {
  const v = typeof value === 'string' ? value.trim() : value == null ? '' : String(value).trim();
  return v === '' ? null : v;
}

// source_screen_refs: source-specific producer 가 실어 보내는 source alias evidence
// (planning/design code, figma node id, route hint). canonical screen id 가 아니다 —
// frontmatter 를 키우지 않고 body `## Source Screen Refs` 로만 렌더해 reconcile/screen-source-map 에 넘긴다.
function normalizeSourceScreenRefs(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((ref) => {
      if (ref && typeof ref === 'object') {
        return {
          source: trimOrNull(ref.source),
          source_id: trimOrNull(ref.source_id ?? ref.sourceId),
          route_hint: trimOrNull(ref.route_hint ?? ref.routeHint),
          node_id: trimOrNull(ref.node_id ?? ref.nodeId),
          confidence: trimOrNull(ref.confidence),
        };
      }
      return { source: null, source_id: trimOrNull(ref), route_hint: null, node_id: null, confidence: null };
    })
    .filter((r) => r.source_id || r.source || r.node_id || r.route_hint);
}

function firstDatePart(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || ''));
  return m ? `${m[1]}${m[2]}${m[3]}` : null;
}

export function inputDateToken({ date, capturedAt, now = new Date() } = {}) {
  const explicitDate = firstDatePart(date);
  if (explicitDate) return explicitDate;
  const capturedDate = firstDatePart(capturedAt);
  if (capturedDate) return capturedDate;
  return now.toISOString().slice(0, 10).replace(/-/g, '');
}

function defaultCapturedAt({ date, now = new Date() } = {}) {
  if (date) {
    const m = /^(\d{4}-\d{2}-\d{2})$/.exec(String(date));
    if (m) return `${m[1]}T00:00:00+09:00`;
  }
  return now.toISOString();
}

function collectInputIdSequenceCandidates(inputsDir) {
  const ids = new Set();
  if (!isDir(inputsDir)) return ids;
  for (const file of walkFiles(inputsDir, ['.md'])) {
    const base = path.basename(file, '.md');
    if (INPUT_ID_PATTERN.test(base)) ids.add(base);
    const raw = readFileSafe(file);
    const { data, parseError } = splitFrontmatter(raw);
    if (!parseError && typeof data.input_id === 'string' && INPUT_ID_PATTERN.test(data.input_id)) {
      ids.add(data.input_id);
    }
  }
  return ids;
}

function collectFrontmatterInputIdFiles(inputsDir) {
  const ids = new Map();
  if (!isDir(inputsDir)) return ids;
  for (const file of walkFiles(inputsDir, ['.md'])) {
    const raw = readFileSafe(file);
    const { data, parseError } = splitFrontmatter(raw);
    if (parseError || typeof data.input_id !== 'string' || !INPUT_ID_PATTERN.test(data.input_id)) {
      continue;
    }
    if (!ids.has(data.input_id)) ids.set(data.input_id, []);
    ids.get(data.input_id).push(file);
  }
  return ids;
}

export function nextInputId({ inputsDir, date, source, capturedAt, now } = {}) {
  const sourceToken = normalizeInputSourceToken(source);
  if (!sourceToken) throw new InputProducerError('source token is required to generate input_id');
  const dateToken = inputDateToken({ date, capturedAt, now });
  const prefix = `IN-${dateToken}-${sourceToken}-`;
  let maxSeq = 0;
  for (const id of collectInputIdSequenceCandidates(inputsDir)) {
    if (!id.startsWith(prefix)) continue;
    const seq = Number(id.slice(prefix.length));
    if (Number.isInteger(seq) && seq > maxSeq) maxSeq = seq;
  }
  return `${prefix}${String(maxSeq + 1).padStart(3, '0')}`;
}

function requireString(payload, key, errors) {
  const value = payload[key];
  if (typeof value !== 'string' || value.trim() === '') {
    errors.push(`${key} is required`);
    return '';
  }
  return value.trim();
}

function validateEnum(value, key, allowed, errors) {
  if (value && !allowed.includes(value)) {
    errors.push(`${key} must be one of: ${allowed.join(', ')}`);
  }
}

export function buildInputArtifact(payload, options = {}) {
  const merged = { ...payload };
  const errors = [];

  const inputType = requireString(merged, 'input_type', errors);
  const sourceType = requireString(merged, 'source_type', errors);
  const sourceRef = requireString(merged, 'source_ref', errors);
  const capturedBy = requireString(merged, 'captured_by', errors);
  const capturedAt = typeof merged.captured_at === 'string' && merged.captured_at.trim() !== ''
    ? merged.captured_at.trim()
    : defaultCapturedAt({ date: options.date, now: options.now });
  const affectedDomains = asArray(merged.affected_domains);
  const affectedScreens = asArray(merged.affected_screens);
  const rawArtifacts = asArray(merged.raw_artifacts);
  const confidence = typeof merged.confidence === 'string' && merged.confidence.trim() !== ''
    ? merged.confidence.trim()
    : 'candidate';
  const supersedes = typeof merged.supersedes === 'string' && merged.supersedes.trim() !== ''
    ? merged.supersedes.trim()
    : null;

  if (affectedDomains.length === 0) errors.push('affected_domains is required');
  if (affectedScreens.length === 0) errors.push('affected_screens is required');
  validateEnum(inputType, 'input_type', INPUT_TYPE_VALUES, errors);
  validateEnum(sourceType, 'source_type', SOURCE_TYPE_VALUES, errors);
  validateEnum(confidence, 'confidence', INPUT_CONFIDENCE_VALUES, errors);

  const sourceForId = merged.source || sourceType || inputType;
  const inputId = typeof merged.input_id === 'string' && merged.input_id.trim() !== ''
    ? merged.input_id.trim()
    : nextInputId({
      inputsDir: options.inputsDir,
      date: options.date,
      source: sourceForId,
      capturedAt,
      now: options.now,
    });

  if (!INPUT_ID_PATTERN.test(inputId)) {
    errors.push(`input_id must match ${INPUT_ID_PATTERN}`);
  }
  if (supersedes && !INPUT_ID_PATTERN.test(supersedes)) {
    errors.push(`supersedes must match ${INPUT_ID_PATTERN}`);
  }
  if (supersedes && supersedes === inputId) {
    errors.push('supersedes must point to an earlier input_id, not itself');
  }

  if (errors.length) throw new InputProducerError(errors.join('\n'));

  const frontmatter = {
    input_id: inputId,
    input_type: inputType,
    source_type: sourceType,
    source_ref: sourceRef,
    captured_at: capturedAt,
    captured_by: capturedBy,
    status: 'captured',
    affected_domains: affectedDomains,
    affected_screens: affectedScreens,
    confidence,
    supersedes,
  };
  if (rawArtifacts.length) frontmatter.raw_artifacts = rawArtifacts;

  return {
    input_id: inputId,
    frontmatter,
    title: String(merged.title || inputId).trim(),
    summary: String(merged.summary || 'No summary provided.').trim(),
    extracted_facts: asArray(merged.extracted_facts ?? merged.facts ?? merged.fact),
    suggested_target_artifacts: asArray(merged.suggested_target_artifacts ?? merged.targets ?? merged.target),
    expected_reconciliation: asArray(merged.expected_reconciliation ?? merged.expected),
    should_not_do: asArray(merged.should_not_do),
    source_screen_refs: normalizeSourceScreenRefs(merged.source_screen_refs),
  };
}

function renderSourceScreenRef(ref) {
  const detail = [];
  if (ref.route_hint) detail.push(`route_hint: ${ref.route_hint}`);
  if (ref.node_id) detail.push(`node: ${ref.node_id}`);
  if (ref.confidence) detail.push(`confidence: ${ref.confidence}`);
  const head = `${ref.source ? `${ref.source} ` : ''}${ref.source_id || '(no source_id)'}`.trim();
  return `- ${head}${detail.length ? ` (${detail.join(', ')})` : ''}`;
}

function yamlScalar(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return `[${value.map((item) => yamlScalar(String(item))).join(', ')}]`;
  return JSON.stringify(String(value));
}

function renderList(items, fallback) {
  const values = asArray(items);
  if (values.length === 0) return `- ${fallback}`;
  return values.map((item) => `- ${item}`).join('\n');
}

export function renderInputArtifact(artifact) {
  const fmOrder = [
    'input_id',
    'input_type',
    'source_type',
    'source_ref',
    'captured_at',
    'captured_by',
    'status',
    'affected_domains',
    'affected_screens',
    'confidence',
    'supersedes',
    'raw_artifacts',
  ];
  const frontmatterLines = fmOrder
    .filter((key) => Object.prototype.hasOwnProperty.call(artifact.frontmatter, key))
    .map((key) => `${key}: ${yamlScalar(artifact.frontmatter[key])}`);

  return [
    '---',
    ...frontmatterLines,
    '---',
    '',
    `# Input: ${artifact.title}`,
    '',
    '## Summary',
    artifact.summary,
    '',
    '## Extracted Facts',
    renderList(artifact.extracted_facts, 'No extracted facts provided.'),
    '',
    ...(artifact.source_screen_refs && artifact.source_screen_refs.length
      ? [
        '## Source Screen Refs',
        '<!-- source alias evidence (planning/design code, figma node, route hint). NOT canonical screen ids — map via screen-source-map / reconcile-input. -->',
        artifact.source_screen_refs.map(renderSourceScreenRef).join('\n'),
        '',
      ]
      : []),
    '## Suggested Target Artifacts',
    renderList(artifact.suggested_target_artifacts, 'No suggested target artifacts provided.'),
    '',
    '## Expected Reconciliation',
    renderList(artifact.expected_reconciliation, 'No expected reconciliation hints provided.'),
    '',
    '## Should Not Do',
    renderList(
      artifact.should_not_do.length
        ? artifact.should_not_do
        : [
          'Do not implement code directly from this input.',
          'Do not promote candidate facts to confirmed without source or approval.',
          'Do not edit generated files directly.',
        ],
      'Do not implement code directly from this input.',
    ),
    '',
  ].join('\n');
}

export function loadProducerPayload(file, { format } = {}) {
  const raw = file === '-' ? fs.readFileSync(0, 'utf8') : readFileSafe(file);
  if (raw == null) throw new InputProducerError(`payload file not found: ${file}`);
  try {
    if (format === 'yaml') return yamlParse(raw) || {};
    return JSON.parse(raw);
  } catch (err) {
    throw new InputProducerError(`${format || 'json'} payload parse failed: ${err.message}`);
  }
}

export function writeInputArtifact(payload, options = {}) {
  const inputsDir = path.resolve(options.inputsDir);
  const artifact = buildInputArtifact(payload, { ...options, inputsDir });
  const outputPath = path.join(inputsDir, `${artifact.input_id}.md`);
  const frontmatterIdFiles = collectFrontmatterInputIdFiles(inputsDir);
  const outputExists = exists(outputPath);
  const outputPathResolved = path.resolve(outputPath);

  if (artifact.frontmatter.supersedes && !frontmatterIdFiles.has(artifact.frontmatter.supersedes)) {
    throw new InputProducerError(`supersedes target does not exist: ${artifact.frontmatter.supersedes}`);
  }
  if (outputExists && !options.overwrite) {
    throw new InputProducerError(
      `input artifact already exists: ${outputPath}\nCreate a new input_id and set supersedes to ${artifact.input_id}, or pass --overwrite intentionally.`,
    );
  }
  const duplicateIdFiles = (frontmatterIdFiles.get(artifact.input_id) || [])
    .filter((file) => path.resolve(file) !== outputPathResolved);
  if (duplicateIdFiles.length || (frontmatterIdFiles.has(artifact.input_id) && !(outputExists && options.overwrite))) {
    throw new InputProducerError(
      `input_id already exists in inputs: ${artifact.input_id}\nCreate a new input_id and set supersedes to ${artifact.input_id}; only the same output file may be overwritten with --overwrite.`,
    );
  }

  const text = renderInputArtifact(artifact);
  if (!options.dryRun) {
    fs.mkdirSync(inputsDir, { recursive: true });
    fs.writeFileSync(outputPath, text, 'utf8');
  }
  return { artifact, outputPath, text, wrote: !options.dryRun };
}
