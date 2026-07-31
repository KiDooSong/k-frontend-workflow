# Input Provenance / Fidelity + Figma Mapping Provenance Contract

> 상태: implemented draft  
> 대상: Issue #202-B + Issue #209  
> 기준: Reconciliation Contract v2와 Mapping Provenance 구조는
> [`issue-202-reconciliation-contract-v2.md`](issue-202-reconciliation-contract-v2.md)가 소유한다.
> 이 문서는 input `captured_at` hard rollout, Input Fidelity Contract v2,
> shared input-evidence/index helper, producer/validator 경계와 migration을 소유한다.

## 1. 결론

세 계약은 서로 독립이다.

| 계약 | 필드 | 책임 |
|---|---|---|
| Input Fidelity Contract v2 | `input_contract: 2` | 원본→canonical input 전사·대조 상태 |
| Reconciliation Contract v2 | `reconciliation_contract: 2` | Stage 04 item/effect/routing/provenance. 의미 변경 없음 |
| Figma Mapping Provenance v1 | `provenance_contract: 1` | Component Mapping M-key와 source/evidence의 1:1 계약 |

하나의 공통 `version`이나 `mapping_contract`로 합치지 않는다.

- 모든 canonical input의 `captured_at`은 contract opt-in과 무관하게 RFC3339 with timezone hard 계약이다.
- `input_contract`가 없으면 v1이다. Validator는 `fidelity`가 수동으로 있더라도 v2로 추론하지 않는다.
- Producer payload에 `fidelity`가 있으면 `input_contract: 2`를 명시해야 한다. 잘못된 v2 payload는 write 전 hard reject한다.
- Validator check 11의 IF-1xx는 첫 rollout에서 warning-first이며 `--enforce`로 승격하지 않는다.
- `provenance_contract`가 없는 mapping은 legacy이며 M-key/Mapping Provenance 진단을 전혀 내지 않는다.
- `provenance_contract: 1` mapping의 MP-0xx는 hard, MP-1xx는 warning-first다.
- Mapping 검사는 Reconciliation Register의 존재나 버전과 독립적으로 check 12에서 실행한다.

## 2. 책임 축 분리

### 2.1 `confidence`

입력 내용 또는 의사결정의 확신도다.

```yaml
confidence: candidate
```

### 2.2 `fidelity`

원본이 canonical input으로 어떤 방식으로 전사됐고 무엇과 대조됐는지다.

```yaml
input_contract: 2
fidelity:
  extraction: vision-verbatim
  verification: verified
  verified_against: raw_artifact:planning/login-crop.png
  unreadable_count: 0
```

### 2.3 provenance

사실이 어디에서 왔는지 재추적하기 위한 source pointer, source unit, capture timestamp,
evidence pointer다. Reconciliation item과 Mapping Provenance가 이 축을 사용한다.

세 축은 서로 자동 전이하지 않는다.

- `verification: verified`여도 `confidence: candidate`일 수 있다.
- fidelity가 `status`, Reconcile Status, readiness mode를 자동 변경하지 않는다.
- Producer/validator가 confidence를 추론하거나 승격·강등하지 않는다.

## 3. `captured_at` hard 계약

정본 parser는 `scripts/lib/provenance.mjs`의 `isRfc3339()`다. 검사 11,
Reconciliation item, Mapping Provenance가 같은 parser를 사용한다.

허용 예:

```txt
2026-07-30T10:00:00+09:00
2026-07-30T01:00:00Z
2026-07-30t01:00:00.123z
```

거부 예:

```txt
2026-07-30
2026-07-30T10:00:00
2025-02-29T00:00:00Z
2026-07-30T24:00:00Z
2026-07-30T10:00:60Z
```

- 문자열이어야 한다.
- timezone이 반드시 있어야 한다.
- 월/일/시/분/초/offset의 실제 범위를 검증한다.
- date-only, local datetime, invalid calendar date, `24:00:00`, leap second를 거부한다.
- 검사 11은 `IP-001` hard error를 낸다.
- Producer는 caller 값이 invalid이면 input ID 생성·디렉터리 생성·파일 쓰기 전에 거부한다.
- `--captured-at=`와 빈 다음 인자는 usage error exit 2다. 앞의 malformed duplicate가 뒤 값에 가려지지 않는다.

이는 fidelity v1/v2와 별개인 canonical required field 정밀화다. 정상 timestamp를 가진 v1 입력은
fidelity 진단 없이 유지되고, invalid legacy timestamp는 이번 rollout부터 의도적으로 실패한다.

## 4. Input Fidelity Contract v2

### 4.1 Opt-in과 version

- 필드 없음 → v1.
- writer는 숫자 `2`를 쓴다.
- reader는 숫자 `2`와 정확한 문자열 `"2"`만 읽기 호환한다.
- unsupported/null/boolean 값은 validator IF warning, producer hard reject다.
- `fidelity`가 있어도 `input_contract`가 없으면 validator는 무발화한다.
- Producer는 inert metadata가 생기지 않도록 fidelity-without-version을 거부한다.

### 4.2 Shape

필수 key:

- `extraction`
- `verification`
- `unreadable_count`

조건부 key:

- `verified_against`

그 외 key는 validator warning, producer hard reject다.

`extraction` enum:

```txt
direct-text
vision-verbatim
structured-source
manual-transcription
inherited
```

`verification` enum:

```txt
unverified
verified
inherited
not-applicable
```

`unreadable_count`는 0 이상의 실제 정수다. 문자열 숫자, 소수, null, boolean을 coercion하지 않는다.
Producer는 값을 꾸며내지 않으며 direct-text도 caller가 명시적으로 `0`을 제공한다.

### 4.3 Verification 관계

`verification: verified`:

```yaml
verified_against: raw_artifact:<pointer>
```

`<pointer>`는 현재 frontmatter `raw_artifacts` 배열의 non-empty string과 exact match여야 한다.
경로 정규화, 파일 존재 확인, 네트워크 fetch는 하지 않는다.

`verification: inherited`:

```yaml
extraction: inherited
verified_against: input:<input_id>
```

- target은 inputs/**에서 유일하게 해소돼야 한다.
- self-reference와 duplicate ID ambiguity를 거부한다.
- target도 well-formed `input_contract: 2`여야 한다.
- chain은 cycle이 없어야 하고 최종적으로 `verification: verified`에 도달해야 한다.
- terminal의 raw artifact evidence도 local shape 검증을 통과해야 한다.
- timestamp나 input ID 날짜로 과거/미래 순서를 강제하지 않는다.

`verification: unverified|not-applicable`:

- `verified_against`는 생략 또는 null만 허용한다.
- non-empty evidence를 남겨 verified처럼 보이게 하지 않는다.

### 4.4 Severity

| 표면 | 잘못된 v2 fidelity |
|---|---|
| `workflow:create-input` | write 전 `InputProducerError` hard reject |
| `workflow:validate` check 11 | IF-1xx warning-first |
| `--enforce` | IF warning을 hard로 승격하지 않음 |

향후 hard 승격은 dogfood evidence와 사람 decision을 거치는 별도 변경이다.

### 4.5 Producer rendering

- v2는 `--from-json`/`--from-yaml` structured payload에서만 opt-in한다.
- flat CLI는 계속 v1 input을 생성한다.
- 기존 v1 frontmatter를 YAML library로 재직렬화하지 않는다.
- v1 field order/quoting/body를 보존한다.
- v2 필드만 deterministic nested block으로 추가한다.
- `input_contract`와 `unreadable_count`는 숫자로 렌더된다.
- dry-run과 실제 write가 같은 검증을 사용한다.

## 5. Shared input evidence/index helper

`provenance.mjs`가 다음을 단일 출처로 제공한다.

- `input:<input_id>#<section-slug>[/NN]` grammar
- 1-based bullet index (`/00` 거부)
- input ID → 모든 artifact occurrence를 보존하는 index
- missing / unique / ambiguous 해소
- CommonMark/GFM AST 기반 실제 H2 section과 list item count
- fenced code/HTML comment 안의 가짜 section 무시

Reconciliation Items와 Mapping Provenance는 이 helper를 공유한다. duplicate ID에서 first-wins하지 않는다.
본문 section parse는 index cache를 사용하고 새 recursive walk를 만들지 않는다.

## 6. Figma Mapping Provenance 구현 clarification

구조 정본은 기존 #202 설계 §10이다.

- frontmatter: `provenance_contract: 1`
- 기존 Component Mapping 4컬럼 header 유지
- 첫 셀 맨 앞 canonical key: `` `M-001` · ... ``
- 정확한 5컬럼 `## Mapping Provenance`
- M-key와 provenance row의 완전한 bijection
- Source Ref / Source Unit / Captured At / Evidence 분리
- `record` = API/domain data record, `instance` = Figma component instance
- `## Provenance` marker legend는 별도 설명 섹션이며 machine table로 파싱하지 않음

추가 구현 결정:

- mapping version이 없으면 완전 무발화한다.
- version이 명시됐지만 malformed/unsupported이면 MP hard다.
- `Source Ref=inherit`와 `Captured At=inherit`은 같은 행 Evidence input에서 각각 해소한다.
- direct Source Ref + inherited timestamp 조합을 허용한다.
- Evidence input missing/duplicate/section missing은 hard, bullet out-of-range는 MP warning이다.
- explicit Figma file/frame token의 명백한 모순만 conservative warning으로 낸다. fuzzy guess와 network 검증은 하지 않는다.
- Reconciliation Register 없음/v1/v2와 무관하게 opted-in mapping을 검사한다.

## 7. Migration

### 7.1 Input

1. 먼저 모든 `captured_at`을 RFC3339+timezone으로 정리한다.
2. fidelity가 필요한 새 입력만 `input_contract: 2`로 opt-in한다.
3. 기존 prose caveat는 구조화 필드로 옮기되, 원문 사실 설명 자체가 필요하면 body에도 유지할 수 있다.
4. inheritance를 사용할 때 target chain이 unique v2 verified terminal로 끝나는지 확인한다.
5. confidence/status를 자동 변경하지 않는다.

### 7.2 Mapping

기존 mapping은 자동 backfill하지 않는다. opt-in할 때 한 edit에서 원자적으로 추가한다.

1. `provenance_contract: 1`
2. 모든 Component Mapping row의 M-key
3. 모든 M-key의 Mapping Provenance row

contract field만 먼저 추가한 half-migrated 문서는 hard fail한다. 확인하지 못한 node/unit/time을 발명하지 않는다.

## 8. 비목표

- #202-C 자연어 routing heuristic
- stale Result/child-status warning
- raw source 수집기나 Figma API/MCP/REST 호출
- source 진위·node 실재 네트워크 검증
- confidence/status/readiness 자동 전이
- decision resolve, Unknown/Conflict close, Gap accept, confirmed 승격
- 새 numbered check, 새 readiness fact/mode, CI required-check 승격
- 기존 mapping 전체 자동 migration

## 9. 완료/잔여

이번 slice가 완료하면 #209는 닫을 수 있다. #202는 다음이 남아 열린 상태를 유지한다.

- 202-C warning-only semantic heuristics
- stale Result/child-status warning
- dogfood에서 review round 감소와 false-positive evidence 확인
