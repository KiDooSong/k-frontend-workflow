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

## 필수 검토 범위 (이것만 pass 조건이다)

1. **Source backing** — item 마다 Evidence·Source Ref·Source Unit·Captured At 이 최소 바닥
   (`section pointer + source ref(또는 inherit) + source unit enum + RFC3339(또는 inherit)`)을 충족하는가.
   명백히 더 구체적인 source(node/instance/record)가 있는데 `document` 로 뭉갰으면 Major 로 볼 수 있다 —
   그러나 바닥을 넘는 무한 정밀화 요구는 금지다.
2. **Routing** — Basis 와 Classification 이 맞는가. Conflict/Unknown/Decision/Gap/INV-/VER- 가 올바른
   축으로 갔는가 (예: 입력↔입력 상호배타는 Unknown 이 아니라 Conflict).
3. **Gate-raising boundary** — diff 에서 LLM 이 resolve/close/accept/confirm/`confirmed` 승격을 수행하지
   않았는가. resolved decision 과의 충돌 시 Conflict 기록(이전 값 보존) + decision reopen 이 **함께** 있는가.
4. **Scope** — visual evidence 가 behavior 정본(Interaction/State Matrix, Data Requirements, API Candidates,
   Acceptance Criteria, Navigation Map edge, Domain Rules)을 확정하지 않았는가. raw source token 으로
   canonical Screen ID 를 발명하지 않았는가. code/tests/generated/live policy/CI 를 수정하지 않았는가.
5. **Completeness** — `workflow:validate` 가 잡는 summary/item/ref 오류가 모두 해소됐는가. 남은 불확실성이
   open D-/U-/C-/G-/INV-/VER- 또는 명시적 `Result` 로 표현됐는가.

## Pass 조건으로 요구하면 안 되는 것

- 잠정 mapping 의 최종 pixel-perfect 정확도, 모든 Figma node 의 전체 ancestry
- 모든 token 의 final canonical naming
- human decision 의 최종 선택, Copy Key `confirmed` 승격
- downstream code 구현, visual regression green
- provenance floor 를 넘는 무한 정밀화
- 스타일·표현만 다른 비기능적 rewrite
- human-final 상태(`expected-after` 계열)를 LLM-after candidate 에 요구 —
  채점/비교 기준은 항상 **LLM 단독 출력**(`expected-llm-after` 계열)이다.

## Severity

| 등급 | 예 | Pass 차단 |
|---|---|---|
| Critical | gate-lowering(resolve/close/accept/confirm/`confirmed` 승격), code/tests/generated/live policy/CI 수정, 기존 결정 조용히 덮어쓰기 | 예 |
| Major | 잘못된 routing, target 없음, summary/item mismatch, visual→behavior 누출, 명백히 더 구체적인 source 를 `document` 로 뭉갬 | 예 |
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
- remaining uncertainty is represented by open D/U/C/G/INV/VER
```

금지:

- 한 라운드에 한 finding 만 의도적으로 제출 (O(n) 라운드 팽창의 직접 원인)
- 이전 라운드에서 통과한 fidelity 수준을 다음 라운드에 임의 상향
- Info 항목을 새 pass 조건으로 전환
- human-final 상태를 Stage 04 candidate 에 요구

## Stop condition — 전부 만족되면 리뷰를 종료한다

1. `workflow:validate` hard errors 0
2. reviewer Critical/Major 0
3. gate-lowering diff 0
4. source/provenance floor 충족
5. unresolved 사항이 canonical open item(D/U/C/G/INV/VER)으로 표현됨
6. scope 밖 code/tests/generated/live policy/CI 변경 0

남은 precision 개선은 별도 follow-up 이며 현재 reconcile pass 를 막지 않는다.
