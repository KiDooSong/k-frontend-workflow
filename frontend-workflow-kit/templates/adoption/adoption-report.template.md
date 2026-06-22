# Adoption Probe Report — {PROJECT_NAME}

<!--
  artifact 종류가 아니다(새 산출물 축 아님). 이 문서는 docs/frontend-workflow 게이트 트리 **밖**
  (temp/runs/adoption-probe-<id>/)에 산출되는 **읽기 전용 증거 + 초안**이다 — readiness/validate fact 가 되지 않는다.
  adoption-probe 스킬이 채운다. confirmed/OD/CI/소스/게이트 무엇도 바꾸지 않는다(scope = read-only scan, draft-only output).
  채우는 규칙: 모르면 추측하지 말고 "not observed" / "needs human" 로 남긴다. 근거 없는 칸은 비운다.
-->

> **Status: PROBE / READ-ONLY — {YYYY-MM-DD}.** 다층 brownfield 레포에 워크플로우 킷을 *도입하면
> 무엇이 보이고 무엇이 안 보이는지*를 **실제 실행으로** 관찰한 보고서다. 자동 도입이 아니다 —
> 스캔·매핑·관찰·초안까지만 하고 멈춘다.
> 킷 스냅샷: `{KIT_COMMIT}` · 프로브 출력: `temp/runs/adoption-probe-{PROBE_ID}/` · 대상 레포: `{REPO_REF}`

## 0. 한 줄 결론 + scope 배너

- **이 레포의 도입 가능성(요약):** {Axis 1 = 가능/부분/막힘 — 근거} · {Axis 2 = 표현 불가(Tier3 미구현)}.
- **이 보고서가 하는 것:** read-only scan · role→glob 초안 · 현재 킷이 보는/못 보는 것 관찰 · 임시 평탄화 매핑 제안.
- **이 보고서가 하지 *않는* 것(불변식):** 소스 수정 ✗ · CI 변경 ✗ · confirmed 승격 ✗ · Open Decision resolve ✗ ·
  hard gate 신설/상향 ✗ · "architecture complete" 판정 ✗. **통과 ≠ 완료, 프로브 green ≠ 빌드해도 됨.**

## 1. Scanned Environment (read-only)

| 항목 | 관찰값 | 근거(path) |
|---|---|---|
| 프레임워크 / 라우터 | {Expo + expo-router / …} | {package.json:line} |
| 패키지 매니저 / lockfile | {pnpm / …} | {lockfile} |
| 아키텍처 스타일 | {Clean Arch / MVVM / FSD / Repository+Service / ad-hoc} | {dir 구조 / arch 문서} |
| src 레이아웃 깊이 | {3계층 / N계층 — 관찰된 계층 수} | {tree} |
| 기존 lint / CI | {eslint.config.* · .gitlab-ci.yml / .github/…} | {path} |
| API 정의 위치 | {src/api · openapi.yaml / 없음} | {path} |
| Figma / 디자인 토큰 source | {제공됨 / 없음 — 소비 레포 소유} | {path / N/A} |
| testID 관행 | {일부 존재 / 없음} | {grep 근거 / N/A} |

## 2. Role Map (Axis 1) — 내장 7 role → 제안 glob

> 현재 킷이 흡수 가능한 유일한 축. `project-layout.yaml(draft)` 와 1:1 대응. confidence 는 confirmed(확정)|candidate(추정).

| 내장 role | 제안 glob | confidence | 근거(path) | 비고 |
|---|---|---|---|---|
| route_entry | {glob} | {confirmed/candidate} | {path} | |
| screen | {glob} | | | |
| domain_component | {glob} | | | |
| hook | {glob} | | | ⚠ 다층이면 ViewModel 평탄화 대상(§5) |
| ui_primitive | {glob} | | | ⚠ catalog-gen 하드코딩(§4 Warning) |
| api_client | {glob} | | | |
| api_schema | {glob} | | | |

## 3. Layer Probe (Axis 2) — 추가 계층 열거

> 이 레포에서 발견된 **3계층 밖의 계층**. 각 계층의 현재 킷 인식 상태 — **전부 ❌**(role/게이트/fact/lint 없음).
> 상세·평탄화 손실·Tier3 매핑은 동봉 `tier3-gap-report.md`.

| 발견된 계층 | 위치(path) | role? | mode 게이트? | readiness fact? | lint 인식? | → tier3-gap-report |
|---|---|:---:|:---:|:---:|:---:|---|
| {view-model} | {path} | ❌ | ❌ | ❌ | ❌ | §{n} |
| {use-case} | {path} | ❌ | ❌ | ❌ | ❌ | §{n} |
| {repository} | {path} | ❌ | ❌ | ❌ | ❌ | §{n} |
| {entity} | {path} | ❌ | ❌ | ❌ | ❌ | §{n} |
| {data-source} | {path} | ❌ | ❌ | ❌ | ❌ | §{n} |
| {mapper} | {path} | ❌ | ❌ | ❌ | ❌ | §{n} |

## 4. 현재 킷이 보는 것 / 못 보는 것 (multilayer)

> warning-first 가 기조지만, 아래 "못 봄(silent)" 항목은 **core 가 경고조차 못 내는** 사각지대다.
> 이 보고서의 핵심 역할 = 그 침묵을 *명시적 한 줄*로 드러내는 것.

| 영역 | 킷이 보나? | 신호 종류 | 근거 |
|---|---|---|---|
| screen→hook→api 3계층을 다른 폴더에 둔 변형(Axis 1) | ✅ 봄 | 게이트 작동 | readiness allowed_paths 렌더(dry-run ✅) |
| 추가 계층(repository/usecase/VM…) 존재(Axis 2) | ❌ 못 봄 | **silent**(경고 0) | 추가 role inert(F1) |
| 도메인+데이터 계층 통째 누락 vs 완비 | ❌ 구분 못 함 | **silent**(byte-동일 출력) | F3 — readiness 바이트 동일 |
| 데이터/도메인 계층 편집 경계 | ❌ 못 막음 | **silent**(허용도 금지도 아님) | F2 |
| 다층 구현의 건강성 | ❌ 못 봄 | **silent**(validate 초록=문서검사뿐) | F5 — validate 계층맹 |
| 비표준 ui 경로 | ⚠ 막음(엉뚱하게) | **silent**(catalog 0건) | F4 — §4 Warning |

> ⚠⚠ **catalog-gen `ui_primitive` 하드코딩 (MUST-READ Warning)** ⚠⚠
> catalog-gen 은 project-layout 을 읽지 않고 `/src/components/ui/` 리터럴만 본다(catalog-gen 기본 --src ·
> UI_MARKER). 이 레포의 ui 경로가 표준이 아니면 → **component-catalog 0건 → component_catalog_generated:false →
> rough-fixture-ui 진입 차단**. 즉 Axis 1 재바인딩만 해도 도입이 *조용히* 막힌다. 이 레포 상태: {표준/비표준 — 근거}.
> 닫는 선결: PR-0a(catalog-gen ui_primitive 소비). 그 전엔 catalog-gen 에 `--src {실제 ui 경로}` 수동 지정으로만 우회.

## 5. 임시 평탄화 매핑 (temporary — 아키텍처 양보, 권장 아님)

> Tier3 전까지 이 다층 레포를 *프로브/도입* 하려면 추가 계층을 기존 3계층 role 로 평탄화해야 한다.
> **이건 권장 아키텍처가 아니라, 현 게이트 천장에 맞추기 위한 임시 접기다.** 무엇을 잃는지는 tier3-gap-report.

| 소비 레포 계층 | 임시 매핑 | 영속? | 잃는 것 |
|---|---|---|---|
| ViewModel / Presenter | → **hook** role | ❌ 임시 | VM 고유 게이트 단계(상태 소유 경계) |
| screen / View | → **screen** role | ✅ 자연 | — |
| components | → **domain_component** role | ✅ 자연 | — |
| api schema | → **api_schema** role | ✅ 자연 | — |
| api client | → **api_client** role | ✅ 자연 | — |
| use-case / interactor | → (hook 내부로 흡수) | ❌ 임시 | **Tier3 blind spot** — 단계 게이트 없음 |
| repository (interface+impl) | → (hook 내부로 흡수) | ❌ 임시 | **Tier3 blind spot** — 의존성 역전 경계 |
| entity (도메인 모델) | → (매핑 없음 / src/** 자유배치) | ❌ 임시 | **Tier3 blind spot** — 완성도 fact 없음 |
| data-source | → (hook 내부로 흡수) | ❌ 임시 | **Tier3 blind spot** |
| mapper / DTO 변환 | → (hook 내부로 흡수) | ❌ 임시 | **Tier3 blind spot** |

## 6. 실행한 명령 (read-only) — 출력의 의미와 *의미하지 않는 것*

> 아래 4개 기존 명령을 **프로브 스크래치 디렉토리**에서 초안 layout 으로 실행해 *관찰*만 한다.
> 결과를 "architecture complete / 빌드 OK" 판정으로 쓰지 않는다(불변식).

| 명령 | 무엇을 관찰 | 이 출력이 의미하는 것 | 의미하지 *않는* 것 |
|---|---|---|---|
| `workflow:state` | 상태/인벤토리 집계 | 문서 파생값 계산됨 | 다층 구현이 맞음 ✗ |
| `readiness` | mode 상한·allowed/forbidden | 3계층 게이트가 보는 범위 | 추가 계층이 안전 ✗(F1/F3) |
| `validate` | 검사 12종(문서 일관성) | 문서 구조 OK | 계층 경계 건강 ✗(F5) |
| `catalog-gen` | ui 컴포넌트 카탈로그 | 표준 ui 경로면 생성 | 비표준이면 0건=차단(F4) |

관찰 기록(요약):
- `readiness_mode` = {값} · allowed 에 추가 계층 {0개 — 예상대로 inert}
- `catalog-gen` = {N건 / 0건 + 차단 — F4 발현 여부}
- `validate` = {OK 12종 / errors N}
- F3 확인(스크래치 복제에서만): 도메인+데이터 계층 제거 시 readiness {동일/변화} — {예상=동일}.

## 7. Known Blind Spots (이 레포 적용)

> 전체 표와 닫는 PR 매핑은 `adoption-probe-skill.md` §"known blind spots". 아래는 이 레포에서 *실제 발현*한 것만.

| # | 사각지대 | 이 레포 발현 | core 신호 | 닫는 선결/PR |
|---|---|---|---|---|
| B1 | catalog-gen ui_primitive 하드코딩(F4) | {발현/해당없음} | silent(catalog 0) | PR-0a |
| B2 | 추가 계층 inert(F1) | {계층 N개} | silent | Tier3 PR-A/C/D |
| B3 | 도메인+데이터 게이트 사각(F2) | {발현} | silent | Tier3 PR-D |
| B4 | 완비/누락 구분 불가(F3) | {확인됨} | silent(byte-동일) | Tier3 PR-C |
| B5 | validate 계층맹(F5) | {발현} | 초록=오신호 | Tier3 PR-E |
| B6 | forbidden-paths CI step 부재·warning-first | {해당} | warning-only(비차단) | (도입 후 OD) |
| B7 | pre-edit-mode-guard 훅 미존재 | 해당 | 1차 방어선 없음 | (별 작업) |
| B8 | doctor/preflight 미구현 — 선언 glob 존재검사 없음 | {해당} | silent(오설정) | PR-0c |

## 8. 산출 초안 목록 (draft-only)

| 산출물 | 경로 | 상태 |
|---|---|---|
| 이 리포트 | `temp/runs/adoption-probe-{PROBE_ID}/adoption-report.md` | draft |
| 레이아웃 초안 | `…/project-layout.draft.yaml` | draft(미배선) |
| Tier3 gap | `…/tier3-gap-report.md` | draft |
| visual-spec intake | `…/visual-spec-intake-note.md` | {작성/skip(소비 레포 미제공)} |
| testID intake | `…/testid-intake-note.md` | {작성/skip} |
| (선택) screen-spec STUB 목록 | `…/screen-spec-stubs.md` | candidate(생성 아님, 목록만) |

## 9. 사람에게 표면화 (결정 아님 — surface only)

> 프로브는 결정하지 않는다. 아래는 사람이 *볼* 항목이며 resolve/confirm 은 별도 절차.

- [ ] 도입 범위(어느 도메인/화면부터) — 사람 승인 후에야 `adapt`(scaffold) 단계로.
- [ ] Role Map confidence: candidate 인 {role} 경로 확정 필요.
- [ ] Axis 2 게이팅을 *원하는가* (수요) — OD-12 방향 입력용 telemetry.
- [ ] {비표준 ui 경로면} catalog-gen 우회 vs PR-0a 선대기.

## 10. 불변식 준수 체크

- [ ] 소스 0줄 수정 · [ ] CI 0 변경 · [ ] confirmed 승격 0 · [ ] OD resolve 0 · [ ] hard gate 0 ·
      [ ] 추가 계층을 게이트처럼 표현 안 함 · [ ] E2E/visual 을 게이트처럼 표현 안 함 ·
      [ ] 산출물 전부 프로브 디렉토리(게이트 트리 밖) · [ ] "프로브 green = 완료" 표현 안 함.
