---
track: 04
title: Run Report 증거·프로버넌스·멱등
date: 2026-06-14
status: draft
inputs: [notes/01-loop-engineering.md, notes/02-llm-only-scriptization-risk.md]
---

# Track 04 — Run Report 증거·프로버넌스·멱등

> 리서치 메모: 이 보고서는 `deep-research` 하니스 1차 실행이 전송 인프라 rate-limit 으로
> 검증 단계가 전부 기권(abstain)·중단된 뒤, 동일 질문을 절제된 수동 검색·1차 출처 페치로
> 다시 조사해 작성했다. §8 의 출처는 모두 실제 URL 이며, SLSA/in-toto/reproducible-builds 의
> 정규 스펙 페이지와 agent-provenance 학술 문헌을 1차로 확인했다.

## 1. Executive summary

- **이미 맞다.** run-report 템플릿이 채택한 4가지 원칙(① `readiness_source` 를 *소비*만 하고 재계산 금지, ② 경계 준수를 validate 통과가 아니라 **diff/해시**로 증명, ③ blocker 를 readiness 에서 *그대로* 전달, ④ 2차 실행 **빈 diff/byte 동일**로 멱등 표기)은 공급망 provenance 의 정통 분업(SLSA·in-toto)과 멱등 검증의 정통 패턴(reproducible builds, `git diff --exit-code`, IaC no-op plan)에 그대로 대응한다. 새 메커니즘을 발명한 게 아니라 **검증된 패턴을 소규모에 맞게 축약**한 것이다 [1][3][5][11][17].
- **provenance 의 핵심 통찰을 그대로 빌려라:** SLSA v1.0 은 "completeness/reproducible 를 별도 필드로 두지 않고 `builder.id` 가 함의한다"고 본다 [1]. 이 repo 에서 **`readiness_source` 포인터가 곧 `builder.id` 등가물**이다 — "이 판정을 신뢰한다, 재유도하지 않는다"를 한 줄로 고정한다. run-report 가 해야 할 일은 *판정을 다시 내리는 것*이 아니라 *어떤 판정을 봤는지를 가리키는 것*이다.
- **멱등 = "재생성 후 빈 diff"는 productized 된 정통 패턴이다.** reproducible builds(같은 소스→bit-for-bit 동일) [5], `git diff --exit-code`(차이 있으면 exit 1) [11][12], 이를 패키징한 `check-uncommitted-git-changes`(생성기 재실행 후 미커밋 변경 탐지) [9], IaC 의 no-op plan(현재상태=목표상태면 변경 0) [17][18] 이 전부 동일 계열이다. repo 의 Idempotency 섹션은 이 계열의 한 사례다.
- **휘발성 필드 정규화는 "비교 전에 반드시 한다"가 업계 상식이다.** SOURCE_DATE_EPOCH(타임스탬프를 고정 epoch 로 치환) [6][7], `strip-nondeterminism`(타임스탬프·UID·파일순서를 포맷별로 제거) [8], Jest snapshot serializer(`createdAt`→`[TIMESTAMP]` 치환) [10] — 모두 **필드 인지(field-aware) 정규화**다. `test-fixtures.mjs` 가 이미 하는 `generated_at`·경로 구분자 정규화가 정확히 이 패턴이며, 확장 시 **블라인드 byte 정규화가 아니라 알려진 휘발 필드만** 건드려야 한다(실제 drift 를 숨기지 않도록).
- **에이전트 행위 provenance 는 "trace 를 책임 아티팩트로 바꾸는 것"이다** [13]. 학술 모델(execution trajectory + typed relations: Support/Trigger/Depend-on …)은 run-report 의 인과 구조 — "이 실행이 **어떤 readiness 를 보고(input)** → **무엇을 바꿨고(diff ⊆ allowed)** → **왜 멈췄나(blocker 그대로)**" — 와 일치한다. 다만 repo 는 6종 trace 전체가 아니라 **결정 관련 슬라이스**만 남기면 된다(right-sized agent provenance).
- **결론적 권고: 서명·증명 인프라는 넣지 마라.** SLSA 는 all-or-nothing 이 아니며 L1(minimal provenance)이 이미 대다수 프로젝트를 앞선다 [16]. 단일 로컬 repo·단일 운영자·외부 소비자 부재라는 위협모델에서 Sigstore/cosign/DSSE/HSM 키관리는 **순수 마찰**이다. run-report 는 "SLSA L1 등가 + 휘발필드 정규화 + 빈-diff 멱등 witness"에서 멈춰야 한다.

## 2. Prior art & findings

### 2.1 빌드 provenance 표준이 요구하는 "최소 필드" (Q1)

**SLSA v1.0 Provenance predicate** 는 in-toto Statement 안에 들어가는 술어(predicate)이며 두 최상위 필드를 가진다 [1]:

- `buildDefinition`
  - `buildType` *(required)* — 빌드 템플릿/파라미터 해석 규칙 식별.
  - `externalParameters` *(required)* — 외부 통제 입력. "SLSA Build L3 에서 **완전(complete)** 해야 한다."
  - `internalParameters` *(optional)* — builder 통제 입력. 디버깅·사고대응·취약점관리 용도.
  - `resolvedDependencies` *(optional)* — 빌드 시점 입력 아티팩트(순서 무관). "완전성은 best-effort, L3 까지도."
- `runDetails`
  - `builder.id` *(required)* — 신뢰 빌드 플랫폼의 추이적 폐포(transitive closure)를 가리키는 URI.
  - `builder.builderDependencies` / `builder.version` *(optional)*.
  - `metadata.invocationId` *(optional)* — 특정 실행 인스턴스 식별.
  - `metadata.startedOn` / `finishedOn` *(optional)* — 실행 시각(휘발성).
  - `byproducts` *(optional)* — 빌드 중 생성된 부산물.

핵심 통찰 두 개:
1. **required 가 매우 적다.** L1 에서 사실상 `buildType` + `externalParameters` + `builder.id` 면 성립한다. 나머지는 등급이 올라갈 때 채운다 — *최소 충분 provenance 가 스펙에 내장*되어 있다.
2. **"completeness"·"reproducible"는 별도 필드가 아니라 `builder.id` 가 함의한다** [1]. 즉 "누가/무엇이 실행했나"라는 신뢰 포인터 하나가, 그 빌더가 보장하는 완전성·재현성을 대표한다.

**in-toto Attestation Framework** 는 4계층이다 [3][4]:
- **Statement** — 증거를 특정 **subject**(아티팩트 집합, 각 원소는 `digest` 필수, ResourceDescriptor)에 묶고 **predicateType**(TypeURI)으로 술어 의미를 명시.
- **Predicate** — `predicateType` *(required)* + 타입별 임의 메타데이터 객체 *(optional)*.
- **Envelope** — 인증·직렬화(DSSE 서명).
- **Bundle** — 여러 attestation 묶음.

여기서 repo 에 중요한 건 **subject.digest = "무엇에 대한 증거인가를 콘텐츠 다이제스트로 고정"**한다는 점(Statement) 과, **predicateType 이 곧 산출물의 종류 식별자**(run-report 의 `kind: "run-report"`)라는 점이다.

**에이전트 행위 provenance (applied/emerging).** 학술·업계 모두 빠르게 형성 중이다:
- *"From Agent Traces to Trust: Evidence Tracing and Execution Provenance in LLM Agents"* [13] — LLM 에이전트를 "답을 생성하는 모델"이 아니라 "**실행 궤적(execution trajectory)**을 만드는 시스템"으로 보고, 6종 trace(reasoning / retrieval / tool / memory / environment / multi-agent)를 **7가지 타입 관계**(Support 증거가 주장·행위를 정당화 / Derive 변환 / Depend-on 의존 / Contradict 충돌 / Invalidate 무효화 / Trigger 인과 촉발 / Update 상태변경)로 연결한다. 핵심 문장: *"provenance 구조는 trace 를 수동적 기록에서 **책임 아티팩트(accountability artifact)**로 바꾼다."* 하위 목적 6종: Verification·Attribution·Debugging·Safety·Audit·Recovery.
- *PROV-AGENT* [14] — W3C PROV 를 확장하고 MCP·데이터 관측성을 결합해 에이전트 상호작용을 end-to-end provenance 에 통합.
- 업계 audit-log 가이드 [15] — "단지 *무엇이 일어났나*가 아니라 *왜 에이전트가 그렇게 결정했나*까지, timestamp·개시 에이전트 identity/role·context/prompt·rationale 을 풍부한 메타데이터로 남겨 **decision provenance trail** 을 만들라." LangGraph checkpointer 류는 매 스텝 상태 스냅샷을 직렬화 저장.

**트레이드오프:** 이 모델들은 *완전한 관측성*을 지향한다(모든 tool call·token·latency). 소규모 repo 가 이를 통째로 들이면 "증거 수집 자체가 마찰"이 된다. repo 가 필요한 건 trajectory 전체가 아니라 **결정 슬라이스**(어떤 readiness→무슨 diff→왜 blocker)뿐이다.

### 2.2 멱등성 검증 + diff/hash 증거 (Q2)

- **Reproducible builds** [5]: "같은 소스·빌드환경·빌드지시가 주어지면 누구든 모든 지정 아티팩트의 **bit-by-bit 동일** 사본을 재생성할 수 있다." 동기는 "컴파일 과정에서 결함이 주입되지 않았음을 검증"하는 것.
- **`git diff --exit-code`** [11]: 차이가 있으면 exit 1, 없으면 0. 정통 CI 패턴 = "생성기(또는 포매터)를 CI 에서 돌린 뒤 `git diff --exit-code` 로 **no-op 이었는지** 확인 — 모든 자동생성 파일이 이미 커밋됐는지" [12]. `--quiet` 는 출력까지 억제하며 스크립트 중단에 쓴다.
- **`check-uncommitted-git-changes`** (PyPI) [9]: 위 패턴을 패키징. "생성기 실행 후 미커밋 변경이 없으면 exit 0(CI 계속), 있으면 exit 1(CI 실패)." 동기 실패모드 = "사람이 소스를 바꾸고 의존 산출물 재생성을 잊는 drift" — 멱등/재실행 체크가 잡아야 할 바로 그 위험.
- **IaC 멱등** [17][18]: Terraform 은 코드와 실제 상태를 비교해 *다를 때만* 행동 → 현재=목표면 `apply` 를 반복해도 변경 0(**no-op plan**). Ansible 은 현재상태를 점검해 필요할 때만 적용(changed=0). HashiCorp 이슈 #35534 는 "plan 에 변경이 없음(no changes)을 **명시적으로 단언**하는 멱등 검사"를 테스트 기능으로 노출하자는 논의 — *빈 diff 를 성공 신호로 어서트*하려는 정확한 수요다.
- **휘발성 필드 정규화(determinism)**:
  - **SOURCE_DATE_EPOCH** [6][7]: 배포판이 중앙에서 세팅하는 표준 환경변수. 빌드 도구는 "현재 시각" 대신 이 고정 epoch 값을 임베드 타임스탬프에 써서 결정성을 확보. 값은 소스에만 의존(deterministic)해야 한다.
  - **`strip-nondeterminism`** (Debian Reproducible Builds) [8]: 임베드 타임스탬프·UID·파일 순서 등 메타데이터를 제거. **포맷별(ZIP/JAR/PNG/gzip/ar)** 로 비결정 필드를 식별해 정규화 — 즉 **블라인드가 아니라 필드 인지** 정규화.
  - **Jest snapshot serializer** [10]: `test()`로 대상 객체 식별 + `serialize()`로 휘발 속성을 고정 placeholder 로 치환(`id`→`[ID]`, `createdAt`→`[TIMESTAMP]`). `expect.addSnapshotSerializer()`로 **단일 정규 hook** 등록 → 스냅샷은 값이 아니라 **구조**를 인코딩.

**공통 패턴 이름:** "**regenerate-then-empty-diff**"(재생성 후 빈 diff) + "**canonicalize-before-compare**"(비교 전 정규화). repo 의 멱등 절차는 전자, `test-fixtures.mjs` 의 정규화는 후자다.

### 2.3 최소 충분 vs 과설계 (Q3)

- **SLSA 는 점진적이다** [16]: "레벨 시스템의 요점은 작게 시작해 점진 개선." L1 = minimal provenance, 4~8주에 달성 가능하며 "대다수 프로젝트를 앞선다."
- **서명 모델의 비용** [16]: 키리스(Sigstore + OIDC workload identity)는 저장 키 없이 워크플로 정체성에 서명을 묶어 키관리 비용을 줄였다. 하지만 그조차 OIDC 발급자·투명성 로그·검증기라는 인프라를 전제한다. air-gap/주권클라우드는 HSM 보호 플랫폼 키를 쓴다 — *모두 외부 소비자가 운영자를 신뢰하지 않고 검증해야 할 때*의 비용이다.
- **마찰 임계점:** 서명·증명·키관리·투명성로그·envelope(DSSE)·digest 전수계산은 "운영자를 신뢰할 수 없는 다자 공급망"에서 정당화된다. 단일 로컬 repo 에서는 이 전부가 ROI 음수다. 핵심 분기 질문: **"이 증거를, 운영자를 불신하는 제3자가 검증할 일이 있는가?"** — 없으면 서명 계층은 과설계다.

## 3. Recommendation for k-frontend-workflow

repo 맥락으로 매핑하면:

1. **`readiness_source` = `builder.id` 등가물로 못박는다.** SLSA 가 completeness/reproducible 를 `builder.id` 로 함의하듯, run-report 는 "이 실행이 신뢰한 판정 출처"를 `readiness_source` 한 줄로 가리키고 **재유도하지 않는다**. 이건 이미 템플릿에 있다 — 강화 포인트는 "재계산 금지"를 *증거 모델의 1순위 원칙*으로 격상하는 것.

2. **subject.digest 의 소규모 대체 = Diff Summary 라벨.** in-toto 는 "무엇에 대한 증거인가"를 콘텐츠 다이제스트로 고정한다. repo 는 md 중심·사람 리뷰 중심이므로 **byte digest 대신 ADDED/MODIFIED/REMOVED 라벨 + 완전 빈 diff 명시**가 적정 대체다. 단, 원하면 변경 파일 SHA-256 을 *nice-to-have* 로 병기할 수 있다(§4.3).

3. **멱등 체크 = regenerate-then-empty-diff witness.** `workflow:state/readiness/validate` 재실행 후 `git diff --exit-code` 로 빈 diff 를 어서트하고, 허용 재생성 범위(`_meta/*.yaml`)는 `generated_at`·경로 구분자를 **정규화 후** 비교한다. 이건 reproducible builds + IaC no-op plan + `check-uncommitted-git-changes` 를 `test-fixtures.mjs` 가 이미 가진 정규화 위에 얹는 것 — 새 도구 0.

4. **에이전트 provenance 는 "결정 슬라이스"만.** 학술 모델의 풀 trajectory 대신 run-report 는 Trigger 관계 하나 — "**readiness blocking 이 빈-diff 거절을 촉발했다**" — 를 인과로 남긴다. 이게 "what the agent saw and did, and why"의 right-sized 버전이다.

5. **거절(빈 diff)을 1급 성공으로.** IaC no-op plan 이 성공이듯, `requested_mode > readiness_mode`·docs-only cap 으로 인한 빈 diff 는 **PASS**다. 증거 모델은 "변경 없음 = 실패"로 읽히지 않게 설계해야 한다(§5).

## 4. Concrete deliverable

### 4.1 run-report 증거 스키마 정제 + SLSA/in-toto 대응표

기존 템플릿 필드를 유지하되, 각 필드의 **증거 의미**를 provenance 표준에 대응시켜 고정한다.

| run-report 필드/섹션 | 증거 의미 | SLSA/in-toto 대응 | required? | 비고 |
|---|---|---|---|---|
| `kind: "run-report"` (frontmatter) | 산출물 종류 식별 | in-toto `predicateType` (TypeURI) [3] | **must** | 고정 타입 |
| `run_id` | 실행 인스턴스 식별 | `runDetails.metadata.invocationId` [1] | **must** | 1:1 |
| `packet_id` (mode 포함) | 실행 봉투/모드 | `buildDefinition.buildType` [1] | **must** | requested/readiness mode |
| `readiness_source` | 신뢰한 판정 출처 포인터 | `runDetails.builder.id` (완전성 함의) [1] | **must** | **재계산 금지** — 등가물 |
| `fixture` (입력 복사본) | 외부 통제 입력 | `buildDefinition.externalParameters` [1] | **must** | 원본 무수정 |
| **Readiness Used** (`allowed/forbidden_paths`, `blocking`) | 빌드 입력 아티팩트 | `buildDefinition.resolvedDependencies` [1] | **must** | readiness 출력 *소비* |
| **Files Changed** + **Diff Summary** | 증거 대상 + 경계 | in-toto `subject[]`(라벨이 digest 대체) [3] | **must** | 빈 diff = "완전 빈 diff" 명시 |
| **Gate Compliance** (4행) | 완전성/경계 준수 | SLSA "completeness"(builder.id 함의) [1] | **must** | files ⊆ allowed 교차검증 |
| **Blockers Reported** | 중단 사유(인과) | agent provenance `Trigger` 관계 [13] | **must** | readiness `blocking`/`next_actions` 그대로 |
| **Idempotency** (2차 빈 diff·byte 동일) | 재현성 witness | reproducible build [5] + no-op plan [17] | **must** | 정규화 후 비교 |
| **Commands Run** (+ exit codes) | 부산물 | `runDetails.byproducts` [1] | nice | validate/test exit 기록 |
| `date` / 실행 시각 | 실행 시각(휘발) | `metadata.startedOn/finishedOn` [1] | nice | **멱등 비교 시 정규화 대상** |
| 변경 파일 SHA-256 | 콘텐츠 다이제스트 | in-toto `subject[].digest` [3] | nice | 라벨로 충분; 원하면 병기 |
| 서명/attestation envelope | 위변조 방지 | in-toto Envelope(DSSE)/Sigstore [16] | **skip** | 단일 repo 위협모델 밖 |

**교차검증 규칙(필수, 자동화 가능):**
```
RULE files-changed ⊆ allowed_paths:
  for f in (git diff --name-only):
    assert any(match(f, p) for p in readiness.allowed_paths)
    assert not any(match(f, p) for p in readiness.forbidden_paths)
  # 위반 1건이라도 → Gate Compliance "readiness gate 무시 금지" 행 FAIL
RULE empty-diff-is-valid:
  if requested_mode > readiness_mode OR readiness_mode in {docs-only, route-skeleton (구현요청)}:
    expected_diff = EMPTY        # 거절이 정답
    assert git diff == EMPTY → PASS (NOT fail)
RULE blockers-verbatim:
  Blockers Reported == readiness.blocking ∪ readiness.next_actions   # 자체 추론 0
```

### 4.2 멱등성 자동 체크 설계 (runner 절차)

`run-report.mjs`(또는 `test-fixtures.mjs` 의 멱등 모드)가 수행할 절차. **판정 재구현 0** — `buildState`/`computeReadiness` 를 import 소비하고 `validate` 는 서브프로세스(`--json`)로 실제 출력만 스냅샷한다(`test-fixtures.mjs` 와 동일 규약).

```bash
# ── 전제: 1차 실행이 끝났고 워킹트리는 1차 산출물 상태(S1) ──

# 1) 1차 산출물 스냅샷 (정규화 전 원본 보존)
SNAP1=$(git stash create) || true        # 또는 트리 해시 기록

# 2) 재생성 명령만 재실행 (소스 무수정 — 허용 재생성 범위만 건드림)
npm run workflow:state        # → _meta/workflow-state.yaml, screen-inventory.yaml 재생성
npm run workflow:readiness    # → readiness JSON (R2)  ※ 표준출력 캡처
npm run workflow:validate     # → exit code 기록 (byproduct)

# 3) 전체 트리 빈-diff 어서트 (regenerate-then-empty-diff)
git diff --exit-code          # exit 0 기대 = 완전 빈 diff
#   ↑ 실패(exit 1)면 변경 발생 → 단, 다음 4)의 정규화로 휘발 필드만 다른지 분리
```

```js
// 4) 구조화 비교 (canonicalize-before-compare) — test-fixtures.mjs 정규화 재사용
function normalize(obj) {
  // 알려진 휘발 필드만 (블라인드 금지 — 실제 drift 를 숨기지 않도록)
  return stripVolatile(obj, {
    drop: ['generated_at'],                 // SOURCE_DATE_EPOCH 식: 휘발 타임스탬프 제거/고정
    pathSep: '/',                            // OS 경로 구분자 통일
  }); // CRLF 무관 (파싱 기준 비교)
}
assert(deepEqual(normalize(R1), normalize(R2)));   // readiness JSON byte 동일(정규화 후)

// 5) 판정
//   완전 빈 diff(정규화 후 잔차 0) + R1≡R2 + validate exit 0  → 멱등 PASS
//   거절 케이스(빈 diff가 애초에 정답)                         → 멱등 PASS (동일 경로)
//   소스/구현 파일에 diff 발생                                 → 멱등 FAIL
//   휘발 필드만 diff (정규화로 사라짐)                          → PASS (단 정규화 누락이면 설정오류로 분리)
```

**허용 재생성 범위 명세(화이트리스트):**
```yaml
idempotency:
  regenerate_only:        # 재실행이 건드려도 되는 경로 (정규화 후 빈 diff여야)
    - "_meta/*.yaml"      # workflow-state, screen-inventory
  source_must_be_untouched: true     # examples 원본·src 무수정
  volatile_fields:        # 정규화 대상 (이 외 차이는 진짜 drift)
    - "generated_at"
  empty_diff_is_success: true        # 거절/무변경 = PASS
```

핵심: 3)의 `git diff --exit-code` 는 reproducible-builds / `check-uncommitted-git-changes` 패턴 그대로 [9][11], 4)의 정규화는 `strip-nondeterminism` / Jest serializer 패턴 그대로 [8][10], `volatile_fields` 의 `generated_at` 고정은 SOURCE_DATE_EPOCH 식 [6].

### 4.3 증거 충분/과잉 경계 가이드 (must / nice / skip)

이 repo 규모(단일 로컬 repo·단일 운영자·외부 검증자 부재)에서:

**MUST — 반드시 (≈ SLSA L1 "minimal provenance"):**
- `readiness_source` 소비(재계산 금지) — `builder.id` 등가물.
- Files Changed ⊆ `allowed_paths` 교차검증 + forbidden 침범 0.
- Diff Summary(ADDED/MODIFIED/REMOVED) — **완전 빈 diff 를 명시적으로 표기**.
- Gate Compliance 4행(✅ + 검사ID/diff 인용).
- Blockers Reported = readiness `blocking`/`next_actions` **그대로**.
- Idempotency: 2차 재생성 후 빈 diff + readiness 정규화 byte 동일 + validate exit 0.

**NICE — 선택(상황 따라 가치 있음):**
- 변경 파일 **SHA-256 digest** 병기(in-toto subject.digest 식) — 다자 리뷰·장기 보관 시.
- Commands Run **exit code 테이블**(byproduct).
- `invocationId`/runner version stamp — `run_id` 외 추가 식별.
- 거절 사유의 readiness 인용 블록 재현.

**SKIP — 과설계(이 repo 위협모델 밖):**
- 암호 서명: **Sigstore/cosign**, DSSE **Envelope**, OIDC 키리스 attestation [16].
- SLSA **L3** hermetic/isolated builder, signed provenance distribution.
- 키관리/**HSM**, 투명성 로그.
- 모든 tool call/token/latency 전수 trace(풀 agent-observability) — 결정 슬라이스로 충분.
- 블록체인/머클트리 등 콘텐츠 주소 저장소.

> 분기 기준 한 줄: **"이 증거를, 운영자를 불신하는 제3자가 독립 검증할 일이 있는가?"** → 없으면 SKIP.

## 5. Invariant safety check

| 불변식 | 본 설계의 준수 여부 |
|---|---|
| Run Report ≠ 사람 승인, readiness 재계산 금지 | ✅ `readiness_source` 를 `builder.id` 등가 *포인터*로만 소비. §4.2 의 멱등 체크는 readiness 를 **재실행하되 재판정하지 않는다** — `computeReadiness` 출력을 byte 비교하는 *회귀 witness*일 뿐(이미 `test-fixtures.mjs` 가 하는 방식). 새 판정·승인 0. |
| 거절(빈 diff)이 정답인 케이스를 실패로 보고 금지 | ✅ §4.1 `empty-diff-is-valid` 규칙 + §4.2 5) 판정 + §4.3 `empty_diff_is_success: true` 로 **빈 diff = PASS** 를 3중 명시. IaC no-op plan 이 성공이라는 선행사례로 보강 [17][18]. |
| 증거는 diff/해시 — validate 통과를 경계 증거로 둔갑 금지 | ✅ 경계 준수는 **Diff Summary + files⊆allowed 교차검증**으로 증명. validate exit 0 은 `byproducts`(nice)로만 기록, "경계 준수 증거" 칸에 넣지 않음. SLSA 도 "빌드도구가 통과"가 아니라 "아티팩트 digest"를 증거로 둠 [1]. |
| LLM 은 Open Decision/Unknown/Conflict close, candidate→confirmed 승격 안 함 | ✅ Blockers 는 readiness 에서 **verbatim 전달**(자체 추론 0). run-report 는 blocker 를 *닫지 않고 가리키기*만 함 — agent provenance 의 Trigger 관계 기록일 뿐 resolve 아님 [13]. |
| 새 산출물 축 금지 — 기존 Work Packet & Review Artifacts 안 | ✅ 전부 **기존 run-report 템플릿 필드 정제 + 얇은 runner 체크**. 새 canonical 문서·새 게이트·새 artifact_type 0. |

**긴장 지점(명시):** §4.2 가 readiness 를 *재실행*한다는 점이 "재계산 금지"와 표면상 충돌해 보일 수 있다. 구분선: **재실행(re-run for witness) ≠ 재판정(re-judge for gate)**. 멱등 체크는 "같은 입력이 같은 판정을 내는가?"를 묻는 회귀 검사이고, 그 출력을 **게이트로 쓰지 않는다**(머지 차단 X). 이 선을 넘어 "멱등 재실행 결과로 readiness 를 덮어쓰거나 머지를 막으면" 새 게이트가 되어 불변식 위반이다 → §6·§7 참조.

## 6. Risks / trade-offs / what NOT to do

- **과(過)정규화로 진짜 drift 은폐.** 휘발 필드를 블라인드로 싹 지우면 실제 변경이 "휘발"로 위장될 수 있다. `strip-nondeterminism` 이 포맷별 필드 인지인 이유다 [8]. → **화이트리스트(`generated_at`, 경로 구분자)만** 정규화. 미지의 차이는 *설정 오류*로 분리해 표면화(`test-fixtures.mjs` 의 xdrift 정신).
- **digest 만능주의 유혹.** 모든 변경 파일 SHA-256 전수계산은 md 중심·사람 리뷰 repo 에서 *가독성*을 떨어뜨리고 "증거 수집이 마찰"이 되는 임계를 넘긴다. → 라벨(ADDED/MODIFIED/REMOVED)이 1차, digest 는 nice.
- **멱등 PASS = 완료라는 착각(Track 05 연결).** 빈 diff 는 *결정성·경계 준수*를 증명할 뿐 **제품적 정확성**을 증명하지 않는다. "멱등 PASS"가 "통과=완료"의 새 변종이 되지 않게, run-report 는 "이건 사람 승인이 아니다"를 계속 명시해야 한다(notes/02 §10).
- **멱등 재실행을 게이트화하지 말 것.** §5 긴장 지점 — witness 가 머지 차단 게이트가 되는 순간 불변식 위반. warning-first 로 두고 `--enforce` 류로만 hard 화(forbidden-paths 선례).
- **SLSA-maximalism 금지.** 서명·attestation·키리스 OIDC 를 "보안에 좋으니까" 넣는 건 이 repo 에선 순수 마찰이다 [16]. 위협모델(외부 불신 검증자)이 생기기 전엔 SKIP.
- **agent-observability 통째 이식 금지.** 6종 trace·전 tool call·token·latency 풀 캡처 [13][15] 는 좋은 디버깅 자산이지만 run-report 의 목적(결정 슬라이스 증거)을 넘어 비용·노이즈가 된다. → 결정 관련 trace(readiness→diff→blocker)만.

## 7. Open questions for synthesis

1. **digest 병기 여부:** 변경 파일 SHA-256 을 Diff Summary 에 넣을지(nice→must 승격?), 아니면 종합 PR 까지는 라벨만으로 갈지. (Track 06 실행봉투 선행사례와 함께 결정)
2. **`builder.id` 등가물의 범위:** `run_id` + skill 이름으로 충분한가, runner version stamp 까지 필요한가? (재현 시 "무엇이 실행했나"의 해상도)
3. **정규화 레지스트리의 위치:** 휘발 필드 정규화를 Jest `addSnapshotSerializer` 식 **단일 hook** 으로 둘지(권장), 아니면 필드별 ad-hoc 으로 둘지. 미래 생성기가 새 휘발 필드를 임베드할 때의 확장 지점.
4. **멱등 체크의 소속:** `run-report.mjs`(runner) vs `test-fixtures.mjs`(회귀 하니스) — 둘이 겹친다. witness 는 후자, 보고는 전자로 분리할지.
5. **거절 케이스의 멱등 의미:** 빈 diff 가 "정답"인 거절 실행에서 멱등은 자명(빈→빈)하다. 이 경우 Idempotency 섹션을 "N/A(거절)"로 둘지, "trivially 멱등"으로 명시할지.
6. **불변식 #4(Investigation/Verification)와의 접점:** run-report 의 byproducts(validate/test 출력)가 verification evidence handoff 와 어떻게 연결되는지 — 별도 트랙(03/06)과 교차.

## 8. Sources

1. SLSA • Provenance (v1.0) — https://slsa.dev/spec/v1.0/provenance
2. SLSA • Software attestations (attestation model) — https://slsa.dev/attestation-model
3. in-toto Attestation Framework — Statement spec (v1) — https://github.com/in-toto/attestation/blob/main/spec/v1/statement.md
4. in-toto Attestation Framework — Predicate spec (v1) — https://github.com/in-toto/attestation/blob/main/spec/v1/predicate.md
5. Reproducible Builds — Definitions — https://reproducible-builds.org/docs/definition/
6. SOURCE_DATE_EPOCH — specification — https://reproducible-builds.org/specs/source-date-epoch/
7. SOURCE_DATE_EPOCH — docs — https://reproducible-builds.org/docs/source-date-epoch/
8. strip-nondeterminism (Debian Reproducible Builds tool) — https://linuxcommandlibrary.com/man/strip-nondeterminism
9. check-uncommitted-git-changes (PyPI) — https://pypi.org/project/check-uncommitted-git-changes/
10. Remove dynamic values from snapshot with serializers (dev.to / zirkelc) — https://dev.to/zirkelc/remove-dynamic-values-from-snapshot-with-serializers-1857
11. Git — git-diff documentation (`--exit-code`) — https://git-scm.com/docs/git-diff
12. git diff has a quiet flag to halt a script if a file was updated (Nick Janetakis) — https://nickjanetakis.com/blog/git-diff-has-a-quiet-flag-to-halt-a-script-if-a-file-was-updated
13. From Agent Traces to Trust: Evidence Tracing and Execution Provenance in LLM Agents (arXiv) — https://arxiv.org/html/2606.04990
14. PROV-AGENT: Unified Provenance for Tracking AI Agent Interactions in Agentic Workflows (arXiv) — https://arxiv.org/pdf/2508.02866
15. AI Agent Audit Logs: Full Visibility Over Tool Usage (Maxim) — https://www.getmaxim.ai/articles/ai-agent-audit-logs-full-visibility-over-tool-usage/
16. SLSA Provenance Part 3: Adoption Challenges (Legit Security) — https://www.legitsecurity.com/blog/slsa-provenance-blog-series-part3-challenges-of-adopting-slsa-provenance
17. What is Idempotency in Terraform and Ansible (AWS in Plain English) — https://aws.plainenglish.io/what-is-idempotency-in-terraform-and-ansible-ebc2ef2e4234
18. Terraform: consider exposing a way to ensure idempotency (no changes in plan) — Issue #35534 — https://github.com/hashicorp/terraform/issues/35534
