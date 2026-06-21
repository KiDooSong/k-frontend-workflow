---
artifact_id: "{SCREEN_ID}-figma-component-mapping"
artifact_type: figma-component-mapping
domain: "{domain}"
screen_id: "{SCREEN_ID}"
status: draft             # 문서 라이프사이클: missing|draft|review|confirmed|implemented|verified|deprecated (confirmed 승격은 사람만)
sources:
  - { type: figma, ref: "file {FILE_KEY} / {frame name} / node {node-id}" }   # ref 에 file_key 포함(REST 재호출용). 비표준 frontmatter 필드 금지 — ref 는 여기와 본문 Frame 절에만. 여러 프레임(모달/상태 오버레이 포함)이면 줄 추가.
last_reviewed: "{YYYY-MM-DD}"
# status: confirmed 로 승격할 때만 사람이 추가 (LLM 승격 금지):
#   approved_by / approved_at / decision_id
---

<!--
  ════════════════════════════════════════════════════════════════════════════
  DRAFT 템플릿 (figma 추출 파일럿 산출) — 킷 정본 아님. 승격은 사람-승인 Open Decision.
  figma 추출 파일럿(다화면) 의 추출·구현·검증 학습으로 기존
  templates/screen/figma-component-mapping.template.md 를 "화면별 시각 계약"으로 정식화한 제안.

  경계 (기존 유지):
  - 비즈니스 동작 = ScreenSpec(단일 출처). 여기엔 안 적는다("어떻게 보이나"만).
  - 컴포넌트 존재/props = 전역 component-catalog. 갭은 component-gap-register(G-xxx).
  - 값은 토큰 ID. 토큰 없는 값은 `raw` 명시. 데이터가 틀려 override 한 칸은 ## Data Corrections 에.
  - 비표준 frontmatter 필드 금지(figma_frame_ref 등). file_key 는 sources ref + 본문 Frame 절에.
  - 표 헤더는 바꾸지 않는다 — Component Mapping 은 기존 4컬럼 유지(variant/props 는 비고로).

  추출 산출물 3계층 (이 문서가 떠받치는 모델):
  1. Raw     : node.rest.json (REST 원본 6~10k줄) — 아카이브, 아무도 안 읽음.
               gitignore + extract-raw.mjs + file_key/node 로 재생성(재현성은 스크립트에서).
  2. Facts   : implementation-facts.json (distill: instance 가지치기 + 토큰 해소) — 기계 인터페이스. 정본.
  3. Contract: 이 문서 — 사람 계약(토큰 ID·출처마커·override 로그).

  주: 현 worked example(파일럿 화면들)은 이 정식화 이전 작성 —
      ## Data Corrections 섹션 retrofit 예정(구현보고 §4 가 출처).
  ════════════════════════════════════════════════════════════════════════════
-->

# Figma Component Mapping (화면별 시각 계약): {화면 이름}

> 시각=Figma(이 문서), 동작=ScreenSpec(단일 출처), 컴포넌트 존재=component-catalog(전역).
> 값은 **토큰 ID**(또는 `raw` 명시). 데이터가 틀려 다르게 구현한 칸은 `## Data Corrections`.

## 출처 범례 (Provenance) — 값/토큰 칸마다 마커 1개
- `✔`  get_variable_defs(used-variables) 직접 — 토큰명 신뢰
- `✔R` **REST node 정확값**(facts: itemSpacing·padding·layoutMode·layoutSizing·cornerRadius·characters·componentProperties)
- `◎`  DS 컴포넌트 계약 내부값(화면 추출 아님 — component-catalog 소관)
- `▱`  좌표 역산 — **지양**(REST 있으면 `✔R` 로 교체)
- `⚠`  추론/리터럴/미해결 → `## Gaps` 또는 `## Data Corrections`

## Frame
<!-- 프레임마다 줄 1개. 모달/오버레이 상태도 별도 프레임으로 — 각자 node·facts·baseline 을 가진다. -->
- {frame name} / node `{node-id}` · {W}×{H} · mode: {light} · facts `{rel}/implementation-facts.json` · baseline `{rel}/baseline.png`
- (모달/오버레이가 있으면) {modal frame name} / node `{modal-node-id}` · facts `{rel-modal}/implementation-facts.json` · baseline `{rel-modal}/baseline.png` — `## Visual Spec — Modal` 참조
- file_key: `{FILE_KEY}`   <!-- ★ REST 재호출 필수(file_key 누락 교훈). figma.com/design/<KEY>/... -->

## Component Mapping
<!-- "어떤 Figma 노드 = 어떤 카탈로그 컴포넌트". 4컬럼 고정. variant/props·미보유(G-xxx)는 비고. -->
| Figma Frame / Node | UI 요소 | 매핑 컴포넌트 | 비고 |
|---|---|---|---|
| {frame} / {node} | {UI 요소} | {components/ui/Xxx 또는 features/{domain}/components/Xxx} | {variant/props: size=lg·state=default … · 카탈로그 미보유면 (G-xxx)} |

## Visual Spec
<!-- 노드별 auto-layout/토큰. 값 = 토큰 ID + 출처마커. 토큰 없으면 `raw N`. 컴포넌트 내부 스타일은 ◎(여기 미지정). -->
| Section/Node | direction | gap | padding | align/justify | sizing | color | type |
|---|---|---|---|---|---|---|---|
| {Section/Node} | column ✔R | `spacing/p-N`(px) ✔R · 또는 `raw N` ✔R | t/r/b/l ✔R | justify / align ✔R | FILL/HUG/FIXED ✔R · `radius/md` ✔ | `background/normal` ✔ | `heading-lg` ✔ |

<!-- 모달/오버레이가 있으면 별도 표:
## Visual Spec — Modal ({modal node})
| Section/Node | direction | gap | padding | align/justify | sizing | color | type |
... -->

## Data Corrections / Override Log
<!-- 소스(Figma/facts/컴포넌트 문서)가 틀렸거나 신뢰 불가해 **다르게 구현**한 칸 + 근거.
     ScreenSpec 의 Open Decisions 에 대응하는 시각 축 장치. 없으면 빈 표 유지(검토했음의 증거). -->
| 항목 | 소스가 말한 것 | 실제 · 근거 | 구현 결정 / 후속 |
|---|---|---|---|
| {예: 모달 이어하기} | variant=danger + fill #2563eb | 긍정 액션=primary 의도 · #2563eb 비토큰 | color=primary 구현 · Figma variant 수정 요청 |

## Assets
| node | 소스 (DS path 또는 components/ui/icons.tsx) | format | 상태 |
|---|---|---|---|
| {icon/...} | {disign-file/assets/... 또는 icons.tsx: XxxIcon} | svg/tsx/png | {✅ 사용가능 / ⚠ 추가 필요} |

## Gaps / Open
<!-- 남은 ⚠ — raw 미토큰화 값, 그라데이션/에셋 부재 등. 결정 필요하면 D-xxx 연결. -->
- {예: gap 48·64 는 spacing 토큰 부재(raw) — 토큰화 결정 D-xxx}
- {예: 동일값 토큰 다중후보 — boundVariables ID 로만 확정(Professional Variables API 부재)}

## Cross-links
- facts(기계 인터페이스) · baseline: **프레임별로 위 `## Frame` 절에 기재**(모달 등 추가 프레임은 각자 facts/baseline)
- screen-spec(동작 단일출처): ./screen-spec.md
- 추출 스크립트(재생성): 외부 수집 스크립트(런 디렉터리 — 비추적). ※ 파일럿용 하드코딩(file_key·SECTION·targets·date) — 다른 run/screen 은 그 값들을 수정 후 사용. 수집 구현은 킷 core 밖 — 킷은 표준 visual-spec 계약만 정의.
