<!--
  input-artifact.template.md — 외부 입력 스킬이 저장하는 "입력 결과물" 한 건의 형식.

  무엇인가:
  - 기획 / Figma / API 문서 / 회의록 / QA 메모 등 외부 입력을 수집·요약해 프로젝트 안에 남긴 md 파일.
  - reconcile-input 스킬이 이 파일을 읽어 기존 frontend-workflow 문서와 대조한다(분류·register 기록).
  - 전체 계약: ../../input-reconciliation.md  (Input Result Contract / Reconciliation Register).
  - 실제 예시 5건: ../../examples/input-reconciliation/inputs/*.md

  무엇이 아닌가 (MVP-A 현재):
  - 이 입력은 **검증 대상 authoring 산출물이 아니다.** `inputs/` 아래에 두며, validate 가 보지 않는다
    (frontmatter.schema.json 의 artifact_type enum 에 input 종류가 없다 — 일부러 넣지 않았다).
  - 따라서 schema/validate 검사·생성 스크립트가 **아직 없다.** 지금은 Tier 2 문서 계약일 뿐이다.
    (후속 후보: 미처리 감지 = input_id ↔ Reconciliation Register 대조. input-reconciliation.md "MVP Placement" 참고.)

  저장 위치:
  - 권장: docs/frontend-workflow/inputs/{input_id}.md  (파일명 = input_id — grep 추적 용이)

  작성 규칙:
  - frontmatter 값은 따옴표로 감싼다(YAML parser-safe). placeholder {X} 는 실제 값으로 치환.
  - 입력은 "사실 수집"만 한다 — 결정을 내리거나(resolve), confirmed 로 올리거나, 코드를 만들지 않는다. 그건 reconcile-input·사람 몫.
-->
---
input_id: "IN-{YYYYMMDD}-{source}-{NNN}"   # required·불변·전역유일. 멱등성·역추적·supersede·미처리 감지가 이 키에 걸린다.
input_type: "{planning|figma|api|meeting|qa|user-note}"     # 입력 성격(사람이 읽는 분류 라벨)
source_type: "{planning-doc|figma|api-doc|meeting|qa|user-note}"   # 원천 종류(계약 enum)
source_ref: "{원본 링크 또는 파일 경로}"   # 추적용 원천 포인터
captured_at: "{YYYY-MM-DD}T00:00:00+09:00"   # 입력을 수집한 시점
captured_by: "{입력 스킬 이름}"             # 어떤 입력 스킬이 저장했는지
status: "captured"                          # 입력 수집 상태(reconcile 상태가 아님 — 그건 Reconciliation Register 의 몫)
confidence: "{unknown|candidate|confirmed}"  # 입력의 확신도. candidate 가 기본. confirmed 라도 LLM 이 문서를 confirmed 로 올리진 않는다.
affected_domains: ["{domain}"]              # suggested_scope.domains — 관련 도메인
affected_screens: ["{SCREEN_ID}"]           # suggested_scope.screens — 관련 화면
supersedes: null                            # 같은 원천의 이전 input_id 를 대체할 때만. (입력↔입력 축. 결정값 번복 아님)
---

# Input: {입력을 한 줄로 요약한 제목}

## Summary
{이 입력이 무엇을 바꾸려 하는지 1~3문장. 사람이 읽는 요약.}

## Extracted Facts
<!-- 입력에서 뽑아낸 "사실"만. 추측·결정·구현 지시는 쓰지 않는다. -->
- {사실 1}
- {사실 2}
- {사실 3}

## Suggested Target Artifacts
<!-- 이 입력이 닿을 법한 기존 산출물 힌트. 최종 판단은 reconcile-input 이 한다. -->
- {예: COUPON-001 screen-spec (UI Sections / State Matrix / Copy Keys)}
- {예: api/api-manifest.md}
- {예: global/component-gap-register.md (카탈로그에 없는 컴포넌트가 필요하면)}

## Expected Reconciliation
<!-- (선택) 입력 스킬이 예상하는 분류 힌트. reconcile-input 이 실제 분류를 확정한다.
     예제 fixture 에서는 이 절이 "정답 힌트" 역할도 한다.
     분류 어휘: simple-update / resolves-unknown / resolves-decision / new-decision /
                component-gap / investigation-needed / conflict / scope-unclear / reject-input
     게이트 무결식: LLM 은 open 추가·resolved→open 재오픈까지만. resolve·close·confirmed 승격·gap accept 는 사람-전용. -->
- classification: {예: simple-update + new-decision}
- {기존 resolved 결정/confirmed 문서와 충돌하면 그 지점을 명시 → reconcile-input 이 Conflict 기록 + decision 재오픈}
- {결정이 필요한 선택은 Open Decision `open` 으로 남긴다(추측 금지). 사실 확인만 필요하면 Unknown.}

## Should Not Do
- Do not implement code directly from this input.
- Do not promote candidate facts to confirmed without source or approval.
- Do not edit generated files directly.
