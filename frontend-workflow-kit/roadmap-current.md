# Current Roadmap

> 스냅샷: 2026-06-13 (commit `34b7f82` Codex 교차리뷰 직후).
> 목적: **구현된 것 / 설계만 된 것 / 후속**의 경계를 한 파일로 고정한다.
> 문서별 역할·링크는 [README 문서 지도](README.md#문서-지도) 참조.

## 핵심 루프

```txt
Input Skill → Reconciliation → Documents → State → Readiness → Work → Validate
```

MVP-A 에서 결정적으로 강제되는 구간은 **Documents → State → Readiness → Validate** 다.
앞단(Input Skill·Reconciliation)은 아직 문서 계약이며, 실제 게이트는 readiness 다운그레이드가 담당한다.

## 산출물 축 (artifact axes)

```txt
저작 문서        screen-spec / navigation-map / llm-rules / domain-rules
생성 상태        _meta/workflow-state.yaml · screen-inventory.yaml
결정             Open Decisions (readiness cap)
입력 정합        Input Reconciliation (register · conflict · re-open)
조사/검증        Investigation / Verification (evidence handoff)
리뷰             Review Gates (후속)
```

이 목록은 **닫혔다**. 지금 단계의 목표는 새 축을 더 만드는 게 아니라 위 축들의 경계를 선명히 하는 것이다.

## MVP-A 구현됨 (코드로 강제)

- 템플릿: screen-spec(통합형+stub) · navigation-map(뼈대) · llm-rules · domain-rules · component-gap-register · conflicts
- `workflow-state.mjs` — frontmatter+본문 파싱, derived 값(`open_decisions_count`·`blocking_decisions` 포함) 생성
- `readiness.mjs` — `readiness_mode = min(fact_mode, decision_cap)` 다운그레이드 + malformed Open Decision **fail-closed**
- `validate.mjs` — 검사 8종 (CI exit 0/1)
- Open Decisions readiness cap — 저작 규칙 + **게이트 해제는 사람-전용** 불변식 (LLM 은 open 추가/재오픈만)
- golden example: `coupon-feature` (end-to-end 1회 완주)

## MVP-A 설계만 됨 (문서 계약, 미강제)

- **Input Reconciliation** — register · Reconcile Status 라이프사이클 · conflict 수동 로그 · `resolved→open` 재오픈 계약. 실제 게이트는 여전히 Open Decision/Unknown 이고 readiness 가 막는다.
- **Investigation / Verification** — 조사/검증 문서는 evidence 핸드오프 아티팩트. readiness 가 `blocks_mode` 를 직접 파싱하지 않는다. 막는 조사는 연결된 Open Decision/Unknown 을 만들어야 하고, 그 연결 항목이 MVP-A 의 blocker 다.
- **Review Gates** — `temp/review-gates-notes.md` 스크래치 메모만 존재. 구현 없음.

## 후속 / Later (아직 구현하지 않음)

- Open Decisions **validate 스키마 검사** (표 형식·`Status` enum·`Blocking Mode` 유효성·전역 ID 중복·`forbidden_paths` backstop)
- **reconcile-input 스킬** (Input Skill 결과를 register 로 반영)
- Reconciliation Register **hook/CI 강제**
- Investigation / Verification **템플릿 + manifest 등록**
- `investigation.blocks_mode` **readiness 파싱**
- **Review 아티팩트 + 하드 게이트** (soft 아티팩트 → 템플릿 → readiness/validate 게이트 순으로 점진)
- decision-log.md 전역 이관 · deferred+Reversible+Assumptions 묶음 · 교차-화면 참조 (open-decisions.md 후속 절)

## 다음 구현 후보 (하나를 명시적으로 고를 때만 착수)

1. ✅ 템플릿 재오픈 문구 정렬 — *완료 (이번 패스)*
2. ✅ README 문서 지도 — *완료 (이번 패스)*
3. ✅ roadmap-current.md — *이 파일*
4. Open Decisions validate 스키마 검사를 다음으로 할지 결정
5. reconcile-input 스킬을 다음으로 할지 결정

## 지금 하지 말 것

- 새 산출물 축 추가 — idea surface 확장 금지
- 구현 후보 중 하나를 명시적으로 고르지 않은 채 MVP-A 확장
- LLM 이 게이트를 **내리게** 만드는 자동화 (resolve/confirm/conflict-close 는 사람-전용 불변식 유지)
- Review Gates 하드 게이트 (현재는 future/soft only)
