<!--
  ════════════════════════════════════════════════════════════════════════════
  DRAFT 템플릿 (figma-fidelity-001 산출) — 킷 정본 아님.
  figma-fidelity-001 의 L010 + J020(3화면) 추출·구현·검증에서 얻은 학습으로
  기존 templates/screen/figma-component-mapping.template.md 를 "화면별 시각 계약"으로
  정식화한 제안. 킷 templates/ 로의 승격은 사람-승인 Open Decision 으로(킷 규율).

  ── 추출 산출물 3계층 (이 문서가 떠받치는 모델) ──────────────────────────────
  1. Raw     : node.rest.json     — REST 원본(6~10k줄). **아카이브, 아무도 안 읽음.**
               gitignore + extract-raw.mjs + file_key/node 로 재생성(재현성은 스크립트에서).
  2. Facts   : implementation-facts.json — distill(instance에서 가지치기 + 토큰 해소).
               **기계 인터페이스** — 구현자가 실제로 읽는 단일 입력. 정본 유지.
  3. Contract: 이 문서(figma-component-mapping) — **사람 계약**. 토큰 ID·출처마커·override 로그.

  ── 경계 (기존 유지) ─────────────────────────────────────────────────────────
  - 비즈니스 동작 = ScreenSpec(단일 출처). 여기엔 안 적는다("어떻게 보이나"만).
  - 컴포넌트 정본(존재·props) = 전역 component-catalog. 갭은 component-gap-register(G-xxx).
  - 값은 토큰 ID. 토큰 없는 값은 `raw` 명시. 데이터가 틀려 override 한 건 ## Data Corrections 에.
  - 표 헤더는 바꾸지 않는다.
  ════════════════════════════════════════════════════════════════════════════
-->
---
artifact_id: "{SCREEN_ID}-figma-component-mapping"
artifact_type: figma-component-mapping     # per-screen(화면당 1개). 전역 컴포넌트 정본 = design/component-catalog.md
domain: "{domain}"
screen_id: "{SCREEN_ID}"
status: draft                              # missing|draft|review|confirmed|implemented|verified (confirmed 승격=사람만)
mode: light                               # 추출 모드(현재 light only). 다크/멀티모드는 후속.
sources:
  - { type: figma, ref: "{frame name} / node {node-id}" }
figma:
  file_key: "{FILE_KEY}"                  # ★ REST 재호출 필수 (L010 누락 교훈). figma.com/design/<KEY>/...
  node: "{node-id}"
facts: "{rel path}/implementation-facts.json"   # ★ 기계 인터페이스(REST distill). raw(node.rest.json)은 gitignore·재생성.
baseline: "{rel path}/baseline.png"
last_reviewed: "{YYYY-MM-DD}"
# status: confirmed 승격 시에만 사람이 추가: approved_by / approved_at / decision_id
---

# Figma Component Mapping (화면별 시각 계약): {화면 이름}

> 시각=Figma(이 문서), 동작=ScreenSpec(단일 출처), 컴포넌트 정본=component-catalog(전역).
> 값은 **토큰 ID**(또는 `raw` 명시). 데이터가 틀려 다르게 구현한 칸은 `## Data Corrections`.

## 출처 범례 (Provenance) — 모든 값 칸에 마커 1개
- `✔`  get_variable_defs(used-variables) 직접 — 토큰명 신뢰
- `✔R` **REST node 정확값**(facts: itemSpacing·padding·layoutMode·layoutSizing·cornerRadius·characters·componentProperties)
- `◎`  DS 컴포넌트 계약 내부값(화면 추출 아님 — component-catalog 소관)
- `▱`  좌표 역산 — **지양**(REST 있으면 `✔R` 로 교체)
- `⚠`  추론/리터럴/미해결 → `## Gaps` 또는 `## Data Corrections`

## Frame
- {frame name} / node `{node-id}` · {W}×{H} · {mode}

## Component Mapping
<!-- "어떤 Figma 노드 = 어떤 카탈로그 컴포넌트". 미보유는 (G-xxx, component-gap-register). -->
| Figma Node | UI 요소 | 컴포넌트 import | variant/props | 비고 |
|---|---|---|---|---|
| {node} | {UI 요소} | {components/ui/Xxx 또는 features/{domain}/components/Xxx} | {size=lg · state=default · …} | {(G-xxx) 등} |

## Visual Spec
<!-- 노드별 auto-layout/토큰. 값 = 토큰 ID + 출처마커. 토큰 없으면 `raw`. 컴포넌트 내부는 ◎(여기 미지정). -->
| Section/Node | direction | gap | padding | align/justify | sizing | color | type |
|---|---|---|---|---|---|---|---|
| {Section/Node} | row/column | `space.N`(px) ✔R · 또는 `raw N` | t/r/b/l ✔R | justify / align ✔R | FILL/HUG/FIXED ✔R · `radius.*` | `color.*` ✔ | `type.*` ✔ |

## Data Corrections / Override Log   ★ (신설)
<!-- 소스(Figma/facts/컴포넌트 문서)가 틀렸거나 신뢰 불가해 **다르게 구현**한 칸 + 근거.
     ScreenSpec 의 Open Decisions 에 대응하는 시각 축 장치. 빈 표라도 둔다(검토했음의 증거). -->
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
- facts(기계 인터페이스): {rel}/implementation-facts.json
- baseline: {rel}/baseline.png
- screen-spec(동작 단일출처): ./screen-spec.md
- 추출 스크립트(재생성): temp/runs/figma-fidelity-001/extract-raw.mjs
