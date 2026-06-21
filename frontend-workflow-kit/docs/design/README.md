# Design Docs

킷의 설계 문서 중 정식 코드/정책 문서는 아니지만, GitHub 에서 장기적으로 읽고 토론할 필요가 있는 문서를 둔다.

## Structure

```txt
drafts/   설계 초안. 구현 지시가 아니라 토론/후속 PR 의 근거.
final/    합의가 끝나 정본으로 승격된 설계. (아직 없음)
```

## Drafts

- [Customizable Architecture](drafts/customizable-architecture/README.md) — Tier 1 layout profile 과 Tier 2 router adapter 설계.
- [Follow-up Quarantine and Role Expansion](drafts/follow-up-quarantine-and-role-expansion.md) — 작업 중 발견되는 후속 격리와 architecture role 확장 기준.
- [Visual Spec 정식화](drafts/visual-spec-formalization.md) — figma-component-mapping 에 화면별 시각 계약(`## Visual Spec`) 강화. 수집기는 킷 core 밖, warning-first, 새 축 아님.
- [Visual Spec OD 결정 기록](drafts/visual-spec-od-decisions.md) — VS-1~VS-4 사람-수용(방향 채택). 순차 실행 계획 + 불변식(hard 게이트는 향후 별도 OD).
- [E2E Evidence](drafts/e2e-evidence/README.md) — PR69 dogfood 후속. testID를 screen-spec/accessibility 선언 계약으로 정리(누가 선언/언제 삽입/누가 소비·네이밍 규약·금지) + E2E evidence 운영 규율(Web=Playwright, Native=Maestro/Detox·drift·warning-first). "E2E는 evidence, 게이트 아님."
