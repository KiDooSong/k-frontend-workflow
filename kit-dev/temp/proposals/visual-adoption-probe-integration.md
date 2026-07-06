# visual-adoption-probe-integration — adoption-probe optional visual observation

> 작성일: 2026-07-06 · 상태: 구현 동반 design note (짧게 유지)
> 선행: PR144 `visual-reconciliation-consistency` · PR145 `visual-contract-bootstrap-adoption`
> 계약 정본: [visual-reconciliation.md](../../../frontend-workflow-kit/docs/reference/visual-reconciliation.md) —
> 이 노트는 통합 결정만 기록하고 visual 규칙을 복제하지 않는다.

## 왜 필요한가

PR144/145 이후 brownfield consumer repo 의 실제 도입 흐름이 둘로 갈라져 있다:

1. `workflow:adoption-probe` — repo 구조/roles/readiness/validate/catalog 를 scratch copy 에서 draft-only 로 진단.
2. 별도로 `workflow:visual-contract-bootstrap` → `workflow:visual-consistency` 를 수동 실행.

그 결과 "이 repo 에 visual contract 를 도입할 가치가 있는가 / 어떤 family 부터인가 /
어떤 warning 이 반복되는가"를 사람이 두 출력물을 손으로 합쳐 판단해야 했다.
이번 PR 은 adoption-probe 에 **optional** `--visual` observation 을 붙여 그 간극을 줄인다.

## adoption-probe ↔ visual-contract-bootstrap 관계

- adoption-probe 는 이미 scratch copy(`<probe-run>/scratch/project/`)를 만들어 기존 workflow
  명령을 관측한다. visual observation 은 **같은 scratch copy** 를 대상으로
  `visual-contract-bootstrap.mjs` 를 실행하고, contract 가 있거나 bootstrap draft 가
  생기면 `visual-consistency.mjs` 도 실행해 관측 결과만 남긴다.
- bootstrap JSON 은 `observations/visual-contract-bootstrap.*` 로, consistency JSON 은
  `observations/visual-consistency.*` 로, markdown draft 는
  `<probe-run>/visual/visual-consistency-contract.draft.md` 로 — 전부 probe run dir 내부에만 쓴다.
- probe 는 두 도구의 소비자일 뿐이다 — visual 로직/규칙은 PR144/145 lib 그대로 재사용하고
  fork 하지 않는다.

## 원칙 (그대로 유지되는 것)

- **scratch-only / draft-only / observation-only.** live consumer docs/src 는 절대 수정하지 않는다.
  visual 출력물은 전부 `<probe-run>/` 아래다.
- **visual report 는 gate 가 아니다.** bootstrap 후보와 visual-consistency warning 은 진단이지
  approval / readiness promotion / `confirmed` 승격이 아니다. visual 명령이 실패해도
  adoption-probe 의 exit behavior 를 바꾸지 않는다 (finding 으로만 기록).
- **bootstrap suggested rows 는 canonical contract 가 아니다.** draft 는 자동 적용되지 않고,
  사람이 리뷰해 accepted rows 만 canonical `design/visual-consistency-contract.md` 에 수동
  반영한다. 기존 contract 는 overwrite 하지 않는다 (PR145 CLI 가드 그대로).
- canonical contract 가 없으면 consistency 는 **bootstrap draft contract 기준 advisory** 로만
  실행하고, report 에 draft 기준임을 명시한다.
- 새 workflow stage / artifact axis 없음 — adoption-probe output 은 여전히 review/draft
  observation 이지 canonical artifact 가 아니다.

## adoption report 요약 방식

adoption report 에 `Visual Reconciliation Adoption` 섹션 1개를 추가한다:
status(skipped/observed/failed) · bootstrap 요약(screens/families/suggested rows/gap candidates/findings) ·
existing contract 발견/사용 여부 · consistency 요약(contract source · warning/error counts · top rules) ·
recommended next actions · boundaries(not a gate / no live edits / human-only promotion).
JSON(probe-summary + `--json`)에는 counts 와 observation 파일 pathRef 만 넣고 raw stdout 을
중복 embed 하지 않는다. 출력은 기존 probe sanitization(`<probe-run>`/`<target-repo>`) 규약을 따른다.

## 이번 PR 에서 하지 않는 것

- `--apply` / `--overwrite` / `--enforce` / `--visual-out`(run dir 밖 출력) 추가 금지.
- CI required check / hard gate / readiness fact 배선 금지.
- Open Decision resolve · Unknown close · Component Gap accept · confirmed 승격 금지 (사람 전용 그대로).
- visual 규칙 문서 복제 금지 — 상세 계약은 visual-reconciliation.md 한 곳.

## dogfood telemetry 이후에나 검토할 후속

- visual observation 을 adoption-probe 기본값으로 켤지 (현재 opt-in `--visual`).
- bootstrap alias import 해소(PR145 TODO)와 copy 휴리스틱 정밀화가 probe 요약 품질에 주는 영향.
- 반복 실행 telemetry 기반의 warning trend 요약 (probe 는 현재 single-run observation 만).
- visual-consistency `--enforce`/CI 승격 여부 — 별도 Open Decision 으로만.
