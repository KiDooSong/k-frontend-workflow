# Run report — component-catalog phase2-1 배럴 reconcile 진단 (001)

> Status: IMPLEMENTATION 완료. Date: 2026-06-16.
> PR target: `feat(mvp-c): add component-catalog phase2 static diagnostics`.
> Branch: `feat/mvp-c-catalog-phase2-1-diagnostics` (new, in worktree; `main` untouched).
> Worktree: `.claude/worktrees/mvp-c-catalog-phase2-1-diagnostics` (main checkout left on `main`, untouched).
> 구현 대상: design doc [`component-catalog-phase2.md`](../proposals/component-catalog-phase2.md) 의 **FUTURE PR-2** (§3.4 candidate 3d 배럴 reconcile · §7 warning-first · §11 PR-2).
> Task class: 출시·졸업된 v1 `component-catalog` 생성기 위에 **출력 비포함 정적 진단**을 additive 로 추가. v1 출력 포맷·골든·exit code·가드·매니페스트는 한 바이트도 바꾸지 않음.

이 보고서는 구현 PR 의 audit trail 이다. 무엇을 구현했는지, 무엇을 의도적으로 하지 않았는지(scope discipline), 검증 증거, 그리고 적대적 리뷰(adversarial review) 결과를 기록한다. 설계 근거의 본체는 design doc 에 있고, 본 문서는 그 PR-2 슬라이스의 구현·검증 기록이다.

---

## 0. Deliverable & worktree decision

- **새 브랜치 + 새 worktree, current branch 미접촉.** 새 worktree (`.claude/worktrees/mvp-c-catalog-phase2-1-diagnostics`, 레포 관례 `.claude/worktrees/<slug>` 준수) 에서 새 브랜치 `feat/mvp-c-catalog-phase2-1-diagnostics` 로 작업. `main` working tree 는 이 작업 동안 한 번도 체크아웃되지 않았다.
- **변경은 design doc §11 PR-2 의 정확한 슬라이스에 한정.** 배럴(`index.ts`|`index.tsx`)의 `export { X } from './X'` re-export 집합과 파일워크 카탈로그 컴포넌트 집합을 대조하는 **stderr 진단만** 추가. 출력 파일·골든은 byte-불변.
- **본 보고서 한 파일을 `temp/runs/` 허용 위치에 신규 작성.**

---

## 1. 구현한 것 (what was implemented)

phase2-1 의 첫 슬라이스 = **출력 비포함 배럴 reconcile 진단(warning-first)**. design §3.4 candidate **3d** 와 §7 warning-first 원칙을 그대로 구현했다.

| 구현 요소 | 내용 | 위치 |
|---|---|---|
| 배럴 re-export 파서 | `export { X } from './X'` 의 단순 PascalCase 이름만 regex 추출. 무의존·정적. | [`parseBarrelReexports`](../../../frontend-workflow-kit/scripts/lib/catalog-gen.mjs#L176-L213) |
| reconcile 분석 | 정본 ui 루트 직속 배럴(`index.ts`/`index.tsx`)을 찾아 re-export 집합 ↔ 카탈로그 컴포넌트 집합 대조. IO 수행. | [`analyzeBarrelReconcile`](../../../frontend-workflow-kit/scripts/lib/catalog-gen.mjs#L218-L260) |
| 경고 포맷터 | diff → stderr 경고 라인 배열. 불일치 없음/배럴 부재 → 빈 배열(무경고). | [`formatBarrelWarnings`](../../../frontend-workflow-kit/scripts/lib/catalog-gen.mjs#L263-L282) |
| CLI 진단 러너 | 진단 실행 후 경고가 있을 때만 stderr 로 write. 반환 diff 는 CLI 가 버림. | [`runBarrelReconcileDiagnostic`](../../../frontend-workflow-kit/scripts/lib/catalog-gen.mjs#L286-L291) |
| 호출 지점 | `buildCatalog` 와 `renderCatalog`/`writeFile` **사이**, 모든 성공 경로(`--json`/`--dry-run`/쓰기)에서 동일하게 실행. | [`catalog-gen.mjs:40`](../../../frontend-workflow-kit/scripts/catalog-gen.mjs#L40) |

**핵심 동작 규약:**
- **stderr 경고 only, warning-first.** 출력 파일 내용·exit code 는 절대 바꾸지 않는다.
- **양방향(two directions) 진단:**
  - `barrel-exports-not-in-catalog` — 배럴이 re-export 하나 카탈로그에 없는 이름 ([`missingFromCatalog`](../../../frontend-workflow-kit/scripts/lib/catalog-gen.mjs#L250)).
  - `catalog-not-in-barrel` — 카탈로그에 있으나 배럴이 re-export 하지 않는 이름 ([`missingFromBarrel`](../../../frontend-workflow-kit/scripts/lib/catalog-gen.mjs#L251)).
  - 두 방향이 각각 별도 메시지로 surface 됨 ([lib:270-275](../../../frontend-workflow-kit/scripts/lib/catalog-gen.mjs#L270-L275)).
- **별칭/star/type-only/외부 = unsupported-or-ignored, false hard-fail 없음:**
  - `export { A as B }` 별칭 → `unsupported++` ([lib:193-196](../../../frontend-workflow-kit/scripts/lib/catalog-gen.mjs#L193-L196)).
  - 상대 `export *`/`export * as N` → `unsupported++` ([lib:209](../../../frontend-workflow-kit/scripts/lib/catalog-gen.mjs#L209)).
  - `export type { … }` / 인라인 `type X` specifier → skip/continue ([lib:188,197,208](../../../frontend-workflow-kit/scripts/lib/catalog-gen.mjs#L188-L208)).
  - 외부 패키지(상대경로 아님) re-export → 비교 대상에서 제외 ([lib:189,209](../../../frontend-workflow-kit/scripts/lib/catalog-gen.mjs#L189)).
  - 이 중 어느 것도 throw 하지 않고 exit code 를 건드리지 않는다. unsupported 는 경고 말미의 caveat 텍스트로만 표면화된다 ([lib:276-280](../../../frontend-workflow-kit/scripts/lib/catalog-gen.mjs#L276-L280)).

---

## 2. Scope discipline (의도적으로 하지 않은 것)

design §0.4 의 Non-goals 와 §3/§6/§7 의 경계를 그대로 지켰다. 아래는 **이번 PR 이 명시적으로 하지 않은** 것들이다.

| 비목표 | 상태 | 근거 |
|---|---|---|
| 출력 파일 내용 변경 | ✅ 불변 | 진단은 stderr 전용. `renderCatalog` 미접촉. |
| `## Components` 4컬럼 테이블 byte 변경 | ✅ byte-identical | 렌더러([lib:136-152](../../../frontend-workflow-kit/scripts/lib/catalog-gen.mjs#L136-L152))는 여전히 동일한 4컬럼 테이블. |
| `expected/component-catalog.md` 골든 변경 | ✅ 불변 | git diff 에 없음. |
| 새 컬럼/섹션/매니페스트 엔트리/생성물 | ✅ 없음 | 새 파일·컬럼·섹션·`artifact-manifest.yaml` 엔트리 0개. |
| 새 의존성 | ✅ 없음 | `yaml ^2.5.0` 그대로. lib 는 `node:path` + 기존 util 헬퍼만. |
| AST/docgen/tsc | ✅ 없음 | 순수 regex/문자열 파싱 + `walkFiles`. TypeScript 컴파일러/docgen 미참조. |
| props/default/memo/forwardRef/style 분석(신규 코드) | ✅ 없음 | 신규 함수는 배럴 re-export 이름 추출 + 이름 집합 diff 만. |
| exit code 변경 | ✅ 불변 | warning-first; 진단은 exit code 미접촉. |

phase2-1 의 **첫 additive 섹션/컬럼(PR-3)** 은 여전히 future work 이며, 이번 PR 은 design §3 Recommendation 의 **(opt-c) diagnostic-first** 만 구현했다.

---

## 3. Changed files

| Path | 상태 | 역할 |
|---|---|---|
| [`scripts/lib/catalog-gen.mjs`](../../../frontend-workflow-kit/scripts/lib/catalog-gen.mjs) | modified | phase2-1 블록 추가(`parseBarrelReexports`/`analyzeBarrelReconcile`/`formatBarrelWarnings`/`runBarrelReconcileDiagnostic`). v1 builder/renderer 는 미접촉. |
| [`scripts/catalog-gen.mjs`](../../../frontend-workflow-kit/scripts/catalog-gen.mjs) | modified | import 에 `runBarrelReconcileDiagnostic` 추가, `main()` 호출 지점([:40](../../../frontend-workflow-kit/scripts/catalog-gen.mjs#L40)) 1줄 추가. 기존 입력 검증/쓰기 경로 불변. |
| [`package.json`](../../../frontend-workflow-kit/package.json) | modified | `test:spec`·`test` 스크립트에 `scripts/lib/catalog-gen.test.mjs` 1개 추가(test wiring). 의존성 추가 없음. |
| [`scripts/lib/catalog-gen.test.mjs`](../../../frontend-workflow-kit/scripts/lib/catalog-gen.test.mjs) | **NEW** | 단위 테스트(node:test, 무의존): 정상-일치 무경고 + 양방향 불일치 + 별칭/star/type/외부 무시 규칙 고정 + basic-ui 픽스처 정합성. |
| [`temp/runs/component-catalog-phase2-1-diagnostics-001.md`](component-catalog-phase2-1-diagnostics-001.md) | **NEW** | 본 보고서. |

---

## 4. Verification evidence

아래는 **실제 실행 결과**다(overclaim 없음).

### 4.1 테스트

| 검사 | 결과 |
|---|---|
| `npm test` → `node --test` | **pass 57 / fail 0** (구현 직후 54 → Codex 리뷰 fix 의 회귀 테스트 3건 추가 후 57; cancelled 0, skipped 0, todo 0) |
| test-fixtures 하니스 | **PASS** — 27 fixtures: 26 pass, 1 xfail, 0 xpass, 0 xdrift, 0 fail |
| `component-catalog:basic-ui` 골든 | **[PASS]** — `GV:content` match |
| `npm test` overall exit | **0** |

### 4.2 진단 동작 + scope 불변 증거

| 검증 항목 | 결과 |
|---|---|
| byte-identical golden | true |
| clean 픽스처 stderr 에 배럴 경고 없음 | true |
| 의도적 mismatch 픽스처가 경고 발화 | true (at exit 0 = true, 출력 파일 clean = true) |
| golden git diff 변화 없음 | true |
| manifest + guard 불변 | true |

### 4.3 git 상태

- changed tracked files:
  - `frontend-workflow-kit/package.json`
  - `frontend-workflow-kit/scripts/catalog-gen.mjs`
  - `frontend-workflow-kit/scripts/lib/catalog-gen.mjs`
- new untracked:
  - `frontend-workflow-kit/scripts/lib/catalog-gen.test.mjs`

3개 tracked 변경 + 1개 신규 테스트 파일 = design §11 PR-2 의 정확한 변경 표면. 골든/매니페스트/가드/픽스처 입력 트리 어느 것도 tracked diff 에 없다.

---

## 5. Adversarial review outcome

**Verdict: PASS.** 아래 10개 제약을 적대적으로 감사했고, 전부 충족(MET)했다.

| # | 제약 | 결과 |
|---|---|---|
| **C1** | OUTPUT UNCHANGED | MET — `runBarrelReconcileDiagnostic` 은 주입된 stderr 스트림에만 write. `main()` 에서 `buildCatalog` 와 `renderCatalog`/`writeFile` 사이([catalog-gen.mjs:40](../../../frontend-workflow-kit/scripts/catalog-gen.mjs#L40))에서 호출되며 `renderCatalog`([lib:136-152](../../../frontend-workflow-kit/scripts/lib/catalog-gen.mjs#L136-L152), 여전히 동일 4컬럼) 또는 `buildCatalog` 내부엔 절대 들어가지 않음. 반환 diff 는 버려진다. |
| **C2** | EXIT CODE UNCHANGED | MET — 신규 lib 함수에 `process.exit`/`throw` 없음. `readFileSafe` 는 `\|\| ''` 가드([lib:245](../../../frontend-workflow-kit/scripts/lib/catalog-gen.mjs#L245))라 read 실패가 throw 못 함. 유일한 exit(기존 `--src` 비디렉토리 exit 2, [catalog-gen.mjs:27-33](../../../frontend-workflow-kit/scripts/catalog-gen.mjs#L27-L33))는 미접촉. |
| **C3** | WARNING-FIRST | MET — `formatBarrelWarnings` 는 양쪽 missing 이 비면([lib:265](../../../frontend-workflow-kit/scripts/lib/catalog-gen.mjs#L265)), `!barrelFound`([lib:264](../../../frontend-workflow-kit/scripts/lib/catalog-gen.mjs#L264))이면 `[]` 반환. `analyzeBarrelReconcile` 은 배럴 부재 시 `barrelFound:false` + 빈 리스트([lib:231-240](../../../frontend-workflow-kit/scripts/lib/catalog-gen.mjs#L231-L240)). CLI 는 `lines.length` 일 때만 write([lib:289](../../../frontend-workflow-kit/scripts/lib/catalog-gen.mjs#L289)). |
| **C4** | NO NEW ARTIFACT/COLUMN/SECTION | MET — 진단은 stderr only. `renderCatalog` 불변. 새 파일/컬럼/섹션/매니페스트 엔트리 0개. `package.json` 변경은 test 파일 append 뿐. |
| **C5** | NO NEW DEPENDENCY | MET — lib 는 `node:path` + 기존 util(`walkFiles`/`readFileSafe`) + module-local `UI_MARKER`/`PASCAL_RE`/`SCAN_EXTS`/`toPosix` 만. CLI 는 기존 import 에 함수 1개 추가. `yaml ^2.5.0` 불변. |
| **C6** | NO AST/DOCGEN/TSC | MET — 순수 regex/문자열 파싱(`NAMED_RE`/`STAR_RE`/split/trim) + `walkFiles`. TS 컴파일러/docgen API 미참조. |
| **C7** | NO PROPS/MEMO/FORWARDREF/STYLE BY NEW CODE | MET — 신규 함수는 배럴 re-export 이름 추출 + 이름 집합 diff 만. memo/forwardRef 판정은 기존 `isWrappedConst`/`classifyComponentFile`(buildCatalog 경로)에만 존재. |
| **C8** | ALIAS/STAR/TYPE NO HARD-FAIL | MET — `as` 별칭 → `unsupported++`([lib:193-196](../../../frontend-workflow-kit/scripts/lib/catalog-gen.mjs#L193-L196)), 상대 star → `unsupported++`([lib:209](../../../frontend-workflow-kit/scripts/lib/catalog-gen.mjs#L209)), type-only named/star → continue/skip([lib:188,197,208](../../../frontend-workflow-kit/scripts/lib/catalog-gen.mjs#L188-L208)). 어느 것도 throw/exit 미접촉. |
| **C9** | TWO DIRECTIONS | MET — `missingFromCatalog` = 배럴 re-export 중 카탈로그 부재([lib:250](../../../frontend-workflow-kit/scripts/lib/catalog-gen.mjs#L250)), `missingFromBarrel` = 카탈로그 중 배럴 미-re-export([lib:251](../../../frontend-workflow-kit/scripts/lib/catalog-gen.mjs#L251)). 각각 별도 메시지([lib:270-275](../../../frontend-workflow-kit/scripts/lib/catalog-gen.mjs#L270-L275)). |
| **C10** | DETERMINISM | MET — `barrelPaths`/`reexported`/`missingFromCatalog`/`missingFromBarrel` 전부 `.sort()`([lib:250-254](../../../frontend-workflow-kit/scripts/lib/catalog-gen.mjs#L250-L254)). `walkFiles` 는 정렬된 절대경로([util:139](../../../frontend-workflow-kit/scripts/lib/util.mjs#L139)). timestamp/random 없음. |

### 5.1 리뷰 노트 (정직히 기록 — 경험적 검증 포함)

- **Regex 함정 전부 경험적 검증(node one-off 하니스):** `export function X`/`export const X` 선언은 `NAMED_RE` 에 안 걸린다 — `export\s+` 뒤에 엔진이 `(type\s+)?\{` 를 요구하는데 선언은 `{` 가 아니라 식별자라 매칭 진입 자체가 안 됨.
- **`[^}]*` over-run 불가:** `export function f(){ return {a:1}; }` 같은 줄은 `function` 토큰에서 거부되어 `[^}]*` 에 도달조차 못 함. 첫 `}` 가 진짜 named export 절도 경계로 닫는다.
- **주석 줄 올바르게 스킵:** `^[ \t]*export` 앵커(/m)가 `// export …`, `/* export … */`, JSDoc ` * export …` 를 거부(`*`/`/` 접두는 space/tab 아님). 검증됨.
- **멀티라인 `export {\n A,\n } from '…'` 매칭됨**(절 캡처가 개행 포함). `export {A}\n from '…'`(from 이 다음 줄)도 `\s*from` 으로 매칭 — 둘 다 유효 TS, 올바르게 파싱.
- **외부(비상대) 모듈은 비교에서 제외:** NAMED 는 `!mod.startsWith('.')` continue([lib:189](../../../frontend-workflow-kit/scripts/lib/catalog-gen.mjs#L189)), STAR 는 `if (mod.startsWith('.'))` 게이트가 `unsupported++` 앞에 있음([lib:209](../../../frontend-workflow-kit/scripts/lib/catalog-gen.mjs#L209)). `@scope/pkg` re-export 는 무시.
- **`\bas\b` 별칭 검출은 word boundary 사용** — `Cards`/`Atlas`/`Canvas` 처럼 substring 으로 'as' 를 품은 이름은 오탐되지 않음. 경험적 확인.
- **(non-blocking) 중복 walk:** `analyzeBarrelReconcile` 이 `buildCatalog` 와 독립적으로 `walkFiles(root)` 재실행([lib:220](../../../frontend-workflow-kit/scripts/lib/catalog-gen.mjs#L220) vs [lib:120](../../../frontend-workflow-kit/scripts/lib/catalog-gen.mjs#L120)). 정확하지만 디렉토리 스캔이 2회. 이미 walk 한 파일 리스트를 받게 하면 더블 IO 회피 가능 — 순수 효율 nit, 제약 영향 없음.
- **`unsupported` 는 raw 카운터(dedup 안 함):** 같은 이름을 두 번 별칭하면 2 로 셈. 이는 caveat 텍스트('N unsupported re-export form(s)')에만 영향, 이름/exit/출력엔 무영향 — unsupported-as-caveat 설계상 수용 가능.
- **`NAMED_RE`/`STAR_RE` 는 함수-로컬 const** 라 `parseBarrelReexports` 호출마다 재생성됨 → /g `lastIndex` 가 호출 간 누수 안 됨.
- **픽스처 self-consistency 확인:** `basic-ui/src/components/ui` 의 Badge(memo)/Field(forwardRef)/Modal(default export)은 v1 규칙으로 제외되어 카탈로그 `{Button,Card,Stack}` 가 남고, 이는 배럴의 3개 re-export 와 정확히 일치 — 테스트의 exact `missingFrom* == []` assertion 이 우연 통과가 아니라 건전함.

### 5.2 Codex 리뷰 루프 (커밋 후 외부 리뷰 → 해소까지 반복)

| 라운드 | 대상 | 결과 |
|---|---|---|
| 1 (초기) | `9b96671` | **MAJOR 0 / blocking 0.** MINOR 3건 — 전부 stderr 진단 정확도(출력·exit·골든 무영향): (M1) 공백 없는 `export{…}` 미매칭, (M2) 절 안 인라인 블록 주석 미제거, (M3) 블록 주석 처리된 `export {…}` 오인식. |
| fix | `26f0124` | `stripBlockComments`(블록 주석 → 동일 줄 수 공백, `^` 앵커·줄구조 보존) 선행 + `NAMED_RE`/`STAR_RE` 의 `export\s+`→`export\s*`. 라인 주석(`//`)은 `^export` 앵커가 이미 배제하므로 미접촉(모듈 경로 `//` 훼손 방지). 회귀 테스트 3건 추가. |
| 2 (재리뷰) | `26f0124` | **M1/M2/M3 전부 RESOLVED, 신규 이슈 0건 → CLEAN TO MERGE.** `export\s*` 완화가 `export function`/`export const`/`exports`/`export default` 를 named re-export 로 오인하지 않음(`{`/`*` 선행 필수) 확인. 출력·exit·골든·결정성 불변 재확인. |

비차단 nit(중복 `walkFiles` 스캔, `unsupported` raw 카운터)는 Codex 미지적·제약 무영향이라 backlog 로 둔다(§5.1).

---

## 6. Next

이번 PR 은 design **OD-1** 의 일부(배럴 reconcile diagnostic)를 닫는다. 첫 **additive 섹션/컬럼(PR-3)** 은 여전히 future work 이며, **새 골든 픽스처 뒤에서** 두-run 결정성·byte-exact 를 입증한 뒤에만 진행한다(design §6/§9/§11 PR-3). 기존 4컬럼 `## Components` 테이블에 컬럼을 끼워넣는 것은 phase2-1 이 아니라 별도 re-baseline PR 사안으로 남는다.
