---
name: visual-contract-bootstrap
description: consumer repo의 ScreenSpec, figma-component-mapping, component catalog, screen_entry/source hints를 scan해 visual consistency contract 초안과 screen family/shared ownership 후보를 review-only로 제안한다. 사용자가 "visual contract 초안 만들어줘", "로고/레이아웃 공통 규칙 후보 뽑아줘", "사내 repo에 visual consistency 도입 준비해줘" 등을 요청할 때 사용.
---

# visual-contract-bootstrap

contract 가 없는(또는 빈약한) consumer repo 에 visual consistency contract 도입을
준비한다 — 기존 docs/src 에서 후보를 뽑아 **review-only draft** 로만 제안한다.
운영 계약 정본: [visual-reconciliation.md](../../docs/reference/visual-reconciliation.md)
§Bootstrap / adoption. 어떤 사실이 어느 문서에 사는지:
[doc-ownership.md](../../docs/reference/doc-ownership.md).

> **draft 는 승인이 아니다.** bootstrap 출력의 family/owner/policy/gap 후보는
> approval, readiness promotion, `confirmed` 승격, gate 가 아니다. canonical contract
> 반영 · Component Gap accept · Open Decision resolve · `confirmed` 승격은 사람만 한다.

## 핵심 불변식

1. **canonical contract 를 직접 confirmed 로 만들지 않는다** — 출력은 언제나
   `status: draft` + review-only 표시.
2. **기존 contract 를 overwrite 하지 않는다** — 존재하면 existing rows / suggested
   additions 를 분리해 제안만 한다 (CLI 가 canonical 경로 overwrite 를 거부한다).
3. 반복 import 는 design intent 의 **proof 가 아니라 후보 증거**다 — 확신이 낮으면
   `needs-human-review` 그대로 보고한다.
4. behavior 는 ScreenSpec / Navigation Map / Open Decision 경로만 탄다 — bootstrap
   결과로 behavior 를 확정하지 않는다.

## 절차

1. **프로젝트 옵션 확인**: docs 루트(`docs/frontend-workflow` 기본)와 src 루트,
   monorepo 면 실제 기준 경로를 먼저 확인한다. 기존
   `design/visual-consistency-contract.md` 존재 여부를 본다.
2. **실행**:
   ```bash
   npm run workflow:visual-contract-bootstrap -- --docs <docsDir> --src <srcDir> --json
   ```
   범위를 좁히려면 `--domain <d>` / `--screen <ID[,ID...]>`. draft 파일이 필요하면
   `--out temp/visual-contract-draft.md` (canonical contract 경로는 파일이 있으면 거부된다).
   `--src` 를 빼면 소스 휴리스틱(shared import · ad-hoc positioning · copy)이 skip 된다.
3. **보고**: candidate family(confidence + evidence) · shared owner 후보 ·
   figma mapping coverage · component gap 후보 · Open Decision 이 필요해 보이는
   ownership 질문 · findings(direct import / ad-hoc positioning / hardcoded copy 관찰)를
   사용자에게 요약한다. `needs-review`/`needs-human-review` 값은 그대로 보여준다.
4. **사람 리뷰 후에만 전달**: 사용자가 승인한 항목만
   [visual-reconcile](../visual-reconcile/SKILL.md) 경로 또는 수동 doc update 로
   canonical contract 에 반영한다. 반영 후 `workflow:visual-consistency` 로 대조한다.
5. **사람 전용 경계**: Component Gap accept · Open Decision resolve · `confirmed`
   승격은 제안만 하고 실행하지 않는다. bootstrap 결과는 review-only evidence 다.

## 하지 않는 것

- 기존 contract/catalog/register 수정 · raw Figma 해석(Stage 01 소관) ·
  구현(implement-screen 소관) · gate/CI 배선 · confirmed 승격.
