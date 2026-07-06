# Visual Reconciliation

> Consumer reference for reconciling multi-screen visual/Figma/design updates and
> keeping cross-screen visual consistency. Canonical home for the
> `visual-consistency-contract` artifact and the `workflow:visual-consistency`
> warning-first check. Skills ([`visual-reconcile`](../../skills/visual-reconcile/SKILL.md),
> [`implement-screen`](../../skills/implement-screen/SKILL.md)) link here and do not
> restate these tables.

## Purpose

여러 화면에 걸친 visual/Figma/design 업데이트에서 **screen family / shared shell /
shared component / copy / layout / logo drift** 를 줄인다. 단일 화면 구현 품질(그건
ScreenSpec + readiness + figma-component-mapping 의 몫)이 아니라 **cross-screen
consistency** 를 다룬다 — "이 화면이 맞게 구현됐나"가 아니라 "이 화면들이 같은
공통 계약 위에 있나".

## Non-goals

- Figma raw API parser 가 아니다. raw source 해석은 consumer 의 source-specific
  producer(Stage 01) 소관이다.
- pixel-perfect visual regression gate 가 아니다. baseline 비교/스크린샷 판정을 하지 않는다.
- approval / readiness promotion / `confirmed` promotion 이 아니다.
- consumer repo 의 디자인 시스템을 대신 설계하지 않는다.
- behavior semantics 를 Figma 로 확정하지 않는다 — behavior 는 ScreenSpec / Navigation
  Map / Open Decision 경로만 탄다([input-reconciliation.md](input-reconciliation.md) §Visual/Figma).

## Where it sits in the workflow

새 stage 가 아니다. 기존 [workflow spine](workflow-spine.md) 안에서 다음 위치를 쓴다.

| Stage | 이 흐름에서 하는 일 |
|---|---|
| 03/04 | canonical input artifact 생성 + Reconciliation Register register-first 처리 |
| 05 | ScreenSpec / figma-component-mapping / visual-consistency-contract 저작·갱신 |
| 06 | readiness `allowed_paths` 안에서만 구현 (implement-screen 경유) |
| 07 | 해당 시 generated views 재생성 (`workflow:catalog` 등) |
| 08 | `workflow:visual-consistency` 실행 + validate/report/evidence handoff |
| 09 | 사람-전용 결정: Open Decision resolve, Gap accept, `confirmed` 승격, contract confirm |

## Visual reconciliation flow

여러 화면에 걸친 visual/Figma/design 입력이 들어오면:

1. **canonical input artifact 를 먼저 만든다** (`workflow:create-input`, Stage 03).
   raw Figma/디자인 파일을 직접 문서에 반영하지 않는다.
2. **Reconciliation Register 를 먼저 갱신한다** (register-first, Stage 04).
3. **affected screens / domains / families 를 찾는다** — 입력의
   `affected_screens`/`affected_domains` 와 contract 의 family 멤버십으로.
   raw source 코드는 [screen-identity.md](screen-identity.md) 로 canonical id 를 푼 뒤에만.
4. **기존 산출물을 읽는다**: 대상 ScreenSpec, figma-component-mapping,
   visual-consistency-contract, component catalog, component-gap-register,
   Open Decisions / Unknowns / Conflicts, readiness output.
5. **분류한다**: visual-only update / behavior-impacting update / component-gap /
   conflict / open-decision / investigation-needed
   ([input-reconciliation.md](input-reconciliation.md) §Classification 의 어휘 그대로).
6. **shared ownership 이 걸린 변경은 위로 올린다** — shared shell/header/logo/CTA/layout
   ownership 을 바꾸는 변경은 screen file patch 가 아니라 visual-consistency-contract
   갱신 또는 shared component decision(Component Gap / Open Decision)으로 처리한다.
7. **문서 업데이트 후 검증한다**: `workflow:state` → `workflow:readiness` →
   `workflow:validate` → `workflow:visual-consistency`(warning-first). 앞 명령들에
   전달한 것과 **동일한 `--docs`/`--src` 기준**을 전달한다 — `--src` 가 없으면 소스
   휴리스틱(직접 import·ad-hoc positioning·copy)이 skip 되고, 디렉토리가 아닌 `--src`(오타 등)는
   `source-not-found` warning 으로 표면화된다(존재하지만 잘못된 디렉토리는 잡지 않는다).
8. **구현은 implement-screen 또는 사람 지시로 넘긴다** — 이 흐름 자체는 readiness
   경계를 우회하지 않는다.

## Cross-screen visual contract

`visual-consistency-contract` (기본 경로
`docs/frontend-workflow/design/visual-consistency-contract.md`, 템플릿:
[visual-consistency-contract.template.md](../../templates/design/visual-consistency-contract.template.md)).

**이 계약은 route/screen identity 의 단일 출처가 아니다.** canonical Screen ID 는
ScreenSpec/screen-identity 가, 시각 매핑은 figma-component-mapping 이, 컴포넌트
존재는 component catalog 가 소유한다. 이 문서는 그것들을 **참조해서** 여러 화면의
공통 visual/layout/component ownership 만 정리하는 정합성 계약이다.

권장 필드 (Screen Families / Shared Component Rules / Visual Exceptions 표):

| Field | 의미 |
|---|---|
| screen family | 같은 shell/레이아웃 계약을 공유하는 화면 그룹 이름 |
| member screens | canonical Screen ID 목록 (발명 금지 — ScreenSpec 과 일치해야 함) |
| layout/shell owner | family 의 레이아웃을 소유하는 shell/layout 컴포넌트 |
| logo policy / header policy / CTA policy | shell-owned 인지, 화면별 허용인지 |
| spacing/token source | 시각 값의 토큰 출처 (raw 값 하드코딩 방지) |
| copy source | Copy Keys / i18n 등 문구의 정본 |
| allowed shared components | family 화면이 쓰는 공유 컴포넌트 (catalog 참조) |
| forbidden direct imports / ad-hoc positioning | screen file 이 직접 하면 안 되는 패턴 |
| exceptions | 예외 화면 + reason + decision_id (silent pass 금지) |
| status | draft / review / confirmed — **confirmed 승격은 사람만** |

## Drift candidates

`workflow:visual-consistency` 가 warning-first 로 표면화하는 후보들:

- shell-owned component 를 screen file 이 **직접 import** (`direct-screen-import`)
- BrandLogo/logo-like component 주변 ad-hoc margin/top/translate/absolute
  class·style (`adhoc-positioning` — 휴리스틱, repo 별 스타일 차이로 advisory)
- 같은 family 인데 일부 화면만 figma-component-mapping 누락 (`figma-mapping-missing`)
- contract 의 shared component 가 component catalog 에 없음
  (`component-gap-candidate` — Component Gap **제안** 후보. 직접 생성/카탈로그 수정 금지)
- contract 가 참조하는 member screen 의 ScreenSpec 부재 (`screen-not-found`)
- Copy Keys 가 있는데 screen file 에 hardcoded user-visible copy 후보
  (`hardcoded-copy-candidate` — 오탐 가능성이 높아 info 강등)
- visual exception 행에 Reason/Decision ID 누락 (`exception-hygiene` —
  예외는 silent pass 가 아니라 명시적 기록이어야 한다)

기록된 예외(Reason + Decision ID가 있고 해당 컴포넌트를 지목)는 그 화면의
direct-import/positioning finding 을 info 로 강등한다 — 보이되 경고로 쌓이지 않는다.

## Output / reporting

- **warning-first**: warning 만 있으면 exit 0. `--enforce` 로만 warning 을 exit 1 로
  승격할 수 있고, 이 플래그를 CI/validate 에 배선하는 것은 이번 계약 밖이다.
  구조 자체가 깨진 경우(contract frontmatter YAML 오류, docs 경로 부재 등)만 error/exit 1.
- **contract 부재 = 조용히 skip** (cold start 를 막지 않는다 — check 12 NO-OP 동형).
- **`--json`**: deterministic, machine-readable (정렬 고정, 타임스탬프 없음). 스킬이
  파싱해 소비한다. `--out <path>` 로 같은 payload 를 파일로 남길 수 있다(선택).
- 결과 요약은 Stage 08 handoff/run-report 에 넣을 수 있다. 필요하면 e2e-agent
  `capture` 로 관련 화면의 screenshot evidence 를 추가하되, screenshot 은 advisory
  evidence 일 뿐이다([e2e-visual-capture.md](e2e-visual-capture.md)).
- **CI / hard gate 승격은 이번 범위가 아니다** — dogfood telemetry 이후 별도
  Open Decision 으로만 검토한다.

명령 syntax 는 [COMMANDS.md](../../COMMANDS.md) §Visual Consistency,
2차 산출물 판단은 [task-artifact-matrix.md](task-artifact-matrix.md).
