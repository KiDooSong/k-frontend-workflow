# adoption-probe 스킬 — 계약 / 출력 템플릿 / dogfood 절차 (설계)

> Status: **DESIGN / PROPOSAL ONLY**. 2026-06-22. 이 문서는 **온보딩 probe 스킬의 계약·출력 포맷·dogfood
> 절차를 설계**한다. **스킬 코드 구현이 아니다** — `skills/`·`scripts/`·`policies/`·CI·정본 템플릿을 수정하지
> 않는다. 추가하는 것은 이 제안서 1개 + `templates/adoption/*` 초안 5개뿐(아래 §3).
>
> 불변식(이 문서·이 스킬이 절대 건드리지 않음): **소스 0줄 수정 · CI 0 변경 · confirmed 승격 0 · Open
> Decision resolve 0 · hard gate 신설/상향 0 · 추가 계층을 게이트처럼 표현 0 · E2E/visual 을 게이트처럼 표현 0.**
> warning-first 가 기조다. 단 **core 가 아직 경고조차 못 내는 사각지대**(F1~F5)는 probe report 가 *명시*해야 한다.
>
> 근거(이 세션에서 실독):
> - [EXPERIMENT-REPORT.md](../runs/multilayer-adoption-dryrun/EXPERIMENT-REPORT.md) — 다층 dry-run F1~F5(실측 깨짐)
> - [kit-multilayer-adoption-assessment-20260621.md](../reports/kit-multilayer-adoption-assessment-20260621.md) — Axis 1/2, 강제수준 매트릭스
> - [tier3-implementation-od-packet.md](./tier3-implementation-od-packet.md) — PR 슬라이스(선결 PR-0a/0b/0c · 코어 PR-A~E)
> - [tier3-layer-model.md](../../docs/design/drafts/customizable-architecture/tier3-layer-model.md) — mode×layer access 행렬(미구현)
> - [layout-profile.mjs](../../scripts/lib/layout-profile.mjs) — `mergeRoles`(Axis 1 재바인딩), `materializeGuardedSurface`
> - [expo-feature.yaml](../../presets/expo-feature.yaml) — 내장 7 role
> - [catalog-gen.mjs](../../scripts/catalog-gen.mjs) — UI_MARKER 하드코딩(F4/P1)
> - [figma-component-mapping.template.md](../../templates/screen/figma-component-mapping.template.md) — 시각 받아적기 계약
> - [design-token-naming-convention.md](../../docs/design/drafts/design-token-naming-convention.md) — VS-2, W1/W2
> - [testid-contract-canon-patch.md](./testid-contract-canon-patch.md) — testID = proposal, recommended-not-gate
> - 기존: [adoption-onboarding-walkthrough.md](./adoption-onboarding-walkthrough.md)(Phase A `adapt` 가정) ·
>   [adapt-lint-pack/SKILL.md](../../skills/adapt-lint-pack/SKILL.md)(scan→map→diff→rollout→propose 선례)

---

## 1. 이름 결정 — `adoption-probe`

**채택: `adoption-probe`.** (대안 `workflow-adopt-probe` 는 동의어로 허용하되 정본 이름은 전자.)

| 후보 | 판정 | 이유 |
|---|---|---|
| **`adoption-probe`** | ✅ **채택** | "probe" = 읽기 전용 *조사*. "도입을 *한다*"가 아니라 "도입하면 *어떻게 되는지 본다*". 자동화 함의 0 |
| `workflow-adopt-probe` | 🟡 alias | 의미 동일하나 "adopt"가 행위 동사라 약하게 "도입 실행" 함의. probe 가 그걸 중화하지만 더 긺 |
| `adapt` / `auto-adopt` / `migrate` / `onboard` | ❌ 제외 | "자동 도입/마이그레이션"으로 읽힘 — read-only/draft-only 계약과 정면 충돌 |

> **`adapt` / `adapt-lint-pack` 과의 경계(중복 회피):** `adoption-probe` 는 도입의 **읽기 전용 1차 패스**다 —
> scan·map·관찰·초안까지 하고 **멈춘다**. 어떤 스캐폴드도 *생성*하지 않는다. 기존 walkthrough 의 Phase A `adapt`
> (가정·미구현)는 probe 산출물을 받아 **사람 승인 후 비로소 스캐폴드를 생성**하는 *다음* 단계다. 즉:
>
> ```
> adoption-probe (이 설계)         adapt (미래, 별 스킬)
> scan→map→관찰→초안→STOP    →  [사람 승인]  →  스캐폴드 생성·벤더링·screen-spec STUB 작성
> read-only / draft-only                        (생성 행위 시작)
> ```
>
> probe 는 `adapt-lint-pack` 의 **제안 워크플로우 정신**(자동 마이그레이션 아님, 승인 전 생성기 미실행)을 전
> 킷 범위로 계승하되, lint 한정이 아니라 **다층 구조 가시성**에 초점을 둔다.

---

## 2. 스킬 범위 (scope)

### 2.1 한다 (read-only scan · draft-only output)
- **read-only scan**: 소비 레포의 프레임워크/라우터/패키지매니저/src 레이아웃/기존 lint·CI/API 위치/Figma·토큰
  source/testID 관행을 **읽기만** 한다. 판단마다 근거 `path` 기록.
- **role→glob 초안**(Axis 1): 기존 경로 → 내장 7 role 후보 매핑(confidence: confirmed|candidate).
- **layer probe**(Axis 2): 3계층 밖 계층 열거 + 현재 킷 인식 상태(전부 ❌) 기록.
- **임시 평탄화 매핑** 제안(아키텍처 양보로 명시).
- **기존 read-only 명령 관찰 실행**(§6): workflow-state/readiness/validate/catalog-gen 을 **프로브 스크래치
  디렉토리**에서 돌려 *출력을 관찰*만.
- **draft-only output**: 산출물 전부 `temp/runs/adoption-probe-<id>/` (게이트 트리 밖)에 draft 로만 쓴다.

### 2.2 안 한다 (불변식 — 위반 시 즉시 중단)
| 금지 | 이유 |
|---|---|
| 소스 수정(소비 레포 `src/**` 등) | read-only 계약 |
| `docs/frontend-workflow/**`(게이트 트리)에 산출물 쓰기 | draft 가 fact/게이트로 새지 않게 |
| 소비 레포 루트에 라이브 `project-layout.yaml` 배선 | 배선=사람 결정, 별 작업 |
| CI 파일 변경/추가 | OD-11(도입 후 연기) |
| confirmed 승격 · OD resolve · conflict close | 전부 사람 전용 게이트 |
| hard gate 신설/상향 · `continue-on-error` 제거 | warning-first 기조, telemetry 후 별 OD |
| 추가 계층을 "게이트/완성도"처럼 표현 | Tier3 미구현 — 있어도 inert(F1) |
| E2E/visual 충실도를 게이트처럼 표현 | evidence 지 gate 아님 |
| scaffold 생성 · 벤더링 · 생성기(`lint-gen`/codegen) 실행 | 그건 `adapt`(승인 후) 단계 |
| "architecture complete / 빌드 OK" 판정 | 통과 ≠ 완료 |

---

## 3. 출력 템플릿 (초안 — 이 세션에서 동봉)

> 위치: `templates/adoption/`. 렌더 결과(채워진 인스턴스)는 `temp/runs/adoption-probe-<id>/` 에 산출.
> **새 산출물 축이 아니다** — `artifact_type` 을 부여하지 않으며 게이트 트리 밖에 산다(readiness/validate fact 0).

| # | 템플릿 | 역할 | 작업 매핑 |
|---|---|---|---|
| 1 | [adoption-report.template.md](../../templates/adoption/adoption-report.template.md) | 최상위 probe 리포트(환경·role map·can/can't·평탄화·명령관찰·blind spots) | 작업 3·4·5·6 |
| 2 | [project-layout.template.yaml](../../templates/adoption/project-layout.template.yaml) | Axis 1 role→glob 초안 + Tier3 `layers:` 주석 미리보기(inert) | 작업 3·6 |
| 3 | [tier3-gap-report.template.md](../../templates/adoption/tier3-gap-report.template.md) | Axis 2 사각지대 상세(계층↔Tier3 매핑·F1~F5 발현·평탄화 손실·닫는 PR) | 작업 4·6 |
| 4 | [visual-spec-intake-note.template.md](../../templates/adoption/visual-spec-intake-note.template.md) | Figma facts/token/baseline **받아적기** 계약(수집기 구현 안 함) | 작업 7 |
| 5 | [testid-intake-note.template.md](../../templates/adoption/testid-intake-note.template.md) | testID = recommended, not gate | 작업 8 |

핵심 설계 결정:
- **`adoption-report` 의 §4 "보는 것/못 보는 것"** 표에 **`신호 종류` 컬럼**(✅봄 / ⚠엉뚱하게막음 / **silent**)을 둔다.
  warning-first 인데도 *경고조차 안 나는* 사각지대를 "silent"로 박아 침묵을 가시화한다(작업 4 핵심).
- **catalog-gen `ui_primitive` 하드코딩 경고**는 `adoption-report` 에 **별도 Warning 콜아웃 + blind-spots 표 행 B1**
  으로 **이중** 노출(작업 5: "반드시 넣어라"). `project-layout.template.yaml` 에도 ⚠ 주석으로 박음.

---

## 4. 다층 레포에서 보는 것 / 못 보는 것 (작업 4) — report 표기 설계

probe report §4 가 쓰는 표기 규칙. 핵심은 **"못 봄"을 세 종류로 가르는 것**:

| 표기 | 의미 | 예 |
|---|---|---|
| ✅ **봄** | 게이트가 정상 작동 | Axis 1(3계층 다른 폴더) |
| ⚠ **엉뚱하게 막음** | 보긴 보는데 잘못된 이유로 차단 | 비표준 ui → catalog 0 → 진입 차단(F4) |
| 🔇 **silent** | **경고도 fact 도 없이 그냥 못 봄** | 추가 계층 inert(F1) · 완비/누락 구분불가(F3) · validate 계층맹(F5) · 데이터/도메인 편집경계(F2) |

→ report 는 "silent" 행마다 **(a) 무엇을 못 보는지 (b) core 가 왜 침묵하는지(어느 fact/검사가 부재) (c) dry-run
어느 F 인지 (d) 닫는 PR** 4칸을 채운다. 이렇게 해야 "warning 이 없으니 괜찮다"는 오독을 막는다.

---

## 5. known blind spots (산출물 표)

> 이 표가 probe 의 정본 blind-spots 목록이다. report 인스턴스의 §7 은 이 중 *실제 발현*한 행만 추린다.
> "core 신호" 컬럼 = 그 사각지대에 대해 킷이 무엇을 내보내나(대부분 **silent**).

| # | 사각지대 | core 가 못 잡는 것 | core 신호 | 근거 | 닫는 선결/PR |
|---|---|---|:---:|---|---|
| **B1** | catalog-gen `ui_primitive` 하드코딩 | 비표준 ui 경로 → catalog 0건 → `component_catalog_generated:false` → rough-fixture-ui 진입 차단 | 🔇 silent(0건) | dry-run **F4** · [catalog-gen.mjs](../../scripts/catalog-gen.mjs) · 보고서 §2 #3 | **PR-0a**(ui_primitive 소비) |
| **B2** | 추가 계층 role 이 inert | 선언한 view_model/use_case/repository/… 가 allowed/forbidden 어디에도 안 나타남(이름표만) | 🔇 silent | dry-run **F1** · 보고서 §3.3 | Tier3 **PR-A→PR-D** |
| **B3** | 도메인+데이터 계층 게이트 사각 | `src/domain/**`·`src/data/.../{repositories,mappers}` 가 어느 모드의 allow/forbid 에도 없음 → 편집이 안 막힘 | 🔇 silent | dry-run **F2** | Tier3 **PR-D** |
| **B4** | 완비 vs 통째 누락 구분 불가 | 도메인+데이터 계층을 전부 지워도 readiness **바이트 동일** | 🔇 silent | dry-run **F3** · spec.mjs fact 에 `repository_present` 류 부재 | Tier3 **PR-C**(`<role>_present`) |
| **B5** | validate 계층맹 | 12종 전부 문서 일관성 — 데이터/도메인 계층 존재·경계 검사 0 | 🟡 초록=오신호 | dry-run **F5** | Tier3 **PR-E** + PR-C |
| **B6** | forbidden-paths 미강제 | 경로 backstop 이 warning-first 인데 **CI step 자체가 없음** | 🟡 warning-only(비차단) | 보고서 §1.2 · [forbidden-paths.mjs](../../scripts/forbidden-paths.mjs) | (도입 후 OD-11 계열) |
| **B7** | pre-edit-mode-guard 훅 부재 | "3층 방어선"의 1차(편집 직전 게이트)가 코드로 없음 → 실질 2층 | 🔇 silent | 보고서 §1.2(readiness.mjs:5 주석상 전제) | (별 작업) |
| **B8** | doctor/preflight 미구현 | 선언된 layer/role glob 이 실제 레포에 존재하는지 검사 없음 → 오설정 silent | 🔇 silent | tier3 §8 P3 | **PR-0c**(warning-only) |

> 갱신 규칙: dry-run 이 새 깨짐(F6…)을 추가하거나 선결/코어 PR 이 머지되면 이 표를 갱신한다. **닫힌 행은
> 지우지 말고 "closed by PR-XX (date)"로 표기**(telemetry 이력 보존).

---

## 6. 스킬이 실행하는 기존 명령 (작업 9) — 관찰용, 판정용 아님

probe 는 **새 스크립트를 만들지 않는다.** 기존 read-only 명령을 프로브 스크래치 디렉토리에서 돌려 *관찰*만 한다.

```bash
KIT=frontend-workflow-kit
RUN=$KIT/temp/runs/adoption-probe-<id>
# 초안 layout 으로(소비 레포 루트 미배선) — 산출은 RUN/ 아래로만
node $KIT/scripts/workflow-state.mjs --docs <REPO>/docs/frontend-workflow --src <REPO>/src --layout $RUN/project-layout.draft.yaml
node $KIT/scripts/readiness.mjs      --docs <REPO>/docs/frontend-workflow --layout $RUN/project-layout.draft.yaml --json
node $KIT/scripts/validate.mjs       --docs <REPO>/docs/frontend-workflow --src <REPO>/src --layout $RUN/project-layout.draft.yaml
node $KIT/scripts/catalog-gen.mjs    --src <REPO>/<실제 ui 경로> --out $RUN/component-catalog.observed.md   # F4 관찰
```
(npm alias: `workflow:state` · `workflow:readiness` · `workflow:validate` · `workflow:catalog` — [package.json](../../package.json))

**판정 금지 계약 (작업 9 핵심):**

| 명령 | 출력이 의미하는 것 | **의미하지 않는 것** |
|---|---|---|
| `workflow-state` | 문서 파생값 계산됨 | 다층 구현이 건강함 ✗ |
| `readiness` | 3계층 게이트가 보는 mode 상한 | 추가 계층이 안전/완비 ✗(F1/F3) · "여기까지 만들면 됨" ✗(상한일 뿐) |
| `validate` | 문서 구조 일관 | 계층 경계 건강 ✗(F5) · 제품적으로 맞음 ✗ |
| `catalog-gen` | 표준 ui 경로면 카탈로그 생성 | 비표준이면 0건=차단(F4) · ui 위치가 맞음 ✗ |

→ probe 는 이 출력을 **"architecture complete" 판정으로 절대 쓰지 않는다.** 4개 모두 *관찰 기록*으로만 report 에 적고,
"무엇이 silent 한가"를 §4·§7 로 환원한다.

---

## 7. 절차 (phases) — scan → map → layer-probe → flatten → observe → report

> `adapt-lint-pack` 의 scan→map→diff→rollout→propose 를 다층 가시성용으로 변주. **rollout(baseline 측정) 없음**
> (게이트 승격 안 함). 각 단계는 *제안/관찰만*, 승인 전 아무 것도 생성/덮어쓰지 않는다.

1. **Scan** (read-only): §2.1 항목 조사. 근거 path 기록. 소스/설정/CI **미수정**. → report §1.
2. **Map** (Axis 1): 기존 경로 → 내장 7 role 후보. 확정만 confirmed, 추정은 candidate. 절대경로·`..` escape 금지.
   → `project-layout.draft.yaml` + report §2.
3. **Layer-probe** (Axis 2): 3계층 밖 계층 열거. 각 계층 role/게이트/fact/lint = ❌ 명시. → report §3 + tier3-gap-report.
4. **Flatten** (임시): 추가 계층 → 기존 role 임시 매핑(VM→hook 등). **"아키텍처 양보·권장 아님" 박기.** → report §5.
5. **Observe** (§6): 4개 명령을 스크래치에서 실행, 출력 *관찰*. F4(catalog) · F3(스크래치 복제 비파괴 확인) 포함.
   판정 금지 계약 준수. → report §6.
6. **Report** (propose, draft-only): 5개 템플릿 채워 `temp/runs/adoption-probe-<id>/` 에 산출. blind spots(§5) ·
   can/can't(§4) · catalog-gen Warning(작업 5) · 사람 표면화 항목(결정 아님). **STOP** — 스캐폴드 생성 없음.

---

## 8. 첫 실제 다층 레포 dogfood 절차 (체크리스트)

> 목적: dry-run(EXPERIMENT-REPORT)은 **내가 합성한** Clean-Arch 였다 — "킷이 Axis 2 를 게이트 못 한다"(구조적
> 사실)는 증명했으나 "실제 팀이 그 게이팅을 *원하는가*"(수요)는 미검증(보고서 §정직한 한계). 이 dogfood 는
> **실제 brownfield 다층 레포**에서 probe 를 1회전 돌려 그 telemetry 를 얻는다. **전부 read-only/draft-only.**

**0. 사전 (사람)**
- [ ] 실제 다층 brownfield 레포 1개 선정(Clean Arch / MVVM / FSD 중 하나 — 합성 아님).
- [ ] 읽기 접근 확보. 킷 스냅샷 커밋 고정(`KIT_COMMIT` 기록).
- [ ] 출력 디렉토리 `temp/runs/adoption-probe-<id>/` 준비(게이트 트리 밖·비추적 가능).

**1. Scan / Map (probe)**
- [ ] read-only scan → report §1. **소스/CI 미수정 확인.**
- [ ] role→glob 초안 작성(Axis 1) → `project-layout.draft.yaml`. confidence 표기.

**2. catalog-gen F4 체크 (가장 먼저 — 도입 자체를 막는 선결)**
- [ ] 이 레포 ui 경로가 표준(`src/components/ui/**`)인가 확인.
- [ ] `catalog-gen --src <실제 ui 경로>` 관찰: {N건 / 0건}. 0건이거나 경로 비표준이면 **B1 발현** 기록 →
      readiness 가 보는 산출 경로와 어긋나는지까지 적는다. (우회=수동 --src, 정식 닫기=PR-0a.)

**3. 기존 명령 관찰 (스크래치)**
- [ ] workflow-state / readiness / validate 실행 → report §6. 판정 금지 계약 준수.
- [ ] readiness allowed/forbidden 에 추가 계층 **0개**임을 관찰(F1 발현).

**4. Layer-probe / Tier3 gap**
- [ ] 추가 계층 열거 → tier3-gap-report §1·§2. 각 계층 ❌ 4종 표기.
- [ ] **F3 비파괴 확인:** 스크래치 *복제본*에서만 도메인+데이터 계층 제거 → readiness diff. 예상=바이트 동일.
      **소비 레포 원본은 절대 안 건드림.**

**5. 시각/ testID intake (해당 시)**
- [ ] 소비 레포가 facts/token/baseline 제공? → visual-spec-intake-note 작성, 아니면 **skip(no-op)**.
- [ ] testID 관행 관찰 → testid-intake-note(recommended-not-gate). harness/CI 추가 0.

**6. Report 조립 + 사람 표면화**
- [ ] adoption-report 완성: can/can't(§4) · known blind spots(§7, 발현분) · catalog-gen Warning.
- [ ] 사람에게 **표면화만**: 도입 범위 / candidate 경로 확정 / "Axis 2 게이팅을 원하는가"(OD-12 수요 telemetry).

**7. 불변식·금지 최종 점검**
- [ ] 소스 0 · CI 0 · confirmed 0 · OD resolve 0 · hard gate 0 · 산출물 전부 게이트 트리 밖.
- [ ] 추가 계층/ E2E/visual 을 게이트처럼 표현 안 함. "프로브 green ≠ 빌드 OK" 명시.
- [ ] **telemetry 회수**: 무엇이 막혔나(B1?) · 무엇이 헷갈렸나 · 팀이 Axis 2 게이팅을 원하나 → OD-12/Tier3 입력.

> dogfood 산출물은 **OD-12 방향 결정의 증거**다(보고서 §4.2 #5: "도입 경로를 먼저 끝내 실제 다층 brownfield
> telemetry 를 확보하는 게 순서"). 단 이 dogfood 는 게이트를 *바꾸지 않는다* — telemetry 만 만든다.

---

## 9. 산출물 (이 세션)

- 이 제안서: `temp/proposals/adoption-probe-skill.md`.
- 템플릿 초안 5종: `templates/adoption/*.template.md|yaml`(§3).
- dogfood 체크리스트: §8. · known blind spots 표: §5.

## 10. 금지 재확인 (세션 준수)

- ❌ 실제 스킬 코드(`skills/adoption-probe/SKILL.md`·스크립트) 구현 — 이 세션은 *계약/템플릿/포맷 설계*만.
- ❌ 소비 레포 source 수정 · ❌ `docs/frontend-workflow/**` 게이트 트리에 산출 · ❌ CI 변경.
- ❌ Tier3 구현 전 추가 계층을 gate 처럼 표현(있어도 inert — F1).
- ❌ E2E/visual validation 을 gate 처럼 표현(evidence 축).
- ❌ confirmed 승격 · OD resolve · hard gate 신설/상향 · scaffold 생성.
- ❌ 기존 정본 템플릿(screen-spec/llm-rules/figma-mapping) 편집 — intake 노트는 *참조*만.

## Cross-links
- 선행 워크스루: [adoption-onboarding-walkthrough.md](./adoption-onboarding-walkthrough.md)(Phase A `adapt` = probe 의 *다음* 단계)
- 선례 스킬: [adapt-lint-pack/SKILL.md](../../skills/adapt-lint-pack/SKILL.md) · [implement-screen/SKILL.md](../../skills/implement-screen/SKILL.md)
- Tier3: [tier3-layer-model.md](../../docs/design/drafts/customizable-architecture/tier3-layer-model.md) · [tier3-implementation-od-packet.md](./tier3-implementation-od-packet.md)
- 실측: [EXPERIMENT-REPORT.md](../runs/multilayer-adoption-dryrun/EXPERIMENT-REPORT.md) · [kit-multilayer-adoption-assessment](../reports/kit-multilayer-adoption-assessment-20260621.md)
- intake 근거: [design-token-naming-convention.md](../../docs/design/drafts/design-token-naming-convention.md) · [testid-contract-canon-patch.md](./testid-contract-canon-patch.md)
