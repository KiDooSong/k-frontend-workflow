// visual-consistency.test.mjs — cross-screen visual consistency 검사 lib/CLI 단위 테스트.
//
// 실행:
//   node --test scripts/lib/visual-consistency.test.mjs
//
// 범위: analyzeVisualConsistency(계약 파싱 + 검사 7종 + fail-soft skip + 필터) + format +
//   CLI 종단(warning-first exit 0 / --enforce / malformed exit 1 / --json / --out) +
//   커밋 골든 픽스처(examples/visual-reconciliation/auth-family) 결정성.
//   합성 입력은 임시 디렉토리 관례(route-cross-check.test.mjs 미러; 커밋 트리 불변).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  analyzeVisualConsistency,
  parseVisualContract,
  findsDirectImport,
  findsAdhocPositioning,
  findHardcodedCopyCandidates,
  formatVisualConsistencyHuman,
} from './visual-consistency.mjs';
import { KIT_ROOT } from './util.mjs';

const CLI = path.join(KIT_ROOT, 'scripts', 'visual-consistency.mjs');
const FIXTURE = path.join(KIT_ROOT, 'examples', 'visual-reconciliation', 'auth-family');

// --- 합성 트리 헬퍼 ----------------------------------------------------------

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

function exceptionsTable(rows) {
  return [
    '## Visual Exceptions',
    '',
    '| Screen ID | Exception | Reason | Decision ID | Status |',
    '|---|---|---|---|---|',
    ...rows,
    '',
  ].join('\n');
}

// spec: { domain, slug, screenId, route?, entry?, copyKeys?, mapping? (status string) }
function specMd(s) {
  const entryLine = s.entry ? `screen_entry: "${s.entry}"\n` : '';
  const copy = s.copyKeys
    ? `\n## Copy Keys\n| Key | 문구 | Status |\n|---|---|---|\n${s.copyKeys
        .map((r) => `| ${r.key} | ${r.copy} | ${r.status} |`)
        .join('\n')}\n`
    : '';
  return `---\nartifact_id: "${s.screenId}-screen-spec"\nartifact_type: screen-spec\ndomain: "${s.domain}"\nscreen_id: "${s.screenId}"\nroute: "${s.route || '/x'}"\n${entryLine}status: draft\n---\n\n# ScreenSpec\n\n## Purpose\n샘플\n${copy}`;
}

// makeTree: 임시 프로젝트 루트를 세운다. 반환 { tmp, docsDir, srcDir }.
//   contract: string|null — design/visual-consistency-contract.md 본문 (null 이면 안 만듦)
//   specs: spec[] · catalog: string|null · gap: string|null · src: {relPath: content}
function makeTree({ contract, specs = [], catalog = null, gap = null, src = null }) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vcx-'));
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
  if (gap != null) {
    const globalDir = path.join(docsDir, 'global');
    fs.mkdirSync(globalDir, { recursive: true });
    fs.writeFileSync(path.join(globalDir, 'component-gap-register.md'), gap, 'utf8');
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
    return fn(docsDir, srcDir);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

const SIMPLE_CATALOG = `# GENERATED FILE — DO NOT EDIT

## Components

| Name | Source Path | Export Kind | Status |
| --- | --- | --- | --- |
| BrandLogo | src/components/ui/BrandLogo.tsx | named | ok |
`;

function rulesOf(report) {
  return report.findings.map((f) => `${f.severity}:${f.rule}`);
}

// --- contract 파서 -----------------------------------------------------------

test('parseVisualContract — 표 3종을 헤더 시그니처로 파싱, placeholder 행 무시', () => {
  const raw =
    CONTRACT_HEADER +
    familiesTable([
      '| auth | AUTH-001, AUTH-002 | AuthShell | shell-owned | shell-owned | cta | Copy Keys | draft | IN-1 |',
      '| {family} | {SCREEN-001} | {Shell} | - | - | - | - | draft | - |',
    ]) +
    componentsTable(['| BrandLogo | AuthShell | auth | forbidden | shell | cataloged | - |']) +
    exceptionsTable(['| AUTH-009 | custom logo | hero | D-9 | draft |']);
  const c = parseVisualContract(raw);
  assert.equal(c.parseError, null);
  assert.equal(c.hasFamilyTable, true);
  assert.deepEqual(c.families.map((f) => f.family), ['auth']); // placeholder 행 제외
  assert.deepEqual(c.families[0].screens, ['AUTH-001', 'AUTH-002']);
  assert.equal(c.families[0].shell_owner, 'AuthShell');
  assert.equal(c.components[0].direct_screen_import, 'forbidden');
  assert.equal(c.exceptions[0].decision_id, 'D-9');
});

// --- fail-soft / 구조 오류 -----------------------------------------------------

test('contract 부재 → 조용히 skip (크래시·경고 없음, ok=true)', () => {
  withTree({ contract: null, specs: [] }, (docsDir) => {
    const r = analyzeVisualConsistency({ docsDir });
    assert.equal(r.skipped, true);
    assert.equal(r.contract_found, false);
    assert.match(r.skip_reason, /visual-consistency-contract 없음/);
    assert.equal(r.ok, true);
    assert.equal(r.summary.warnings, 0);
    const human = formatVisualConsistencyHuman(r);
    assert.equal(human.length, 1);
    assert.match(human[0], /skip \(warning-first\)/);
  });
});

test('docs 경로 부재 → error (구조 오류만 exit 1 계열)', () => {
  const r = analyzeVisualConsistency({ docsDir: path.join(os.tmpdir(), 'vcx-none-such-dir') });
  assert.equal(r.ok, false);
  assert.deepEqual(rulesOf(r), ['error:docs-not-found']);
});

test('contract 존재하는데 Screen Families 표 부재 → contract-malformed error', () => {
  withTree({ contract: CONTRACT_HEADER + '본문에 표 없음\n' }, (docsDir) => {
    const r = analyzeVisualConsistency({ docsDir });
    assert.equal(r.ok, false);
    assert.deepEqual(rulesOf(r), ['error:contract-malformed']);
  });
});

test('contract frontmatter YAML 파싱 실패 → contract-malformed error', () => {
  withTree(
    { contract: '---\nartifact_id: [broken\n---\n' + familiesTable(['| a | A-1 | S | - | - | - | - | draft | - |']) },
    (docsDir) => {
      const r = analyzeVisualConsistency({ docsDir });
      assert.equal(r.ok, false);
      assert.ok(rulesOf(r).includes('error:contract-malformed'));
    },
  );
});

// --- 검사 2·3: screen refs + figma mapping coverage ---------------------------

test('contract member 인데 ScreenSpec 없음 → screen-not-found warning', () => {
  withTree(
    {
      contract:
        CONTRACT_HEADER +
        familiesTable(['| auth | AUTH-001, AUTH-404 | AuthShell | - | - | - | - | draft | - |']),
      specs: [{ domain: 'auth', slug: 'login', screenId: 'AUTH-001', mapping: 'draft' }],
    },
    (docsDir) => {
      const r = analyzeVisualConsistency({ docsDir });
      const missing = r.findings.filter((f) => f.rule === 'screen-not-found');
      assert.equal(missing.length, 1);
      assert.equal(missing[0].screen_id, 'AUTH-404');
      assert.equal(missing[0].severity, 'warning');
      assert.deepEqual(r.families[0].missing_screen_specs, ['AUTH-404']);
    },
  );
});

test('family 중 일부만 figma mapping 누락 → figma-mapping-missing warning + status lifecycle 보고', () => {
  withTree(
    {
      contract:
        CONTRACT_HEADER +
        familiesTable(['| auth | AUTH-001, AUTH-002 | AuthShell | - | - | - | - | draft | - |']),
      specs: [
        { domain: 'auth', slug: 'login', screenId: 'AUTH-001', mapping: 'review' },
        { domain: 'auth', slug: 'signup', screenId: 'AUTH-002' }, // mapping 없음
      ],
    },
    (docsDir) => {
      const r = analyzeVisualConsistency({ docsDir });
      const w = r.findings.filter((f) => f.rule === 'figma-mapping-missing');
      assert.deepEqual(w.map((f) => f.screen_id), ['AUTH-002']);
      assert.deepEqual(r.families[0].figma_mapping_status, {
        'AUTH-001': 'review',
        'AUTH-002': null,
      });
      // ScreenSpec 이 없는 멤버는 mapping 검사 대상이 아니다(이중 카운트 방지) — 여기선 전원 존재.
      assert.equal(r.summary.warnings, 1);
    },
  );
});

// --- 검사 4: component catalog cross-check ------------------------------------

test('shared component 가 catalog 에 없음 → component-gap-candidate (기존 G-xxx 제안 병기)', () => {
  withTree(
    {
      contract:
        CONTRACT_HEADER +
        familiesTable(['| auth | AUTH-001 | AuthShell | - | - | - | - | draft | - |']) +
        componentsTable([
          '| BrandLogo | AuthShell | auth | forbidden | shell | cataloged | - |',
          '| MarketingBanner | AuthShell | auth | forbidden | shell | missing | - |',
        ]),
      specs: [{ domain: 'auth', slug: 'login', screenId: 'AUTH-001', mapping: 'draft' }],
      catalog: SIMPLE_CATALOG,
      gap: `---\nartifact_id: component-gap-register\nartifact_type: component-gap-register\nstatus: draft\n---\n\n| ID | 제안 컴포넌트 | 필요한 화면 | 기존 카탈로그로 안 되는 이유 | Status |\n|---|---|---|---|---|\n| G-007 | MarketingBanner | AUTH-001 | 없음 | open |\n`,
    },
    (docsDir) => {
      const r = analyzeVisualConsistency({ docsDir });
      const gaps = r.findings.filter((f) => f.rule === 'component-gap-candidate');
      assert.deepEqual(gaps.map((f) => f.component), ['MarketingBanner']); // BrandLogo 는 catalog 에 있음
      assert.match(gaps[0].message, /G-007/);
      assert.equal(gaps[0].severity, 'warning');
    },
  );
});

test('Barrel Re-export Candidates 의 Name + Source Path 행은 component-gap-candidate 오탐을 막음', () => {
  const catalogWithBarrelCandidate = `${SIMPLE_CATALOG}
## Barrel Re-export Candidates

| Name | Source Path | Export Kind | Status | Reason |
| --- | --- | --- | --- | --- |
| MarketingBanner | src/design-system/components/marketing-banner.tsx | named | candidate | wrapped_memo |
`;
  withTree(
    {
      contract:
        CONTRACT_HEADER +
        familiesTable(['| auth | AUTH-001 | AuthShell | - | - | - | - | draft | - |']) +
        componentsTable([
          '| MarketingBanner | AuthShell | auth | forbidden | shell | missing | - |',
        ]),
      specs: [{ domain: 'auth', slug: 'login', screenId: 'AUTH-001', mapping: 'draft' }],
      catalog: catalogWithBarrelCandidate,
    },
    (docsDir) => {
      const r = analyzeVisualConsistency({ docsDir });
      assert.deepEqual(
        r.findings.filter((f) => f.rule === 'component-gap-candidate'),
        [],
      );
      assert.ok(!r.findings.some((f) => f.component === 'MarketingBanner'));
    },
  );
});

test('catalog 에 없는 component + Catalog Status 빈 값/missing → 기존대로 component-gap-candidate warning', () => {
  withTree(
    {
      contract:
        CONTRACT_HEADER +
        familiesTable(['| auth | AUTH-001 | AuthShell | - | - | - | - | draft | - |']) +
        componentsTable([
          '| GhostA | AuthShell | auth | forbidden | shell | - | - |', // Catalog Status 미기재
          '| GhostB | AuthShell | auth | forbidden | shell | missing | - |',
        ]),
      specs: [{ domain: 'auth', slug: 'login', screenId: 'AUTH-001', mapping: 'draft' }],
      catalog: SIMPLE_CATALOG,
    },
    (docsDir) => {
      const r = analyzeVisualConsistency({ docsDir });
      const gaps = r.findings.filter((f) => f.rule === 'component-gap-candidate');
      assert.deepEqual(gaps.map((f) => f.component), ['GhostA', 'GhostB']);
      for (const f of gaps) assert.equal(f.severity, 'warning');
      assert.deepEqual(r.findings.filter((f) => f.rule === 'component-catalog-out-of-scope'), []);
    },
  );
});

test('catalog 에 없는 component + Catalog Status domain/out-of-scope → warning 대신 info (silent pass 아님)', () => {
  withTree(
    {
      contract:
        CONTRACT_HEADER +
        familiesTable(['| auth | AUTH-001 | AuthFormScreen | - | - | - | - | draft | - |']) +
        componentsTable([
          '| AuthFormScreen | family | auth | forbidden | shell | domain | - |',
          '| BottomCtaBar | family | auth | forbidden | shell | out-of-scope | - |',
          '| BrandLogo | AuthShell | auth | forbidden | shell | cataloged | - |', // catalog 에 있음 — 정상
        ]),
      specs: [{ domain: 'auth', slug: 'login', screenId: 'AUTH-001', mapping: 'draft' }],
      catalog: SIMPLE_CATALOG,
    },
    (docsDir) => {
      const r = analyzeVisualConsistency({ docsDir });
      // 명시 선언 행은 warning 을 내지 않는다 (#153 ③ — 영구 warning 방지)
      assert.deepEqual(r.findings.filter((f) => f.rule === 'component-gap-candidate'), []);
      assert.equal(r.summary.warnings, 0);
      // 대신 silent pass 가 아니라 info 로 남는다
      const infos = r.findings.filter((f) => f.rule === 'component-catalog-out-of-scope');
      assert.deepEqual(
        infos.map((f) => f.component),
        ['AuthFormScreen', 'BottomCtaBar'],
      );
      for (const f of infos) {
        assert.equal(f.severity, 'info');
        assert.match(f.message, /명시 선언/);
      }
      // cataloged 행(BrandLogo)은 finding 자체가 없다
      assert.ok(!r.findings.some((f) => f.component === 'BrandLogo'));
      // parseVisualContract 가 catalog_status 를 normalized 로 보존한다
      const parsed = parseVisualContract(
        fs.readFileSync(path.join(docsDir, 'design', 'visual-consistency-contract.md'), 'utf8'),
      );
      assert.deepEqual(
        parsed.components.map((c) => c.catalog_status),
        ['domain', 'out-of-scope', 'cataloged'],
      );
    },
  );
});

test('component-catalog 부재 → catalog 검사 skip (skipped_checks 로 보고, 경고 아님)', () => {
  withTree(
    {
      contract:
        CONTRACT_HEADER +
        familiesTable(['| auth | AUTH-001 | AuthShell | - | - | - | - | draft | - |']) +
        componentsTable(['| Ghost | AuthShell | auth | forbidden | shell | missing | - |']),
      specs: [{ domain: 'auth', slug: 'login', screenId: 'AUTH-001', mapping: 'draft' }],
      catalog: null,
    },
    (docsDir) => {
      const r = analyzeVisualConsistency({ docsDir });
      assert.deepEqual(r.findings.filter((f) => f.rule === 'component-gap-candidate'), []);
      assert.ok(r.skipped_checks.some((s) => s.rule === 'component-gap-candidate'));
    },
  );
});

// --- 검사 5·6: 소스 휴리스틱 ----------------------------------------------------

const FORBIDDEN_CONTRACT =
  CONTRACT_HEADER +
  familiesTable(['| auth | AUTH-001 | AuthShell | shell-owned | - | - | - | draft | - |']) +
  componentsTable(['| BrandLogo | AuthShell | auth | forbidden | shell | cataloged | - |']);

test('forbidden direct import + ad-hoc positioning → warning 2건 (src+screen_entry 있을 때)', () => {
  withTree(
    {
      contract: FORBIDDEN_CONTRACT,
      specs: [
        {
          domain: 'auth',
          slug: 'login',
          screenId: 'AUTH-001',
          entry: 'src/features/auth/LoginScreen.tsx',
          mapping: 'draft',
        },
      ],
      catalog: SIMPLE_CATALOG,
      src: {
        'src/features/auth/LoginScreen.tsx': `import { BrandLogo } from '../../components/ui/BrandLogo';\nexport function LoginScreen() {\n  return <BrandLogo className="mt-12 absolute" />;\n}\n`,
      },
    },
    (docsDir, srcDir) => {
      const r = analyzeVisualConsistency({ docsDir, srcDir });
      const rules = r.findings.map((f) => f.rule);
      assert.ok(rules.includes('direct-screen-import'), rules.join(','));
      assert.ok(rules.includes('adhoc-positioning'), rules.join(','));
      const di = r.findings.find((f) => f.rule === 'direct-screen-import');
      assert.equal(di.severity, 'warning');
      assert.equal(di.component, 'BrandLogo');
      assert.equal(di.file, 'src/features/auth/LoginScreen.tsx'); // 프로젝트 루트 상대 posix
    },
  );
});

test('명시된 --src 가 디렉토리가 아님 → source-not-found warning (조용한 통과 방지)', () => {
  withTree(
    {
      contract: FORBIDDEN_CONTRACT,
      specs: [
        {
          domain: 'auth',
          slug: 'login',
          screenId: 'AUTH-001',
          entry: 'src/features/auth/LoginScreen.tsx',
          mapping: 'draft',
        },
      ],
      catalog: SIMPLE_CATALOG,
      src: {
        'src/features/auth/LoginScreen.tsx': `import { BrandLogo } from '../../components/ui/BrandLogo';\n`,
      },
    },
    (docsDir, srcDir) => {
      const wrongSrc = path.join(srcDir, 'no-such-subdir'); // 오타 시뮬레이션
      const r = analyzeVisualConsistency({ docsDir, srcDir: wrongSrc });
      const nf = r.findings.filter((f) => f.rule === 'source-not-found');
      assert.equal(nf.length, 1);
      assert.equal(nf[0].severity, 'warning'); // 통과처럼 보이지 않게 warning 으로 표면화
      // 소스 검사 자체는 skip — 실제로 검사 못 한 direct-import finding 을 내지 않는다
      assert.deepEqual(r.findings.filter((f) => f.rule === 'direct-screen-import'), []);
      assert.ok(r.skipped_checks.some((s) => s.rule === 'direct-screen-import'));
      assert.equal(r.ok, true); // warning-first — error 아님
    },
  );
});

test('공백 포함 family 이름 — Applies To Families 는 콤마로만 분해 (필터에서 rule 유실 방지)', () => {
  withTree(
    {
      contract:
        CONTRACT_HEADER +
        familiesTable(['| Auth Flow | AUTH-001 | AuthShell | - | - | - | - | draft | - |']) +
        componentsTable(['| MarketingBanner | AuthShell | Auth Flow | forbidden | shell | missing | - |']),
      specs: [{ domain: 'auth', slug: 'login', screenId: 'AUTH-001', mapping: 'draft' }],
      catalog: SIMPLE_CATALOG,
    },
    (docsDir) => {
      // --screen 필터: selectedFamilyNames = {'Auth Flow'} 와 exact match 해야 rule 이 살아남는다.
      const r = analyzeVisualConsistency({ docsDir, screen: 'AUTH-001' });
      const gaps = r.findings.filter((f) => f.rule === 'component-gap-candidate');
      assert.deepEqual(gaps.map((f) => f.component), ['MarketingBanner']);
    },
  );
});

test('src 미지정 → 소스 검사 skip (skipped_checks 보고, finding 없음)', () => {
  withTree(
    {
      contract: FORBIDDEN_CONTRACT,
      specs: [
        {
          domain: 'auth',
          slug: 'login',
          screenId: 'AUTH-001',
          entry: 'src/features/auth/LoginScreen.tsx',
          mapping: 'draft',
        },
      ],
      catalog: SIMPLE_CATALOG,
      src: {
        'src/features/auth/LoginScreen.tsx': `import { BrandLogo } from '../../components/ui/BrandLogo';\n`,
      },
    },
    (docsDir) => {
      const r = analyzeVisualConsistency({ docsDir }); // srcDir 없음
      assert.deepEqual(r.findings.filter((f) => f.rule === 'direct-screen-import'), []);
      assert.ok(r.skipped_checks.some((s) => s.rule === 'direct-screen-import'));
    },
  );
});

test('screen_entry 없는 화면은 소스 검사 대상이 아니다 (조용히 skip)', () => {
  withTree(
    {
      contract: FORBIDDEN_CONTRACT,
      specs: [{ domain: 'auth', slug: 'login', screenId: 'AUTH-001', mapping: 'draft' }],
      catalog: SIMPLE_CATALOG,
      src: { 'src/unused.tsx': `import { BrandLogo } from './x';\n` },
    },
    (docsDir, srcDir) => {
      const r = analyzeVisualConsistency({ docsDir, srcDir });
      assert.deepEqual(r.findings.filter((f) => f.rule === 'direct-screen-import'), []);
    },
  );
});

test('기록된 예외(Reason+Decision ID, 컴포넌트 지목) → direct-import finding 이 info 로 강등', () => {
  withTree(
    {
      contract:
        FORBIDDEN_CONTRACT +
        exceptionsTable(['| AUTH-001 | BrandLogo custom placement | marketing hero | D-100 | draft |']),
      specs: [
        {
          domain: 'auth',
          slug: 'login',
          screenId: 'AUTH-001',
          entry: 'src/features/auth/LoginScreen.tsx',
          mapping: 'draft',
        },
      ],
      catalog: SIMPLE_CATALOG,
      src: {
        'src/features/auth/LoginScreen.tsx': `import { BrandLogo } from '../../components/ui/BrandLogo';\nexport const S = () => <BrandLogo />;\n`,
      },
    },
    (docsDir, srcDir) => {
      const r = analyzeVisualConsistency({ docsDir, srcDir });
      const di = r.findings.find((f) => f.rule === 'direct-screen-import');
      assert.equal(di.severity, 'info');
      assert.match(di.message, /recorded exception: D-100/);
      assert.equal(r.summary.warnings, 0); // info 는 warning 으로 세지 않는다
    },
  );
});

// --- 검사 7: exception hygiene -------------------------------------------------

test('Visual Exceptions 행에 Reason/Decision ID 누락 → exception-hygiene warning', () => {
  withTree(
    {
      contract:
        CONTRACT_HEADER +
        familiesTable(['| auth | AUTH-001 | AuthShell | - | - | - | - | draft | - |']) +
        exceptionsTable([
          '| AUTH-001 | custom CTA | - | - | draft |',
          '| AUTH-001 | custom hero | 근거 있음 | D-2 | draft |',
        ]),
      specs: [{ domain: 'auth', slug: 'login', screenId: 'AUTH-001', mapping: 'draft' }],
    },
    (docsDir) => {
      const r = analyzeVisualConsistency({ docsDir });
      const hy = r.findings.filter((f) => f.rule === 'exception-hygiene');
      assert.equal(hy.length, 1); // 유효 행(D-2)은 경고 아님
      assert.match(hy[0].message, /Reason · Decision ID/);
    },
  );
});

// --- 검사 8: copy drift advisory ------------------------------------------------

test('Copy Keys 있는 화면의 hardcoded JSX 텍스트 → hardcoded-copy-candidate info', () => {
  withTree(
    {
      contract: FORBIDDEN_CONTRACT,
      specs: [
        {
          domain: 'auth',
          slug: 'login',
          screenId: 'AUTH-001',
          entry: 'src/features/auth/LoginScreen.tsx',
          mapping: 'draft',
          copyKeys: [{ key: 'auth.login.title', copy: '로그인', status: 'draft' }],
        },
      ],
      catalog: SIMPLE_CATALOG,
      src: {
        'src/features/auth/LoginScreen.tsx': `export function LoginScreen() {\n  return (\n    <div>\n      <h1>로그인</h1>\n      <p>{t('auth.login.subtitle')}</p>\n      <span>42</span>\n    </div>\n  );\n}\n`,
      },
    },
    (docsDir, srcDir) => {
      const r = analyzeVisualConsistency({ docsDir, srcDir });
      const copies = r.findings.filter((f) => f.rule === 'hardcoded-copy-candidate');
      assert.equal(copies.length, 1); // 표현식({t(...)})과 글자 없는 노드(42)는 제외
      assert.equal(copies[0].severity, 'info');
      assert.match(copies[0].message, /로그인/);
    },
  );
});

// --- 필터 ---------------------------------------------------------------------

test('--screen 필터 — 해당 screen 의 finding 만 남는다', () => {
  withTree(
    {
      contract:
        CONTRACT_HEADER +
        familiesTable([
          '| auth | AUTH-001, AUTH-404 | AuthShell | - | - | - | - | draft | - |',
          '| main | MAIN-001, MAIN-404 | MainShell | - | - | - | - | draft | - |',
        ]),
      specs: [
        { domain: 'auth', slug: 'login', screenId: 'AUTH-001', mapping: 'draft' },
        { domain: 'main', slug: 'home', screenId: 'MAIN-001', mapping: 'draft' },
      ],
    },
    (docsDir) => {
      const r = analyzeVisualConsistency({ docsDir, screen: 'AUTH-404' });
      assert.deepEqual(r.families.map((f) => f.family), ['auth']);
      assert.deepEqual(rulesOf(r), ['warning:screen-not-found']);
      assert.equal(r.findings[0].screen_id, 'AUTH-404');
    },
  );
});

test('--screen 콤마 목록 필터 — 목록 밖 family/finding 은 제외한다 (bootstrap --screen 동형)', () => {
  withTree(
    {
      contract:
        CONTRACT_HEADER +
        familiesTable([
          '| auth | AUTH-001, AUTH-404 | AuthShell | - | - | - | - | draft | - |',
          '| main | MAIN-001, MAIN-404 | MainShell | - | - | - | - | draft | - |',
        ]),
      specs: [
        { domain: 'auth', slug: 'login', screenId: 'AUTH-001', mapping: 'draft' },
        { domain: 'main', slug: 'home', screenId: 'MAIN-001', mapping: 'draft' },
      ],
    },
    (docsDir) => {
      // auth 목록만: unrelated main family 의 MAIN-404 screen-not-found 는 섞이지 않는다.
      const auth = analyzeVisualConsistency({ docsDir, screen: 'AUTH-001,AUTH-404' });
      assert.deepEqual(auth.families.map((f) => f.family), ['auth']);
      assert.deepEqual(rulesOf(auth), ['warning:screen-not-found']);
      assert.equal(auth.findings[0].screen_id, 'AUTH-404');

      // family 를 가로지르는 목록: 두 family 모두 대상이 되고 목록 밖 화면은 여전히 제외.
      const cross = analyzeVisualConsistency({ docsDir, screen: 'AUTH-404,MAIN-404' });
      assert.deepEqual(cross.families.map((f) => f.family), ['auth', 'main']);
      assert.deepEqual(rulesOf(cross), ['warning:screen-not-found', 'warning:screen-not-found']);
      assert.deepEqual(cross.findings.map((f) => f.screen_id).sort(), ['AUTH-404', 'MAIN-404']);
    },
  );
});

test('--domain 필터 — 해당 도메인 화면을 포함하는 family 만 본다', () => {
  withTree(
    {
      contract:
        CONTRACT_HEADER +
        familiesTable([
          '| auth | AUTH-001, AUTH-404 | AuthShell | - | - | - | - | draft | - |',
          '| main | MAIN-404 | MainShell | - | - | - | - | draft | - |',
        ]),
      specs: [{ domain: 'auth', slug: 'login', screenId: 'AUTH-001', mapping: 'draft' }],
    },
    (docsDir) => {
      const r = analyzeVisualConsistency({ docsDir, domain: 'auth' });
      assert.deepEqual(r.families.map((f) => f.family), ['auth']);
      assert.deepEqual(
        r.findings.map((f) => f.screen_id),
        ['AUTH-404'], // main family 의 MAIN-404 는 범위 밖
      );
    },
  );
});

// --- JSON 결정성 + 커밋 픽스처 ---------------------------------------------------

test('골든 픽스처(auth-family) — 기대 rule 집합 + 반복 실행 byte-identical', () => {
  const docsDir = path.join(FIXTURE, 'docs', 'frontend-workflow');
  const srcDir = path.join(FIXTURE, 'src');
  const r1 = analyzeVisualConsistency({ docsDir, srcDir });
  const r2 = analyzeVisualConsistency({ docsDir, srcDir });
  assert.deepEqual(r1, r2); // 결정적 (정렬 고정·타임스탬프 없음)
  assert.equal(r1.ok, true); // error 없음 — warning-first
  assert.equal(r1.summary.families, 1);
  assert.equal(r1.summary.screens, 3);
  assert.equal(r1.summary.errors, 0);
  assert.deepEqual(rulesOf(r1), [
    'warning:adhoc-positioning',
    'warning:component-gap-candidate',
    'warning:direct-screen-import',
    'warning:exception-hygiene',
    'warning:figma-mapping-missing',
    'warning:screen-not-found',
    'info:hardcoded-copy-candidate',
  ]);
  assert.equal(r1.summary.warnings, 6);
  assert.equal(r1.summary.infos, 1);
  // 경고 화면은 전부 AUTH-002 (AUTH-001 은 통과 케이스)
  for (const f of r1.findings) {
    if (['direct-screen-import', 'adhoc-positioning', 'hardcoded-copy-candidate'].includes(f.rule)) {
      assert.equal(f.screen_id, 'AUTH-002');
    }
  }
});

// --- CLI 종단 -------------------------------------------------------------------

function runCliOn(args) {
  return spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8' });
}

test('CLI --json → exit 0 + 파싱 가능한 JSON (warning-first 종단검증, 픽스처)', () => {
  const r = runCliOn([
    '--json',
    '--docs',
    path.join(FIXTURE, 'docs', 'frontend-workflow'),
    '--src',
    path.join(FIXTURE, 'src'),
  ]);
  assert.equal(r.status, 0, r.stderr); // warning 6건이어도 exit 0
  const obj = JSON.parse(r.stdout);
  assert.equal(obj.tool, 'visual-consistency');
  assert.equal(obj.mode, 'warning-first');
  assert.equal(obj.summary.warnings, 6);
  assert.equal(obj.contract_path, 'design/visual-consistency-contract.md'); // docs 상대 posix
});

test('CLI 기본(human) → exit 0, 경고는 stderr 로만 (stdout 비어있음)', () => {
  const r = runCliOn([
    '--docs',
    path.join(FIXTURE, 'docs', 'frontend-workflow'),
    '--src',
    path.join(FIXTURE, 'src'),
  ]);
  assert.equal(r.status, 0);
  assert.equal(r.stdout, '');
  assert.match(r.stderr, /direct-screen-import/);
  assert.match(r.stderr, /not a gate/);
});

test('CLI --enforce → warning 존재 시 exit 1 (opt-in 승격 — CI 배선은 범위 밖)', () => {
  const r = runCliOn([
    '--enforce',
    '--docs',
    path.join(FIXTURE, 'docs', 'frontend-workflow'),
    '--src',
    path.join(FIXTURE, 'src'),
  ]);
  assert.equal(r.status, 1);
});

test('CLI contract 부재 → exit 0 + skip JSON (cold start 를 막지 않는다)', () => {
  withTree({ contract: null }, (docsDir) => {
    const r = runCliOn(['--json', '--docs', docsDir]);
    assert.equal(r.status, 0);
    const obj = JSON.parse(r.stdout);
    assert.equal(obj.skipped, true);
    assert.equal(obj.ok, true);
  });
});

test('CLI malformed contract → exit 1 (구조 오류는 warning-first 예외)', () => {
  withTree({ contract: CONTRACT_HEADER + '표 없음\n' }, (docsDir) => {
    const r = runCliOn(['--json', '--docs', docsDir]);
    assert.equal(r.status, 1);
    const obj = JSON.parse(r.stdout);
    assert.equal(obj.ok, false);
    assert.equal(obj.summary.errors, 1);
  });
});

test('CLI --out → JSON payload 를 파일로도 남긴다 (stdout 페이로드와 동일)', () => {
  withTree({ contract: null }, (docsDir) => {
    const outPath = path.join(path.dirname(docsDir), 'report.json');
    const r = runCliOn(['--json', '--docs', docsDir, '--out', outPath]);
    assert.equal(r.status, 0);
    assert.equal(fs.readFileSync(outPath, 'utf8'), r.stdout);
  });
});

// --- 휴리스틱 단위 ---------------------------------------------------------------

test('findsDirectImport — named/default 바인딩 감지, 무관 import 미감지', () => {
  assert.equal(findsDirectImport(`import { BrandLogo } from './x';`, 'BrandLogo'), true);
  assert.equal(findsDirectImport(`import BrandLogo from './x';`, 'BrandLogo'), true);
  assert.equal(findsDirectImport(`import { Button } from './x';`, 'BrandLogo'), false);
  assert.equal(findsDirectImport(`// BrandLogo 언급만`, 'BrandLogo'), false);
});

test('findsAdhocPositioning — 사용부 근처 margin/absolute 만 감지', () => {
  assert.equal(findsAdhocPositioning(`<BrandLogo className="mt-12" />`, 'BrandLogo'), true);
  assert.equal(
    findsAdhocPositioning(`<BrandLogo\n  style={{ marginTop: 12 }}\n/>`, 'BrandLogo'),
    true,
  );
  assert.equal(findsAdhocPositioning(`<BrandLogo />`, 'BrandLogo'), false);
  // 다른 엘리먼트의 absolute 는 이 컴포넌트 finding 이 아니다
  assert.equal(
    findsAdhocPositioning(`<BrandLogo />\n<div className="absolute" />`, 'BrandLogo'),
    false,
  );
});

test('findHardcodedCopyCandidates — 표현식/숫자 제외, 정렬·중복 제거', () => {
  const out = findHardcodedCopyCandidates(
    `<div>\n<h1>로그인</h1>\n<p>{t('k')}</p>\n<span>42</span>\n<b>Login</b>\n<b>Login</b>\n</div>`,
  );
  assert.deepEqual(out, ['Login', '로그인']);
});
