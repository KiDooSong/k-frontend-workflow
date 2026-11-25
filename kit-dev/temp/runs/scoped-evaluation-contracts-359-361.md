# Scoped evaluation contracts — #359–#361

> **HISTORICAL — 2026-11-25 검증 기록.** 현재 구현 상태의 정본은
> [roadmap-current.md](../../roadmap-current.md)와
> [scoped-work.md](../../../frontend-workflow-kit/docs/reference/scoped-work.md)다.
> 공개 합성 fixture와 실제 public API/배포 runtime을 사용했으며 consumer 원문은 포함하지 않는다.

## 범위와 기준

기준은 PR #358이 머지된 `92c401868763b8dc2fe0d7860efdfbb80c7750df`이다.
공개 이슈 [#359](https://github.com/KiDooSong/k-frontend-workflow/issues/359),
[#360](https://github.com/KiDooSong/k-frontend-workflow/issues/360),
[#361](https://github.com/KiDooSong/k-frontend-workflow/issues/361)의 재현과 완료 기준을 확인했다.
Node v20.20.2와 v24.22.3을 사용했다. 성능 비교에는 이전 기준
`8a66aa66c21d987202f27443ad10b2458cb5d992`의 실제 payload도 포함했다.

수정본은 `kit:pack`으로 만든 316개 파일의 manifest hash를 검증했다.
생성되는 consumer `package.json`을 제외한 payload 파일은 대응 source와 바이트 비교했고,
LICENSE는 저장소 루트의 원본과 비교했다. Packed test driver만 payload 옆에 복사하며
runtime source는 덮어쓰지 않았다.

## #359 — 그래프 시작점과 evidence 합성의 평가 단위

한 API 후보의 Note가 같은 RULES 문서의 서로 독립적인 절 N개를 참조하는 합성 사례다.
단위는 `api`, `control` 두 개이며 열린 Decision은 없다. 원래 반복은 두 곳이었다.

1. Decision 확장이 시작점마다 strict graph를 만들고, 매번 같은 ordinary-reference
   context 전체를 복사했다. 문서의 참조 수가 늘수록 context 원소 처리량은 제곱으로 증가했다.
2. 그래프 시작점만 묶어도 base와 Decision evidence의 겹치는 물리 선택을 합성할 때
   동일 파일을 각 선택 쌍마다 다시 읽었다. 중간 수정의 standalone 파일 열기는
   N=32/64/128/256에서 98/162/290/546회여서 이 경로도 함께 수정했다.

현재는 정확히 같은 `owner`, `unit`, `uncertainty` witness의 대기 시작점을 묶는다.
서로 다른 단위나 witness는 합치지 않는다. Typed edge로 이미 닫힌 graph node는 방문을
기록하고, 새로 발견한 metadata `decision_refs`는 같은 witness의 다음 frontier에서 해석한다.
전체 graph context는 그대로 전달하며 공개 DTO나 basis 버전을 바꾸지 않는다.

Base/Decision evidence 합성은 파일별로 묶고, 그 파일의 현재 bytes를 한 번 확인해 중복
선택의 물리 범위 비교에 전달한다. 이 source는 파일 묶음 안에서만 사용하며 새 AST cache에
보관하지 않는다. 현재 파일 확인, expected hash, 최종 read-set 감사는 유지한다.

### 실제 public inspector의 파일 열기

[scoped-api-fanout.mjs](../../benchmarks/scoped-api-fanout.mjs)를 각 실제 payload에서 실행했다.
Node 20과 24의 결과는 동일하다. 아래 값은 fixture/index 준비를 마친 뒤 RULES 파일에
발생한 실제 `fs.openSync` 횟수다.

| 독립 참조 N | `8a66aa6` standalone | `92c4018` standalone | 수정 standalone | `92c4018` snapshot | 수정 snapshot |
| --- | ---: | ---: | ---: | ---: | ---: |
| 32 | 28 | 284 | 35 | 280 | 31 |
| 64 | 28 | 540 | 35 | 536 | 31 |
| 128 | 28 | 1,052 | 35 | 1,048 | 31 |
| 256 | 28 | 2,076 | 35 | 2,072 | 31 |

`8a66aa6` snapshot은 모든 N에서 24회다. 수정본은 이번 회귀의 참조별 증가를 제거하며,
이전 버전과 파일 열기 절대값이 같다고 주장하지 않는다.

### Graph context 구성·복사

`--contexts`는 payload를 별도 임시 디렉터리로 복사하고 그 사본에만 계측을 넣는다.
원본 payload는 수정하지 않는다. 아래 standalone 수치의 `refs`는 context에 담거나
복사한 참조 배열 원소 수의 합계이며 byte/RSS 측정치가 아니다.

| N | graph 구성 횟수 기준 → 수정 | 구성 refs 기준 → 수정 | context 복사 횟수 기준 → 수정 | 복사 refs 기준 → 수정 |
| --- | ---: | ---: | ---: | ---: |
| 32 | 74 → 10 | 2,378 → 266 | 82 → 18 | 2,642 → 530 |
| 64 | 138 → 10 | 8,842 → 522 | 146 → 18 | 9,362 → 1,042 |
| 128 | 266 → 10 | 34,058 → 1,034 | 274 → 18 | 35,090 → 2,066 |
| 256 | 522 → 10 | 133,642 → 2,058 | 530 → 18 | 135,698 → 4,114 |

Snapshot의 graph 구성 횟수는 71/135/263/519 → 7회,
context 복사 횟수는 80/144/272/528 → 16회다. N=256의 구성 refs는
133,127 → 1,543, 복사 refs는 135,440 → 3,856이다.
두 모드 모두 context merge는 5회이며 merged refs는 N에 따라 132/260/516/1,028로
변경 전후 같다. 수정본의 이 context 수치는 `8a66aa6`과도 같다.

Node 2종 × 모드 2종 × N 4종의 16개 조합을 계측 유무로 각각 실행했다.
각 조합의 완전한 반환 JSON은 계측 전후 및 `92c4018` 전후에 바이트 단위로 동일하다.
각 N의 두 모드·두 Node 결과도 같으며, 결과 크기는 모두 1,399 bytes다.

| N | 완전한 반환 JSON의 공통 SHA-256 |
| --- | --- |
| 32 | `bac70d8057fb33ca631660ae0bf17d67b043814a6c8ef3b1a7d0486a50af8aa0` |
| 64 | `72c1284ad02240e874c11b73df6ca6fb77142fc0fa86a87d6e7713d67141fde1` |
| 128 | `3d83a32e8d21128b33e014f601e430de79e1a6f6486226530772d16cc4960c34` |
| 256 | `b5240221d8139d4dcdcebf447b470af73c4ef5c1ec19b39ce240b8a5720a6fa9` |

두 unit, 여러 Unknown witness, 공통 Decision, 순환 참조와 추가 metadata frontier를 섞은
독립 교차검토에서도 단위·witness 소속과 전체 결과를 보존했다. 시작점 순서를 뒤집거나
snapshot으로 호출해도 결과가 같았다. 별도 mutation 회귀는 관찰한 파일을 중간에
편집하면 standalone과 snapshot이 모두 변경을 거부하는 것을 확인한다.

두 초과 크기 문서에서 각각 16개 절을 중복 선택하는 lifetime 회귀의 source decode는
문서당 32 → 1회다. 합성 직후와 후속 문서 스캔 뒤 모두 document cache entry는 0개이고,
resolver view는 null이다. 전체 결과와 read-set을 보존한다.

## #360 — 현재 raw 목록과 물리 출처의 분리

기준 구현은 mutable section 목록을 무효화한 뒤에도 원래 tree의 H2 순번으로 현재 목록을
접근했다. 앞의 API section을 삭제하면 뒤의 Unknowns/Notes를 잘못 매핑하거나
`undefined.title`에서 실패했다. 현재 H2 목록의 순서·title·slug·node·table 구성이
authored home을 결정하도록 바꿨다.

Literal/GENERATED 여부는 현재 목록의 순번 대신 원본 heading의 물리 출처와 node 위치로
확인한다. 원본 section node 배열에는 private weak provenance를 연결하며, 공개 JSON에
필드를 추가하거나 전체 문서를 새 전역 cache에 보관하지 않는다. 원본 배열의 내용 편집과
배열 자체의 교체를 구분하고, 삭제한 home을 GENERATED continuation이 되살리지 않는다.
동일한 물리 표를 공유하더라도 현재 home이 두 개라면 기존의 ambiguous 판정을 유지한다.

[scoped-raw-sections.mjs](../../benchmarks/scoped-raw-sections.mjs)의 실제 payload 결과:

| 공개 호출 조건 | `92c4018` | 수정본, Node 20·24 |
| --- | --- | --- |
| raw API H2 삭제 후 API 조회 | `TypeError` | 빈 목록 |
| 같은 raw에서 Unknowns 조회 | `TypeError` | Unknowns 1개, 표 1개 |
| 같은 raw에서 Notes 조회 | `TypeError` | Notes 1개, 표 0개 |
| 정본 Unknowns 재조회 | 정상 | 정상, 기존 정본 목록 identity 유지 |
| 표가 없는 section의 사용되지 않는 revoked `tables` proxy | `Array.isArray`에서 `TypeError` | Notes 조회 정상 |
| active scope에서 accessor/proxy raw | 기존 공개 편집 뷰를 재사용 | 실제 custom build, 원래 active 편집은 보존 |

Cache eligibility는 own data descriptor와 proxy 여부로 판별한다.
Revoked proxy에 `Array.isArray`를 먼저 호출하지 않으며, eligibility 검사 자체에서
사용자 getter나 순회를 실행하지 않는다. 필요한 값은 실제 build에서만 소비한다.
Active scope의 accessor/proxy 재현은 실제 tree/sections 읽기 2회이고, 새 custom 뷰의
title은 `Notes`, 기존 active 뷰의 `Edited active view`는 그대로다.

원본 node 배열을 유지한 삭제·이동·추가, 다른 section으로 교체, 비어 있지 않은 deep copy,
온전한 전체 deep copy를 검사했다. 출력이 같은 비어 있는 literal/formatted section의
일부만 복사해 물리 출처를 잃으면 `SW-REF-SNAPSHOT`으로 거부한다. 형식이 있는 빈 heading을
literal 작성 home으로 추측하지 않는다. 이런 부분 편집은 원본 section node 배열을 유지한다.
H3 fallback은 기존처럼 native tree를 따르며 H2 작성 목록과 독립이다.

독립 교차검토의 정상 raw/정본 98개 조합에서 결과가 같았고, LF/CRLF/CR 및 마지막 개행이
없는 empty deep copy도 확인했다. API 표 삭제 시 이전 Tracking을 거부하는 #357 계약,
GENERATED 물리 경계와 정본 Tracking 색인 재사용도 회귀에 포함했다.

API H2 삭제의 실패와 unused revoked proxy 실패는 `92c4018`에서 확인했다.
Active accessor/proxy의 잘못된 공개 뷰 재사용은 `8a66aa6`에도 있던 경로다.

## #361 — 같은 basis v2에서도 필요한 바인딩 재검토

정본 [upgrade-notes](../../../frontend-workflow-kit/docs/reference/upgrade-notes.md#api-relation-changes-within-basis-v2)에
선택 API의 일반 참조로 복구된 owner/unit/Decision/uncertainty 관계가 기존 digest를 stale로
만들 수 있는 조건을 추가했다. 기존 `blocks`만 보고 stale binding의 실제 차단 범위를
판단하지 않도록 설명하고, owner별 committed HEAD 검사와 사람의 검토 절차를 연결한다.

```bash
npm run -s workflow:binding-status -- --owner screen:COUPON-001 --json
```

실제 CLI의 `state: "stale"`, `stale_reason: "basis"`와 라이브러리의 `stale-basis`를
구분하며 recorded/computed digest, components, applications 및 referrer/witness를 비교한다.
검토를 마친 뒤 기존의 fresh approval evidence와 digest 기록 절차를 따르며, 무관한 binding의
일괄 재기록이나 자동 승인은 하지 않는다. README와 COMMANDS의 managed upgrade 안내는
이 정본을 연결한다.

실제 packed install 후 managed dry-run으로 Consumer migrations에 새 안내가 포함되는지
확인했다. Baseline은 `install-manifest`, `applied`는 null, 파일 분류는 316개 unchanged였고,
owner 명령·상태 필드와 consumer 경로로 재작성된 review/COMMANDS 링크를 확인했다.
이 검사는 plan 생성 경로를 확인한 것이며 파일 분류 자체가 binding을 평가한다는 뜻은 아니다.
기존 packed migration/planner 회귀도 2/2 통과했다.

## 검증 요약과 기존 수정 보존

| 검사 | 결과 |
| --- | --- |
| 새 테스트 23개를 기준 `92c4018` payload runtime에 실행 | 18 fail / 5 pass; 결함을 잡는 회귀 18개와 보존·음성 대조군 5개 구분 |
| 수정 실제 payload 관련 8파일, Node 24 | 262 pass / 0 fail / 0 skip |
| 수정 Node 20 전체 packed harness | Resolver 946/946, 구문 수명 62/62 및 기존 입력·Evidence·frontmatter·표·shared view·CLI 검사 모두 통과; harness 2/2 |
| #359 실제 payload, Node 20·24 | 16개 조합의 계측 유무·기준 대비 완전한 JSON 동일 |
| #355–#357 원본 재현, Node 20·24 | 기준의 수정된 결과 유지, stdout 바이트 동일 |
| 과거 binding·metadata-only 변경 재현, Node 20·24 | 90,381-byte 전체 JSON 동일 |
| 이전 최적화 재현 10개, 실제 기준/수정 payload | 10/10 전체 JSON 바이트 동일 |

#355의 미바인딩 Decision은 `api`·`explicit`만 차단하고 `control`은 통과한다.
#356의 공개 작성 뷰 `Edited`는 보존하며, #357의 삭제한 API 표 Tracking은 거부한다.
[이전 basis 공개 재현](../../benchmarks/scoped-api-decision-basis.mjs)에서는 실제 `8a66aa6`에서
만든 좁은 binding의 업그레이드와 참조 ScreenSpec의 `decision_refs`만 변경하는 경우 모두
이전 binding이 `stale-basis`가 되어 `api`·`explicit`을 차단한다. 다시 검토해 기록한 current
binding은 명시적 `blocks`를 유지한다. 전체 JSON 공통 SHA-256은
`22d72ae3db0bba17ce1d2fc4aaceedfb68114c9bd3eaae859744b7dffc7a51c4`다.

이전 10개 재현은 [#355–#357 기록의 선행 수정 비교](scoped-reference-boundaries-355-357.md#선행-수정과-비용-비교)와
같은 #344–#348 및 #350–#354 합성 사례다. 이번에도 완전한 JSON bytes/hash가 그 표와 같다.
특히 input Evidence 읽기 21회, 완료 문서 view 0개, malformed 문서 읽기 3회,
Decision 120행·API 600행의 Tracking 색인 1회/API 순회 600행을 유지한다.

## 재실행

의존성을 설치한 저장소에서 fresh 경로에 실제 payload를 만든다. 기준 버전 비교는 해당
worktree에서 별도 payload를 만들고 동일 benchmark를 실행한다. `--check`는 수정 후
기대값이며, `--result`는 기존에 없는 파일 경로를 받는다.

```bash
node frontend-workflow-kit/scripts/pack-frontend-workflow-kit.mjs --out /tmp/frontkit-contracts-payload
ln -s "$PWD/frontend-workflow-kit/node_modules" /tmp/frontkit-contracts-payload/node_modules

node kit-dev/benchmarks/scoped-api-fanout.mjs /tmp/frontkit-contracts-payload 256 --check --result /tmp/fanout-normal.json
node kit-dev/benchmarks/scoped-api-fanout.mjs /tmp/frontkit-contracts-payload 256 --check --contexts --result /tmp/fanout-counted.json
cmp /tmp/fanout-normal.json /tmp/fanout-counted.json
node kit-dev/benchmarks/scoped-api-fanout.mjs /tmp/frontkit-contracts-payload 256 --snapshot --check --contexts
node kit-dev/benchmarks/scoped-raw-sections.mjs /tmp/frontkit-contracts-payload --check
node kit-dev/benchmarks/scoped-reference-boundaries.mjs /tmp/frontkit-contracts-payload --check

cd frontend-workflow-kit
node --test scripts/lib/scoped-work-packed.test.mjs
```

N=32/64/128/256과 Node 20/24를 각각 바꿔 실행한다. Graph 계측은 private 구현의 정확한
삽입점을 확인하며 지원하지 않는 구현에서는 추측해서 계측하지 않고 실패한다.

## 해석 범위

이번 수치는 합성 public resolver의 파일 열기와 context 원소 처리량이다. 서로 다른
owner/unit/witness나 단계적으로 드러나는 metadata frontier까지 한 번의 graph로 합친다는
주장이 아니며, 모든 입력에서 전체 실행 시간이 상수라는 주장도 아니다.

실제 consumer 전체 `binding-status` 실행 시간·최대 RSS·OOM 해소 여부와 아직 검토하지 않은
consumer binding의 영향 수는 여기서 측정하지 않았다. 이번 검증은 재현된 평가 경계,
물리 작성 범위, 바인딩 정확성, 배포 payload 및 업그레이드 안내 경로를 확인한다.
