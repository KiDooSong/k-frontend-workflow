# HISTORICAL — scoped evaluation boundaries #350–#353

> 2026-11-20 검증 기록. 이 문서는 구현 당시의 재현·검증 근거이며 현행 계약의 정본은
> [scoped-work reference](../../../frontend-workflow-kit/docs/reference/scoped-work.md)와
> [current roadmap](../../roadmap-current.md)다.

## 범위와 baseline

- Baseline: PR #349가 합쳐진 `e162490e51b99b7e6ae97380a318f446f0bcc6ff`.
- Kit issues: [#350](https://github.com/KiDooSong/k-frontend-workflow/issues/350),
  [#351](https://github.com/KiDooSong/k-frontend-workflow/issues/351),
  [#352](https://github.com/KiDooSong/k-frontend-workflow/issues/352),
  [#353](https://github.com/KiDooSong/k-frontend-workflow/issues/353).
- Consumer 재현·acceptance: [ck-ai-m#9](https://github.com/KiDooSong/ck-ai-m/issues/9)의
  공개 합성 재현 코드. 비공개 consumer 파일은 가져오지 않았다.
- 환경: Linux x64, Node `v24.22.3`와 `v20.20.2`, 기존 lockfile의 dependencies.
- 재현 스크립트: [scoped-evaluation-boundaries.mjs](../../benchmarks/scoped-evaluation-boundaries.mjs).
  Node 24 loader hook으로 실제 reader와 evaluator 경계를 관찰하며 설치한 runtime 파일은 수정하지 않는다.
  선택적인 결과 파일에는 요약이 아닌 전체 semantic JSON을 저장한다.

## 수정 전후 실제 재현

수정 전에 네 가지 원본 사례가 모두 baseline에서 재현됐다.

| 문제 | Baseline | 수정 후 |
|---|---|---|
| #350 공개 Unknown `Question` header 편집 후 실제 uncertainty 적용 | 분류는 true지만 warm 적용은 `SW-REF-MISSING`; AST 퇴출 후 application 1개 | warm/cold 모두 application 1개, 전체 projection/read-set 동일, 공개 `Edited` 유지 |
| #351 Unknown 5개가 같은 input의 12개 anchor 참조 | input 실제 읽기 81회 | 21회, 전체 결과 bytes 동일 |
| #352 초과 크기 문서 4개 처리 뒤 완료 batch의 resolver view | `doc-1`, `doc-2`, `doc-3` 보관; document cache는 0개 | 완료 batch resolver view 0개; document cache 0개 |
| #352 관련 malformed 문서의 읽기 | 5회 | 3회, `unaudited: [doc-4.md]` 동일 |
| #353 array iterator prototype의 `next` 변경 | 공유 span `[[0,1]]`, 실제 fresh walk `[[1,2]]` | 공유 helper도 `[[1,2]]`, fresh walk와 동일 |

#351의 label별 실제 reader 호출은 다음과 같다. Mandatory graph 읽기나 최종 감사가
없어진 것이 아니라 같은 graph/file의 span 준비 단계에서 중복 읽기가 줄었다.

| 읽기 label | Baseline | 수정 후 |
|---|---:|---:|
| `scoped input` | 5 | 5 |
| `scoped evidence` | 10 | 10 |
| `scoped uncertainty` | 66 | 6 |
| 합계 | 81 | 21 |

아래 SHA-256은 `JSON.stringify(result)` 전체 bytes의 값이다.
Unknown은 baseline의 정상 cold 결과와 수정 후 warm/cold 결과를 비교한다.
Iterator는 잘못된 span을 고치는 의도적인 의미 변경이므로 baseline과 같은 hash를 요구하지 않는다.

| 사례 | 결과 bytes | 수정 후 SHA-256 / 비교 |
|---|---:|---|
| Unknown projection + read-set | 2,326 | `8e0a24c63be7f571db9e689bcc08017014b3f1e4e9392029fb04f351b4908a75` — baseline cold 및 수정 후 warm/cold 동일 |
| input reads projection + read-set | 604 | `52a9311967b173d07ee8b3bcc498b874d4058b621c8ff9d0efecd274203575a7` — baseline/수정 후 동일 |
| retention projection + read-set + unaudited | 1,063 | `b30c3ab2efcf2359a4e69932ecf2d01b1a668a92d0f667bfa21b8fb3b82dd98f` — baseline/수정 후 동일 |
| own/inherited iterator span 관찰 | 75 | `ca11c4cb8131a2534100a87c8a4a8c8dc99e49cc1d7050adca56b3156e96a4bc` — 두 경로 모두 실제 walk와 동일 |

## 원인과 구현 경계

### #350: 분류 이후의 실제 resolver도 canonical syntax를 사용한다

기존 classification helper의 정본 판정만으로는 충분하지 않았다. 실제 `authoredContract`,
artifact section/row 선택, GENERATED와 섞인 Unknown fallback, H3 fallback은 공개 가변
authored view를 다시 읽을 수 있었다. 그 결과 같은 bytes가 public prewarm과 AST 퇴출 여부에
따라 다른 적용 결과를 냈다.

내부 graph/source/relation 평가에 `createCanonicalScopedReferenceResolver`를 연결하고,
정본 authored section·occurrence·subsection 및 document scope를 사용한다. 이 scope는
공개 authored cache를 새로 만들거나 교체하지 않는다. 공개 `createScopedReferenceResolver`와
명시적인 custom/raw 해석은 기존 동작을 유지한다. Canonical selection이 외부에 전달될 때는
mutable node wrapper를 분리하고 native immutable node identity는 보존한다.

API Tracking의 tree cache도 canonical view provenance가 확인된 경우에만 사용한다.
동일 AST를 참조하는 custom raw view가 먼저 또는 나중에 호출돼도 canonical Tracking 해석을
바꾸지 않는다. Unknown 기본 home 조회는 mutable derived containers만 복사하므로 공개
반환값의 편집 가능성과 공개 prewarm을 함께 유지한다.

같은 부작용이 남아 있던 `sectionExactRowKeyCount`도 canonical raw/authored view를 사용한다.
이 함수는 custom interpretation 인자를 받지 않는 원본 행 preflight다. 실제 Reconciliation v2의
Unknown/API target validation을 통과한 source resolver 전체 출력과 원래 exact row count를
유지하면서, validation이 공개 authored prewarm을 교체하던 기존 P3 문제도 제거한다.

회귀 검사는 분류 boolean만 보지 않는다. 실제 uncertainty application과 전체 read-set,
authored section/header/row 편집, GENERATED heading 뒤의 authored table, 같은 셀 값을 가진
GENERATED 물리 행, 독립적인 반환 wrapper를 확인한다.

### #351: 이미 필수인 graph 감사 bytes를 파일 안에서 재사용한다

선택 노드를 파일별로 묶고 각 graph의 `read_set` 감사에서 실제로 읽고 hash를 검증한 bytes로
그 파일의 모든 span을 준비한다. Cache/current document가 있어도 graph expected hash와
평가 중 최초 hash를 먼저 확인한다. Audit에 대응하지 않는 선택 파일은 오류로 처리한다.

Raw bytes나 source body를 모든 graph에 공유하는 별도 cache는 추가하지 않는다. 다음 graph와
최종 전체 read-set 감사는 계속 현재 파일을 읽는다. 다음 graph 전, graph 감사 직전,
최종 감사 직전에 input을 바꾸는 세 사례는 모두 실패하고, 예외 이후 새 평가가 정상 복구된다.

### #352: 문서 cache 밖의 reference resolver 수명도 제한한다

Bounded document cache가 초과 항목을 거부해도 평가 전체의 resolver `parsed` Map이 완료된
문서를 계속 보관할 수 있었다. Resolver를 동기 document row batch 안에서 만들고 `finally`에서
이전 resolver로 복구한다. Batch 사이의 `refs`는 null이고, 중첩·예외에서도 수명이 끝난다.

합성 oversized fixture의 각 batch 종료를 직접 관찰한다. 활성 resolver는 현재 문서만 보며,
완료 문서가 평가 전체에 누적되지 않는다. Malformed relevance 검사도 하나의 document callback에서
수행해 동일 파일의 반복 materialization을 제거한다.

이는 **결과에 필요한 선택 fragment, 기존 bounded cache, 별도 단일 dependency overflow slot**을
없앤다는 뜻이 아니다. 선택 결과 자체가 클 수 있고 parser scratch 공간도 필요하다. 이 검사는
완료된 resolver의 불필요한 full view 보관을 제거한다는 증거이며 전체 RSS 상한을 증명하지 않는다.

### #353: 배열 자체와 실제 iterator `next`를 함께 검증한다

`Array.prototype[Symbol.iterator]`의 identity만 같아도 그 iterator prototype의 `next`가
바뀌면 실제 walk는 달라질 수 있다. 자체 iterator가 없는 frozen array 역시 예외가 아니다.

Span 공유는 검증된 native iterator와 own data `next`를 사용하는 일반 배열에만 허용한다.
Own descriptor를 읽어 accessor/proxy/상속된 custom `next`를 실행하지 않고 공유에서 제외한다.
실제 fresh walk는 원래 custom traversal을 따른다. 정상 native 경우의 내부 frozen span 공유와
공개 helper의 독립 mutable 결과는 유지한다.

독립 리뷰에서 **모듈 import 전에 이미 바뀐 `next`**와 **own `next`가 상위 prototype으로 이동한 상태**를
추가로 발견했다. Import 당시 존재했다는 이유만으로 custom method를 정상 기준으로 채택하지 않게 했다.
`values`도 own non-proxy native 함수인지 확인한 뒤에만 iterator prototype 발견에 사용한다.
다른 native builtin이 배열 receiver를 거부해도 import를 실패시키지 않고 공유를 포기한다.
Own `.toString` 위장, data/accessor/proxy/inherited 변형과 정상 복구를 별도 import process로 검증한다.

## 이전 #344–#348 회귀 재실행

[기존 benchmark](../../benchmarks/scoped-syntax-lifetimes.mjs)의 다섯 사례를 baseline과 수정본의
새 Node 24 process에서 각각 실행했다. 관찰 지점만 새 graph loop 위치에 맞췄고 assertion이나
semantic output은 축소하지 않았다. 각 쌍의 전체 JSON bytes가 동일하다.

| 사례 | 유지된 관찰 | 결과 bytes | SHA-256 |
|---|---|---:|---|
| #344 API context batch | 후보 4개, 전체 parse 1회 | 193 | `7884c403a5af8811f45b8d905d984e85fe7a0dd4005d113614e251ccbe68199f` |
| #345 공통 oversized dependency | candidate selection 3개, native node identity 1개, graph parse `[0,0,0]`, relation range parse 0회 | 4,697 | `774d9f3da5020056bbadfd037a1725797b4602d78d7080162b37dd67925f9744` |
| #346 strict/candidate artifact/input | 각 전체 parse 1회 | 16,780,341 | `4d3bc952558effebb4b589f429fdb2095c8eb16d5ad883581b82d51357bfef3c` |
| #347 shared-raw Unknown | 공개 편집과 AST 퇴출 이후 정본 판정 유지 | 131 | `29f6ade9343822a3fff2719c69e0024912f66776b9f35b8eae1216e7462f41df` |
| #348 own iterator | 변경 후 실제 순회 span 유지 | 52 | `7ed3f61224ecdc21e6eac63cca76d5e23496276a40bd53c22cac973920539aae` |

Node-limit overflow는 committed tests의 많은 짧은 paragraph fixture로 검증한다. 이 실행에서
선택적인 거대 list benchmark `344-node`/`346-node`는 추가 실행하지 않았다.

## 실제 CLI 호환성

별도 benchmark process로 실제 public CLI를 실행하고 결과를 정규화하거나 부분 필드만 추리지 않고 비교했다.

- `binding-status`: 2 units, inputs 4개, selected source Item 1개, binding 0개,
  unbound rows 4개, 교대 순서로 각 3회. 전체 13-row stdout report SHA-256은
  `b79d65eab2ca7d72ac3968363495ac096e83853ee395cd4ae75dacea913b046c`로 동일하다.
  원본 HEAD/index/worktree와 임시 snapshot cleanup도 보존됐다.
- `workflow:run`: inputs 8개, unrelated documents 2개, 문서당 bullet 3개,
  input body 약 512 bytes의 합성 fixture. Ready/denied/postwork 각각 전체 stdout,
  packet/status/report bytes와 원본 Git 상태·cleanup이 일치했다.
- 이는 정상/거부/작업 후 결과의 호환성 검사다. 이 작은 fixture의 실행 시간으로 실제 consumer의
  장시간 실행이나 OOM 해소를 주장하지 않는다. 실제 consumer 재실행은 ck-ai-m#9에서 확인할 범위다.

마지막 검토 보완 뒤 네 원본 재현, 이전 다섯 재현, 두 실제 CLI benchmark를 최종 runtime으로
다시 실행했다. 위 semantic hash와 전체 출력 동등성은 모두 유지됐다. CLI harness가 검사한
runtime scripts 154개의 fingerprint는 baseline
`015ea46503ad43b6551f9b5ce9a762e52309887cc2d940fd522a9539944d0d52`, 수정본
`6475814a49b306ef374b1c1d5d7c6c54fc34b277311fdd182d494b1fa47937ef`다.
Package/lockfile은 바뀌지 않았다.

## 테스트

아래 검사는 마지막 runtime/test 변경 뒤 실행했다. 새 회귀 32건은 기존 packed/CI inventory에 연결돼 있다.

- Node 20 focused: iterator 22, selected Unknown 10, evaluation lifetime 5, graph cache 5,
  합계 **42/42 통과**, failure/cancel/skip/todo 0.
- Node 24 최종 focused: 위 42건 + authored isolation 8건, **50/50 통과**.
- Node 20 target 검증: authored isolation 8 + selected Unknown 10 + refs shared 9,
  **27/27 통과**. 기존 #293 exact/raw target 검사를 선택 실행해 3/3 통과했다.
  새 exact preflight/source validation 3건은 baseline에서 모두 실패했다.
- Node 24 source 경로: API context batch·dependency syntax·input syntax **19/19 통과**.
  실제 source relation의 1/4 API candidates에서 whole parses 6/6,
  unit projection에서 11/11로 후보 수에 비례한 재파싱이 없다.
- Actual packed runtime: source runtime 대신 payload를 실제 생성하고 manifest hash/배포 제외를 확인한 뒤,
  변경하지 않은 test driver만 그 옆에 둬 실행한다. 신규 evaluation lifetime suite도 inventory에 포함했다.
  Syntax lifetime inventory는 **61건**이다. 기존 subprocess별 5분 timeout은 유지한다.
- 최종 Node 20 actual packed 실행: **resolver 902건 + syntax lifetime 61건 전부 통과**.
  Input syntax 8, compact Evidence 12, advisory 5, frontmatter 21, table selection 13,
  shared reference view 3, readiness/binding-status 13, binding progress 10 및 source admission CLI도 통과했다.
  Manifest/배포 제외와 기존 package/CI 연결을 확인하는 outer tests는 **2/2 통과**, 총 약 235.5초였다.
  Failure/cancel/skip/todo 0이며 source runtime을 payload에 덮어쓰지 않았다.
- `git diff --check` 통과. 기존 workflow·timeout·package·lockfile·distribution 정책은 변경하지 않았다.

## 재현 명령

동일 dependency lockfile로 baseline과 PR checkout을 준비한다. 아래의 `KIT_BEFORE`와 `KIT_AFTER`는
각 checkout의 `frontend-workflow-kit` 디렉터리다. 출력 디렉터리는 새 빈 경로를 사용한다.

```bash
KIT_BEFORE=/path/to/baseline/frontend-workflow-kit
KIT_AFTER=/path/to/pr/frontend-workflow-kit
PROBES=/path/to/pr/kit-dev/benchmarks
OUT=/path/to/new-results
mkdir -p "$OUT"

# Node 24: whole semantic output을 저장하고 reader/lifetime 관찰을 출력한다.
for probe_case in unknown reads retention iterator; do
  node "$PROBES/scoped-evaluation-boundaries.mjs" "$probe_case" "$KIT_BEFORE" "$OUT/before-$probe_case.json"
  node "$PROBES/scoped-evaluation-boundaries.mjs" "$probe_case" "$KIT_AFTER" "$OUT/after-$probe_case.json"
done
cmp "$OUT/before-reads.json" "$OUT/after-reads.json"
cmp "$OUT/before-retention.json" "$OUT/after-retention.json"
cmp "$OUT/before-unknown.json" "$OUT/after-unknown.json"

for probe_case in 344 345 346 347 348; do
  node "$PROBES/scoped-syntax-lifetimes.mjs" "$KIT_BEFORE" "$probe_case" "$OUT/old-before-$probe_case.json"
  node "$PROBES/scoped-syntax-lifetimes.mjs" "$KIT_AFTER" "$probe_case" "$OUT/old-after-$probe_case.json"
  cmp "$OUT/old-before-$probe_case.json" "$OUT/old-after-$probe_case.json"
done

# Node 20 또는 Node 24의 실제 executable로 실행한다.
cd "$KIT_AFTER"
node --test scripts/lib/scoped-work-packed.test.mjs

# Node 24, actual CLI before/after comparison
node "$PROBES/binding-status.mjs" "$KIT_BEFORE" "$KIT_AFTER" 3 0 4 2 4 1
node "$PROBES/scoped-owner-memory.mjs" "$KIT_BEFORE" "$KIT_AFTER" \
  --out "$OUT/workflow" --inputs 8 --documents 2 --bullets 3 --input-bytes 512 \
  --timeout-ms 60000 --budget-ms 360000
```

## 검토 방식의 보완

직전 수정은 helper의 parse/classification/cache 결과를 확인했지만 실제 resolver 적용,
필수 graph audit 밖의 reader 호출, cache 밖의 `parsed` Map 수명까지 같은 검증에 묶지 못했다.
이번 회귀는 공개 원본 재현과 실제 call chain의 결과·read-set을 기준으로 작성했다. Reviewer가
구현과 별도로 public/custom 경계, 실제 감사 시점, 완료 batch 수명, import 이전 traversal을 확인했다.
재현이 실패하던 경계에 committed test를 추가하고 기존 packed/CI 경로에 연결했다.

## 2026-11-23 PR #354 리뷰 보완 — applicability Tracking index

### 원인과 수정

`b16430e`에서 외부 custom raw view의 Tracking cache 격리를 강화했지만,
`unappliedRows()`의 untyped Decision 검사에 쓰는 내부 view는 여전히 public raw parser로 만들었다.
같은 screen-spec의 `Review 1`처럼 typed ref가 될 수 없는 미선택 Decision 행을 확인할 때마다,
그 view가 canonical로 인정되지 않아 API 표의 Tracking index를 다시 만들었다.
모든 API가 confirmed/active이고 Tracking이 `-`여도 발생했다.

해당 내부 view 생성 한 곳을 `sharedReconciliationReferenceView(entry.body)`로 바꿨다.
현재 파일 검증과 read-set 기록은 같은 위치에서 계속 실행하며,
`localApiTrackingCells()`의 custom raw cache 격리 조건은 바꾸지 않았다.
같은 native tree의 private index를 재사용하고 명시적인 외부 custom view는 자신의 편집을 계속 관찰한다.

### 독립 공개 resolver 재현

[새 benchmark](../../benchmarks/scoped-applicability-tracking.mjs)는 실제 파일과 target index를 만들고
공개 `resolveScopedApplicabilityProjection()`을 호출한다. 선택한 owner는 한 unit으로 RULES를 소비하며,
다른 screen-spec 하나에 미선택 Open Decisions와 active API Candidates를 함께 둔다.
리뷰와 같은 120×600 조건을 별도 fixture로 구성하고 정규화 없이 전체 결과 bytes를 비교했다.

| 버전 | Decision 행 | API 행 | 실제 Tracking index 생성 | 실제 API 행 방문 |
|---|---:|---:|---:|---:|
| PR 이전 `e162490` | 120 | 600 | 1 | 600 |
| 리뷰 대상 `b16430e` | 120 | 600 | 120 | 72,000 |
| 리뷰 보완 후 | 120 | 600 | 1 | 600 |

세 결과 JSON은 모두 **5,195 bytes**이며 SHA-256도 동일하다:
`e276fb7c77e02e15b822fa52bfba20d2ed8a5265f2a258f28b66af751ec2b79f`.
수정본의 비계측 호출 결과도 같은 bytes다. 계측은 실제 helper의 cache-hit 반환 이후 Map 생성과
API 행 loop를 메모리에서만 관찰하며 runtime 파일과 반환 결과를 수정하지 않는다.

Node `24.22.3`에서 Decision 1,000행·API 2,000행을 각 버전의 새 process로 세 번씩 실행했다.
버전 실행 순서를 순환시켰으며, `time` 모드는 hook을 설치하지 않는다.
모듈 import·fixture/index 준비·JSON 직렬화는 제외하고 공개 resolver 호출만 측정했다.

| 버전 | 1회 (ms) | 2회 (ms) | 3회 (ms) | 중앙값 (ms) |
|---|---:|---:|---:|---:|
| `e162490` | 275.006 | 252.546 | 243.345 | 252.546 |
| `b16430e` | 1,962.432 | 1,960.841 | 1,953.335 | 1,960.841 |
| 리뷰 보완 후 | 222.198 | 290.711 | 216.395 | 222.198 |

9개 전체 결과는 모두 5,195 bytes이며 SHA-256은
`25f10cf0c77fa1312a20286cf1e58ba4968bda5584dce3e4c056bc3201ef84cc`로 같았다.
이 합성 측정은 해당 반복 순회 회귀의 복구를 보여 주며 consumer CLI 전체 시간의 예측값은 아니다.

### 회귀와 배포 검증

- 기존 applicability suite에 실제 public resolver 회귀 **1개**를 추가했다. API 24행에서 Decision을
  1→120행으로 늘려도 index 1회·API 행 방문 24회를 유지하는지 검사한다. `b16430e`에서는
  120회·2,880행으로 실패했고 수정 후 통과했다. 계측된 호출과 일반 public 호출의 전체 JSON도 비교한다.
- Applicability·graph-cache·selected-unknown·authored-isolation·generated의 **115/115**가
  Node `20.20.2`와 `24.22.3`에서 각각 통과했다. 실패·취소·skip·todo는 0이다.
- 실제 kit payload를 pack한 뒤 applicability와 custom Tracking cache test driver만 추가해
  **Node 20·24 각각 41/41**을 실행했다. Runtime은 payload 원본을 사용했고 manifest의 모든 파일 hash는
  실행 전후 같았다. Test driver가 원래 payload에 포함되지 않았음도 확인했다.
- 새 회귀는 기존 applicability 파일에 있으므로 기존 packed/CI inventory에 자동 포함된다.
  CI·timeout·package/lockfile·배포 제외 정책은 바꾸지 않았다.
- #350–#353의 원본 네 probe를 수정 후 다시 실행해 앞 절의 정상 결과 bytes와 일치함을 확인했다.
- 내부 Tracking 소비자를 독립 검토했다. Strict/candidate graph, API row context, uncertainty 경로는
  shared provenance를 유지하며, 같은 N×M 회귀가 생기는 추가 호출부는 찾지 못했다.

```bash
# Node 24, 각 버전을 별도의 process로 실행한다. 결과 경로는 새 파일이어야 한다.
node kit-dev/benchmarks/scoped-applicability-tracking.mjs \
  /path/to/frontend-workflow-kit counts 120 600 /tmp/new-count-result.json
node kit-dev/benchmarks/scoped-applicability-tracking.mjs \
  /path/to/frontend-workflow-kit time 1000 2000 /tmp/new-time-result.json
```
