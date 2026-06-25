---
# --- required (canonical) ---
input_id: "IN-{YYYYMMDD}-{source}-{NNN}"   # required·불변·전역유일. 멱등성·역추적·supersede·미처리 감지가 이 키에 걸린다.
input_type: "{planning|figma|visual-spec|api|meeting|qa|testid|architecture|policy-migration|user-note}"     # required. normalized category(입력 성격 라벨)
source_type: "{planning-doc|figma|visual-spec|api-doc|meeting|qa|qa-automation|testid|architecture|policy-migration|user-note}"   # required. concrete source adapter/type(원천 종류)
source_ref: "{원본 링크 또는 파일 경로}"   # required. 추적용 원천 포인터
captured_at: "{YYYY-MM-DD}T00:00:00+09:00"   # required. 입력을 수집한 시점
captured_by: "{입력 스킬 이름}"             # required. 어떤 입력 스킬이 저장했는지
status: "captured"                          # required. 입력 *자체*의 상태. ★ Reconciliation Register 의 Reconcile Status 와 다르다(별개 라이프사이클).
affected_domains: ["{domain}"]              # required. 관련 도메인 (canonical scope 필드)
affected_screens: ["{SCREEN_ID}"]           # required. 관련 화면 (canonical scope 필드)
# --- optional ---
confidence: "{unknown|candidate|confirmed}"  # optional(recommended). 입력의 확신도. candidate 가 기본. confirmed 라도 LLM 이 문서를 confirmed 로 올리진 않는다.
supersedes: null                            # optional. 같은 원천의 이전 input_id 를 대체할 때만(입력↔입력 축. 결정값 번복 아님).
raw_artifacts: []                           # optional. 원본 첨부(스크린샷·export 등) 경로/URL 목록. 없으면 생략 가능.
# deprecated alias (읽기 호환만 — 새로 쓰지 말 것):
#   suggested_scope.domains/screens → affected_domains/affected_screens
#   frontmatter summary             → 아래 body 의 ## Summary 섹션이 정본
---

<!--
  ⚠ frontmatter(여는 `---`)는 반드시 파일 **첫 줄**에서 시작한다. splitFrontmatter 는 선행 주석/공백 뒤의
    `---` 를 인식하지 못해, 이 설명 블록을 위로 올리면 이 템플릿으로 만든 입력 파일이 검사 11
    (input-artifact frontmatter)에서 "frontmatter 없음"으로 통째로 실패한다. 설명은 frontmatter 아래에 둔다.

  input-artifact.template.md — 외부 입력 스킬이 저장하는 "입력 결과물" 한 건의 형식.

  무엇인가:
  - 기획 / Figma·visual spec / API 문서 / 회의록 / QA·testID 메모 / architecture·policy migration 입력 등 외부 입력을 수집·요약해 프로젝트 안에 남긴 md 파일.
  - `workflow:create-input` generic producer 가 쓰는 canonical output 형식. Producer 는 이미 정규화된 facts 를 이 파일로 렌더링할 뿐,
    Figma raw format, OpenAPI adapter, 내부 폴더 구조 같은 source-specific mapping 은 consumer repo 의 입력 스킬이 맡는다.
  - reconcile-input 스킬이 이 파일을 읽어 기존 frontend-workflow 문서와 대조한다(분류·register 기록).
  - 전체 계약: ../../input-reconciliation.md  (Input Result Contract / Reconciliation Register).
  - 실제 예시: ../../examples/input-reconciliation/inputs/*.md

  무엇이 아닌가 / 무엇을 검증하나:
  - 이 입력은 일반 **authoring 산출물**이 아니다. `artifact_type` 을 쓰지 않으며,
    frontmatter.schema.json 의 authoring enum 에도 넣지 않는다.
  - 대신 `workflow:validate` 검사 11 이 `inputs/*.md` 를 별도로 읽어 입력 frontmatter 계약을 검증한다.
    필수 필드, `input_id` 형식/중복, `input_type`·`source_type` enum, affected scope, `supersedes`,
    deprecated alias(`suggested_scope`, frontmatter `summary`)가 대상이다.
  - Reconciliation Register 가 있으면 검사 12 가 같은 `input_id` 목록과 register 행을 대조한다.
    미처리 감지는 warning-first 이며, 구조 오류와 `--enforce` 승격 규칙은 input-reconciliation.md 를 따른다.
  - validate 는 입력의 출처 진실성이나 reconcile 완료를 대신 증명하지 않는다. `workflow:create-input` 도 acceptance,
    confirmed 승격, 구현 허가를 의미하지 않는다. Reconciliation 은 별도 단계다.

  저장 위치:
  - 권장: docs/frontend-workflow/inputs/{input_id}.md  (파일명 = input_id — grep 추적 용이)

  작성 규칙:
  - frontmatter 값은 따옴표로 감싼다(YAML parser-safe). placeholder {X} 는 실제 값으로 치환.
  - 범위는 canonical 필드 affected_domains/affected_screens 로 쓴다. suggested_scope(중첩)·frontmatter summary 는 deprecated alias 라 새로 쓰지 않는다(요약은 body ## Summary 가 정본).
  - source-specific producer 는 raw source 를 normalized payload 로 변환한 뒤 generic producer 에 위임한다. generic producer 는 Reconciliation Register 를 직접 수정하지 않는다.
  - 입력은 "사실 수집"만 한다 — 결정을 내리거나(resolve), confirmed 로 올리거나, 코드를 만들지 않는다. 그건 reconcile-input·사람 몫.
-->

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
- Do not replace live policy, promote CI/hard gates, or enable pre-edit hook enforcement from this input.
