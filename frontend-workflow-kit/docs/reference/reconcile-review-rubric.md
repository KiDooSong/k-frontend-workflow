# Reconcile Review Rubric — `reconcile-stage04-v1`

> Stage 04(reconcile-input) 산출물 리뷰의 canonical contract. Reconciliation Register v2 frontmatter 의
> `review_profile: reconcile-stage04-v1` 이 이 문서를 가리킨다. 이 프로필의 목적은 리뷰 범위에 **바닥과
> 정지 기준**을 주는 것이다 — Stage 04 산출물은 계약상 잠정(draft·candidate·gate-raising-only)이며,
> 잠정물에 최종 fidelity 를 요구하면 리뷰가 O(위반 개수) 라운드로 팽창한다(#202).

관련 정본: [input-reconciliation.md](input-reconciliation.md) (Contract v2 · routing matrix) ·
[Stage 04](workflow-stages/04-reconcile-input.md) (운영 절차) ·
[reconcile-input skill](../../skills/reconcile-input/SKILL.md) (실행자).

## 역할 분담 — validator 가 잡는 것 / reviewer 가 보는 것

```txt
정적 validator (검사 12 + v2)   선언된 구조·참조·routing·provenance 형식을 강제한다.
reviewer (이 프로필)            diff 에서 권한 경계(gate-raising)와 라우팅 판단의 적절성을 확인한다.
어느 쪽도                       자유서술의 의미를 hard gate 로 추측하지 않는다.
```

정적 snapshot 은 **누가** 상태를 바꿨는지 알 수 없다. 현재 `resolved` 인 decision 을 보고 "LLM 권한
침범"으로 단정하지 않는다 — 금지 전이(resolve/close/accept/confirm) 여부는 **diff** 에서 확인한다.
v2 effect 어휘에 그 단어들이 없다는 것은 machine record 차원의 경계일 뿐, 실제 diff 확인은 reviewer 몫이다.

### 202-C warning을 읽는 법

검사 12의 `RR-ROUTE-101`과 `RR-STALE-101/102/103`은 **자동 수정 명령이 아니라 재검토 신호**다.

- `RR-ROUTE-101`: exact Evidence가 실제 input↔input 충돌인지 확인한다. 맞을 때만 Basis/Classification/Conflict
  target finding으로 올리고, warning만 보고 C-/Decision을 만들거나 Unknown을 닫지 않는다.
- `RR-STALE-101/102/103`: typed Decision target과 현재 canonical `open|resolved`를 확인한다. historical Effect를
  다시 쓰거나 상태 변경 actor를 추론하지 않고, replacement Result도 reviewer가 증거에 따라 판단한다.
- 각 warning은 `TP`(실제 drift), `FP`(현재 기록이 의도적), `Non-evaluable`(source/status 모호) 중 하나로 판정한다.
  이번 analyzer 범위의 drift를 warning 없이 사람이 발견하면 `Missed`로 기록한다.
- warning이 존재한다는 사실만으로 pass를 막지 않는다. 확인된 Critical/Major finding이 pass를 막고, FP/Non-evaluable은
  근거와 함께 batch finding에 한 번 기록한다. 모든 analyzer warning은 같은 round의 다른 필수 finding과 함께 제출한다.

validator나 reviewer는 warning을 근거로 문서를 자동 mutate하지 않는다. `--enforce`도 이 warning을 error로 승격하지 않는다.

## 필수 검토 범위 (이것만 pass 조건이다)

1. **Source backing** — item 마다 Evidence·Source Ref·Source Unit·Captured At 이 최소 바닥
   (`section pointer + source ref(또는 inherit) + source unit enum + RFC3339(또는 inherit)`)을 충족하는가.
   명백히 더 구체적인 source(node/instance/record)가 있는데 `document` 로 뭉갰으면 Major 로 볼 수 있다 —
   그러나 바닥을 넘는 무한 정밀화 요구는 금지다.
2. **Routing** — Basis 와 Classification 이 맞는가. Conflict/Unknown/Decision/Gap/INV-/VER- 가 올바른
   축으로 갔는가 (예: 입력↔입력 상호배타는 Unknown 이 아니라 Conflict).
   새 선택/충돌/컴포넌트 누락 판정 전 [결정 대조](input-reconciliation.md#decision-aware-preclassification)의
   Unknowns·Open Decisions·global `decision_refs`·현재 정본·관련 이력을 확인했는가. 실제 값·scope·현재 유효성으로
   구현 드리프트, 본문 밖의 답, 의도적 미제공, 진짜 새 충돌, 다른 범위/대체된 기록, 원래 open U-/D- 답을 구분했는가.
   `resolved` 문자열이나 읽기 순서만으로 권위를 정하지 않았는가. Notes 근거 보강은 실제 artifact `update`와 일치하며
   가짜 update / `simple-update + link-evidence`가 없는가. 근거 부족은 추측 대신 기존 불확실성 경로에 남겼는가.
3. **Gate-raising boundary** — diff 에서 LLM 이 resolve/close/accept/confirm/`confirmed` 승격을 수행하지
   않았는가. resolved decision 과의 충돌 시 Conflict 기록(이전 값 보존) + decision reopen 이 **함께** 있는가.
   partial에서도 이 쌍은 **같은 회차·같은 Item**으로 완결하며 이미 확인한 충돌을 재개 메모에 숨기지 않는다.
4. **Scope** — visual evidence 가 behavior 정본(Interaction/State Matrix, Data Requirements, API Candidates,
   Acceptance Criteria, Navigation Map edge, Domain Rules)을 확정하지 않았는가. raw source token 으로
   canonical Screen ID 를 발명하지 않았는가. code/tests/generated/live policy/CI 를 수정하지 않았는가.
5. **Completeness** — `workflow:validate` 가 잡는 summary/item/ref 오류가 모두 해소됐는가. 202-C warning은
   TP/FP/Non-evaluable로 판정됐는가. 이번 검토 범위에서 남은 불확실성이 open D-/U-/C-/G-/INV-/VER- 또는
   명시적 `Result` 로 표현됐는가. 부분 회차는 아래 checkpoint 조건도 충족하는가.

## Partial checkpoint review — 회차 종료와 입력 전체 완료

[부분 회차 프로토콜](input-reconciliation.md#partial-reconciliation-checkpoints)은 v1/v2 모두에 적용한다.
`partially-reconciled`의 `RR-LIFECYCLE-101`은 기본 및 `--enforce`에서 warning-only다. 경고 자체는 blocker가
아니지만 **실제 작업이 불완전한 checkpoint를 승인하라는 뜻도 아니다**. 기존 `in-progress`/`failed` hard,
행 없음/`not-started` enforce 승격, 구조·참조·provenance 오류는 그대로 유지한다.

Reviewer는 immutable input, 현재 문서, 기존 누적 Items와 diff, register의 입력별
`## Partial Reconciliation Notes`를 함께 대조한다. 메모는 canonical Summary/Items 뒤에 있어야 하며,
처리한 범위와 근거, 미처리 원문 pointer, 중단 이유, 다음 행동, 담당/연결 작업(미정이면 명시)을 담는다.
다음 회차가 원문·누적 Items·메모를 읽고 **같은 Summary 행을 `in-progress`로 이동**해 재개할 수 있어야 한다.
Notes 문구나 pointer 의미를 검사하는 새 자연어 parser/hard schema는 없으며, 이 확인은 reviewer의 책임이다.

확인할 불변식:

- 일부 범위를 실제로 처리했고 이번 회차의 문서 변경·필요한 gate-raising·effect group이 모두 일관되게 끝났다.
  아무 작업도 하지 않았거나 반쪽 conflict/reopen만 기록한 상태를 partial로 정상화하지 않는다.
- 기존 Item ID와 실제 effect를 보존하고 **모든 회차의 누적 Items로 Summary projection**을 계산한다.
  과거 effect 삭제·재번호화·현재 자식 상태에 맞춘 rewrite·완료 effect 재수행·미처리 축의 가짜 effect는 금지다.
  재개 메모 수정만으로 가짜 product artifact `update`를 만들지 않는다.
- 같은 snapshot의 `input_id`·입력 bytes·`supersedes`·Summary 단일 행을 유지한다. 회차 분할을 위해 새 입력을
  발급하지 않는다. 미처리 범위에도 decision-aware preclassification과 원래 open U-/D- answer 라우팅을 적용한다.
- partial은 v2 `Result=pending`을 권장한다(기존 Result warning 정책/v1 자유서술 유지).
  **이번 범위 종료 / 입력 전체 미완료 / 다음 범위**를 따로 보고하며 전체 accepted/완료로 보고하지 않는다.
- 모든 범위를 분류·라우팅했다면 `reconciled`다. **자식 결정이 open이라는 이유만으로 partial로 바꾸지 않는다.**
  전체 완료 시 메모의 현재 미처리 범위를 없음으로 갱신하거나 과거 기록으로 구분하고 일반 `reconciled` 재실행은 중단한다.
  과거 잘못된 완료 표시는 [명시적 유지보수/사람 확인](upgrade-notes.md#partial-reconciliation-checkpoints-232)으로만 정정한다.

### P20 reviewer 반례

| 반례 | 판정과 이유 |
|---|---|
| P20-a: `partially-reconciled / pending`, Items는 유효하지만 재개 메모가 없음 | **Major / CHANGES_REQUIRED**. 다음 회차의 미처리 범위와 진입 행동을 복원할 수 없다. 정적 validate 통과가 이 누락을 승인하지 않는다. |
| P20-b: 메모가 “나머지는 나중에”뿐이며 원문 pointer와 다음 행동이 없음 | **Major / CHANGES_REQUIRED**. 잔여 범위를 식별할 수 없다. 담당자가 미정인 것 자체가 아니라 실행 가능한 인계가 없는 것이 문제다. |
| P20-c: 새 Item ID로 이미 끝난 effect를 다시 수행하거나 이전 회차 effect를 지우고 마지막 회차만 집계 | **Major / CHANGES_REQUIRED**. 원문·기존 Items·diff와 모순된다. exact duplicate 검사를 통과하도록 새 ID를 붙여도 재수행은 허용되지 않는다. |

partial warning은 미처리 범위의 구현 허가나 전역 deny가 아니다. 일반 구현은 현재 canonical 계약과 기존
readiness/path 권한으로 판단한다. `visual-refresh`는 선택 입력의 정확한 `reconciled + accepted`와 single-item
등 기존 조건을 계속 요구한다. partial + accepted도 `VR-RR-005` 거부이며, 필요한 게이트는 Notes가 아니라
canonical Open Decision으로 남긴다.

## Pass 조건으로 요구하면 안 되는 것

- 잠정 mapping 의 최종 pixel-perfect 정확도, 모든 Figma node 의 전체 ancestry
- 모든 token 의 final canonical naming
- human decision 의 최종 선택, Copy Key `confirmed` 승격
- downstream code 구현, visual regression green
- provenance floor 를 넘는 무한 정밀화
- 스타일·표현만 다른 비기능적 rewrite
- human-final 상태(`expected-after` 계열)를 LLM-after candidate 에 요구 —
  채점/비교 기준은 항상 **LLM 단독 출력**(`expected-llm-after` 계열)이다.

문구/링크 회귀와 정적 synthetic fixture는 지침의 존재 및 저작된 출력의 상태·typed ref·routing·projection을 검사한다.
이를 실제 LLM의 결정 탐색/분류 실행, 소비자 dogfood, 리뷰 라운드 감소 증거로 보고하지 않는다.
실제 에이전트 dry-run과 사람 평가의 실행 여부·결과는 따로 기록한다.

## Severity

| 등급 | 예 | Pass 차단 |
|---|---|---|
| Critical | gate-lowering(resolve/close/accept/confirm/`confirmed` 승격), code/tests/generated/live policy/CI 수정, 기존 결정 조용히 덮어쓰기 | 예 |
| Major | 잘못된 routing, target 없음, summary/item mismatch, 불완전한 partial checkpoint/P20 반례, visual→behavior 누출, 명백히 더 구체적인 source 를 `document` 로 뭉갬 | 예 |
| Minor | provenance floor 누락, noncanonical grammar, stale Result | v2 필수값이면 예, heuristic 이면 아니오 |
| Info | 더 정밀한 node ancestry, 문구 개선, optional visual detail | 아니오 |

simple-update 누락보다 **gate-lowering 침범이 항상 더 무겁다** — 후자는 1건이라도 Critical 이다.

## Finding 일괄 제출 규칙

reviewer 는 한 라운드에 발견한 **필수 finding 을 전부** 제출한다. 권고 출력 형식:

```md
Verdict: CHANGES_REQUIRED

Hard findings
- RR-ROUTE-… / RR-REF-… / RP-… (validator 재현 가능하면 코드 병기)
- Critical/Major 서술 finding

Non-blocking notes
- INFO …

Stop condition after fixes
- workflow:validate passes
- no Critical/Major finding
- remaining uncertainty in reviewed scope is represented by open D/U/C/G/INV/VER
- partial: remaining original pointers and next action are in Partial Reconciliation Notes
- current-round completion and whole-input completion are reported separately
```

금지:

- 한 라운드에 한 finding 만 의도적으로 제출 (O(n) 라운드 팽창의 직접 원인)
- 이전 라운드에서 통과한 fidelity 수준을 다음 라운드에 임의 상향
- Info 항목을 새 pass 조건으로 전환
- human-final 상태를 Stage 04 candidate 에 요구

## Stop condition — 전부 만족되면 이번 회차 리뷰를 종료한다

1. `workflow:validate` hard errors 0
2. reviewer Critical/Major 0
3. gate-lowering diff 0
4. source/provenance floor 충족
5. 이번 검토 범위의 unresolved 사항이 canonical open item(D/U/C/G/INV/VER)으로 표현됨.
   아직 reconcile하지 않은 범위는 가짜 item 대신 입력별 Partial Reconciliation Notes에 실행 가능하게 인계됨
6. scope 밖 code/tests/generated/live policy/CI 변경 0

partial의 회차 stop은 입력 전체 완료가 아니다. 전체 범위를 분류·라우팅한 경우에만 같은 행을 `reconciled`로
마무리한다. 기존 hard/Critical/Major/raise-only/provenance 조건을 partial이라는 이유로 완화하지 않는다.
남은 precision 개선은 별도 follow-up 이며 현재 reconcile pass 를 막지 않는다.
