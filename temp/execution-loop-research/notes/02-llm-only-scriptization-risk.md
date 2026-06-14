# LLM-only 워크플로우에서 `k-frontend-workflow` 스크립트화가 리뷰/티키타카를 스킵할 위험

작성일: 2026-06-14  
대상 repo: https://github.com/KiDooSong/k-frontend-workflow  
목적: Claude/Codex와 이어서 논의하기 위한 메모.

---

## 1. 핵심 질문

원래 입력이 들어오고 설계할 때는 다음 흐름이 일반적이다.

```txt
입력 들어옴
→ LLM/사람이 애매한 것 짚음
→ 결정 필요한 것 분리
→ 설계문서 작성
→ Codex 리뷰
→ Claude 수정
→ 구현
→ 또 리뷰
→ 수정
→ 검증
```

그런데 `k-frontend-workflow`는 `workflow-state`, `readiness`, `validate`, `forbidden-paths`, `test-fixtures`처럼 스크립트화를 많이 해둔 구조다.

따라서 LLM-only로 작업하는 사람 입장에서 다음 우려가 생긴다.

> 스크립트가 너무 많이 자동화되어서, 원래 사람/LLM이 중간중간 짚어야 하는 애매한 결정사항이나 설계 리뷰가 그냥 스킵되는 것 아닌가?

---

## 2. 결론

**이 레포는 LLM 개입 여지를 없애는 구조라기보다는, LLM이 마음대로 넘어가면 안 되는 경계들을 스크립트로 고정한 구조**에 가깝다.

다만 **LLM-only로 쓰는 사람이 “스크립트 통과 = 설계적으로 충분함”으로 착각하면, 애매한 설계 티키타카가 스킵될 위험은 분명히 있다.**

한 문장으로 정리하면:

> **이 레포는 LLM 티키타카를 없애면 위험해지고, LLM 티키타카의 산출물을 기계가 지키게 만들면 강해진다.**

---

## 3. 지금 구조가 의도하는 바

이 레포의 의도는 설계 대화를 없애는 것이 아니라, **“결정됐다고 착각하고 넘어가는 부분”을 막는 것**에 가깝다.

예를 들어 ScreenSpec 템플릿은 처음부터 다음 원칙을 둔다.

```txt
- API endpoint는 확정하지 말고 candidate로 적는다.
- 모르는 내용은 Unknowns에 적는다.
- 선택이 필요한 정책/UX/API 방향은 추측하지 말고 Open Decisions에 open으로 적는다.
- confirmed 승격은 LLM이 하지 말고 사람만 한다.
```

또한 `status: confirmed`로 올릴 때 필요한 메타데이터인 `approved_by`, `approved_at`, `decision_id`도 사람이 추가하도록 되어 있다.

즉 철학은 다음에 가깝다.

```txt
나쁜 방향:
LLM이 애매한 것을 조용히 정하고 구현까지 밀어붙임

좋은 방향:
LLM이 애매한 것을 Unknown/Open Decision으로 드러내고,
사람 또는 리뷰 LLM이 확인한 뒤,
스크립트가 그 경계를 강제함
```

근거 파일:
- `frontend-workflow-kit/templates/screen/screen-spec.template.md`

---

## 4. 실제 위험: 스크립트는 구조적 사실은 보지만 의미/제품 판단은 못 한다

스크립트는 이런 것은 잘 본다.

```txt
ScreenSpec이 있는가?
status가 draft 이상인가?
Open Decision 형식이 맞는가?
confirmed API가 api-manifest/zod schema와 연결되는가?
allowed_paths 밖을 건드렸는가?
validate가 통과하는가?
```

하지만 이런 것은 잘 못 본다.

```txt
이 UX 결정이 맞는가?
이 화면 상태 정의가 충분한가?
기획 의도가 제대로 반영됐는가?
Interaction Matrix가 사용자의 실제 흐름을 잘 표현하는가?
Copy가 브랜드 톤에 맞는가?
이 API 후보가 제품적으로 합리적인가?
리뷰어가 봤을 때 설계가 납득되는가?
```

따라서 LLM-only 사용자 입장에서는 **“검증 통과”가 “설계 검토 완료”처럼 보이는 순간이 위험**하다.

---

## 5. 특히 조심해야 할 지점

### 5.1. `Unknowns`는 기본적으로 게이트가 아니다

로드맵상 `Unknowns`는 fact-finding queue이고, `tbd_count`는 next-action 메시지에만 쓰이며 모드를 막지 않는다.

`Conflicts`도 passive log이고, 막으려면 Open Decision으로 승격해야 한다.

예를 들어 다음은 “모르는 게 있다”는 신호지만, 그 자체로 readiness를 반드시 막는 것은 아니다.

```md
## Unknowns
| ID | Question | Status |
|---|---|---|
| U-001 | 쿠폰 만료 상태 문구는 어떻게 표시하나? | open |
```

정말 구현을 막아야 하는 선택이면 `Open Decisions`에 올려야 한다.

```md
## Open Decisions
| ID | Decision Needed | Options | Blocking Mode | Owner | Status |
|---|---|---|---|---|---|
| D-001 | 만료 쿠폰을 목록에서 숨길지, disabled 카드로 보여줄지 결정 필요 | hide / disabled / separate tab | final-fixture-ui | PM | open |
```

따라서 LLM-only 워크플로우에서는 매번 다음을 리뷰해야 한다.

```txt
Unknown으로만 남긴 것이 맞는가?
Open Decision으로 승격해서 readiness를 막아야 하는가?
Blocking Mode는 어디여야 하는가?
```

근거 파일:
- `frontend-workflow-kit/roadmap-current.md`
- `frontend-workflow-kit/templates/screen/screen-spec.template.md`

---

### 5.2. draft 문서만으로 일부 구현은 진행될 수 있다

정책상 `screen-skeleton`은 `screen_spec_status >= draft`면 열린다.

`rough-fixture-ui`도 다음 조건이 맞으면 열릴 수 있다.

```txt
screen_spec_status >= draft
screen_spec_authored == true
component_catalog_generated == true
fake_hook_exists == true
```

이건 빠르게 골격/fixture UI까지 갈 수 있게 만든 장점이다.

하지만 반대로 말하면 **draft 품질이 낮아도 구조 조건만 맞으면 구현이 시작될 수 있다**는 뜻이다.

물론 상위 모드는 더 강하다.

```txt
final-fixture-ui:
- screen_spec_status >= confirmed
- figma_mapping_status >= draft

api-integrated-ui:
- api_confidence_min == confirmed
- state_matrix_complete == true
```

그래도 중간 단계에서 “설계 리뷰 없이 화면 shell/fixture UI가 쌓이는” 상황은 생길 수 있다.

근거 파일:
- `frontend-workflow-kit/policies/implementation-mode-policy.yaml`

---

### 5.3. `validate`는 의미 리뷰가 아니라 구조 리뷰에 가깝다

`validate.mjs`는 12종 검사를 한다.

대략 이런 것들을 본다.

```txt
frontmatter
artifact-manifest
depends_on / sources
route 중복/부재
generated marker
confirmed 승인 메타데이터
API Candidates
Open Decisions
Copy Keys
Input Artifacts
Reconciliation Register
```

이건 굉장히 좋은 안전장치다.

하지만 Codex 리뷰처럼 다음을 판단하는 도구는 아니다.

```txt
이 설계가 이상한가?
이 UX가 빠졌는가?
이 정책이 기획 의도와 맞는가?
상태 정의가 제품적으로 충분한가?
```

예를 들어 아래 ScreenSpec은 구조적으로는 통과할 수 있다.

```md
## Purpose
쿠폰 목록을 보여준다.

## State Matrix
loading/success/empty/error/refreshing 모두 있음.

## Interaction Matrix
행 있음.

## API Candidates
GET /coupons (confidence: candidate)

## Unknowns
없음.

## Open Decisions
없음.
```

하지만 실제로는 다음이 빠졌을 수 있다.

```txt
쿠폰 정렬 기준
만료 쿠폰 노출 방식
발급 가능/보유 쿠폰 탭 분리
오프라인 상태
권한 없는 상태
회원/비회원 분기
```

스크립트는 이걸 제품적으로 부족하다고 판단하지 못한다.

근거 파일:
- `frontend-workflow-kit/scripts/validate.mjs`

---

### 5.4. Input Reconciliation도 “사람 판단”을 전제로 한다

`input-reconciliation.md`는 새 입력이 들어오면 기존 문서와 대조해서 다음으로 분류하는 흐름을 설명한다.

```txt
업데이트
Unknown
Open Decision
Conflict
```

그리고 사람 결정 후 문서 업데이트를 거쳐 다음으로 간다.

```txt
workflow:state
readiness
validate
```

목적도 분명하다.

```txt
- 새 입력이 기존 문서와 같은 방향인지 확인
- confirmed 문서나 resolved 결정과 충돌하는지 확인
- 단순 업데이트 / 사실 확인 / 결정 필요 / 충돌 분리
- 코드 변경 전에 문서 상태와 readiness 다시 계산
- 사용자가 지금 결정할 수 있는 항목은 직접 결정
- 보류/문의가 필요한 항목은 blocker로 남김
```

즉 이 단계는 본질적으로 **LLM이 사용자와 티키타카해야 하는 구간**이다.

여기를 runner가 자동으로 “reconciled” 처리해버리면 위험하다.

근거 파일:
- `frontend-workflow-kit/input-reconciliation.md`

---

## 6. 위험한 사용법

아래처럼 쓰면 질문한 우려가 현실이 될 수 있다.

```txt
입력 넣음
→ LLM이 ScreenSpec 자동 작성
→ workflow:state
→ workflow:readiness
→ 구현 가능하네?
→ 구현
→ validate 통과
→ 끝
```

이 방식의 문제:

```txt
readiness가 열림 = 설계 OK 로 착각
validate 통과 = 제품적으로 OK 로 착각
Unknown 있음 = 그래도 진행
draft = 충분히 리뷰됨으로 착각
Work Packet = 구현 허가서로 착각
```

---

## 7. 안전한 사용법

안전하게 쓰려면 스크립트는 판단자가 아니라 **가드레일**이어야 한다.

```txt
입력 넣음
→ LLM이 먼저 Ambiguity / Unknown / Open Decision 후보를 뽑음
→ 사람 또는 다른 LLM(Codex)이 리뷰
→ Claude가 ScreenSpec 수정
→ 다시 Codex 리뷰
→ readiness 확인
→ Work Packet 발급
→ 구현
→ validate / forbidden-paths / test-fixtures
→ Codex 리뷰
→ Claude 수정
→ Run Report
```

즉 이 레포의 스크립트화는 **리뷰를 대체하면 안 되고, 리뷰 후 합의된 경계를 강제하는 쪽**이어야 한다.

---

## 8. `Execution Loop / Work Packet Runner`를 추가한다면 보강해야 할 방향

`Execution Loop / Work Packet Runner`를 추가한다면, 오히려 “다이렉트 구현”을 막는 쪽으로 설계해야 한다.

핵심은 **runner가 자동으로 구현을 시작하지 않게 하는 것**이다.

`workflow:packet`은 바로 코딩으로 넘어가는 것이 아니라 먼저 이런 것을 생성해야 한다.

```md
## Ambiguity Review Required

### New Unknowns
- U-001: ...

### New Open Decision Candidates
- D-candidate-001: ...

### Possibly Blocking Ambiguities
- 만료 쿠폰 노출 방식은 final-fixture-ui 전에 결정 필요
- API 응답의 pagination 방식은 api-integrated-ui 전에 결정 필요

### Safe To Proceed?
- docs-only: yes
- route-skeleton: yes
- screen-skeleton: yes
- rough-fixture-ui: no, because ...
```

즉 Work Packet Runner의 첫 단계는 다음이어야 한다.

```txt
나쁜 첫 질문:
구현 가능?

좋은 첫 질문:
애매한 거 놓친 거 없나?
```

---

## 9. 추천하는 LLM-only 운영 패턴

### 9.1. Claude = 작성자, Codex = 비평자 역할을 고정

현재 방식처럼 “설계문서 작성 → Codex 리뷰 → Claude 수정”은 계속 유지하는 게 좋다.

역할을 명시적으로 나누면 더 안전하다.

```txt
Claude Author:
- 입력을 ScreenSpec / Open Decisions / Unknowns로 정리
- 구현 초안 작성

Codex Reviewer:
- 빠진 상태/엣지케이스/결정사항 찾기
- confirmed로 올리면 안 되는 것 지적
- Unknown으로만 둔 게 Open Decision이어야 하는지 검토
- readiness가 너무 높게 나온 건 아닌지 비판

Claude Fixer:
- 리뷰 반영
- 문서/코드 수정
- validate 통과 확인
```

---

### 9.2. 구현 전 “Ambiguity Gate”를 사람이 보는 단계로 추가

스크립트 게이트 말고, LLM 프롬프트 단계에서 이런 체크를 강제하면 좋다.

```txt
구현 전에 다음을 먼저 보고하라.

1. 이 입력에서 결정이 필요한 것
2. 사실 확인이 필요한 것
3. 구현을 막아야 하는 것
4. Open Decision으로 올릴 것
5. Unknown으로만 둬도 되는 것
6. 지금 구현해도 되는 최소 모드
7. 상위 모드에서 절대 하면 안 되는 것
```

이건 코드 게이트가 아니라 **LLM 대화 게이트**다.

---

### 9.3. `Unknown`을 자동으로 방치하지 말고 triage하기

현재 구조상 Unknown은 게이트가 아니므로, LLM-only 사용자는 매번 이렇게 물어야 한다.

```txt
각 Unknown에 대해:
- 단순 fact-finding인가?
- 구현 모드를 막아야 하는가?
- 막아야 한다면 Open Decision으로 승격해야 하는가?
- Blocking Mode는 무엇인가?
```

이게 없으면 Unknown이 문서에만 남고 구현은 진행될 수 있다.

---

### 9.4. `Work Packet`은 “실행 허가서”가 아니라 “리뷰 가능한 실행 봉투”로 쓰기

Work Packet은 새 source of truth도, 새 gate도 아니며 readiness output을 그대로 소비하는 실행 봉투여야 한다.

따라서 Work Packet에 이런 섹션을 추가하거나 강하게 쓰면 좋다.

```md
## Pre-Implementation Review

- [ ] ScreenSpec이 Codex 리뷰를 받았는가?
- [ ] Open Decision 후보가 누락되지 않았는가?
- [ ] Unknown 중 blocking이어야 하는 항목이 없는가?
- [ ] requested_mode가 readiness_mode를 초과하지 않는가?
- [ ] 사람 승인 없이 confirmed로 오른 항목이 없는가?
```

근거 파일:
- `frontend-workflow-kit/templates/work-packet/work-packet.template.md`

---

### 9.5. `workflow:run`은 자동 수정 루프보다 “멈춤 루프”가 먼저

루프 엔지니어링이라고 해서 바로 자동으로 수정 재시도하면 위험하다.

이 레포에는 처음에는 이런 루프가 더 맞다.

```txt
state/readiness 실행
→ blocker 있으면 멈춤
→ Ambiguity Report 생성
→ 사람/리뷰 LLM이 결정
→ 다시 state/readiness
→ 구현
→ validate/forbidden-paths/test-fixtures
→ 실패하면 자동 수정 전, 실패 원인 보고
```

즉 **auto-fix loop**보다 **auto-stop loop**가 먼저다.

---

## 10. “스크립트화가 LLM 개입을 스킵하는가?”에 대한 답

정리하면:

**현재 레포 철학상으로는 스킵하려는 게 아니다.**  
오히려 LLM이 제멋대로 결정하거나 확정하지 못하게 하려는 설계다.

하지만 **운영 방식에 따라 스킵될 수 있다.**

특히 아래 등식은 위험하다.

```txt
readiness가 열림 = 설계 OK
validate 통과 = 제품적으로 OK
Unknown 있음 = 그래도 진행
draft = 충분히 리뷰됨
Work Packet = 구현 허가
```

반대로 아래처럼 쓰면 꽤 좋은 LLM-only 워크플로우가 된다.

```txt
readiness = 기계적 상한
validate = 구조적 검증
forbidden-paths = 경로 침범 방지
test-fixtures = 회귀 검증
Codex review = 의미/설계 비평
Claude = 작성/수정
사람 = 결정/승인/confirmed 승격
```

---

## 11. 추천 방향

다음 축을 늘린다면, 이름은 `Execution Loop`여도 실제 첫 구현은 **“자동 구현”이 아니라 “자동 멈춤 + 리뷰 포인트 생성”**이어야 한다.

가장 좋은 다음 단계:

```txt
workflow:packet
= readiness 결과를 읽고,
  구현 가능 여부만 말하는 게 아니라,
  구현 전에 확인해야 할 Unknown/Open Decision/Conflict 후보를 요약하는 packet 생성

workflow:report
= 구현 후 validate/forbidden-paths/test-fixtures/diff/Codex review 결과를 모아
  다음 티키타카의 입력으로 넘기는 report 생성
```

---

## 12. Claude에 넘겨볼 구체화 프롬프트

```txt
아래 전제를 바탕으로 k-frontend-workflow의 Execution Loop / Work Packet Runner 설계를 구체화해줘.

전제:
- 스크립트는 리뷰를 대체하지 않고, 리뷰 후 합의된 경계를 강제하는 가드레일이다.
- readiness.mjs는 판정의 단일 출처다.
- validate.mjs는 구조 검증이지 제품/의미 리뷰가 아니다.
- Unknown은 기본적으로 readiness gate가 아니므로 triage가 필요하다.
- 구현을 막아야 하는 애매함은 Open Decision으로 승격해야 한다.
- Work Packet은 실행 허가서가 아니라 리뷰 가능한 실행 봉투다.
- LLM은 confirmed 승격, Open Decision resolve, Unknown close, Conflict close를 하지 않는다.
- 첫 구현은 auto-fix loop가 아니라 auto-stop loop여야 한다.

요청:
1. `workflow:packet`이 생성해야 할 Ambiguity Review 섹션을 설계해줘.
2. `workflow:packet`이 자동 구현으로 넘어가지 않게 하는 중단 조건을 정의해줘.
3. `workflow:report`가 다음 Claude/Codex 티키타카의 입력이 되도록 포함해야 할 항목을 정의해줘.
4. Unknown → Open Decision 승격 판단 rubric을 만들어줘.
5. LLM-only 사용자가 `readiness 통과 = 설계 OK`로 착각하지 않도록 README/Skill 문구를 어떻게 바꾸면 좋을지 제안해줘.
6. 첫 PR을 최소 변경으로 쪼갠다면 어떤 파일을 고치는 게 좋은지 제안해줘.
```

---

## 13. 체크리스트

### 사용자가 매번 확인할 것

```txt
- 이 입력에서 진짜 결정해야 하는 것은 무엇인가?
- Unknown으로 둬도 되는가, Open Decision으로 막아야 하는가?
- draft 상태에서 구현 가능한 범위가 너무 넓지 않은가?
- readiness가 높게 나온 이유가 설계적으로 납득되는가?
- Codex 리뷰가 의미/제품 관점에서 한 번 들어갔는가?
- Claude가 리뷰를 반영했는가?
- 사람 승인 없이 confirmed로 오른 항목이 없는가?
```

### Runner가 자동으로 멈춰야 할 조건 후보

```txt
- 새 입력이 confirmed/resolved 항목과 충돌함
- Open Decision 후보가 있는데 아직 표에 반영되지 않음
- Unknown 중 blocking 가능성이 높은 항목이 있음
- requested_mode > readiness_mode
- readiness_mode가 docs-only 또는 route-skeleton인데 구현 요청이 들어옴
- validate는 통과하지만 Codex review가 BLOCKER/MAJOR를 냄
- forbidden-paths 위반이 있음
- generated file 또는 confirmed artifact를 hand-edit하려 함
```

### 금지해야 할 착각

```txt
readiness 통과 != 설계 리뷰 완료
validate 통과 != 제품적으로 올바름
Unknown open != 구현해도 항상 안전
draft != 리뷰 완료
Work Packet != 구현 허가서
Run Report != 사람 승인
```
