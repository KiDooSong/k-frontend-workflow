# API Decision applications in the binding basis — #358 review

> **HISTORICAL — 2026-11-24 검증 기록.** 현재 구현 상태의 정본은
> [roadmap-current.md](../../roadmap-current.md)와
> [scoped-work.md](../../../frontend-workflow-kit/docs/reference/scoped-work.md)다.
> 합성 문서와 실제 public API/배포 runtime을 사용했으며 consumer 원문은 포함하지 않는다.

## 결함과 기준

PR #358의 첫 HEAD `f6c4fb0a76e10538460047c3c1658d92ea760233`은 API 일반 참조를
Decision 적용 계산에 전달했지만 binding basis의 별도 `relationClosure()` 시작점에는
전달하지 않았다. 이 때문에 복구된 API application이 관계 필터에서 제거되어,
`blocks: ['explicit']`인 과거 바인딩이 계속 `current-unverified`로 남았다.

최초 current binding 테스트는 수정한 runtime에서 digest를 새로 계산한 뒤 검사했다.
그 테스트와 [최초 기록](scoped-reference-boundaries-355-357.md)은 이전 바인딩의
유효성 전환을 검증하지 못했다. 이번에는 실제 이전 runtime에서 만든 digest와
바인딩을 기록한 뒤 문서 metadata만 수정하는 경로를 각각 고정했다.

- 변경 전 runtime: `f6c4fb0`의 실제 `kit:pack` payload.
- 업그레이드 바인딩 생성 runtime: `8a66aa66c21d987202f27443ad10b2458cb5d992`의 실제 payload.
- 검사 환경: Node v20.20.2와 v24.22.3.
- 공개 재현: [scoped-api-decision-basis.mjs](../../benchmarks/scoped-api-decision-basis.mjs).

## 구현

선택 API 행에서 이미 해석한 일반 참조를 정규화된 unit 객체의 private context에 연결한다.
Decision 적용, Unknown/Conflict witness 선택, binding closure가
`scopedUnitEvidenceSeeds()`를 함께 사용한다. 공통 시작점은 계약, isolation Decision,
source anchor/effect, 선택한 API 일반 참조, Tracking이다. API 참조는 원래의 owner/unit
소속을 유지하며 새 public projection 필드나 basis version을 추가하지 않는다.

`relationClosure()`의 관계별 `kept()` 판정은 유지한다. 모든 application을 보존하거나
같은 문서의 모든 참조를 시작점으로 만드는 방식은 사용하지 않는다. 선택한 API가
참조한 section을 통해 도달한 Decision만 해당 단위의 basis에 남는다.

Standalone과 snapshot 조합은 같은 unit 객체를 유지한다. 저수준 `scopedBindingBasis()`에
API 문맥을 잃은 deep copy/JSON DTO를 넘기면 `SW-UNIT-EVIDENCE` 오류를 내며,
누락된 관계로 더 작은 digest를 만들지 않는다. 파일을 읽는 공개 resolver와 inspector는
그 문맥을 직접 구성한다. Sidecar는 참조 문자열만 보관하며 AST를 보관하지 않는다.

같은 시작점 누락이 있던 API→artifact←Unknown 역방향 witness도 함께 복구했다.
선택한 API의 단위에만 적용하며 다른 section을 선택한 단위에는 적용하지 않는다.

## 두 공개 재현의 결과

각 단계에서 standalone/snapshot inspector의 전체 결과를 비교했다. Metadata 사례는
API Note가 외부 ScreenSpec의 `artifact:RULES#rules`를 참조하며, 바인딩 기록 후
그 ScreenSpec의 `decision_refs: ['D-GLOBAL']`만 추가한다. 본문 bytes는 유지한다.
업그레이드 사례는 실제 `8a66aa6` runtime에서 바인딩을 기록한 후 입력을 바꾸지 않고
검사 runtime만 교체한다.

| 경로 | `f6c4fb0` 검사 | 수정 검사 |
| --- | --- | --- |
| 외부 ScreenSpec에 `decision_refs`만 추가 | application은 `api`·`explicit`, basis에는 `explicit`만 남음 | application과 basis 모두 `api`·`explicit` |
| 실제 `8a66aa6` 바인딩 업그레이드 | application은 늘어도 기존 digest와 동일 | API application이 포함되어 digest 변경 |
| 두 경로의 이전 바인딩 | `current-unverified`, `explicit`만 차단 | `stale-basis`, `api`·`explicit` 차단, `control` 통과 |
| 새 basis로 다시 기록한 바인딩 | — | `current-unverified`, 명시한 `blocks: ['explicit']` 적용 |

아래 digest는 공개 합성 스크립트의 값이다. 리뷰 본문과 테스트 파일의 fixture는 서로
다르므로 그 digest와 동일하다는 의미는 아니다.

| 공개 스크립트 경로 | 기록된 digest | 수정 후 계산 digest |
| --- | --- | --- |
| Metadata 수정 | `sha256:c04244ec3340ea77d7cd9a0325ecfa3e0a37d590935a509b9a01559b560755b3` | `sha256:af2cdd8bf85ebd3efeac5822575ee806d2815e0fc4ea0b29f28135a52f122481` |
| 이전 runtime 업그레이드 | `sha256:2f360135f665f292eafe8d9b035e67ab166ca407772e519f202105339bf7cc21` | `sha256:5691d4c8390c8473a211b7501458456d7f717e4fbecaff21edd111dc6bb72ae6` |

실제 수정 payload에서 Node 20/24의 전체 의미 결과 JSON은 **90,381 bytes로 동일**했다.
SHA-256은 `22d72ae3db0bba17ce1d2fc4aaceedfb68114c9bd3eaae859744b7dffc7a51c4`다.
각 runtime의 전체 basis와 inspector 결과를 포함한 값이며 실행 시간은 포함하지 않는다.

## 회귀 테스트와 배포본 검증

새 회귀는 7개다.

- Metadata만 편집한 이전 바인딩의 stale 전환: standalone/snapshot 각 1개.
- 실제 `8a66aa6`에서 만든 바인딩의 업그레이드: standalone/snapshot 각 1개.
- Shallow projection의 문맥 보존과 detached API DTO의 명시 오류: 1개.
- API 일반 참조의 단위별 inverse Unknown witness와 basis 포함: 1개.
- 선택한 API Decision 관계는 보존하고 무관한 행 경로는 제외하는 대조군: 1개.

업그레이드 테스트의 역사적 digest
`sha256:d970ee6073cea81fb17baf0df221dadd774de74f22d973bd86a9963ef33df19b`는
실제 `8a66aa6` payload로 계산했다. 같은 fixture의 units component
`sha256:637f448e1db3922b7c3ba34a715555e22caa063e2b914480acc1fead3bee315c`도
고정해, 우연히 단위 입력이 바뀌어서 stale이 되는 테스트를 방지한다.

무관한 행 대조군은 전체 Decision projection에 해당 경로가 실제 존재하는지 먼저
확인한다. 그 행 추가와 미선택 sibling 수정 후에도 target basis의 application 집합과
digest는 그대로이며, 파일 변경은 read-set에 나타난다.

| 검사 | 결과 |
| --- | --- |
| 새 7개 테스트 + 변경 전 실제 `f6c4fb0` payload | **7/7 실패**, 결함 검출 확인 |
| 두 공개 재현 + 변경 전 실제 payload, Node 20/24 | `--check` 실패, basis에서 API 단위가 빠지는 관찰 동일 |
| 두 공개 재현 + 수정 실제 payload, Node 20/24 | 모두 통과, 전체 의미 JSON 동일 |
| Node 24 실제 payload, 관련 7개 테스트 파일 | **297/297 통과**, 실패·취소·skip·todo 없음 |
| Node 20 실제 packed harness, resolver | **924/924 통과**, 실패·취소·skip·todo 없음 |
| 같은 packed harness, 대형 문서·구문 수명 | **61/61 통과** |
| 같은 packed harness의 입력·Evidence·frontmatter·table/view·CLI 하위 검사 | 모두 통과 |
| 실제 payload manifest | **316개 파일**의 SHA-256 일치 |

Packed harness는 새 공통 seed 모듈도 원본/배포 runtime 동등성 검사에 포함한다.
수정 전 payload에 복사한 것은 테스트 driver뿐이며 runtime은 수정하지 않았다.

## 이전 수정의 유지

원래 #355–#357 공개 재현을 수정 payload에서 다시 실행했다. `api`·`explicit`만
차단, 공개 `Edited` 유지, 삭제한 API table의 이전 Tracking 거부라는 전체 stdout은
`f6c4fb0` 검증 결과와 bytes 단위로 같았다. 공개 편집 뷰와 가변 raw의 구현에는
이번 후속 수정이 없다.

#344–#348, #350–#353, #354 Tracking 재현도 새 프로세스에서 다시 실행했다.
10개 모두 이전 `f6c4fb0` 결과와 전체 의미 JSON이 bytes 단위로 같았다.
읽기 21회, 완료 문서 view 0개, malformed 문서 읽기 3회, Decision 120행·API 600행에서
Tracking 색인 1회·API 행 순회 600회가 유지됐다. 세부 이전 결과 hash는
[최초 기록](scoped-reference-boundaries-355-357.md)에 있다.

## 재실행

이전 checkout과 수정 checkout에서 각각 `kit:pack`으로 실제 payload를 만들고,
각 payload가 요구하는 runtime dependencies를 준비한다. 저장소 루트에서 실행한다.

```sh
node kit-dev/benchmarks/scoped-api-decision-basis.mjs /path/to/f6c4fb0-payload /path/to/8a66aa6-payload --check /tmp/api-basis-before.json
node kit-dev/benchmarks/scoped-api-decision-basis.mjs /path/to/fixed-payload /path/to/8a66aa6-payload --check /tmp/api-basis-after.json
```

첫 명령은 수정 후 계약을 assert하므로 실패가 기대값이다. 결과 파일은 새 경로여야 한다.
`--check`를 생략하면 비교 관찰만 수행한다. Node 20과 24에서 같은 두 명령을 실행하면 된다.
별도의 source hook이나 테스트 runtime에서 새로 계산한 가짜 이전 digest는 사용하지 않는다.

```sh
cd frontend-workflow-kit
node --test scripts/lib/scoped-work-decisions.test.mjs scripts/lib/scoped-work-basis.test.mjs
node --test scripts/lib/scoped-work-packed.test.mjs
```

이 기록은 로컬 합성 재현과 실제 배포본 검사다. GitHub Actions 결과는 해당 PR HEAD의
실행 결과를 별도로 확인한다. 바인딩 기록·갱신은 테스트 fixture에서만 수행했으며,
검사기가 consumer 바인딩이나 사람의 승인 상태를 자동으로 갱신하지 않는다.
