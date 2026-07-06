// visual-contract-bootstrap.test.mjs — contract bootstrap(도입 draft) lib/CLI 단위 테스트.
//
// 실행:
//   node --test scripts/lib/visual-contract-bootstrap.test.mjs
//
// 범위: analyzeVisualContractBootstrap(family/owner/policy 후보 + coverage + gap 후보 +
//   suggested rows + 기존 contract 분리 + 필터 + fail-soft) + renderBootstrapMarkdown 결정성 +
//   CLI 종단(exit code · --json · --out draft 성공 · canonical contract overwrite 거부) +
//   커밋 골든 픽스처(examples/visual-contract-bootstrap/auth-family) 결정성.
//   합성 입력은 임시 디렉토리 관례(visual-consistency.test.mjs 미러; 커밋 트리 불변).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  analyzeVisualContractBootstrap,
  renderBootstrapMarkdown,
  formatBootstrapHuman,
  classifyComponentKind,
  extractImportBindings,
} from './visual-contract-bootstrap.mjs';
import { parseVisualContract } from './visual-consistency.mjs';
import { KIT_ROOT } from './util.mjs';

const CLI = path.join(KIT_ROOT, 'scripts', 'visual-contract-bootstrap.mjs');
const FIXTURE = path.join(KIT_ROOT, 'examples', 'visual-contract-bootstrap', 'auth-family');
const FIXTURE_DOCS = path.join(FIXTURE, 'docs', 'frontend-workflow');
const FIXTURE_SRC = path.join(FIXTURE, 'src');

// --- 합성 트리 헬퍼 (visual-consistency.test.mjs makeTree 미러) -----------------

const CONTRACT_HEADER = `---
artifact_id: "visual-consistency-contract"
artifact_type: visual-consistency-contract
status: draft
last_reviewed: "2026-07-06"
---

# Visual Consistency Contract
`;

function familiesTable(rows) {
  return [
    '## Screen Families',
    '',
    '| Family | Member Screens | Layout/Shell Owner | Logo Policy | Header Policy | CTA Policy | Copy Source | Status | Evidence |',
    '|---|---|---|---|---|---|---|---|---|',
    ...rows,
    '',
  ].join('\n');
}

function componentsTable(rows) {
  return [
    '## Shared Component Rules',
    '',
    '| Component | Owned By | Applies To Families | Direct Screen Import | Positioning Owner | Catalog Status | Notes |',
    '|---|---|---|---|---|---|---|',
    ...rows,
    '',
  ].join('\n');
}

// spec: { domain, slug, screenId, route?, entry?, copyKeys?, mapping? }
function specMd(s) {
  const entryLine = s.entry ? `screen_entry: "${s.entry}"\n` : '';
  const copy = s.copyKeys
    ? `\n## Copy Keys\n| Key | 문구 | Status |\n|---|---|---|\n${s.copyKeys
        .map((r) => `| ${r.key} | ${r.copy} | ${r.status} |`)
        .join('\n')}\n`
    : '';
  return `---\nartifact_id: "${s.screenId}-screen-spec"\nartifact_type: screen-spec\ndomain: "${s.domain}"\nscreen_id: "${s.screenId}"\nroute: "${s.route || '/x'}"\n${entryLine}status: draft\n---\n\n# ScreenSpec\n\n## Purpose\n샘플\n${copy}`;
}

function makeTree({ contract, specs = [], catalog = null, src = null }) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vcb-'));
  const docsDir = path.join(tmp, 'docs', 'frontend-workflow');
  fs.mkdirSync(docsDir, { recursive: true });
  if (contract != null) {
    const designDir = path.join(docsDir, 'design');
    fs.mkdirSync(designDir, { recursive: true });
    fs.writeFileSync(path.join(designDir, 'visual-consistency-contract.md'), contract, 'utf8');
  }
  if (catalog != null) {
    const designDir = path.join(docsDir, 'design');
    fs.mkdirSync(designDir, { recursive: true });
    fs.writeFileSync(path.join(designDir, 'component-catalog.md'), catalog, 'utf8');
  }
  for (const s of specs) {
    const dir = path.join(docsDir, 'domains', s.domain, 'screens', s.slug);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'screen-spec.md'), specMd(s), 'utf8');
    if (s.mapping) {
      fs.writeFileSync(
        path.join(dir, 'figma-component-mapping.md'),
        `---\nartifact_id: "${s.screenId}-figma-component-mapping"\nartifact_type: figma-component-mapping\ndomain: "${s.domain}"\nscreen_id: "${s.screenId}"\nstatus: ${s.mapping}\n---\n\n# Mapping\n`,
        'utf8',
      );
    }
  }
  const srcDir = path.join(tmp, 'src');
  if (src) {
    for (const [rel, content] of Object.entries(src)) {
      const p = path.join(tmp, rel);
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, content, 'utf8');
    }
  }
  return { tmp, docsDir, srcDir };
}

function withTree(spec, fn) {
  const { tmp, docsDir, srcDir } = makeTree(spec);
  try {
    return fn(docsDir, srcDir, tmp);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

const SIMPLE_CATALOG = `# GENERATED FILE — DO NOT EDIT

## Components

| Name | Source Path | Export Kind | Status |
| --- | --- | --- | --- |
| BrandLogo | src/components/ui/BrandLogo.tsx | named | ok |
| Button | src/components/ui/Button.tsx | named | ok |
`;

// 합성 소스: 2화면 shell 사용 + 1화면 direct logo/ad-hoc (픽스처 축약형)
const SYNTH_SRC = {
  'src/features/auth/AuthShell.tsx': `import { BrandLogo } from '../../components/ui/BrandLogo';\nexport function AuthShell(p){ return <div><header><BrandLogo /></header>{p.children}</div>; }\n`,
  'src/features/auth/LoginScreen.tsx': `import { AuthShell } from './AuthShell';\nimport { Button } from '../../components/ui/Button';\nexport const L = () => <AuthShell><Button>go</Button></AuthShell>;\n`,
  'src/features/auth/SignupScreen.tsx': `import { BrandLogo } from '../../components/ui/BrandLogo';\nimport { Button } from '../../components/ui/Button';\nexport const S = () => <div><BrandLogo className="mt-12 absolute" /><h1>회원가입</h1><Button>가입</Button></div>;\n`,
};
const SYNTH_SPECS = [
  {
    domain: 'auth',
    slug: 'login',
    screenId: 'AUTH-001',
    route: '/login',
    entry: 'src/features/auth/LoginScreen.tsx',
    mapping: 'draft',
  },
  {
    domain: 'auth',
    slug: 'signup',
    screenId: 'AUTH-002',
    route: '/signup',
    entry: 'src/features/auth/SignupScreen.tsx',
    copyKeys: [{ key: 'auth.signup.title', copy: '회원가입', status: 'draft' }],
  },
];

function allFindingRules(report) {
  return [...report.findings, ...report.families.flatMap((f) => f.findings)].map(
    (f) => `${f.severity}:${f.rule}`,
  );
}

// --- fail-soft / 구조 오류 -------------------------------------------------------

test('docs 경로 부재 → docs-not-found error (ok=false)', () => {
  const r = analyzeVisualContractBootstrap({
    docsDir: path.join(os.tmpdir(), 'vcb-none-such-dir'),
  });
  assert.equal(r.ok, false);
  assert.deepEqual(allFindingRules(r), ['error:docs-not-found']);
});

test('ScreenSpec 없음 → ok + no-screens-discovered (exit 0 계열, 후보 0)', () => {
  withTree({ contract: null, specs: [] }, (docsDir) => {
    const r = analyzeVisualContractBootstrap({ docsDir });
    assert.equal(r.ok, true);
    assert.equal(r.summary.screens, 0);
    assert.equal(r.summary.candidate_families, 0);
    assert.equal(r.summary.suggested_contract_rows, 0);
    assert.ok(allFindingRules(r).includes('info:no-screens-discovered'));
  });
});

test('기존 contract malformed(Screen Families 표 부재) → contract-malformed error', () => {
  withTree({ contract: CONTRACT_HEADER + '표 없음\n', specs: SYNTH_SPECS }, (docsDir) => {
    const r = analyzeVisualContractBootstrap({ docsDir });
    assert.equal(r.ok, false);
    assert.deepEqual(allFindingRules(r), ['error:contract-malformed']);
  });
});

test('명시된 --src 가 디렉토리가 아님 → source-not-found warning + 소스 휴리스틱 skip', () => {
  withTree({ contract: null, specs: SYNTH_SPECS, src: SYNTH_SRC }, (docsDir, srcDir) => {
    const r = analyzeVisualContractBootstrap({
      docsDir,
      srcDir: path.join(srcDir, 'no-such-subdir'),
    });
    assert.equal(r.ok, true); // warning-first — error 아님
    assert.ok(allFindingRules(r).includes('warning:source-not-found'));
    assert.ok(r.skipped_checks.some((s) => s.rule === 'source-scan'));
    assert.equal(r.shared_components.length, 0); // 소스 검사 자체는 skip
  });
});

test('--src 미지정 → 소스 휴리스틱 skip (skipped_checks 보고), family 후보는 docs 만으로 산출', () => {
  withTree({ contract: null, specs: SYNTH_SPECS }, (docsDir) => {
    const r = analyzeVisualContractBootstrap({ docsDir });
    assert.ok(r.skipped_checks.some((s) => s.rule === 'source-scan'));
    assert.equal(r.summary.candidate_families, 1);
    assert.equal(r.families[0].suggested_contract.layout_shell_owner, 'needs-human-review');
  });
});

// --- 후보 추론 --------------------------------------------------------------------

test('contract 없음 → full draft suggestions (family 행 + component 행) 생성', () => {
  withTree(
    { contract: null, specs: SYNTH_SPECS, catalog: SIMPLE_CATALOG, src: SYNTH_SRC },
    (docsDir, srcDir) => {
      const r = analyzeVisualContractBootstrap({ docsDir, srcDir });
      assert.equal(r.existing_contract.found, false);
      assert.equal(r.summary.candidate_families, 1);
      const f = r.families[0];
      assert.equal(f.family, 'auth');
      assert.deepEqual(f.member_screens, ['AUTH-001', 'AUTH-002']);
      assert.deepEqual(f.members_not_in_contract, ['AUTH-001', 'AUTH-002']);
      // suggested rows: family 1건(전체 멤버) — overwrite 대상이 없으므로 전부 신규
      assert.equal(r.suggested_rows.families.length, 1);
      assert.deepEqual(r.suggested_rows.families[0].member_screens, ['AUTH-001', 'AUTH-002']);
      assert.equal(r.suggested_rows.families[0].addition_to_existing_family, false);
      assert.equal(r.suggested_rows.families[0].status, 'draft');
      // 기존 contract 관련 warning 없음
      assert.ok(!allFindingRules(r).includes('warning:existing-contract-not-overwritten'));
    },
  );
});

test('shell/logo/CTA 반복 import → 후보 감지 + policy 후보 (proof 아님 — candidate 표기)', () => {
  withTree(
    { contract: null, specs: SYNTH_SPECS, catalog: SIMPLE_CATALOG, src: SYNTH_SRC },
    (docsDir, srcDir) => {
      const r = analyzeVisualContractBootstrap({ docsDir, srcDir });
      const f = r.families[0];
      // AuthShell 은 1/2 화면만 import — shell owner 후보가 되려면 ≥2 반복이 필요.
      // SYNTH_SRC 는 login 만 shell 을 쓰므로 needs-human-review 가 맞다.
      assert.equal(f.suggested_contract.layout_shell_owner, 'needs-human-review');
      assert.equal(f.suggested_contract.cta_policy, 'shared-bottom-cta candidate'); // Button 2/2
      const button = r.shared_components.find((c) => c.component === 'Button');
      assert.equal(button.kind, 'cta');
      assert.deepEqual(button.imported_by, ['AUTH-001', 'AUTH-002']);
      // logo: 화면 직접 import 1건 관찰
      assert.equal(
        f.suggested_contract.logo_policy,
        'screen-imported observed — needs-human-review',
      );
    },
  );
});

test('catalog 에 없는 shell-like 반복 import → component_gap_candidate (제안만)', () => {
  // 픽스처(3화면, AuthShell 2회 반복)가 golden — 여기서는 필드 형태를 고정한다.
  const r = analyzeVisualContractBootstrap({ docsDir: FIXTURE_DOCS, srcDir: FIXTURE_SRC });
  assert.deepEqual(r.component_gap_candidates, [
    {
      component: 'AuthShell',
      reason: 'Repeated shell-like import but absent from component catalog',
      affected_families: ['auth'],
    },
  ]);
});

test('component-catalog 부재 → catalog 대조 skip (catalog_status unknown, gap 후보 없음)', () => {
  withTree({ contract: null, specs: SYNTH_SPECS, src: SYNTH_SRC }, (docsDir, srcDir) => {
    const r = analyzeVisualContractBootstrap({ docsDir, srcDir });
    assert.ok(r.skipped_checks.some((s) => s.rule === 'component-gap-candidate'));
    assert.deepEqual(r.component_gap_candidates, []);
    for (const c of r.shared_components) assert.equal(c.catalog_status, 'unknown');
  });
});

test('direct logo import + ad-hoc positioning + hardcoded copy → info findings 로 요약', () => {
  withTree(
    { contract: null, specs: SYNTH_SPECS, catalog: SIMPLE_CATALOG, src: SYNTH_SRC },
    (docsDir, srcDir) => {
      const r = analyzeVisualContractBootstrap({ docsDir, srcDir });
      const rules = allFindingRules(r);
      assert.ok(rules.includes('info:direct-screen-import-observed'), rules.join(','));
      assert.ok(rules.includes('info:adhoc-positioning-observed'), rules.join(','));
      assert.ok(rules.includes('info:hardcoded-copy-candidate'), rules.join(','));
      const di = r.families[0].findings.find((f) => f.rule === 'direct-screen-import-observed');
      assert.equal(di.screen_id, 'AUTH-002');
      assert.equal(di.component, 'BrandLogo');
      assert.equal(di.severity, 'info'); // 관찰이지 계약 위반 판정이 아니다
    },
  );
});

// --- 기존 contract 분리 -------------------------------------------------------------

test('기존 contract → overwrite 없이 existing rows / suggested additions 분리', () => {
  withTree(
    {
      contract:
        CONTRACT_HEADER +
        familiesTable(['| auth | AUTH-001 | AuthShell | shell-owned | - | - | - | draft | - |']) +
        componentsTable(['| BrandLogo | AuthShell | auth | forbidden | shell | cataloged | - |']),
      specs: SYNTH_SPECS,
      catalog: SIMPLE_CATALOG,
      src: SYNTH_SRC,
    },
    (docsDir, srcDir) => {
      const contractFile = path.join(docsDir, 'design', 'visual-consistency-contract.md');
      const before = fs.readFileSync(contractFile, 'utf8');
      const r = analyzeVisualContractBootstrap({ docsDir, srcDir });
      assert.equal(r.existing_contract.found, true);
      assert.ok(allFindingRules(r).includes('warning:existing-contract-not-overwritten'));
      const f = r.families[0];
      assert.deepEqual(f.members_in_existing_contract, ['AUTH-001']);
      assert.deepEqual(f.members_not_in_contract, ['AUTH-002']);
      // suggested family 행은 신규 멤버만 (기존 family 에 대한 addition 표시)
      assert.equal(r.suggested_rows.families.length, 1);
      assert.deepEqual(r.suggested_rows.families[0].member_screens, ['AUTH-002']);
      assert.equal(r.suggested_rows.families[0].addition_to_existing_family, true);
      // BrandLogo 는 기존 contract 에 있으므로 suggested component 에서 제외
      assert.ok(!r.suggested_rows.components.some((c) => c.component === 'BrandLogo'));
      // 분석은 아무 파일도 수정하지 않는다
      assert.equal(fs.readFileSync(contractFile, 'utf8'), before);
    },
  );
});

// --- 필터 --------------------------------------------------------------------------

test('--domain 필터 — 해당 도메인 화면만 family 후보로 본다', () => {
  withTree(
    {
      contract: null,
      specs: [
        ...SYNTH_SPECS,
        { domain: 'main', slug: 'home', screenId: 'MAIN-001', route: '/home' },
      ],
    },
    (docsDir) => {
      const all = analyzeVisualContractBootstrap({ docsDir });
      assert.deepEqual(all.families.map((f) => f.family), ['auth', 'main']);
      const r = analyzeVisualContractBootstrap({ docsDir, domain: 'auth' });
      assert.deepEqual(r.families.map((f) => f.family), ['auth']);
      assert.equal(r.summary.screens, 2);
    },
  );
});

test('--screen 필터 — 해당 canonical screen id 만 본다', () => {
  withTree({ contract: null, specs: SYNTH_SPECS }, (docsDir) => {
    const r = analyzeVisualContractBootstrap({ docsDir, screens: ['AUTH-002'] });
    assert.equal(r.summary.screens, 1);
    assert.deepEqual(r.families[0].member_screens, ['AUTH-002']);
  });
});

// --- figma coverage ------------------------------------------------------------------

test('figma mapping 일부 누락 → coverage present/missing/status 로 보고', () => {
  withTree({ contract: null, specs: SYNTH_SPECS }, (docsDir) => {
    const r = analyzeVisualContractBootstrap({ docsDir });
    const cov = r.families[0].figma_mapping_coverage;
    assert.deepEqual(cov.present, ['AUTH-001']);
    assert.deepEqual(cov.missing, ['AUTH-002']);
    assert.deepEqual(cov.status, { 'AUTH-001': 'draft', 'AUTH-002': null });
  });
});

// --- 결정성 + 골든 픽스처 ---------------------------------------------------------------

test('골든 픽스처(auth-family) — 기대 후보 + 반복 실행 결정성', () => {
  const r1 = analyzeVisualContractBootstrap({ docsDir: FIXTURE_DOCS, srcDir: FIXTURE_SRC });
  const r2 = analyzeVisualContractBootstrap({ docsDir: FIXTURE_DOCS, srcDir: FIXTURE_SRC });
  assert.deepEqual(r1, r2); // 결정적 (정렬 고정·타임스탬프 없음)
  assert.equal(r1.ok, true);
  assert.equal(r1.summary.screens, 3);
  assert.equal(r1.summary.candidate_families, 1);
  assert.equal(r1.summary.suggested_contract_rows, 2); // family(AUTH-003 addition) + Button
  assert.equal(r1.summary.component_gap_candidates, 1);
  const f = r1.families[0];
  assert.equal(f.family, 'auth');
  assert.equal(f.confidence, 'high');
  assert.deepEqual(f.member_screens, ['AUTH-001', 'AUTH-002', 'AUTH-003']);
  assert.deepEqual(f.evidence, [
    'same domain auth',
    'same screen_id prefix AUTH',
    'shared feature directory src/features/auth (3/3 screens)',
    'repeated AuthShell import (2/3 screens)',
    'repeated Button import (3/3 screens)',
  ]);
  assert.deepEqual(f.suggested_contract, {
    layout_shell_owner: 'AuthShell',
    logo_policy: 'shell-owned candidate',
    header_policy: 'shell-owned candidate',
    cta_policy: 'shared-bottom-cta candidate',
    copy_source: 'Copy Keys/i18n candidate',
    status: 'draft',
  });
  assert.deepEqual(f.figma_mapping_coverage.missing, ['AUTH-002', 'AUTH-003']);
  assert.deepEqual(allFindingRules(r1), [
    'warning:existing-contract-not-overwritten',
    'info:adhoc-positioning-observed',
    'info:direct-screen-import-observed',
    'info:hardcoded-copy-candidate',
  ]);
});

test('markdown draft — 결정적이고 Suggested Contract Rows 만 canonical 헤더를 쓴다', () => {
  const r = analyzeVisualContractBootstrap({ docsDir: FIXTURE_DOCS, srcDir: FIXTURE_SRC });
  const md1 = renderBootstrapMarkdown(r);
  const md2 = renderBootstrapMarkdown(
    analyzeVisualContractBootstrap({ docsDir: FIXTURE_DOCS, srcDir: FIXTURE_SRC }),
  );
  assert.equal(md1, md2); // byte-identical
  assert.match(md1, /status: draft/);
  assert.match(md1, /REVIEW-ONLY DRAFT/);
  assert.doesNotMatch(md1, /generated_at/); // 타임스탬프 없음
  // visual-consistency 파서가 Suggested Contract Rows 의 표를 계약 표로 집는다
  // (canonical 경로 scaffold 시에도 checker 와 호환) — 후보 값/status draft 그대로.
  const parsed = parseVisualContract(md1);
  assert.equal(parsed.hasFamilyTable, true);
  assert.deepEqual(parsed.families.map((x) => x.family), ['auth']);
  assert.deepEqual(parsed.families[0].screens, ['AUTH-003']); // addition 분만
  assert.equal(parsed.families[0].status, 'draft');
  assert.deepEqual(parsed.components.map((x) => x.component), ['Button']);
  assert.equal(parsed.components[0].direct_screen_import, 'needs-review'); // 확정값 발명 금지
});

test('suggested rows 없음 → placeholder data row 를 쓰지 않는다 (checker 가 가짜 row 를 읽지 않게)', () => {
  // 기존 contract 가 모든 멤버/컴포넌트를 이미 담고 있으면 suggested additions = 0.
  withTree(
    {
      contract:
        CONTRACT_HEADER +
        familiesTable([
          '| auth | AUTH-001, AUTH-002 | AuthShell | shell-owned | - | - | - | draft | - |',
        ]) +
        componentsTable([
          '| BrandLogo | AuthShell | auth | forbidden | shell | cataloged | - |',
          '| Button | - | auth | allowed | screen | cataloged | - |',
        ]),
      specs: SYNTH_SPECS,
      catalog: SIMPLE_CATALOG,
      src: SYNTH_SRC,
    },
    (docsDir, srcDir) => {
      const r = analyzeVisualContractBootstrap({ docsDir, srcDir });
      assert.equal(r.summary.suggested_contract_rows, 0);
      const md = renderBootstrapMarkdown(r);
      assert.match(md, /suggested family additions 없음/);
      assert.match(md, /suggested component additions 없음/);
      // parseVisualContract 가 '-' 를 실제 family/component 로 읽는 가짜 row 가 없어야 한다.
      const parsed = parseVisualContract(md);
      assert.equal(parsed.hasFamilyTable, true); // 헤더는 남아 checker 호환 유지
      assert.deepEqual(parsed.families, []);
      assert.deepEqual(parsed.components, []);
    },
  );
});

test('human 포맷 — summary 한 줄 + findings/family/skip 라인', () => {
  const r = analyzeVisualContractBootstrap({ docsDir: FIXTURE_DOCS, srcDir: FIXTURE_SRC });
  const lines = formatBootstrapHuman(r);
  assert.match(lines[0], /review-only: 3 screen\(s\), 1 candidate family\(ies\)/);
  assert.ok(lines.some((l) => l.includes('existing-contract-not-overwritten')));
  assert.ok(lines.some((l) => l.includes('family auth (high)')));
});

// --- CLI 종단 --------------------------------------------------------------------------

function runCliOn(args) {
  return spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8' });
}

test('CLI --json → exit 0 + 파싱 가능한 결정적 JSON (반복 실행 byte-identical)', () => {
  const args = ['--json', '--docs', FIXTURE_DOCS, '--src', FIXTURE_SRC];
  const a = runCliOn(args);
  const b = runCliOn(args);
  assert.equal(a.status, 0, a.stderr);
  assert.equal(a.stdout, b.stdout); // JSON 결정성 (종단)
  const obj = JSON.parse(a.stdout);
  assert.equal(obj.tool, 'visual-contract-bootstrap');
  assert.equal(obj.mode, 'review-only');
  assert.equal(obj.summary.suggested_contract_rows, 2);
});

test('CLI --format markdown → draft 를 stdout 으로 (결정적)', () => {
  const args = ['--format', 'markdown', '--docs', FIXTURE_DOCS, '--src', FIXTURE_SRC];
  const a = runCliOn(args);
  const b = runCliOn(args);
  assert.equal(a.status, 0, a.stderr);
  assert.equal(a.stdout, b.stdout);
  assert.match(a.stdout, /Bootstrap Draft \(review-only\)/);
});

test('CLI ScreenSpec 없음 → exit 0 + no screens discovered', () => {
  withTree({ contract: null, specs: [] }, (docsDir) => {
    const r = runCliOn(['--json', '--docs', docsDir]);
    assert.equal(r.status, 0, r.stderr);
    const obj = JSON.parse(r.stdout);
    assert.equal(obj.summary.screens, 0);
    assert.ok(obj.findings.some((f) => f.rule === 'no-screens-discovered'));
  });
});

test('CLI docs 부재 → exit 1 (구조 오류)', () => {
  const r = runCliOn(['--json', '--docs', path.join(os.tmpdir(), 'vcb-none-such-dir')]);
  assert.equal(r.status, 1);
});

test('CLI 기존 contract malformed → exit 1', () => {
  withTree({ contract: CONTRACT_HEADER + '표 없음\n', specs: SYNTH_SPECS }, (docsDir) => {
    const r = runCliOn(['--json', '--docs', docsDir]);
    assert.equal(r.status, 1);
  });
});

test('CLI 잘못된 --format → exit 1', () => {
  const r = runCliOn(['--format', 'yaml', '--docs', FIXTURE_DOCS]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /json\|markdown/);
});

test('CLI 미지원 mutating flag(--apply/--overwrite/--enforce) → 조용히 무시하지 않고 exit 1', () => {
  for (const flag of ['--apply', '--overwrite', '--enforce']) {
    const r = runCliOn(['--docs', FIXTURE_DOCS, flag]);
    assert.equal(r.status, 1, `${flag} should be rejected`);
    assert.match(r.stderr, /review-only draft/);
    assert.ok(r.stderr.includes(flag), r.stderr);
  }
});

test('CLI 알 수 없는 옵션 → unknown option 으로 exit 1', () => {
  const r = runCliOn(['--docs', FIXTURE_DOCS, '--frmat', 'json']);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /unknown option --frmat/);
});

test('CLI --out draft 경로 → markdown draft 파일 생성 (기본 markdown, exit 0)', () => {
  withTree(
    { contract: null, specs: SYNTH_SPECS, catalog: SIMPLE_CATALOG, src: SYNTH_SRC },
    (docsDir, srcDir, tmp) => {
      const outPath = path.join(tmp, 'temp', 'visual-contract-draft.md');
      const r = runCliOn(['--docs', docsDir, '--src', srcDir, '--out', outPath]);
      assert.equal(r.status, 0, r.stderr);
      const written = fs.readFileSync(outPath, 'utf8');
      assert.match(written, /REVIEW-ONLY DRAFT/);
      assert.match(written, /status: draft/);
      assert.match(r.stderr, /draft written:/);
    },
  );
});

test('CLI --out 이 기존 canonical contract → 거부 + draft 경로 제안 + 파일 불변 (exit 1)', () => {
  withTree(
    {
      contract:
        CONTRACT_HEADER +
        familiesTable(['| auth | AUTH-001 | AuthShell | - | - | - | - | draft | - |']),
      specs: SYNTH_SPECS,
    },
    (docsDir) => {
      const contractFile = path.join(docsDir, 'design', 'visual-consistency-contract.md');
      const before = fs.readFileSync(contractFile, 'utf8');
      const r = runCliOn(['--docs', docsDir, '--out', contractFile]);
      assert.equal(r.status, 1);
      assert.match(r.stderr, /overwrite 거부/);
      assert.match(r.stderr, /visual-consistency-contract\.draft\.md/);
      assert.equal(fs.readFileSync(contractFile, 'utf8'), before); // 절대 불변
    },
  );
});

test('CLI --out 이 canonical 경로인데 파일 부재 → status: draft scaffold 만 허용', () => {
  withTree({ contract: null, specs: SYNTH_SPECS }, (docsDir) => {
    const contractFile = path.join(docsDir, 'design', 'visual-consistency-contract.md');
    const r = runCliOn(['--docs', docsDir, '--out', contractFile]);
    assert.equal(r.status, 0, r.stderr);
    const written = fs.readFileSync(contractFile, 'utf8');
    assert.match(written, /status: draft/);
    assert.match(written, /REVIEW-ONLY DRAFT/);
    // scaffold 된 draft 는 checker 와 호환 (Screen Families 표 존재)
    const parsed = parseVisualContract(written);
    assert.equal(parsed.hasFamilyTable, true);
  });
});

test('CLI --out canonical 경로 + json 포맷 → 거부 (scaffold 는 markdown draft 만)', () => {
  withTree({ contract: null, specs: SYNTH_SPECS }, (docsDir) => {
    const contractFile = path.join(docsDir, 'design', 'visual-consistency-contract.md');
    const r = runCliOn(['--json', '--docs', docsDir, '--out', contractFile]);
    assert.equal(r.status, 1);
    assert.equal(fs.existsSync(contractFile), false);
  });
});

test('CLI 구조 오류 시 --out 파일을 만들지 않는다', () => {
  withTree({ contract: CONTRACT_HEADER + '표 없음\n', specs: SYNTH_SPECS }, (docsDir, _s, tmp) => {
    const outPath = path.join(tmp, 'temp', 'draft.md');
    const r = runCliOn(['--docs', docsDir, '--out', outPath]);
    assert.equal(r.status, 1);
    assert.equal(fs.existsSync(outPath), false);
  });
});

// --- 휴리스틱 단위 ------------------------------------------------------------------------

test('classifyComponentKind — shell/logo/header/cta 이름 휴리스틱 (우선순위: shell 우선)', () => {
  assert.equal(classifyComponentKind('AuthShell'), 'shell');
  assert.equal(classifyComponentKind('OnboardingShell'), 'shell');
  assert.equal(classifyComponentKind('ScreenLayout'), 'shell');
  assert.equal(classifyComponentKind('PageShell'), 'shell');
  assert.equal(classifyComponentKind('HeaderLayout'), 'shell'); // 복합 이름은 shell 우선
  assert.equal(classifyComponentKind('AppHeader'), 'header');
  assert.equal(classifyComponentKind('Header'), 'header');
  assert.equal(classifyComponentKind('BrandLogo'), 'logo');
  assert.equal(classifyComponentKind('Logo'), 'logo');
  assert.equal(classifyComponentKind('PrimaryCTA'), 'cta');
  assert.equal(classifyComponentKind('BottomCTA'), 'cta');
  assert.equal(classifyComponentKind('CTA'), 'cta');
  assert.equal(classifyComponentKind('Button'), 'cta');
  assert.equal(classifyComponentKind('useLoginQuery'), null);
});

test('extractImportBindings — default/named/namespace/여러 줄, type-only 제외, 중복 제거', () => {
  const src = [
    `import { AuthShell } from './AuthShell';`,
    `import BrandLogo from '../ui/BrandLogo';`,
    `import * as icons from './icons';`,
    `import {`,
    `  Button,`,
    `  Card as UiCard,`,
    `} from '../ui';`,
    `import type { Props } from './types';`,
    `import { type Other, Header } from './Header';`,
  ].join('\n');
  const names = extractImportBindings(src).map((b) => b.name);
  assert.deepEqual(names, ['AuthShell', 'BrandLogo', 'icons', 'Button', 'UiCard', 'Header']);
});
