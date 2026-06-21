# OD-VS-1 실행안 — `figma-component-mapping.template.md` 옵션 섹션화

> Status: **proposal / execution plan**. 2026-06-21.
> 대상 결정: [OD-VS-1 = 옵션 (b)](visual-spec-od-decisions.md) — `## Visual Spec` 계열을 정본 템플릿에 **옵션 섹션**으로 추가(새 축 아님, 점진 적용).
> 이 문서는 **제안**이다. 정본 템플릿·`.draft.md`·policy 를 이 세션에서 **편집하지 않는다** — 정본 반영은 사람 실행 슬롯.
> 이 문서는 게이트를 신설/상향하지 않는다. confirmed 승격·OD resolve·hard gate 는 모두 사람.

---

## 0. 결론 요약

1. **VS-1 = 옵션 (b) 실행 = "정본에 옵션 섹션 추가".** 정본 [figma-component-mapping.template.md](../../../templates/screen/figma-component-mapping.template.md) 의 **4컬럼 `## Component Mapping` + `## Notes` 베이스라인은 그대로** 두고, 그 아래에 `## Provenance`·`## Visual Spec`·`## Data Corrections / Override Log`·`## Assets`·`## Gaps / Open`·`## Cross-links`(+ `## Frame` 확장 필드)를 **opt-in** 으로 더한다. `artifact_type: figma-component-mapping` 불변 → 새 frontmatter status·새 readiness fact·새 게이트가 생기지 않는다.
2. **이 세션은 제안만.** 산출물은 (#1) 정본 patch 제안(전체 제안 본문 §3), (#2) `.draft.md` 처리 방안(§4), (#3) formalization 업데이트 diff(§5), (#4) VS-2 TODO seed([별도 파일](design-token-naming-convention.todo.md)). **정본 파일은 직접 수정하지 않는다** — [OD-VS-1 record](visual-spec-od-decisions.md) 의 "정본 편집 금지"와 산출물 문구("patch 제안")를 따른다.
3. **`figma_mapping_status` 는 존재 신호로 유지.** 옵션 섹션의 채움 여부·시각 충실도는 이 fact 가 보지 않는다(policy `figma_mapping_status >= draft` = 문서 라이프사이클만). 충실도는 Verification 축 evidence(비주얼 회귀, OD-VS-4) 소관.
4. **킷 core 는 시각 값을 수집하지 않는다.** MCP/REST 수집기·토큰 생성기는 소비 레포 책임. 값은 **토큰 ID** 우선, 없으면 `raw N` + 출처마커 `⚠` + `## Gaps / Open`. 실제 file_key·카피·baseline·implementation-facts 원본은 public 킷에 넣지 않는다(전부 placeholder).
5. **validate/CI·hard gate 없음.** warning-first validate 후보는 §7 에 "future, not implemented"로만 둔다. 토큰 네이밍 규약은 상세화하지 않고 VS-2 로 넘긴다(§6).

---

## 1. 전제 확인 (path 근거)

### 1.1 PR69 머지됨 — 드래프트가 main 에 존재

- `frontend-workflow-kit/templates/screen/figma-component-mapping.template.draft.md` 가 현재 브랜치(base `main@dc0b843`)에 존재 → [OD-VS-1 record](visual-spec-od-decisions.md) 의 차단 "PR69 가 아직 OPEN"은 **해소**(머지 가정과 정합).
- 드래프트는 이미 `## Frame`·출처 범례·`## Component Mapping`(4컬럼)·`## Visual Spec`(8컬럼)·`## Data Corrections`·`## Assets`·`## Gaps / Open`·`## Cross-links` 를 갖췄다. → VS-1 의 "설계할 섹션"은 대부분 충족; 남은 일은 *정합성 교정 반영*과 *옵션-섹션화 프레이밍*.

### 1.2 §3 교정(Patch B)의 잔여 — 정본엔 §3-clean 만 반영

머지된 `.draft.md` 는 [formalization §3](visual-spec-formalization.md) 교정이 **부분만** 반영돼 있다(실제 파일 대조):

| §3 교정 | `.draft.md` 현재 | 정본 옵션 섹션(이 제안)에서 |
|---|---|---|
| §3.1 격리 경로 | ✅ 대체됨 — `## Cross-links` 가 "외부 수집 스크립트(런 디렉터리 — 비추적)". 단 "파일럿용 하드코딩" 표현 잔존 | placeholder `{외부 수집 스크립트 — 소비 레포 소유, 킷 미포함}` 로 정리 |
| §3.2 provenance 비채널화 | ❌ 미반영 — 아직 `✔ get_variable_defs 직접`·`✔R REST node 정확값`(도구 종속) | `✔T`/`✔M` 출처 *카테고리* 로, 도구명은 예시 강등 |
| §3.3 facts "정본" 재프레이밍 | ❌ 미반영 — 헤더 주석이 `Facts … 기계 인터페이스. 정본.` | "소비 레포의 **선택적** 기계 인터페이스(킷 core 가 스키마 정의/추적 안 함)" |
| §3.4 회사 screen id | ✅ 직접 id 없음 — "파일럿 화면들" 로 일반화됨 | "{소비 런의 worked example}" placeholder, 파일럿 표현도 제거 |

> 결론: 정본 옵션 섹션은 `.draft.md` 를 그대로 옮기지 않고, **formalization §4(교정 반영본)** 를 베이스로 §3-clean 하게 새로 적는다. 이로써 정본은 드래프트의 잔여 냄새(파일럿·도구종속 provenance·"정본" facts)를 상속하지 않는다 — 차단의 *정합 의도*가 충족된다.

### 1.3 `figma_mapping_status` 사용처 — 이 제안이 건드리지 않음

- [policies/implementation-mode-policy.yaml:73-76](../../../policies/implementation-mode-policy.yaml): `final-fixture-ui.requires` 에 `figma_mapping_status >= draft`. 이 fact 는 **문서가 draft 로 존재하는가**만 본다. 옵션 섹션 신설은 이 비교를 바꾸지 않는다(섹션이 비어도 status 는 문서 frontmatter 가 결정). → **게이트 영향 0.**

---

## 2. 설계 결정 재확인 (formalization §2 요약)

- **옵션 (b) = 가산(additive).** 베이스라인(4컬럼 Component Mapping + Notes)이 `figma_mapping_status` 를 만든다. 신규 섹션은 *opt-in* — 시각 값을 계약으로 고정하려는 화면만 채운다. 기존 화면·골든 예제(coupon-feature 등)는 **일괄 마이그레이션하지 않는다**(retrofit 범위·시점은 유보, OD-VS-1).
- **새 `visual-spec.md` artifact_type 신설 금지.** `artifact_type` 불변 → readiness/workflow-state 가 보는 fact 키 불변 → 새 축 없음.
- **`## Component Mapping` 헤더 불변.** 기존 파서·계약 보존(formalization §2.1 판별 기준).

---

## 3. 산출물 #1 — 정본 `figma-component-mapping.template.md` patch 제안

### 3.1 Delta 요약 (현 정본 대비)

현 정본 섹션 = `## Frame`·`## Component Mapping`·`## Notes`(3절, 값 레벨 칸 없음). 제안 delta:

- **불변(그대로):** frontmatter `artifact_type`/`sources` 최소형, `## Component Mapping` 4컬럼 헤더, `## Notes`. frontmatter `sources.ref` 는 **최소형 유지**(드래프트처럼 `file {FILE_KEY}` 를 박지 않음 — file_key 는 베이스라인이 아니라 옵션 `## Frame` 필드).
- **확장(기존 절):** `## Frame` 에 옵션 필드(node·치수·mode·facts·baseline·file_key placeholder)를 **주석 가이드**로 추가. 신규 `## Frame` 을 중복 생성하지 않는다.
- **신규 옵션 섹션 6종:** `## Provenance`·`## Visual Spec`·`## Data Corrections / Override Log`·`## Assets`·`## Gaps / Open`·`## Cross-links`. 전부 `<!-- (옵션) -->` 표기 + 상단 옵션 구분 주석 아래.
- **frontmatter 주석 1줄 추가:** `figma_mapping_status` 가 옵션 섹션 채움/충실도를 보지 않음을 명시(존재 신호 유지).
- **header 주석:** "킷 core 는 시각 값을 수집하지 않는다" 박스(§2.3) + 옵션 섹션 안내.

> Visual Spec 표는 세션 지정 **최소 8필드**(`Section/Node | direction | gap | padding | align/justify | sizing | color | type`)로 시작하고 더 늘리지 않는다.

### 3.2 제안 본문 (정본 대체본 — 사람이 적용)

아래는 정본 `figma-component-mapping.template.md` 의 **제안 전체 본문**이다. OD-VS-1 채택의 실행으로서 사람이 정본에 반영한다(이 세션은 적용하지 않음).

````markdown
---
artifact_id: "{SCREEN_ID}-figma-component-mapping"
artifact_type: figma-component-mapping     # ★ 불변 — 새 산출물 축이 아니라 기존 아티팩트 강화 (OD-VS-1 = 옵션 b)
domain: "{domain}"
screen_id: "{SCREEN_ID}"
status: draft             # 라이프사이클: missing|draft|review|confirmed|implemented|verified|deprecated (confirmed 승격은 사람만)
sources:
  - { type: figma, ref: "{figma frame ref}" }   # 프레임 ref 단일 출처(메타). 비표준 figma_frame_ref 필드 금지 — ref 는 여기와 본문 Frame 절에만. 모달/오버레이는 줄 추가.
last_reviewed: "{YYYY-MM-DD}"
# status: confirmed 로 승격할 때만 사람이 추가 (LLM 승격 금지):
#   approved_by / approved_at / decision_id
#
# 이 status 는 readiness 의 figma_mapping_status fact 가 된다 —
# final-fixture-ui 게이트가 `figma_mapping_status >= draft` 로 읽는다 (policies/implementation-mode-policy.yaml).
# ★ 이 fact 는 문서의 "존재/라이프사이클"만 본다. 아래 옵션 섹션(## Visual Spec 등)의 채움 여부·시각 충실도는 보지 않는다.
---

<!--
  이 문서는 Figma 프레임/노드 → UI 요소 → 카탈로그 컴포넌트의 **시각 매핑**을 담는다.
  ── 필수 베이스라인: `## Component Mapping`(4컬럼) + `## Notes`. figma_mapping_status 는 이 문서의 존재만 본다.
  ── 옵션 섹션(opt-in): `## Provenance`·`## Visual Spec`·`## Data Corrections`·`## Assets`·`## Gaps / Open`·`## Cross-links`
       및 `## Frame` 확장 필드. 시각 값을 계약으로 고정하려는 화면만 채운다. 비우면 통째로 생략 가능 — 게이트가 요구하지 않는다.

  경계 (반드시 지킨다):
  - 비즈니스 동작(어떤 항목이 어느 탭/상태에 속하는지, 분류·정렬·노출 규칙)은 ScreenSpec 이 단일 출처다.
    여기엔 적지 않는다 — 이 문서는 "어떻게 보이나"(시각)만, ScreenSpec 은 "무엇을 하나"(동작).
  - 컴포넌트 존재/props 는 전역 component-catalog. 카탈로그에 없으면 global/component-gap-register.md 에
    G-xxx 를 open 으로 **제안만** 한다 (accept·구현은 사람). 매핑 표 비고에 "(G-xxx, 카탈로그 미보유)".
  - 어떤 요소의 **존재 여부**가 open decision 에 달려 있으면 (예: 탭 분리가 D-xxx 에 달림) 비고/Notes 에 명시 —
    그 decision 이 닫히기 전엔 후보 시각안이다.
  - 비표준 frontmatter 필드(figma_frame_ref 등) 금지. 프레임 ref 는 frontmatter `sources` 와 아래 `## Frame` 절에만.
  - `## Component Mapping` 표 헤더는 바꾸지 않는다(기존 파서·계약 보존).

  [킷 core 는 시각 값을 수집하지 않는다]
  이 문서는 외부에서 수집된 시각 값을 *받아 적는* 표준 계약일 뿐이다.
  get_metadata·get_design_context·get_screenshot·get_variable_defs(Figma MCP) 및 /files·/nodes·/images(REST) 로
  값을 수집·재현하는 책임은 도입 레포/소비 프로젝트에 있다. 킷 core 는 수집기·토큰 생성기를 구현/번들하지 않는다.
  docs/research/figma-design/04 의 채널 매핑은 reference(게이트 아님).
-->

# Figma Component Mapping: {화면 이름}

> {input_id} 로 생성/갱신. 시각=Figma(이 문서), 동작=ScreenSpec(단일 출처), 컴포넌트 존재=component-catalog(전역).
> (옵션) 시각 값을 채울 땐 **토큰 ID** 우선 — 토큰 없으면 `raw N` + 출처마커 `⚠` + `## Gaps / Open` 등록.

## Frame
- {figma frame ref}   <!-- frontmatter sources 의 ref 와 동일. 화면 대표 프레임. 여러 프레임이면 줄 추가. -->
<!-- (옵션) 시각 계약을 채우는 화면은 프레임 줄에 다음을 덧붙일 수 있다 (모달/오버레이는 각자 별도 줄):
- {frame name} / node `{node-id}` · {W}×{H} · mode: {light} · facts `{rel}/implementation-facts.json` · baseline `{rel}/baseline.png`
- file_key: `{FILE_KEY}`   ← 소비 레포의 REST 재호출용. placeholder 만; 실제 file_key 는 public 킷에 넣지 않는다. -->

## Component Mapping
| Figma Frame / Node | UI 요소 | 매핑 컴포넌트 | 비고 |
|---|---|---|---|
| {frame} / {Node} | {UI 요소} | {features/{domain}/components/Xxx 또는 components/ui/Xxx} | {variant/props … · 카탈로그 미보유면 (G-xxx)} |

## Notes
- {시각 매핑 보충 메모. 비즈니스 분류·동작은 적지 않는다 — ScreenSpec 의 State/Interaction Matrix 가 단일 출처.}
- {카탈로그에 없는 컴포넌트는 G-xxx(component-gap-register, open)로 제안됨을 명시. accept 전까지 구현 금지.}
- {어떤 요소의 존재가 open decision(D-xxx)에 달려 있으면 여기 명시 — 닫히기 전엔 후보 시각안.}

<!-- ════════ 옵션 섹션 (opt-in) — 시각 값을 계약으로 고정할 때만 채운다. 비우면 통째로 생략 가능. ════════
     채움 여부는 figma_mapping_status 게이트와 무관(존재 신호 = 문서 자체). 시각 충실도는 readiness 가 아니라
     Verification 축 evidence(비주얼 회귀, OD-VS-4)에서 다룬다. -->

## Provenance
<!-- (옵션) 값/토큰 칸마다 마커 1개. 마커는 "출처 카테고리"를 가리킨다 — 괄호 안 도구는 예시일 뿐, 수집 채널은 소비 레포가 정한다. -->
- `✔T` 토큰 시스템 출처 — 토큰명/값을 디자인-토큰 출처에서 직접 확인 (예: get_variable_defs, Tokens Studio export). 토큰 ID 신뢰.
- `✔M` 정밀 측정 출처 — 노드 정확 수치/enum (예: REST /nodes 의 itemSpacing·padding·layoutMode·layoutSizing·cornerRadius·characters).
- `◎`  DS 컴포넌트 계약 내부값 — 화면 추출 아님(component-catalog 소관, 여기 미지정).
- `▱`  좌표 역산 — geometry 역산. **지양**(정밀 측정 출처 있으면 교체).
- `⚠`  추론/리터럴/미해결 → `## Gaps / Open` 또는 `## Data Corrections`.

## Visual Spec
<!-- (옵션) 노드별 auto-layout/토큰. 값 = 토큰 ID + 출처마커. 토큰 없으면 `raw N` + `⚠` + `## Gaps / Open` 등록.
     컴포넌트 내부 스타일은 ◎(여기 미지정). 표 필드는 최소 8칸에서 시작 — 더 늘리지 않는다(스코프 절제).
     아래 셀의 `space.4`·`bg.surface`·`title.md` 등은 **형태 예시일 뿐, 토큰 네이밍 규약 아님** — 규약은 OD-VS-2 에서 확정. -->
| Section/Node | direction | gap | padding | align/justify | sizing | color | type |
|---|---|---|---|---|---|---|---|
| {Section/Node} | column ✔M | `space.4` ✔T · 또는 `raw 48` ⚠ | `space.4` ✔T | center / between ✔M | fill ✔M · `radius.md` ✔T | `bg.surface` ✔T | `title.md` ✔T |

<!-- 모달/오버레이가 있으면 별도 표:
## Visual Spec — Modal ({modal node})
| Section/Node | direction | gap | padding | align/justify | sizing | color | type |
... -->

## Data Corrections / Override Log
<!-- (옵션) 소스(Figma/facts/컴포넌트 문서)가 틀렸거나 신뢰 불가해 **다르게 구현**한 칸 + 근거.
     ScreenSpec 의 Open Decisions 에 대응하는 시각 축 장치. 없으면 빈 표 유지(검토했음의 증거).
     각 행은 D-xxx(decision) 또는 `## Gaps / Open` 항목으로 연결 권장. -->
| 항목 | 소스가 말한 것 | 실제 · 근거 | 구현 결정 / 후속 |
|---|---|---|---|
| {예: 모달 확인 버튼} | variant=danger + fill `raw #2563eb` | 긍정 액션=primary 의도 · 비토큰 색 | color=`primary` 구현 · Figma variant 수정 요청 (D-xxx) |

## Assets
<!-- (옵션) -->
| node | 소스 (DS path 또는 components/ui/icons.tsx) | format | 상태 |
|---|---|---|---|
| {icon/...} | {design-file/assets/... 또는 icons.tsx: XxxIcon} | svg/tsx/png | {✅ 사용가능 / ⚠ 추가 필요} |

## Gaps / Open
<!-- (옵션) 남은 ⚠ — raw 미토큰화 값, 그라데이션/에셋 부재, 미해결 시각 결정. 결정 필요하면 D-xxx 연결. -->
- {예: gap `raw 48`·`raw 64` 는 spacing 토큰 부재 — 토큰화 결정 D-xxx}
- {예: 동일값 토큰 다중후보 — 토큰 source 계약(OD-VS-2) 전엔 ID 로만 확정 불가}

## Cross-links
<!-- (옵션) -->
- facts(소비 레포의 선택적 기계 인터페이스) · baseline: **프레임별로 위 `## Frame` 절에 기재**.
- screen-spec(동작 단일출처): ./screen-spec.md
- component-catalog(컴포넌트 존재/props 단일출처): {상대경로}/design/component-catalog.md
- 추출 스크립트(재생성): {외부 수집 스크립트 — 소비 레포 소유, 킷 미포함}
    ※ 수집/재생성은 소비 프로젝트 책임(킷 core 범위 밖). 회사 런(file_key·baseline 포함)은 비추적될 수 있다.
````

> 위 본문은 세션 2 의 "Visual Spec 표 최소 필드"를 그대로 유지하고 컬럼을 늘리지 않았다. 토큰 네이밍 규약은 적지 않았다(§6, VS-2). 실제 file_key·카피·baseline·facts 원본은 전부 placeholder.

---

## 4. 산출물 #2 — `figma-component-mapping.template.draft.md` 처리 방안

**권고: `deprecated` 1사이클 경유 후 remove (2단계, 사람 실행). 이 세션에서 draft 를 수정하지 않는다.**

이유:
- 정본이 옵션 섹션을 보유하면 `.draft.md` 의 역할(정식화 후보)은 소멸 — 두 곳에 같은 계약이 있으면 drift 위험.
- 단, 옵션 (b)는 *점진 적용*이고 [OD-VS-1 record](visual-spec-od-decisions.md) 가 "`.draft` 제거·정본 완전 대체 *시점* = 실행 슬롯(유보)"으로 남겼다 → **즉시 삭제보다 deprecated 경유**가 안전(진행 중 참조·리뷰 보호).
- `.draft.md` 는 §3 교정 잔여(§1.2)를 아직 품고 있다 → 정본이 §3-clean 본을 갖춘 뒤엔 draft 를 *근거 보존용으로 한 사이클만* 남기고 정리.

단계 (전부 사람 실행 슬롯):

| 단계 | 시점 | 행동 |
|---|---|---|
| 0 (지금) | 이 제안 | draft **미수정**. 본 실행안이 처리 근거. |
| 1 | 정본 patch(§3) 적용 직후 | draft frontmatter `status: deprecated` + 상단 배너(→ 정본 + 본 실행안). 한 리뷰 사이클 유지. |
| 2 | 다음 정리 슬롯 | `git rm` 로 draft 제거(정본이 단일 출처). |

단계 1 에서 붙일 배너(제안):

```md
> ⚠ DEPRECATED (2026-06-21~): 이 드래프트의 내용은 정본
> templates/screen/figma-component-mapping.template.md 의 **옵션 섹션**으로 흡수됐다(OD-VS-1=b).
> 신규 작성은 정본을 쓴다. 본 파일은 §3 교정 근거 보존용으로 한 사이클만 유지 후 제거 예정.
> 실행 근거: docs/design/drafts/visual-spec-vs1-execution.md
```

---

## 5. 산출물 #3 — `visual-spec-formalization.md` 업데이트 patch 제안 (미적용)

formalization 은 VS-1 실행안이 생겼음을 가리키면 충분하다. 아래 diff 를 **제안**한다(이 세션에서 적용하지 않음).

**(a) §8 OD 표 — VS-1 행 "다음 구체 액션":**
```diff
- | **VS-1** | Visual Spec 섹션 정식 채택 | … | §3 교정 적용 · PR69 머지 | 정본 템플릿 대체 시점 · `.draft` 제거 |
+ | **VS-1** | Visual Spec 섹션 정식 채택 | … | §3 교정 적용 · PR69 머지 | 정본 템플릿 대체 시점 · `.draft` 제거 — ✓ 실행안: visual-spec-vs1-execution.md |
```

**(b) §10 Open Questions — Q1 잔여에 실행안 링크:**
```diff
- 1. ✓ **해소 (VS-1=옵션 b):** … — *잔여(실행 슬롯에서)*: 골든 예제·기존 화면 retrofit 범위/시점.
+ 1. ✓ **해소 (VS-1=옵션 b):** … — *잔여(실행 슬롯에서)*: 골든 예제·기존 화면 retrofit 범위/시점.
+    실행안 작성됨 → [visual-spec-vs1-execution.md](visual-spec-vs1-execution.md)(정본 patch 제안·draft 처리·VS-2 seed).
```

**(c) `## Cross-links` — 실행안 추가:**
```diff
  - PR69 드래프트(보유처): `frontend-workflow-kit/templates/screen/figma-component-mapping.template.draft.md` (open PR)
+ - VS-1 실행안: [visual-spec-vs1-execution.md](visual-spec-vs1-execution.md) · VS-2 seed: [design-token-naming-convention.todo.md](design-token-naming-convention.todo.md)
```

> (옵션) [visual-spec-od-decisions.md](visual-spec-od-decisions.md) OD-VS-1 "다음 구체 액션"에도 본 실행안 백링크를 더하면 추적이 깔끔하다 — 사람 판단.

---

## 6. 산출물 #4 — VS-2 TODO seed

토큰 네이밍 규약은 이 세션에서 **상세화하지 않는다**(VS-1 스코프 절제). VS-2 슬롯이 작성할 규약의 *범위·소유·전제* 만 별도 파일에 seed 로 남긴다:

→ [design-token-naming-convention.todo.md](design-token-naming-convention.todo.md)

요지: 킷은 토큰 ID **네이밍 규약만** 정의(OD-VS-2=옵션 a), 값·생성·검증 소유는 소비 레포. `## Visual Spec` 예시 셀(`space.4`·`bg.surface`·`title.md`)은 *형태 placeholder 일 뿐 규약 아님* — VS-2 가 확정.

---

## 7. Validation 후보 — **future, not implemented**

아래는 [formalization §6](visual-spec-formalization.md) 의 warning-first 후보를 재게시한 것이다. **이 세션은 어느 것도 구현하지 않는다.** 정본 템플릿에도 넣지 않는다(템플릿은 화면별로 복제되므로 로드맵 주석을 싣지 않는다). VS-3 슬롯 + *명시 지시* 가 있을 때만 `continue-on-error`(warning-only)로 도입. **hard gate 아님**, 어떤 신호도 `figma_mapping_status` readiness fact 에 합치지 않는다.

| # | 후보 검사 | 상태 |
|---|---|---|
| W1 | 토큰 ID **형식** | future / not implemented (VS-3) |
| W3 | 필수 섹션 존재(status≥draft 시 `## Component Mapping` 비어있지 않음) | future / not implemented (VS-3) |
| W4 | `raw N` 셀이 `⚠` + `## Gaps / Open` 동반 | future / not implemented (VS-3) |
| W5 | `## Data Corrections` 행이 D-xxx 또는 `## Gaps` 링크 보유 | future / not implemented (VS-3) |
| W6 | `## Component Mapping` 4컬럼 헤더 불변 | future / not implemented (VS-3) |
| W2 | 토큰 ID **존재**(토큰 source 에 정의됨) | future — **VS-2 후**(토큰 네이밍 규약·소비 레포 토큰 source 전제) |

> 시각 *충실도*(픽셀 일치)는 여기 없다 — OD-VS-4(비주얼 회귀 evidence, Verification 축). 도입 순서도 warning-first → telemetry → *별도 사람-결정 OD* 로만 hard 승격.

---

## 8. 금지 / 경계 재확인 (세션 2 준수)

- **새 `visual-spec.md` artifact_type 신설 안 함.** `artifact_type: figma-component-mapping` 불변.
- **Figma MCP/REST 수집기·토큰 생성기를 킷 core 에 넣지 않음.** header 박스(§3.2 본문)로 명문화. 04 채널 매핑은 reference.
- **validate/CI 구현 안 함.** §7 전부 future/not implemented.
- **hard gate 로 연결 안 함.** `figma_mapping_status` 존재 신호 유지, 충실도는 Verification 축.
- **실제 회사 file_key·카피·baseline·implementation-facts 원본을 템플릿에 넣지 않음.** 전부 placeholder.
- **정본·draft·policy 를 이 세션에서 편집하지 않음.** 전부 제안. confirmed 승격·OD resolve·정본 반영·`.draft` 제거는 사람.

---

## 9. 다음 액션 (사람 실행 슬롯)

1. (사람) §3.2 제안 본문을 정본 `figma-component-mapping.template.md` 에 반영(옵션 (b) 옵션-섹션화).
2. (사람) 직후 `.draft.md` → `deprecated` 배너(§4 단계 1), 다음 정리 슬롯에 remove(단계 2).
3. (사람, 선택) §5 diff 로 formalization cross-link 갱신.
4. (다음 슬롯) VS-2 — [design-token-naming-convention.todo.md](design-token-naming-convention.todo.md) 기반 네이밍 규약 드래프트.
5. (병행 가능) VS-4 비주얼 회귀 evidence — 단 hard gate 는 telemetry 후 별도 OD.

> 원하면 본 브랜치(`docs/visual-spec-vs1-figma-mapping`)에서 §3.2 정본 patch 를 **적용**해 리뷰용 diff 로 만들 수 있다(머지는 사람 게이트 유지). 현재는 제안 상태로 둔다.

---

## Cross-links

- 대상 결정: [visual-spec-od-decisions.md](visual-spec-od-decisions.md) (OD-VS-1=b)
- 출처 제안: [visual-spec-formalization.md](visual-spec-formalization.md) (§3 교정·§4 본문·§6 검사·§8 OD)
- 정본 템플릿: [figma-component-mapping.template.md](../../../templates/screen/figma-component-mapping.template.md)
- PR69 드래프트(보유처): [figma-component-mapping.template.draft.md](../../../templates/screen/figma-component-mapping.template.draft.md)
- 정책(`figma_mapping_status`): [implementation-mode-policy.yaml](../../../policies/implementation-mode-policy.yaml)
- 리서치: [figma-design README](../../../../docs/research/figma-design/README.md) · [03 95로 좁히기](../../../../docs/research/figma-design/03-gaps-and-path-to-95.md) · [04 MCP×REST 수집](../../../../docs/research/figma-design/04-figma-mcp-rest-data-collection.md)
- VS-2 seed: [design-token-naming-convention.todo.md](design-token-naming-convention.todo.md)
