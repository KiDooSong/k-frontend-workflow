---
name: implement-shared-surface
description: canonical Surface ID를 shared-surface readiness와 모든 member screen의 교집합 경로 안에서만 구현한다. 사용자가 shared composer/input/surface 구현을 요청하거나 implement-screen이 delegated_shared_surfaces 경로를 발견했을 때 사용한다.
---

# implement-shared-surface

둘 이상의 같은-domain ScreenSpec에 합성되는 `shared-surface-spec` 구현을 surface/member readiness의 교집합 안에서 수행한다.
계약 정본은 [shared-surfaces.md](../../docs/reference/shared-surfaces.md), 운영 stage는
[Stage 06](../../docs/reference/workflow-stages/06-implement-screen-or-code.md)다.

## 입력

- canonical Surface ID가 필수다. prose 이름/컴포넌트 파일명만 있으면 `surface_id`를 추측하지 말고 canonical artifact를 확인한다.
- repo가 제공한 `--docs`, `--src`, `--root`, `--layout`, `--policy`, `--manifest`, `--ci` 기준은 state/readiness/validate와
  모든 member readiness 명령에 일관되게 전달한다.

## 불변식

- 판정은 직접 재구현하지 않고 `workflow:state`와 `workflow:readiness -- --surface <ID> --json`만 소비한다.
- surface readiness의 `allowed_paths`만 수정한다. `forbidden_paths`와 `path_authorization.allowed=false` 경로는 절대 수정하지 않는다.
- `implementation_paths`는 전역 물리 경로 소유권이다. domain/member 여부와 무관하게 어떤 ScreenSpec의
  `route_entry`/`screen_entry`와도 겹치면 안 되며, 비멤버를 자동 member로 추가하거나 delegation을 부여하지 않는다.
- ScreenSpec은 route/Entry Points/route transition을 계속 소유한다. shared surface에서 route edge를 만들거나 nav-graph에 주입하지 않는다.
- generated 파일, Open Decision resolve, Unknown close, Component Gap accept, `confirmed` 승격, API/copy/design 값 발명,
  live policy 교체, CI/hard-gate 승격을 하지 않는다.

## 1. Preflight

1. 같은 기준 옵션으로 상태와 surface readiness를 실행한다.
   ```bash
   npm run workflow:state
   npm run workflow:readiness -- --surface <SURFACE_ID> --json
   ```
2. keyed 결과에서 `surface_fact_mode`, `surface_decision_cap`, `member_cap`, `member_modes`, `limiting_members`,
   `allowed_paths`, `forbidden_paths`, `path_authorization`, `blocking`, `next_actions`를 읽는다.
3. structural/membership/path/decision/member blocker가 있거나 목표 파일이 allowed 교집합 밖이면 멈추고 blocker와 next action을 보고한다.
   특히 `member-entry-overlap`과 `non-member-entry-overlap`은 어떤 ScreenSpec entry의 전역 물리 소유권과 충돌한 것이므로
   surface membership/delegation 변경으로 우회하지 않는다.
4. 각 member에 대해 ordinary readiness도 읽어 surface가 계산한 member cap과 현재 상태를 확인한다.
   ```bash
   npm run workflow:readiness -- --screen <MEMBER_SCREEN_ID> --json
   ```

## 2. Context

필요한 범위만 읽는다.

- canonical `domains/{domain}/surfaces/{surface}/surface-spec.md`
- 모든 `member_screens`의 ScreenSpec
- 목표 `implementation_paths`와 겹치는 `route_entry`/`screen_entry`를 가진 모든 ScreenSpec(같은/cross-domain 비멤버 포함)
- domain rules, component catalog와 gap register
- API Candidates가 있으면 api-manifest/contract evidence
- `decision_refs`가 있으면 `global/open-decisions.md`
- state와 surface/member readiness 출력

`member_screens`는 surface frontmatter 한 곳이 canonical이다. ScreenSpec에 수동 `surface_refs`를 추가하지 않는다.

## 3. 구현

- 모든 member에서 동일한 state/interaction/mutation/data/API/copy/accessibility/acceptance/Host Contract만 surface 코드에 구현한다.
- host별 route 결과나 화면별 override는 해당 member ScreenSpec/화면 코드의 별도 작업으로 남긴다.
- concrete 변경 경로마다 `allowed_paths`가 전체를 덮고 어떤 `forbidden_paths`도 겹치지 않는지 확인한다.
- API/copy/design evidence가 없으면 발명하지 않고 Unknown/Open Decision/Gap으로 보고한다.

## 4. 검증과 보고

가장 작은 관련 test/lint를 먼저 실행한 뒤 다음을 같은 옵션 기준으로 실행한다.

```bash
npm run workflow:state
npm run workflow:readiness -- --surface <SURFACE_ID> --json
npm run workflow:readiness -- --screen <MEMBER_SCREEN_ID> --json  # 모든 member
npm run workflow:validate
```

변경이 route/nav/catalog 같은 생성 view 입력에도 해당하면 [Stage 07](../../docs/reference/workflow-stages/07-regenerate-derived-views.md)의
적용 가능한 명령을 실행한다. route transition은 surface artifact가 아니라 member ScreenSpec 변경에서만 발생한다.

최종 보고에는 surface/member mode, limiting member, 변경 경로, 검증 결과, 남은 decision/unknown/gap, 의도적으로 건드리지 않은
forbidden/generated/route/policy/CI 범위를 포함한다.
