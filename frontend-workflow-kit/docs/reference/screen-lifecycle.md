# Screen Lifecycle

ScreenSpec의 문서 승인 상태와 “현재 독립 화면으로 살아 있는가”는 서로 다른 축이다.

- `status`는 `draft → review → confirmed → implemented → verified` 등 문서 lifecycle이다.
- `screen_lifecycle`는 ScreenSpec 전용 현재 화면 lifecycle이며 `active | absorbed`만 허용한다.
- `screen_lifecycle`가 없으면 `active`다. active 기본값은 출력하거나 기존 문서에 일괄 추가하지 않는다.

## Frontmatter contract

일반 active ScreenSpec은 기존 frontmatter를 그대로 쓴다. 명시적
`screen_lifecycle: active`도 허용하지만 기본은 생략한다.

사람이 화면 통합과 canonical target을 확정한 뒤 source ScreenSpec을 다음처럼 보존한다.

```yaml
status: confirmed
screen_lifecycle: absorbed
absorbed_into: SIGNUP-NICKNAME
absorbed_at: 2026-07-15
```

- `absorbed_into`는 source와 다른, 전역에서 하나뿐인 active canonical Screen ID여야 한다.
- absorbed screen을 다시 가리키는 chain/cycle은 허용하지 않는다. 최종 active target을 직접 가리킨다.
- `absorbed_at`은 선택이며, 존재하면 실제 달력 날짜인 `YYYY-MM-DD`다.
- active ScreenSpec에 `absorbed_into`나 `absorbed_at`를 남기지 않는다.
- `status: absorbed`를 만들지 않는다. 기존 `status`와 승인 provenance를 유지한다.

`absorbed`는 파일 삭제나 문서 폐기를 뜻하지 않는다. 과거 route, `route_entry`,
`screen_entry`, 결정과 출처는 provenance로 남을 수 있지만 current route/implementation/path
ownership은 주장하지 않는다.

## Canonical target and failure behavior

분석기는 전체 ScreenSpec의 public Screen ID namespace에서 target을 해소한다. source/target
identity가 canonical 문자열이 아니거나, target이 누락·중복·self-reference·absorbed 상태이면
선언은 invalid다.

Invalid 선언은 화면을 숨기지 않는다. 해당 ScreenSpec은 active 집합에 남고 lifecycle error가
`workflow-state`에 기록되며 readiness는 `docs-only`, `allowed_paths: []`로 fail-closed한다.
오타 하나로 실제 live screen이 pending/readiness에서 사라지는 fail-open을 막기 위한 규칙이다.

본문의 `🪦`, `tombstone`, `canonical is ...` 문구나 route/source 파일 부재는 lifecycle 근거가
아니다. agent는 prose만 보고 absorption을 추론하거나 target을 발명하지 않는다. target이
불명확하면 [Screen Identity](screen-identity.md)와 Open Decision 경로에서 멈춘다.

## Generated state and readiness

- `workflow-state.yaml`의 `screens`와 `global.stub_screen_specs_count`는 live screen만 반영한다.
- valid absorbed ScreenSpec은 optional `absorbed_screens`에 provenance와 canonical redirect로 남는다.
- `screen-inventory.yaml`은 파일 inventory이므로 active와 absorbed를 모두 보존한다. ID duplicate는
  전체 파일 namespace, route duplicate와 layer inventory는 live namespace를 사용한다.
- readiness 기본 aggregate는 active screen만 포함한다.
- `--screen <absorbed-id>` 직접 조회는 `readiness_applicable: false`, null mode, 빈
  `allowed_paths`와 `absorbed_into`를 반환한다. source tombstone을 저작·구현하지 말고 canonical
  target을 사용한다.
- `workflow:packet`은 이 direct lookup을 손상된 입력이 아닌 정상 non-executable 결과로 보존하고,
  `workflow:run`은 `HALT_NOT_APPLICABLE`(exit 0)로 중단한다. 둘 다 canonical target을 안내만 하며
  target으로 자동 전환하거나 같은 요청의 구현 범위를 넓히지 않는다.
- shared surface membership, route/nav/doctor mapping, visual diagnostics와 current path ownership도
  같은 live-screen 판정을 사용한다.

Lifecycle marker가 없는 저장소에는 optional 키나 active 기본 필드를 추가하지 않으므로 기존
state/inventory/readiness/generated-view bytes가 유지된다.

## Absorption procedure

1. 사람이 active canonical target을 확정한다.
2. 유지할 계약·결정·출처를 target ScreenSpec에 반영한다.
3. source에 `screen_lifecycle: absorbed`와 `absorbed_into`를 기록한다.
4. 알 수 있으면 `absorbed_at`을 기록한다.
5. route/source 통합·제거는 별도 실제 변경으로 수행한다.
6. state와 generated views를 재생성한다.
7. aggregate에는 target만 남고 direct source 조회는 target을 가리키는지 확인한다.
8. validate를 실행하고 source tombstone 파일은 provenance로 보존한다.

기존 prose-only tombstone을 migration할 때도 target을 추측하지 않는다. 사람 또는 명시적
migration 입력이 canonical target을 확정한 건만 위 frontmatter로 전환한다.
