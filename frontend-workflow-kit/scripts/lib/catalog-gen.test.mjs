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

test('parseBarrelReexports: 상대 named re-export 의 PascalCase 이름만 수집', () => {
  const r = parseBarrelReexports(
    "// barrel\nexport { Button } from './Button';\nexport { Card, Stack } from './x';\n",
  );
  assert.deepEqual([...r.names].sort(), ['Button', 'Card', 'Stack']);
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
