---
packet_id: "WP-{SCREEN_ID}-{mode}-{NNN}"
packet_type: "work-packet"
status: "draft"
target_screen: "{SCREEN_ID}"
domain: "{domain}"
requested_mode: "{requested_mode}"
readiness_mode: "{readiness_mode}"
readiness_source: "{path-to-readiness-output-or-run-report}"
created_at: "{YYYY-MM-DD}"
owner: "{agent-or-person}"
---

<!--
  Work Packet 은 새로운 source of truth 도, 새로운 gate 도 아니다.
  기존 readiness gate 를 "한 세션 단위"로 포장하는 실행 봉투(execution envelope)일 뿐이다.
  통과 ≠ 완료: 이 봉투가 발급됐다는 것은 readiness 게이트가 깨끗하고 경로/모드 상한이 정해졌다는 뜻일 뿐,
  설계가 제품적으로 맞다는 승인도 구현 허가서도 아니다. 모드 상한·경로는 기계가 정했지만 설계 적합성은 사람이 따로 확인한다.
  작성 규칙:
  - ScreenSpec 을 복사하지 않는다 — Must Read 에서 링크만 건다. 정본은 ScreenSpec/decision-log.
  - readiness 를 재계산하지 않는다 — readiness output(또는 run-report)을 그대로 소비한다.
  - allowed_paths / forbidden_paths 는 readiness output 에서 그대로 복사한다 (재유도 금지).
  - 이 packet 은 Open Decision / Conflict / Unknown 을 닫지 않는다. 나열만 하고 "닫지 말 것"으로 둔다.
  - requested_mode 가 readiness_mode 보다 높아도 packet 은 유효하다 — 천장은 readiness_mode 이고, 초과분은 거절+blocker 보고로 처리한다 (예: docs-only 거절). requested_mode 는 권한이 아니라 요청 기록일 뿐 — 무효화는 readiness_source 의 mode/facts 가 바뀔 때만.
  - 판정 단일 출처: readiness.mjs. 이 packet 은 그 출력을 옮기는 인덱스/핸드오프 보드다.
-->

# Work Packet: {SCREEN_ID} {mode}

## Goal
<!-- 이 세션이 readiness_mode 안에서 달성할 "한 가지". 모드 상한을 초과하는 산출물은 목표가 아니다.
     예: screen-skeleton 이면 "라우트에 연결된 화면 shell 만 세운다 (fixture UI·fake hook 없음)". -->
{이 세션이 `{readiness_mode}` 안에서 달성할 한 가지를 1~2문장으로. 상위 모드 산출물은 적지 않는다.}

## Validity
<!-- 이 packet 이 유효한 전제. 아래 무효조건 중 하나라도 바뀌면 packet 무효 → readiness 부터 재실행 후 재발급.
     스냅샷은 readiness 출력만 복사한다(정본 복사 금지). 정본 변화 감지는 사람이 한다 — 자동 stale 검사 스크립트로 만들지 않는다(게이트화 금지). -->
- 기준 스냅샷: `{readiness_source}` (실행/확인 시점: {YYYY-MM-DD}).
- **무효조건 (하나라도 바뀌면 무효 → 재발급):**
  - [ ] readiness 재실행 결과의 `readiness_mode` 가 `{readiness_mode}` 와 달라짐.
  - [ ] `readiness_source` 의 mode/facts(천장 근거 fact·allowed/forbidden)가 달라짐.
  - [ ] ScreenSpec `status` 가 `{status}` 와 달라짐.
  - [ ] Blocking Items 의 Open Decision 이 새로 열리거나 닫힘.
  - [ ] `readiness_source` 파일 자체가 갱신됨(날짜/내용 변경).
- 이 packet 은 스냅샷이다. 위 항목이 의심되면 집행 **전** `npm run workflow:readiness` 로 대조한다(사람 확인 — 자동 차단 아님).

## Must Read
<!-- 복사하지 말고 링크만. 구현자는 정본을 직접 읽는다. 우선순위 없는 링크 더미는 noise — 첫 줄에 "여기부터"를 둔다. -->
- ▶ **여기부터**: `{readiness_source}` — 이 세션의 게이트 사실(allowed/forbidden/mode)의 출처. readiness output / run-report.
- ScreenSpec (정본): `{docs/.../domains/{domain}/screens/{screen}/screen-spec.md}`
- 관련 정책: `frontend-workflow-kit/policies/implementation-mode-policy.yaml`
- (해당 시) Open Decisions / Conflicts: `{open-decisions.md}` · `{global/conflicts.md}`

## Readiness Snapshot
<!-- readiness output 을 그대로 옮긴다. 재계산 금지 — 숫자/모드는 readiness_source 에서 복사한다. -->
| 항목 | 값 |
|---|---|
| readiness_mode | `{readiness_mode}` |
| next_mode | `{next_mode}` |
| 천장 근거 | {readiness output 의 게이트 근거를 그대로 옮김 (예: "fact 천장 screen-skeleton 이 결정 / D-001 cap 은 더 높음").} |

출처: `{readiness_source}` — `readiness.mjs` 출력. 이 표는 소비물이며, 이 packet 에서 다시 유도하지 않는다.

## Allowed Paths
<!-- readiness output 의 allowed_paths 를 glob 그대로 복사한다. 손으로 넓히거나 줄이지 않는다. -->
```txt
{glob}        # readiness output 의 allowed_paths[0]
{glob}        # readiness output 의 allowed_paths[1]
```

## Forbidden Paths
<!-- readiness output 의 forbidden_paths 를 그대로 복사한다.
     명시 forbidden(예: src/api/**, openapi.yaml)은 "전 모드 공유 인프라 — 절대 금지".
     diff-based backstop 으로 allowed 밖 경로가 포함될 수 있다 (이 모드에선 아직 안 열림 — 상위 모드에서 열림).
     어느 쪽이든 출처 그대로 옮기고, 여기서 재유도하지 않는다. -->
```txt
{glob}        # 명시 forbidden — 전 모드 공유 인프라 (예: src/api/**)
{glob}        # allowed 밖 — 상위 모드에서만 열림 (예: src/features/{domain}/hooks/**)
```

## Blocking Items
<!-- 이 세션이 "푸는" 목록이 아니라 "닫지 말 것" 목록이다.
     Open Decision / Unknown / missing fact 를 나열하고 owner·blocking_mode 를 적는다.
     게이트 해제(resolve/close/confirm)는 모두 사람만 — 여기서는 손대지 않는다.
     이 표(Open Decision/Unknown/missing-fact)는 아래 ## Ambiguity Review Required 의 입력원이다 — Safe To Proceed? 의 Blocking 후보(D-cand/U-cand)는 여기 항목에서 끌어온다. -->
| ID | 유형 | 내용 | Blocking Mode | Owner | 처리 |
|---|---|---|---|---|---|
| {D-001} | decision | {결정 질문} | {final-fixture-ui} | {PM} | 닫지 말 것 (사람만) |
| {U-001} | unknown | {사실 확인 질문} | — | {BE} | 닫지 말 것 (사람만) |
| {fact} | missing-fact | {예: component_catalog_generated == false} | {rough-fixture-ui} | {agent} | 전제 충족 전까지 상위 모드 금지 |

> **Blocking Mode** = 이 항목이 cap 하는(=도달을 막는) 모드. decision·missing-fact 는 cap 모드를 갖지만, unknown 은 모드를 직접 cap 하지 않으면 `—` 로 둔다 (그래도 close 는 사람-전용 — Out of Scope 참조).

## Ambiguity Review Required
<!--
  workflow:packet 의 산출물 — 코딩 전에 먼저 채운다. (PR2 workflow:packet 이 작성)
  나쁜 첫 질문: "구현 가능?"  /  좋은 첫 질문: "애매한 거 놓친 거 없나?"
  이 섹션은 warning-only 텍스트다 — 코드 게이트가 아니다. 게이트는 readiness(Open Decision)+validate 뿐.
  여기서 readiness 를 재계산하지 않는다. 표의 입력원은 위 ## Blocking Items 다.
  불변식: 이 단계(workflow:packet/run/review)의 LLM 은 후보를 "제안"만 한다. Unknown/Decision/Conflict 를 닫거나 candidate→confirmed 로
          올리거나 ScreenSpec 결정을 resolve 하지 않는다 — 승격·resolve·close 는 전부 사람.
          (단, ScreenSpec authoring/reconcile 단계의 LLM 은 기존 계약대로 open 행 추가·resolved→open 재오픈 가능 — global/llm-rules.md. "직접 안 쓴다"는 이 packet/run/review 단계 한정.)
  auto-stop: 아래 Safe To Proceed? 가 어떤 모드에서 'no' 면, 그 모드 이상으로 코딩하지 않고
          멈춰서 그 후보를 사람에게 올린다(=runner 의 HALT_AMBIGUITY 입력). 사람이 ScreenSpec 반영
          → readiness 재실행 후 packet 재발급.
  빈 표는 "없음 — <사유>" 한 줄로 명시(형식주의 회피: 억지로 채우지 않는다).
  ⚠ 이 표는 "최소 표"다. 전체 triage(결정트리·신호표·Blocking Mode 매핑)는 템플릿에 넣지 않는다 → 아래 링크.
-->

| 모드 | Safe To Proceed? (yes/no) | 사유 | Blocking 후보 (D-cand / U-cand) |
|---|---|---|---|
| docs-only | yes | 문서만 — 모든 애매함은 여기서 Unknown/Decision 으로 표면화하면 됨 | — |
| route-skeleton | yes | 라우트 엔트리뿐 — 화면 내부 결정과 무관 (nav-map 충돌 시에만 no) | — |
| screen-skeleton | yes | 화면 shell — 화면 존재·이동이 결정에 안 묶임 | — |
| rough-fixture-ui | no | (예) D-cand-001 미승격 — fixture UI 형태가 갈리므로 여기서 멈춤 | D-cand-001 |
| {readiness_mode 까지 행 추가} | {yes/no} | {근거 한 줄} | {D-cand / U-cand / —} |

> **Safe To Proceed?** 는 readiness 재계산이 아니다 — 천장은 항상 `{readiness_mode}` 이고, 이 표는 그 아래에서 **더 보수적으로만** 멈출 수 있다(게이트를 *올리지* 못함). 모드를 아래에서 위로 훑어 'no' 가 처음 나오는 모드 **직전**에서 멈춘다. `readiness_mode` 보다 위 모드는 readiness 가 이미 cap 했으므로 평가하지 않는다.
> **Blocking 후보**(D-cand/U-cand)는 *제안*일 뿐 — 닫거나 ScreenSpec 에 확정하는 것은 사람. (별도 개념 아님: `Safe To Proceed?=no` 를 유발하는 미해결 후보일 뿐.)

> 전체 triage 결정트리·신호표·Blocking Mode 매핑은 → `docs/workflows/ambiguity-triage.md`
> New Unknowns / New Open Decision Candidates / Possibly Blocking 의 **상세 4블록 스키마**도 위 doc 으로 분리한다(템플릿엔 위 최소 표만).

## Expected Output
<!-- 이 모드에서 "정답"인 산출물을 *이진 판정 가능*하게 적는다. 산문 대신 검증 문장으로 (EARS 정신 — 문법은 채택 안 함).
     좋은 형태: "X 가 존재하고 Y 는 부재" / "WHEN <조건> THEN <관측 가능한 결과>" / "<경로>에 변경 N개, allowed 밖 0개".
     모드별 정답 형태 예:
       docs-only        = docs/frontend-workflow/** 문서만 변경; src/** 변경 0 (git diff 로 확인).
       route-skeleton   = src/app/** 라우트 엔트리만 존재; features/** 무접촉.
       screen-skeleton  = WHEN 라우트 진입 THEN 화면 shell 렌더; fixture UI·fake hook 부재.
       rough-fixture-ui = fixture 데이터로 화면 구동; src/api/** 변경 0; fake hook(AsyncState) 계약 충족. -->
{`{readiness_mode}` 의 정답 산출물을, 만족/위반을 이진 판정할 수 있는 1~2개 문장으로. 상위 모드 산출물(예: fixture UI·API 연동)은 정답이 아니다.}

## Out of Scope
<!-- 명시적 금지. Work Packet MUST NOT 목록과 정합. -->
- Open Decision resolve / Conflict close / Unknown close — 금지 (사람만).
- candidate → confirmed 승격 — 금지 (사람만).
- API endpoint 발명, copy 문구 발명, design value 발명 — 금지. 막히면 ScreenSpec Unknowns / Open Decisions / `conflicts.md` 에 남긴다.
- generated file(`_meta/*.yaml`, `component-catalog.md` 등) · confirmed 산출물 hand-edit — 금지.
- `{next_mode}` 이상 상위 모드 산출물 — 금지 (천장은 `{readiness_mode}`).
- ScreenSpec 대체 / readiness.mjs 대체 — 금지 (이 packet 은 인덱스일 뿐).

## Commands
<!-- 컨텍스트 팩의 실제 npm scripts. 경로는 이 packet 의 fixture/대상에 맞게 치환한다. -->
```bash
npm run workflow:state       # workflow-state.yaml 재생성 (소스 무수정)
npm run workflow:readiness   # 화면별 readiness_mode 재산출 (판정 단일 출처)
npm run workflow:validate    # 스키마/구조 검사 12종 (exit 0 = 통과)
```
<!-- 경계(allowed/forbidden) 검증은 validate 가 아니라 diff 로 본다 (validate.mjs:12) — Acceptance Criteria 참조. -->

## Acceptance Criteria
<!-- done 인정 조건. 하나라도 어기면 미완. -->
- [ ] 변경 파일이 Allowed Paths(readiness output) 안에만 존재 — `git diff --name-only` 로 확인.
- [ ] Forbidden Paths 무접촉 (특히 `src/api/**` · `openapi.yaml` 에 한 줄도 닿지 않음).
- [ ] 모드 천장(`{readiness_mode}`) 초과 산출물 없음 (상위 모드 UI/연동 욱여넣기 금지).
- [ ] Blocking Items 의 결정/Unknown/Conflict 가 그대로 열려 있음 (이 세션이 닫지 않음).
- [ ] `npm run workflow:validate` exit 0, 재실행 멱등 (재생성물 외 빈 diff).

## Review Checklist
<!-- 리뷰어 확인 항목. work-packet-rubric 의 10개 check 를 그룹으로 롤업한 것 (1:1 아님 — 한 줄이 여러 rubric check 를 묶는다). review-artifact.template.md 의 Checklist 가 이를 미러. -->
- [ ] **Pre-Implementation Review** — Ambiguity Review Required 의 `Safe To Proceed?` 가 `{readiness_mode}` 까지 모두 검토됐고(빈 표면은 "없음—사유"로 명시), Validity 전제(readiness_source mode/facts)가 무변경이며, Blocking 후보(D-cand/U-cand)가 모드별로 분류돼 있음 — 미해결 후보는 그대로 열림(이 세션이 닫지 않음).
- [ ] **게이트 판독** — readiness_mode/allowed/forbidden 이 `{readiness_source}` 와 글자 일치 (재계산·hand-edit 없음).
- [ ] **경로 준수** — diff 가 allowed 안에만, forbidden(특히 `src/api/**`) 무접촉.
- [ ] **천장 미초과** — `{readiness_mode}` 가 허용하는 산출물만 (과구현 없음).
- [ ] **미확정 미발명** — API/copy/design value 추측 없음, tbd 행 그대로.
- [ ] **결정 미닫힘** — Open Decision/Conflict/Unknown 상태 보존 (사람-전용 불변식).
- [ ] **보고·멱등** — blocker 는 readiness 의 `blocking`/`next_actions` 그대로 보고, 재실행 최소 diff.
