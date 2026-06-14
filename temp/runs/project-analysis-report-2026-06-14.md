# frontend-workflow-kit 종합 분석 보고서

> 작성일: 2026-06-14
> 방법: 멀티에이전트 워크플로우(29 에이전트 / 2.29M 토큰) — 심층 리딩 5 → 4렌즈 분석 → 웹 리서치 6 → 적대적 검증 14. 이후 **GPT Pro 외부 리뷰**(원격 GitHub 대조)로 재보정.
> 분석 기준 커밋: `620c865`(분석 시작) → 분석 중 main 이 `2776367`(#19 검사 8 강화)로 전진. 파서/템플릿 결함은 두 커밋에서 동일.
> ⚠ 신뢰도 표기 규약: **[실측]** = node 재현 또는 로컬 실행으로 확인 · **[코드대조]** = 정적 코드 읽기로 확인 · **[원격한계]** = 원격 대조로는 미확인(로컬에서 별도 확인).

---

## 0. 요약

2일 된 레포치고 **드물게 규율 있는 설계**(판정 단일출처, fail-closed, 멱등성, 3티어 스코프 분리)를 갖췄고 시장 차별점도 실재한다. 분석의 헤드라인은 셋:

| # | 헤드라인 | 성격 | 근거 |
|---|---|---|---|
| **A** | 게이트 무결성 전체가 **마크다운 표 파서 하나**(`lib/spec.mjs`)에 달려 있고, 거기에 **fail-OPEN(P1) + 신호오염(P2)** 결함 | 🔴 안전성 | [실측] node 재현 |
| **B** | "빌드 스펙"으로 지목된 설계 문서 4종이 **stale** — 핵심 게이트(decision_cap)는 README/roadmap/open-decisions 에만 있고 4종엔 없음 | 🟠 진입점 드리프트 | [코드대조] grep 0건 |
| **C** | 검증을 **레포 내 결정적 Node 스크립트**로 고정 — Spec Kit/Kiro/Tessl(전부 LLM 분석=비결정) 대비 진짜 차별점 | 🟢 강점 | 레포 근거 + 웹 |

> **본 브랜치(`fix/parser-gate-robustness`)에서 A(P1/P2)와 P5 를 수정·검증 완료.** §5 참조.

---

## 1. 방법론과 신뢰도 보정 (GPT Pro 리뷰 반영)

초기 보고서는 "13 confirmed / 1 partly / 0 refuted"로 표기했으나, 외부 리뷰가 두 가지를 지적했고 모두 수용한다:

1. **존재-확신과 심각도-확신을 분리하라.** 특히 **P2 는 버그는 confirmed 지만 "fail-OPEN" 영향도는 과장** — Open Decisions 에서는 밀린 행이 `malformed`로 분류돼 docs-only(fail-**closed**)로 떨어진다. 심각도 Critical→Medium, 영향 "fail-OPEN"→"파생 신호 오염"으로 정정.
2. **vantage 를 밝혀라.** 리뷰어의 원격 GitHub 대조로는 untracked 파일(P11/P17)을 볼 수 없어 "partly"로 hedge한 것이 정당하다. 로컬 `git status`로는 확인된다.

**순효과**: 실질 정정은 **P2 하나**(심각도·영향 하향). 0 refuted 는 양쪽 일치. 아래 표는 양쪽 vantage 를 합친 최종 판정이다.

| 발견 | 워크플로 머신검증 | GPT Pro(원격) | 로컬 실측 | 최종 |
|---|---|---|---|---|
| P1 표 병합 fail-OPEN | confirmed(node) | Confirmed/Critical | 코드 확인 | **Confirmed · Critical** |
| **P2 escaped pipe** | confirmed(node) | 🟡 Partly(심각도) | fail-closed 확인 | **버그 Confirmed · 심각도 Medium** ↓ |
| P10 register 템플릿 부재 | confirmed | 🟡 Partly(트리 미확인) | 전체 트리 확인 | **Confirmed** |
| P11 추적 위생 | — | 🟡 Partly(원격불가) | git status | **Confirmed(로컬)** |
| P17 dangling 참조 | — | 🟡 Partly(원격불가) | untracked 확정 | **Confirmed(로컬)** |
| P3/P4/P5/P6/P7/P8/P9/P12/P13/P14/P15/P16 | confirmed | Confirmed | — | **변동 없음** |

---

## 2. 프로젝트 이해

**무엇인가**: LLM 이 프론트엔드(React Native/Expo)를 **환각 없이** 진행하게 만드는 방법론+도구 킷. 사상은 *"LLM 이 추론하던 것을 파일로 고정한다"* — 상태/판정/검사를 결정적 `.mjs` 스크립트로 옮긴다.

**핵심 루프**: `Input → Reconciliation → Documents → State → Readiness → Work → Validate`. MVP-A 가 코드로 강제하는 구간은 **`Documents → State → Readiness → Validate`**.

**메커니즘의 심장**:
- `readiness_mode = min(fact_mode, decision_cap)` — 화면별로 "준비된 만큼만" 구현 모드 허용(`docs-only → … → production-ready` 7단).
- **게이트 해제는 사람 전용** — LLM 은 blocker 를 *올리기만*, 내리는 건 사람(raise-only 불변식).
- 12종 `validate`(CI exit 0/1) + diff 기반 경로 backstop + golden fixture 회귀.

**현재 단계**: MVP-A 코어 + MVP-B Phase 0 완료, #19 로 검사 8(API Candidates↔api-manifest↔zod 매칭) 강화. 규모: 기여자 2인 / 90+ 커밋(전부 2일 내).

---

## 3. 문제점

### 🔴 Critical

**P1. `parseTable`가 빈 줄로 구분된 두 표를 병합 → 게이트 fail-OPEN** · [실측]
`lib/spec.mjs` 의 `parseTable`은 표 시작 후 빈 줄을 종료로 안 봐서 "범례 표 → 빈 줄 → 진짜 Open Decisions 표"가 하나로 병합된다. 진짜 행의 `col(r,'ID')`가 범례 헤더 기준이라 전부 `undefined` → 빈 행으로 제거되어 **행 자체가 증발**. `malformed`도 안 남고, `table`이 truthy 라 `(unparsable-decisions)` 안전망도 안 걸려 **readiness 가 천장을 안 내림(fail-OPEN)**. → **본 브랜치에서 수정 완료**(§5).

### 🟡 Medium

**P2. `splitRow`가 escaped pipe(`\|`)를 미처리 → 파생 신호 오염** · [실측] *(심각도 하향)*
`line.split('|')`가 리터럴 파이프를 컬럼 구분자로 오인해 오른쪽 컬럼이 밀린다. **Open Decisions 에서는 밀린 행이 `malformed`→docs-only(fail-closed)** 라 게이트가 풀리진 않는다. 진짜 위험은 *안전망이 없는* **Copy Keys(`tbd` 오독)·State Matrix·Reconciliation Register**의 신호 오염. → **본 브랜치에서 수정 완료**(§5).

| # | 문제 | 위치 | 근거 |
|---|---|---|---|
| P6 | 손상 설정 파일에서 `readiness/validate` uncaught throw → "입력오류=exit 2" 계약 위반. `forbidden-paths`만 `loadYamlOrExit`로 막아둬 도구마다 exit code 비대칭 | `readiness.mjs`·`validate.mjs` ↔ `forbidden-paths.mjs:66` | [실측] |
| P7 | `computeReadiness`가 `policy.modes` 누락 시 `Object.keys(undefined)` TypeError | `readiness.mjs:202` | [실측] |
| P8 | 7-모드 사다리: 산문 7개 vs 기계가독 블록 5개(`docs-only`·`screen-skeleton` 누락) | `skillpack-concept.md:447` | [코드대조] |
| P9 | `schema` enum 9종 vs `manifest` 7종 → `api-manifest`·`component-guidelines` 검사 2 스킵 | `frontmatter.schema.json:16` | [코드대조] |
| P10 | 검사 12(8컬럼 register)에 대응하는 템플릿 부재 → 작성자가 예제에서 역설계 | `templates/` | [실측] |
| P11 | `.claude/worktrees/`·`mvp-current.html`·`temp/_impl-ref/`·`myers_extract.txt` 등이 untracked 인데 .gitignore 미커버 | git status | [실측·로컬] |
| P12 | `validate.mjs:2`가 "검사 12종 (impl §8)"로 검사 9~12 를 거짓 귀속(실제 출처 open-decisions/input-reconciliation) | `validate.mjs:2` | [코드대조] |

### 🟢 Low

- **P3/P4. 설계 문서 드리프트** *(프레이밍 정정)*: 핵심 게이트(`decision_cap`/Open Decisions)는 **실제로 문서화돼 있다 — README·roadmap-current·open-decisions 가 최신 정본.** 문제는 좁게: **`IMPLEMENTING.md`가 "빌드 스펙"으로 가리키는 4종 설계 문서가 stale** 이라 그 진입점을 따른 신규 세션이 최신 정본을 못 본다. 템플릿(screen-spec)은 오히려 4종보다 앞서 Open Decisions·Copy Keys 3-state 를 갖고 있다. · [코드대조]
- **P5. input-artifact 템플릿** frontmatter 가 선행 주석 뒤(24행)라 `splitFrontmatter` 미인식 → 검사 11 오탐 실패. → **본 브랜치에서 수정 완료**(§5). · [실측]
- **P13** `interactionResultRoutes` 정규식이 후행 구두점·쿼리·외부 URL 과포착 → 검사 4 오탐 · [실측]
- **P14** `readiness --screen` 값 없이 오면 boolean true → 에러 없이 빈 결과 · [실측]
- **P15** `package.json` `0.1.0-mvp-a` ↔ CHANGELOG 정본 `0.2.0-mvp-b-rc1` 모순 · [코드대조]
- **P16** 골든 README `tbd_count=3` ↔ 머신 기대값 `1` 드리프트 · [실측]
- **P17** tracked 주석이 untracked `example-compare.mjs` 참조(dangling) · [실측·로컬]

---

## 4. 개선해야 할 점

1. **온보딩 진입점 단일화** — `IMPLEMENTING §0`(stale 4종)과 `README 문서지도`(최신 정본)가 다른 set 을 가리킨다. 진입점 1개 못박고 4종은 "설계 배경(historical)"으로 강등.
2. **산문 중복 제거** — 충돌정책·방어선 3층·단일출처 4원칙이 4개 문서에 복제(skillpack §6 은 "expanded 7장과 동일"이라 자인). canonical 1곳 + 링크. (웹 리서치 1순위 비판: "리뷰할 마크다운만 양산")
3. **코드↔문서 동기화를 CI 로** — "스크립트 3개"(실제 6+)·"검사 8종"(실제 12)·버전·tbd_count 등 카운트 드리프트 반복. 코드에서 생성하거나 CI 동기검사.
4. **강제 경계 비대칭 보완** — 신뢰도 낮은 앞단(Input·Reconciliation)을 비우고 뒷단만 지킴(garbage-in). 검사 더 늘리기보다 "입력→ScreenSpec 반영 무결성" 기계검사 1개의 한계 이득이 큼.
5. **추적 위생** — `.claude/worktrees/`를 .gitignore 에 추가, 이중 `temp//archive/` 통합.

---

## 5. 본 브랜치에서 적용·검증한 수정 (P1·P2·P5)

브랜치 `fix/parser-gate-robustness`, 워크트리에서 작업 후 main 머지.

**코드 변경**:
- `lib/spec.mjs`:
  - `parseTables`(신규) — 빈 줄/비-표 라인이 표 블록을 종료(P1 병합 차단). `parseTable`은 `parseTables[0]`로 하위호환.
  - `splitRow`(escape-aware) — escaped pipe 를 보호 후 리터럴 복원(P2).
  - `parseOpenDecisions` — `pickTableBySignature(['ID','Status','Blocking Mode'])`로 진짜 게이트 표를 시그니처로 선택. 못 찾으면 `sectionHasContent=true`로 **fail-closed**(범례 표가 앞서 와도 안전).
- `templates/input/input-artifact.template.md` — frontmatter 를 1행으로, 설명 주석은 그 뒤 + 재발 방지 경고(P5).
- `scripts/lib/spec.test.mjs`(신규) — P1/P2 회귀 단위 테스트(node:test, 의존성 0).
- `package.json`·CI yml — `test:spec` 배선(CI 하드 게이트로 추가).

**검증 증거**:
```
test:spec            → 5/5 pass (P1 보존 · P1 fail-closed · P2 비오염 · 정상 회귀)
example:state + diff → _meta 변경 0 (멱등성 보존 — 골든 출력 불변)
example:validate     → 검사 12종 통과 (OK)
npm test (하니스)     → 21 fixtures: 20 pass / 1 의도된 xfail / 0 fail
P5 splitFrontmatter  → hasFrontmatter=true · required 9필드 인식
```

**미수정(후속)**: P6/P7(설정 로드 통일·TypeError) · P8/P9/P10/P12/P15/P16(문서-코드 정합) · P13/P14(파서 오탐). 우선순위는 §7.

---

## 6. 시장 위치 & 웹 조사 (GPT Pro 리뷰로 단정 하향)

**✅ 확실(레포 자체 근거)**: 검증을 **레포 내 결정적 Node 스크립트**로 고정 — 이 한 줄만으로 충분한 차별 서사. byte-identical 멱등 실측.

**✅ 확인됨(웹)**: Spec Kit `/speckit.analyze`는 cross-artifact 일관성 검사 명령이 맞음 → **"그들도 분석은 하되 LLM 기반(비결정), 이 킷은 결정적 스크립트"**가 가장 안전한 비교축.

**차별점 후보(외부 검증 권장)**:
- **staged readiness-mode 사다리** — Martin Fowler 가 "SDD 도구가 못 푼 워크플로 사이즈 유연성 공백"으로 지목한 것을 정면 겨냥. BMAD `check-implementation-readiness`·Factory.ai Agent Readiness 와 유사 선례.
- **raise-only(단방향) 게이트 불변식** — HITL "pre-action approval"의 코딩판. audit-friendly 각도(EU AI Act/SB-833) positioning 가능.

**⚠ 출처 보강 전 발표 금지**: **Tessl·BMAD·Factory.ai·ResearchLoop·Kiro** 1:1 단정 — 워크플로 리서치 에이전트 일부가 confidence=undefined/malformed 출력. 공식 문서·릴리스·논문 재확인 필요 → **task 3 딥리서치로 진행 중**.

**⚠ 외부 위험(이미 증상)**: SDD 1순위 실패모드 "마크다운 스펙이 코드와 드리프트" = 본 보고서 P3 증상. 산문 중복(§4-2)은 "리뷰할 마크다운만 양산" 함정.

---

## 7. 권장 우선순위

| 순위 | 액션 | 상태 |
|---|---|---|
| 1 | **P1+P2 파서 + P5 템플릿** + 회귀 테스트 | ✅ **본 브랜치 완료** |
| 2 | **P3/P4 진입점**: 4종에 `superseded` 헤더 + IMPLEMENTING §0 를 roadmap 으로 | 후속 |
| 3 | P6·P7 설정 로드 견고화(`loadYamlOrExit` util 통일 + TypeError) | 후속 |
| 4 | P9·P10·P12·P15·P16 문서-코드 정합 | 후속 |
| 5 | §6 "Prior art & 차별점" 매핑 + 적정 범위 문서화 (task 3 결과 반영) | 진행 중 |
| 6 | §4-2 산문 중복 통합, P11 추적위생 | 후속 |

---

## 부록: 초기 보고서 대비 변경 (GPT Pro 리뷰 반영)

- **P2**: Critical → Medium, "게이트 fail-OPEN" → "파생 신호 오염"(OD 는 fail-closed). 리뷰 정확.
- **P3/P4**: "정본 문서 전체에 없음" → "stale 4종 진입점"(게이트는 README/roadmap/open-decisions 에 실재).
- **§6**: Tessl/BMAD/Factory/ResearchLoop 단정 → "출처 보강 필요" 플래그.
- **신뢰도**: 0 refuted 유지, 실측/코드대조/원격한계 라벨 도입. P10/P11/P17 은 로컬 vantage 로 confirmed 보완.
