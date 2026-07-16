# Shared Surface Behavior Contracts

`shared-surface-spec`은 둘 이상의 canonical 화면에 합성되지만 그 자체는 route/screen이 아닌 UI surface의 공통 동작 정본이다.
예: 세 화면에서 같은 규칙으로 동작하는 composer/input. 선택적 artifact이며 채택하지 않은 repo에는 새 필수 파일이 없다.

## Canonical artifact

```text
docs/frontend-workflow/domains/{domain}/surfaces/{surface}/surface-spec.md
templates/surface/shared-surface-spec.template.md
```

```yaml
artifact_id: CHAT-COMPOSER-shared-surface-spec
artifact_type: shared-surface-spec
domain: chat
surface_id: CHAT-COMPOSER
member_screens: [CHAT-001, CHAT-002]
implementation_paths:
  - src/features/chat/components/composer/**
status: draft
decision_refs: [D-220]
```

필수 frontmatter는 `artifact_id`, `artifact_type`, `domain`, `surface_id`, `member_screens`, `status`다.
`implementation_paths`, `api_required`, `decision_refs`와 공통 source/dependency/review/approval metadata는 선택이다.

## Identity and membership

- `surface_id`는 Screen ID와 같은 lexical shape를 사용하며 surface namespace에서 전역 유일하다.
- 첫 slice는 domain-scoped만 지원한다. 모든 member는 존재하는 canonical Screen ID이며 surface와 같은 domain이어야 한다.
- `member_screens`는 중복 없는 최소 2개다. 한 screen은 경로 소유권이 겹치지 않는 여러 surface에 속할 수 있다.
- membership의 canonical 선언은 surface frontmatter 한 곳뿐이다. ScreenSpec에 `surface_refs`를 수동 작성하지 않는다.
- nested surface/member surface는 지원하지 않는다.
- surface는 non-routable이다. `route`, `screen_id`, `route_entry`, `screen_entry`를 선언하지 않고 screen inventory row도 만들지 않는다.

`workflow:state`는 valid member ScreenSpec의 `derived.shared_surfaces`를 역색인한다. 이 값은 generated state이며 수동 authoring이 아니다.

## Behavior ownership

Surface가 소유하는 것은 모든 host에서 동일한 다음 계약이다.

- Purpose, UI Sections, Host Contract
- six-state State Matrix
- non-route Interaction Matrix(v2)
- Mutation Matrix, Data Requirements, API Candidates
- Copy Keys, Accessibility, Acceptance Criteria, Unknowns

경계는 다음과 같다.

| Concern | Canonical owner |
|---|---|
| screen identity, route, Entry Points, screen-specific behavior/route transition | ScreenSpec |
| 동일 surface의 state/interaction/mutation/host input-output | shared-surface-spec |
| domain-wide business rule | domain-rules |
| cross-screen visual/layout/component ownership | visual-consistency-contract |
| component existence/export evidence | component catalog |
| app-shell/deep-link/cross-domain navigation | navigation-map |

Surface Interaction Matrix는 `Result Type`이 있는 v2 표만 사용한다. 허용값은 `state|mutation|external|none`이며 `route`는 hard error다.
route edge는 affected member ScreenSpec에 남긴다. 따라서 이 artifact는 route-tree/nav-graph의 `/` normalization을 바꾸지 않는다.

## Open Decisions

Surface는 local `## Open Decisions` 표를 소유하지 않는다. surface 결정은 모두
`docs/frontend-workflow/global/open-decisions.md`의 canonical 6-column row이고 `decision_refs`로 참조한다.

State는 resolved row도 surface의 `derived.decision_refs`에 보존한다. Open row와 malformed/unresolved ref는 모든 declared existing member에
fan-out한다. canonical register provenance는 `source`, surface referrer provenance는 `via`에 보존된다.

첫 slice에서 같은 canonical decision이 한 screen에 둘 이상의 referrer로 도달하면 hard error다. 예:

- ScreenSpec 자체 `decision_refs` + member surface
- 같은 screen을 공유하는 두 surface

multi-referrer provenance array는 후속 범위이며 자동 dedupe로 통과시키지 않는다.

## Implementation path ownership

`implementation_paths`는 exact project-relative POSIX path 또는 하나의 좁은 terminal `/**` pattern이다. 다음은 거부한다.

- absolute/backslash/traversal/`.`/hidden segment
- terminal `/**` 이외 wildcard와 지나치게 넓은 pattern
- `docs/frontend-workflow/**` authoring/generated output
- 어떤 ScreenSpec의 `route_entry`/`screen_entry`와도 overlap
- 다른 surface ownership과 overlap

경로 존재는 필수가 아니다. 계약이 코드보다 먼저 생길 수 있다. absent/empty 값은 문서 계약으로 valid지만 code path를 허용하지 않는다.
물리 프로젝트 경로 소유권은 domain과 무관한 전역 namespace다. 따라서 같은 domain의 비멤버뿐 아니라 cross-domain 비멤버
ScreenSpec entry와 겹쳐도 `non-member-entry-overlap` 구조 오류다. 이미 해소된 member entry와의 겹침은 기존
`member-entry-overlap`으로 진단한다. 어느 경우에도 비멤버를 자동 member로 추가하거나 delegation을 부여하지 않는다.

선언은 권한이 아니다. path가 허용되려면 다음 전체 교집합을 만족해야 한다.

1. surface contract/membership/path ownership이 valid
2. surface fact mode와 canonical decision cap
3. 모든 member screen base readiness의 minimum cap
4. effective mode policy가 declared path 전체를 allow하고 forbid하지 않음
5. 모든 member base allowed/forbidden 결과가 declared path 전체를 allow하고 forbid하지 않음

```text
effective_surface_mode = min(surface_fact_mode, surface_decision_cap, member_cap)
```

structural/membership/path ownership error는 `docs-only`로 fail closed한다. Surface policy fact는 기존 mode ladder를 그대로 사용한다.
`screen_spec_status/authored`는 surface status/body에 매핑하고 API/state/interaction은 surface metrics를 사용한다.
`figma_mapping_status`와 `fake_hook_exists`는 neutral satisfied 값이다. 시각/hook ownership은 member cap과 path intersection이 계속 막는다.

Ordinary screen readiness는 member surface의 declared path를 `forbidden_paths`에 추가하고 `delegated_shared_surfaces`를 노출한다.
더 넓은 screen `allowed_paths`는 지우지 않지만 forbidden precedence 때문에 `implement-screen`은 그 path를 수정하지 않는다.

## Commands

```bash
npm run workflow:state
npm run workflow:readiness -- --surface CHAT-COMPOSER --json
npm run workflow:readiness -- --screen CHAT-001 --json
npm run workflow:validate
```

Surface output은 `surface_fact_mode`, `surface_decision_cap`, `member_cap`, `member_modes`, `limiting_members`,
`allowed_paths`, `forbidden_paths`, `path_authorization`, `blocking`, `next_actions`를 제공한다.
공유 코드는 [implement-shared-surface](../../skills/implement-shared-surface/SKILL.md) 절차로만 구현한다.

## Migration

기존 artifact-type 없는 prose workaround는 자동 변경하지 않는다. 명시적으로 채택할 때만:

1. canonical surface path로 옮기거나 복사하고 frontmatter/member를 작성한다.
2. uniform behavior를 template section으로 정리한다.
3. shared decisions를 global register로 옮기고 `decision_refs`로 연결한다.
4. route transition은 member ScreenSpec에 유지한다.
5. known code ownership만 narrow `implementation_paths`로 선언한다.
6. state, surface readiness, 모든 member readiness, validate와 관련 generated view를 실행한다.

기존 prose는 consumer가 채택/정리 범위를 명시하기 전 자동 삭제하지 않는다. readiness/validate 통과는 product/design approval이 아니며,
Open Decision resolve와 confirmed 승격은 계속 사람 전용이다.
