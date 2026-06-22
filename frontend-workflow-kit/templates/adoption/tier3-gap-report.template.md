# Tier3 Gap Report — {PROJECT_NAME} (Axis 2 사각지대 상세)

<!--
  adoption-report.md §3(Layer Probe)의 상세본. adoption-probe 스킬이 채운다. read-only/draft-only.
  목적: 이 다층 레포의 각 추가 계층이 **현재 킷에서 왜 안 보이는지**, 임시 평탄화로 **무엇을 잃는지**,
        그리고 **Tier3 의 어느 PR 이 그 갭을 닫는지**를 한 곳에 모은다.
  게이트처럼 표현 금지 — Tier3 는 미구현(PROPOSED)이다. 추가 계층은 지금 "있어도 inert"(F1).
  근거: temp/runs/multilayer-adoption-dryrun/EXPERIMENT-REPORT.md (F1~F5) ·
        docs/design/drafts/customizable-architecture/tier3-layer-model.md ·
        temp/proposals/tier3-implementation-od-packet.md (PR-A~E, 선결 PR-0a/0b/0c).
-->

> **Status: PROBE / READ-ONLY — {YYYY-MM-DD}.** Tier3 는 아직 **구현 전**이다. 이 보고서는 "도입하면 어디가
> 비는가"를 추론이 아니라 관찰로 적는다. 어떤 항목도 게이트가 아니며, 닫는 PR 은 전부 PROPOSED(future).

## 1. 이 레포의 계층 ↔ Tier3 access 행렬 매핑

> 왼쪽 = 이 레포 실제 계층. 가운데 = Tier3 설계(`tier3-layer-model.md` §3)의 canonical role/access.
> 오른쪽 = **현재** 킷 상태. Tier3 가 랜딩하면 가운데가 활성화되지만, 지금은 전부 ❌.

| 이 레포 계층(path) | Tier3 role(설계) | Tier3 access(설계, PROPOSED) | 현재 role? | 현재 fact? | 현재 게이트? |
|---|---|---|:---:|:---:|:---:|
| {…/viewmodels} | view_model | allow: rough/final-fixture-ui | ❌ | ❌ | ❌ |
| {…/usecases} | use_case | allow: rough/final-fixture-ui | ❌ | ❌ | ❌ |
| {…/repositories(interface)} | repository | allow: final-fixture/api-integrated | ❌ | ❌ | ❌ |
| {…/repositories(impl)} | repository | (impl=같은 role 또는 별 role) | ❌ | ❌ | ❌ |
| {…/datasources} | data_source | allow: api-integrated-ui | ❌ | ❌ | ❌ |
| {…/mappers} | mapper | allow: api-integrated-ui | ❌ | ❌ | ❌ |
| {…/entities} | entity | (완성도 fact 후보) | ❌ | ❌ | ❌ |

## 2. dry-run F1~F5 의 이 레포 발현

> 합성 Clean-Arch 레포에서 실측된 깨짐(EXPERIMENT-REPORT)이 이 *실제* 레포에서도 같은 형태로 나타나는지 관찰.

| F | 깨짐 | 이 레포 관찰 | core 신호 |
|---|---|---|---|
| **F1** | 선언한 추가 계층 role 이 전부 inert(게이트/fact 0) | {발현 — readiness allowed/forbidden 에 추가 계층 0} | silent |
| **F2** | 도메인+데이터 계층이 "허용도 금지도 아님"(어느 모드도 안 막음) | {발현 — `{domain dir}`·`{data dir}` 가 allowed/forbidden 양쪽에 부재} | silent |
| **F3** | 완전 N계층 vs 도메인+데이터 통째 누락을 **구분 못 함** | {스크래치 복제 확인: 계층 제거 후 readiness 바이트 {동일/변화}} | silent(byte-동일) |
| **F4** | catalog-gen 이 project-layout 무시(UI_MARKER 하드코딩) | {ui 경로 표준?=… → catalog {N건/0건}} | silent(0건) |
| **F5** | validate 계층맹(12종 전부 문서 일관성) | {validate OK 지만 계층 경계 미검사} | 초록=오신호 |

### F3 확인 절차(이 레포, 비파괴)
- 소비 레포 소스를 **건드리지 않는다**. 스크래치 복제(`temp/runs/adoption-probe-{PROBE_ID}/scratch/`)에서만:
  `{domain dir}` + `{data dir}` 제거 → readiness 재실행 → 출력 diff.
- 예상: **diff 없음**(spec.mjs fact 집합에 `repository_present` 류가 없어 그 계층을 읽지 않음).
- 관찰 결과: {동일=blind spot 확인 / 차이 발견=보고}.

## 3. 임시 평탄화로 잃는 것 (계층별)

| 계층 | 임시 매핑(adoption-report §5) | 평탄화 시 사라지는 규율 | Tier3 가 복원하는 것 |
|---|---|---|---|
| view-model | hook role | View↔VM 상태소유 경계, VM 완성도 단계 | view_model_present fact + access 행 |
| use-case | hook 내부 흡수 | use-case→repository 단방향 의존성 | use_case access + lint DAG 노드 |
| repository | hook 내부 흡수 | 의존성 역전(interface↔impl) 경계 | repository access + lint allow 예외 |
| data-source | hook 내부 흡수 | "api-integrated 단계에서만 편집" 규율 | data_source access: api-integrated-ui |
| mapper | hook 내부 흡수 | DTO↔도메인 변환 경계 | mapper access 행 |
| entity | 매핑 없음 | 도메인 모델 완성도 | entity 완성도 fact(후속) |

## 4. 닫는 Tier3 PR (PROPOSED — 착수는 사람)

> 출처: `tier3-implementation-od-packet.md` §3 PR 슬라이스. **이 보고서는 PR 을 열지 않는다.**

| 갭 | 닫는 PR | 한 줄 | 비고 |
|---|---|---|---|
| 비표준 ui 경로 차단(F4) | **PR-0a**(선결) | catalog-gen `ui_primitive` 소비 | Axis 2 무관·먼저 가능 |
| 선언 glob 존재검사 없음 | **PR-0c**(선결) | doctor/preflight warning-only | 오설정 silent 닫기 |
| 추가 계층 fact 부재(F1/F3) | **PR-C** | `<role>_present` 일반 fact | spec.mjs 일반화 |
| 추가 계층 편집권 부재(F1/F2) | **PR-A→PR-D** | `layers:` 파서 → access 합성 배선 | byte-동치 2면 안전망 필요 |
| 계층 경계 lint 부재(F5 보완) | **PR-E** | layer DAG(import-경계 subset) | warning-first |

## 5. 경계 / 금지 재확인

- Tier3 미구현 — 추가 계층을 **게이트처럼 표현 금지**. "있으면 막힌다"가 아니라 "있어도 inert(F1)".
- E2E/visual 충실도를 게이트처럼 표현 금지(별 축·evidence).
- 이 보고서는 OD resolve·confirmed·hard gate·소스·CI 무엇도 바꾸지 않는다.
- 평탄화는 **임시 양보**일 뿐 권장 아키텍처가 아니다 — Tier3 telemetry 의 입력으로만 쓴다.
