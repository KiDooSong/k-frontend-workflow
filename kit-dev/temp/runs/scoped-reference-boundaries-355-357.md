# Scoped reference boundaries — #355–#357

> **HISTORICAL — 2026-11-24 검증 기록.** 현재 구현 상태의 정본은
> [roadmap-current.md](../../roadmap-current.md)와
> [scoped-work.md](../../../frontend-workflow-kit/docs/reference/scoped-work.md)다.
> 합성 문서와 실제 public API/배포 runtime을 사용했으며 consumer 원문은 포함하지 않는다.

> **후속 리뷰 보완:** 이 최초 기록의 `f6c4fb0` 검증은 API Decision application이
> binding basis에서 다시 누락되는 경로를 잡지 못했다. 이전 좁은 바인딩이 계속 current로
> 남는 결함과 공통 unit seed 수정은 [#358 basis 검증 기록](scoped-api-decision-basis-358.md)에 기록한다.

## 범위와 기준

기준은 PR #354가 머지된 `8a66aa66c21d987202f27443ad10b2458cb5d992`이다.
Node v20.20.2와 v24.22.3에서 검사했다. 공개 이슈
[#355](https://github.com/KiDooSong/k-frontend-workflow/issues/355),
[#356](https://github.com/KiDooSong/k-frontend-workflow/issues/356),
[#357](https://github.com/KiDooSong/k-frontend-workflow/issues/357)의 원본 합성 재현을 먼저 실행했다.
원본 스크립트 SHA-256은
`c3c71621d719a5275f221723903c64d1f8ad46f02882580ec448e8137ef460ff`이며,
기준과 수정본 모두 실제 `kit:pack` payload를 대상으로 재실행했다.

공개 재현은 [scoped-reference-boundaries.mjs](../../benchmarks/scoped-reference-boundaries.mjs)다.
관찰 모드는 두 버전에서 실행 가능하고, `--check`는 아래 수정 후 기대값을 assert한다.
Decision은 기존 버전과의 동등성이 아니라 올바른 적용 단위 집합을 기준으로 검증한다.

| 원본 재현 | 기준 배포본 | 수정 배포본 |
| --- | --- | --- |
| API Note의 open Decision | `explicit`만 차단; `api` 통과; application 1개 | `api`·`explicit`만 차단; `control` 통과; application 2개 |
| malformed Open Decisions 검사 후 public header | `Edited → Question` | `Edited → Edited` |
| 같은 raw에서 API table 삭제 후 Tracking | 이전 `unknown:U-LATER@CACHE-SCREEN` 반환 | 기존 home을 사용하지 않고 unqualified `unknown:U-LATER`를 참조 오류로 거부 |

## 구현 경계

### 단위별 API 참조

Unit projection이 이미 구한 API ordinary references를 원본 결과의 private
WeakMap에 owner/unit 쌍으로 보관한다. Decision 단계는 해당 단위의 선언·source·Tracking
seed와 함께 이 참조들을 탐색한다. 추가 table scan이나 public `api_rows` 필드는 없다.
Sidecar에는 참조 문자열만 있으며 AST나 별도 source-text cache를 보관하지 않는다.

Standalone Decision 계산은 방금 만든 원본 unit 결과를 사용한다. Snapshot resolver는
처음 만든 원본 결과를 동결해 보관한다. 둘 다 외부 JSON DTO를 계산 입력으로 받지 않는다.
API→artifact→Decision 간접 참조, 다른 API 후보를 고른 control, 미선택 후보의 다른 Decision을
함께 검사한다. Missing/stale binding은 실제 application 단위를 차단하고, current binding의
`blocks: ['api']`, `['control']`, `[]`는 각 명시 범위를 그대로 사용한다.

이전 누락 때문에 관계 basis에 없던 API application이 복구되는 경우 기존 digest는
stale이 될 수 있다. 검사는 이를 계산할 뿐 binding이나 사람의 승인 상태를 자동 갱신하지 않는다.

### 내부 정본과 공개 편집 뷰

Malformed Decision relevance 검사와 applicability/Decision/source-relation/input-coverage의
내부 span producer를 canonical shared raw로 연결했다. Context 없는 copied H3의
물리 row coverage fallback도 shared raw/authored subsection을 사용한다.
명시적 custom raw를 받는 public helper와 tree만 읽는 parser 호출은 유지한다.

Cold/warm 실제 applicability 호출에서 public view identity와 `Edited`를 보존하며,
canonical Unknown header는 `Question`이다. 미선택 malformed 문서는 현재 파일 SHA와 함께
read-set에 남고, warm 전체 projection/read-set JSON도 편집 전과 동일하다.

### 가변 raw의 현재 구조

같은 raw 객체라도 section/table 순서와 native table·encoded table 객체 구성이 바뀌면
authored 파생 목록을 다시 만든다. Raw가 바뀌지 않았다면 public authored 목록 자체의
편집은 그대로 유지한다. Canonical immutable 조회에는 이 구조 검사·스냅샷을 추가하지 않는다.

숫자 원소가 같은 배열에서도 실제 순회 의미가 바뀔 수 있다. Own iterator,
`forEach`, accessor, proxy, inherited iterator `next`가 있는 경우에는 파생 cache hit를
사용하지 않는다. Eligibility는 own data descriptor로 확인하며 사용자 getter나 순회를
검사용으로 먼저 실행하지 않는다. 이 분기는 실제 build당 한 번의 custom 순회와
canonical Tracking 결과 보존을 검사한다.

## 회귀 검사

새 테스트 14개와 기존 copied H3 검사 확장 1개를 기준 payload에 적용하면 **15/15 실패**한다.
동일한 테스트는 수정 payload의 관련 198개 suite에 포함되어 모두 통과했다.
기존 API section/row span 검사는 public prewarm 보존 assertion도 강화했다.

| 검사 | 결과 |
| --- | --- |
| 기준 payload의 새/강화 회귀 15개, Node 24 | 0 pass / 15 fail — 각 누락·편집 손실·stale Tracking 재현 |
| 수정 payload 관련 6파일, Node 24 | 198 pass / 0 fail / 0 skip |
| Node 20 전체 packed harness | Resolver 917/917 + 구문 수명 61/61 + 추가 CLI/입력 검사 89/89; harness 2/2 통과 |
| Authored/graph/subsection/Unknown/syntax scope 5파일, Node 20·24 | 각 52/52 |
| 기존 iterator import/own/inherited 변경 회귀, Node 20·24 | 각 22/22 |

Packed harness는 test driver만 실제 배포본 옆에 복사한다. Runtime source를 덮어쓰지 않으며,
315개 payload 파일의 manifest hash를 검사했다. 기존 packed inventory에 이번 변경 파일의
테스트가 이미 포함되어 있어 새 suite 등록이나 skip을 추가하지 않았다.

독립 교차검토에서는 surface와 두 screen에 모두 unit ID `api`를 주고 실제 참조가 있는
screen의 단위에만 application이 생기는 것을 확인했다. Snapshot 반환값 편집은 다음 호출에
영향을 주지 않았으며, 원본 파일에서 API 참조를 지우면 기존 snapshot은 변경을 거부하고
새 standalone은 빈 application을 계산했다. 첫 build 이전에 stateful getter/proxy를
설치한 경우에도 다음 호출은 현재 membership을 읽고 canonical 결과는 보존했다.

## 선행 수정과 비용 비교

아래 열 가지 재현은 기준/수정 **실제 packed runtime**에서 Node 24의 새 프로세스로 각각 실행했다.
모든 완전한 semantic JSON 파일을 정규화 없이 바이트 비교했으며 **10/10 동일**했다.
이번 세 결함의 의도적인 결과 변경은 앞 표에서 별도로 확인한다.

| 재현 | 기준 → 수정 관찰 |
| --- | --- |
| #344 초과 크기 API 후보 4개 | 전체 parse 1 → 1 |
| #345 실제 uncertainty 계산 | graph parse [0,0,0] → [0,0,0]; range parse 0 → 0; base 이후 전체 parse 2 → 2 |
| #346 artifact/input × strict/candidate | 네 경로 모두 전체 parse 1 → 1 |
| #347 canonical Unknown 분류·퇴출 | 동일한 수정된 분류 유지 |
| #348 custom iterator span | 실제 순회와 동일한 span 유지 |
| #350 실제 Unknown 적용 | 퇴출 전후 application 1 → 1, public `Edited` 유지 |
| #351 input Evidence 읽기 | 21 → 21회 |
| #352 완료 배치 resolver 보관 | 문서 view 0 → 0; malformed 문서 읽기 3 → 3회 |
| #353 own/inherited-next 변경 | 내부 span과 현재 순회 결과 일치 |
| #354 Decision 120행·API 600행 | Tracking 색인 1 → 1회; API 순회 600 → 600행 |

| 결과 파일 | bytes | 공통 SHA-256 |
| --- | ---: | --- |
| 344 | 193 | `7884c403a5af8811f45b8d905d984e85fe7a0dd4005d113614e251ccbe68199f` |
| 345 | 4697 | `774d9f3da5020056bbadfd037a1725797b4602d78d7080162b37dd67925f9744` |
| 346 | 16780341 | `4d3bc952558effebb4b589f429fdb2095c8eb16d5ad883581b82d51357bfef3c` |
| 347 | 131 | `29f6ade9343822a3fff2719c69e0024912f66776b9f35b8eae1216e7462f41df` |
| 348 | 52 | `7ed3f61224ecdc21e6eac63cca76d5e23496276a40bd53c22cac973920539aae` |
| unknown | 2326 | `8e0a24c63be7f571db9e689bcc08017014b3f1e4e9392029fb04f351b4908a75` |
| reads | 604 | `52a9311967b173d07ee8b3bcc498b874d4058b621c8ff9d0efecd274203575a7` |
| retention | 1063 | `b30c3ab2efcf2359a4e69932ecf2d01b1a668a92d0f667bfa21b8fb3b82dd98f` |
| iterator | 75 | `ca11c4cb8131a2534100a87c8a4a8c8dc99e49cc1d7050adca56b3156e96a4bc` |
| tracking | 5195 | `e276fb7c77e02e15b822fa52bfba20d2ed8a5265f2a258f28b66af751ec2b79f` |

이 수치는 합성 fixture의 파싱·읽기·색인 작업 수다. 실제 consumer 전체 지연이나 OOM 해소를
측정한 수치로 해석하지 않는다. 기존 파일 관찰·최종 audit·바인딩 권한 경계는 테스트로 유지했다.

## 재실행

의존성이 설치된 각 worktree에서 실제 payload를 만든 다음 같은 Node 실행 파일로 비교한다.

```bash
node frontend-workflow-kit/scripts/pack-frontend-workflow-kit.mjs --out /tmp/frontkit-r6-payload
ln -s "$PWD/frontend-workflow-kit/node_modules" /tmp/frontkit-r6-payload/node_modules
node kit-dev/benchmarks/scoped-reference-boundaries.mjs /tmp/frontkit-r6-payload --check

node kit-dev/benchmarks/scoped-syntax-lifetimes.mjs /tmp/frontkit-r6-payload 344 /tmp/r6-344.json
node kit-dev/benchmarks/scoped-evaluation-boundaries.mjs reads /tmp/frontkit-r6-payload /tmp/r6-reads.json
node kit-dev/benchmarks/scoped-applicability-tracking.mjs /tmp/frontkit-r6-payload counts 120 600 /tmp/r6-tracking.json

cd frontend-workflow-kit
node --test scripts/lib/scoped-work-packed.test.mjs
```

선행 사례 전체 비교에는 syntax-lifetimes의 `344 345 346 347 348`,
evaluation-boundaries의 `unknown reads retention iterator`를 각각 별도 프로세스에서 실행한다.
결과 파일은 각 실행의 새 경로여야 한다. `--check`는 결함을 가진 기준 버전에서 실패하는 것이 정상이다.
