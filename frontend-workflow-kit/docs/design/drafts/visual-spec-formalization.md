# Visual Spec 정식화 — `figma-component-mapping` "화면별 시각 계약" 강화 제안

> Status: proposal / discussion draft. 2026-06-21.
> 목적: 외부/소비 레포가 수집한 시각 값을, 킷이 안전하게 "받아 적을" 표준 문서 계약을 정식화한다.
> 새 산출물 축을 만들지 않고 기존 `figma-component-mapping` 아티팩트를 강화하는 방향으로 프레이밍한다.
> 이 문서는 실행 게이트를 추가하지 않는다. warning-first 후보와 후속 Open Decision 만 제안하며,
> confirmed 승격·게이트 신설/상향은 모두 사람-승인 OD 로 미룬다.

---

## 0. 결론 요약

1. **PR69 가 이미 절반 이상을 해 놨다.** `frontend-workflow-kit/templates/screen/figma-component-mapping.template.draft.md`(PR69, 현재 `MERGEABLE`)는 `## Visual Spec`·`## Provenance`·`## Data Corrections`·`## Assets`·`## Gaps` 를 갖춘 "화면별 시각 계약" 드래프트다. **이 제안은 새 파일을 또 만들지 않는다** — PR69 드래프트를 (a) 검토하고, (b) 킷 원칙과 어긋나는 지점을 교정(delta)하고, (c) 정식 채택 경로(OD)를 정리한다.
2. **새 축이 아니라 기존 축 강화.** `visual-spec.md` 라는 별도 아티팩트를 신설하지 않는다. `artifact_type: figma-component-mapping` 을 그대로 두고 섹션만 늘린다 → 새 frontmatter status·새 readiness fact·새 게이트가 생기지 않는다(roadmap "새 산출물 축 추가 금지" 정합).
3. **`figma_mapping_status` 는 존재 신호로 유지한다.** 시각 값 충실도를 이 fact 로 게이트하지 않는다(§2.2). 충실도는 readiness 가 아니라 Verification 축 evidence(비주얼 회귀)로 다룬다.
4. **킷 core 는 시각 값을 수집하지 않는다.** MCP/REST 수집 책임은 도입 레포/소비 프로젝트에 있고, 리서치 04 의 채널 매핑은 *reference* 다. 킷은 "받아 적는 계약"만 제공한다(§2.3).
5. **교정 1순위 = 격리 충돌.** PR69 드래프트가 `temp/runs/figma-fidelity-001/extract-raw.mjs` 를 가리키는데, 그 경로는 PR70 이 `.gitignore` 로 전체 비추적 처리한 회사 런이라 public repo 에 없다(§3.1). public 템플릿은 placeholder 로 바꿔야 한다.

---

## 1. 현재 상태 (path 근거)

추측 없이 실제 파일/diff 로 확인한 상태다.

### 1.1 PR70 (merged) — 리서치 + 회사 런 격리

- `chore+docs(figma): 런 비추적(회사 디자인 보호) + figma-design 리서치 5장`.
- `.gitignore:30` — `temp/runs/figma-fidelity-001/` **전체 비추적**. 주석: "추출물(disign-file·implementation-facts·baseline·node.rest.json)·화면 스펙(카피)·앱코드·리포트(file_key) 포함. 일반 분석은 docs/research/ 에, 정식 템플릿은 별도로 추적."
- `.gitignore:25` — `figma-pat` 비추적.
- `docs/research/figma-design/` — `README` + `01`~`04`. 핵심 진단: 시각 축만 "선언→희망"이고 다른 축은 "고정→검사"(01), 누수 4단(02), 처방 3단(03), MCP/REST 2채널 수집·조합 레퍼런스 + `## Visual Spec` 프로토타입(04 §7).

> ★ PR70 이 못박은 두 가지가 이 제안의 제약이다: (1) `temp/runs/figma-fidelity-001/` 는 public 에 없다 → 템플릿이 그 경로를 가리키면 안 된다. (2) "정식 템플릿은 별도로 추적" → 이 정식화가 그 "별도 추적" 자리다.

### 1.2 PR69 (merged) — 시각 계약 드래프트 이미 존재

- `docs(maestro-dogfood): L010 ...` PR 에 포함된 파일 중 핵심: `frontend-workflow-kit/templates/screen/figma-component-mapping.template.draft.md` (+93).
- **이미 킷 templates 영역에 있다.** 세션 프롬프트가 우려한 "`temp/runs/figma-fidelity-001/` → templates/screen 이동"은 PR69 에서 사실상 끝나 있다(드래프트는 `templates/screen/` 에, `temp/...` 가 아님).
- 드래프트가 이미 가진 것: `## Frame`(file_key·node·baseline placeholder), `## 출처 범례(Provenance)`, `## Component Mapping`(4컬럼 유지), `## Visual Spec`(direction/gap/padding/align·justify/sizing/color/type 8컬럼), `## Data Corrections / Override Log`, `## Assets`, `## Gaps / Open`, `## Cross-links`. 값=토큰 ID, 토큰 없으면 `raw N`, Raw/Facts/Contract 3계층 모델.
- → 세션 2 의 "설계할 섹션 후보"·"Visual Spec 표 최소 필드"는 **대부분 이미 충족**. 남은 일은 *정합성 교정*과 *정식 채택 경로*다.

### 1.3 main 정본 템플릿 + `figma_mapping_status` 사용처

- 정본 `frontend-workflow-kit/templates/screen/figma-component-mapping.template.md` 는 (제안 시점) **4컬럼만**(`Figma Frame / Node | UI 요소 | 매핑 컴포넌트 | 비고`) + `## Notes`. 값 레벨 칸 없음(= 리서치 02 §B 의 근본 원인 "담을 칸 없음"). → **VS-1 적용(branch `docs/visual-spec-vs1-figma-mapping`) 후 옵션 섹션(`## Visual Spec` 등) 보유; 4컬럼 헤더는 불변 유지.**
- 정본 frontmatter 주석: "이 status 는 readiness 의 `figma_mapping_status` fact 가 된다 — final-fixture-ui 게이트가 `figma_mapping_status >= draft` 로 읽는다".
- `policies/implementation-mode-policy.yaml:73-76`:
  ```yaml
  final-fixture-ui:
    requires:
      - screen_spec_status >= confirmed
      - figma_mapping_status >= draft
  ```
  즉 이 fact 는 **문서가 draft 로 존재하는가**(라이프사이클/존재)만 본다. 값이 채워졌는지·코드와 일치하는지는 보지 않는다.

### 1.4 한 줄

> 이 제안 = **새로 만들기**가 아니라 **PR69 드래프트 정식화 + 킷 원칙과의 정합성 교정 + 채택 OD 정리**다.

---

## 2. 설계 결정 (검토 쟁점 1·2·3·5)

### 2.1 결정 A — 새 `visual-spec.md` 축이 아니라 기존 `figma-component-mapping` 강화 (쟁점 1·2)

**권고: PR69 처럼 기존 아티팩트에 섹션을 더한다. 별도 `visual-spec.md` 아티팩트를 신설하지 않는다.**

| 선택지 | 새 축 생기나 | 결과 |
|---|---|---|
| (A) `figma-component-mapping` 에 `## Visual Spec` 추가 (PR69) | **아니오** | artifact_type/ id/ status/ 게이트 그대로. 한 화면 → 한 시각 계약 |
| (B) 별도 `visual-spec.md` 신설 | **예** | 새 artifact_type → 새 frontmatter status → 새 readiness fact → 새 게이트 = roadmap "새 산출물 축 금지" 위반 + "어떻게 보이나"가 두 파일로 분산 |

쟁점 2("별도 파일이면 새 축 문제를 어떻게 피하나")의 답은 PR69 가 이미 택한 방식이다: **`.template.draft.md` 라는 자매 *드래프트* 파일**로 두되 `artifact_type` 을 바꾸지 않는다. 이건 "새 아티팩트"가 아니라 *기존 아티팩트의 포맷 진화*다. 판별 기준:

- `artifact_type: figma-component-mapping` 불변 → workflow-state/readiness 가 보는 fact 키 불변.
- 정착 경로 `.../screens/<screen>/figma-component-mapping.md` 불변(자매 파일은 *템플릿* 단계에서만 `.draft`; 채택되면 정본 템플릿을 대체).
- `## Component Mapping` 4컬럼 헤더 불변(기존 파서·계약 보존).

> 결론: "별도 파일"의 위험은 *별도 아티팩트 타입/게이트*에서 온다. 타입·게이트·정착 경로를 그대로 두면 파일이 잠시 `.draft` 로 나뉘어도 새 축이 아니다.

### 2.2 결정 B — `figma_mapping_status` 는 존재 신호로 유지, 시각 충실도 게이트로 쓰지 않는다 (쟁점 3)

**`figma_mapping_status >= draft` 를 "시각 값까지 충실한가"로 확장하면 안 된다.** 근거 4가지(전부 path 근거):

1. **fact 의 의미가 동질해야 한다.** `figma_mapping_status` 는 다른 `*_status`(screen_spec_status 등)와 같은 라이프사이클 순서값(`missing<draft<...<confirmed`)이다(정본 frontmatter 주석·policy `>=` 비교). 여기에 "값이 충실한가"를 얹으면 한 ordinal 에 *문서 성숙도*와 *값 정확도*라는 직교 축 두 개가 섞여 readiness 모델의 균일성이 깨진다.
2. **킷 core 는 시각 값을 기계 검증할 수 없다.** 수집기도 diff 도 core 에 없다(리서치 01 §2, 02 §E). 검증 못 하는 속성을 hard 게이트로 걸면 *거짓 게이트*다(항상 통과 or 사람 판단에 묶여 멈춤).
3. **`final-fixture-ui` 는 "시각 결과를 만드는" 모드다.** 이 모드가 여는 `allowed_paths` 가 `{roles.screen}`·`{roles.domain_component}`(policy:77-81)다 — 즉 *시각을 구현하는 단계*. 그 단계 진입 게이트를 "시각이 이미 충실한가"로 걸면 순환이다(충실하게 만들 권한을 얻으려면 이미 충실해야 함).
4. **충실도는 Verification 축 소관이다.** 리서치 03 §3·04 §7 모두 충실도를 *비주얼 회귀 evidence*(warning-first → telemetry → 사람-결정 hard 게이트)로 둔다. readiness fact 가 아니다.

> 정리: `figma_mapping_status` = **문서 존재/라이프사이클**만. 시각 값 충실도 = **별도 warning-first validate(§6) + 후속 비주얼 회귀 evidence(OD VS-4)**. 둘을 한 fact 로 합치지 않는다.

### 2.3 결정 C — Figma 수집 채널은 reference, kit core 범위 밖 (쟁점 5)

템플릿과 리서치에 **명문 박스**로 박는다(아래 §4 템플릿에 포함):

> 이 계약은 외부에서 수집된 시각 값을 *받아 적는* 표준 문서다. `get_metadata`·`get_design_context`·`get_screenshot`·`get_variable_defs`(Figma MCP)와 `/files`·`/nodes`·`/images`(REST)를 조합해 값을 **수집·재현하는 책임은 도입 레포/소비 프로젝트**에 있다. 킷 core 는 수집기를 구현/번들하지 않으며, 리서치 [04](../../../../docs/research/figma-design/04-figma-mcp-rest-data-collection.md) 의 채널·게이팅 매트릭스는 **reference**(게이트 아님)다.

이로써 세션 금지사항("Figma API/MCP 수집기 구현을 kit core 에 넣지 말 것")이 템플릿 본문에서 구조적으로 지켜진다.

---

## 3. PR69 드래프트 정합성 교정 (deltas) — ★ 핵심 작업

PR69 드래프트는 좋지만, **PR70 격리·세션 2 전제와 어긋나는 4곳**이 있다. 각각 path 근거 + 교정안.

### 3.1 격리(quarantine) 충돌 — `temp/runs/figma-fidelity-001/` 참조 제거 (1순위)

- **현상**: PR69 드래프트 `## Cross-links` 마지막 줄 = `추출 스크립트(재생성): temp/runs/figma-fidelity-001/extract-raw.mjs ※ 현재 J020 파일럿용 하드코딩(file_key·SECTION·targets·date)`. 헤더 주석도 "Raw: ... gitignore + extract-raw.mjs + file_key/node 로 재생성".
- **문제**: `.gitignore:30` 이 `temp/runs/figma-fidelity-001/` 를 **전체 비추적**으로 만들었다(PR70). 그 안의 `extract-raw.mjs` 는 public repo 에 없다. public 킷 템플릿의 유일한 "재생성" 레퍼런스가 *비공개·회사 file_key 하드코딩 경로*를 가리키는 셈 — 격리 원칙 위반 + dangling link.
- **교정**: 경로를 placeholder + 소유권 명시로.
  ```diff
  - 추출 스크립트(재생성): temp/runs/figma-fidelity-001/extract-raw.mjs  ※ 현재 J020 파일럿용 하드코딩…
  + 추출 스크립트(재생성): {추출 스크립트 경로 — 소비 레포 소유, 킷 미포함}
  +   ※ 수집/재생성은 소비 프로젝트 책임(킷 core 범위 밖). 회사 런(file_key·baseline 포함)은 비추적될 수 있다.
  ```
  헤더 주석의 `extract-raw.mjs`/run 이름도 "소비 레포의 추출 스크립트"로 일반화.

### 3.2 Provenance 마커 채널 비종속화

- **현상**: 범례가 수집 도구에 직접 묶임 — `✔ get_variable_defs 직접`, `✔R REST node 정확값`.
- **문제**: 결정 C(수집은 소비 레포 소관)와 약한 충돌. 계약이 특정 채널을 *전제*하는 것처럼 읽힌다.
- **교정**: 마커를 *출처 카테고리*로 재정의하고 도구명은 *예시*로 강등. (글자 `✔`/`✔R` 유지해도 무방 — 핵심은 "카테고리를 가리킨다"는 의미.)
  - `✔T` 토큰 시스템 출처 — 토큰명/값이 디자인-토큰 출처에서 직접 확인 (예: `get_variable_defs`, Tokens Studio export).
  - `✔M` 정밀 측정 출처 — 노드 정확 수치/enum (예: REST `/nodes` 의 `itemSpacing`·`padding*`·`layoutMode`·`layoutSizing*`·`cornerRadius`·`characters`).
  - `◎` DS 컴포넌트 계약 내부값 — 화면 추출 아님(component-catalog 소관, 여기 미지정).
  - `▱` 좌표 역산 — geometry 역산. **지양**(정밀 측정 출처 있으면 교체).
  - `⚠` 추론/리터럴/미해결 → `## Gaps` 또는 `## Data Corrections`.

### 3.3 `implementation-facts.json` "정본" 재프레이밍

- **현상**: 3계층 모델이 `Facts: implementation-facts.json … 기계 인터페이스. 정본.` 으로 표기.
- **문제**: 세션 2 전제는 "킷이 추적하는 시각 계약의 단일 출처 = 이 *문서*". facts.json 은 소비 레포의 (그리고 회사 런이면 비추적되는) 산출물이다. 킷 core 는 facts.json 스키마를 정의/추적하지 않는다.
- **교정**: 표현을 "소비 레포의 **선택적** 기계 인터페이스"로 낮추고, "킷이 추적하는 정본 = 이 Contract 문서"임을 명시.
  ```diff
  - 2. Facts   : implementation-facts.json (...) — 기계 인터페이스. 정본.
  + 2. Facts   : implementation-facts.json (...) — 소비 레포의 선택적 기계 인터페이스(킷 core 가 스키마를 정의/추적하지 않음; 회사 런이면 비추적).
  - 3. Contract: 이 문서 — 사람 계약(...).
  + 3. Contract: 이 문서 — 킷이 추적하는 시각 계약의 단일 출처(토큰 ID·출처마커·override 로그).
  ```

### 3.4 회사 screen id 직접 참조 제거

- **현상**: 헤더 주석 "현 worked example(J020 3종 …)", Cross-links 의 "J020 파일럿".
- **문제**: `J020` 은 회사 런(`temp/runs/figma-fidelity-001/`, 비추적)의 화면 id. public 템플릿이 회사 화면 id 를 이름으로 박지 않는다.
- **교정**: "소비 런의 worked example" 로 일반화. (worked example 자체는 비추적 런에 남기고, 템플릿은 placeholder 만.)

---

## 4. 템플릿 초안 (정식화 버전) — 산출물 #1

아래는 **PR69 드래프트 + §3 교정**을 합친 정식화 버전이다. 별도 파일을 새로 만들지 않는다 — 최종 경로는 OD VS-1 채택 시 정본 `frontend-workflow-kit/templates/screen/figma-component-mapping.template.md` 를 대체한다(그 전까지는 PR69 의 `.draft.md` 가 보유처).

````markdown
---
artifact_id: "{SCREEN_ID}-figma-component-mapping"
artifact_type: figma-component-mapping     # ★ 불변 — 새 산출물 축이 아니라 기존 아티팩트 강화
domain: "{domain}"
screen_id: "{SCREEN_ID}"
status: draft             # 라이프사이클: missing|draft|review|confirmed|implemented|verified|deprecated (confirmed 승격은 사람만)
sources:
  - { type: figma, ref: "file {FILE_KEY} / {frame name} / node {node-id}" }   # ref 에 file_key 포함(소비 레포의 REST 재호출용). 비표준 frontmatter 필드 금지 — ref 는 여기와 본문 Frame 절에만. 모달/상태 오버레이는 줄 추가.
last_reviewed: "{YYYY-MM-DD}"
# status: confirmed 로 승격할 때만 사람이 추가 (LLM 승격 금지): approved_by / approved_at / decision_id
---

<!--
  ════════════════════════════════════════════════════════════════════════════
  화면별 시각 계약 — figma-component-mapping 강화안. 킷 정본 아님(드래프트). 승격은 사람-승인 Open Decision.

  [킷 core 는 시각 값을 수집하지 않는다]
  이 문서는 외부에서 수집된 시각 값을 *받아 적는* 표준 계약일 뿐이다.
  get_metadata·get_design_context·get_screenshot·get_variable_defs(Figma MCP) 및
  /files·/nodes·/images(REST) 로 값을 수집·재현하는 책임은 도입 레포/소비 프로젝트에 있다.
  킷 core 는 수집기를 구현/번들하지 않는다. docs/research/figma-design/04 의 채널 매핑은 reference(게이트 아님).

  경계 (기존 유지):
  - 비즈니스 동작 = ScreenSpec(단일 출처). 여기엔 안 적는다 — 이 문서는 "어떻게 보이나"만, ScreenSpec 은 "무엇을 하나".
  - 컴포넌트 존재/props = 전역 component-catalog. 갭은 component-gap-register(G-xxx). 이 문서는 시각 값에 집중.
  - 값은 토큰 ID. 토큰 없는 값은 `raw N` 으로 명시 + ## Gaps 에 등록. 소스가 틀려 override 한 칸은 ## Data Corrections.
  - 비표준 frontmatter 필드 금지(figma_frame_ref 등). file_key 는 sources ref + 본문 Frame 절에만.
  - 표 헤더는 바꾸지 않는다 — Component Mapping 은 4컬럼 유지(variant/props 는 비고).

  추출 산출물 3계층 (이 문서가 떠받치는 모델 — 1·2 는 소비 레포 소관):
  1. Raw     : node.rest.json 등 수집 원본 — 아카이브. 소비 레포의 추출 스크립트 + file_key/node 로 재생성. (회사 런이면 비추적)
  2. Facts   : implementation-facts.json — 소비 레포의 선택적 기계 인터페이스(킷 core 가 스키마를 정의/추적하지 않음; 회사 런이면 비추적).
  3. Contract: 이 문서 — 킷이 추적하는 시각 계약의 단일 출처(토큰 ID·출처마커·override 로그).
  ════════════════════════════════════════════════════════════════════════════
-->

# Figma Component Mapping (화면별 시각 계약): {화면 이름}

> 시각=Figma(이 문서), 동작=ScreenSpec(단일 출처), 컴포넌트 존재=component-catalog(전역).
> 값은 **토큰 ID**(없으면 `raw N` 명시). 소스가 틀려 다르게 구현한 칸은 `## Data Corrections`.

## 출처 범례 (Provenance) — 값/토큰 칸마다 마커 1개
<!-- 마커는 "출처 카테고리"를 가리킨다. 괄호 안 도구는 예시일 뿐 — 수집 채널은 소비 레포가 정한다. -->
- `✔T` 토큰 시스템 출처 — 토큰명/값이 디자인-토큰 출처에서 직접 확인 (예: get_variable_defs, Tokens Studio export). 토큰 ID 신뢰.
- `✔M` 정밀 측정 출처 — 노드 정확 수치/enum (예: REST /nodes 의 itemSpacing·padding·layoutMode·layoutSizing·cornerRadius·characters).
- `◎`  DS 컴포넌트 계약 내부값 — 화면 추출 아님(component-catalog 소관, 여기 미지정).
- `▱`  좌표 역산 — geometry 역산. **지양**(정밀 측정 출처 있으면 교체).
- `⚠`  추론/리터럴/미해결 → `## Gaps` 또는 `## Data Corrections`.

## Frame
<!-- 프레임마다 줄 1개. 모달/오버레이 상태도 별도 프레임으로 — 각자 node·facts·baseline 을 가진다. -->
- {frame name} / node `{node-id}` · {W}×{H} · mode: {light} · facts `{rel}/implementation-facts.json` · baseline `{rel}/baseline.png`
- (모달/오버레이가 있으면) {modal frame name} / node `{modal-node-id}` · facts `{rel-modal}/...` · baseline `{rel-modal}/...` — `## Visual Spec — Modal` 참조
- file_key: `{FILE_KEY}`   <!-- 소비 레포의 REST 재호출용. figma.com/design/<KEY>/... — placeholder 만; 실제 file_key 는 public 킷에 넣지 않는다. -->

## Component Mapping
<!-- "어떤 Figma 노드 = 어떤 카탈로그 컴포넌트". 4컬럼 고정. variant/props·미보유(G-xxx)는 비고. -->
| Figma Frame / Node | UI 요소 | 매핑 컴포넌트 | 비고 |
|---|---|---|---|
| {frame} / {node} | {UI 요소} | {components/ui/Xxx 또는 features/{domain}/components/Xxx} | {variant/props: size=lg·state=default … · 카탈로그 미보유면 (G-xxx)} |

## Visual Spec
<!-- 노드별 auto-layout/토큰. 값 = 토큰 ID + 출처마커. 토큰 없으면 `raw N` + ## Gaps 등록. 컴포넌트 내부 스타일은 ◎(여기 미지정). -->
| Section/Node | direction | gap | padding | align/justify | sizing | color | type |
|---|---|---|---|---|---|---|---|
| {Section/Node} | column ✔M | `space.4` ✔M · 또는 `raw 48` ⚠ | `space.4` ✔M | center / between ✔M | fill ✔M · `radius.md` ✔T | `bg.surface` ✔T | `title.md` ✔T |

<!-- 모달/오버레이가 있으면 별도 표:
## Visual Spec — Modal ({modal node})
| Section/Node | direction | gap | padding | align/justify | sizing | color | type |
... -->

## Data Corrections / Override Log
<!-- 소스(Figma/facts/컴포넌트 문서)가 틀렸거나 신뢰 불가해 **다르게 구현**한 칸 + 근거.
     ScreenSpec 의 Open Decisions 에 대응하는 시각 축 장치. 없으면 빈 표 유지(검토했음의 증거).
     각 행은 D-xxx(decision) 또는 ## Gaps 항목으로 연결 권장. -->
| 항목 | 소스가 말한 것 | 실제 · 근거 | 구현 결정 / 후속 |
|---|---|---|---|
| {예: 모달 확인 버튼} | variant=danger + fill `raw #2563eb` | 긍정 액션=primary 의도 · 비토큰 색 | color=`primary` 구현 · Figma variant 수정 요청 (D-xxx) |

## Assets
| node | 소스 (DS path 또는 components/ui/icons.tsx) | format | 상태 |
|---|---|---|---|
| {icon/...} | {design-file/assets/... 또는 icons.tsx: XxxIcon} | svg/tsx/png | {✅ 사용가능 / ⚠ 추가 필요} |

## Gaps / Open
<!-- 남은 ⚠ — raw 미토큰화 값, 그라데이션/에셋 부재, 미해결 시각 결정. 결정 필요하면 D-xxx 연결. -->
- {예: gap `raw 48`·`raw 64` 는 spacing 토큰 부재 — 토큰화 결정 D-xxx}
- {예: 동일값 토큰 다중후보 — 토큰 source 계약(OD VS-2) 전엔 ID 로만 확정 불가}

## Cross-links
- facts(소비 레포의 선택적 기계 인터페이스) · baseline: **프레임별로 위 `## Frame` 절에 기재**.
- screen-spec(동작 단일출처): ./screen-spec.md
- component-catalog(컴포넌트 존재/props 단일출처): ../../../../design/component-catalog.md
- 추출 스크립트(재생성): {추출 스크립트 경로 — 소비 레포 소유, 킷 미포함}
    ※ 수집/재생성은 소비 프로젝트 책임(킷 core 범위 밖). 회사 런(file_key·baseline 포함)은 비추적될 수 있다.
````

> 세션 2 의 "Visual Spec 표 최소 필드"(`Section/Node | direction | gap | padding | align/justify | sizing | color | type`)를 그대로 유지했다. 새 컬럼을 더 늘리지 않는다(스코프 절제).

---

## 5. 기존 템플릿 patch 제안 — 산출물 #2

두 대상 모두 **formalization 작성 세션에서는 즉시 적용하지 않았다**(diff 제안만). → **VS-1 실행(branch `docs/visual-spec-vs1-figma-mapping`)으로 대체됨:** Patch A(signpost)는 정본이 옵션 섹션 전체를 갖추며 불필요해졌고, Patch B(draft §3 교정)는 정본을 §3-clean 으로 직접 작성 + `.draft` deprecated(제거 예정)로 무효화됐다. 실행: [visual-spec-vs1-execution.md](visual-spec-vs1-execution.md).

### 5.1 Patch A — 정본 `figma-component-mapping.template.md` signpost (OD VS-1 전까지 최소)

정본 4컬럼 템플릿은 그대로 두되, 헤더 주석에 "강화 드래프트가 있다"는 한 줄만 추가하면 구현자가 더 풍부한 계약의 존재를 알 수 있다. 채택 강제는 아님.

```diff
  <!--
    이 문서는 Figma 프레임/노드 → UI 요소 → 카탈로그 컴포넌트의 **시각 매핑**만 담는다.
+   (강화 제안) 값 레벨 시각 계약(## Visual Spec 등)은 figma-component-mapping.template.draft.md 와
+   docs/design/drafts/visual-spec-formalization.md 참조 — 정식 채택은 Open Decision(VS-1) 대기. 아직 필수 아님.
    경계 (반드시 지킨다):
```

### 5.2 Patch B — PR69 `figma-component-mapping.template.draft.md` 교정 (§3 deltas, 실행 가능)

PR69 가 머지되면(또는 그 브랜치에서) 아래 4건을 적용한다. 요지만 재게시(상세는 §3):

1. **§3.1** `## Cross-links` 와 헤더 주석의 `temp/runs/figma-fidelity-001/extract-raw.mjs` → `{추출 스크립트 경로 — 소비 레포 소유}` placeholder + "킷 미포함" 주석.
2. **§3.2** Provenance 범례를 *출처 카테고리*로 재정의(`✔T`/`✔M`…), 도구명은 예시로 강등.
3. **§3.3** 3계층 모델에서 `Facts … 정본` → "소비 레포의 선택적 기계 인터페이스", `Contract` = "킷이 추적하는 단일 출처".
4. **§3.4** `J020` 등 회사 screen id 직접 참조 → "소비 런의 worked example" 로 일반화.

> Patch B 는 PR69 소유 파일이므로 이 워크트리에서 직접 고치지 않는다(브랜치 충돌·소유권 분리). 본 문서가 그 변경의 근거가 된다.

---

## 6. warning-first validate 후보 — 검토 쟁점 4

전부 **warning-only / `continue-on-error`** 로만 도입한다(route-cross-check·interaction-matrix v2·lint-pack 의 기존 도입 방식과 동일). **차단 0.** 시각 *충실도*(Figma 와 픽셀 일치)는 여기 없음 — 그건 OD VS-4(비주얼 회귀).

| # | 후보 검사 | 신호 | 비고 |
|---|---|---|---|
| W1 | 토큰 ID 형식 | VS-2 W1-FORMAT/W1-NS — dialect 정규화 후 형식 + 네임스페이스 분류(color/space/type/radius/shadow\|elevation · 내장 role-map · 선언 확장). 값/존재 아님 | 형식만(킷 단독). 규약 §5.1 |
| W2 | 토큰 ID 존재 | 소비 레포 manifest 있을 때만 — 미제공 시 skip(no-op). **warning-only · never hard gate** | VS-2 + 소비 레포 manifest 전제. 규약 §5.2 |
| W3 | 필수 섹션 존재 | status≥draft 일 때 `## Frame`·`## Component Mapping`·`## Visual Spec` 비어있지 않나 | 존재만, 값 충실도 아님 |
| W4 | raw 값 추적 | `raw N` 셀은 출처마커(`⚠`) + `## Gaps` 항목을 동반하나 | "토큰 없음"을 묵살 못 하게 |
| W5 | override 추적 | `## Data Corrections` 행이 D-xxx 또는 `## Gaps` 링크를 가지나 | 근거 없는 override 경고 |
| W6 | 4컬럼 유지 | `## Component Mapping` 헤더 불변인가 | 기존 "표 헤더 불변" 규칙의 기계화 |
| W7 | file_key 표기 | REST 재호출 의도 시 `## Frame` 에 file_key placeholder 있나 | **soft** — 수집은 소비 레포 소관이라 권고 수준 |

> 도입 순서도 warning-first: 먼저 telemetry 로 위반 빈도만 본 뒤, hard 승격은 *별도 사람-결정 OD*. 어떤 것도 readiness fact(§2.2)로 합치지 않는다.
>
> W1·W2 의 토큰 ID 규칙 근거 = [design-token-naming-convention.md](design-token-naming-convention.md)(VS-2): **W1=형식**(문서만으로·킷 단독), **W2=존재**(소비 레포 토큰 manifest 있을 때만·opt-in·**never hard gate**). 본 표의 W1↔규약 W1-FORMAT/W1-NS, W2↔규약 W2-*.

---

## 7. README / 리서치 cross-link 문구 — 산출물 #3

아래 짧은 문구를 해당 문서에 더한다(이 PR 에서 §아래 "적용 범위"만 반영).

**(a) `docs/research/figma-design/README.md`** — "보고서" 표 아래 후속 줄:
```md
> 후속 정식화: 위 처방 1·2(시각 계약 산출물)는 [visual-spec 정식화 제안](../../../frontend-workflow-kit/docs/design/drafts/visual-spec-formalization.md)
> 으로 이어진다 — figma-component-mapping 강화(새 축 아님) · warning-first · 수집기는 킷 core 범위 밖.
```

**(b) `docs/research/figma-design/04-...md`** — `### 크로스링크` 에 한 줄:
```md
- 정식화 제안: [visual-spec-formalization](../../../frontend-workflow-kit/docs/design/drafts/visual-spec-formalization.md) (§7 스키마의 채택 경로·교정·OD)
```

**(c) `frontend-workflow-kit/docs/design/README.md`** — Drafts 목록에 1줄(본 PR 에서 적용):
```md
- [Visual Spec 정식화](drafts/visual-spec-formalization.md) — figma-component-mapping 에 화면별 시각 계약(## Visual Spec) 강화. 수집기는 킷 core 밖, warning-first.
```

---

## 8. 후속 Open Decision 후보 — 산출물 #4

리서치 03 §5·04 §7 의 OD 후보를 세션 2 의 4항목으로 정리·통합. 전부 **사람-결정**, roadmap "병렬 금지 — 순차 슬롯 하나씩".

| OD | 제목 | 무엇을 결정 | 전제 | 사람 결정 포인트 |
|---|---|---|---|---|
| **VS-1** | Visual Spec 섹션 정식 채택 | `figma-component-mapping.template.draft.md`(§3 교정본)를 정본 템플릿으로 승격할지 | §3 교정 적용 · PR69 머지 | 정본 템플릿 대체 시점 · `.draft` 제거 — ✓ 적용(branch): [visual-spec-vs1-execution.md](visual-spec-vs1-execution.md) |
| **VS-2** | Design-token source 계약 | 토큰 ID 의 정의·검증 출처(예: Tokens Studio→Style Dictionary→NativeWind; component-catalog 생성 패턴 재사용 여부). **소비 레포 계약**으로 둘지 | VS-1(토큰 ID 칸 존재) | 토큰 source 의 소유(킷 vs 소비) · 생성기 멱등/GENERATED 마커 — ✓ 규약 드래프트: [design-token-naming-convention.md](design-token-naming-convention.md) |
| **VS-3** | warning-first visual spec validate | §6 의 W1·W3·W4·W5·W6 을 `continue-on-error` 로 도입 (W2 는 VS-2 후) | VS-1 | telemetry 기간 · hard 승격은 *재차* 별도 OD |
| **VS-4** | 비주얼 회귀 evidence 도입 여부 | Expo 웹 + Playwright + odiff(렌더 ↔ baseline, ≤2%) warning-only smoke. Verification 축 evidence | baseline 이 소비 레포 산출물(비추적) | evidence→hard 게이트 승격은 telemetry 후 사람 |

순서 권고: **VS-1 → VS-2 → VS-3**(검사가 토큰 존재를 보려면 VS-2 필요) · **VS-4 는 Verification 축으로 병행 트랙 가능하나 hard 게이트는 telemetry 후**. confirmed 승격·게이트 신설/상향은 모두 사람.

> **수용(2026-06-21):** VS-1~VS-4 모두 권고 옵션대로 사람-수용됨(VS-1=b · VS-2=a · VS-3=a · VS-4=a) → [결정 기록](visual-spec-od-decisions.md). 수용은 *방향 채택*이며 hard 게이트·코드/CI 구현은 미포함(향후 별도 사람 OD + 순차 슬롯). VS-1 전제(PR69 머지 + §3 Patch B)는 해소됐다. · **VS-1 실행(2026-06-21): 정본 옵션 섹션 적용 + `.draft` deprecated (branch `docs/visual-spec-vs1-figma-mapping`, 오너 지시) — `.draft` 제거·main merge 는 사람.**

---

## 9. 금지 / 경계 재확인 (세션 2 준수)

- **Figma 수집기를 킷 core 에 넣지 않는다.** §2.3·§4 템플릿 박스로 명문화. 04 채널 매핑은 reference.
- **실제 회사 file_key·카피·baseline·implementation-facts 원본을 템플릿에 넣지 않는다.** 전부 placeholder. §3.1·§3.4 로 비추적 런 참조 제거.
- **visual spec 을 ScreenSpec 위의 business source of truth 로 만들지 않는다.** 경계 박스 유지: 동작=ScreenSpec, 컴포넌트 존재=catalog, 이 문서="어떻게 보이나".
- **hard gate 를 바로 제안하지 않는다.** §6 전부 warning-first, §8 hard 승격은 별도 OD·telemetry 후·사람.
- **policy·runtime(src/) 미변경.** formalization 작성분은 설계 드래프트(이 문서) + cross-link 인덱싱뿐이었다. **정본 템플릿 변경은 "OD 후" 규율대로 VS-1 실행(branch)에서 반영**; policy 는 불변.

---

## 10. Open Questions

> 1·2 는 [VS OD 결정 기록](visual-spec-od-decisions.md)(2026-06-21 사람-수용)으로 해소됨. 아래 ✓ 표기. 3~5 만 open.

1. ✓ **해소 (VS-1=옵션 b):** `## Visual Spec` 은 *옵션 섹션*으로 점진 적용한다(기존 4컬럼 사용처 일괄 마이그레이션 아님). — *잔여(실행 슬롯에서)*: 골든 예제·기존 화면 retrofit 범위/시점. **실행·적용 → [visual-spec-vs1-execution.md](visual-spec-vs1-execution.md)(정본 옵션 섹션 적용·`.draft` deprecated, branch).**
2. ✓ **해소 (VS-2=옵션 a):** 킷은 토큰 ID *네이밍 규약*만 정의하고, 값/생성/검증 소유는 소비 레포에 둔다(킷 core 는 생성기 미보유).
3. (open) `## Data Corrections` 의 override 가 Figma variant 수정 요청을 동반할 때, 그 요청을 ScreenSpec Open Decision 으로 올릴지 이 문서 로컬로 둘지?
4. (open) 모달/오버레이 다중 프레임을 한 `figma-component-mapping.md` 에 둘지(현 드래프트) vs 화면당 1프레임 원칙을 유지할지?
5. (open) W7(file_key 표기)는 "REST 재호출 의도"를 어떻게 판별하나 — 항상 권고 vs sources.type=figma 일 때만?

---

## Cross-links

- 리서치: [figma-design README](../../../../docs/research/figma-design/README.md) · [01 비대칭](../../../../docs/research/figma-design/01-what-the-kit-captures.md) · [02 누수](../../../../docs/research/figma-design/02-where-visual-fidelity-leaks.md) · [03 95로 좁히기](../../../../docs/research/figma-design/03-gaps-and-path-to-95.md) · [04 MCP×REST 수집·조합](../../../../docs/research/figma-design/04-figma-mcp-rest-data-collection.md)
- 정본 템플릿: [figma-component-mapping.template.md](../../../templates/screen/figma-component-mapping.template.md) · [screen-spec.template.md](../../../templates/screen/screen-spec.template.md)
- PR69 드래프트(보유처): `frontend-workflow-kit/templates/screen/figma-component-mapping.template.draft.md` (merged → §4 로 정식화, **deprecated**)
- VS-1 실행안: [visual-spec-vs1-execution.md](visual-spec-vs1-execution.md) · VS-2 규약: [design-token-naming-convention.md](design-token-naming-convention.md) (seed [design-token-naming-convention.todo.md](design-token-naming-convention.todo.md) → deprecated)
- 정책: [implementation-mode-policy.yaml](../../../policies/implementation-mode-policy.yaml) (`figma_mapping_status` 사용처)
- 격리 근거: `.gitignore` (`temp/runs/figma-fidelity-001/`, `figma-pat`)
