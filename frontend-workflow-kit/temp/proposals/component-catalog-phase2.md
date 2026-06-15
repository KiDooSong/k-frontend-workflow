> **Status: DESIGN / SPEC ONLY — 2026-06-15.** 이 문서는 이미 출시된 `component-catalog` 생성기(catalog-gen v1)의 **phase2 메타데이터 확장 범위·우선순위·계약**을 확정하기 위한 설계 제안이다. **런타임 변경을 지시하지 않는다.** 코드/스크립트/매니페스트/CI/가드/생성물을 **지금 바꾸지 않으며**, 모든 변경은 *PROPOSED (future PR)* 로만 기술한다. 본 PR의 산출물은 이 문서(설계)와 동반 run report 둘뿐이다. **이 문서는 phase1 을 재제안하지 않는다** — phase1(v1 생성기·골든·매니페스트 active·가드 등록)은 **이미 구현·졸업 완료**이며, 본 문서는 그 위에서 *무엇을 다음에 추가할지* 만 다룬다.

# Component Catalog — Phase 2 Metadata (Design)

하우스 스타일은 `frontend-workflow-kit/temp/proposals/generated-file-guard-design.md` 와 `component-catalog-generation-source-contract.md` 의 register-first / Options→Recommendation 형식을 따른다 (번호 매긴 섹션, 각 결정마다 Options a/b/c + Recommendation + file:line). 모든 결정 섹션은 **Options considered (a/b/c…)** 와 **Recommendation (근거 + file:line)** 를 포함하며, 인용한 file:line 은 전부 직접 열어 확인한 것이다.

> **인용 경로 주의:** 본 문서가 참조하는 파일들은 단일 디렉토리에 모여 있지 않다 — 생성기/라이브러리/가드는 `frontend-workflow-kit/scripts/**` 에, 골든 픽스처는 `frontend-workflow-kit/examples/component-catalog/basic-ui/**` 에, 매니페스트는 `frontend-workflow-kit/catalog/artifact-manifest.yaml` 에, 그리고 `frontend-workflow-kit-implementation.md` 와 `temp/proposals/mvp-c-generated-views-scope.md` 는 (repo root) 에 있다. 아래 인용은 위 루트 기준 상대경로로 적는다.

---

## 0. Title / Purpose / Scope / Non-goals

### 0.1 Purpose

`component-catalog` v1 생성기는 **이미 출시·졸업되어 있다.** 본 문서는 그 v1 을 전제로, **phase2 에서 어떤 메타데이터를 어떤 순서로 추가할지** 를 확정한다. 핵심 질문은 네 가지다:

1. **무엇을 더 추출하는가** — props? style? variant/size? export 세부? (§3–§5)
2. **어떻게 추출하는가** — 현재 v1 의 regex/파일워크 범위 안인가, AST/docgen 의존을 들이는가? (§2, §4)
3. **언제 깨지지 않게 추가하는가** — v1 골든 테이블을 깨지 않는 additive 전략, 그리고 가드가 새 메타데이터를 **언제** 강제 대상으로 줍는가? (§6, §7, §9)
4. **무엇을 별도 제안으로 분리하는가** — NativeWind/style 분석, generated/manual region 분리 등. (§5, §8)

**결론 방향(이 문서가 착지하는 곳):** phase2-1 = **의존성 없는 정적 메타데이터 확장만**(v1 이 이미 쓰는 파일시스템/regex 로 도출 가능한 것 — 새 의존·AST·docgen 없음). props/docgen = phase2-2. NativeWind/style 분석 = phase2-3 또는 별도 제안. **v1 출력 포맷은 절대 깨지 않는다(additive only, 골든 테이블 재현성 유지).** 가드 등록/졸업은 새 출력이 안정화된 **뒤에만**(v1 이 했던 방식 그대로, data-driven).

### 0.2 v1 as-shipped — phase2 의 출발점 (ground truth, 변경 대상 아님)

phase1 은 source-contract 가 *제안* 했던 것과 일부 다르게 **출시**됐다. phase2 는 **as-shipped 를 정본으로** 삼는다:

- **생성기 존재:** `scripts/catalog-gen.mjs`(CLI) + `scripts/lib/catalog-gen.mjs`(순수 빌더/렌더러). 둘 다 구현 완료.
- **출력 포맷(정본 = 골든 픽스처):** `examples/component-catalog/basic-ui/expected/component-catalog.md` 는 H1 `# GENERATED FILE — DO NOT EDIT`(`:1`), 두 HTML-comment 라인 `<!-- Source: … -->`(`:2`)·`<!-- Command: … -->`(`:3`), 빈 줄, 그리고 **단일 `## Components` 섹션 + 4컬럼 테이블** `| Name | Source Path | Export Kind | Status |`(`:7-8`)에 컴포넌트 행이 이어진다(`:9-11`). 렌더러가 이 형태를 결정적으로 찍는다(`scripts/lib/catalog-gen.mjs:136-152`).
- **divergence (정직하게 기록):** source-contract §4 는 컴포넌트별 `## Name` **서브섹션**을 제안했으나(component-catalog-generation-source-contract.md:138), **출시된 것은 4컬럼 테이블 한 개**다. 또한 contract §4 는 on-disk 헤더를 **HTML-comment 블록**으로 권고했으나, 출시본은 **H1 마커 + HTML-comment Source/Command** 혼합이다(`scripts/lib/catalog-gen.mjs:134-135` 의 NOTE 가 이 차이를 "PR-4 포맷 동결 시 최종 확정 대상"으로 남겨둠). **본 phase2 문서는 골든 파일을 ground truth 로 인용하며, contract §4 의 서브섹션 스케치는 superseded 로 취급한다.**
- **매니페스트(이미 졸업):** `catalog/artifact-manifest.yaml:174-184` — `status: active`, `do_not_edit: true`, `mvp: C`, `source: [src/components/ui/**]`, `path: docs/frontend-workflow/design/component-catalog.md`.
- **가드(이미 등록):** `scripts/lib/check-generated-files.mjs:29` — `V1_ARTIFACT_IDS = ['component-catalog', 'nav-graph', 'route-tree']`, 그리고 reproduce 계약 `V1_REPRODUCE['component-catalog']`(`:131-137`)도 등록됨. 즉 component-catalog 는 **이미 4-clause 가드 selected** 이며 재생성-비교 대상이다.
- **의존성 정책:** 생성기는 Node 내장 + `yaml` 한 개만 쓴다(`scripts/lib/util.mjs:2-6`). catalog-gen 의 lib 는 `walkFiles`/`readFileSafe` 만 import 하고(`scripts/lib/catalog-gen.mjs:17`) **외부 의존 0개**. 결정성: 무타임스탬프, plain `.sort()`, prettier 미사용(`scripts/lib/catalog-gen.mjs:13,107-114,133`).

### 0.3 Scope (이 PR이 다루는 것)

- 이 설계 문서 + 동반 run report **두 파일**(둘 다 `temp/` 하위 허용 위치).
- v1 의 데이터-드리븐 졸업 규칙(생성기 먼저 → 골든으로 안정성 입증 → 매니페스트 플립 → 가드 등록)과 **일관되게** phase2 의 확장 범위를 *기술* 한다.

### 0.4 Non-goals (HARD CONSTRAINTS — 명시적 비목표)

아래는 **지금 수행하지 않으며** *PROPOSED future-PR step* 으로만 기술된다:

- **NG-1** `scripts/catalog-gen.mjs` / `scripts/lib/catalog-gen.mjs` 를 바꾸지 않는다. v1 코드는 동결 상태로 둔다.
- **NG-2** `package.json` / `package-scripts.template.json` 에 어떤 스크립트도 추가/이동하지 않는다.
- **NG-3** CI(`.github/workflows`)를 바꾸지 않는다.
- **NG-4** `catalog/artifact-manifest.yaml` 을 바꾸지 않는다. component-catalog 엔트리는 이미 active 다(`:174-184`); phase2 가 `source` 글롭을 늘리거나 새 엔트리를 추가하는 것은 **future migration step** 으로만 기술한다.
- **NG-5** 골든 픽스처(`examples/component-catalog/basic-ui/**`)·골든 출력(`expected/component-catalog.md`)을 바꾸지 않는다. v1 골든은 동결.
- **NG-6** 생성-파일 가드(`check-generated-files.mjs`)·가드 allowlist·`V1_REPRODUCE` 를 바꾸지 않는다. 이미 component-catalog 를 올바르게 등록·강제하고 있다(`scripts/lib/check-generated-files.mjs:29,131-137`).
- **NG-7** 골든 하니스(`test-fixtures.mjs`/`test-fixture.mjs`)·검증기(`validate.mjs`)·readiness/policy 를 바꾸지 않는다.
- **NG-8** `src/components/**` 코드·실제 컴포넌트 소스를 수정하지 않는다.
- **NG-9** 외부 의존(react-docgen-typescript, TS compiler API, prettier 등)을 **지금 도입하지 않는다.** 도입 가부는 §4/OD-2 에서 *결정* 으로 다루되, 본 PR 에서 `package.json` 의존 추가는 없다.
- **NG-10** 어떤 hard-gate 졸업도 하지 않는다. phase2 메타데이터가 가드 강제 대상이 되는 시점은 §9 에서 data-driven future-PR 로만 기술한다.

---

## 1. Phase 1 backlog → phase 2 입력 (source-contract OD-1…OD-7 인수)

phase2 의 백로그는 **source-contract 의 Open Decisions** 다. 그 문서가 ship-then-close 선례대로 v1 을 먼저 출시하며 OD 로 남긴 항목들이 곧 phase2 가 닫아야 할 후보다. 아래는 그 OD 들의 현재 상태와 phase2 처리 방향이다(원문: component-catalog-generation-source-contract.md:265-271).

| source-contract OD | 내용 | v1 처리 | phase2 방향 |
|---|---|---|---|
| **OD-1** props 의 운명 | 별도 수동 파일 / 후속 generator / in-file 수동 영역 | 생성 영역에서 드롭됨(테이블 4필드만) | **phase2-2** (docgen) + region 분리(§8) |
| **OD-2** `status` 필드 의미 | `ok` 인가 lifecycle 태그인가 | 항상 `'ok'`(`scripts/lib/catalog-gen.mjs:104`) | §3 candidate; deprecated/experimental 신호 출처 미정 → **OD-3(phase2)** |
| **OD-3** 배럴 reconcile diagnostic | `index.ts` 등장 시 경고 | v1 은 배럴 제외(`index.ts` non-Pascal, `scripts/lib/catalog-gen.mjs:80`) | **phase2-1 candidate** (§3.4) — 정적·무의존 |
| **OD-4** `src/features/**/components/` tier | 도메인 컴포넌트 별도 카탈로그 | v1 은 `/src/components/ui/` 마커로 제외(`scripts/lib/catalog-gen.mjs:23,70-71`) | **별도 제안** (§5.3, 멀티-tier = 매니페스트 글롭 추가 동반) |
| **OD-5** memo/forwardRef/arrow 래퍼 식별 | display-name 결정적 해소 | v1 은 plain 선언만; 래퍼 제외(`isWrappedConst`, `scripts/lib/catalog-gen.mjs:36-63`) | **phase2-1 후보(보수적)** (§4.4) — regex 한계 정직히 기록 |
| **OD-6** 본문 스키마 동결 | 골든 byte-exact 내용 | 4컬럼 테이블로 **동결됨**(`expected/component-catalog.md:7-8`) | **closed by v1** — phase2 는 additive only(§6) |
| **OD-7** `--src` default 출처 | 리터럴 vs DEFAULTS 파생 | 리터럴 `'src/components/ui'`(`scripts/catalog-gen.mjs:16`) | **closed by v1** |

**관찰:** OD-6/OD-7 은 v1 출시로 **이미 닫혔다.** OD-1/OD-2/OD-3/OD-5 가 phase2 의 실질 백로그이고, OD-4 는 별도 제안 후보다. 본 문서는 이들을 phase2 OD 로 재번호(§9)하되, **어느 것도 v1 처럼 LLM 이 스스로 confirmed/resolved 로 승격하지 않는다** — 전부 generator/migration 시점에 사람이 닫는다.

---

## 2. Phase 2 의 근본 제약 — 무의존·결정성·additive

**Decision:** phase2 메타데이터 확장이 반드시 지켜야 할 불변식.

### 관측된 ground truth (제약의 근거)
- **무의존 계약:** `scripts/lib/util.mjs:2` — "의존성 최소 원칙: Node 내장 + `yaml` 한 개만 사용한다." catalog-gen lib 는 그 위에서 `walkFiles`/`readFileSafe` 만 쓴다(`scripts/lib/catalog-gen.mjs:17`).
- **결정성 계약:** 무타임스탬프(`scripts/lib/catalog-gen.mjs:13,132`), `(source_path, name)` plain 코드유닛 비교 정렬(`:107-114,126`), posix 상대경로(`toPosix`, `:27-29,101`), prettier 미사용(명시적 `'\n'` join + 단일 trailing newline, `:133,151`).
- **가드의 정규화 한계:** 가드는 `normalizeGeneratedViewText`(CRLF→LF, `\`→`/`)만 하고 timestamp/date 정규화는 **하지 않는다**(`scripts/lib/check-generated-files.mjs:9,24`; `firstLineDiff` 도 같은 정규화만, `:148-149`). 즉 비결정적 출력은 매 실행 `CG:content` false-fail 이 된다.
- **additive 제약의 근거:** component-catalog 는 이미 가드 selected + reproduce 대상(`V1_REPRODUCE['component-catalog']`, `scripts/lib/check-generated-files.mjs:131-137`)이고, 골든이 byte-exact 비교된다. **출력 한 바이트라도 비결정적/비재현이면 가드가 즉시 깨진다.**

### Options considered
- **(2a) phase2 도 무의존·정적 regex/파일워크 범위 유지** — v1 의 모든 계약을 그대로 상속. 추가 메타데이터는 이미 읽는 파일 본문/경로에서 regex 로 도출. 새 의존·AST 없음.
- **(2b) phase2 에서 TS AST/docgen 의존 도입** — props 등 깊은 추출에 정확. 그러나 무의존 계약 위반(`util.mjs:2`), 직렬화 포맷 드리프트 위험, 결정성 입증 부담.
- **(2c) phase2 를 두 모드로 — 기본 무의존, opt-in `--with-props` 가 docgen 의존** — 유연하나 골든이 두 갈래가 되고 가드 표면이 분기. v1 단순성 원칙에 반함.

### Recommendation — **(2a): phase2-1 은 v1 의 무의존·결정성·additive 계약을 그대로 상속한다.** 의존을 들이는 확장(props/docgen)은 **별도 phase(phase2-2)** 로 분리하고, 거기서 (2b) 의존 도입 여부를 **명시적 결정(OD-2)** 으로 다룬다.

근거: 무의존 계약은 단순 선호가 아니라 명문화된 정책이다(`scripts/lib/util.mjs:2`). v1 이 이 계약 안에서 정확히 동작함을 골든이 입증한다(`expected/component-catalog.md`). additive·무의존 확장은 동일 계약 안에 머물러 가드/골든을 깨지 않는다. 의존을 들이는 순간 결정성·드리프트 입증이 새로 필요하므로, 그 부담을 별도 phase 로 격리하는 것이 v1 의 "generator 를 가능한 한 작게" 원칙과 정합한다(component-catalog-generation-source-contract.md:21).

---

## 3. Phase 2-1 — 무의존 정적 메타데이터 확장 (what)

**Decision:** v1 이 이미 읽는 파일 본문/경로/디렉토리 구조에서 regex·파일워크로 **결정적으로** 도출 가능한 추가 필드. 새 의존 없음.

### 후보 메타데이터 (전부 v1 의 현 입력에서 도출 가능 — 무의존)

각 후보는 (i) **도출 가능성**(v1 이 이미 가진 데이터로 결정적인가), (ii) **가치**, (iii) **위험** 으로 평가한다.

- **(3a) `default` export-kind 수집** — 현재 `export_kind` 는 항상 `'named'`(`scripts/lib/catalog-gen.mjs:103`)이고 default export 는 **컴포넌트로 아예 제외**된다(`Modal.tsx` 골든 디코이, `examples/component-catalog/basic-ui/src/components/ui/Modal.tsx:2` → expected 에 없음). phase2-1 은 default-export 컴포넌트를 **수집하되 `export_kind: default` 로 표기** 할 수 있다. 도출: `export default function <Base>` regex. 위험: default 식별과 라우트/스크린 구분(§5.3 OD-4 와 얽힘). → **candidate, OD-1 로 미해결.**
- **(3b) `import` 별칭 경로 컬럼** — 현재 수동 카탈로그가 `@/components/ui/Name` import 경로를 담았다(source-contract §A.1, component-catalog-generation-source-contract.md:293). 이는 `source_path` 에서 **결정적으로 파생** 가능(`src/components/ui/Button.tsx` → `@/components/ui/Button`). 도출: 순수 문자열 변환, 무의존. 위험: alias(`@/`)가 프로젝트 tsconfig `paths` 에 의존 → 프로젝트별 다름. → **candidate, but alias 규약 출처 미검증 → OD-1.**
- **(3c) co-located 자매 파일 presence 플래그**(`*.test.*`, `*.stories.*`, `*.styles.*`) — v1 은 이들을 basename 의 `.` 으로 **제외** 한다(`scripts/lib/catalog-gen.mjs:78`). phase2-1 은 같은 디렉토리에 `Button.test.tsx`/`Button.stories.tsx` 가 있는지 파일워크로 검사해 `has_test`/`has_stories` 불리언을 낼 수 있다. 도출: `walkFiles` 결과를 basename 으로 그룹핑, 무의존·결정적. 위험: 현재 골든 트리에 자매 파일 0건 → 항상 false → 테스트 가치 낮음(검증 불가). → **candidate, but 검증 픽스처 필요 → OD-1.**
- **(3d) 배럴(barrel) reconcile diagnostic** — 골든 트리에 이미 `index.ts` 배럴이 존재하며 `Button`/`Card`/`Stack` 을 re-export 한다(`examples/component-catalog/basic-ui/src/components/ui/index.ts:2-4`). v1 은 배럴을 non-Pascal basename 으로 **제외** 한다(`scripts/lib/catalog-gen.mjs:80`). phase2-1 은 배럴의 `export { X } from './X'` 를 regex 로 읽어 "배럴이 export 하지만 파일워크에 없는 컴포넌트"(또는 역)를 **diagnostic 으로만** 보고할 수 있다(파일 출력엔 안 넣음). 도출: regex, 무의존. 위험: re-export 별칭(`export { X as Y }`), star re-export(`export *`) 는 결정적 해소가 까다로움. → **candidate (source-contract OD-3), 출력 비포함 진단부터 → OD-1.**
- **(3e) `status` lifecycle 확장** — 현재 `status` 는 항상 `'ok'`(추출 상태, `scripts/lib/catalog-gen.mjs:104`). lifecycle(`deprecated`/`experimental`)로 확장하려면 그 신호를 **어디서 읽을지**(JSDoc `@deprecated`? 명명 규약?) 가 정해져야 한다. JSDoc 태그라면 정적 regex 로 도출 가능(무의존). 위험: 신호 출처가 트리에 0건 → 미검증. → **candidate (source-contract OD-2), 신호 출처 미정 → OD-3(phase2).**

### Options considered (phase2-1 범위 크기)
- **(opt-a) phase2-1 = 위 후보를 한 번에 다 추가** — 컬럼 폭발. 검증 픽스처가 없는 후보(3c/3e)까지 들어와 골든이 항상-false 컬럼으로 오염.
- **(opt-b) phase2-1 = 가장 검증 가능하고 위험 낮은 후보 1–2개만** — 골든으로 입증되는 것만. 나머지는 후속 슬라이스.
- **(opt-c) phase2-1 = 새 컬럼 0개, 진단(diagnostic)만 추가** — 출력 포맷 불변(가드 무위험). 배럴 reconcile(3d) 같은 stderr 경고만. 가장 보수적.

### Recommendation — **(opt-b) 우선, (opt-c) 를 안전판으로.** phase2-1 의 첫 슬라이스는 **출력에 새 행(컬럼)을 추가하기 전에**, (3d) 배럴 reconcile 을 **출력 비포함 진단(warning-first)** 으로 먼저 넣는다. 그 다음 검증 픽스처가 갖춰진 후보(3a default-export 수집이 가장 유력)만 **additive 컬럼**으로 승격한다.

근거: (opt-c) 의 진단-우선은 출력 포맷을 전혀 건드리지 않아 가드/골든 무위험(`scripts/lib/check-generated-files.mjs:131-137` reproduce 계약 불변). 골든 트리에 배럴이 실재하므로(`index.ts:2-4`) (3d) 는 **검증 가능** 하다 — 현재 배럴 3개 re-export 가 파일워크 3개 컴포넌트와 정확히 일치하는지 진단할 수 있다. (3c)/(3e) 는 트리에 신호가 0건이라 검증 불가 → 미루는 것이 정직하다. 컬럼 추가는 골든 byte-exact 를 바꾸므로(§6), 반드시 새 골든 픽스처와 함께 단계적으로만 한다.

**중요:** 위 후보 중 **어느 것도 본 PR 에서 출력에 반영되지 않는다.** 전부 candidate 이며, 채택·우선순위는 OD-1/OD-3(phase2)로 미해결로 남긴다 — LLM 이 임의로 confirmed 로 올리지 않는다.

---

## 4. 추출 기법 — regex vs TypeScript AST (how)

**Decision:** phase2 의 더 깊은 추출(특히 props)을 regex 로 할지, TS AST/docgen 의존을 들일지.

### 관측된 ground truth
- **v1 은 전부 regex/문자열:** named export 판정은 `^\s*export\s+(?:async\s+)?function\s+<base>\b` / `^\s*export\s+const\s+<base>\b`(`scripts/lib/catalog-gen.mjs:93-95`), 래퍼 판정은 괄호 깊이 세는 수제 파서(`isWrappedConst`, `:36-63`). **AST 미사용.**
- **v1 이 스스로 기록한 regex 한계:** "정규식 기반(AST 미사용)이라 column-0 블록주석 안의 주석처리된 export 는 false-include 될 수 있다. 현재 실트리엔 0건… 견고한 파싱(주석 strip/AST)은 후속 phase 로 미룬다"(`scripts/lib/catalog-gen.mjs:90-92`). `isWrappedConst` 도 잔여 한계를 명시: "문자열 리터럴 안의 비균형 괄호, `= (React.memo)(…)` 처럼 괄호로 감싼 표기"(`:35`).
- **end-state intent:** impl §9 표는 catalog-gen 입력을 `src/components/ui/** (TS props)`, 비고를 `react-docgen-typescript 또는 TS compiler API` 로 적었다(frontend-workflow-kit-implementation.md:333). 이는 **end-state intent** 이지 v1/phase2-1 의무가 아니다 — v1 이 이미 props 없이 출시된 것이 그 증거.

### Options considered
- **(4a) props 까지 regex 로** — `type Props = {…}` alias 를 regex 로 긁기(골든 컴포넌트 전부 이 형태, `Button.tsx:1`·`Card.tsx:1`·`Stack.tsx:1`). 무의존 유지. **그러나** 중첩 제네릭·유니온·`extends`·import 된 타입·인터섹션을 regex 로 결정적·정확히 직렬화하는 것은 v1 의 `isWrappedConst` 가 이미 보여준 "괄호 깊이 수제 파싱"의 훨씬 어려운 버전 → false-positive·드리프트 위험 큼.
- **(4b) props 를 TS compiler API / react-docgen-typescript 로** — 정확. impl intent 와 일치(frontend-workflow-kit-implementation.md:333). **그러나** 외부 의존 도입(NG-9·`util.mjs:2` 위반), 타입 직렬화 포맷이 라이브러리 버전에 묶여 결정성/드리프트 위험(가드는 timestamp/포맷 정규화 안 함, `scripts/lib/check-generated-files.mjs:9`), tsconfig 해석 의존.
- **(4c) props 추출 자체를 phase2-2 로 미루고, phase2-1 은 props 를 건드리지 않음** — props 가 들어오는 순간 (4a)든 (4b)든 결정성/의존 결정을 강제하므로, 그 결정을 별도 phase 로 격리.

### Recommendation — **(4c): props/docgen 은 phase2-2 로 분리한다. phase2-1 은 props 를 추출하지 않는다.** phase2-2 진입 시 (4a regex) vs (4b AST/docgen) 선택은 **OD-2 로 열어 둔다** — 본 문서는 어느 쪽도 resolve 하지 않는다.

근거: v1 이 props 없이 출시되며 이미 "견고한 파싱(AST)은 후속 phase"라고 못박았다(`scripts/lib/catalog-gen.mjs:92`). props 는 무의존-additive 라는 phase2-1 정의(§2)에 들어맞지 않는다 — (4a)는 결정성 위험이 크고 (4b)는 의존을 요구한다. 둘 다 별도의 입증(골든·결정성)이 필요하므로 phase2-2 로 격리하는 것이 정합적이다. **방향 제언(비구속):** 만약 phase2-2 가 (4a) regex 를 택한다면 props 를 *구조화된 타입*이 아니라 *원시 alias 텍스트*로만 보존하는 보수적 형태가 드리프트를 줄인다. (4b) docgen 을 택한다면 의존 추가는 **그 자체로 별도 결정 PR**(OD-2)이어야 한다.

### 4.4 memo/forwardRef 래퍼 식별 (source-contract OD-5) — regex 범위 내 가능성
v1 은 래퍼를 **제외** 한다(`Badge.tsx`=memo, `Field.tsx`=forwardRef 골든 디코이 → expected 에 없음; `isWrappedConst`, `scripts/lib/catalog-gen.mjs:36-63,86`). phase2 가 이들을 **포함** 하려면 컴포넌트명(=식별자) 결정 규칙이 필요하다. **무의존 regex 로 부분 가능**: `export const Foo = memo(...)` 의 `Foo` 는 이미 v1 이 잡는 basename 과 일치하므로, "이 파일은 컴포넌트이고 export_kind=`memo`/`forwardRef`" 로 표기하는 것은 regex 범위 안이다. **그러나** display-name 추출(래퍼 안쪽 함수명·`displayName` 할당)은 결정적 해소가 까다롭다(source-contract §7.4(d), component-catalog-generation-source-contract.md:240). → **phase2-1 후보지만 보수적으로**: "래퍼를 컴포넌트로 *포함* 하고 export_kind 만 표기, display-name 은 미추출" 까지가 무의존 한계. 전체 해소는 OD-4(phase2). 골든 디코이(`Badge`/`Field`)가 이미 있어 **포함 전환 시 골든이 바뀐다**(§6 additive 규칙 적용).

---

## 5. React Native / Expo / NativeWind / style 메타데이터 (where does it belong?)

**Decision:** className/style/variant/size 같은 RN/NativeWind 스타일 메타데이터를 이 생성기에 넣을지, 별도 제안으로 분리할지.

### 관측된 ground truth
- 이 kit 은 Expo Router 기반이다 — route-tree 가 `src/app` Expo Router 파일트리를 정본으로 함(frontend-workflow-kit-implementation.md:335). 컴포넌트는 RN 컴포넌트.
- **그러나** 골든 컴포넌트들은 스타일을 전혀 담지 않는다 — `Button.tsx`/`Card.tsx`/`Stack.tsx` 는 `return null` 스텁이고 className/style/variant prop 이 없다(`examples/component-catalog/basic-ui/src/components/ui/Button.tsx:3-5` 등). 즉 **NativeWind/style 신호가 골든 트리에 0건 → 검증 불가.**
- v1/source-contract 모두 style 분석을 명시적 후속으로 분류(`scripts/lib/catalog-gen.mjs:12` "props/docgen/NativeWind/style 분석은 후속 phase"; component-catalog-generation-source-contract.md:108 "(3c) style/className/NativeWind … RN 스타일 추출은 범위 폭발. 명백히 후속").

### Options considered
- **(5a) phase2 에서 className/variant/size 컨벤션 메타데이터 추가** — 디자인 시스템 카탈로그로서 가치. 그러나 (i) 신호가 골든에 0건이라 검증 불가, (ii) variant/size 규약은 프로젝트마다 다름(cva·tailwind-variants·수제 union 등) → 결정적·범용 추출 불가, (iii) NativeWind className 파싱은 사실상 style 분석 = 범위 폭발(component-catalog-generation-source-contract.md:108).
- **(5b) style 분석을 이 generator 가 아니라 *별도 generator/제안* 으로** — 카탈로그 generator 는 "무엇이 컴포넌트인가 + 정적 식별 메타"에 집중하고, 스타일/디자인-토큰 추출은 별도 산출물(예: 별도 매니페스트 엔트리)로.
- **(5c) phase2-3 로 미루되 같은 generator 안에서** — 같은 파일워크를 재사용하나, 의존·범위가 props 보다 크다.

### Recommendation — **(5b)/(5c) 혼합: NativeWind/style/variant/size 분석은 phase2-3 또는 *별도 제안* 으로 분리한다. phase2-1/2-2 범위 밖.** 이 generator 가 그것을 떠안을지(같은 산출물 확장) vs 별도 산출물로 낼지는 **OD-5(phase2)로 열어 둔다.**

근거: 스타일 신호가 골든에 0건이라 지금 결정·검증할 근거가 없다(`Button.tsx:3-5` 등 전부 `return null`). variant/size 규약은 라이브러리 의존적이라 "Node 내장 + yaml" 무의존 계약(`scripts/lib/util.mjs:2`) 안에서 범용·결정적으로 추출하기 어렵다. v1·source-contract 가 이미 "명백히 후속/범위 폭발"로 분류했다(component-catalog-generation-source-contract.md:108). 따라서 **className/style/variant/size 는 phase2-1 에서 명시적으로 out**, 별도 제안 후보로 기록한다.

### 5.3 `src/features/**/components/` tier (source-contract OD-4)
도메인 컴포넌트(예 `CouponCard`)를 별도 카탈로그로 낼지는 RN/style 과는 별개의 tier 질문이다. v1 은 `/src/components/ui/` 마커로 features 트리를 제외한다(`scripts/lib/catalog-gen.mjs:23,70-71`). 멀티-tier 카탈로그는 **매니페스트 `source` 글롭 추가**(`catalog/artifact-manifest.yaml:181`)를 동반하므로 manifest migration 이 필요 → **별도 제안/OD-4(phase2).** phase2-1 범위 밖.

---

## 6. v1 출력 포맷을 깨지 않는 additive 전략 (when, safely)

**Decision:** phase2 가 새 메타데이터를 추가할 때 v1 의 4컬럼 골든 테이블을 **재현 가능하게** 유지하는 방법.

### 관측된 ground truth (깨지면 안 되는 것)
- 골든 출력은 정확히 `| Name | Source Path | Export Kind | Status |` 4컬럼(`expected/component-catalog.md:7`)이고, 렌더러가 이 헤더/구분선/행을 하드코딩한다(`scripts/lib/catalog-gen.mjs:146-149`).
- 가드는 이 파일을 재생성해 byte-exact(정규화 후) 비교한다(`V1_REPRODUCE['component-catalog']`, `scripts/lib/check-generated-files.mjs:131-137`; `firstLineDiff`, `:148-157`).
- 골든 픽스처 `expected/component-catalog.md` 가 동결 기준(`run-metadata.json:5` `"expected": "expected/component-catalog.md"`).

### Options considered
- **(6a) 기존 4컬럼에 컬럼을 *추가*(append) — 행 형식 변경, 골든 갱신** — 시각적으로 깔끔. **그러나** 기존 골든 byte 가 전부 바뀐다(헤더·구분선·모든 행). 가드/골든을 동시에 갱신해야 함 → "v1 골든은 동결" 정신과 충돌, 한 PR 에 골든+가드+생성기 변경이 묶임.
- **(6b) 새 메타데이터를 *별도 섹션*(`## <NewSection>`)으로 추가, 기존 `## Components` 테이블은 byte-불변** — 기존 골든의 `## Components` 부분은 그대로, 파일 끝에 새 섹션이 append 됨. 기존 행 byte 불변 → 회귀 추적 쉬움. 단 파일 전체 골든은 여전히 갱신(append 분).
- **(6c) 새 메타데이터를 *별도 산출물 파일*(예: `component-catalog.meta.md`/`.yaml`)로** — 기존 `component-catalog.md` 완전 불변. 새 매니페스트 엔트리 + 새 골든 + 새 가드 등록 필요(가드 표면 2배).

### Recommendation — **(6b): phase2-1 의 새 메타데이터는 *새 섹션*(또는 별도 산출물)으로만 도입하고, 기존 4컬럼 `## Components` 테이블은 byte-불변으로 둔다.** 기존 테이블에 컬럼을 직접 append 하는 (6a) 는 기존 모든 행 byte 를 바꿔(`expected/component-catalog.md:7-11`) 골든을 깬다 → **phase2-1 에서 금지.** 기존 4컬럼 테이블의 스키마 변경(컬럼 추가/이름변경)이 필요하면 그것은 phase2-1 이 아니라 **별도의 명시적 re-baseline PR**(새 골든 동반 + 사람 승인)에서만 다룬다. 별도 산출물 (6c) 는 가드 표면을 2배로 늘리므로 멀티-tier(OD-4) 같은 명확히 분리된 경우로 한정.

근거: (6b) 는 기존 `## Components` 테이블 행 byte 를 보존하므로(`expected/component-catalog.md:7-11`), 골든 diff 가 **순수 append** 로 읽혀 리뷰·회귀 추적이 쉽다. 렌더러가 이미 섹션 단위로 `out.push` 한다(`scripts/lib/catalog-gen.mjs:144-150`)므로 새 섹션 추가는 기존 렌더 경로를 건드리지 않는 additive 변경이다. **핵심 불변식:** 어떤 phase2 변경도 (i) 무타임스탬프, (ii) 결정적 정렬, (iii) prettier 미사용(`scripts/lib/catalog-gen.mjs:13`)을 유지해야 하며, 새 섹션/컬럼은 **새 골든 픽스처와 함께** 단계적으로만 들어온다.

### 6.4 Markdown-extension vs JSON/YAML intermediate representation
**Decision:** phase2 메타데이터를 Markdown 확장으로 낼지, JSON/YAML 중간표현(IR)으로 낼지.

- **(IR-a) Markdown 확장 유지** — 매니페스트 `path` 가 `.md`(`catalog/artifact-manifest.yaml:178`)이므로 같은 컨테이너. 사람이 읽는 design 산출물 성격 유지.
- **(IR-b) JSON/YAML 중간표현 추가** — 머신 소비/diff 친화. nav-graph 가 `--json` 으로 동일 모델을 stdout 으로 내는 선례(`scripts/catalog-gen.mjs:39-42` 도 이미 `--json` 지원). 단 **on-disk 산출물**을 YAML 로 바꾸면 매니페스트 `path` 와 어긋남.
- **권고:** **on-disk 정본은 Markdown 유지(IR-a)** — 매니페스트 `path` 강제(`catalog/artifact-manifest.yaml:178`). 머신 소비가 필요하면 **이미 존재하는 `--json` 플래그**(`scripts/catalog-gen.mjs:39-42`)를 재사용하되 그것은 stdout 일 뿐 on-disk 골든이 아니다 → 가드 표면 불변. 별도 `.yaml` on-disk 산출물은 (6c) 처럼 가드 표면을 늘리므로 멀티-tier/별도 제안에서만 고려. → **OD 로 남길 필요 없음(v1 의 `--json` 으로 충분), 단 새 on-disk IR 도입은 OD-5(별도 제안)에 흡수.**

---

## 7. warning-first 전략 (any new check)

**Decision:** phase2 가 도입하는 어떤 새 검사(예: 배럴 reconcile diagnostic §3.4, lifecycle status §3.5)도 강제(hard-fail) 이전에 경고-우선이어야 한다.

### 관측된 ground truth
- kit 의 확립된 원칙: 가드 설계 문서가 "warning-first by default … blocking only under explicit `--enforce`"(generated-file-guard-design.md:15)와 "no diff gate before the first real generator"(generated-file-guard-design.md:92, followup §3.4 인용)를 못박았다.
- 생성기 입력 검증은 **fail-closed**: catalog-gen 은 `--src` 가 디렉토리가 아니면 빈 카탈로그로 덮어쓰는 사일런트 손실 대신 exit 2 로 끊는다(`scripts/catalog-gen.mjs:23-33`).

### Options considered
- **(7a) 새 진단을 처음부터 hard-fail** — 즉시 강제. false-positive 율 미관측 상태에서 게이트를 켜면 회귀 위험.
- **(7b) 새 진단을 warning-first(stderr 경고, exit 0), 별도 future-PR 에서 관측 후 `--enforce` 승격** — kit 원칙과 정합. fail-closed 는 **malformed/ambiguous 입력**(예: `--src` 부재)에만 적용.

### Recommendation — **(7b): 모든 새 phase2 검사는 warning-first.** 단 **malformed/ambiguous 입력은 fail-closed**(v1 의 `--src` 비디렉토리 → exit 2 선례, `scripts/catalog-gen.mjs:23-33`). 진단의 hard-gate 승격은 false-positive 율을 관측한 뒤 별도 결정 PR 에서만.

근거: warning-first 는 kit 의 명문 원칙이다(generated-file-guard-design.md:15). 동시에 입력이 *모호/오류* 일 때는 fail-closed 가 v1 에 이미 구현돼 있다(`scripts/catalog-gen.mjs:27-33`) — 경고-우선과 fail-closed 는 모순이 아니라 "정상 출력 차이는 경고, 입력 자체가 깨지면 즉시 중단"으로 역할이 다르다. 새 진단을 처음부터 게이트로 켜는 (7a)는 readiness/green 을 "done"으로 오인하게 만들 위험이 있어 배제한다.

---

## 8. generated region vs manual-notes region 분리 (source-contract §5 / OD-1)

**Decision:** props 등 수동 보강을 보존해야 할 때, 생성 영역과 수동 영역을 어떻게 분리하는가.

### 관측된 ground truth
- v1 산출물은 **순수 생성 영역**만 가진다(헤더 + 단일 `## Components` 테이블, `scripts/lib/catalog-gen.mjs:136-152`) — 동일 파일 안에 수동 영역 없음.
- source-contract §5 는 in-file `GENERATED:START/END` 블록을 **별도 제안**으로 미뤘고(component-catalog-generation-source-contract.md:162,165), whole-file generated 를 권고했다(`:165`). 가드는 manifest-path 단위 whole-file 재생성-비교다(`scripts/lib/check-generated-files.mjs:131-137`) → in-file 부분 블록은 가드 부분-비교 로직을 요구.

### Options considered
- **(8a) 같은 파일에 in-file `GENERATED:START catalog / END` 블록 + 수동 영역 공존** — 한 파일에 props 같은 수동 보강 가능. **그러나** 가드가 whole-file 비교라 부분-블록 비교 로직 추가 = 가드 재설계(NG-6 위반 위험). source-contract 가 이미 "별도 제안으로 분리"하라고 명시(component-catalog-generation-source-contract.md:162).
- **(8b) whole-file generated 유지 + 수동 보강은 *별도 파일*(예: `component-catalog.notes.md`)** — 파일 경계로 생성/수동을 분리 → 가드 표면 깨끗(생성 파일만 재생성-비교). props 보존은 별도 파일이 떠안음.
- **(8c) 수동 보강 자체를 포기(생성만)** — 가장 단순. props 등 수동 정보는 후속 docgen generator 가 복원할 때까지 소실(아카이브 노트로 보존).

### Recommendation — **(8b): generated 영역과 manual-notes 영역을 *파일 경계*로 분리한다.** in-file 블록(8a)은 **별도 제안**으로 미룬다(source-contract §5 와 동일 입장). props 가 phase2-2 docgen 으로 복원되기 전까지의 수동 보강은 별도 파일이 보존.

근거: 파일 경계 분리는 가드의 whole-file 재생성-비교(`scripts/lib/check-generated-files.mjs:131-137`)를 그대로 두고 false-positive 를 원천 차단한다. in-file 블록은 부분-비교 로직(가드 재설계)을 부르므로 source-contract 가 이미 별도 제안으로 분리했다(component-catalog-generation-source-contract.md:162). 별도 파일을 가드 대상으로 등록할지는 그 파일이 생성물이 되는 시점(docgen)의 별도 결정 → **OD-1(phase2).**

---

## 9. 가드가 phase2 메타데이터를 *언제* 강제 대상에 넣는가 (data-driven 졸업)

**Decision:** 새 phase2 출력/검사가 가드 강제 대상이 되는 정확한 조건. **가드 재설계 없음(NG-6); 전부 future PR.**

### 관측된 ground truth
- component-catalog 는 **이미** 가드 selected + reproduce 대상이다: allowlist(`V1_ARTIFACT_IDS`, `scripts/lib/check-generated-files.mjs:29`) + 4-clause AND(`generated∧active∧do_not_edit∧allowlist`, `:43,48-76`) + reproduce 계약(`V1_REPRODUCE['component-catalog']`, `:131-137`)을 모두 만족(`catalog/artifact-manifest.yaml:175-183`). 즉 **v1 출력은 이미 byte-exact 강제 중.**
- 가드는 manifest-path 단위 whole-file 비교라(`committedPathFor`, `scripts/lib/check-generated-files.mjs:143-145`), **같은 `path` 의 출력 내용이 바뀌면 자동으로 새 내용을 강제** 한다 — 새 컬럼/섹션은 골든만 갱신하면 별도 가드 코드 없이 강제됨.

### Options considered
- **(9a) phase2 출력 변경을 골든 갱신과 동시에 강제** — 출력이 바뀌는 순간 가드가 새 byte 를 강제. 단 골든 픽스처와 생성기 변경이 한 PR 에 묶임.
- **(9b) phase2 출력을 먼저 안정화(두-run 결정성·골든 byte-exact 입증) 후에만 골든 갱신/강제** — v1 이 밟은 정확한 선례(생성기 먼저 → 골든으로 안정성 입증 → 매니페스트 active → 가드 등록).
- **(9c) 새 *별도 산출물*(6c/멀티-tier)이면 새 allowlist 등록 필요** — `V1_ARTIFACT_IDS` 에 새 id 추가 + `V1_REPRODUCE` 계약 등록(`scripts/lib/check-generated-files.mjs:29,113-137`)이 유일한 코드 등록 사항.

### Recommendation — **(9b): 데이터-드리븐, 안정화 후 강제.** phase2 가 *기존 `component-catalog.md` 의 내용*을 바꾸는 경우(같은 path), 가드는 **새 코드 없이** 자동으로 새 골든을 강제하므로, 출력이 **두-run 결정성 + byte-exact** 를 입증한 뒤에만 골든을 갱신한다. phase2 가 *새 산출물*을 내는 경우(6c/OD-4), `V1_ARTIFACT_IDS` + `V1_REPRODUCE` 등록이 별도 future-PR 의 유일한 코드 변경.

근거: component-catalog 가 이미 가드에 등록돼 있으므로(`scripts/lib/check-generated-files.mjs:29,131-137`), 같은 path 출력 변경은 **자동 강제** 된다 — 따라서 "출력을 먼저 안정화"가 절대적이다. 비결정 출력은 매 실행 `CG:content` false-fail(가드가 timestamp 정규화 안 함, `:9,148-149`). 이는 v1 자신이 골든으로 결정성을 먼저 입증한 뒤 active/등록된 선례와 동일하다. **새 검사(진단)의 게이트 승격은 §7 warning-first → 관측 → `--enforce` 별도 PR.**

---

## 10. Open decisions (phase2)

각 항목은 **왜 열려 있는지 / 무엇을 막는지**. **이 설계 PR 을 막는 것은 없다** — 전부 generator/migration future-PR 시점에 사람이 닫는다. 선례: v1 도 OD-6/OD-7 을 출시로 닫았고(§1), nav-graph 도 스키마를 Open Decision 으로 두고 generator 를 먼저 ship 한 뒤 닫고 등록했다. **LLM 은 아래 어느 것도 스스로 confirmed/resolved 로 승격하지 않는다.**

- **OD-1 — phase2-1 정적 필드의 채택·우선순위:** §3 후보(3a default-export 수집, 3b import 컬럼, 3c 자매파일 presence, 3d 배럴 reconcile diagnostic, 3e lifecycle status) 중 무엇을 어느 슬라이스에 넣는가, 그리고 import alias(`@/`) 규약 출처·자매파일 검증 픽스처 부재를 어떻게 메우는가. **막는 것:** phase2-1 의 첫 additive 출력/골든 픽스처 내용. **설계 PR 은 안 막음.**
- **OD-2 — props/docgen 추출 기법(phase2-2):** regex(4a) vs TS AST/docgen 의존(4b). 의존 도입은 무의존 계약(`scripts/lib/util.mjs:2`) 변경이므로 *그 자체로 별도 결정 PR*. **막는 것:** phase2-2 generator 구현 방식 + `package.json` 의존 여부. **설계 PR 은 안 막음(본 PR 은 의존 추가 0).**
- **OD-3 — `status` lifecycle 신호 출처:** `deprecated`/`experimental` 를 JSDoc 태그·명명 규약 중 무엇에서 읽는가(현재 트리 0건이라 미검증). **막는 것:** status 필드 값 집합 확장.
- **OD-4 — memo/forwardRef 래퍼 포함 + `src/features/**` tier:** (i) 래퍼를 컴포넌트로 포함하고 export_kind(`memo`/`forwardRef`)만 표기할지 display-name 까지 해소할지(§4.4), (ii) 도메인 컴포넌트를 별도 tier 카탈로그로 낼지(§5.3, 매니페스트 글롭 추가 동반). **막는 것:** 식별 규칙 확장 + 멀티-tier 산출물(매니페스트 migration).
- **OD-5 — NativeWind/style/variant/size 분석의 소재지(phase2-3 or 별도 제안):** 이 generator 가 확장으로 떠안을지 별도 산출물/제안으로 낼지(§5), 그리고 새 on-disk IR(YAML 등) 도입 여부(§6.4). 골든 트리에 스타일 신호 0건이라 지금 결정 근거 없음. **막는 것:** phase2-3 범위 + (도입 시) 새 매니페스트 엔트리/가드 등록.

---

## 11. Implementation slicing / next-PR candidates

**이 PR = 설계 only.** 이후는 전부 **future PR (마크됨):** 각 PR 은 직전 PR 의 결정성/골든이 통과한 뒤에만 진행 — 비결정 출력으로 가드를 깨지 않는다(generated-file-guard-design.md:92).

1. **(FUTURE) PR-2 — phase2-1 진단-우선(무의존):** §3.4 배럴 reconcile 을 **출력 비포함 stderr 진단(warning-first §7)** 으로 `scripts/lib/catalog-gen.mjs` 에 추가. 출력 포맷·골든 불변(가드 무위험). 골든 트리의 `index.ts` 배럴(`examples/.../index.ts:2-4`)이 검증 입력. (NG-1/NG-5: 본 PR 에선 안 함.)
2. **(FUTURE) PR-3 — phase2-1 첫 additive *섹션*:** OD-1 을 닫아 가장 검증 가능한 후보(3a default-export 수집 유력)를 §6(6b) **새 섹션**으로 도입(기존 4컬럼 `## Components` 테이블은 byte-불변) + **새 골든 픽스처**. 두-run 결정성·byte-exact 입증(§9). 무타임스탬프·plain sort 유지. (기존 테이블에 컬럼을 끼워넣는 것은 별도 re-baseline PR 사안이지 이 PR 아님 — §6.)
3. **(FUTURE) PR-4 — phase2-2 props/docgen:** OD-2 를 닫아 regex(4a) vs docgen 의존(4b) 결정. 의존 도입이면 **별도 의존-추가 결정 PR** 선행. props 보존은 §8(8b) 별도 파일 또는 docgen 복원.
4. **(FUTURE) PR-5 — phase2-2 region 분리/매니페스트:** §8(8b) 별도 manual-notes 파일을 도입한다면 그 파일의 가드 등록 여부(OD-1) + (멀티-tier OD-4 면) 매니페스트 `source` 글롭/새 엔트리 추가. (NG-4: 본 PR 에선 안 함.)
5. **(FUTURE) PR-6 — phase2-3 NativeWind/style 또는 별도 제안:** OD-5 를 닫아 소재지 결정. 별도 산출물이면 `V1_ARTIFACT_IDS`+`V1_REPRODUCE` 등록(`scripts/lib/check-generated-files.mjs:29,113-137`)이 유일한 가드 코드 변경. (NG-6: 본 PR 에선 안 함.)

---

## Appendix A — Observed ground truth (phase2 출발점)

### A.1 v1 출력 (정본 = 골든)
`examples/component-catalog/basic-ui/expected/component-catalog.md`:
- H1 `# GENERATED FILE — DO NOT EDIT`(em-dash, `:1`) — validate 검사 6 grep `/GENERATED FILE\s+—\s+DO NOT EDIT/` 호환.
- HTML-comment `<!-- Source: src/components/ui/** -->`(`:2`), `<!-- Command: node scripts/catalog-gen.mjs --src … -->`(`:3`) — Command 는 **동작하는 직접 node 호출**(존재하지 않는 npm alias 아님).
- 단일 `## Components`(`:5`) + 4컬럼 테이블 `| Name | Source Path | Export Kind | Status |`(`:7-8`), 컴포넌트 행 `Button`/`Card`/`Stack`(`:9-11`).
- 렌더러: `scripts/lib/catalog-gen.mjs:136-152`(섹션 단위 `out.push`, 명시적 `'\n'` join + 단일 trailing newline).

### A.2 식별 규칙 — 6 .tsx 중 3 포함 (왜 3개인가)
골든 입력 트리 `examples/component-catalog/basic-ui/src/components/ui/` 에는 6 .tsx + `index.ts` 가 있으나 expected 는 3개만 — `classifyComponentFile`(`scripts/lib/catalog-gen.mjs:68-105`)의 규칙 때문:
- **포함(3):** `Button.tsx`(plain `export function`, `:3`), `Card.tsx`(plain arrow const `export const Card = (props) =>`, `:3`), `Stack.tsx`(plain `export function`, `:3`).
- **제외(3 디코이 + 배럴):** `Badge.tsx`(`memo(BadgeImpl)` 래퍼 → `isWrappedConst` 제외, `:7`), `Field.tsx`(`forwardRef(...)` 래퍼 → 제외, `:4`), `Modal.tsx`(`export default function` → named 아니라 제외, `:2`), `index.ts`(non-Pascal basename 배럴 → 제외, `scripts/lib/catalog-gen.mjs:80`; `index.ts:1` 주석이 "barrel… 정본 아님, 제외" 명시).
- 즉 v1 규칙 = **경로(`/src/components/ui/`) ∩ PascalCase basename ∩ basename 에 `.` 없음 ∩ 동명 plain named export(함수/const) ∩ memo/forwardRef 래퍼 아님 ∩ default-export 아님**(`scripts/lib/catalog-gen.mjs:70-95`).

### A.3 매니페스트 (이미 active — 변경 없음)
`catalog/artifact-manifest.yaml:174-184`: `kind: generated`, `generated: true`, `scope: design`, `path: docs/frontend-workflow/design/component-catalog.md`, `command: npm run workflow:catalog`, `source: [src/components/ui/**]`, `do_not_edit: true`, `status: active`, `mvp: C`. 주석(`:171-173`)이 "생성기 구현 완료 + 출력 포맷 v1 freeze(골든)"를 확인.

### A.4 가드 (이미 등록 — 변경 없음)
`scripts/lib/check-generated-files.mjs`: allowlist `V1_ARTIFACT_IDS = ['component-catalog', 'nav-graph', 'route-tree']`(`:29`); 4-clause selected(`generated∧active∧do_not_edit∧allowlist`, `:43,48-76`); reproduce 계약 `V1_REPRODUCE['component-catalog']`(`script:'catalog-gen.mjs'`, `inputFlag:'--src'`, `resolveInput:({srcDir})=>path.join(srcDir,'components','ui')`, `committedSubdir:'design'`, `:131-137`); 정규화 `normalizeGeneratedViewText`(CRLF/backslash만, `:9,24`); 비교 `firstLineDiff`(같은 정규화, `:148-157`). → **component-catalog v1 출력은 이미 byte-exact 강제 중.**

### A.5 의존성/결정성 계약 (phase2 가 상속)
- 무의존: `scripts/lib/util.mjs:2`("Node 내장 + yaml 한 개만"); catalog-gen lib 는 `walkFiles`/`readFileSafe` 만(`scripts/lib/catalog-gen.mjs:17`).
- 결정성: 무타임스탬프(`:13,132`), `(source_path,name)` plain 비교 정렬(`:107-114,126`), posix 상대경로(`:27-29,101`), prettier 미사용(`:133,151`), `walkFiles` 가 `.sort()` + node_modules/dot skip(`scripts/lib/util.mjs:132,139`).
- fail-closed 입력 검증: `--src` 비디렉토리 → exit 2(`scripts/catalog-gen.mjs:27-33`).

### A.6 end-state intent vs as-shipped (divergence, 정직히 기록)
- impl §9 표는 catalog-gen 을 `src/components/ui/** (TS props)` + `react-docgen-typescript 또는 TS compiler API` 로 적었다(frontend-workflow-kit-implementation.md:333) — **end-state intent.** as-shipped v1 은 props 없이 출시(무의존, `scripts/lib/catalog-gen.mjs:12`). 본 phase2 는 **as-shipped 를 정본**으로 삼고 props/docgen 을 phase2-2/OD-2 로 둔다.
- source-contract §4 의 `## Name` 서브섹션 스케치(component-catalog-generation-source-contract.md:138)는 **superseded** — 출시본은 4컬럼 테이블(`expected/component-catalog.md:7`). 골든이 ground truth.

---

**End of design document.** No code, package scripts, CI changes, manifest/guard/fixture/generator edits are made by this task. 모든 phase2 메타데이터 추가·기법 결정·region 분리·가드 강제 확장은 **PROPOSED (future PR)** 이며, 채택되지 않은 후보는 candidate / Open Decision 으로 남는다.
