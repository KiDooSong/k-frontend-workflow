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

## 6. 시장 위치 & 웹 조사 (딥리서치 검증 완료)

> 딥리서치 109 에이전트 / 26 소스 / 118 주장 추출 → 25 검증(**20 confirmed, 5 killed**). 아래는 **1차 출처로 확증된 것만** 단정하고, 미검증/반증은 §6-d 에 분리한다.

**핵심 결론**: 차별점 ①(결정적 게이트 판정)은 **외부 검증된 진짜 빈자리(white space)**. ②(readiness 사다리)·③(raise-only 게이트)는 **검증된 패턴의 규율 있는 종합** — 발명이 아니다.

### 6-a. 1차 출처로 확증 (high)
- **GitHub Spec Kit `/speckit.analyze` = LLM 에이전트**(결정적 스크립트 아님). 명령 템플릿이 문자 그대로 `You are a Claude agent …` 프롬프트로 시작하고, 유일한 스크립트는 파일 탐색(JSON 출력)만. 일관성·커버리지·constitution 정렬을 전부 LLM 이 판정.
- **Spec Kit 결정성 = 열망뿐**: "Rerunning … should produce consistent IDs"는 모델 지시일 뿐 temperature=0/seed/hash 강제 없음. 유지보수자(Den Delimarsky, MS): 같은 프롬프트가 *"완전히 다른 결과를 낼 수 있다."*
- **`constitution.md` = 프롬프트 강제**(기계 게이트 아님): "non-negotiable" 자연어 지시, 충돌=자동 CRITICAL, 그러나 read-only 리포트라 기계적 차단은 없다.
- **Tessl = spec-as-source**: `@generate` 디렉티브로 코드 생성 + `// GENERATED FROM` 마커. **결정성 보장 없음**, "vibe-specs" 판매, Fowler 가 같은 스펙에서 다른 코드 재현.
- **Factory.ai Agent Readiness = LLM 기반**: Droid(`/readiness-report`)로 60+ 기준 평가, **벤더가 비결정성을 자인**(grounding 으로 분산 7%→0.6%, **결코 0% 아님**).

**→ 차별점 ① 외부 타당성 확정**: 조사한 모든 경쟁사가 판정을 LLM 으로 돌리고 기껏해야 통계적으로 일관성을 *근사*한다. **"완전 결정적·재현가능한 게이트 판정"은 실재하는 방어 가능한 빈자리.** Factory 의 `0.6% ≠ 0%` 가 가장 깨끗한 증거.

### 6-b. 비교표 (확증분만 단정, ⚠는 미검증)
| 도구 | 검증 방식 | 게이트 모델 | 스펙↔코드 바인딩 | FWK 차별 | 중복 |
|---|---|---|---|---|---|
| **Spec Kit** | LLM(에이전트 프롬프트) | soft/advisory · AI 해석 · read-only 리포트 | spec-first→anchored | 결정적 판정 + raise-only 단방향 게이트 | constitution 거버넌스 · 교차검증 의도 |
| **Tessl** | LLM(비결정 재생성) | 하드 가드레일+테스트 · 코드 전 사람 승인 | spec-as-source (DO-NOT-EDIT) | 사람-편집 코드 유지 + 결정적 게이트 | "에이전트 불신, 스펙이 계약" |
| **Factory.ai** | LLM(Droid)+일부 파일존재 신호 | 5단 성숙도 · grounding 통계 일관성(0.6% 잔여) | repo-readiness(스펙바인딩 아님) | 0% 분산 보증 + readiness 가 *구현*을 게이트 | staged-readiness 개념 |
| **AWS Kiro** | ⚠ 미검증 | ⚠ 미검증(post-hoc 승인 추정) | spec-first/task-anchored(추정) | — | spec→plan→code 단계 |
| **BMAD** | ⚠ 미검증 | ⚠ 미검증 | 미검증 | — | 에이전트 오케스트레이션·readiness(추정) |

### 6-c. positioning 권고
- **LEAD**: 차별점 ①(**결정적 Node 스크립트 판정, 동일입력→동일출력**)을 1순위 차별점으로. 증거 기반·방어 가능.
- ②·③은 **"검증된 패턴의 규율 있는 형식화"**로 표기 — 발명 아님(Spec Kit/Tessl 의 human-approval 체크포인트, Factory 5단 성숙도, Böckeler 의 spec-first/anchored/as-source 사다리가 선례).
- ③의 **진짜 신규 부분 = monotonic 불변식**(에이전트는 blocker 를 올리기만, 사람만 내림) — 어느 경쟁사에서도 관찰 안 됨. 단 **반례 부재**에 근거(긍정적 신규성 증명은 아님).
- ❌ 주장 금지: "FWK 가 staged readiness/HITL 승인을 발명". ✅ 주장 가능: **결정적 판정 + monotonic raise-only + readiness-게이트된 *구현*(리포팅 아님)의 결합은 (아마) 최초.**

### 6-d. 미검증·반증 — 발표 전 확인 필수
- **AWS Kiro**: 모든 Kiro 주장 1차 출처 부재로 refuted(0-3). 비교표 Kiro 칸은 잠정 → kiro.dev 직접 확인 필요.
- **BMAD `check-implementation-readiness`**: 살아남은 주장 0건 → 결정성 여부 **아무것도 단정 금지**.
- **Factory 정확한 "8 pillar/5 level/80%"**: 구조·임계 refuted → "5단계/60+기준/80%"만 느슨히 인용, 정확한 pillar 이름 미검증.
- **arXiv ResearchLoop "blocker conservation" · EU AI Act/SB-833 · "drift-in-hours" 논문**(RQ #7·#8): 살아남은 주장 0건 → 그 선례/반례 미검증. (SDD 드리프트 자체는 업계가 반복 지적하나 *정량* 근거는 미확보 — 본 보고서 P3 가 그 *질적* 증상.)
- **시간민감성**: Spec Kit=main 브랜치(커밋마다 변동), Tessl=closed beta(spec-as-source 는 열망), Factory 0.6%=6주 윈도우. provenance: 사다리 분류는 Böckeler/Thoughtworks-Fowler 귀속.

### 6-e. 주요 출처
- Spec Kit `analyze.md`(1차): `raw.githubusercontent.com/github/spec-kit/main/templates/commands/analyze.md`
- Tessl 런칭: `tessl.io/blog/tessl-launches-spec-driven-framework-and-registry`
- Factory Agent Readiness: `factory.ai/news/agent-readiness` · `docs.factory.ai/web/agent-readiness/overview`
- Fowler/Böckeler SDD 3 tools: `martinfowler.com/articles/exploring-gen-ai/sdd-3-tools.html`
- (전체 26 소스: 딥리서치 산출물 `w0mxuaxn3`)

---

## 7. 권장 우선순위

| 순위 | 액션 | 상태 |
|---|---|---|
| 1 | **P1+P2 파서 + P5 템플릿** + 회귀 테스트 | ✅ **본 브랜치 완료** |
| 2 | **P3/P4 진입점**: 4종에 `superseded` 헤더 + IMPLEMENTING §0 를 roadmap 으로 | 후속 |
| 3 | P6·P7 설정 로드 견고화(`loadYamlOrExit` util 통일 + TypeError) | 후속 |
| 4 | P9·P10·P12·P15·P16 문서-코드 정합 | 후속 |
| 5 | §6 Prior art 비교표 — 딥리서치 검증(20 confirmed). 차별점 ①=빈자리 확정, Kiro/BMAD 사양 미검증 분리 | ✅ 완료 |
| 6 | §4-2 산문 중복 통합, P11 추적위생 | 후속 |

---

## 부록: 초기 보고서 대비 변경 (GPT Pro 리뷰 반영)

- **P2**: Critical → Medium, "게이트 fail-OPEN" → "파생 신호 오염"(OD 는 fail-closed). 리뷰 정확.
- **P3/P4**: "정본 문서 전체에 없음" → "stale 4종 진입점"(게이트는 README/roadmap/open-decisions 에 실재).
- **§6**: Tessl/BMAD/Factory/ResearchLoop 단정 → "출처 보강 필요" 플래그.
- **신뢰도**: 0 refuted 유지, 실측/코드대조/원격한계 라벨 도입. P10/P11/P17 은 로컬 vantage 로 confirmed 보완.
