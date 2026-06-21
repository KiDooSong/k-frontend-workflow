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
    ※ 수집/재생성은 소비 프로젝트 책임(킷 core 범위 밖). 비공개 소비 레포 런(file_key·baseline 포함)은 비추적될 수 있다.
