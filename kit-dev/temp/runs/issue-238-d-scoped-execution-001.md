# Issue #238 D 구현·검증 기록 — scoped work execution

> 날짜: 2026-09-23
> 범위: #238 D(`authority: scoped`) 구현 — PR #246(Draft, `feat/238-scoped-execution`)
> baseline: `a44fdc78f729a154da4c6e1a42f11ff303705d27` (PR #245 merge: C current work + D1 비활성 계약)
> 구현 checkpoint: D02 `ae5eea5` … D34 `9eaaab3`(공개 CLI 활성화). 이 기록과 W 회귀 보강은 그 다음 checkpoint(D35 `9a1c449`)다.
> 리뷰 수정: D36 — `9a1c449` 재리뷰의 API 근거 경로 관측 P2 2건(§6).
> 설계 정본: [issue-238-task-scoped-execution.md](../../docs/design/drafts/issue-238-task-scoped-execution.md) §13 회귀 매트릭스
> 사용 안내: [scoped-work.md](../../../frontend-workflow-kit/docs/reference/scoped-work.md)
> status: **IMPLEMENTATION CHECKPOINT — source checkpoint, not review approval.** 사람 채택·binding·consumer pilot·E 측정·release/version/dependency 변경은 없다.

## 1. 이 기록이 입증하는 것과 입증하지 않는 것

입증하는 것(정적 fixture·실제 Git 저장소·packed payload에서 재현되는 구조 동작):

- 채택되지 않은 저장소에서 기존 CLI·readiness·visual-refresh v1 출력이 바뀌지 않는다.
- 채택 owner의 work unit은 materialize한 `HEAD` baseline에서 owner 자체 조건, surface의 모든 host, 요청 간 공유 target을
  AND로 판정하고, 결과는 permit이 아니라 review input이다(`approval_verified: false`).
- Git backstop은 소비한 authority 파일·문서/입력 inventory·API 근거 경로(종류와 디렉터리 구성)의 불변과, 허용·요청된
  regular-file `A`/`M`만의 변경을 요구한다. 구현 diff로 권한을 넓히는 self-grant는 위반이다.
- 채택 경로는 no-work readiness/forbidden-paths, current work, visual-refresh v1에서 `work-selection-required`를 반환하고,
  upgrade planner는 marker가 남은 동안 marker를 강제하지 못하는 payload를 자동 적용하지 않는다.

입증하지 않는 것(설계 §10.2와 같다):

- 혼합 visual/behavior 편집의 의미 동등성, pixel parity, prose 계약·coverage receipt의 완전성, development-only 격리의 실제 효과,
  binding을 누가 승인했는지. 이는 리뷰 책임이다.
- 실제 consumer 저장소 채택(pilot)과 원래 문제의 개선량(E 측정). 이 PR은 어떤 저장소도 채택시키지 않는다.

## 2. 구현 단위

| checkpoint | 내용 |
|---|---|
| D02–D06 | contract section/row, input anchor·Item effect group, host M-key provenance, API selection resolver; packed·cross-platform 실행 |
| D07–D12 | R1 scope 직렬화, 재귀 evidence graph, unit projection, Decision 적용성, 소유/claim 경계, uncertainty 관계 |
| D13–D17 | 적용성 합성, R1 binding basis digest, binding staleness, scope/reopen 전이, 원래 Git snapshot 기반 전이 |
| D18–D23 | coverage receipt 무결성·파일 로드, source/effect 관계, file-backed coverage와 origin routing, 추론 source closure |
| D24–D27 | visual/api-contract/behavior profile, 구체 경로, Decision scope 적용, 단일 owner 합성 |
| D28a–D29 | surface host(채택 host: profile·Decision·member role 상한 동의, `legacy-current` host: 실제 legacy member base), 요청 합성과 공유 target AND |
| D30 | scoped baseline preflight와 Git backstop (`SW-GIT-*`) |
| D32 | 채택 경로의 fallback 진입점 guard (`work-selection-required`, `CW-WORK-SELECTION-REQUIRED`, `VR-WORK-SELECTION-REQUIRED`) |
| D33 | upgrade planner의 downgrade 자동 적용 거부 |
| D34 | 다섯 `--work` CLI(readiness/packet/forbidden-paths/report/run) 활성화, 소비자 문서 |
| D35 | W01–W40 회귀 보강 16건, 이 검증 기록 |
| D36 | 리뷰 수정: API 근거 경로의 종류 비교와 worktree 디스크 관측(§6) |

D30의 CI 실패(#989)는 Git ≥2.47이 commit 뒤 분리 실행하는 auto-maintenance가 임시 저장소 삭제와 경합한 것이었다.
Git fixture가 있는 테스트 파일에서 `maintenance.auto false`·`gc.auto 0`을 설정해 해소했다(`ad6858e`).

## 3. W01–W40 회귀 매트릭스 대응

테스트 파일은 모두 [`frontend-workflow-kit/scripts/lib/`](../../../frontend-workflow-kit/scripts/lib/)에 있다. 제목은 소스에 적힌 그대로이며
`${...}`는 template literal이다. 판정은 다음 넷이다.

- **충족**: 설계의 예상 동작을 구조 테스트가 직접 확인한다.
- **충족+리뷰**: 도구가 판정하는 부분은 테스트로 확인하고, 나머지 의미 판단은 설계상 리뷰 책임이다.
- **부분**: 테스트가 일부만 확인한다. 남은 부분을 비고에 적었다.
- **리뷰·운영**: 설계(§13 끝)가 정적 fixture로 증명하지 않는다고 정한 사례다.

"이번 보강"은 D35에서 추가한 테스트다.

| ID | 판정 | 근거 테스트 | 비고 |
|---|---|---|---|
| W01 | 충족 | `current-work-execution`: "W01: no-work readiness wrapper preserves legacy stdout/stderr/exit"; `scoped-work-adoption`: "D adoption: an unadopted repository gets an empty marker and unchanged path decisions"; `visual-refresh`: "no-intent wrappers preserve legacy stdout, stderr, and exit status" | |
| W02 | 충족 | `current-work-execution`: "W02/W03: current keeps higher prerequisites as future but uses exact current path authority" | |
| W03 | 충족 | `current-work-execution`: "W03: a lower requested mode cannot reopen a path the current mode closes, and an over-ceiling mode is denied" | 이번 보강. `route-skeleton` 요청으로 route entry를 열 수 없고, 상한 초과는 `CW-MODE-CEILING`이다 |
| W04 | 충족 | `current-work-execution`: "W04: malformed current policy remains an execution error, not future-only"; `scoped-work-execution`: "D preflight: stale legacy state and legacy structural errors are errors, not future requirements"; `scoped-work-adoption`: "D adoption: missing, duplicate or undeclared adopted owners fail closed"; `scoped-work-decisions`: "D decisions: malformed raw decision rows, columns, duplicate sections and table lookalikes fail closed"; `scoped-work-api`: "D API: endpoint identity is exact and duplicate native rows cannot select a first winner" | |
| W05 | 충족 | `scoped-work-execution`: "W05: an unrelated partial input stays a warning and does not deny the selected scoped unit"; `current-work-review`: "review P1-2: normal unrelated partial remains warning-only; selected partial stays non-ready" | scoped preflight 쪽은 이번 보강 |
| W06 | 충족 | `scoped-work-input-coverage`: "D input coverage: ${state}/${result} accepts current file-backed unit coverage without approving the whole input"; `scoped-work-coverage`: "D coverage: current matching receipt is integrity evidence, not semantic approval or a permit"; `scoped-work-execution`: "W06: selected coverage report files are read from the committed baseline, never assumed" | 유효 receipt의 허가는 모듈 수준. preflight 테스트(이번 보강)는 미커밋·fence 없는 보고서 거부를 확인한다 |
| W07 | 충족 | `scoped-work-input-coverage`: "D input coverage: partial/pending without review evidence stays unready"; `scoped-work-source-relations`: "D R1 inferred sources: legacy facts do not fabricate v2 effects, malformed v2 is not downgraded"; `visual-refresh-boundary`: "P17: register-only partial status leaves real no-intent mode and path permissions unchanged" | |
| W08 | 충족 | `scoped-work-input-coverage`: "D input coverage: input/effect/contract hash changes reject previous partial review evidence"; `scoped-work-receipts`: "D receipt files: source bytes changing after the report was authored make file-backed coverage stale"; `scoped-work-transitions`: "D transitions: newly applicable decision is reviewed and not approved by a binding" | |
| W09 | 충족 | `scoped-work-input-coverage`: "D origin routing: a new unselected unrelated effect does not force receipt rewrite or prior work repetition"; "D origin routing: a new unselected related effect defeats full-input no-effect without changing its selected receipt hash" | |
| W10 | 충족+리뷰 | `scoped-work-profiles`: "D profiles: selected Figma M-key with matching provenance and actual input coverage satisfies visual prerequisites only"; "W10: visual isolation needs an open Decision that actually applies to the disabled behavior units" | 격리 선언과 open Decision의 연결은 이번 보강. 일반 사용자 비노출은 리뷰 책임(`semantic_isolation_verified: false`) |
| W11 | 충족 | `scoped-work-profiles`: "D profiles: known behavior plus actual API evidence does not wait for a Figma mapping"; `scoped-work-owner`: "D owner: actual known behavior, concrete ownership and clear decisions compose without Figma or a permit" | 디자인 발명 금지는 required review 문구다 |
| W12 | 충족 | `scoped-work-profiles`: "D profiles: selected confirmed active API uses the existing manifest/manual contract check without UI promotion"; `scoped-work-paths`: "D paths: selected confirmed active API admits only its real client Slice Paths" | |
| W13 | 충족 | `scoped-work-execution`: "W13: missing, foreign or stale Decision scopes deny scoped work; no scope state changes the legacy cap"; `scoped-work-owner`: "D owner: unknown units, missing concrete targets and unsupported changes never become successful empty work"; `scoped-work-bindings`: "D bindings: another owner scope cannot exempt this owner" | legacy cap 불변은 이번 보강. 현재 scope로 scoped가 열려도 `__decision_cap`은 그대로다 |
| W14 | 충족 | `scoped-work-owner`: "D owner: a current canonical scope applies only its actual blocked units, without authenticating review"; `scoped-work-decision-scopes`: "D Decision scopes: current canonical blocks narrow only this prerequisite on real unchanged Git snapshots"; `scoped-work-hosts`: "D hosts: an unbound open Decision on only the second host remains blocking" | |
| W15 | 충족 | `scoped-work-decision-scopes`: "D Decision scopes: newly added known units remain blocked until the full declaration is current"; "D Decision scopes: reopened decisions with retained or replaced bindings invalidate every current unit"; `scoped-work-transitions`: "D transitions: selected content change leaves an unchanged binding stale rather than refreshing it"; `scoped-work-bindings`: "D bindings: malformed canonical Status is not treated as resolved" | |
| W16 | 리뷰·운영 | `scoped-work-paths`: "D paths: API client paths hidden inside a private component remain guarded"; `scoped-work-profiles`: "D profiles: inspection preserves source bytes and returns explicit semantic, scope and Git review responsibilities" | 경로 층의 거부와 의미 flag `false`만 확인한다. 같은 파일 안의 의미 혼입은 리뷰가 판단한다 |
| W17 | 충족 | `scoped-work-paths`: "D paths: exact entry and private child paths satisfy only concrete boundary prerequisites"; "D paths: another screen entry, private hook and test root cannot be covered by this owner"; "D paths: deferred and invalid no-API reservations remain restrictions on fixture hooks"; "D paths: a selected but unconfirmed API never satisfies a behavior API claim" | |
| W18 | 충족 | `scoped-work-adoption`: "D adoption: readiness --path returns work-selection-required for an adopted path only"; "D adoption: legacy forbidden-paths reports an adopted change and enforces it"; "D adoption: current work cannot fall back to legacy authority on an adopted path"; "D adoption: visual-refresh v1 path authority returns work-selection-required without a waiver" | v1은 authorization 함수 수준으로 확인한다(채택 저장소에서 v1 CLI를 실행하는 테스트는 없다) |
| W19 | 충족 | `scoped-work-hosts`: "D hosts: both actual scoped host profiles, Decisions and role-ceiling consents are required, without a surface permit"; "D hosts: missing, duplicate and nonmember host selections never become a smaller successful set"; "D hosts: a legacy member base covers only declared surface paths"; `scoped-work-composition`: "D compose: a host prerequisite deny blocks every target of the surface request" | |
| W20 | 충족 | `scoped-work-paths`: "W20: a component catalog listing without a known global editor creates no scoped path authority"; "D paths: explicit denies, generated outputs, global roles and own routes survive private declarations" | catalog 사례는 이번 보강 |
| W21 | 부분 | `scoped-work-execution`: "D backstop: unrequested paths and delete/mode/type changes are violations"; `scoped-work-git-transitions`: "D Git transitions: mode-only and rename changes remain visible, not relabeled as safe work"; "D Git transitions: original gitlink resources cannot be borrowed from the working directory"; `scoped-work-paths`: "D paths: leaf and ancestor symlinks and directory targets are never regular A/M observations"; "W21: a case-alias spelling of the exact entry never becomes the owned entry" | case alias는 이번 보강. binary/NUL 바이트는 공유 helper 테스트(`current-work-snapshot`, `visual-refresh-git-snapshot`)로만 확인한다. `--work` CLI에는 name-only `--diff` 입력이 없다 |
| W22 | 충족 | `scoped-work-execution`: "D backstop: an implementation diff cannot self-grant through authority, documents or requests"; "D preflight: uncommitted worktree edits cannot change baseline authority in either direction"; "D backstop: a missing API evidence source created as a requested file is an evidence change in the worktree and index"; "D backstop: a Git-ignored new entry in a consumed API evidence directory is observed in the worktree only"; `scoped-work-adoption`: "W28: withdrawing adoption inside an implementation diff cannot reopen legacy authority for that run" | API 근거 경로 두 사례는 D36 리뷰 수정(§6) |
| W23 | 부분 | `scoped-work-execution`: "W23: a project below the Git top level keeps repository paths and reports outside-root changes"; `scoped-work-git-transitions`: "D Git transitions: nested roots retain original repository paths and outside-root changes"; "D Git transitions: absolute in-project resources map to the same captured relative paths" | 하위 project root의 scoped backstop은 이번 보강. `--work` CLI는 `HEAD..worktree`와 `--staged`만 지원한다. base/range는 v1 visual-refresh에만 있다 |
| W24 | 충족 | `scoped-work-execution`: "D backstop: unrequested paths and delete/mode/type changes are violations"; `scoped-work-cli`: "D34 CLI: unrequested changes, packet drift and baseline denials are never reported as success"; `current-work-snapshot`: "P1-3 ${flag}: hidden requested work and unrequested cross-root files are not omitted" | |
| W25 | 리뷰·운영 | `scoped-work-cli`: "D34 CLI: the five public work CLIs run a scoped request from preflight to review evidence" | HALT/DONE은 orchestration 상태이고 merge·사람 승인이 아니다. 실행 불가와 실제 장애의 구분 보고는 리뷰가 확인한다 |
| W26 | 리뷰·운영 | `reconciliation-partial`: "P09/P10: two actual rounds keep one immutable input/summary and accumulate effects; open children are reconciled"; "P11: another partial checkpoint preserves old effects/IDs and rejects last-round-only projection"; `scoped-work-input-coverage`: "D origin routing: a new unselected unrelated effect does not force receipt rewrite or prior work repetition" | 구조적 재사용만 확인한다. 실제 다음 세션 동작은 운영 증거가 필요하다 |
| W27 | 부분 | `scoped-work-execution`: "W27: six arrival orders of three reconciled inputs keep the same scoped permit, and origin order is irrelevant"; `scoped-work-coverage`: "D coverage: effect and declaration set order does not change hashes or mutate caller receipts" | 이번 보강. 같은 facts로 끝난 register의 여섯 도착 순서와 origin 나열 순서에서 scoped 판정이 같다. reconcile 실행 자체가 순서별로 같은 facts에 수렴하는지는 증명하지 않는다 |
| W28 | 충족 | `scoped-work-downgrade`: "D33: a payload that cannot enforce adoption markers is never applied while markers remain"; "D33: only live consumer declarations count as markers"; `scoped-work-adoption`: "W28: withdrawing adoption inside an implementation diff cannot reopen legacy authority for that run" | 구현 diff 안의 철회는 이번 보강. 커밋된 철회는 사람 authoring checkpoint이고 순서는 scoped-work.md의 rollback 절차가 정한다 |
| W29 | 충족 | `scoped-work-basis`: "D basis: API endpoint selection and entire selected Candidate row affect scope"; `scoped-work-transitions`: "D transitions: refreshed digest with the old approval ref is flagged"; `scoped-work-decision-scopes`: "D Decision scopes: refreshed digest with reused approval_ref cannot lower an open scope" | |
| W30 | 충족 | `scoped-work-basis`: "D basis: selected Item effects and input/item/anchor selectors each affect the digest"; "W30: a sources-only change stales the recorded binding, and refreshed coverage cannot restore it" | binding 상태는 이번 보강 |
| W31 | 충족 | `scoped-work-basis`: "D basis: both hosts and the selected host unit content participate in a surface binding"; "D basis: M-key selection and selected mapping provenance alter a surface digest"; "W31: host link, same-named host unit content and M-key changes stale a surface binding" | surface binding 상태는 이번 보강 |
| W32 | 충족 | `scoped-work-basis`: "D basis: unselected sections, unrelated Decision rows and housekeeping change audit only"; "D basis: set permutations and object key order cannot create spurious scope changes"; `scoped-work-coverage`: "D coverage: raw contract changes outside a selected section invalidate receipt, not an R1 scope calculation" | |
| W33 | 충족 | `current-work-execution`: "W33/W35: origin stays non-ready while unconnected and becomes ready after canonical connection"; `scoped-work-input-coverage`: "D input coverage: sources empty and old canonical contracts cannot drop an unconnected new origin"; `scoped-work-execution`: "W33/W35: a surface keeps the origin for every host subrequest; an unexplained host relation stays non-ready" | scoped preflight 쪽은 이번 보강 |
| W34 | 충족 | `current-work-execution`: "W34: unresolved origin source ref is a usage/tool error before output execution"; `scoped-work-contracts`: "D1 request: duplicate unit/current owner, conflicting shared changes and origin errors are rejected"; `scoped-work-input-coverage`: "D input coverage: duplicate origins, missing input and foreign anchors fail instead of being removed"; `scoped-work-execution`: "D preflight: mixed documents, non A/M changes, unresolved origins and symlinked requests are input errors" | |
| W35 | 충족 | `current-work-execution`: "five public CLIs preserve request/origin/digest and backstop actual Git diff"; `scoped-work-input-coverage`: "D input coverage: completed accepted typed reconciliation needs no extra receipt and retains exact origin"; `scoped-work-execution`: "W35: a connected origin is preserved from the scoped preflight into packet transport" | scoped는 preflight→packet 비교까지 이번 보강. scoped 다섯 CLI end-to-end fixture에는 origin이 없다 |
| W36 | 충족 | `scoped-work-input-coverage`: "D input coverage: no-effect uses current unrelated routing effects, not positive implementation-source evidence"; "D input coverage: unconnected native source dependencies and unresolved unit Unknowns defeat no-effect"; "D input coverage: memory receipts and forged caller relation/projection cannot replace actual review files" | |
| W37 | 충족 | `scoped-work-hosts`: "D hosts visual: two native mappings retain distinct Figma nodes and only selected surface component paths"; `scoped-work-projection`: "D projection: surface collects both scoped host selections with distinct real Figma provenance"; `scoped-work-mapping`: "D mapping: different host Figma nodes are retained, not voted or promoted to all-host authority" | |
| W38 | 충족 | `scoped-work-hosts`: "D hosts visual: selected mapping cannot borrow another host identity"; "D hosts visual: a host-private or prefix-lookalike component cannot impersonate surface ownership"; "D hosts visual: partial coverage cannot be borrowed from the successful peer"; "W38: a deprecated host mapping is denied for adopted and legacy hosts alike"; `scoped-work-projection`: "D projection: member/key/domain/unit/kind and host mapping mismatches fail without selecting another host" | deprecated mapping 분기는 이번 보강 |
| W39 | 충족+리뷰 | `scoped-work-hosts`: "W39: an open visual Conflict on one host holds the surface until that host resolves it"; "D hosts visual: a late earlier-host ${changedKind} mutation invalidates composition"; `scoped-work-basis`: "D basis: M-key selection and selected mapping provenance alter a surface digest" | 기록된 open Conflict에 의한 보류는 이번 보강. 두 host 시각 충돌을 발견해 기록하는 일은 리뷰 책임이다 |
| W40 | 충족 | `scoped-work-hosts`: "W40: a legacy member base deny is retained and no scoped peer or valid mapping opens it"; `scoped-work-composition`: "D compose: a legacy-current host base deny stays with its target"; `scoped-work-projection`: "D projection: legacy-current host has mapping evidence but no fabricated unit or path grant" | |

집계: 충족 32, 충족+리뷰 2(W10·W39), 부분 3(W21·W23·W27), 리뷰·운영 3(W16·W25·W26).

## 4. 검증 실행

로컬(macOS, 이 worktree, D35 작업 트리):

| 명령 (`frontend-workflow-kit/`) | Node | 결과 |
|---|---|---|
| `node --test scripts/lib/scoped-work-*.test.mjs` | 20.19.5 | 534 tests / 534 pass / 0 fail (D34의 519 + 이번 보강 15) |
| `npm run test:spec` | 20.19.5 | 1963 tests / 1961 pass / 0 fail / 2 skipped |
| `npm run test:spec` | 24.11.0 | 1963 tests / 1961 pass / 0 fail / 2 skipped |
| `npm run example:validate` | 20.19.5 | exit 0 (검사 12종 통과) |
| `npm run kit:pack` | 20.19.5 | exit 0 (293 files) |

`test:spec`은 CI macos-smoke 목록(scoped-work 전체, current-work execution/packed/snapshot 포함)을 모두 포함한다.
D35 이후 checkpoint의 CI는 해당 커밋 뒤에 관측한다.

CI(`.github/workflows/frontend-workflow-kit.yml`의 validate-example Node 20·compat-smoke Node 24·macos-smoke Node 20):

| run | head | 결과 |
|---|---|---|
| #986 | `5ff9b29` D28a | success |
| #987 | `14a30ba` D28b | success |
| #988 | `d4100ed` D29 | success |
| #989 | `0be43a9` D30 | failure — Git auto-maintenance와 임시 디렉터리 삭제 경합(`ENOTEMPTY`) |
| #990 | `e982bcd` D32 (`ad6858e` 포함) | success |
| #991 | `6f4ee3b` D33 | success |
| #992 | `9eaaab3` D34 | success |
| #993 | `9a1c449` D35 | success |

## 5. 남는 한계와 사람 소유 항목

- 부분 판정의 남은 부분: binary/NUL의 scoped 전용 fixture(W21), `--work`의 base/range(W23, v1에만 있음), reconcile 실행 순서별
  수렴(W27). scoped 다섯 CLI의 origin 포함 end-to-end fixture(W35 비고)도 없다.
- 실제 저장소 채택, owner·unit·`decision_work_scopes` 작성과 승인, pilot, E 측정은 사람 소유이며 이 PR에 포함하지 않는다.
- PR #246은 Draft이고 #238은 open이다. merge와 issue 종료는 사람 리뷰 이후의 전이다.

## 6. D36 리뷰 수정 — API 근거 경로 관측

D35(`9a1c449`) 재리뷰의 P2 2건을 고쳤다. 둘 다 Git backstop이 소비한 API 근거 경로의 변경을 놓치는 문제였다.

| 지적 | 원인 | 수정 |
|---|---|---|
| baseline에 없던 근거 경로가 파일로 생기면 놓친다 | 디렉터리 비교가 `경로/` 아래 자식만 모아, 없음과 파일을 모두 `null`로 비교했다 | 경로 자체의 종류(없음·파일·디렉터리·지원 안 함)를 먼저 비교한다(worktree·index 모두) |
| Git-ignored 새 근거 항목을 worktree에서 놓친다 | worktree 목록이 Git 경로 발견(`ls-files --others --exclude-standard`)에 의존했다 | worktree는 소비한 근거 경로를 디스크에서 직접 나열한다(ignore 포함, capture 전후 동일해야 함). `--staged`는 index만 본다 |

회귀 테스트(`scoped-work-execution`)는 실제 api-contract unit fixture를 쓴다. 두 테스트 모두 수정 전 `evaluateScopedGit()`이 위반 없음(`[]`)을 반환해 실패했다.

- "D backstop: a missing API evidence source created as a requested file is an evidence change in the worktree and index": manifest `Source`의 두 경로 중 없던 두 번째 경로가 요청된 `A` 대상이다.
- "D backstop: a Git-ignored new entry in a consumed API evidence directory is observed in the worktree only"

동작 변화: worktree 검사는 소비한 API 근거 디렉터리의 커밋되지 않은 항목과 Git-ignored 항목(OS·editor 메타데이터 포함)도 변경으로 보고한다.
[scoped-work.md](../../../frontend-workflow-kit/docs/reference/scoped-work.md)의 Known limits에 적었다.

로컬 검증(macOS, D36 작업 트리): scoped glob 536/536(Node 20.19.5, D35 + 2), `test:spec` 1965 tests / 1963 pass / 0 fail /
2 skipped(Node 20.19.5·24.11.0), `example:validate`·`kit:pack` exit 0.
