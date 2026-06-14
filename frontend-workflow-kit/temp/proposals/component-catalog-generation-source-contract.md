> **Status: DESIGN / SPEC ONLY — 2026-06-14.** 이 문서는 `component-catalog` 생성기(catalog-gen)의 **source contract + 식별 규칙 + v1 출력 범위 + 마이그레이션 계획**을 확정하기 위한 설계 제안이다. **런타임 변경을 지시하지 않는다.** 코드/스크립트/매니페스트/CI/정책을 **지금 바꾸지 않으며**, 모든 변경은 *PROPOSED (future PR)* 로만 기술한다. 본 PR의 산출물은 이 문서(설계) 하나뿐이다.

# Component Catalog — Generation Source Contract (Design)

하우스 스타일은 `frontend-workflow-kit/temp/proposals/generated-file-guard-design.md` 의 register-first / Options→Recommendation 형식을 따른다 (번호 매긴 섹션, 각 결정마다 Options a/b/c + Recommendation + file:line). 모든 결정 섹션은 **Options considered (a/b/c…)** 와 **Recommendation (근거 + file:line)** 를 포함한다.

> **인용 경로 주의:** 본 문서가 참조하는 지원 문서들은 단일 디렉토리에 모여 있지 않다 — `generated-file-guard-{design,followup}.md` 는 `frontend-workflow-kit/temp/proposals/` 에, `mvp-c-generated-views-scope.md` 는 (repo root) `temp/proposals/` 에, `nav-graph-001.md`·`mvp-c-generated-views-integration.md`·`route-tree-header-command-001.md` 는 `frontend-workflow-kit/temp/runs/` 에, `frontend-workflow-kit-implementation.md` 는 repo root 에 있다. 아래 인용은 파일명만으로 참조하며 `temp/proposals/` 하위로 가정하지 않는다.

---

## 0. Title / Purpose / Scope / Non-goals

### 0.1 Purpose
`component-catalog` 은 MVP-C 의 "수동 작성하던 전역 뷰 3종(component-catalog, nav-graph, route-tree)을 전부 생성물로 전환" 완료 기준 중 **남은 한 항목**이다 (route-tree·nav-graph 는 이미 Phase 1 구현 완료). 이 문서는 그 전환을 실제로 코딩하기 **전에** 확정해야 하는 계약을 정한다:

1. **Source of truth** — 무엇을 읽어 카탈로그를 만드는가 (§1).
2. **Component identification** — 무엇을 "컴포넌트"로 셀 것인가 (§2).
3. **v1 output scope** — 첫 생성기가 무엇을 내보내는가 (§3) — 특히 현재 수동본이 담고 있는 **props 를 어떻게 처리할지**.
4. **Output format / artifact strategy / migration / guard / fixture** (§4–§7).

핵심 원칙: **generator 를 가능한 한 작게.** v1 은 컴포넌트당 `name / path / export-kind / status` 만 내보내고, props·docgen·NativeWind·style 분석은 후속 단계로 미룬다. 소스 계약과 마이그레이션을 **먼저** 확정한 뒤에야 generator 구현에 착수한다.

### 0.2 Scope (이 PR이 다루는 것)
- 이 설계 문서 **하나의 파일**. (참고용 의도 경로: `frontend-workflow-kit/temp/proposals/component-catalog-generation-source-contract.md`.)
- 기존 두 생성기(route-tree, nav-graph)와 골든 하니스, 가드의 **데이터-드리븐 졸업 규칙**과 일관되게 catalog-gen 의 계약을 *기술*한다.

### 0.3 Non-goals (HARD CONSTRAINTS — 명시적 비목표)
아래는 **지금 수행하지 않으며**, 최대한 *PROPOSED future-PR step* 으로만 기술된다:

- **NG-1** `scripts/catalog-gen.mjs` 를 만들지 않는다 (코드·스켈레톤·스텁 일체 금지). 생성기는 미존재 상태로 둔다 (`catalog/artifact-manifest.yaml:182` 의 `command` 가 가리키는 catalog-gen.mjs 는 아직 없음).
- **NG-2** `package.json` 에 `workflow:catalog` 등 어떤 스크립트도 추가하지 않는다 (roadmap-only 유지).
- **NG-3** CI(`.github/workflows`)를 바꾸지 않는다.
- **NG-4** `validate.mjs` / `readiness.mjs` / `workflow-state.mjs` 를 바꾸지 않는다.
- **NG-5** `catalog/artifact-manifest.yaml` 을 바꾸지 않는다. 엔트리는 이미 존재한다 (`:177-187`). `do_not_edit:false→true`, `status:planned→active` 같은 필드 변경은 **future migration step** 으로만 기술한다.
- **NG-6** 기존 수동 `component-catalog.md` 를 지금 생성물로 전환하지 않는다.
- **NG-7** `src/components/**` 코드를 수정하지 않는다.
- **NG-8** 생성-파일 가드(`check-generated-files.mjs`)를 구현/재설계하지 않는다. 가드는 이미 component-catalog 를 *planned / must-not-fail* 로 올바르게 분류한다 (`scripts/lib/check-generated-files.mjs:46-74`).
- **NG-9** in-flight Execution Loop PR2 작업과 충돌하지 않는다 — 이 설계는 *오직* 산출물 파일 하나만 건드린다(실제로는 그 파일조차 부모가 기록; 본 태스크는 읽기 전용).
- **NG-10** readiness/policy 를 바꾸지 않는다. `component_catalog_generated` 의 readiness 함의는 **NOTE 만** 한다 (§6.5, §9).

---

## 1. Source of truth

**Decision:** catalog-gen 이 정본(canonical input)으로 읽는 대상.

### Options considered
- **(1a) 파일시스템 글롭 `src/components/ui/**` 만** — 매니페스트 `source: [src/components/ui/**]` (`catalog/artifact-manifest.yaml:183-184`) 와 정확히 일치. route-tree 가 `src/app/**` 를 파일시스템 워크로 스캔하는 패턴과 동형 (`scripts/lib/route-tree.mjs:8,37`).
- **(1b) `src/components/**` 전체 (ui + 그 외 하위 트리)** — `Card`, `Modal` 등이 `ui/` 밖에 생기면 포괄. 그러나 매니페스트 글롭과 어긋나고, `src/features/<domain>/components/` (예: `CouponCard` `src/features/coupons/components/CouponCard.tsx:11`) 같은 도메인 컴포넌트까지 빨아들여 범위가 흐려진다.
- **(1c) 배럴(barrel) `index.ts` 의 export 목록을 정본으로** — "공개된 것만" 카탈로그한다는 의미론은 매력적. 그러나 **현재 트리에 배럴이 존재하지 않는다**: `src/**/index.{ts,tsx}` 글롭은 `coupon-feature` 에서 0건이며, 유일한 `index.tsx` 들은 Expo Router 라우트 스텁(default export, `null` 반환)일 뿐 컴포넌트 배럴이 아니다 (source-components 리서치 §3). 정본을 존재하지 않는 파일에 묶을 수 없다.
- **(1d) AST 기반 "export 된 것"을 정본으로 (배럴/파일 무관)** — 가장 정확하지만 v1 의 "최소" 원칙에 반하고, re-export 이중계수 같은 false-positive 표면을 키운다 (§7.4).

### Recommendation — **(1a): 파일시스템 `src/components/ui/**` 가 canonical source.** 배럴은 *참고(reconcile)*하되 정본 아님.
근거:
- 매니페스트가 이미 `source: [src/components/ui/**]` 로 못박았다 (`catalog/artifact-manifest.yaml:183-184`); 수동 카탈로그 헤더도 `Source:  src/components/ui/**` 로 같은 글롭을 선언한다 (`examples/coupon-feature/docs/frontend-workflow/design/component-catalog.md:4`). 정본을 매니페스트와 어긋나게 두면 가드/검증과 즉시 불일치한다.
- 기존 생성기의 확립된 관례가 "export 파싱이 아니라 파일 경로/이름으로 키잉"이다: route-tree 는 확장자 필터(`['.tsx','.ts','.jsx','.js']`)로 파일시스템을 워크하고 `node_modules`·dot-dir 를 건너뛴다 (`scripts/lib/route-tree.mjs:8,37,48`). future catalog-gen 도 같은 워크 + 확장자 필터를 쓰도록 한다 (PROPOSED).
- 현재 100% 샘플이 `Button.tsx`→`Button` 처럼 파일명 = 컴포넌트명 1:1 이므로 (source-components 리서치 §2) 파일시스템 워크로 정확한 답을 얻는다.

**배럴 reconcile (비정본):** 만약 미래에 `src/components/ui/index.ts` 가 생기면, catalog-gen 은 그것을 정본으로 삼지 **않되**, "배럴이 re-export 하지만 파일 워크에 안 잡힌 컴포넌트" 또는 그 역을 **diagnostic(경고)** 으로만 보고할 수 있다 (§9 Open Decision OD-3). v1 은 배럴을 아예 읽지 않는 단순안을 채택한다.

**범위 경계:** `src/features/**/components/`(도메인 컴포넌트, 예 `CouponCard`)는 v1 카탈로그에서 **제외**한다 — 매니페스트 글롭이 `ui/**` 로 한정되어 있고, 도메인 컴포넌트 tier 는 별도 결정 사안이다 (§9 OD-4).

---

## 2. Component identification

**Decision:** `src/components/ui/**` 워크 결과에서 무엇을 "1개의 카탈로그 컴포넌트"로 셀 것인가.

### 관측된 ground truth (전부 동일·관용적)
- **100% named export, default export 0건**: 다섯 컴포넌트 전부 `export function <Name>(...)` (`Button.tsx:14`, `SkeletonList.tsx:5`, `EmptyState.tsx:5`, `ErrorState.tsx:6`, `SegmentedTabs.tsx:10`) — 즉 `src/components/ui/` 에는 정확히 **5개 파일**(Button, SkeletonList, EmptyState, ErrorState, SegmentedTabs)이 있다.
- **전부 PascalCase**, 파일당 단일 export, 파일 basename 과 동일.
- **`React.memo`·`forwardRef`·`displayName` 전무** — 전부 평범한 함수 선언.
- **default export = 라우트/스크린**: 라우트 파일은 `export default function CouponsTab` (`src/app/(tabs)/coupons.tsx:5`), 라우트 `index.tsx` 는 `export default function TabsIndex` (`route-tree/edge-cases/src/app/(tabs)/index.tsx:1`). 단, 스크린 컴포넌트 `CouponListScreen` 은 **named** export 이지만 `src/features/<domain>/screens/` 아래 있다 (예: `src/features/coupons/screens/CouponListScreen.tsx:23`) → **export 스타일이 아니라 경로가 판별자**.

### Options considered
- **(2a) 파일명(basename)으로 식별** — 현재 샘플 5/5 정답. 가장 단순/결정적. 그러나 `Button.styles.ts` 같은 비-컴포넌트 파일이나 다중 export 파일을 구분 못 함.
- **(2b) default export 로 식별** — RN 관용에 흔하나, **이 트리에서는 정반대**: default = 라우트/스크린. 컴포넌트는 전부 named. 채택 시 현재 컴포넌트를 0개 잡는다.
- **(2c) named PascalCase export 로 식별** — 현재 5/5 컴포넌트를 정확히 잡고, 라우트(default)를 자연히 배제. 단 `CouponListScreen`(named·PascalCase·`src/features/coupons/screens/` 아래)도 잡으므로 **경로 스코프(`components/ui/**`)와 AND** 해야 한다.
- **(2d) PascalCase export + memo/forwardRef 래퍼 해소까지 v1 에서 처리** — 가장 일반적이지만, 현재 샘플에 래퍼가 0건이라 **소스로 검증 불가**하며 v1 최소 원칙에 반한다.

### Recommendation — **v1 식별 규칙 = "경로 + named PascalCase export 의 교집합":**
> `src/components/ui/**` 아래 `.tsx`/`.ts` 파일에서, **파일 basename 이 PascalCase 이고 동명(同名) named export(`export function <Base>` 또는 `export const <Base> = …`)가 존재**하면 그 파일을 1개의 컴포넌트로 본다. **컴포넌트 식별자(export name)를 권위**로 삼되, 현재 샘플에서는 파일명과 일치하므로 v1 은 **파일 basename 을 1차 키**로 쓰고 export 존재를 확인하는 정도로 충분하다.

근거: (2c)가 현 샘플 5/5 정답이며 default-export 라우트를 배제 (`coupons.tsx:5`); 경로 AND 로 `src/features/coupons/screens/` 의 named-PascalCase 스크린을 배제 (`CouponListScreen.tsx:23`). export name 이 권위이나 파일명과 coincide 하므로(source-components §2) 구현은 파일 basename 키로 단순화 가능.

### v1 이 의도적으로 무시(out)하는 엣지 케이스 (전부 현재 샘플에 부재 → 미검증)
- **memo/forwardRef 래퍼** (`export const Foo = forwardRef(...)`, `memo(function Foo(){})`) — displayName 비결정성 위험 (§7.4). v1 = **plain 함수/const 선언만**. 래퍼는 OD-5.
- **default-export 컴포넌트** — v1 = named 만. (현 트리엔 default=라우트뿐.)
- **arrow 컴포넌트** `export const Foo = (props) => …` — v1 은 `export const <Pascal> =` 형태를 named 로 **인정**하되, RHS 가 래퍼면 OD-5 로 미룬다.
- **다중 export per file / 파일명≠export명** — 현재 0건; v1 은 파일당 단일 동명 export 가정.
- **co-located `*.stories.tsx` / `*.test.tsx` / `*.styles.ts`** — 현재 0건이나, 실트리 대비 v1 이 **선제 제외**한다 (확장자/접미사 필터). route-tree 의 dot-dir/`node_modules` skip 관례와 동형 (`scripts/lib/route-tree.mjs:48`).

---

## 3. v1 output scope — **props 처리 포함**

**Decision:** v1 생성기가 컴포넌트당 무엇을 내보내는가. **현재 수동본이 props 와 import 경로를 담고 있다는 사실과 반드시 화해해야 한다.**

### 현재 수동본이 담는 것 (반드시 화해 대상)
`examples/coupon-feature/docs/frontend-workflow/design/component-catalog.md` 본문은 컴포넌트마다:
- `- import: \`@/components/ui/Name\`` (`:15,19,23,27,31`)
- `- props: \`...\`` — prop 타입 목록 (`:16,20,24,28,32`)
즉 **현재 hand-authored 카탈로그는 per-component props 와 import path 를 포함**한다. props 는 각 컴포넌트의 로컬 `type Props = {...}` alias 에서 온다 (`Button.tsx:4-10` ↔ catalog `:16`).

### Options considered
- **(3a) v1 = `name / path / export-kind / status` 만; props·docgen 제외** — 가장 작고 결정적. 외부 의존(react-docgen-typescript/TS compiler API) 불필요 → util.mjs 의 "Node builtins + yaml 만" 의존 정책 유지 (`scripts/lib/util.mjs:2`). **단점: 현재 수동본의 props 가 생성 영역에서 사라진다** → 화해 필요.
- **(3b) v1 에 props 포함 (TS 타입 추출)** — 수동본과 1:1 호환. 그러나 TS AST/타입 추출은 (i) 외부 의존 도입(impl §9 가 `react-docgen-typescript` 또는 TS compiler API 를 적었다, `frontend-workflow-kit-implementation.md:333`), (ii) 결정성 위험(타입 직렬화 포맷 드리프트), (iii) v1 최소 원칙 정면 위반. 첫 생성기로는 과대.
- **(3c) style/className/NativeWind 분석 포함** — RN 스타일 추출은 범위 폭발. 명백히 후속.
- **(3d) examples/stories/tests presence 플래그 포함** — 현재 트리에 stories/tests 0건(source-components §4)이라 항상 false → v1 가치 없음. 후속.

### Recommendation — **(3a): v1 은 컴포넌트당 `name / source-path / export-kind / status` 4필드만.** props/docgen/NativeWind/style/stories 는 후속 phase.

**props 처리 (필수 화해) — 채택안:** v1 의 **생성 영역(generated region)에서 props 를 드롭**한다. 다만 마이그레이션 시 기존 props 가 **소실되지 않도록** 두 경로 중 하나를 택하며, 본 설계는 **§5 의 "whole-file generated, props 별도 후속" 안**과 정합하는 다음을 권고한다:

> **v1 생성물은 props 를 내보내지 않는다.** 기존 수동본의 per-component props 는 (i) catalog-gen 의 **props phase(후속)** 가 도입될 때까지 **명시적으로 보류**하고, (ii) 마이그레이션 PR 에서 기존 props 텍스트를 **아카이브 노트로 보존**(예: 같은 PR 설명/별도 `*.props.md` 메모)하여 회귀 추적 가능하게 한다. props 를 "임시 수동 영역"으로 남길지, 완전히 후속 generator 로 미룰지는 **Open Decision OD-1** 로 못박는다 (§9).

근거: (3a)는 두 기존 생성기의 무의존·결정성 계약과 일치 (`scripts/lib/util.mjs:2`; route-tree/nav-graph 무타임스탬프 `scripts/lib/route-tree.mjs:93`). props 를 v1 에 넣으면 외부 docgen 의존과 포맷 드리프트가 들어와 골든 byte-identical 보장을 위협한다 (§7.4 prettier/format drift). impl §9 가 props 추출을 적어둔 것(`frontend-workflow-kit-implementation.md:333`)은 **end-state intent** 이지 v1 의무가 아니다 — 같은 패턴(intent vs as-shipped)이 nav-graph 의 `generated_at` 에서 이미 관측됐다(스코프 스케치는 `generated_at` 포함했으나 as-shipped 는 드롭, nav-graph-001.md:30).

**export-kind 필드 정의:** v1 은 `named` | `default` 값만 (현재 전부 `named`). memo/forwardRef 래퍼 종류는 OD-5 로 미룬다.

**status 필드 정의:** 컴포넌트의 생애주기 상태가 아니라 **카탈로그 추출 상태**(예: `ok`)로 최소 정의. 의미 확장은 OD-2.

---

## 4. Output format

**Decision:** 생성 산출물의 직렬화 포맷, 그리고 **기존 `component-catalog.md`(HTML-comment 헤더 + `## Name` 섹션)와의 호환**.

### Options considered
- **(4a) 기존 Markdown 형태 유지 — `## Name` 섹션 + 불릿** — 수동본과 시각적으로 동형 (`component-catalog.md:12-32`). 단 마크다운 테이블/불릿은 prettier/포맷 드리프트에 취약하고(§7.4), 헤더 코멘트 스타일이 두 기존 생성기(YAML/txt)와 다르다.
- **(4b) YAML 본문 + GENERATED 헤더 (nav-graph 동형)** — `emitGeneratedYaml(headerLines, model)` 재사용 (`scripts/lib/util.mjs:206-210`); `--json` 동일 모델 출력 가능 (`scripts/nav-graph.mjs:25-28`). 결정성·diff 친화·무의존. **단점: 매니페스트 `path` 가 `…/design/component-catalog.md`(.md) 라서** YAML 본문을 .md 파일에 담는 모양이 어색.
- **(4c) 둘 다 (md + yaml)** — 산출물 2개 → 골든/가드 표면 2배. v1 과대.

### Recommendation — **(4a) Markdown 형태 유지 + 결정적 본문**, 헤더는 수동본과 동형의 **HTML-comment 블록**. **YAML/TXT 전용 `emitGeneratedYaml`(각 줄 `# ` 해시 헤더, `util.mjs:206-210`)은 재사용하지 않는다** — `.md` 에서 `# GENERATED FILE …` 는 H1 으로 렌더돼 수동본 헤더(`component-catalog.md:1-10`)와 어긋나기 때문:

> v1 산출물은 **Markdown** 파일(`docs/frontend-workflow/design/component-catalog.md`, 매니페스트 `path` 그대로 `catalog/artifact-manifest.yaml:181`)이며:
> 1. **HTML-comment GENERATED 헤더 블록** — 단, 마커 텍스트는 **em-dash 정본** `GENERATED FILE — DO NOT EDIT` 으로 통일한다 (현재 수동본은 em-dash 사용 `component-catalog.md:2`; validate 검사 6 이 `/GENERATED FILE\s+—\s+DO NOT EDIT/` 를 grep `scripts/validate.mjs:444`).
> 2. **`# Component Catalog` 제목**, 이어서 컴포넌트별 `## Name` 섹션 (기존 구조 호환 `component-catalog.md:12-14`).
> 3. 각 섹션 본문은 v1 4필드만: `- path:` , `- export:` , `- status:` (그리고 호환을 위해 `- import:` 는 §3 화해에 따름 — import 경로는 path 에서 결정적으로 파생 가능하므로 v1 에 **포함 가능**, props 만 드롭).

**헤더 블록 형태 (illustrative / non-binding) — 수동본과 동형의 HTML-comment:** route-tree 가 헤더를 lib 렌더러에 하드코딩한 것(`lib/route-tree.mjs:99-107`)처럼, catalog-gen 은 아래 HTML-comment 헤더를 **직접 찍는 전용 Markdown 렌더러**를 쓴다 (`emitGeneratedYaml` 의 `#` 해시 헤더가 아님):
```
<!--
GENERATED FILE — DO NOT EDIT

Source: src/components/ui/**
Command: node scripts/catalog-gen.mjs --src src/components/ui --out docs/frontend-workflow/design/component-catalog.md
-->
```
*(illustrative only — 코드 아님. on-disk 형태는 위 HTML-comment 그대로이며 `# ` 해시 접두는 붙지 않는다 — §7.1 골든 헤더 참조.)* `Command:` 는 **존재하지 않는 npm alias 가 아니라 동작하는 직접 CLI 호출**로 적는다 — nav-graph/route-tree 가 이미 이 교훈을 적용했다 (`nav-graph.mjs:35`; route-tree-header-command-001.md:34).

근거: Markdown 컨테이너 유지로 수동본과 구조 호환(`component-catalog.md:12-32`)하면서 헤더 마커는 검증 가능 형태로 통일. .md path 는 매니페스트가 강제하므로 (4b)의 순수 .yaml 로 바꾸지 않는다. 본문을 결정적 텍스트(불릿)로 한정해 prettier 드리프트 표면을 최소화. **이 본문 스키마(섹션/필드/정렬)는 OD-1/OD-2 가 닫히기 전까지 비구속(illustrative)** 이다.

---

## 5. Generated artifact strategy

**Decision:** whole-file generated artifact 인가, in-file generated block 인가; hand-authored 영역과 generated 영역의 분리 여부.

### Options considered
- **(5a) Whole-file generated** — 파일 전체를 generator 가 교체. route-tree(.txt)/nav-graph(.yaml)가 이 방식 (whole-file). 스코프 문서도 component-catalog 를 **file-header-style(파일 전체 교체)** 로 규정했고, 매니페스트 `generated_sections` START/END 는 screen-spec Entry Points 전용이라 카탈로그와 무관하다 (mvp-c-generated-views-scope.md:176,180).
- **(5b) In-file generated block (`<!-- GENERATED:START catalog -->…END -->`) + hand-authored 영역 공존** — props 같은 수동 보강을 같은 파일에 남길 수 있음. 그러나 스코프 문서가 "내부 START/END 블록을 둘 계획이면 **별도 제안으로 분리**"하라고 명시 (mvp-c-generated-views-scope.md:180 item 4). 즉 v1 에서 도입하면 안 됨.
- **(5c) Whole-file generated + 별도 수동 파일**(예: `component-catalog.notes.md`)로 props/보강 분리 — 두 영역을 물리적으로 분리해 가드 표면을 깨끗이 유지.

### Recommendation — **(5a): Whole-file generated artifact.** in-file 블록(5b)은 **별도 제안**으로 명시적으로 미룬다.
근거:
- 스코프 문서가 카탈로그를 file-header-style·whole-file 로 규정 (mvp-c-generated-views-scope.md:176); START/END 블록은 별도 제안 (`:180`).
- whole-file 은 가드의 reproduce-and-compare 가 그대로 적용된다 — 가드는 manifest `path` 가 가리키는 **committed artifact 전체**를 재생성본과 비교한다 (`scripts/lib/check-generated-files.mjs:236-241`). in-file 블록이면 부분 비교 로직이 필요해져 가드 재설계(NG-8 위반)를 부른다.
- props 보존이 필요하면 (5c)식 **별도 수동 파일**을 OD-1 의 한 선택지로 둔다 — generated 영역과 hand-authored 영역을 **파일 경계로** 분리해 false-positive 를 원천 차단.

**결과:** v1 생성물(`component-catalog.md`)은 **순수 생성 영역**(헤더 + `## Name` 4필드)만 가진다. 동일 파일 안에 수동 영역을 두지 않는다.

---

## 6. Migration plan (현재 수동본 → 생성물)

**Decision:** 현재 수동 카탈로그를 어떻게 생성물로 전환하고, 매니페스트 필드 플립을 언제 하는가. **전부 future PR 로 기술 (지금 수행 X — NG-5/NG-6).**

### Options considered
- **(6a) 이 PR 에서 manifest 를 active + do_not_edit:true 로 플립** — **금지**. 생성기가 없는데 status:active 로 만들면 매니페스트 의미론 위반("active = 스크립트 존재·실행 가능" `catalog/artifact-manifest.yaml:135`)이고, planned 산출물을 구현된 것처럼 보이게 한다(`:139-140`). 또한 do_not_edit:true 플립은 validate 검사 6 헤더 강제를 즉시 켠다 (`scripts/validate.mjs:438,444`) → 생성기 없는 채로 강제 발동.
- **(6b) status:planned 유지(이 PR), 생성기 랜딩 후(future PR)에야 active + do_not_edit:true 플립** — route-tree/nav-graph 가 밟은 정확한 선례. 그들은 generator 가 **존재한 뒤** planned→active 플립했다 (mvp-c-generated-views-integration.md:61-62).
- **(6c) 생성기 랜딩과 동시에 수동본을 한 번에 덮어쓰기** — 가능하나, 마이그레이션과 첫 생성을 한 PR 에 묶으면 byte-diff 리뷰가 커진다. 단계 분리가 안전.

### Recommendation — **(6b): 단계적, 데이터-드리븐.** 이 PR(설계) 이후의 future-PR 순서:

1. **(이 PR — 설계만)** 매니페스트 그대로: `status: planned`, `do_not_edit: false` (`catalog/artifact-manifest.yaml:185-186`). 어떤 플립도 없음.
2. **(future PR — generator)** `scripts/catalog-gen.mjs` 구현 (§10). 이 시점에도 **매니페스트는 아직 planned** 일 수 있다 — 생성기를 먼저 결정적으로 검증(골든)한 뒤 플립한다 (nav-graph 선례: 스키마/계약 확정 후 등록, nav-graph-001.md:106,114).
3. **(future PR — migration)** 생성기로 `component-catalog.md` 를 1회 생성해 수동본을 대체. 동시에 **PROPOSED** 매니페스트 플립: `status: planned→active`, `do_not_edit: false→true` (`catalog/artifact-manifest.yaml:185-186` 의 주석이 이미 이 전환을 예고: `:129-130,175`). status 플립은 가드 동작에 영향 없음(검사 6 은 status 미참조 `mvp-c-generated-views-integration.md:68`), do_not_edit:true 플립은 검사 6 헤더 강제를 켠다 (`scripts/validate.mjs:438`).
4. **(future PR — alias)** `package.json` 에 `workflow:catalog` alias 추가 + `package-scripts.template.json` 의 `//roadmap-scripts` 에 주차된 `workflow:catalog` 를 active `scripts` 로 이동 (route-tree/nav-graph 선례, mvp-c-generated-views-integration.md:74,83). **이 PR 에서 안 함 (NG-2).**
5. **(future PR — guard graduation)** §7 의 데이터-드리븐 졸업.

### 6.4 props during migration (필수)
마이그레이션 시점에 기존 per-component props (`component-catalog.md:16,20,24,28,32`)는 **§3 화해**에 따른다: v1 생성 영역은 props 를 내보내지 않으므로, 마이그레이션 PR 은 (i) 기존 props 를 **보존**(별도 메모/아카이브 또는 OD-1 의 별도 수동 파일)하고, (ii) 생성물이 props 를 **의도적으로 누락**함을 PR 설명에 명시한다. props 회귀는 후속 props-phase generator 가 복원한다.

### 6.5 readiness 함의 (NOTE only — NG-10)
`component_catalog_generated` 는 **파일 존재**로만 계산된다: `exists(catalogPath)` (`scripts/workflow-state.mjs:97-98`), `global.component_catalog_generated` 로 방출(`:104`), readiness 가 per-screen fact 로 소비(`scripts/readiness.mjs:163`), 그리고 `policies/implementation-mode-policy.yaml:63` 에서 `rough-fixture-ui` 진입 요건이다. **함의:** 수동본이든 생성물이든 파일이 존재하면 fact 는 이미 `true`다 — 따라서 catalog-gen 은 게이트를 **새로 여는 게 아니라**, 그 파일의 소유권을 수동→생성기로 옮기고 `do_not_edit`를 true 로 승격해 **존재를 생성 계약으로 격상**한다 (mvp-c-generated-views-scope.md:172,188). **이 설계는 readiness/policy 를 바꾸지 않는다.**

---

## 7. Guard / fixture strategy

**Decision:** 골든 픽스처를 어떻게 추가하고, 가드가 component-catalog 를 **언제** 강제 대상에 넣는가, 그리고 catalog 특유의 false-positive 위험. **가드 재설계 없음 (NG-8); 전부 future-PR.**

### 7.1 Fixture layout (route-tree 골든 레이아웃 미러)
**Options:** (7a) 기존 `examples/<kind>/<case>/` 규약 재사용 vs (7b) 새 디렉토리 규약. → **Recommendation: (7a).** 하니스 discovery 가 kind-agnostic 이므로 새 fixture 는 **하니스 코어 변경 없이** 드롭된다 (`scripts/test-fixtures.mjs:168-219`). 미래 케이스 레이아웃 (future PR, illustrative):
```
examples/component-catalog/basic-ui/
├─ run-metadata.json        # { fixture:"component-catalog", src:"src/components/ui",
│                           #   expected:"expected/component-catalog.md", expect:"pass" }
├─ src/components/ui/        # INPUT 트리: Button.tsx, Card.tsx, Input.tsx …
├─ docs/frontend-workflow/_meta/component-catalog.md   # in-tree 생성 복사본(골든과 byte-identical)
└─ expected/component-catalog.md                       # 하니스가 비교하는 GOLDEN
```
*(illustrative — 디렉토리/JSON 모양 스케치, 코드 아님.)* 하니스 배선은 route-tree/nav-graph 와 동일한 3줄 추가(roots/script const, kind-switch 의 `inputKey/inputFlag`, `buildFixtures` 등록)면 충분하다 (`scripts/test-fixtures.mjs:53-56,170-174,297-298`) — **단, 이 fixture 하니스 배선은 future PR 이며 본 PR(설계)에서는 수행하지 않는다 (가드 자체의 NG-8 과는 별개 사안).**

골든 헤더는 §4 결정대로 **HTML-comment 블록**(`<!-- GENERATED FILE — DO NOT EDIT … -->`, 수동본 `component-catalog.md:1-10` 동형)이다 — route-tree/nav-graph 골든의 `#` 해시 헤더와 달리 catalog 는 `.md` 라 HTML-comment 를 쓴다. 헤더 스타일과 무관하게 `normalizeGeneratedViewText` 가 모든 줄을 verbatim 유지하므로 골든 비교는 그대로 성립한다 (`scripts/lib/test-fixture.mjs:47-49`).

### 7.2 가드가 catalog 를 강제 대상에 넣는 정확한 조건 (데이터-드리븐 졸업)
가드에는 **component-catalog 특수분기가 전혀 없다.** 선택 술어는 매니페스트 필드에 대한 4-clause AND 다 (`scripts/lib/check-generated-files.mjs:41,72`):
> `selected = generated:true ∧ status:active ∧ do_not_edit:true ∧ id∈allowlist`

오늘 component-catalog 는 **세 가지**로 동시에 탈락 → 구조적으로 *must-not-fail*: `status:planned` (`:53-55`), `do_not_edit:false` (`:56-58`), allowlist 밖 (`:59-61`, allowlist = `['nav-graph','route-tree']` `:27`). 미선택이므로 reproduce 단계에서 완전 제외 — 생성기 부재(`CG:config`)조차 도달 불가, 즉 **catalog-gen 미존재로는 어떤 실패도 못 만든다** (`scripts/check-generated-files.mjs:168` 이 `selected` 만 reproduce; 생성기-부재 `CG:config` 분기는 `scripts/lib/check-generated-files.mjs:170-173`).

**졸업 조건 (전부 future PR):** 아래가 **동시에** 참이 될 때만 강제 진입한다:
1. `generated:true` — 이미 참 (`catalog/artifact-manifest.yaml:179`).
2. `status:active` — planned→active 플립 (§6 step 3). "active = 스크립트 존재·실행 가능"이므로 catalog-gen.mjs 가 실제 존재해야 함 (`catalog/artifact-manifest.yaml:135`).
3. `do_not_edit:true` — false→true 플립 (§6 step 3).
4. `id∈allowlist` — `component-catalog` 를 `V1_ARTIFACT_IDS` 에 추가 (`scripts/lib/check-generated-files.mjs:27`) — 매니페스트 편집만으로는 불가능한 **유일한 코드 등록 사항**.
추가로, 단지 `selected` 를 넘어 **실제 재생성-비교**하려면 `V1_REPRODUCE['component-catalog']` 계약(`{script,inputFlag,resolveInput,outName}`)도 등록해야 한다 (`scripts/lib/check-generated-files.mjs:107-120`); 없으면 `CG:config` skip (`:155-159`). **게이팅 로직 자체는 새 분기 불필요** — 졸업하면 route-tree/nav-graph 와 동일한 `reproduceArtifact` 경로(`CG:run/output/deterministic/content`)를 그대로 탄다 (`:150-247`). 이는 가드 설계 문서의 시퀀싱과 일치: diff 게이트는 첫 실제 생성기와 함께 들어와야 하며, 생성기 없는 시점에 먼저 넣지 말 것 (generated-file-guard-followup.md:133-134).

### 7.3 snapshot 디코이 — guard 대상 아님
`component-catalog.snapshot.md` (예: `examples/input-reconciliation/project-before/…`, `examples/multi-screen-dry-run/…`)는 **SAMPLE SNAPSHOT**이며 생성 타깃/가드 표면이 **아니다.** 가드는 manifest-path-driven 이지 filesystem-glob-driven 이 아니어서 (`scripts/lib/check-generated-files.mjs:69,122-126`) 매니페스트 `path`(`component-catalog.md`)와 다른 파일명(`.snapshot.md`)은 **절대 선택될 수 없다.** catalog-gen 의 입력 스캔도 §2 식별 규칙상 `*.snapshot.md`(소스 컴포넌트 아님)를 잡지 않는다. 디코이는 generator 입력에서도, 가드 타깃에서도 제외된다.

### 7.4 catalog 특유 false-positive 위험 (졸업 후)
가드의 유일한 정규화는 `normalizeGeneratedViewText` — CRLF→LF, `\`→`/` 뿐, **타임스탬프/날짜 정규화 없음** (`scripts/lib/check-generated-files.mjs:9`; `scripts/lib/test-fixture.mjs:47-49`). 따라서 다음은 전부 **generator 설계 의무**(가드 분기 아님):

- **(a) generated_at / 타임스탬프 드리프트** — 가드는 `generated_at` 를 정규화하지 않으므로, catalog 가 per-run 타임스탬프를 찍으면 `CG:content` 가 **매 실행 false-fail** (generated-file-guard-followup.md:153). → **v1 은 무타임스탬프**여야 한다 (route-tree/nav-graph as-shipped 계약 `scripts/lib/route-tree.mjs:93`; nav-graph-001.md:30). impl/스코프 스케치의 `generated_at` 라인은 채택하지 않는다.
- **(b) ordering 비결정성** — `fs.readdir` 순서는 OS 의존. 정렬 안 하면 `CG:deterministic` 트립 (`scripts/lib/check-generated-files.mjs:229-234`). → component id/path 키는 **plain `.sort()`** (route-tree 의 `files.sort()`/`dirs.sort()` UTF-16 코드유닛 정렬 관례 `scripts/lib/route-tree.mjs:52`); 다중 필드 레코드 배열에만 `localeCompare` (nav-graph `lib/nav-graph.mjs:192` 관례).
- **(c) barrel / re-export 이중계수** — `index.ts` 가 같은 컴포넌트를 re-export 하면 중복/팽창 → drift. → §1 권고대로 **배럴을 정본으로 쓰지 않음**으로 v1 에서 원천 차단; canonical source module 기준 de-dup.
- **(d) memo/forwardRef display-name** — 래퍼는 displayName 이 undefined/유도값이라 휴리스틱 결과가 불안정 → `CG:content` 미스매치. → §2 권고대로 v1 은 **plain 선언만**; 래퍼는 OD-5.
- **(e) prettier/format 드리프트** — catalog-gen 이 prettier 를 돌리면 버전/설정 차로 공백·테이블 패딩이 바뀜; 가드는 intra-line 공백을 정규화 안 함 (`scripts/lib/check-generated-files.mjs:9`). → **v1 은 prettier 미사용**, 결정적 문자열을 직접 조립(명시적 `\n` join + 단일 trailing newline, route-tree 식 `lib/route-tree.mjs:106`; `.md` 라 YAML 용 `emitGeneratedYaml` 은 쓰지 않음).
- **(f) CRLF / path-separator** — 이 둘만 가드가 이미 흡수 (`scripts/lib/check-generated-files.mjs:9`). Windows(이 repo 플랫폼) CRLF/백슬래시는 안전하나, **경로 토큰의 casing 이나 absolute-vs-relative 차이는 정규화 안 됨** — generator 는 머신 의존 절대경로를 출력하면 안 되고 posix-상대경로를 써야 한다 (가드 자신의 `relPosix`/`toPosixRel` 관례 `scripts/lib/check-generated-files.mjs:96-100`).

---

## 8. v1 recommended scope (consolidated)

한 곳에 모은 **최소 v1**:

- **Source of truth:** 파일시스템 글롭 `src/components/ui/**` (배럴 비정본) — §1. 매니페스트와 일치 (`catalog/artifact-manifest.yaml:183-184`).
- **Identification:** 경로(`components/ui/**`) ∩ named PascalCase export; plain 함수/const 선언만. default-export 라우트·`src/features/<domain>/screens/` 스크린·memo/forwardRef 래퍼·stories/tests/styles 파일 제외 — §2.
- **Output fields (컴포넌트당):** `name`, `source-path`, `export-kind`(named|default), `status`(추출상태). **import 경로는 path 에서 결정적 파생 시 포함 가능. props/docgen/NativeWind/style/stories presence 는 전부 후속** — §3.
- **Format:** Markdown 컨테이너(매니페스트 path `.md` 준수) + **HTML-comment GENERATED 헤더**(em-dash 마커, 수동본 동형; `emitGeneratedYaml` 해시 헤더 미사용) + `# Component Catalog` + `## Name` 섹션(4필드 불릿) — §4.
- **Artifact strategy:** whole-file generated, in-file START/END 블록 없음(별도 제안) — §5.
- **Determinism:** **무타임스탬프**, plain `.sort()` 키, prettier 미사용, 명시적 LF + 단일 trailing newline, posix-상대경로 — §7.4.
- **CLI shape (illustrative):** nav-graph 형 — `--src <dir>`(default `src/components/ui` 또는 DEFAULTS.src 파생), `--out <file>`(default 매니페스트 path), `--json`(동일 모델 stdout, early-return, 헤더 없음), `import.meta.url` 직접실행 가드, 순수 builder 를 `lib/` 에 분리 — §A.3.
- **무엇을 안 하나:** 매니페스트 플립·alias·CI·가드 코드·생성기 코드 — 전부 future PR.

---

## 9. Open decisions

각 항목은 **왜 열려 있는지 / 무엇을 막는지**. **이 설계 PR 을 막는 것은 없다** (전부 generator/migration future-PR 시점에 닫음). 선례: nav-graph 도 스키마를 Open Decision 으로 두고 generator 를 먼저 ship 한 뒤 닫고 등록했다 (mvp-c-generated-views-scope.md:418; nav-graph-001.md:106,114).

- **OD-1 — props 의 운명 (생성 영역 드롭 후):** 기존 per-component props (`component-catalog.md:16-32`)를 (a) 별도 수동 파일(`component-catalog.props.md` 등)로 분리 보존, (b) 완전히 후속 props-phase generator 로 이관(임시 소실 허용+아카이브), (c) in-file 수동 영역(§5 에서 비권장). **막는 것:** migration PR 의 props 보존 방식. **설계 PR 은 안 막음.**
- **OD-2 — `status` 필드의 의미:** 단순 `ok` 인가, deprecated/experimental 같은 생애주기 태그까지인가(어디서 그 신호를 읽나 — JSDoc? 명명 규약?). **막는 것:** v1 출력 스키마의 status 값 집합.
- **OD-3 — 배럴 reconcile diagnostic:** 미래 `index.ts` 등장 시 "배럴↔파일 워크 불일치"를 경고로 보고할지, 무시할지. **막는 것:** generator 의 선택적 diagnostic 기능(없어도 v1 동작).
- **OD-4 — `src/features/**/components/` tier:** 도메인 컴포넌트(예 `CouponCard` `src/features/coupons/components/CouponCard.tsx:11`)를 별도 카탈로그로 낼지, 영구 제외할지. **막는 것:** 미래 멀티-tier 카탈로그(매니페스트 글롭 추가 동반).
- **OD-5 — memo/forwardRef/arrow 래퍼 식별:** `export const Foo = forwardRef(...)`/`memo(...)`/arrow 의 display-name 결정적 해소 규칙. 현재 샘플에 0건이라 소스로 미검증(source-components §1). **막는 것:** 실트리 RN 정확도(false-positive (d)). **v1 은 plain 선언만으로 출시 가능.**
- **OD-6 — 본문 스키마 동결:** `## Name` 섹션의 필드 순서/불릿 형식(=§4 illustrative 본문)을 골든으로 동결하기 전 마지막 확정. **막는 것:** 첫 골든 fixture 의 byte-exact 내용.
- **OD-7 — `--src` default 출처:** `DEFAULTS.src`(='src', `scripts/lib/util.mjs:13`)에서 `components/ui` 를 파생할지, 리터럴 default 를 둘지(route-tree 는 리터럴 `'src/app'`, nav-graph 는 `DEFAULTS.docs` 파생 — 두 생성기가 관례가 갈림). **막는 것:** generator CLI default 한 줄. 사소.

---

## 10. Implementation slicing / next-PR candidates

**이 PR = 설계 only.** 이후는 전부 **future PR (마크됨):**

1. **(FUTURE) PR-2 — catalog-gen 스켈레톤:** `scripts/catalog-gen.mjs` + 순수 `scripts/lib/catalog.mjs` builder. `src/components/ui/**` 워크(§2 식별), v1 4필드 모델 빌드, **무타임스탬프·plain sort**. 출력은 §4 포맷. (NG-1: 지금 안 함.)
2. **(FUTURE) PR-3 — 출력 포맷 동결:** OD-6 닫고 `## Name` 본문 스키마 확정, `--json` 동일-모델 출력 정합 (`nav-graph.mjs:25-28` 미러).
3. **(FUTURE) PR-4 — 골든 fixture:** `examples/component-catalog/basic-ui/` (+ 음성 케이스 `xfail-dup-name`), 하니스 3줄 배선 (`test-fixtures.mjs:53-56,170-174,297-298`). 두-run 결정성 + byte-exact 골든 검증 (`scripts/lib/test-fixture.mjs:453-459,461-467`).
4. **(FUTURE) PR-5 — 매니페스트 플립:** `status:planned→active`, `do_not_edit:false→true` (`catalog/artifact-manifest.yaml:185-186`). + `package.json` alias `workflow:catalog` + 템플릿 `//roadmap-scripts`→active 이동 (mvp-c-generated-views-integration.md:74,83). (NG-2/NG-5: 지금 안 함.)
5. **(FUTURE) PR-6 — 가드 졸업:** `V1_ARTIFACT_IDS` 에 `component-catalog` 추가 (`check-generated-files.mjs:27`) + `V1_REPRODUCE` 계약 등록 (`:107-120`). **새 분기 없음** — 기존 reproduce 경로 재사용 (§7.2). (NG-8: 지금 안 함.)

각 PR 은 직전 PR 의 결정성/골든이 통과한 뒤에만 진행 — generator 부재 시점에 가드/플립을 먼저 넣지 않는다 (generated-file-guard-followup.md:133-134).

---

## Appendix A — Observed ground truth

### A.1 현재 수동 카탈로그 포맷 (props 포함)
`examples/coupon-feature/docs/frontend-workflow/design/component-catalog.md`:
- **헤더:** HTML 블록 코멘트 — `GENERATED FILE — DO NOT EDIT`(em-dash, `:2`), `Source:  src/components/ui/**`(`:4`), `Command: npm run workflow:catalog`(`:5`), 한국어 업데이트 노트(`:6`), `NOTE(MVP-A)` 수동 작성 임시 허용 + "실제 props 와 일치" 권고(`:8-9`).
- **본문:** `# Component Catalog`(`:12`), 컴포넌트별 `## Name`(`:14,18,22,26,30`), 각 섹션 `- import: \`@/components/ui/Name\`` + `- props: \`...\``(`:15-16` 등). → **현재 수동본은 per-component props + import 경로 포함** (v1 권고가 화해해야 하는 긴장점, §3).

### A.2 컴포넌트 소스 export 스타일 (관측)
- 100% named export, default 0건 — `src/components/ui/` 에 정확히 **5개 파일**: `Button.tsx:14`, `SkeletonList.tsx:5`, `EmptyState.tsx:5`, `ErrorState.tsx:6`, `SegmentedTabs.tsx:10` (전부 `export function <Pascal>`). 파일명=export명 1:1. memo/forwardRef/displayName 0건. props 는 로컬 `type Props` alias (`Button.tsx:4-10`).
- 라우트=default export (`src/app/(tabs)/coupons.tsx:5`); 스크린=named 이나 `src/features/<domain>/screens/` 아래 (예: `src/features/coupons/screens/CouponListScreen.tsx:23`) → 경로가 판별자.
- 배럴 0건 (`src/**/index.{ts,tsx}` 무결과); stories/tests 0건 — 따라서 §1/§2 의 배럴·stories 결정은 현 샘플에서 미검증(=Open Decision).
- 도메인 컴포넌트는 `src/features/coupons/components/CouponCard.tsx:11` (동일 named-Pascal 관례, ui/ 밖).

### A.3 미러할 generator 패턴 (route-tree·nav-graph + util)
- **CLI:** 커스텀 `parseArgs(process.argv.slice(2))` (`scripts/lib/util.mjs:23`, `--flag value`/`--flag=value`/bare `--bool`). `DEFAULTS` (`:13`: docs/src 등). **`--date` 플래그 없음 — 결정성 의도.** nav-graph: `--docs`(default `DEFAULTS.docs`)·`--out`(단일 파일 default `<docs>/_meta/nav-graph.yaml`)·`--json`(stdout early-return) (`nav-graph.mjs:16-28`). route-tree: `--app`(default `'src/app'`)·`--out`(파일) (`route-tree.mjs:11-15`).
- **헤더 방출 — 두 메커니즘:** nav-graph 는 공유 `emitGeneratedYaml(headerLines,obj)` 사용 (`util.mjs:206-210`; `nav-graph.mjs:31-38`). route-tree 는 lib 렌더러에 하드코딩 (`lib/route-tree.mjs:99-107`). **YAML/TXT 공통 3줄 계약:** `# GENERATED FILE — DO NOT EDIT`(em-dash, validate 검사 6 grep `scripts/validate.mjs:444`) / `# Source: …` / `# Command: <동작하는 node 호출>` — 각 줄 `# ` prefix 는 `emitGeneratedYaml` 이 붙인다 (`util.mjs:207`). → **단, component-catalog 는 `.md` 라 `emitGeneratedYaml`(해시 헤더)를 재사용하지 않고** route-tree 식으로 HTML-comment 헤더를 찍는 전용 렌더러를 쓴다 (§4).
- **결정성/정렬:** 무타임스탬프 (`lib/route-tree.mjs:93`; nav-graph-001.md:30). 객체/파일명 키 = plain `.sort()` (`lib/route-tree.mjs:52`; `lib/nav-graph.mjs:190,201`); 다중필드 레코드 배열 = `localeCompare`(joined key) + stable-sort 의존 (`lib/nav-graph.mjs:192-193,108-113,105-107`).
- **discovery:** `findFiles(root,basename)`(정확 일치, 정렬, node_modules/dot skip `util.mjs:91-114`), `walkFiles(root,exts)`(`:117-140`), `readFileSafe`(`:49-55`). route-tree 는 자체 `scanAppDir`(`lib/route-tree.mjs:37-70`). → catalog-gen 은 `walkFiles(<uiDir>, ['.tsx','.ts'])` 형이 자연.
- **write:** `writeFile(p,content)` — `mkdirSync recursive` + utf8, **newline 미정규화 → 호출부가 LF 생성** (`util.mjs:142-145`). route-tree `out.join('\n')+'\n'` (`lib/route-tree.mjs:106`).
- **skeleton (nav-graph 형, 미러):** shebang+헤더코멘트 → import util+순수 builder → `main()`(parseArgs→resolve `--src`/`--out`) → `flags.json` early-return → else 헤더+본문 방출+`writeFile`+stdout 상태줄 → `import.meta.url` 직접실행 가드 (`nav-graph.mjs:50`) → builder 는 IO-free·정렬·무타임스탬프. **단 방출 단계는 catalog 가 `.md` 라 `emitGeneratedYaml`(해시 YAML 헤더) 대신 HTML-comment 헤더 Markdown 렌더러**(route-tree 식 하드코딩, `lib/route-tree.mjs:99-107`).

### A.4 매니페스트 엔트리 (오늘 그대로 — 변경 없음)
`catalog/artifact-manifest.yaml:177-187`: `kind: generated`, `generated: true`, `scope: design`, `path: docs/frontend-workflow/design/component-catalog.md`, `command: npm run workflow:catalog` (catalog-gen.mjs **미존재**), `source: [src/components/ui/**]`, `do_not_edit: false` (MVP-A 수동 허용 `:185`), `status: planned` (`:186`), `mvp: C`. 주석이 전환을 예고: do_not_edit 은 catalog-gen active 전까지 false, 생성기 도입 시 true 승격 (`:129-130,173-176`). 매니페스트 의미론: active=스크립트 존재·실행 가능, planned=계약만 등록·구현 아님, planned 를 구현된 것처럼 보이게 하지 말 것 (`:135,139-140`).

### A.5 가드 / fixture / readiness 좌표 (재설계 아님 — 참조)
- 가드 선택 술어 4-clause AND, 특수분기 없음 (`scripts/lib/check-generated-files.mjs:41,46-74`); 정규화 = CRLF/backslash 만 (`:9`); reproduce 경로 공유 (`:150-247`); allowlist `['nav-graph','route-tree']`(`:27`); reproduce 계약 맵(`:107-120`). 디코이 `.snapshot.md` 는 manifest-path-driven 이라 구조적 제외 (`:69,122-126`).
- fixture 하니스 kind-agnostic discovery (`scripts/test-fixtures.mjs:168-219`), 정규화 `normalizeGeneratedViewText`(verbatim 유지 `scripts/lib/test-fixture.mjs:47-49`), 두-run 결정성(`:453-459`), 골든 byte-exact(`:461-467`).
- readiness: `component_catalog_generated` = 파일 존재 (`scripts/workflow-state.mjs:97-98,104` → `scripts/readiness.mjs:163` → `policies/implementation-mode-policy.yaml:63` `rough-fixture-ui` 요건). **본 설계는 readiness/policy 미변경 (NG-10).**
- **divergence note:** impl 스펙 §4 는 component-catalog `do_not_edit:true` 를 보이나(`frontend-workflow-kit-implementation.md:141-147`), **live 매니페스트는 `do_not_edit:false`+`status:planned`**(`catalog/artifact-manifest.yaml:185-186`)가 의도된 MVP-A 임시 예외다 — **live 매니페스트가 ground truth**, impl 스니펫은 end-state intent. (동일 패턴: impl/스코프의 `generated_at` vs as-shipped 무타임스탬프 — as-shipped 를 따른다.)