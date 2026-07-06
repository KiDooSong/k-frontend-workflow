---
name: visual-reconcile
description: 여러 화면에 걸친 Figma/visual spec/design input을 기존 ScreenSpec, figma-component-mapping, component catalog, visual consistency contract와 대조하고, 구현 전후의 visual consistency warning-first 검사를 수행한다. 사용자가 "비주얼 스펙 반영", "Figma 업데이트 일괄 반영", "여러 화면 visual 정합성 맞춰줘", "로고/레이아웃 공통 정리" 등을 요청할 때 사용.
---

# visual-reconcile

여러 화면에 걸친 visual/Figma/design 업데이트를 기존 workflow 문서와 대조하고,
shared shell/logo/header/CTA ownership 이 화면별 ad-hoc patch 로 흩어지지 않게 한다.
운영 계약 정본: [visual-reconciliation.md](../../docs/reference/visual-reconciliation.md).
시각 vs 행동 분리 정본: [input-reconciliation.md](../../docs/reference/input-reconciliation.md) §Visual/Figma.
어떤 사실이 어느 문서에 사는지: [doc-ownership.md](../../docs/reference/doc-ownership.md).

> **통과는 승인이 아니다.** `workflow:visual-consistency` 는 warning-first 진단이다 —
> warning 유무는 approval, readiness promotion, `confirmed` 승격, gate 가 아니다.
> Open Decision resolve · Unknown close · Component Gap accept · `confirmed` 승격은 사람만 한다.

## 핵심 불변식

- **raw Figma 를 직접 해석하는 스킬이 아니다.** raw source 수집/해석은 consumer 의
  source-specific producer(Stage 01) 소관이다.
- visual/Figma 입력은 behavior 의 단일 출처가 아니다 — behavior 변경은 ScreenSpec /
  Navigation Map / Open Decision 경로만 탄다.
- 카탈로그에 없는 shared component 는 Component Gap `G-xxx open` **제안만** 한다.
- visual exception 은 Reason + decision_id/reference 없이는 남기지 않는다 (silent pass 금지).
- 구현은 implement-screen 경로(readiness `allowed_paths`)를 우회하지 않는다.
- 게이트를 올리는 방향(Open Decision 추가/재오픈, Conflict/Unknown/Gap 기록)만 한다.

## 1. Preflight

1. canonical input artifact 가 없으면 먼저 만들게 한다 — `workflow:create-input` 또는
   consumer 의 source-specific producer([Stage 03](../../docs/reference/workflow-stages/03-create-canonical-input-artifact.md)).
2. Reconciliation Register 를 먼저 확인한다. 관련 input 이 `not-started`/`in-progress`/`failed`
   면 [Stage 04](../../docs/reference/workflow-stages/04-reconcile-input.md) 계약(register-first, 같은 row 재개)을 따른다.
3. 대상 화면이 raw source 코드/alias 뿐이면 [Stage 02](../../docs/reference/workflow-stages/02-screen-identity-source-mapping.md)로
   canonical id 를 먼저 푼다 — canonical Screen ID 를 발명하지 않는다.

## 2. Context load

대상 범위만 읽는다: affected screens/domains, ScreenSpec, `figma-component-mapping.md`,
visual consistency contract(`design/visual-consistency-contract.md` — 없으면 cold start,
[템플릿](../../templates/design/visual-consistency-contract.template.md)으로 draft 제안 가능),
component catalog, component-gap-register, Open Decisions/Unknowns/Conflicts, readiness 출력.
e2e visual capture 문서([e2e-visual-capture.md](../../docs/reference/e2e-visual-capture.md))는
capture/evidence 요청이 있을 때만 읽는다.

## 3. Classification

입력 항목마다 분류한다 (어휘 정본: [input-reconciliation.md](../../docs/reference/input-reconciliation.md) §Classification):
visual-only simple update · behavior-impacting update · component-gap ·
shared shell/layout ownership change · copy draft update ·
conflict with resolved/confirmed source · investigation-needed · scope-unclear.

## 4. Update rules

- **visual-only fact** → 해당 화면 `figma-component-mapping.md`, 또는 cross-screen
  ownership 이면 visual consistency contract.
- **behavior 변경** → ScreenSpec / Navigation Map / Open Decision 경로 (Figma 가 암시해도
  behavior 로 확정하지 않는다).
- **카탈로그에 없는 shared component** → Component Gap 제안만 (`G-xxx open`).
- **Open Decision** 은 추가/재오픈만 — resolve 금지.
- 입력이 준 **copy 값은 draft** 로만 적는다 — confirmed 승격은 사람.
- **visual exception** 은 Reason + decision_id/reference 와 함께만 기록한다.
- shared shell/header/logo/CTA/layout ownership 이 걸린 변경은 screen file patch 가 아니라
  contract 갱신 또는 shared component decision 으로 올린다.

## 5. Implementation handoff

- 이 스킬 자체는 implement-screen 을 우회하지 않는다. 코드 작업이 요청됐고 readiness 가
  허용하면 [implement-screen](../implement-screen/SKILL.md) 규칙으로 넘긴다.
- multi-screen batch 작업은 **screen family + shared owner 단위로 먼저 묶는다** —
  같은 shell 을 쓰는 화면들을 한 단위로 계획하고, per-screen ad-hoc patch 보다
  shared shell/layout/component 업데이트를 우선한다. 단, 항상 readiness
  `allowed_paths` 안에서만.

## 6. Validation

항상 실행한다:

```bash
npm run workflow:state
npm run workflow:readiness -- --screen <ID> --json   # 관련 화면마다
npm run workflow:visual-consistency -- --docs <docsDir> --src <srcDir> --json
npm run workflow:validate
```

- state/readiness/validate 에 전달한 **동일한 `--docs`/`--src` 기준**을 visual-consistency 에도
  전달한다 (monorepo 포함). `--src` 를 빼면 핵심 소스 검사(직접 import · ad-hoc positioning ·
  hardcoded copy)가 통째로 skip 된다 — 디렉토리가 아닌 `--src`(오타 등)는 `source-not-found` warning 으로 표면화된다.
- 소스 파일이 바뀌었으면 가장 작은 관련 lint/test 를 먼저 돌린다.
- visual evidence 가 요청되면 [e2e-agent](../e2e-agent/SKILL.md) `capture` 를 optional
  Stage 08 evidence 로 호출한다 — screenshot 을 pass/fail approval 로 다루지 않는다.
- `workflow:visual-consistency` 의 warning 은 고칠 후보 목록이지 차단이 아니다.
  `--enforce`/CI 배선은 하지 않는다.

## 7. Final report

포함한다: affected screen families · 갱신한 문서 · visual contract 변경 ·
제안한 component gaps · 생성/재오픈한 Open Decisions/Unknowns/Conflicts ·
visual consistency findings 요약 · 실행한 검증 명령/결과 ·
**의도적으로 하지 않은 일**: approval, confirmed 승격, hard gate/CI 승격,
Component Gap accept, Open Decision resolve.
