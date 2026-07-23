import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import {
  analyzeApiCandidateContract,
  deriveMetrics,
  findApiCandidateOwnershipConflicts,
  getSections,
} from './spec.mjs';
import { loadLayoutProfile } from './layout-profile.mjs';
import { KIT_ROOT } from './util.mjs';
import { computeReadiness } from '../readiness.mjs';
import {
  buildPacketModel,
  renderJsonEnvelope as renderPacketJson,
  renderPacketMarkdown,
} from './workflow-packet.mjs';
import {
  buildReportModel,
  renderJsonEnvelope as renderReportJson,
  renderReportMarkdown,
} from './workflow-report.mjs';

const layout = loadLayoutProfile({ kitRoot: KIT_ROOT });

function makeSpec(apiSection, unknownRows = '| U-DEFER | contract pending | open |', domain = 'create') {
  const body = [
    '# Candidate contract',
    '',
    '## State Matrix',
    '| State | Trigger | UI | User Action |',
    '|---|---|---|---|',
    ...['loading', 'empty', 'error', 'success', 'disabled', 'refreshing'].map(
      (state) => `| ${state} | x | x | x |`,
    ),
    '',
    '## API Candidates',
    apiSection,
    '',
    '## Unknowns',
    '| ID | Question | Status |',
    '|---|---|---|',
    unknownRows,
    '',
  ].join('\n');
  return {
    path: `/tmp/${domain}/screen-spec.md`,
    dir: `/tmp/${domain}`,
    frontmatter: { domain },
    sections: getSections(body),
  };
}

function v2Table(rows, headers = ['Method', 'Path', 'Confidence', 'Gate', 'Tracking', 'Slice Paths']) {
  return [
    `| ${headers.join(' | ')} |`,
    `|${headers.map(() => '---').join('|')}|`,
    ...rows.map((row) => `| ${row.join(' | ')} |`),
  ].join('\n');
}

function derivedFor(spec, selectedLayout = layout) {
  return deriveMetrics(spec, {
    layout: selectedLayout,
    srcDir: '/tmp/src',
    projectRoot: '/tmp',
  });
}

const policyV2 = {
  order: ['docs-only', 'api-integrated-ui'],
  modes: {
    'docs-only': {
      requires: [],
      allowed_paths: ['docs/frontend-workflow/**'],
      forbidden_paths: ['src/**'],
    },
    'api-integrated-ui': {
      requires: [
        'api_actionable_confidence_min == confirmed',
        'api_actionable_candidates_count > 0',
        'api_candidate_deferrals_valid == true',
        'state_matrix_complete == true',
      ],
      allowed_paths: ['{roles.hook}', '{roles.api_client}'],
      forbidden_paths: ['{roles.screen}'],
    },
  },
};

function readinessFor(derived, selectedLayout = layout) {
  return computeReadiness({
    state: {
      global: {},
      screens: {
        'CREATE-ATTACH': {
          status: 'confirmed',
          domain: 'create',
          stub: false,
          derived,
        },
      },
    },
    policy: policyV2,
    ci: {},
    manifest: {},
    layout: selectedLayout,
  })['CREATE-ATTACH'];
}

test('legacy bullet-only contract keeps readiness output byte-compatible', () => {
  const spec = makeSpec('- GET /legacy (confidence: confirmed)');
  const derived = derivedFor(spec);
  assert.equal(derived.api_confidence_min, 'confirmed');
  assert.equal(Object.hasOwn(derived, 'api_candidate_contract_version'), false);

  const legacyPolicy = structuredClone(policyV2);
  legacyPolicy.modes['api-integrated-ui'].requires = [
    'api_confidence_min == confirmed',
    'state_matrix_complete == true',
  ];
  const state = {
    global: {},
    screens: {
      'CREATE-ATTACH': {
        status: 'confirmed',
        domain: 'create',
        stub: false,
        derived,
      },
    },
  };
  const before = computeReadiness({
    state,
    policy: legacyPolicy,
    ci: {},
    manifest: {},
    layout,
  });
  const after = computeReadiness({ state, policy: policyV2, ci: {}, manifest: {}, layout });
  assert.deepEqual(after, before);
});

test('four confirmed active candidates plus one deferred candidate reaches api-integrated with narrow paths', () => {
  const activeRows = [1, 2, 3, 4].map((n) => [
    'GET',
    `/active/${n}`,
    'confirmed',
    'active',
    '-',
    `src/api/create/active-${n}.ts`,
  ]);
  const spec = makeSpec(
    v2Table([
      ...activeRows,
      [
        'GET',
        '/stock/curations',
        'candidate',
        'deferred',
        'unknown:U-DEFER',
        'src/api/create/stock/**',
      ],
    ]),
  );
  const derived = derivedFor(spec);
  assert.equal(derived.api_confidence_min, 'candidate');
  assert.equal(derived.api_actionable_confidence_min, 'confirmed');
  assert.equal(derived.api_actionable_candidates_count, 4);
  assert.equal(derived.api_candidate_deferrals_valid, true);

  const readiness = readinessFor(derived);
  assert.equal(readiness.readiness_mode, 'api-integrated-ui');
  assert.deepEqual(
    readiness.allowed_paths,
    activeRows.map((row) => row[5]),
  );
  assert.ok(readiness.forbidden_paths.includes('src/api/create/stock/**'));
  assert.equal(readiness.api_candidate_authorization.deferred[0].tracking, 'unknown:U-DEFER');
});

test('missing/closed tracking and unsafe paths fail closed at api-integrated', () => {
  const cases = [
    {
      name: 'missing tracking',
      tracking: '',
      unknowns: '| U-DEFER | contract pending | open |',
      path: 'src/api/create/deferred.ts',
      code: 'API-V2-TRACKING',
    },
    {
      name: 'closed Unknown',
      tracking: 'unknown:U-DEFER',
      unknowns: '| U-DEFER | contract pending | resolved |',
      path: 'src/api/create/deferred.ts',
      code: 'API-V2-TRACKING-UNKNOWN',
    },
    {
      name: 'unsafe path',
      tracking: 'issue:#210',
      unknowns: '| U-DEFER | contract pending | open |',
      path: 'src/**',
      code: 'API-V2-SLICE-SYNTAX',
    },
  ];
  for (const row of cases) {
    const spec = makeSpec(
      v2Table([
        ['GET', '/active', 'confirmed', 'active', '-', 'src/api/create/active.ts'],
        ['GET', '/deferred', 'candidate', 'deferred', row.tracking, row.path],
      ]),
      row.unknowns,
    );
    const derived = derivedFor(spec);
    assert.equal(derived.api_candidate_deferrals_valid, false, row.name);
    assert.ok(derived.api_candidate_contract_issues.some((entry) => entry.code === row.code), row.name);
    const readiness = readinessFor(derived);
    assert.equal(readiness.readiness_mode, 'docs-only', row.name);
    assert.ok(readiness.blocking.some((entry) => entry.api_candidate_deferrals === false), row.name);
  }
});

test('all candidates deferred cannot reach api-integrated-ui', () => {
  const spec = makeSpec(
    v2Table([
      [
        'GET',
        '/deferred',
        'candidate',
        'deferred',
        'issue:#210',
        'src/api/create/deferred.ts',
      ],
    ]),
  );
  const derived = derivedFor(spec);
  assert.equal(derived.api_actionable_candidates_count, 0);
  const readiness = readinessFor(derived);
  assert.equal(readiness.readiness_mode, 'docs-only');
  assert.ok(readiness.blocking.some((entry) => entry.api_actionable_candidates === 0));
});

test('confirmed+deferred and active/deferred overlap are diagnosed and fail closed', () => {
  const contradictory = analyzeApiCandidateContract(
    makeSpec(
      v2Table([
        [
          'GET',
          '/deferred',
          'confirmed',
          'deferred',
          'issue:#210',
          'src/api/create/deferred.ts',
        ],
      ]),
    ),
    { layout, domain: 'create' },
  );
  assert.ok(contradictory.issues.some((entry) => entry.code === 'API-V2-DEFERRED-CONFIRMED'));

  const overlap = analyzeApiCandidateContract(
    makeSpec(
      v2Table([
        ['GET', '/active', 'confirmed', 'active', '-', 'src/api/create/shared/**'],
        [
          'GET',
          '/deferred',
          'candidate',
          'deferred',
          'issue:#210',
          'src/api/create/shared/detail/**',
        ],
      ]),
    ),
    { layout, domain: 'create' },
  );
  assert.equal(overlap.valid, false);
  assert.ok(overlap.issues.some((entry) => entry.code === 'API-V2-OWNERSHIP-CONFLICT'));
});

test('v2 columns and candidate table count are warning-first diagnostics but live-invalid', () => {
  const missing = analyzeApiCandidateContract(
    makeSpec(v2Table([['GET', '/x', 'confirmed']], ['Method', 'Path', 'Confidence'])),
    { layout, domain: 'create' },
  );
  assert.equal(missing.valid, false);
  assert.ok(missing.issues.some((entry) => entry.code === 'API-V2-COLUMN-MISSING'));

  const duplicated = analyzeApiCandidateContract(
    makeSpec(
      [
        v2Table([['GET', '/x', 'confirmed', 'active', '-', 'src/api/create/x.ts']]),
        '',
        v2Table([['GET', '/y', 'confirmed', 'active', '-', 'src/api/create/y.ts']]),
      ].join('\n'),
    ),
    { layout, domain: 'create' },
  );
  assert.ok(duplicated.issues.some((entry) => entry.code === 'API-V2-TABLE-COUNT'));
});

test('validate check 15 reports malformed v2 as warning-only while legacy stays silent', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'api-candidate-validate-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const docs = path.join(root, 'docs', 'frontend-workflow');
  const screenDir = path.join(docs, 'domains', 'create', 'screens', 'attach');
  fs.mkdirSync(screenDir, { recursive: true });
  const specPath = path.join(screenDir, 'screen-spec.md');
  const malformedTable = v2Table([
    ['GET', '/stock', 'candidate', 'deferred', '', 'src/api/create/stock.ts'],
  ]);
  fs.writeFileSync(
    specPath,
    [
      '---',
      'artifact_id: CREATE-ATTACH-screen-spec',
      'artifact_type: screen-spec',
      'domain: create',
      'screen_id: CREATE-ATTACH',
      'route: /create/attach',
      'status: draft',
      'sources:',
      '  - { type: issue, ref: "https://github.com/example/repo/issues/210" }',
      '---',
      '# Attach',
      '## Entry Points',
      '<!-- GENERATED:START nav-graph -->',
      '- /create/attach',
      '<!-- GENERATED:END nav-graph -->',
      '## API Candidates',
      malformedTable,
      '## Unknowns',
      '| ID | Question | Status |',
      '|---|---|---|',
      '| U-STOCK | pending | open |',
      '## Copy Keys',
      '| Key | 문구 | Status |',
      '|---|---|---|',
      '| create.title | Attach | draft |',
      '## Open Decisions',
      '없음',
      '',
    ].join('\n'),
    'utf8',
  );
  const validate = path.join(KIT_ROOT, 'scripts', 'validate.mjs');
  const result = spawnSync(
    process.execPath,
    [validate, '--docs', docs, '--src', path.join(root, 'src'), '--json'],
    { cwd: root, encoding: 'utf8' },
  );
  assert.equal(result.status, 0, result.stderr);
  const json = JSON.parse(result.stdout);
  assert.equal(json.ok, true);
  assert.ok(json.warnings.some((entry) => entry.check === 15 && /API-V2-TRACKING/.test(entry.message)));

  fs.writeFileSync(
    specPath,
    fs.readFileSync(specPath, 'utf8').replace(
      malformedTable,
      '- GET /stock (confidence: candidate)',
    ),
    'utf8',
  );
  const legacy = spawnSync(
    process.execPath,
    [validate, '--docs', docs, '--src', path.join(root, 'src'), '--json'],
    { cwd: root, encoding: 'utf8' },
  );
  assert.equal(legacy.status, 0, legacy.stderr);
  const legacyJson = JSON.parse(legacy.stdout);
  assert.equal(legacyJson.warnings.some((entry) => entry.check === 15), false);
});

test('custom domain layout validates containment against resolved hook/api_client surfaces', () => {
  const customLayout = {
    layerTelemetryDeclared: false,
    resolvePaths(paths, { domain } = {}) {
      return paths.flatMap((entry) => {
        if (entry === '{roles.hook}') return [`app/${domain}/viewmodels/**`];
        if (entry === '{roles.api_client}') return [`app/${domain}/repositories/**`];
        return [entry];
      });
    },
  };
  const good = analyzeApiCandidateContract(
    makeSpec(
      v2Table([
        ['GET', '/x', 'confirmed', 'active', '-', 'app/create/repositories/x.ts'],
      ]),
    ),
    { layout: customLayout, domain: 'create' },
  );
  assert.equal(good.valid, true);

  const bad = analyzeApiCandidateContract(
    makeSpec(
      v2Table([
        ['GET', '/x', 'confirmed', 'active', '-', 'src/api/create/x.ts'],
      ]),
    ),
    { layout: customLayout, domain: 'create' },
  );
  assert.ok(bad.issues.some((entry) => entry.code === 'API-V2-SLICE-SURFACE'));
});

test('cross-screen explicit slice overlap produces ownership conflicts for both owners', () => {
  const left = derivedFor(
    makeSpec(v2Table([['GET', '/left', 'confirmed', 'active', '-', 'src/api/shared/**']])),
  );
  const right = derivedFor(
    makeSpec(
      v2Table([
        ['GET', '/right', 'candidate', 'deferred', 'issue:#210', 'src/api/shared/right/**'],
      ]),
    ),
  );
  const conflicts = findApiCandidateOwnershipConflicts(
    new Map([
      ['LEFT', { derived: left }],
      ['RIGHT', { derived: right }],
    ]),
  );
  assert.equal(conflicts.get('LEFT').length, 1);
  assert.equal(conflicts.get('RIGHT').length, 1);
  assert.equal(conflicts.get('LEFT')[0].code, 'API-V2-CROSS-SCREEN-OWNERSHIP');
});

test('Work Packet and Run Report JSON/Markdown preserve narrow paths and tracking provenance', () => {
  const spec = makeSpec(
    v2Table([
      ['GET', '/active', 'confirmed', 'active', '-', 'src/api/create/active.ts'],
      [
        'GET',
        '/deferred',
        'candidate',
        'deferred',
        'unknown:U-DEFER',
        'src/api/create/deferred.ts',
      ],
    ]),
  );
  const entry = readinessFor(derivedFor(spec));
  const packetModel = buildPacketModel({
    entry,
    screen: 'CREATE-ATTACH',
    requestedMode: 'api-integrated-ui',
    readinessSource: 'readiness.json',
    order: policyV2.order,
    date: '2026-07-24',
    layout,
  });
  const packetMarkdown = renderPacketMarkdown(packetModel);
  const packetJson = renderPacketJson(packetModel);
  assert.match(packetMarkdown, /## API Candidate Authorization/);
  assert.match(packetMarkdown, /unknown:U-DEFER/);
  assert.deepEqual(packetJson.allowed_paths, ['src/api/create/active.ts']);
  assert.equal(packetJson.api_candidate_authorization.deferred[0].tracking, 'unknown:U-DEFER');

  const reportModel = buildReportModel({
    packet: {
      frontmatter: {
        packet_id: packetModel.packet_id,
        target_screen: 'CREATE-ATTACH',
        domain: 'create',
        requested_mode: 'api-integrated-ui',
        readiness_mode: 'api-integrated-ui',
        readiness_source: 'readiness.json',
      },
      allowedPaths: packetModel.allowed_paths,
      forbiddenPaths: packetModel.forbidden_paths,
      candidateAuthorization: packetModel.api_candidate_authorization,
      blockingRaw: '',
      nextActions: [],
      snapshot: { next_mode: null, ceiling: null },
    },
    paths: { packetRel: 'packet.md' },
    date: '2026-07-24',
  });
  const reportMarkdown = renderReportMarkdown(reportModel);
  const reportJson = renderReportJson(reportModel);
  assert.match(reportMarkdown, /API Candidate Authorization \(packet 인용\)/);
  assert.match(reportMarkdown, /unknown:U-DEFER/);
  assert.deepEqual(reportJson.allowed_paths, ['src/api/create/active.ts']);
  assert.equal(reportJson.api_candidate_authorization.deferred[0].tracking, 'unknown:U-DEFER');
});
