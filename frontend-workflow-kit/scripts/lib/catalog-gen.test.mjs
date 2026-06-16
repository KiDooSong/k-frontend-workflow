// catalog-gen.test.mjs — phase2-1 배럴 reconcile 진단 단위 테스트 (node:test, 무의존).
// 정상(일치) 케이스 무경고 + 양방향 불일치 경고 + 별칭/star/type/외부 무시 규칙을 고정한다.
// v1 의 build/render 4-필드 출력 자체는 test-fixtures.mjs 의 골든 비교가 별도로 강제한다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildCatalog,
  parseBarrelReexports,
  analyzeBarrelReconcile,
  formatBarrelWarnings,
} from './catalog-gen.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_SRC = path.resolve(
  HERE,
  '..',
  '..',
  'examples',
  'component-catalog',
  'basic-ui',
  'src',
);

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

test('analyzeBarrelReconcile: basic-ui fixture 배럴은 카탈로그와 정확히 일치(무경고)', () => {
  const model = buildCatalog({ src: FIXTURE_SRC });
  const diff = analyzeBarrelReconcile({ src: FIXTURE_SRC, components: model.components });
  assert.equal(diff.barrelFound, true);
  assert.deepEqual(diff.reexported, ['Button', 'Card', 'Stack']);
  assert.deepEqual(diff.missingFromCatalog, []);
  assert.deepEqual(diff.missingFromBarrel, []);
  assert.deepEqual(formatBarrelWarnings(diff), []);
});
