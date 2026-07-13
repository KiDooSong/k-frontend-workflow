// catalog-gen.test.mjs — phase2-1 배럴 reconcile 진단 단위 테스트 (node:test, 무의존).
// 정상(일치) 케이스 무경고 + 양방향 불일치 경고 + 별칭/star/type/외부 무시 규칙을 고정한다.
// v1 의 build/render 4-필드 출력 자체는 test-fixtures.mjs 의 골든 비교가 별도로 강제한다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  buildCatalog,
  classifyComponentFile,
  classifyNamedExport,
  classifyDefaultExportCandidate,
  renderCatalog,
  parseBarrelReexports,
  analyzeBarrelReconcile,
  formatBarrelWarnings,
} from './catalog-gen.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const KIT_ROOT = path.resolve(HERE, '..', '..');
const CLI = path.join(KIT_ROOT, 'scripts', 'catalog-gen.mjs');
const FIXTURE_SRC = path.resolve(
  HERE,
  '..',
  '..',
  'examples',
  'component-catalog',
  'basic-ui',
  'src',
);
const FIXTURE_UI = path.join(FIXTURE_SRC, 'components', 'ui');

test('classifyComponentFile: lowercase and kebab filenames map to PascalCase named exports', (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'catalog-kebab-filenames-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const ui = path.join(tmp, 'src', 'components', 'ui');
  fs.mkdirSync(ui, { recursive: true });
  fs.writeFileSync(path.join(ui, 'button.tsx'), 'export const Button = () => null;\n');
  fs.writeFileSync(
    path.join(ui, 'primary-button.tsx'),
    'export function PrimaryButton() { return null; }\n',
  );
  fs.writeFileSync(path.join(ui, 'mismatch.tsx'), 'export const NotMismatch = () => null;\n');
  fs.writeFileSync(path.join(ui, 'index.ts'), 'export function Index() { return null; }\n');

  assert.deepEqual(
    classifyComponentFile(
      path.join(ui, 'button.tsx'),
      fs.readFileSync(path.join(ui, 'button.tsx'), 'utf8'),
    ),
    {
      name: 'Button',
      source_path: 'src/components/ui/button.tsx',
      export_kind: 'named',
      status: 'ok',
    },
  );

  const model = buildCatalog({ src: path.join(tmp, 'src'), projectRoot: tmp });
  assert.deepEqual(model.components, [
    {
      name: 'Button',
      source_path: 'src/components/ui/button.tsx',
      export_kind: 'named',
      status: 'ok',
    },
    {
      name: 'PrimaryButton',
      source_path: 'src/components/ui/primary-button.tsx',
      export_kind: 'named',
      status: 'ok',
    },
  ]);
  const text = renderCatalog(model);
  assert.match(text, /\| Button \| src\/components\/ui\/button\.tsx \| named \| ok \|/);
  assert.match(text, /\| PrimaryButton \| src\/components\/ui\/primary-button\.tsx \| named \| ok \|/);
  assert.equal(text.includes('mismatch.tsx'), false);
  assert.equal(text.includes('index.ts'), false);
});

test('classifyNamedExport: 블록 주석의 과거 function 대신 실제 memo const 를 candidate 로 판정', () => {
  const file = path.join(FIXTURE_UI, 'AiBottomSheet.tsx');
  const content = `/*
export function AiBottomSheet() {
  return null;
}
*/

export const AiBottomSheet = React.memo(() => null);
`;
  assert.deepEqual(classifyNamedExport(file, content, 'AiBottomSheet'), {
    name: 'AiBottomSheet',
    source_path: 'src/components/ui/AiBottomSheet.tsx',
    export_kind: 'named',
    status: 'candidate',
    reason: 'wrapped_memo',
  });
});

test('parseBarrelReexports: 상대 named re-export 의 PascalCase 이름만 수집', () => {
  const r = parseBarrelReexports(
    "// barrel\nexport { Button } from './Button';\nexport { Card, Stack } from './x';\n",
  );
  assert.deepEqual([...r.names].sort(), ['Button', 'Card', 'Stack']);
  assert.deepEqual(r.entries, [
    { name: 'Button', module_specifier: './Button' },
    { name: 'Card', module_specifier: './x' },
    { name: 'Stack', module_specifier: './x' },
  ]);
  assert.equal(r.unsupported, 0);
});

test('parseBarrelReexports: 별칭/star 는 unsupported 로만 카운트(이름 아님)', () => {
  const r = parseBarrelReexports(
    "export { Foo as Bar } from './Foo';\nexport * from './all';\nexport * as Ns from './ns';\n",
  );
  assert.deepEqual(r.names, []);
  assert.equal(r.unsupported, 3);
});

test('parseBarrelReexports: type-only·camelCase·외부패키지는 조용히 무시', () => {
  const r = parseBarrelReexports(
    "export type { ButtonProps } from './Button';\n" +
      "export { buttonVariants } from './Button';\n" +
      "export { QueryClient } from '@tanstack/react-query';\n",
  );
  assert.deepEqual(r.names, []);
  assert.equal(r.unsupported, 0);
});

test('parseBarrelReexports: export 선언(함수/const)은 re-export 로 오인하지 않음', () => {
  const r = parseBarrelReexports(
    'export function Button(props) { return null; }\nexport const Card = (p) => null;\n',
  );
  assert.deepEqual(r.names, []);
  assert.equal(r.unsupported, 0);
});

test('parseBarrelReexports: 여러 줄에 걸친 named re-export 도 수집', () => {
  const r = parseBarrelReexports("export {\n  Button,\n  Card,\n} from './ui';\n");
  assert.deepEqual([...r.names].sort(), ['Button', 'Card']);
  assert.equal(r.unsupported, 0);
});

// --- Codex 리뷰 MINOR 회귀 방지 ---------------------------------------------
test('parseBarrelReexports: 공백 없는 export{…} 도 매칭(Codex MINOR)', () => {
  const r = parseBarrelReexports("export{ Button }from'./Button';\nexport{Card}from'./Card';\n");
  assert.deepEqual([...r.names].sort(), ['Button', 'Card']);
  assert.equal(r.unsupported, 0);
});

test('parseBarrelReexports: 블록 주석 처리된 export 는 오인식하지 않음(Codex MINOR)', () => {
  const r = parseBarrelReexports(
    "/* export { Ghost } from './Ghost'; */\nexport { Button } from './Button';\n",
  );
  assert.deepEqual(r.names, ['Button']);
  assert.equal(r.unsupported, 0);
});

test('parseBarrelReexports: 절 안 인라인 블록 주석을 제거하고 이름 수집(Codex MINOR)', () => {
  const r = parseBarrelReexports("export { Button /* primary */, Card } from './ui';\n");
  assert.deepEqual([...r.names].sort(), ['Button', 'Card']);
  assert.equal(r.unsupported, 0);
});

test('formatBarrelWarnings: 일치/배럴부재 → 무경고(빈 배열)', () => {
  assert.deepEqual(
    formatBarrelWarnings({
      barrelFound: true,
      barrelPaths: ['src/components/ui/index.ts'],
      reexported: ['Button'],
      missingFromCatalog: [],
      missingFromBarrel: [],
      unsupported: 0,
    }),
    [],
  );
  assert.deepEqual(
    formatBarrelWarnings({ barrelFound: false, missingFromCatalog: [], missingFromBarrel: [] }),
    [],
  );
});

test('formatBarrelWarnings: 양방향 불일치 + unsupported caveat', () => {
  const lines = formatBarrelWarnings({
    barrelFound: true,
    barrelPaths: ['src/components/ui/index.ts'],
    reexported: ['Ghost'],
    missingFromCatalog: ['Ghost'],
    missingFromBarrel: ['Stack'],
    unsupported: 1,
  });
  const joined = lines.join('\n');
  assert.match(joined, /WARNING: barrel . catalog mismatch/);
  assert.match(joined, /but not in catalog: Ghost/);
  assert.match(joined, /not re-exported by barrel: Stack/);
  assert.match(joined, /unsupported re-export form/);
});

test('classifyDefaultExportCandidate: default function export 는 basename 기준 candidate 로 수집', () => {
  const modalFile = path.join(FIXTURE_UI, 'Modal.tsx');
  const candidate = classifyDefaultExportCandidate(modalFile, fs.readFileSync(modalFile, 'utf8'));
  assert.deepEqual(candidate, {
    name: 'Modal',
    source_path: 'src/components/ui/Modal.tsx',
    export_kind: 'default',
    status: 'candidate',
  });
});

test('classifyDefaultExportCandidate: generic default function export 도 candidate 로 수집', () => {
  const candidate = classifyDefaultExportCandidate(
    path.join(FIXTURE_UI, 'Select.tsx'),
    'export default function Select<T>(props: { value: T }) { return null; }\n',
  );
  assert.deepEqual(candidate, {
    name: 'Select',
    source_path: 'src/components/ui/Select.tsx',
    export_kind: 'default',
    status: 'candidate',
  });
});

test('build/render: default export 후보는 components 에 승격하지 않고 additive 섹션에만 출력', () => {
  const model = buildCatalog({ src: FIXTURE_SRC });
  assert.deepEqual(
    model.components.map((c) => c.name),
    ['Button', 'Card', 'Stack'],
  );
  assert.equal(model.components.some((c) => c.name === 'Modal'), false);
  assert.deepEqual(model.default_export_candidates, [
    {
      name: 'Modal',
      source_path: 'src/components/ui/Modal.tsx',
      export_kind: 'default',
      status: 'candidate',
    },
  ]);

  const text = renderCatalog(model);
  assert.match(
    text,
    /\| Button \| src\/components\/ui\/Button\.tsx \| named \| ok \|\n\| Card \| src\/components\/ui\/Card\.tsx \| named \| ok \|\n\| Stack \| src\/components\/ui\/Stack\.tsx \| named \| ok \|/,
  );
  assert.match(text, /## Default Export Candidates/);
  assert.match(text, /\| Modal \| src\/components\/ui\/Modal\.tsx \| default \| candidate \|/);
  assert.equal(text.includes('## Barrel Re-export Candidates'), false);
});

test('build/render: default export candidates 정렬과 두-run 결정성 고정', (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'catalog-default-export-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const ui = path.join(tmp, 'src', 'components', 'ui');
  fs.mkdirSync(ui, { recursive: true });
  fs.writeFileSync(path.join(ui, 'Zeta.tsx'), 'export default function Zeta() { return null; }\n');
  fs.writeFileSync(path.join(ui, 'Alpha.tsx'), 'export default function Renamed() { return null; }\n');

  const first = buildCatalog({ src: path.join(tmp, 'src') });
  const second = buildCatalog({ src: path.join(tmp, 'src') });
  assert.deepEqual(first, second);
  assert.deepEqual(
    first.default_export_candidates.map((c) => c.name),
    ['Alpha', 'Zeta'],
  );
  assert.equal(renderCatalog(first), renderCatalog(second));
});

test('build/render/CLI: role-named plain export 는 primary, wrapper 는 barrel candidate 로 같은 모델에 표면화', (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'catalog-barrel-evidence-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const ui = path.join(tmp, 'src', 'design-system', 'components');
  const write = (rel, content) => {
    const file = path.join(ui, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  };
  write('gnb-service/mobile.tsx', 'export function GnbServiceMobile() { return null; }\n');
  write('prompt-input/container.tsx', 'export const PromptInputContainer = () => null;\n');
  write('ai-action-sheet.tsx', 'export const AiActionSheet = memo(() => null);\n');
  write('ai-attach-sheet.tsx', 'export const AiAttachSheet = forwardRef(() => null);\n');
  write('ai-bottom-sheet.tsx', 'export const AiBottomSheet = React.memo(() => null);\n');
  write('button.tsx', 'export const Button = () => null;\n');
  write('default-only.tsx', 'export default function DefaultOnly() { return null; }\n');
  write(
    'index.ts',
    [
      "export { GnbServiceMobile } from './gnb-service/mobile';",
      "export { PromptInputContainer } from './prompt-input/container';",
      "export { AiActionSheet } from './ai-action-sheet';",
      "export { AiAttachSheet } from './ai-attach-sheet';",
      "export { AiBottomSheet } from './ai-bottom-sheet';",
      "export { Button } from './button';",
      '',
    ].join('\n'),
  );
  fs.writeFileSync(
    path.join(tmp, 'project-layout.yaml'),
    ['version: 1', 'preset: expo-feature', 'roles:', '  ui_primitive: src/design-system/components/**', ''].join(
      '\n',
    ),
  );
  const layout = {
    roleGlobs: (role) => (role === 'ui_primitive' ? ['src/design-system/components/**'] : []),
  };
  const args = { src: path.join(tmp, 'src'), projectRoot: tmp, layout };
  const first = buildCatalog(args);
  const second = buildCatalog(args);

  assert.deepEqual(first, second);
  assert.deepEqual(
    first.components.map((c) => c.name),
    ['Button', 'GnbServiceMobile', 'PromptInputContainer'],
  );
  assert.deepEqual(first.barrel_reexport_candidates, [
    {
      name: 'AiActionSheet',
      source_path: 'src/design-system/components/ai-action-sheet.tsx',
      export_kind: 'named',
      status: 'candidate',
      reason: 'wrapped_memo',
    },
    {
      name: 'AiAttachSheet',
      source_path: 'src/design-system/components/ai-attach-sheet.tsx',
      export_kind: 'named',
      status: 'candidate',
      reason: 'wrapped_forward_ref',
    },
    {
      name: 'AiBottomSheet',
      source_path: 'src/design-system/components/ai-bottom-sheet.tsx',
      export_kind: 'named',
      status: 'candidate',
      reason: 'wrapped_memo',
    },
  ]);
  assert.deepEqual(first.barrel_reconcile.surfacedCandidates, [
    'AiActionSheet',
    'AiAttachSheet',
    'AiBottomSheet',
  ]);
  assert.deepEqual(first.barrel_reconcile.missingFromBarrel, []);
  assert.deepEqual(first.barrel_reconcile.resolutionIssues, []);
  assert.equal(first.barrel_reexport_candidates.some((c) => c.name === 'Button'), false);

  const text = renderCatalog(first);
  assert.equal(text, renderCatalog(second));
  assert.ok(text.indexOf('## Default Export Candidates') < text.indexOf('## Barrel Re-export Candidates'));
  const [primaryText, candidateText] = text.split('## Barrel Re-export Candidates');
  assert.match(primaryText, /\| GnbServiceMobile \| src\/design-system\/components\/gnb-service\/mobile\.tsx \| named \| ok \|/);
  assert.match(primaryText, /\| PromptInputContainer \| src\/design-system\/components\/prompt-input\/container\.tsx \| named \| ok \|/);
  for (const name of ['AiActionSheet', 'AiAttachSheet', 'AiBottomSheet']) {
    assert.equal(primaryText.includes(`| ${name} |`), false);
    assert.ok(candidateText.includes(`| ${name} |`));
  }
  for (const name of [
    'GnbServiceMobile',
    'PromptInputContainer',
    'AiActionSheet',
    'AiAttachSheet',
    'AiBottomSheet',
  ]) {
    assert.equal((text.match(new RegExp(`\\b${name}\\b`, 'g')) || []).length, 1, name);
  }
  assert.ok(text.endsWith('\n'));
  assert.equal(text.endsWith('\n\n'), false);

  const jsonRun = spawnSync(
    process.execPath,
    [CLI, '--src', 'src', '--layout', 'project-layout.yaml', '--json'],
    { cwd: tmp, encoding: 'utf8' },
  );
  assert.equal(jsonRun.status, 0, jsonRun.stderr);
  const jsonModel = JSON.parse(jsonRun.stdout);
  assert.deepEqual(
    jsonModel.barrel_reexport_candidates.map((c) => [c.name, c.reason]),
    [
      ['AiActionSheet', 'wrapped_memo'],
      ['AiAttachSheet', 'wrapped_forward_ref'],
      ['AiBottomSheet', 'wrapped_memo'],
    ],
  );
  assert.match(jsonRun.stderr, /not classified as a primary component/);
  assert.match(jsonRun.stderr, /surfaced as a barrel re-export candidate/);
  assert.doesNotMatch(jsonRun.stderr, /re-exported by barrel but not in catalog: Ai/);

  const dryRun = spawnSync(
    process.execPath,
    [CLI, '--src', 'src', '--layout', 'project-layout.yaml', '--dry-run'],
    { cwd: tmp, encoding: 'utf8' },
  );
  assert.equal(dryRun.status, 0, dryRun.stderr);
  assert.match(dryRun.stdout, /## Barrel Re-export Candidates/);
  assert.match(dryRun.stdout, /\| AiBottomSheet \|/);

  const writeRun = spawnSync(
    process.execPath,
    [CLI, '--src', 'src', '--layout', 'project-layout.yaml'],
    { cwd: tmp, encoding: 'utf8' },
  );
  assert.equal(writeRun.status, 0, writeRun.stderr);
  assert.equal(
    fs.readFileSync(
      path.join(tmp, 'docs', 'frontend-workflow', 'design', 'component-catalog.md'),
      'utf8',
    ),
    dryRun.stdout,
  );
});

test('buildCatalog: 한 파일의 여러 public wrapper 는 source 공유와 무관하게 모두 candidate 로 표면화', (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'catalog-barrel-shared-wrapper-source-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const ui = path.join(tmp, 'src', 'design-system', 'components');
  fs.mkdirSync(ui, { recursive: true });
  fs.writeFileSync(
    path.join(ui, 'ai-sheets.tsx'),
    [
      'export const AiActionSheet = memo(() => null);',
      'export const AiAttachSheet = forwardRef(() => null);',
      '',
    ].join('\n'),
  );
  fs.writeFileSync(
    path.join(ui, 'index.ts'),
    "export { AiActionSheet, AiAttachSheet } from './ai-sheets';\n",
  );
  const layout = {
    roleGlobs: (role) => (role === 'ui_primitive' ? ['src/design-system/components/**'] : []),
  };
  const model = buildCatalog({ src: path.join(tmp, 'src'), projectRoot: tmp, layout });

  assert.deepEqual(model.components, []);
  assert.deepEqual(model.barrel_reexport_candidates, [
    {
      name: 'AiActionSheet',
      source_path: 'src/design-system/components/ai-sheets.tsx',
      export_kind: 'named',
      status: 'candidate',
      reason: 'wrapped_memo',
    },
    {
      name: 'AiAttachSheet',
      source_path: 'src/design-system/components/ai-sheets.tsx',
      export_kind: 'named',
      status: 'candidate',
      reason: 'wrapped_forward_ref',
    },
  ]);
  assert.deepEqual(model.barrel_reconcile.resolutionIssues, []);
  const candidateSection = renderCatalog(model).split('## Barrel Re-export Candidates')[1];
  assert.match(candidateSection, /\| AiActionSheet \|/);
  assert.match(candidateSection, /\| AiAttachSheet \|/);
});

test('buildCatalog: directory barrel named re-export 체인을 실제 선언까지 해소', (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'catalog-directory-barrel-chain-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const ui = path.join(tmp, 'src', 'design-system', 'components');
  const write = (rel, content) => {
    const file = path.join(ui, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  };
  write(
    'ai-action-panel/AiActionPanel.tsx',
    'export function AiActionPanel() { return null; }\n',
  );
  write(
    'ai-action-panel/index.ts',
    "export { AiActionPanel } from './AiActionPanel';\n",
  );
  write(
    'ai-action-sheet/implementation.tsx',
    'export const AiActionSheet = memo(() => null);\n',
  );
  write(
    'ai-action-sheet/index.ts',
    "export { AiActionSheet } from './implementation';\n",
  );
  write(
    'index.ts',
    [
      "export { AiActionPanel } from './ai-action-panel';",
      "export { AiActionSheet } from './ai-action-sheet';",
      '',
    ].join('\n'),
  );
  const layout = {
    roleGlobs: (role) => (role === 'ui_primitive' ? ['src/design-system/components/**'] : []),
  };

  const model = buildCatalog({ src: path.join(tmp, 'src'), projectRoot: tmp, layout });

  assert.deepEqual(model.components, [
    {
      name: 'AiActionPanel',
      source_path: 'src/design-system/components/ai-action-panel/AiActionPanel.tsx',
      export_kind: 'named',
      status: 'ok',
    },
  ]);
  assert.deepEqual(model.barrel_reexport_candidates, [
    {
      name: 'AiActionSheet',
      source_path: 'src/design-system/components/ai-action-sheet/implementation.tsx',
      export_kind: 'named',
      status: 'candidate',
      reason: 'wrapped_memo',
    },
  ]);
  assert.deepEqual(model.barrel_reconcile.resolutionIssues, []);
  assert.doesNotMatch(
    formatBarrelWarnings(model.barrel_reconcile).join('\n'),
    /unverified_named_export/,
  );
});

test('buildCatalog: 중첩 chain resolution 실패는 실제 실패한 barrel entry 를 보고', (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'catalog-directory-barrel-unresolved-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const ui = path.join(tmp, 'src', 'design-system', 'components');
  const write = (rel, content) => {
    const file = path.join(ui, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  };
  write('panel/index.ts', "export { Panel } from './missing';\n");
  write('index.ts', "export { Panel } from './panel';\n");
  const layout = {
    roleGlobs: (role) => (role === 'ui_primitive' ? ['src/design-system/components/**'] : []),
  };

  const model = buildCatalog({ src: path.join(tmp, 'src'), projectRoot: tmp, layout });

  assert.deepEqual(model.barrel_reconcile.resolutionIssues, [
    {
      name: 'Panel',
      module_specifier: './missing',
      barrel_path: 'src/design-system/components/panel/index.ts',
      reason: 'unresolved_module',
    },
  ]);
  const warnings = formatBarrelWarnings(model.barrel_reconcile).join('\n');
  assert.match(
    warnings,
    /unresolved_module\): Panel from \.\/missing \[src\/design-system\/components\/panel\/index\.ts\]/,
  );
  assert.doesNotMatch(
    warnings,
    /unresolved_module\): Panel from \.\/panel \[src\/design-system\/components\/index\.ts\]/,
  );
});

test('buildCatalog: 순환 directory barrel 체인은 unverified 로 fail-closed', (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'catalog-directory-barrel-cycle-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const ui = path.join(tmp, 'src', 'design-system', 'components');
  const write = (rel, content) => {
    const file = path.join(ui, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  };
  write('cycle-a/index.ts', "export { CircularPanel } from '../cycle-b';\n");
  write('cycle-b/index.ts', "export { CircularPanel } from '../cycle-a';\n");
  write('index.ts', "export { CircularPanel } from './cycle-a';\n");
  const layout = {
    roleGlobs: (role) => (role === 'ui_primitive' ? ['src/design-system/components/**'] : []),
  };

  const model = buildCatalog({ src: path.join(tmp, 'src'), projectRoot: tmp, layout });

  assert.deepEqual(model.components, []);
  assert.deepEqual(model.barrel_reconcile.resolutionIssues, [
    {
      name: 'CircularPanel',
      module_specifier: '../cycle-a',
      barrel_path: 'src/design-system/components/cycle-b/index.ts',
      reason: 'unverified_named_export',
    },
  ]);
});

test('buildCatalog: unresolved/unverified/ambiguous barrel target 은 임의로 primary 승격하지 않음', (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'catalog-barrel-ambiguous-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const ui = path.join(tmp, 'src', 'design-system', 'components');
  fs.mkdirSync(ui, { recursive: true });
  fs.writeFileSync(path.join(ui, 'one.tsx'), 'export function SharedPublic() { return null; }\n');
  fs.writeFileSync(path.join(ui, 'two.tsx'), 'export function SharedPublic() { return null; }\n');
  fs.writeFileSync(path.join(ui, 'ambiguous-target.ts'), 'export const PublicAmbiguous = 1;\n');
  fs.writeFileSync(path.join(ui, 'ambiguous-target.tsx'), 'export const PublicAmbiguous = 2;\n');
  fs.writeFileSync(path.join(ui, 'unverified.tsx'), 'export const OtherName = 1;\n');
  fs.writeFileSync(
    path.join(ui, 'multi.tsx'),
    'export const FirstPublic = () => null;\nexport const SecondPublic = () => null;\n',
  );
  fs.writeFileSync(
    path.join(ui, 'index.ts'),
    [
      "export { MissingPublic } from './missing';",
      "export { SharedPublic } from './one';",
      "export { SharedPublic } from './two';",
      "export { PublicAmbiguous } from './ambiguous-target';",
      "export { NotDeclared } from './unverified';",
      "export { FirstPublic, SecondPublic } from './multi';",
      '',
    ].join('\n'),
  );
  const layout = {
    roleGlobs: (role) => (role === 'ui_primitive' ? ['src/design-system/components/**'] : []),
  };
  const model = buildCatalog({ src: path.join(tmp, 'src'), projectRoot: tmp, layout });

  assert.deepEqual(model.components, []);
  assert.deepEqual(model.barrel_reexport_candidates, []);
  assert.deepEqual(
    [...new Set(model.barrel_reconcile.resolutionIssues.map((issue) => issue.reason))].sort(),
    [
      'ambiguous_module',
      'ambiguous_name',
      'ambiguous_source',
      'unresolved_module',
      'unverified_named_export',
    ],
  );
  const warnings = formatBarrelWarnings(model.barrel_reconcile).join('\n');
  assert.match(warnings, /barrel re-export not promoted \(ambiguous_module\)/);
  assert.match(warnings, /barrel re-export not promoted \(unresolved_module\)/);
});


test('build/render: ui_primitive role override scans nonstandard UI root and ignores default path decoys', (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'catalog-ui-role-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  fs.mkdirSync(path.join(tmp, 'src', 'shared', 'ui'), { recursive: true });
  fs.mkdirSync(path.join(tmp, 'src', 'components', 'ui'), { recursive: true });
  fs.writeFileSync(
    path.join(tmp, 'src', 'shared', 'ui', 'Button.tsx'),
    'export function Button() { return null; }\n',
  );
  fs.writeFileSync(
    path.join(tmp, 'src', 'components', 'ui', 'Ghost.tsx'),
    'export function Ghost() { return null; }\n',
  );
  const layout = { roleGlobs: (role) => (role === 'ui_primitive' ? ['src/shared/ui/**'] : []) };
  const model = buildCatalog({ src: path.join(tmp, 'src'), projectRoot: tmp, layout });
  assert.deepEqual(model.components, [
    { name: 'Button', source_path: 'src/shared/ui/Button.tsx', export_kind: 'named', status: 'ok' },
  ]);
  assert.equal(model.default_export_candidates.length, 0);
  const text = renderCatalog(model);
  assert.match(text, /Source: src\/shared\/ui\/\*\*/);
  assert.match(text, /\| Button \| src\/shared\/ui\/Button\.tsx \| named \| ok \|/);
  assert.equal(text.includes('Ghost'), false);
});

test('build/render: explicit empty ui_primitive role does not fall back to legacy root', (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'catalog-empty-ui-role-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const legacyUi = path.join(tmp, 'src', 'components', 'ui');
  fs.mkdirSync(legacyUi, { recursive: true });
  fs.writeFileSync(path.join(legacyUi, 'Ghost.tsx'), 'export function Ghost() { return null; }\n');
  const layout = { roles: { ui_primitive: [] }, roleGlobs: () => [] };
  const model = buildCatalog({ src: path.join(tmp, 'src'), projectRoot: tmp, layout });
  assert.deepEqual(model.source_globs, []);
  assert.deepEqual(model.source_dirs, []);
  assert.deepEqual(model.components, []);
  assert.equal(renderCatalog(model).includes('Ghost'), false);
});

test('build/render: ui_primitive role outside --src scans role root instead of empty fallback', (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'catalog-ui-role-outside-src-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  fs.mkdirSync(path.join(tmp, 'packages', 'ui', 'src'), { recursive: true });
  fs.mkdirSync(path.join(tmp, 'src', 'components', 'ui'), { recursive: true });
  fs.writeFileSync(
    path.join(tmp, 'packages', 'ui', 'src', 'Button.tsx'),
    'export function Button() { return null; }\n',
  );
  fs.writeFileSync(
    path.join(tmp, 'src', 'components', 'ui', 'Ghost.tsx'),
    'export function Ghost() { return null; }\n',
  );
  const layout = { roleGlobs: (role) => (role === 'ui_primitive' ? ['packages/ui/src/**'] : []) };
  const model = buildCatalog({ src: path.join(tmp, 'src'), projectRoot: tmp, layout });
  assert.deepEqual(model.source_globs, ['packages/ui/src/**']);
  assert.deepEqual(model.components, [
    { name: 'Button', source_path: 'packages/ui/src/Button.tsx', export_kind: 'named', status: 'ok' },
  ]);
});

test('build/render: ui_primitive wildcard segment scans matching concrete roots only', (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'catalog-ui-role-wildcard-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  fs.mkdirSync(path.join(tmp, 'packages', 'web', 'ui'), { recursive: true });
  fs.mkdirSync(path.join(tmp, 'packages', 'admin', 'not-ui'), { recursive: true });
  fs.mkdirSync(path.join(tmp, 'src', 'components', 'ui'), { recursive: true });
  fs.writeFileSync(
    path.join(tmp, 'packages', 'web', 'ui', 'Button.tsx'),
    'export function Button() { return null; }\n',
  );
  fs.writeFileSync(
    path.join(tmp, 'packages', 'admin', 'not-ui', 'Ghost.tsx'),
    'export function Ghost() { return null; }\n',
  );
  fs.writeFileSync(
    path.join(tmp, 'src', 'components', 'ui', 'Legacy.tsx'),
    'export function Legacy() { return null; }\n',
  );
  const layout = { roleGlobs: (role) => (role === 'ui_primitive' ? ['packages/*/ui/**'] : []) };
  const model = buildCatalog({ src: path.join(tmp, 'src'), projectRoot: tmp, layout });
  assert.deepEqual(model.source_dirs, ['packages/*/ui']);
  assert.deepEqual(model.components, [
    { name: 'Button', source_path: 'packages/web/ui/Button.tsx', export_kind: 'named', status: 'ok' },
  ]);
  assert.equal(renderCatalog(model).includes('Ghost'), false);
  assert.equal(renderCatalog(model).includes('Legacy'), false);
});

test('CLI: custom layout command header includes layout and concrete wildcard src', (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'catalog-cli-header-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  fs.writeFileSync(
    path.join(tmp, 'project-layout.yaml'),
    ['version: 1', 'preset: expo-feature', 'roles:', '  ui_primitive: packages/*/ui/**', ''].join('\n'),
  );
  fs.mkdirSync(path.join(tmp, 'packages', 'web', 'ui'), { recursive: true });
  fs.mkdirSync(path.join(tmp, 'src', 'components', 'ui'), { recursive: true });
  fs.writeFileSync(
    path.join(tmp, 'packages', 'web', 'ui', 'Button.tsx'),
    'export function Button() { return null; }\n',
  );
  fs.writeFileSync(
    path.join(tmp, 'src', 'components', 'ui', 'Ghost.tsx'),
    'export function Ghost() { return null; }\n',
  );
  const out = path.join('docs', 'frontend-workflow', 'design', 'component-catalog.md');
  const r = spawnSync(
    process.execPath,
    [CLI, '--src', 'packages', '--out', out, '--layout', 'project-layout.yaml'],
    { cwd: tmp, encoding: 'utf8' },
  );
  assert.equal(r.status, 0, r.stderr);
  const text = fs.readFileSync(path.join(tmp, out), 'utf8');
  assert.match(
    text,
    /Command: node scripts\/catalog-gen\.mjs --src packages --out docs\/frontend-workflow\/design\/component-catalog\.md --layout project-layout\.yaml/,
  );
  assert.match(text, /\| Button \| packages\/web\/ui\/Button\.tsx \| named \| ok \|/);
  assert.equal(text.includes('Ghost'), false);
});

test('CLI: disjoint multi-glob command header falls back to runnable src', (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'catalog-cli-disjoint-header-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  fs.writeFileSync(
    path.join(tmp, 'project-layout.yaml'),
    [
      'version: 1',
      'preset: expo-feature',
      'roles:',
      '  ui_primitive:',
      '    - missing-ui/**',
      '    - packages/*/ui/**',
      '',
    ].join('\n'),
  );
  fs.mkdirSync(path.join(tmp, 'packages', 'web', 'ui'), { recursive: true });
  fs.writeFileSync(
    path.join(tmp, 'packages', 'web', 'ui', 'Button.tsx'),
    'export function Button() { return null; }\n',
  );
  const out = path.join('docs', 'frontend-workflow', 'design', 'component-catalog.md');
  const r = spawnSync(
    process.execPath,
    [CLI, '--src', 'packages', '--out', out, '--layout', 'project-layout.yaml'],
    { cwd: tmp, encoding: 'utf8' },
  );
  assert.equal(r.status, 0, r.stderr);
  const text = fs.readFileSync(path.join(tmp, out), 'utf8');
  assert.match(text, /Source: missing-ui\/\*\*, packages\/\*\/ui\/\*\*/);
  assert.match(
    text,
    /Command: node scripts\/catalog-gen\.mjs --src packages --out docs\/frontend-workflow\/design\/component-catalog\.md --layout project-layout\.yaml/,
  );
  assert.doesNotMatch(text, /--src missing-ui/);
  assert.match(text, /\| Button \| packages\/web\/ui\/Button\.tsx \| named \| ok \|/);
});

test('analyzeBarrelReconcile: ui_primitive role ignores legacy src/components/ui barrel', (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'catalog-ui-role-barrel-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const sharedUi = path.join(tmp, 'src', 'shared', 'ui');
  const legacyUi = path.join(tmp, 'src', 'components', 'ui');
  fs.mkdirSync(sharedUi, { recursive: true });
  fs.mkdirSync(legacyUi, { recursive: true });
  fs.writeFileSync(path.join(sharedUi, 'Button.tsx'), 'export function Button() { return null; }\n');
  fs.writeFileSync(path.join(sharedUi, 'index.ts'), "export { Button } from './Button';\n");
  fs.writeFileSync(path.join(legacyUi, 'Ghost.tsx'), 'export function Ghost() { return null; }\n');
  fs.writeFileSync(path.join(legacyUi, 'index.ts'), "export { Ghost } from './Ghost';\n");
  const layout = { roleGlobs: (role) => (role === 'ui_primitive' ? ['src/shared/ui/**'] : []) };
  const model = buildCatalog({ src: path.join(tmp, 'src'), projectRoot: tmp, layout });
  const diff = analyzeBarrelReconcile({
    src: path.join(tmp, 'src'),
    projectRoot: tmp,
    layout,
    components: model.components,
  });
  assert.equal(diff.barrelFound, true);
  assert.deepEqual(diff.barrelPaths, ['src/shared/ui/index.ts']);
  assert.deepEqual(diff.reexported, ['Button']);
  assert.deepEqual(diff.missingFromCatalog, []);
  assert.deepEqual(diff.missingFromBarrel, []);
  assert.deepEqual(formatBarrelWarnings(diff), []);
});

test('CLI --json: default_export_candidates 를 같은 모델에 포함', () => {
  const r = spawnSync(process.execPath, [CLI, '--src', FIXTURE_SRC, '--json'], {
    cwd: KIT_ROOT,
    encoding: 'utf8',
  });
  assert.equal(r.status, 0, r.stderr);
  const model = JSON.parse(r.stdout);
  assert.deepEqual(
    model.default_export_candidates.map((c) => c.name),
    ['Modal'],
  );
  assert.equal(model.components.some((c) => c.name === 'Modal'), false);
});

test('analyzeBarrelReconcile: basic-ui fixture 배럴은 카탈로그와 정확히 일치(무경고)', () => {
  const model = buildCatalog({ src: FIXTURE_SRC });
  const diff = analyzeBarrelReconcile({ src: FIXTURE_SRC, components: model.components });
  assert.equal(diff.barrelFound, true);
  assert.deepEqual(diff.reexported, ['Button', 'Card', 'Stack']);
  assert.deepEqual(diff.missingFromCatalog, []);
  assert.deepEqual(diff.missingFromBarrel, []);
  assert.deepEqual(formatBarrelWarnings(diff), []);
});
