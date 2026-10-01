# Work CLI 대표 흐름 통합 — 사전 packet 대조를 보존하는 run

- 상태: **제안 / 설계 전용 / 구현 없음**
- 작성일·이슈/PR 확인일: 2026-10-01 (Asia/Seoul)
- 조사 기준: main `042415cb24b966257ec0f04fff4481adcce1f4f2` (PR #258 머지 후)
- 관련 추적: [#248](https://github.com/KiDooSong/k-frontend-workflow/issues/248), 상위 [#239](https://github.com/KiDooSong/k-frontend-workflow/issues/239)
- 경계: 이 PR은 이 초안과 설계 인덱스만 바꾼다. 아래 `run --work … --packet …`은 **후속 구현 제안이며 현재 지원하지 않는다**. 설계 게시·머지는 구현이나 사람 소유 결정의 승인으로 취급하지 않는다.

## 1. 문제와 확인 근거

[current-work의 Common CLI flow](../../../../frontend-workflow-kit/docs/reference/current-work.md#common-cli-flow)는
구현 전 `readiness → packet → run`, 구현 후 `forbidden-paths → report → run`을 연속 명령으로 보여준다.
모든 명령을 의무화한 규칙은 아니지만, 대표 예시를 순서대로 실행하면 같은 상태의 준비·검증이 반복된다.
[Stage 06](../../../../frontend-workflow-kit/docs/reference/workflow-stages/06-implement-screen-or-code.md#current-work-branch),
[Stage 08](../../../../frontend-workflow-kit/docs/reference/workflow-stages/08-validate-and-report.md#current-work-reportbackstop),
[COMMANDS](../../../../frontend-workflow-kit/COMMANDS.md#current-work-c)에도 같은 명령의 부분 순서가 있다.

[공통 CLI](../../../../frontend-workflow-kit/scripts/lib/current-work-cli.mjs)의 `runCurrentWorkCli()`는
도구별 분기 전 `impl.prepare()`를 호출하고 종료 시 snapshot을 정리한다. 프로세스 간 재사용은 없다.
[current preflight](../../../../frontend-workflow-kit/scripts/lib/current-work-execution-preflight.mjs)의
`prepareCurrentWork()`는 HEAD tree를 materialize하고 resource·state·readiness·경로 권한·입력 reconciliation을 평가한다.
`forbidden-paths`, `report`, 실행 가능한 `run`은 각각 `impl.git()`도 호출한다.
공통 분기를 쓰는 `authority: scoped`에도 같은 반복 구조가 적용된다.

| 대표 예시의 단계 | 명령 | prepare 호출 | backstop 호출 |
|---|---|---:|---:|
| 구현 전 | readiness → packet → run | 3 | 1 |
| 구현 후 | forbidden-paths → report → run | 3 | 3 |
| 합계 | 6개 호출 | 6 | 4 |

표는 유효한 request가 `ready: true`이고 오류 없이 각 명령까지 진행되는 정상 경로의 **정적 호출 수**다.
deny·absorbed·수집 오류에서는 `run`의 backstop을 건너뛸 수 있다. 실행 시간·토큰 절감량은 측정하지 않았다.
사전과 사후는 서로 다른 상태이므로, 사후 재검증 자체를 중복으로 분류하지 않는다.

`run --out <dir>`은 이미 `work-packet.md`, 구현 diff가 있으면 `run-report.md`, `<dir>.md` 상태 보고를 쓴다.
현재 예시의 `run --json`은 `--out`이 없어 이 파일을 쓰지 않는다.
그러나 출력 기능이 있다는 이유만으로 사후 `report`까지 제거할 수는 없다.
`report`는 이전 packet을 읽고 `impl.assertPacket()`으로 사전 checkpoint와 이번 실행을 대조하며,
현재 `run`은 이전 packet을 읽지 않고 매번 새 packet을 렌더한다.

## 2. 관련 이슈·기존 PR과 범위

확인 시점의 열린 PR은 0건이었다. 모든 상태의 이슈를 `prepare`, `중복`, `packet`, `backstop`으로 검색하고
관련 이슈 본문·댓글 및 최근 PR을 대조했으며, 이 명령 반복을 직접 추적하는 전용 이슈는 찾지 못했다.
이 초안/PR에서 관련 항목을 참조하되 새 이슈를 자동 생성하거나 기존 완료 조건을 닫지 않는다.

| 항목 | 확인한 범위와 이번 설계의 관계 |
|---|---|
| [#248](https://github.com/KiDooSong/k-frontend-workflow/issues/248), [PR #249](https://github.com/KiDooSong/k-frontend-workflow/pull/249) | E1 지침 중복 정리는 머지됐다. E1은 동작·권한·CLI 계약을 바꾸지 않는 범위였다. 이번 제안은 CLI의 packet 입력을 추가하므로 E1 완료 사실을 되돌리지 않는다. E2/E3 pilot·측정은 별도다. |
| [#259](https://github.com/KiDooSong/k-frontend-workflow/issues/259) | 열린 문서 이슈다. shared-surface skill/task matrix의 실행 분기 선택을 Stage 06과 정렬하며, 권한·파서·CLI 변경은 제외한다. 이번 후속 문서 정렬 시 같은 정본을 가리키도록 조정한다. |
| [#242](https://github.com/KiDooSong/k-frontend-workflow/issues/242), [PR #243](https://github.com/KiDooSong/k-frontend-workflow/pull/243), [PR #246](https://github.com/KiDooSong/k-frontend-workflow/pull/246) | current/scoped 실행의 기존 권한·snapshot·backstop 계약을 제공한다. 이번 작업은 이를 재사용한다. |
| [#250](https://github.com/KiDooSong/k-frontend-workflow/issues/250), [PR #251](https://github.com/KiDooSong/k-frontend-workflow/pull/251), [PR #252](https://github.com/KiDooSong/k-frontend-workflow/pull/252) | 큰 tree 읽기와 baseline state 계산은 이미 수정됐다. 명령 반복 제거와 별개이며, 이번 설계는 전체 tree materialize 범위를 바꾸지 않는다. |
| [#206](https://github.com/KiDooSong/k-frontend-workflow/issues/206) | 과거 no-report 실행의 stale output 문제다. 새 packet-bound 실행은 아래의 출력 보존 규칙을 적용해 같은 종류의 혼동을 피한다. 기존 no-work 출력 변경은 포함하지 않는다. |
| [PR #258](https://github.com/KiDooSong/k-frontend-workflow/pull/258) | 최신 머지 PR은 리뷰 템플릿 정렬이다. `DONE_PENDING_REVIEW`·exit 0을 승인으로 취급하지 않는 계약을 유지한다. |

## 3. 제안 요약과 불변식

일반 current/scoped 작업은 **`workflow:run` 한 진입점을 구현 전후 각각 한 번** 사용한다.
사후 `run --work`에 optional `--packet <사전 packet.md>`을 추가해 기존 `report`의 checkpoint 대조를 수행한다.
한 호출에서 얻은 preflight와 backstop을 상태·JSON·packet/report 렌더에 재사용한다.
구현 전후를 한 프로세스로 붙이거나 CLI가 코드 구현을 수행하게 만들지는 않는다.

- 매 호출의 권한은 immutable HEAD baseline에서 새로 계산한다. packet의 stored allow/ready는 권한이 아니다.
- current의 ceiling·concrete path helper·generated final deny·API claim·복수 owner AND를 유지한다.
- scoped의 채택·unit·coverage·decision binding·모든 host·공유 target AND 및 regular-file `A`/`M` 제약을 유지한다.
- request/origin/resource의 사전 대조와 실제 destination의 authority/inventory/API evidence 검사는 둘 다 유지한다.
- 모드·denial·`future_requirements`·`required_reviews`를 통합을 위해 삭제하거나 성공으로 바꾸지 않는다.
- `workflow:validate`, 관련 test/lint, 생성물 검사·시각 확인은 기존 작업 요구에 따라 수행한다. run의 packet/report 출력으로 대체하지 않는다.
- 사람 소유 gate, warning-first/exit 계약, no-work/visual-refresh 분기와 권한은 그대로 둔다.

## 4. 대표 명령과 진단 명령

### 4.1 후속 구현 후의 대표 흐름

다음은 **제안 CLI 예시**다. 두 호출에 같은 request와 동일한 명시적 resource 옵션을 전달한다.
예시는 기본 layout이며, custom `--root`, `--docs`, `--src`, `--policy`, `--manifest`, `--layout`, `--ci`는
[COMMANDS의 옵션 정본](../../../../frontend-workflow-kit/COMMANDS.md)에 따라 두 호출에 똑같이 붙인다.

```bash
# 증거 출력은 선택 repository 밖에 두고 사전/사후 디렉터리를 구분한다.
RUN_EVIDENCE="$(mktemp -d)"

# 구현 전: HALT_READY_FOR_WORK와 ready/각 target의 허가를 확인한다.
npm run workflow:run -- --work .workflow/current-work.json \
  --out "$RUN_EVIDENCE/before" --json

# 구현, 필요한 생성물 갱신, 기존 validate와 관련 test/lint를 수행한다.
# 구현을 커밋하기 전에 사전 packet과 같은 baseline에서 사후 검증한다.
# --packet은 이 초안에서 제안하는 새 work-run 옵션이다.
npm run workflow:run -- --work .workflow/current-work.json \
  --packet "$RUN_EVIDENCE/before/work-packet.md" \
  --out "$RUN_EVIDENCE/after" --json
```

scoped는 request 파일만 `.workflow/scoped-work.json`으로 바꾸며 같은 흐름을 사용한다.
세션이 바뀌면 사전 request·packet·resource 옵션과 증거 경로를 기존 handoff에 남겨 재개한다.
HEAD가 이동하거나 요청 범위를 바꿨다면 기존 packet의 사후 검증을 통과한 것처럼 보고하지 않고 새 authoring/preflight checkpoint를 만든다.
repository 안의 출력 경로를 backstop에서 자동 제외하는 새 directory-wide 예외는 만들지 않는다.

사후 `DONE_PENDING_REVIEW`여도 `backstop.ok`, `violations`, `ready`, 미실행/실패 검증을 확인한다.
상태명과 exit 0만으로 검증 통과·머지 승인이라고 보고하지 않는다.

### 4.2 개별 명령의 용도

| 명령 | 필요할 때 선택하는 용도 |
|---|---|
| `readiness --work` | owner/target denial, ceiling, future requirements만 별도로 조사한다. 정상 run 앞에 항상 붙이지 않는다. |
| `packet --work` | 실행 상태 보고 없이 사전 packet만 별도 경로에 출력한다. |
| `forbidden-paths --work` | diff 위반을 조사하거나 `--staged`로 index만 검사하거나 `--enforce`의 exit 1을 사용한다. 새 run이 이 두 옵션을 대체하지 않는다. |
| `report --work --packet` | 기존 checkpoint 검증과 report만 수집하는 호환·개별 출력 경로다. 대표 사후 run과 연속 실행할 필요는 없다. |

각 standalone 명령은 계속 자신의 `prepare`를 수행한다. 독립적으로 안전하게 실행할 수 있는 계약을
캐시나 호출 순서 의존성으로 바꾸지 않는다.

### 4.3 현재 CLI에서 가능한 축소

후속 구현 전에는 사전 `run --work … --out <before>`로 packet을 만들고,
사후 `report --work … --packet <before>/work-packet.md`를 쓰면 checkpoint와 전후 backstop을 유지할 수 있다.
이 경로는 기존 run 상태 요약을 사후에 추가로 생성하지 않는다. **사전/사후 run만 호출하는 경로는 이전 packet 대조와 동등하지 않다.**
이 초안 PR에서는 runtime reference/skill의 대표 예시를 바꾸지 않는다.

## 5. 새 work-run 옵션과 처리 순서

### 5.1 입력·호환 계약

- `run --work`의 value flags에만 `packet`을 추가하고 help에 표시한다. 새 phase 플래그는 만들지 않는다.
- `--packet`이 없으면 기존 run의 옵션·stdout/JSON·상태·exit 동작을 유지한다. 구현 diff가 있어도 기존 호출을 갑자기 오류로 바꾸지 않는다.
- 일반 작업의 사후 대표 절차는 `--packet`을 전달하도록 문서화한다. 누락된 사후 checkpoint는 handoff에서 미검증으로 기록하며, 새 hard gate를 만들지 않는다.
- `--packet`이 있으면 `--out` 유무와 관계없이 해당 authority의 기존 parser/assertion으로 대조한다. current/scoped packet을 교환해 쓰지 않는다.
- unknown/mixed selection flags, 빈 packet 값, 읽기/형식 오류, snapshot 불일치는 기존 tool/input error와 같은 exit 2다. mismatch를 HALT_READY/DONE으로 바꾸지 않는다.
- 기존 `forbidden-paths --staged/--enforce`, report와 packet의 계약은 유지한다. run에 staged/enforce/range 옵션은 추가하지 않는다.
- no-work/visual-refresh 파서와 라우팅은 건드리지 않는다.

### 5.2 한 호출의 순서

```text
parse / flags 검증
→ request에 맞는 current/scoped 구현 선택
→ prepare 1회: fresh immutable baseline과 현재 요청 권한 계산
→ --packet이 있으면 parsePacket + assertPacket (출력 쓰기 전)
→ 새 packet-bound 출력 대상 확인 (출력 쓰기 전)
→ 기존 상태 분기; 실행 가능한 요청의 실제 Git backstop 최대 1회
→ 동일한 preflight/backstop으로 상태·JSON·packet/report 렌더
→ finally에서 snapshot cleanup
```

구현 대상은 [공통 CLI](../../../../frontend-workflow-kit/scripts/lib/current-work-cli.mjs)의 `TOOL_VALUES.run`,
`help()`, `runCurrentWorkCli()`이며, `report` 분기의 parser/assertion 호출을 같은 구현 adapter로 재사용한다.
기존 current/scoped 권한 helper를 바꾸거나 child CLI를 spawn해 prepare/backstop을 다시 실행하지 않는다.

### 5.3 checkpoint 대조와 실행 중 재확인

[current assertion](../../../../frontend-workflow-kit/scripts/lib/current-work-execution-backstop.mjs)의
`assertPacketMatches()`와 [scoped assertion](../../../../frontend-workflow-kit/scripts/lib/scoped-work-execution.mjs)의
`assertScopedPacketMatches()`가 소유한 비교를 그대로 재사용한다.

| 검증 구간 | 유지할 내용 |
|---|---|
| 이전 packet → 이번 fresh preflight | request digest와 raw bytes hash, baseline commit/tree, project/resource context, origin identity/hash; scoped의 authority/directory/target read set |
| 이번 preflight → 실제 destination | request의 실행 중 raw/digest 재확인, consumed authority와 inventory/API evidence, 실제 Git diff의 모든 경로·change kind·bytes/mode·권한 |

packet 대조는 ready/absorbed 상태의 early return보다 먼저 수행한다. fresh preflight가 실행 불가해도
오래되거나 잘못된 checkpoint를 정상 handoff로 표시하지 않는다.
대조 통과 뒤 요청이 바뀌면 기존 backstop의 재확인에서도 오류가 나야 한다.
이 계약은 호출 중 저장소를 잠그는 sandbox나 packet의 작성자·진위를 증명하는 서명 모델이 아니다.

## 6. 출력·상태·오류 계약

사전 packet은 audit evidence로 보존하고 사후 결과는 별도 bundle에 출력한다.
새 `--packet` 입력을 사용한 run의 JSON/status Markdown에는 optional
`checkpoint: { packet: <resolved input path>, matched: true }`를 추가해 어떤 사전 증거를 대조했는지 기록한다.
기존 필드는 그대로 두며, `--packet` 없는 출력에는 이 필드를 추가하지 않는다.
checkpoint는 권한·사람 승인·coverage receipt가 아니며, report의 기존 backstop envelope도 재사용한다.

새 packet-bound run의 `--out`은 다음을 요구한다.

1. 입력 packet과 출력 대상(`work-packet.md`, `run-report.md`, `<out>.md`)이 같은 물리 파일로 겹치면 쓰기 전에 exit 2로 거부한다. 경로 alias도 확인한다.
2. 출력 대상 파일이 이미 존재하면 쓰기 전에 exit 2로 거부한다. 새 before/after bundle을 사용하게 하며 이전 report를 현재 실행의 증거로 노출하지 않는다.
3. 기존 디렉터리의 다른 파일을 삭제하지 않는다. `--packet` 없는 기존 run의 출력 동작도 이 변경으로 바꾸지 않는다.

이 제약은 기존 출력 자동 삭제보다 범위가 좁은 새 opt-in 계약이다. input·output 오류에서는 packet/report/status 파일을 새로 쓰거나 덮어쓰지 않는다.
출력 중 I/O 오류는 exit 2이며 partial bundle을 성공 증거로 취급하지 않는다. 다중 파일 transactional writer는 이번 범위가 아니다.

| 상황 | 상태/동작 |
|---|---|
| 사전 ready이며 diff 없음 | 기존 `HALT_READY_FOR_WORK`; packet/status만 출력한다. |
| packet 대조 성공, 구현 diff 있음 | 기존 `DONE_PENDING_REVIEW`; 같은 backstop을 JSON과 report에 사용한다. 위반이 있어도 현재 상태 의미를 승인으로 바꾸지 않는다. |
| packet 대조 성공, 구현 diff 없음 | 기존 상태 분기를 따른다. 이전 report를 복사하거나 새 report가 있다고 표시하지 않는다. |
| deny·absorbed | 기존 `HALT_AMBIGUITY` / `HALT_NOT_APPLICABLE`과 근거를 유지한다. 정상 분기에서 실행하지 않던 backstop을 억지로 추가하지 않는다. |
| packet/입력/수집/출력 오류 | 기존 tool-error 경로와 exit 2를 유지한다. CLI의 예외 처리 동작을 새 성공 상태로 대체하지 않는다. |

## 7. 선택한 방향과 대안

| 대안 | 판단 |
|---|---|
| 문서에서 전후 run만 남긴다. | 명령 수는 줄지만 현재 run에 이전 packet 대조가 없다. 기존 report 검증을 잃으므로 그대로 적용하지 않는다. |
| 사전 run → 사후 report를 대표 절차로 둔다. | 현재 CLI에서 가능한 축소다. 최종 상태와 bundle까지 한 진입점으로 모으는 후속 방향은 충족하지 않는다. |
| run에 사전 packet 대조를 추가한다. | 제안 방향이다. 준비·backstop 결과를 한 호출에서 재사용하고 checkpoint 검증을 보존한다. |
| 프로세스 간 prepare/backstop 캐시를 만든다. | request·HEAD·권한·inventory·ignored bytes 등의 무효화 계약을 추가해야 한다. 이번 반복은 대표 호출 수부터 줄이며 캐시는 범위 밖이다. |

## 8. 후속 구현·문서 소유권

이 설계를 리뷰한 뒤 별도 구현 PR에서 다음을 함께 변경한다. 미래 CLI를 먼저 runtime 문서에 게시하지 않는다.

| 변경 위치 | 소유할 내용 |
|---|---|
| 공통 CLI와 기존 packet assertion adapter | 새 run 옵션, checkpoint 대조, 계산 결과 재사용, 새 opt-in 출력 계약 |
| `current-work.md` | request/snapshot/backstop 불변식과 통합 대표 흐름의 정본 |
| `scoped-work.md` | scoped 고유 제약 및 통합 흐름 링크; current와 다른 authority assertion은 보존 |
| `COMMANDS.md` | 지원 옵션과 대표 명령/진단 명령 구분 |
| Stage 06 / Stage 08 | 구현 전·후 checkpoint 진입 조건과 정상 handoff; 상세 CLI 계약은 정본 링크 |
| implement skills / task matrix / doc-ownership | 실행 분기·정본 링크 정렬. #259의 분기 선택 누락 수정과 조정하고 같은 사실을 여러 곳에 복제하지 않음 |

새 artifact axis, request version, readiness 모드, CI required check, 소비자 강제 이전, adoption/binding 변경,
제품 승인 자동화, 전체 tree 최적화·캐시, no-work/visual 출력 변경은 포함하지 않는다.
이 설계 PR은 #248 E2/E3나 #239 전체를 완료 처리하지 않는다.

## 9. 후속 수용 사례와 검증

아래는 **구현 PR의 완료 조건**이다. 이 초안 PR에서 새 CLI가 동작한다고 주장하지 않는다.

| 사례 | 기대 결과 |
|---|---|
| current와 scoped 각각의 정상 사전/사후 실행 | prepare 각 1회, ready 경로의 backstop 각 1회. 상태/JSON/report는 같은 Git destination snapshot을 소비한다. |
| current/surface 복수 owner 및 scoped 모든 host/공유 target | 기존 AND·claim·generated·change-kind·coverage/decision 판정을 그대로 유지한다. |
| 같은 digest지만 request 원문 whitespace가 변경됨 | 기존 report와 같은 raw bytes mismatch로 exit 2; 출력 없음. |
| owner/target/unit/origin request 또는 baseline HEAD/tree 변경 | packet 대조 실패로 exit 2; 출력 없음. 커밋 이후의 새 HEAD를 이전 checkpoint로 받아들이지 않는다. |
| root/project prefix, docs/src/policy/manifest/layout/CI 또는 authority read set 변경 | 기존 authority별 context assertion과 동일하게 거부한다. |
| current/scoped packet 교환, malformed/missing packet, 빈 옵션, mixed flags | exit 2; 다른 분기 fallback과 파일 출력 없음. |
| packet 대조 통과 후 request/authority/API evidence 변경 | 기존 실행 중 재확인·backstop에서 검출한다. packet은 allow 우회 수단이 아니다. |
| unrequested/generated/deferred path, mode/type 변경, index·worktree 차이 | 기존 backstop 판정 유지. staged/enforce 특수 용도는 개별 forbidden-paths로 유지한다. |
| absorbed/deny/no implementation diff | 기존 상태·근거 유지, 새 report 없음. packet-bound output에 과거 report가 있으면 쓰기 전 거부한다. |
| 입력 packet/output 경로 겹침, 기존 출력 파일, 출력 I/O 실패 | checkpoint와 사용자 파일 보존, exit 2. 부분 결과를 DONE 성공 근거로 보고하지 않는다. |
| --packet 없는 기존 current/scoped 및 no-work/visual CLI | 기존 출력·상태·exit 회귀 없음. |
| 대표 문서·skills·task matrix | 지원 CLI만 안내하며 run 앞뒤의 반복 명령을 필수 순서로 제시하지 않는다. 정본 링크와 기존 핵심 불변식 fixture를 유지한다. |

기존 `current-work-execution`, `current-work-snapshot`, `current-work-review`, scoped CLI/execution/packed,
distribution·skill-contract·doc-drift 검사를 확장한다. packet assertion 사례를 양 authority에서 재사용하고
prepare/backstop 호출 수와 출력 snapshot 일치도 확인한다. 권한 통과를 실측 성능 향상으로 해석하지 않는다.

| 검증 지표 | 현행 대표 흐름 | 제안 대표 흐름 |
|---|---:|---:|
| 정상 작업의 CLI 호출 | 6 | 2 |
| prepare 호출 | 6 | 2 |
| backstop 호출 | 4 | 2 |
| 사전/사후 fresh 검증 | 유지 | 유지 |
| 사전 packet ↔ 사후 요청 대조 | report에서 수행 | 사후 run에서 수행 |
| 실제 시간·토큰 개선 | N/A | N/A — 구현 후 같은 조건으로 측정 |

호출 수 감소는 코드/대표 절차에서 검증할 수 있는 목표다. consumer 개선·재작업·리뷰 횟수·시간은
#248 E3의 동일 입력·시작 상태·도구 조건에서 별도로 측정하고, 얻을 수 없는 값은 N/A로 둔다.
