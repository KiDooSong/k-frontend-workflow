---
title: "{packet_id} 리뷰"
status: "done"
kind: "review-artifact"
packet_id: "WP-{SCREEN_ID}-{mode}-{NNN}"
run_id: "{run_id}"
# 구 verdict→review_summary (판정 어감 제거 — advisory). 'verdict'/'blocked' 는 active 용어로 쓰지 않는다.
review_status: advisory          # 항상 advisory. 이 리뷰는 머지를 자동 차단하지 않는다.
review_summary: "{ok | changes-suggested | needs-human-decision}"   # 전체 1줄(중립)
human_action_required: "{true|false}"
readiness_source: "{path-to-readiness-output-or-run-report}"
reviewer: "{agent-or-person}"
date: "{YYYY-MM-DD}"
---

<!--
  Review Artifact 는 한 Work Packet + Run Report 가 게이트·천장·불변식을 지켰는지 채점한다.
  Work Packet 과 같은 원칙: 리뷰어도 새로운 source of truth/gate 가 아니다.
  작성 규칙:
  - 게이트/경로는 readiness_source 를 그대로 소비한다 (재계산 금지).
  - 리뷰어는 Open Decision / Conflict / Unknown 을 닫지 못한다 — 사람-전용 불변식.
  - 위반은 근거(파일·라인·diff)와 함께 기록한다. 추측으로 메우지 않는다.
  - Checklist 는 work-packet-rubric 의 10개 check 를 그룹 롤업해 Work Packet 의 Review Checklist 와 정합시킨다 (1:1 아님 — 그룹 매핑, 아래 표 주석의 매핑 참조).
  배선 금지: 이 산출물(review_status/review_summary/findings)을 required approval / merge check 에 연결하지 않는다.
            GitLab 의 MR approval rules · merge checks · protected branches (GitHub branch protection·required checks 대응)
            어디에도 묶지 않는다. blocker-candidate 는 후보일 뿐 — 진짜 blocker 는 Open Decision(readiness cap)+사람만.
  후속(이 PR 범위 밖): 의미/제품 갭 점검 루브릭(S1~S8: 빠진 state·엣지케이스·오분류 등)은 별도 doc 으로 분리한다
            (템플릿 과적재 금지). 여기서는 advisory 스키마(review_summary/findings)까지만 둔다.
-->

# Review Artifact: {packet_id}

## Review Summary (advisory)
<!-- review_summary 는 리뷰 evidence 라벨이다 — 머지를 자동으로 막거나 허가하지 않는다.
     게이트는 readiness(Open Decision) + validate(구조) 뿐. 이 요약은 그 위의 advisory 신호다.
     이 repo 는 review 결과를 required approval / merge check 에 배선하지 않는다
       (GitLab: MR approval rules · merge checks · protected branches 에 연결 금지).
       ok                  = 경계·천장·불변식 + 아래 findings 에서 막을 사유를 못 찾음(=advisory 통과).
       changes-suggested   = 고칠 수 있는 위반/의미 갭 존재 → findings 의 route=recommended-fix.
                             (자동 머지차단 아님 — 머지 결정은 사람.)
       needs-human-decision = 사람-전용 결정/Conflict 때문에 "리뷰어가 더 진행 못 함" → Human-only Decisions Needed.
                             ⚠ needs-human-decision(구 'blocked') = "리뷰어가 더 못 나아감"이지 "결정을 닫았다"가 아니다.
                             ⚠ 이 값 자체가 머지를 자동 차단하지 않는다 — 차단 권한은 Open Decision(readiness cap)+사람뿐. -->
**{ok | changes-suggested | needs-human-decision}** — {한 줄 근거.} (advisory evidence — 머지 게이트 아님)

## Findings (advisory — 근거 필수)
<!-- 각 finding 은 severity + ref(file/line/diff 근거 필수, 추측 금지) + route 를 갖는다.
     severity 의 blocker-candidate 는 '후보'일 뿐 — 진짜 blocker 가 아니다.
     진짜 blocker 는 Open Decision(readiness cap) + 사람 승인으로만 성립한다.
     route 가 human-only-decision 이면 아래 Human-only Decisions Needed 표로도 옮긴다(리뷰어는 닫지 않음). -->
```yaml
findings:
  - severity: "{info | warning | major | blocker-candidate}"   # 'blocker' 아님 — 후보일 뿐
    ref: { file: "{path}", line: "{n}", diff: "{인용/요지}" }   # 근거 필수
    route: "{recommended-fix | human-only-decision | do-not-auto-fix}"
    note: "{한 줄 설명}"
  # findings 없으면: 빈 목록 [] 로 두고 review_summary: ok.
```

> `blocker-candidate ≠ blocker`. severity 가 blocker-candidate 라도 그 자체로는 아무것도 막지 못한다 — 사람이 Open Decision 으로 승격해 readiness cap 이 걸릴 때만 실제 차단이 된다.

> **기존 섹션 ↔ findings 매핑** (advisory): `## Violations` → `severity: major`(forbidden 침범 등 강한 건 `blocker-candidate`) + `route: recommended-fix` · `## Recommended Fixes` → `route: recommended-fix` · `## Human-only Decisions Needed` → `route: human-only-decision`(표 유지 — 리뷰어는 닫지 않음) · `## Do Not Auto-Fix` → `route: do-not-auto-fix`. 아래 4섹션은 삭제하지 않고 findings 와 정합하도록 유지한다. (Human-only 표의 세부 컬럼·S1~S8 의미 루브릭은 PR1b 범위 밖 — 후속/별도 doc.)

## Reviewed Inputs
<!-- 복사 금지 — 링크만. 무엇을 보고 판정했는가. -->
- Work Packet: `{path-to-work-packet}`
- Run Report: `{path-to-run-report}`
- readiness output / run-report 게이트 출처: `{readiness_source}`
- ScreenSpec (정본): `{docs/.../screen-spec.md}`

## Checklist
<!-- rubric 매핑 (그룹 롤업 — 1:1 아님). 한 행이라도 Failure Signal 관측 시 불합격으로 기록하고 Violations 에 근거를 남긴다.
     advisory 휴리스틱(useState/useEffect grep 등)은 자동 불합격이 아니다 — 후보일 뿐, 파일 열어 교차 확인.
     work-packet-rubric(필수 10 checks) → 이 7행 매핑:
       A  ← readiness 직접계산 안 함 · readiness output 참조 · allowed/forbidden 일치
       B1 ← allowed/forbidden 일치 (allowed 쪽)
       B2 ← allowed/forbidden 일치 (forbidden 쪽) · confirmed 문서 미수정 · generated file 미수정
       B3 ← 현재 mode 보다 높은 구현 요구 안 함
       B4 ← API endpoint 추측 안 함 (+ copy/design value 미발명)
       E  ← Open Decision 안 닫음 (+ confirmed/generated 미수정 재확인)
       F  ← ScreenSpec 링크(복사 안 함) · blocker 보고 · 멱등
     check 10(Run Report ↔ Review Artifact 분리)는 두 파일이 따로 존재함으로 충족. -->
| Check | 기준 | 결과 | 근거 (파일·라인·diff) |
|---|---|---|---|
| A — 게이트 판독 | readiness_mode/allowed/forbidden 이 `{readiness_source}` 와 글자 일치 | {✅/❌} | {근거} |
| B1 — allowed 안에서만 | diff ⊆ allowed_paths | {✅/❌} | {근거} |
| B2 — forbidden 무접촉 | `src/api/**`·`openapi.yaml` 무접촉 | {✅/❌} | {근거} |
| B3 — 천장 미초과 | `{readiness_mode}` 산출물만 (과구현 없음 — advisory grep 은 후보) | {✅/❌} | {근거} |
| B4 — 미확정 미발명 | API/copy/design value 추측 없음 | {✅/❌} | {근거} |
| E — 불변식 | Open Decision/Conflict/Unknown 미닫힘 | {✅/❌} | {근거} |
| F — 보고·멱등 | blocker 그대로 보고 + 재실행 최소 diff | {✅/❌} | {근거} |

## Violations
<!-- 구현이 고칠 수 있는 위반만. 각 항목에 위반 Check ID + 근거(파일·라인·diff).
     위반 없으면 "없음" 한 줄. -->
- {예: B2 — `src/api/coupon.ts` 신규 (diff L1) = forbidden 침범.} 또는 없음.

## Human-only Decisions Needed
<!-- 리뷰어/구현자가 못 닫는 사람-전용 항목. Open Decision / Conflict / candidate→confirmed 승격.
     review_summary=needs-human-decision 의 근거(route=human-only-decision)가 여기 있어야 한다. -->
| ID | 유형 | 내용 | Owner | 왜 사람만 |
|---|---|---|---|---|
| {D-301} | decision | {결정 질문} | {PM} | 게이트 해제는 사람-전용 (LLM 은 open/재오픈만) |
| {C-001} | conflict | {충돌 내용} | {PM} | conflict close 는 사람-전용 |

## Recommended Fixes
<!-- review_summary=changes-suggested(route=recommended-fix) 일 때 구현이 자동 수행 가능한 교정. 게이트를 건드리지 않는 범위만. -->
- {예: `src/api/**` 변경 되돌리고 fake hook 계약 유지 — readiness 재실행.}
- {예: 과구현 fixture UI 제거, screen-skeleton shell 로 환원.}

## Do Not Auto-Fix
<!-- 자동수정 금지 영역. 추측으로 메우면 환각이 된다 — 사람/입력 대기. -->
- 미확정 copy(tbd 행) — 문구 발명 금지. 사람이 confirmed 로 승격할 때까지 TBD 유지.
- 미확정 API endpoint — `src/api/**`/`openapi.yaml` 추측 작성 금지. confidence 는 candidate 유지.
- design value(색/간격/레이아웃 수치) — figma mapping 없이는 발명 금지.
- Open Decision resolve / Conflict close / Unknown close / candidate→confirmed 승격 — 전부 사람-전용.
