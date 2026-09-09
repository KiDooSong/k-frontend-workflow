import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  analyzeApiCandidateContract, deriveMetrics, loadScreenSpec, parseApiCandidates,
} from './spec.mjs';
import { loadLayoutProfile } from './layout-profile.mjs';
import { KIT_ROOT } from './util.mjs';
import { computeReadiness } from '../readiness.mjs';
import { collectApiCandidateClaims, readinessPathAuthorization } from './path-backstop.mjs';
import {
  diagnoseUnrepresentedLegacyApiCandidates,
  UNREPRESENTED_LEGACY_API_CODE as CODE,
} from './api-candidate-diagnostics.mjs';

const layout = loadLayoutProfile({ kitRoot: KIT_ROOT });
const headers = '| Method | Path | Confidence | Gate | Tracking | Slice Paths |\n|---|---|---|---|---|---|';
const table = `${headers}\n| GET | /live | confirmed | active | - | src/api/create/live.ts |\n| GET | /pending | candidate | deferred | issue:#233 | src/api/create/pending/** |`;
const declaration = '- POST /missing (confidence: confirmed)';
const sourceFor = (section) => `---\nartifact_type: screen-spec\ndomain: create\n---\n# Synthetic parser fixture\n\n## Purpose\nUnit test only, not a complete validate fixture.\n\n## API Candidates\n${section}\n`;

function temp(t, prefix) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

function observe(t, source) {
  const file = path.join(temp(t, 'api-mixed-unit-'), 'screen-spec.md');
  fs.writeFileSync(file, source, 'utf8');
  const spec = loadScreenSpec(file);
  const contract = analyzeApiCandidateContract(spec, { layout });
  const before = structuredClone(contract);
  const candidates = parseApiCandidates(spec.sections['api candidates']);
  const findings = diagnoseUnrepresentedLegacyApiCandidates({ source, contract, file: 'screen-spec.md' });
  assert.deepEqual(contract, before, 'diagnostics must not mutate the actual contract');
  assert.deepEqual(parseApiCandidates(spec.sections['api candidates']), candidates);
  return { spec, contract, candidates, findings };
}

for (const eol of ['\n', '\r\n']) {
  test(`original source locations survive frontmatter, earlier sections and ${JSON.stringify(eol)}`, (t) => {
    const source = sourceFor(`${table}\n\n${declaration}`).replace(/\n/g, eol);
    const { findings, candidates, contract } = observe(t, source);
    assert.equal(contract.valid, true);
    assert.deepEqual(candidates.map(({ method, path }) => [method, path]), [['GET', '/live'], ['GET', '/pending']]);
    assert.equal(findings.length, 1);
    const line = source.split(/\r?\n/).indexOf(declaration) + 1;
    assert.ok(line > 10);
    assert.equal(findings[0].code, CODE);
    assert.equal(findings[0].line, line);
    assert.deepEqual(findings[0].lines, [line]);
    assert.ok(findings[0].message.includes(`screen-spec.md:${line}`));
    assert.match(findings[0].message, /POST \/missing/);
    assert.match(findings[0].message, /Slice Paths.*Gate\/Tracking/);
    assert.match(findings[0].message, /API Candidate History/);
    assert.match(findings[0].message, /자동 표 삽입·active\/confirmed 승격·경로 권한 추가는 하지 않습니다/);
  });
}

test('identity is exact method/path, independent of active/deferred and confidence; repeated locations are retained', (t) => {
  const declarations = [
    '- get /live (confidence: candidate) — explanation',
    '- GET /pending (confidence: unknown) — deferred explanation',
    '- POST /live (confidence: confirmed)',
    '- post /live (confidence: candidate)',
    '- GET /live/ (confidence: confirmed)',
    '- TRACE /trace (confidence: candidate)',
    '- CONNECT /connect (confidence: candidate)',
  ];
  const source = sourceFor(`${table}\n\n${declarations.join('\n')}`);
  const { findings } = observe(t, source);
  assert.deepEqual(findings.map(({ method, path }) => [method, path]), [
    ['POST', '/live'], ['GET', '/live/'], ['TRACE', '/trace'], ['CONNECT', '/connect'],
  ]);
  const lines = source.split('\n');
  const expected = [lines.indexOf(declarations[2]) + 1, lines.indexOf(declarations[3]) + 1];
  assert.deepEqual(findings[0].lines, expected);
  assert.ok(findings[0].message.includes(`source lines: ${expected.join(', ')}`));
});

const nonDeclarations = {
  'backtick fence': '```md\n- GET /example\n```',
  'tilde fence': '~~~md\n- GET /example\n~~~',
  'indented code': '    - GET /example',
  'tab-indented code': '\t- GET /example',
  'HTML comment': '<!--\n- GET /example\n-->',
  'HTML block': '<pre>\n- GET /example\n</pre>',
  'blockquote': '> - GET /example',
  'inline-code declaration': '- `GET /example`',
  'multiline inline code': '`example\n- GET /example\nend`',
  'link definition title': '[example]: /reference "title\n- GET /example\nend"',
  'paragraph': 'GET /example is described here.',
  'explanatory bullet': '- See GET /example for historical context.',
  'escaped dash': '\\- GET /example',
  'non-legacy list markers': '* GET /example\n+ GET /another\n1. GET /ordered',
  'other H2': '## Data Requirements\n- GET /example',
  'explicit history': '## API Candidate History\n- GET /historical (not adopted)',
};
for (const [name, fragment] of Object.entries(nonDeclarations)) {
  test(`does not diagnose ${name}`, (t) => {
    assert.deepEqual(observe(t, sourceFor(`${table}\n\n${fragment}`)).findings, []);
  });
}

test('history language in a literal declaration is not a silent exemption', (t) => {
  const { findings } = observe(t, sourceFor(`${table}\n\n- GET /old — historical, not adopted`));
  assert.equal(findings.length, 1);
  assert.equal(findings[0].path, '/old');
});

test('legacy-only keeps its exact parsing and remains silent', (t) => {
  const { contract, candidates, findings } = observe(t, sourceFor(declaration));
  assert.equal(contract.version, 1);
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].method, 'POST');
  assert.equal(candidates[0].path, '/missing');
  assert.equal(candidates[0].confidence, 'confirmed');
  assert.equal(candidates[0].gate, 'active');
  assert.deepEqual(findings, []);
});

test('only the last API Candidates H2 contributes, matching actual getSections selection', (t) => {
  const source = sourceFor(`${table}\n\n- GET /earlier\n\n## Notes\n- GET /outside\n\n## API Candidates\n${table}\n\n${declaration}`);
  const { findings } = observe(t, source);
  assert.deepEqual(findings.map(({ path }) => path), ['/missing']);
});

test('generated content is not authoring and does not shift later original source locations', (t) => {
  const generated = '<!-- GENERATED:START nav-graph -->\n- GET /generated\n<!-- GENERATED:END nav-graph -->';
  const source = '\uFEFF' + sourceFor(`${table}\n\n${generated}\n\n${declaration}`);
  const { findings } = observe(t, source);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].line, source.split('\n').indexOf(declaration) + 1);
});

test('empty or malformed v2 tables never switch to legacy or lose existing contract diagnostics', (t) => {
  for (const section of [
    headers,
    '| Method | Confidence |\n|---|---|\n| GET | confirmed |',
    `${headers}\n| ??? | invalid | confirmed | active | - | src/api/create/live.ts |`,
    `${table}\n\n${table}`,
  ]) {
    const control = observe(t, sourceFor(section));
    const mixed = observe(t, sourceFor(`${section}\n\n${declaration}`));
    assert.equal(mixed.contract.version, 2);
    assert.deepEqual(mixed.candidates, control.candidates);
    assert.deepEqual(mixed.contract, control.contract);
    assert.equal(mixed.findings.length, 1);
    assert.equal(mixed.candidates.some((row) => row.path === '/missing'), false);
  }
});

const relSpec = 'docs/frontend-workflow/domains/coupons/screens/coupon-list/screen-spec.md';
const screenId = 'COUPON-001';
const livePath = 'src/api/coupons/live.ts';
const deferredPath = 'src/api/coupons/pending/client.ts';
const unownedPath = 'src/api/coupons/unrepresented.ts';
const fullTable = `${headers}\n| GET | /coupons | confirmed | active | - | ${livePath} |\n| GET | /pending | candidate | deferred | issue:#233 | src/api/coupons/pending/** |`;
const missing = '- POST /unrepresented (confidence: confirmed)';
const policy = {
  order: ['docs-only', 'api-integrated-ui'],
  modes: {
    'docs-only': { requires: [], allowed_paths: ['docs/frontend-workflow/**'], forbidden_paths: ['src/**'] },
    'api-integrated-ui': {
      requires: ['api_actionable_confidence_min == confirmed', 'api_actionable_candidates_count > 0', 'api_candidate_deferrals_valid == true', 'state_matrix_complete == true'],
      allowed_paths: ['{roles.hook}', '{roles.api_client}'],
      forbidden_paths: ['{roles.screen}'],
    },
  },
};

function replaceSection(source, title, content) {
  const header = `## ${title}\n`;
  const start = source.indexOf(header);
  assert.ok(start >= 0, `${title} must already exist in the complete fixture`);
  const end = source.indexOf('\n## ', start + header.length);
  return source.slice(0, start + header.length) + content + '\n' + (end < 0 ? '' : source.slice(end));
}

function fullFixture(t) {
  const root = temp(t, 'api-mixed-full-');
  fs.cpSync(path.join(KIT_ROOT, 'examples', 'coupon-feature'), root, { recursive: true });
  const file = path.join(root, relSpec);
  const original = fs.readFileSync(file, 'utf8');
  // These are isolated synthetic test copies, never changes to canonical decisions.
  const source = replaceSection(replaceSection(original, 'Open Decisions', '없음'), 'API Candidates', fullTable);
  fs.writeFileSync(file, source);
  // Exercise the existing documented no-api-manifest OpenAPI fallback with real
  // source evidence. Do not replace the validator's default schema/manifest/policy.
  fs.writeFileSync(path.join(root, 'openapi.yaml'), 'openapi: 3.0.3\ninfo: {title: Synthetic coupons, version: "1.0"}\npaths:\n  /coupons:\n    get:\n      responses:\n        "200": {description: Coupon list}\n');
  return { root, file, source };
}

function validate(fixture, flags = []) {
  const result = spawnSync(process.execPath, [
    path.join(KIT_ROOT, 'scripts', 'validate.mjs'),
    '--docs', path.join(fixture.root, 'docs', 'frontend-workflow'),
    '--src', path.join(fixture.root, 'src'), '--root', fixture.root, ...flags, '--json',
  ], { cwd: fixture.root, encoding: 'utf8', timeout: 30_000 });
  assert.equal(result.error, undefined);
  assert.equal(result.signal, null);
  assert.notEqual(result.status, 2, result.stderr);
  return { status: result.status, output: JSON.parse(result.stdout) };
}

function authority(fixture) {
  const spec = loadScreenSpec(fixture.file);
  const derived = deriveMetrics(spec, { layout, srcDir: path.join(fixture.root, 'src'), projectRoot: fixture.root });
  const readiness = computeReadiness({
    state: { global: {}, screens: { [screenId]: { status: spec.frontmatter.status, domain: 'coupons', stub: false, derived } } },
    policy, ci: {}, manifest: {}, layout,
  });
  const entry = readiness[screenId];
  const claims = collectApiCandidateClaims(readiness);
  const paths = [livePath, deferredPath, unownedPath].map((file) => readinessPathAuthorization({
    file, screenId, entry, modeOrder: policy.order, claims,
  }));
  return { candidates: parseApiCandidates(spec.sections['api candidates']), derived, readiness, paths };
}

for (const eol of ['\n', '\r\n']) {
  test(`full valid ScreenSpec: default/enforce exit 0, public JSON and all authority unchanged (${JSON.stringify(eol)})`, (t) => {
    const fixture = fullFixture(t);
    fixture.source = fixture.source.replace(/\r?\n/g, eol);
    fs.writeFileSync(fixture.file, fixture.source);
    const controls = [[], ['--enforce']].map((flags) => validate(fixture, flags));
    for (const control of controls) {
      assert.equal(control.status, 0, JSON.stringify(control.output));
      assert.deepEqual(control.output.errors, []);
      assert.equal(control.output.ok, true);
      assert.equal(control.output.warnings.some((w) => w.message.startsWith(CODE)), false);
    }
    const before = authority(fixture);
    assert.equal(before.derived.api_candidate_deferrals_valid, true);
    assert.equal(before.readiness[screenId].readiness_mode, 'api-integrated-ui');
    assert.deepEqual(before.paths.map((entry) => entry.allowed), [true, false, false]);
    const mixed = fixture.source.replace(`## Copy Keys${eol}`, `${missing}${eol}${eol}## Copy Keys${eol}`);
    assert.notEqual(mixed, fixture.source);
    fs.writeFileSync(fixture.file, mixed);
    const expectedLine = mixed.split(/\r?\n/).indexOf(missing) + 1;
    for (const [index, flags] of [[], ['--enforce']].entries()) {
      const result = validate(fixture, flags);
      assert.equal(result.status, 0, JSON.stringify(result.output));
      assert.deepEqual(result.output.errors, controls[index].output.errors);
      const warnings = result.output.warnings.filter((w) => w.message.startsWith(CODE));
      assert.equal(warnings.length, 1);
      assert.deepEqual(Object.keys(warnings[0]).sort(), ['check', 'file', 'message']);
      assert.equal(warnings[0].check, 15);
      assert.equal(warnings[0].file, relSpec);
      assert.ok(warnings[0].message.includes(`${relSpec}:${expectedLine}`));
      assert.deepEqual(result.output.warnings.filter((w) => !w.message.startsWith(CODE)), controls[index].output.warnings);
    }
    assert.deepEqual(authority(fixture), before);
    assert.equal(fs.readFileSync(fixture.file, 'utf8'), mixed, 'validate never inserts/promotes a row');
  });
}

test('existing hard errors and malformed-v2 diagnostics survive in default and enforce modes', (t) => {
  const fixture = fullFixture(t);
  assert.equal(validate(fixture).status, 0, 'start with a valid whole project');
  // A concrete no-API contradiction is an existing check-8 hard error; the
  // malformed second table independently retains its existing invalid contract.
  const negative = replaceSection(fixture.source, 'API Candidates', `${fullTable}\n\n| Method | Confidence |\n|---|---|\n| GET | confirmed |`)
    .replace('status: confirmed', 'api_required: false\nstatus: confirmed');
  fs.writeFileSync(fixture.file, negative);
  const negativeControls = [[], ['--enforce']].map((flags) => validate(fixture, flags));
  const negativeAuthority = authority(fixture);
  for (const result of negativeControls) {
    assert.equal(result.status, 1);
    assert.ok(result.output.errors.some((e) => e.check === 8 && /api_required:false/.test(e.message)));
    assert.ok(result.output.warnings.some((w) => w.check === 15 && /API-V2-COLUMN-MISSING/.test(w.message)));
    assert.ok(result.output.warnings.some((w) => w.check === 15 && /API-V2-ENDPOINT/.test(w.message)));
  }
  fs.writeFileSync(fixture.file, negative.replace('## Copy Keys\n', `${missing}\n\n## Copy Keys\n`));
  for (const [index, flags] of [[], ['--enforce']].entries()) {
    const result = validate(fixture, flags);
    assert.equal(result.status, 1);
    assert.deepEqual(result.output.errors, negativeControls[index].output.errors);
    assert.deepEqual(result.output.warnings.filter((w) => !w.message.startsWith(CODE)), negativeControls[index].output.warnings);
    assert.equal(result.output.warnings.filter((w) => w.message.startsWith(CODE)).length, 1);
  }
  assert.deepEqual(authority(fixture), negativeAuthority);
});
