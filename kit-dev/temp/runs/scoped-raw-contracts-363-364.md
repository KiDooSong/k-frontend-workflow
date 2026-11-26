# Scoped raw contracts — #363–#364

> **HISTORICAL — 2026-11-26 검증 기록.** 현재 구현 상태의 정본은
> [roadmap-current.md](../../roadmap-current.md)와
> [scoped-work.md](../../../frontend-workflow-kit/docs/reference/scoped-work.md)다.
> 공개 합성 fixture만 사용했으며 consumer 원문은 포함하지 않는다.

## 판정과 비교 기준

공개 [#363](https://github.com/KiDooSong/k-frontend-workflow/issues/363)은 **P2**,
[#364](https://github.com/KiDooSong/k-frontend-workflow/issues/364)는 **P3**로 확인했다.
두 건 모두 재현됐으며, 아직 열린 PR #362에 후속 보완으로 반영한다.

직전 후보는 `ea53a7b8c14d0b9f8a997f781468c4e41072fb96`, 그 이전 비교점은
`92c401868763b8dc2fe0d7860efdfbb80c7750df`다.
[최초 #362 기록](scoped-evaluation-contracts-359-361.md)의 검증 범위에서 빠졌던
반복 empty clone 및 중첩 접근자 경로를 이 기록으로 보완한다.
Linux x64의 Node v20.20.2와 v24.22.3에서 실제 `kit:pack` payload를 검사했다.
공개 이슈의 macOS 수치와 아래 Linux 관측을 같은 실행 결과로 취급하지 않는다.

## #363 — 반복 empty clone의 후보 보관과 검색

`structuredClone()`은 원본 node 배열의 private provenance를 보존하지 않는다.
`ea53a7b`는 출처가 없는 각 빈 section마다 물리 home 전체를 `filter()`하고,
생성한 후보 배열을 각각 보관했다. 전체 복사본 확인의 `includes()`도 후보를 다시
선형 탐색했다. 이름과 빈 본문이 같은 H2 N개에 preamble을 포함하면 후보 검사
`(N+1)²`, 후보 원소 `N²+1`, complete 검사 `N(N+1)/2`가 실제 계측과 일치한다.

수정본은 title → slug → 정확한 raw text의 중첩 Map을 한 번 만들고, 같은 key의
home 후보를 Set 하나에 공유한다. 전체 복사본은 `Set.has()`로 후보 소속을 확인한다.
새 빈 label의 충돌 검사도 미리 만든 title/slug Set을 사용한다. 문자열로 강제 변환한
복합 key를 만들지 않으며, 물리 home의 literal/formatted/GENERATED identity는 유지한다.

### 결정적 작업량

[scoped-raw-empty-clone.mjs](../../benchmarks/scoped-raw-empty-clone.mjs)의 `--candidates`는
별도 runtime 사본만 계측한다. 원본 payload는 수정하지 않는다. 기존 `includes()`는
진단 Proxy를 receiver로 사용해 native 검색이 실제 읽은 candidate index 수를 센다.
수정본에서는 물리 색인 준비, hash lookup, 고유 Set의 보관 원소, complete `has()`를 구분한다.

| 동일 빈 H2 수 | 후보 검사 `ea53` → 수정 | 후보 보관 원소 `ea53` → 수정 | complete membership 검사 `ea53` → 수정 |
| ---: | ---: | ---: | ---: |
| 500 | 251,001 → 501 | 250,001 → 501 | 125,250 → 500 |
| 1,000 | 1,002,001 → 1,001 | 1,000,001 → 1,001 | 500,500 → 1,000 |
| 2,000 | 4,004,001 → 2,001 | 4,000,001 → 2,001 | 2,001,000 → 2,000 |
| 4,000 | 16,008,001 → 4,001 | 16,000,001 → 4,001 | 8,002,000 → 4,000 |

수정본은 두 Node에서 같은 수치다. 별도의 candidate lookup은 N+1회,
candidate Set은 2개(preamble·Notes), entry의 candidate reference는 N+1개,
added-label lookup은 N회다. 후보 목록 공유와 membership 검색을 함께 바꿔
보관량과 검색량 양쪽의 제곱 증가를 제거했다.

### 계측하지 않은 실제 조회 시간·프로세스 고점

각 행은 동일 Node 실행 파일로 `ea53`과 수정본을 새 프로세스에서 연달아 실행한
한 쌍의 관측이다. 시간은 파싱과 `structuredClone()` 이후의 `scopedAuthoredView()`이며,
최대 RSS는 파싱·복제를 포함한 프로세스 고점이다. 둘 다 결과 JSON을 직렬화하기 전에
채집했다. 이 측정에는 diagnostic copy/proxy가 없다.

| Node 20.20.2 | `ea53` 조회 ms | 수정 조회 ms | `ea53` 최대 RSS KiB | 수정 최대 RSS KiB |
| ---: | ---: | ---: | ---: | ---: |
| 500 | 31.526 | 30.202 | 76,288 | 75,536 |
| 1,000 | 100.962 | 49.530 | 103,356 | 88,460 |
| 2,000 | 299.511 | 32.556 | 144,980 | 105,672 |
| 4,000 | 686.516 | 63.696 | 248,608 | 133,632 |

| Node 24.22.3 | `ea53` 조회 ms | 수정 조회 ms | `ea53` 최대 RSS KiB | 수정 최대 RSS KiB |
| ---: | ---: | ---: | ---: | ---: |
| 500 | 17.307 | 10.324 | 72,248 | 72,172 |
| 1,000 | 88.683 | 24.333 | 98,532 | 85,216 |
| 2,000 | 420.976 | 29.346 | 201,204 | 103,732 |
| 4,000 | 935.162 | 53.043 | 324,588 | 156,520 |

크기당 한 쌍의 합성 관측이므로 시간의 작은 차이나 순서를 성능 보장으로 해석하지 않는다.
증가 차수의 근거는 앞의 결정적 검사·보관 원소 수다.

### 전체 결과 보존

모든 N에서 Notes N개와 별도 preamble을 반환했다. Tree와 ordered sections의
title/slug/name/start/text 및 `byName`·`tableSections` Map까지 직렬화해 비교했다.
수정본의 두 Node, 계측 유무, `ea53` 및 `92c4018` 결과의 전체 hash가 같다.

| N | 전체 JSON bytes | 공통 SHA-256 |
| ---: | ---: | --- |
| 500 | 266,128 | `a537a6e342151dd2410f9895e85efd4701ce54abbcd3c2715282b70412393a6b` |
| 1,000 | 533,133 | `6f3d7a6bd2d0419e5c0e5fedf3e344cbdf589bc2b8af1c0114cad052140e55b7` |
| 2,000 | 1,076,467 | `2e32efa27199697224a9543ce8800d3b6734343ddfeb868e73fb8933bcd52370` |
| 4,000 | 2,164,467 | `6ee54896e30e4bea65ff2fe0aa8d3ec1df7128fda928fb5a02699c48ca5ec35a` |

원래 길이·순서·물리 node 위치가 모두 맞는 전체 복사본만 ordinal 복구를 허용한다.
출처가 모호한 일부 복사본은 계속 `SW-REF-SNAPSHOT`으로 거부한다.
이전 #360의 삭제·이동·추가·교체와 literal/formatted/GENERATED 경계도 유지한다.

## #364 — 실제 소비하는 중첩 구문의 캐시 조건

기존 구조 비교는 tree와 section node의 객체 identity까지만 확인했다. 실제 builder가
그 아래 `children`이나 위치를 읽어도 다음 조회의 캐시 조건에는 그 값이 없었다.
공개 원본 스크립트의 결과는 다음과 같다.

| 재현 | `92c4018` | `ea53a7b` | 수정본 Node 20·24 |
| --- | --- | --- | --- |
| 같은 목록 노드의 children getter가 1개 → 2개 반환 | 2 → 2, raw getter 미소비 | 1 → 1, getter 총 1회 | 1 → 2, 새 view, getter 총 2회 |
| 같은 tree wrapper의 children getter가 API 표 제외 | 1 → 1, 새 wrapper로 강제 재구성하면 0 | 동일 | 1 → 0, 강제 재구성도 0 |

목록 재현의 stale 결과는 `ea53`에서 생겼고, tree wrapper 경로는 이전 버전에도 있었다.
[scoped-raw-nested.mjs](../../benchmarks/scoped-raw-nested.mjs)는 이 두 원본을 공개 호출로 실행한다.
Tree 재현은 초기·재조회·새 wrapper의 세 번을 합쳐 getter 5회다. 실제 build 3회와
새 wrapper 두 개의 node-budget 계산 2회이며, eligibility를 위한 getter 호출은 없다.

### 수정 경계

- Custom syntax에서 실제 소비하는 node type/depth/value/alt, children의 현재 순서,
  position.start/end.offset을 own data descriptor로 기록한다. 공유 자손은 한 번만 방문한다.
- Getter, proxy, custom 순회 및 실제 `map`/`slice`를 바꾸는 배열 hook은 재사용에서
  제외한다. Proxy는 descriptor/prototype 조회보다 먼저 판별하고, eligibility는 getter나
  trap을 실행하지 않는다. 필요한 값은 실제 builder가 읽는다.
- 일반 mutable plain copy는 값이 같으면 기존 view와 공개 편집을 보존한다. 이미 shared인
  표 DTO 내부는 다시 복제하거나 깊게 비교하지 않는다.
- 파서 내부의 deep-freeze가 인증한 native node만 자손 검사를 생략한다. 인증은 WeakSet이며
  AST를 추가로 소유하지 않는다. 외부의 frozen wrapper는 그 자손까지 불변이라는 증명이 아니다.
- Immutable canonical 경로는 기존 private view/index를 그대로 사용한다.

독립 검토에서는 own `constructor` getter가 `slice()`의 `Symbol.species` 동작을 바꾸는
경로도 추가로 확인했다. 직전 후보는 physical row membership이 warm 조회에서는 true,
강제 재구성에서는 false였고 getter는 warm 두 조회 동안 한 번만 실행됐다.
수정본은 warm·강제 재구성 모두 false이며 warm 실제 build 두 번에 getter도 두 번이다.
이 경로까지 own hook 재사용 제외와 회귀 테스트에 포함했다.

## 실제 배포본과 회귀 검사

316개 payload 파일의 manifest hash를 검사하고 대응 source와 바이트 비교했다.
생성되는 consumer `package.json`은 source 비교에서 제외하며, LICENSE는 저장소 루트와
비교한다. Packed tests는 test driver만 배포본 옆에 복사하며 runtime은 덮어쓰지 않는다.

| 검사 | 결과 |
| --- | --- |
| 새 회귀 19개를 고정 `ea53` payload에 실행 | 18 fail / 보존 대조군 1 pass |
| Authored-isolation 전체, Node 20·24 | 각각 43/43, fail·skip 0 |
| 실제 수정 payload 관련 8파일, Node 24 | 281/281, fail·skip 0 |
| Node 20 전체 packed harness | Resolver 965/965, 구문 수명 62/62 및 기존 입력·Evidence·frontmatter·표·shared view·CLI 검사 통과; harness 2/2 |
| #363 원본 paired 16회 + 수정 계측 8회 | 모든 N·Node에서 전체 결과 hash 일치, 작업량 기준 통과 |
| #364 원본 및 constructor 공개 경로, Node 20·24 | 현재 값 반영과 실제 접근 횟수 확인 |

새 회귀는 일반 배열 작업의 할당·검색 크기를 제한하는 empty clone 두 건과, nested node/
array proxy, index accessor, iterator, position data/getter/proxy, frozen wrapper 아래
children 변경, descendant type, heading map/alt, array constructor 및 공개 편집 대조를 포함한다.
파생 구현과 같은 helper를 호출해 기대값을 만드는 방식 대신 public authored 결과와
실제 사용자 접근 횟수, 전체 결과 동등성을 확인한다.

### 이전 수정 재검증

- **#359:** Node 20·24 × standalone/snapshot × 32/64/128/256 참조의 16개 조합을
  실제 payload에서 재실행했다. RULES 파일 열기는 standalone 35회, snapshot 31회다.
  계측 유무, `ea53` 및 `92c4018` 대비 전체 JSON이 같다. 단위·witness·read-set 관련
  기존 Decision 회귀도 위 281개 및 packed 검사에 포함된다.
- **#360:** API H2 삭제 후 Unknowns/Notes, 최상위 accessor/proxy, 사용하지 않는 revoked
  tables, canonical identity 재현의 stdout이 `ea53`과 같다. 삭제·교체·추가·이동과
  모호한 empty clone 경계는 기존 authored/graph-cache 검사를 통과했다.
- **#361:** upgrade-notes·README·COMMANDS는 `ea53` 실제 payload와 바이트 단위로 같다.
  기존 managed dry-run 검증은 [최초 기록](scoped-evaluation-contracts-359-361.md#361--같은-basis-v2에서도-필요한-바인딩-재검토)을 따른다.
- **#355–#358:** 원본 P1 재현 결과를 유지한다. 실제 `8a66aa6` binding 업그레이드와
  참조 문서의 `decision_refs`만 변경하는 경우 이전 binding은 `stale-basis`이고
  관련 두 단위만 차단한다. 재검토한 current binding의 명시 `blocks`도 유지한다.
  완전한 90,381-byte JSON의 SHA-256은
  `22d72ae3db0bba17ce1d2fc4aaceedfb68114c9bd3eaae859744b7dffc7a51c4`로 같다.
- **#344–#348, #350–#354:** 이전 최적화 재현 10개의 전체 JSON이 `ea53` 및 이전 기록과
  바이트 단위로 같다. Input Evidence 읽기 21회, 완료 문서 view 0개, malformed 문서 읽기
  3회, Decision 120행·API 600행의 Tracking 색인 1회/API 순회 600행을 유지한다.

## 재실행

의존성이 설치된 checkout에서 fresh 경로에 payload를 만든다. 이전 버전은 별도 worktree에서
각각 pack한 뒤 동일 benchmark를 실행한다. `--check`는 수정 후 기대값이다.

```bash
node frontend-workflow-kit/scripts/pack-frontend-workflow-kit.mjs --out /tmp/frontkit-raw-contracts
ln -s "$PWD/frontend-workflow-kit/node_modules" /tmp/frontkit-raw-contracts/node_modules

node kit-dev/benchmarks/scoped-raw-empty-clone.mjs /tmp/frontkit-raw-contracts 4000 --result /tmp/raw-original.json
node kit-dev/benchmarks/scoped-raw-empty-clone.mjs /tmp/frontkit-raw-contracts 4000 --candidates --check --result /tmp/raw-counted.json
cmp /tmp/raw-original.json /tmp/raw-counted.json
node kit-dev/benchmarks/scoped-raw-nested.mjs /tmp/frontkit-raw-contracts --check
node kit-dev/benchmarks/scoped-raw-sections.mjs /tmp/frontkit-raw-contracts --check
node kit-dev/benchmarks/scoped-api-fanout.mjs /tmp/frontkit-raw-contracts 256 --snapshot --contexts --check
node kit-dev/benchmarks/scoped-reference-boundaries.mjs /tmp/frontkit-raw-contracts --check

cd frontend-workflow-kit
node --test scripts/lib/scoped-work-packed.test.mjs
```

Empty clone은 500·1,000·2,000·4,000과 두 Node 실행 파일을 각각 바꿔 검사한다.
원본 시간/RSS와 계측 사본의 작업량을 구분한다. 실제 consumer 전체 `binding-status`의
실행 시간·최대 RSS, 개별 미검토 binding의 영향 및 OOM 해소 여부는 여기서 측정하지 않았다.
