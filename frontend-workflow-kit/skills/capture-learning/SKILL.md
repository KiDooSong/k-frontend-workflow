---
name: capture-learning
description: 세션 끝 무렵 발견한 재현 가능한 교훈(워크플로우 갭·stale 문서·반복 우회·consumer vs kit 경계 혼란·validate 오탐)을 docs/frontend-workflow/_meta/session-learnings.md 에 구조화된 한 항목으로 append 한다. 사용자가 "이거 나중에 회고하자", "교훈으로 남겨", "킷 이슈 후보로 적어", "작업 중 발견한 문제 기록해", "session learning", "capture learning" 을 요청하거나 세션 후반에 워크플로우 갭/경계 문제가 드러났을 때 사용. 이슈를 자동 생성하지 않고, 결정/게이트/confirmed 상태를 건드리지 않으며, 검토·승격은 사람이 한다.
---

# capture-learning

세션 동안 발견한 **재현 가능한 교훈 하나**를 review backlog 에 남긴다. 메모리 시스템도, 자동 회고
엔진도, 게이트도 아니다 — 나중에 사람이 보고 kit 이슈 / consumer 작업 / 로컬 컨벤션 / skill·docs
업데이트 / 무대응 중 무엇으로 promote 할지 정하도록 **맥락을 보존**하는 게 전부다.

대상 파일: `docs/frontend-workflow/_meta/session-learnings.md`.
템플릿: [`../../templates/meta/session-learnings.template.md`](../../templates/meta/session-learnings.template.md).
이 동작은 [workflow spine](../../docs/reference/workflow-spine.md) 의
[Stage 08](../../docs/reference/workflow-stages/08-validate-and-report.md) 의 **선택적** 마지막 단계다 — 강제가 아니다.

## 언제 쓰나
- 사용자가 "이거 나중에 회고하자", "교훈으로 남겨", "킷 이슈 후보로 적어", "작업 중 발견한 문제 기록해" 라고 할 때.
- 세션 후반에 워크플로우 갭, stale 문서, 반복된 수동 우회, consumer-vs-kit 경계 혼란, `validate` 오탐을 발견했을 때.

## 핵심 불변식
- **append-only review backlog.** 한 항목을 추가만 한다. 검토 전에는 사실이 아니다 — 진실로 취급하지 않는다.
- **이슈를 자동 생성하지 않는다.** GitHub 이슈/태스크/PR 을 만들지 않고 API 도 호출하지 않는다. blocking 이면 일반 이슈/태스크를 *제안*만 한다.
- **게이트를 건드리지 않는다.** decisions / gaps / unknowns / `confirmed` / register status / 코드 / 생성 파일을 바꾸지 않는다.
- **비밀을 기록하지 않는다.** 토큰·자격증명·원본 비공개 소스 본문 금지. 경로·artifact id·명령·screen/input/decision id·redacted 요약만.
- **없는 정보는 발명하지 않는다.** 완벽한 재현이 필요 없다 — 모르면 `unknown` 으로 적는다.

## 절차
1. 실제로 남길 교훈이 있는지 확인한다. 없으면 멈춘다.
2. scope 를 분류한다: `consumer-repo` / `frontend-workflow-kit` / `both` / `unknown`.
3. 가능하면 workflow stage(00–10)를 적는다. 모르면 `n/a`.
4. 최소 맥락을 모은다 (템플릿의 "Minimum context checklist" 중 5개 이상): 무엇을 하려 했나 ·
   어떤 docs/files/commands 를 읽거나 실행했나 · 무엇을 기대했나 · 실제로 무슨 일이 났나 ·
   어떤 우회를 썼나 · 다음 검토자가 먼저 볼 것.
5. 파일이 없으면 위 템플릿으로 만든다. 다음 비어있는 `LRN-####` (zero-padded, 단조 증가) 항목을 append 한다.
6. 항목 id 와 한 줄 요약을 보고한다 (예: `LRN-0007: 카탈로그 재생성 리마인더 누락 (kit, skill update)`).
7. 긴급/blocking 이면 지금 일반 이슈/태스크를 만들자고 *제안*한다 — 자동으로 만들지 않는다.

## 금지
- 이슈/PR 자동 생성, GitHub API 호출.
- decisions/unknowns/gaps resolve·close·accept, `confirmed` 승격, register status 변경.
- 코드·테스트·생성 파일 수정 — 이 스킬은 `_meta/session-learnings.md` 한 파일만 건드린다.
- 비밀·자격증명·원본 비공개 소스 본문 기록.
- 모든 세션에 교훈을 강제하기 / 이 파일을 게이트로 만들기.
