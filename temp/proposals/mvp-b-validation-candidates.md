# MVP-B 검증 기능 후보 — 비교 및 도입 순서 제안

> 스냅샷: 2026-06-13. **설계 제안 초안일 뿐 구현이 아니다** — 이 세션의 산출물은 이 문서 하나다.
> scripts/schema/package.json/기존 docs 는 건드리지 않는다. 각 후보의 실제 착수는 명시적으로 하나를 고를 때만.
> 함께 읽을 것: [roadmap-current.md](../../frontend-workflow-kit/roadmap-current.md) ·
> [open-decisions.md](../../frontend-workflow-kit/open-decisions.md) ·
> [input-reconciliation.md](../../frontend-workflow-kit/input-reconciliation.md) ·
> 기존 후보 초안 [work-packet-review-artifacts-proposal.md](../work-packet-review-artifacts-proposal.md)

> **2026-06-13 코덱스 리뷰 + 사용자 결정 반영:**
> ① 도입 순서를 **5 → 3 → 4 → 6 → 1 → 2** 로 확정(원안 대비 후보 1↔4 교체 — 후보 4 는 설계 선결 없이 즉시 구현 가능, 후보 1 은 `linked_schema` 규약 선결).
> ② 후보 4 의 **정본(canonical) 입력 schema 결정 — fixture/template 기준 flat frontmatter** (아래 후보 4 "정본 스키마" 표 참조). 더 이상 미해소 결정이 아니다.
> ③ 후보 3 에 도메인-경로↔복수-화면 오탐원 1건 보강, 후보 4 에 입력 템플릿(`templates/input/input-artifact.template.md`) 근거 추가.
> 코덱스 리뷰는 기준선 주장(검사 8 존재-only / 검사 4 정규식 / readiness 단일출처 / `_meta`·`artifact_type` walk 제외)을 코드 대조로 모두 confirm 했다.

## 목적

MVP-A 이후(MVP-B)에 추가할 **검증 기능 후보 6종**을 같은 기준으로 비교하고, 어떤 순서로 구현할지 제안한다.
MVP-A 의 게이트는 이미 동결돼 있다 — 이 후보들은 **새 축을 만들지 않고** 기존 게이트(validate 9종 / readiness 다운그레이드)를 **강화**하거나, 그 강화를 안전하게 만드는 **테스트 인프라**다.

## 0. 기준선 — 지금 무엇이 있고 무엇이 비어 있나

후보를 읽기 전에 강화 대상이 되는 현재 코드 구조를 고정한다.

```txt
workflow-state.mjs   frontmatter+본문 → _meta/workflow-state.yaml · screen-inventory.yaml (파생값 단일 계산)
readiness.mjs        readiness_mode = min(fact_mode, decision_cap)   ← MVP-A 의 실제 게이트(판정 단일 출처)
validate.mjs         검사 9종, exit 0/1                               ← CI 게이트
lib/spec.mjs         ScreenSpec 파서(표/섹션) + deriveMetrics — state·validate 가 공유
```

현재 validate 9종 (validate.mjs 헤더):

```txt
1 frontmatter ↔ schema           2 manifest 필수 frontmatter / 경로     3 끊어진 참조(depends_on·sources)
4 Interaction Matrix 이동 route 존재  5 screen_id·route 중복            6 생성물 GENERATED 헤더/마커
7 confirmed 승인 메타(approved_by 등)  8 confirmed API → zod/OpenAPI "존재"  9 Open Decisions 형식
```

이 후보들이 정조준하는 **현재의 구멍**:

```txt
검사 8       confirmed API 가 있으면 src/api/schemas/*.ts 또는 openapi.yaml 의 "존재"만 본다.
             어떤 엔드포인트가 어떤 스키마로 뒷받침되는지는 아무도 안 본다.   → 후보 1
검사 4       Result 컬럼(자연어·route 혼재)에서 정규식으로 첫 `/토큰`만 뽑아 검사. 깨지기 쉽다. → 후보 2
forbidden    readiness 의 forbidden_paths 를 "넘은 변경"을 잡는 backstop 이 없다(트리 스캔은 오탐). → 후보 3
inputs/      입력 결과물은 artifact_type 이 없어 validate 가 통째로 건너뛴다 — input_id 조차 검사 안 함. → 후보 4
expected-*   골든 예제의 expected-*.md 는 손으로 "검증됨" 표기만 — 매 변경마다 재검증하는 장치가 없다. → 후보 5
_meta/recon  Reconciliation Register 는 _meta/ 라 validate 가 제외 — 미처리/stale 입력을 아무도 안 잡는다. → 후보 6
```

**평가 기준** (각 후보 공통으로 채운다): 왜 중요한가 · 막는 환각/drift · 필요한 입력 파일 · 기대 출력 · 오탐 위험 · MVP 구현 규모 · 권장 테스트 fixture · 어디에 사는가(validate.mjs / readiness.mjs / 별도 스크립트).

규모 표기: **S** ≈ 50–80 LOC, **M** ≈ 100–200 LOC, **L** = 코드는 작아도 **마이그레이션 blast-radius 가 큼**(템플릿/예제 전수 수정).

---

## 후보 1 — API Candidates(confirmed) ↔ zod/OpenAPI 스키마 1:1 매칭

**왜 중요한가.** `api-integrated-ui` 진입의 핵심 fact 는 `api_confidence_min == confirmed` 다(policy). 즉 "API 가 confirmed 다"가 모드 사다리 상단을 여는 열쇠인데, 현재 validate 검사 8 은 **스키마 소스가 하나라도 존재하면** 통과시킨다. confirmed 라고 적힌 엔드포인트가 실제로 스키마로 뒷받침되는지는 검사하지 않는다. roadmap 이 명시적으로 MVP-B 강화 대상으로 지목한 항목이다(roadmap-current.md "Tier 1 강화", line 77).

**막는 환각/drift.** LLM 이 `- GET /coupons/{id} (confidence: confirmed)` 라고 써 게이트를 열어 놓고, 정작 `src/api/schemas/` 에는 그 엔드포인트의 zod 스키마가 없는 상태. 불변식 4("사실의 단일 출처: zod=코드")가 문서에서만 confirmed 이고 코드엔 없는 채로 `api-integrated-ui` 가 열리는 fail-open 을 막는다.

**필요한 입력 파일.**
- 각 `screen-spec.md` 의 `## API Candidates` (이미 `parseApiCandidates` 가 method/path/confidence 파싱).
- `api/api-manifest.md` 의 `## Endpoints` 표 (`| Method | Path | … | confidence |`) — 현재 **파서 없음**(신규).
- `src/api/schemas/*.ts` 의 export 이름, 그리고/또는 `openapi.yaml` 의 `paths`.

**기대 출력.** validate 검사 8 을 "존재" → "매칭"으로 승격. confirmed 엔드포인트마다 한 줄:
```txt
[검사 8] …/screen-spec.md: confirmed API 'GET /coupons/{id}' 에 대응하는 zod export/OpenAPI path 없음
         → 해소: src/api/schemas 에 스키마를 추가하거나 confidence 를 candidate 로 내리세요
```

**오탐 위험: 중–높.** 핵심 난점은 **매칭 키가 어디에도 선언돼 있지 않다**는 것이다.
- 경로 변형: api-manifest 는 `/coupons/{id}`, Expo Router route 는 `/coupons/[id]`, OpenAPI 는 `{id}` — 정규화 규칙 필요.
- N:1 관계: `CouponDto` 하나가 목록·상세 두 엔드포인트를 뒷받침 → 문자 그대로 "1:1"이 아니라 endpoint→schema(s).
- 규약 부재: path→export 이름 추론을 휴리스틱으로 하면 오탐이 쏟아진다. **frontmatter `linked_schema` 필드를 두는 게 정공법이지만 이는 schema 추가**라 이번 범위 밖 → 별도 Open Decision 으로 올려야 한다.

**MVP 구현 규모: M.** api-manifest Endpoints 파서(parseTable 재사용) + zod export 스캔(파일명/`export const`) + OpenAPI paths 로더 + 경로 정규화 + 매칭. ~120–200 LOC + fixture. 설계 비용의 대부분은 코드가 아니라 **매칭 키 규약 결정**.

**권장 테스트 fixture.** `examples/api-schema-match/` — (a) confirmed 엔드포인트가 zod 로 뒷받침됨(pass), (b) confirmed 인데 대응 스키마 없음(fail), (c) OpenAPI 만으로 뒷받침되는 변형(pass), (d) `{id}`↔`[id]` 정규화 회귀 케이스.

**어디에 사는가: `validate.mjs` (검사 8 강화).** 정적·exit 0/1·CI 게이트라 validate 가 정확히 맞다. readiness 는 판정 전용이라 IO 매칭을 넣지 않는다(불변식 1).

---

## 후보 2 — Interaction Matrix `Result` 컬럼 구조화

**왜 중요한가.** 검사 4(이동 대상 route 존재)는 현재 `Result` 자연어 셀에서 `/(\/[^\s]+)/` 정규식으로 **첫 슬래시 토큰**만 뽑아 route 집합과 대조한다(`spec.mjs:interactionResultRoutes`). `Result` 에는 `/coupons/[id]`(route)와 `상태 필터 변경`·`refetch`(상태변경) 가 섞여 있어, route 가 아닌 셀에 슬래시가 들어가면(예: copy·analytics 문자열) 오탐하고, route 인데 토큰이 뒤에 있으면 누락한다. roadmap MVP-B 항목(line 78): `Result Type / Target / Params` 분리 → `Result Type=route` 행만 route 검사.

**막는 환각/drift.** "이동"과 "상태변경"을 한 칸에 섞어 적어 발생하는 **검사 4 의 오탐·누락**. 구조화하면 route edge 가 기계가독이 되어, 부차적으로 `interaction_matrix_complete` 를 진짜 게이트로 승격할 길도 열린다(현재는 fact 로 정의만 돼 있고 어떤 `requires` 에도 안 쓰여 게이트가 아님 — roadmap line 41).

**필요한 입력 파일.** 모든 `screen-spec.md` 의 `## Interaction Matrix`, `screen-spec.template.md`, 그리고 파서 `lib/spec.mjs`(`interactionResultRoutes`·`deriveMetrics`).

**기대 출력.** 검사 4 가 `Result Type=route` 행에만 적용돼 정밀해진다. 비-route 행(상태변경)은 검사 대상에서 명시적으로 제외 → 슬래시 포함 자연어 오탐 제거.

**오탐 위험: 낮(구조화 후) / 마이그레이션 중 높.** 구조화 자체가 기존 정규식 오탐을 **없앤다**. 그러나 단일 `Result` → 3컬럼 전환은 **기존 모든 screen-spec + 템플릿 + 예제 트리**를 동시에 고쳐야 하고(blast radius), 전환기에 구·신 형식이 섞이면 파서가 둘 다 받아야 한다.

**MVP 구현 규모: L.** 코드(파서·검사 4 재작성)는 작지만 **템플릿 변경 + 골든 예제 전수 마이그레이션**이 본체. 하위호환 파서(구 단일 컬럼 fallback)를 둘지가 규모를 가른다.

**권장 테스트 fixture.** `examples/interaction-matrix-structured/` — (a) `Result Type=route`→존재하는 route(pass), (b) `Result Type=route`→없는 route(fail), (c) `Result Type=state-change` 셀에 슬래시 포함(구 파서라면 오탐, 신 파서는 pass=회귀 가드).

**어디에 사는가: `lib/spec.mjs` 파서 + 템플릿 + `validate.mjs` 검사 4 정밀화.** readiness 로의 확장(`interaction_matrix_complete` 게이트화)은 **policy 변경이라 범위 밖** — 별도로 의사결정해야 한다.

---

## 후보 3 — diff 기반 `forbidden_paths` backstop

**왜 중요한가.** MVP-A 의 1차 방어는 `readiness_mode = min(fact_mode, decision_cap)` 다운그레이드(forward)와 pre-edit hook 이다. 하지만 **hook 이 없는 환경(CI)** 에서는 LLM/사람이 자기 모드의 `forbidden_paths` 를 넘는 파일을 고쳐도 잡히지 않는다. open-decisions.md "Validate 통합"과 validate.mjs:12 가 이 backstop 을 명시적 후속으로 남겼고, roadmap "다음 구현 후보 #2" 다. **가장 설계가 끝나 있는 후보.**

**막는 환각/drift.** 화면이 `rough-fixture-ui` 인데 `src/api/**` 를 수정하는 식의 **경로 경계 위반**. readiness 가 이미 모드를 내렸는데도 상위 모드에서만 허용되는 경로를 건드린 변경을 CI 에서 잡는다.

**필요한 입력 파일.**
- 변경 파일 목록 — `git diff --name-only`(또는 테스트용 `--diff <file>` 입력).
- `readiness.mjs` 출력(`computeReadiness` 재사용) — 화면별 `readiness_mode` 와 `{domain}` 치환된 `forbidden_paths`.
- `implementation-mode-policy.yaml`(이미 readiness 가 로드).

**기대 출력.** 경계를 넘은 변경 파일마다(초기엔 **경고**, exit 무영향):
```txt
[backstop] src/api/coupons.ts: COUPON-001 의 readiness_mode=rough-fixture-ui 에서 금지된 경로(src/api/**)
           → 해소: api_confidence 를 confirmed 로 올려 api-integrated-ui 에 도달하거나, 이 변경을 되돌리세요
```

**오탐 위험: 중(설계로 상당 부분 차단됨).** 이미 풀려 있는 함정들:
- **트리 스캔 금지** — 공유 `src/api` 가 전역 forbidden 이라 트리 스캔은 골든 예제에서 즉시 오탐(open-decisions.md:227). 반드시 **diff 기반**.
- **같은 경로 품질 승격(rough→final)은 잡으면 안 됨** — 파일로 구별 불가하므로 forward gate 에 맡기고, backstop 은 **경로 경계를 넘는 변경만** 본다(open-decisions.md:246).
- **`fact_mode >= Blocking Mode` 를 게이트로 쓰지 말 것** — 그건 "결정만 빼고 준비됨"이라는 정상 blocker 상태라 실패시키면 정상 화면이 시끄럽게 걸린다.
- 남는 오탐원: **도메인 비귀속 경로 매핑**. `src/features/{domain}/**` 는 도메인으로 화면에 매핑되지만 `src/api/**`·`src/app/**`·`openapi.yaml` 은 어느 화면 소유도 아니다. 게다가 **한 도메인 경로가 readiness_mode 가 서로 다른 복수 화면에 매핑**될 수 있는데(예: 같은 도메인의 A=final, B=rough), 어느 화면 기준으로 forbidden 을 적용할지 정하는 **화면-소유권 규칙이 코드에 없다**(코덱스 보강). "전 화면 중 가장 높은 모드 기준" 같은 규칙을 명시해야 하고, 초기 **경고-only** 로 위험을 가둔다.

**MVP 구현 규모: M.** 새 스크립트: diff 수집 → `computeReadiness` 호출 → 변경파일을 화면/도메인에 매핑 → glob 매칭(`{domain}` 치환) → 리포트. ~100–150 LOC. fixture 가능성을 위해 `--diff <file>`(변경 경로 목록)을 받게 설계하면 git 없이 테스트된다.

**권장 테스트 fixture.** `examples/path-backstop/` + `--diff` 입력 — (a) 전 화면이 `api-integrated-ui` 미만인데 `src/api/**` 변경(경고/fail), (b) 모드 내 편집(pass), (c) 한 도메인만 경계 위반·다른 도메인 정상(부분 fail), (d) rough→final 같은 경로 편집(pass=회귀 가드).

**어디에 사는가: 별도 스크립트(`scripts/path-backstop.mjs`), CI 호출.** git diff 라는 외부 입력이 필요해 `validate.mjs`(트리 기반·git 없음)에도, `readiness.mjs`(순수 판정)에도 넣지 않는다. 판정 로직은 `computeReadiness` 를 **재사용**(불변식 1: 판정 단일 출처). 후에 결과를 validate 리포트로 합칠 수는 있다.

---

## 후보 4 — 입력 artifact frontmatter/스키마 검증

**왜 중요한가.** Reconciliation 파이프라인 전체가 `input_id` 한 키에 걸려 있다 — 멱등성·역추적·supersede·미처리 감지가 전부 이 키로 동작한다(input-reconciliation.md:87). 그런데 입력 결과물은 `artifact_type` 이 없어 **validate 가 통째로 건너뛴다**(validate.mjs:101, `if (!data.artifact_type) continue`). 즉 `input_id` 누락·중복·형식오류를 지금은 아무도 안 잡는다. 후보 6(register 검증)의 전제이기도 하다.

**막는 환각/drift.** ① `input_id` 누락/중복 → "이미 처리한 입력"으로 오스킵되거나 register 키가 깨짐. ② 같은 `input_id` 를 덮어쓰는 위반(계약은 "새 id + supersedes" 강제). ③ `supersedes` 가 존재하지 않는 입력을 가리킴.

> **정본(canonical) 스키마 — 2026-06-13 결정 (코덱스 리뷰 후 사용자 확정).** 발견된 drift(문서화된 Input Result Contract vs 실제 fixture)는 **fixture/template 쪽을 정본**으로 채택해 해소했다. 결정적 근거: 킷에 이미 **입력 전용 템플릿 `templates/input/input-artifact.template.md`** 이 있고, 이 템플릿이 fixture 와 동일한 flat frontmatter 를 규정한다 — 즉 stale 한 것은 `input-reconciliation.md:65–77` 의 prose 계약뿐이고 template+fixture 는 일치한다. 채택된 정본:
>
> | frontmatter | 위상 | 비고 |
> |---|---|---|
> | `input_id` | **required** | 불변·전역유일. 멱등성·역추적·supersede·미처리 감지의 키 |
> | `input_type` | **required** | normalized category (planning/figma/api/meeting/qa/user-note) |
> | `source_type` | **required** | concrete source adapter/type (planning-doc/api-doc/…) — input_type 과 **둘 다 유지** |
> | `source_ref` | **required** | 원천 포인터 |
> | `captured_at` | **required** | 수집 시점 |
> | `captured_by` | **required** | 저장한 입력 스킬 |
> | `status` | **required** | **입력 자체의 상태**. Reconciliation Register 의 `Reconcile Status` 와 절대 섞지 않는다 |
> | `affected_domains` / `affected_screens` | **required** | flat 범위 필드 |
> | `confidence` | optional(recommended) | 있으면 enum 검사만, 누락은 warning/pass 로 시작 |
> | `supersedes` | optional | 입력↔입력 축 |
> | `raw_artifacts` | optional | 계약 prose 에만 있던 필드 — optional 로 유지 |
>
> **deprecated alias** (parser 는 한동안 읽되 발견 시 warning, template/generator 는 출력 안 함): ① `suggested_scope.domains/screens` → `affected_domains`/`affected_screens` 로 대체, ② frontmatter `summary` → body `## Summary` 섹션이 정본. (※ 이 정본을 `input-reconciliation.md` prose 계약에 반영하는 것은 **기존 docs 수정**이라 이번 세션 범위 밖 — 후속 doc 패치로 분리.)

**필요한 입력 파일.** `inputs/*.md`(권장 위치 `docs/frontend-workflow/inputs/{input_id}.md`)의 frontmatter + body `## Summary`. 정본 형식은 `templates/input/input-artifact.template.md` 이 이미 규정 — 검증기는 그 형식을 강제한다. (입력 전용 스키마 파일을 둘지 frontmatter.schema.json 에 input 타입을 추가할지는 schema 추가라 이번 세션 밖 — 아래 "범위 밖" 참조.)

**기대 출력.**
```txt
[검사 10] inputs/draft-coupon.md: input_id 누락 (필수) — 파일명도 {input_id}.md 규약 위반
[검사 10] inputs/IN-20260613-figma-001.md: input_id 중복 (inputs/IN-20260613-figma-002.md 와)
[검사 10] inputs/IN-20260613-meeting-002.md: supersedes 대상 'IN-…-x' 가 존재하지 않음
[검사 10] inputs/IN-20260613-qa-002.md: 필수 frontmatter 누락: source_type, captured_by (정본 스키마)
[경고  10] inputs/IN-20260613-planning-002.md: deprecated 'suggested_scope' 사용 → affected_domains/affected_screens 로 이전
```

**오탐 위험: 낮–중 (정본 확정으로 하락).** 정본이 정해져 fixture/template 이 곧 기준이므로 "느슨하지 않은 스키마를 들이대면 fixture 가 다 걸린다"는 위험은 사라졌다(현 fixture 는 정본을 만족). 남는 오탐원: ① `confidence` 누락을 error 로 잡으면 과검출 — optional 이라 **enum 검사만, 누락은 warning/pass**. ② `status`(입력 상태)를 Reconciliation Register 의 `Reconcile Status` 와 혼동해 교차검사하면 안 됨(둘은 별개 라이프사이클 — 결정 #7). ③ deprecated alias 는 **경고**지 error 가 아니다.

**MVP 구현 규모: S.** `inputs/` walk → `splitFrontmatter` → 정본 required 필드 존재 + `input_id` 패턴/전역중복/supersedes 해소 + deprecated alias 경고. ~60–90 LOC + fixture. **정본이 확정돼 설계 선행조건이 사라졌다** — 즉시 착수 가능(코덱스가 후보 4 를 앞당기라 권한 이유).

**권장 테스트 fixture.** `examples/input-validation/inputs/` — (a) 유효한 `input_id`(pass), (b) `input_id` 누락(fail), (c) 두 파일 `input_id` 중복(fail), (d) `supersedes` dangling(fail/경고), (e) `input_id` 만 있고 나머지 비움(pass = 느슨함 허용 가드).

**어디에 사는가: `validate.mjs` 신규 검사(검사 10), `inputs/` 를 명시 경로로 읽음 — 일반 artifact walk(_meta·artifact_type 필터)를 타지 않는 별도 분기**(코덱스 보강: inputs 는 `artifact_type` 이 없어 기존 walk 가 통째로 스킵). 입력 전용 스키마를 정식 추가하기 전까지는 코드 내 최소 규칙으로 시작하거나 얇은 별도 `scripts/validate-inputs.mjs` 로 분리해 공용 frontmatter.schema.json 결합을 피하는 선택지도 있다.

---

## 후보 5 — expected-llm-after 비교 헬퍼 (골든 테스트 하니스)

**왜 중요한가.** 이 킷의 검증 방식은 **골든 예제 + 손으로 "검증됨" 표기**다(expected-validation.md "2026-06-13 실제 실행으로 검증됨"). coupon-feature 만 CI 가 `_meta` git diff 로 멱등성을 지키고(workflow yml:33), `input-reconciliation/expected-llm-after/`(및 `expected-after/`) 트리와 `reports/expected-readiness.md`·`reconciliation-summary.md` 는 **어떤 스크립트도 재검증하지 않는다**. 즉 파서/정책이 바뀌면 expected-* 가 조용히 stale 해진다. 이 헬퍼는 **다른 후보(1·2·3·4·6)를 안전하게 만드는 인프라**다 — 각 후보가 실행되는 회귀 테스트와 함께 출시되게 한다.

**막는 환각/drift.** 스크립트(state/readiness/validate) 출력과 커밋된 기대값의 **불일치(회귀)**. "expected-after 문서가 곧 진실"이라는 가정이 실제 실행과 어긋나는 것을 매 변경마다 잡는다. 불변식 7(멱등성)을 coupon-feature 너머 전 예제로 확장.

**필요한 입력 파일.** 기존 예제 트리들(`examples/coupon-feature`, `multi-screen-dry-run`, `input-reconciliation/expected-llm-after`) + 각 예제에 **기계가독 기대값**(예: `expected-readiness.json`, 또는 커밋된 `_meta` 스냅샷). 현재 `reports/expected-*.md` 는 산문이라 그대로는 비교 불가.

**기대 출력.** `npm test` 류 한 방:
```txt
PASS  coupon-feature       state·readiness·validate ↔ expected 일치
FAIL  multi-screen-dry-run readiness[PROFILE-001] 기대 docs-only ≠ 실제 route-skeleton
```

**오탐 위험: 중.** 비교 계층을 잘못 잡으면 오탐.
- **비결정성**: `generated_at` 한 줄만 변동 허용(이미 `--date` 로 고정 가능) — 비교 시 정규화 필요. Windows CRLF/경로 구분자도 정규화(스크립트는 이미 posix 정규화).
- **계층 혼동(가장 큰 함정)**: expected-after 문서 본문은 **사람이 쓴 설계 의도**라 스크립트 출력과 합법적으로 다를 수 있다. expected-readiness.md 가 "실측 vs Target(design intent)"을 분리하는 이유다 — **실측(스크립트 재현 가능)만** 비교해야 한다. 사람이 resolve 한 결정 본문 등을 비교하면 오탐.

**MVP 구현 규모: S–M.** `buildState`/`computeReadiness` 를 예제 트리에 돌려 커밋된 기대값과 비교 + diff 리포트 + `npm test` 배선. ~80–150 LOC. 대부분 glue + 산문 리포트 1개를 파서블 fixture 로 전환.

**권장 테스트 fixture.** 신규 트리 불필요 — **기존 예제 트리를 코퍼스로 재사용**하고 각자에 `expected-readiness.json`(또는 `_meta` 스냅샷)을 커밋. fixture 가 곧 골든 예제 + 커밋된 기계 출력.

**어디에 사는가: 별도 스크립트(`scripts/`의 테스트 러너 + `npm test`), 킷-내부 전용.** validate/readiness 는 소비 프로젝트가 돌리는 워크플로우 도구이고, 이건 킷 자체의 회귀 가드라 섞지 않는다.

---

## 후보 6 — reconciliation-register 검증

**왜 중요한가.** Reconciliation Register 는 입력 처리 이력의 살아있는 레지스터이고, input-reconciliation.md "MVP Placement"(line 446–453)가 후속 validate/hook 후보를 **이미 구체적으로 나열**해 뒀다. 단 register 는 `_meta/reconciliation-register.md` 에 살아 validate 의 `_meta` 제외 때문에 지금은 검사 사각지대다. Tier 2(설계 계약, 코드 강제 0)를 코드 게이트로 끌어올리는 후속.

**막는 환각/drift (계약이 지목한 4종).**
```txt
미처리 감지     inputs/ 에 input_id 는 있는데 register 행이 없음 / Reconcile Status=in-progress·failed
stale conflict  open conflict 의 B=D-… 가 가리키는 decision 이 이미 resolved
고위험 대칭충돌  구현 형태를 가르는 충돌인데 대응 Open Decision 이 없음(게이트 누락)
닫힘 동기화     재오픈으로 생긴 conflict 가 그 decision 닫힐 때 함께 안 닫힘(stale)
```

**필요한 입력 파일.** `_meta/reconciliation-register.md`(8컬럼 표) + `inputs/*.md`(`input_id`) + 교차참조용 각 screen-spec 의 `## Open Decisions`·`## Conflicts`(또는 `_meta/conflicts.md`).

**기대 출력.**
```txt
[검사 11] IN-20260613-x-001: inputs/ 에 있으나 register 에 행 없음 (미처리) — reconcile-input 먼저 실행
[검사 11] register: IN-…-002 Reconcile Status=in-progress (이전 실행 중단) — 이어서 처리 필요
[검사 11] C-001: open 인데 가리키는 D-204 가 resolved (stale conflict) — 함께 닫으세요
```

**오탐 위험: 중–높 (라이프사이클 함정).** **가장 큰 오탐원**: `reconciled` 인데 자식 decision(D-/C-)이 아직 open 인 입력을 "미처리"로 잡는 것. register 의 2·3차 개정(`Reconcile Status` 를 자식 rollup 과 분리)이 정확히 이 fail-open/오탐을 막으려 만든 설계다(input-reconciliation.md:133, 358). **검사는 오직 `Reconcile Status` 만 보고, 자식 open/closed 는 절대 미처리 신호로 쓰면 안 된다.** 그 외: 아직 reconcile 안 한 작업중 입력은 초기엔 경고. stale conflict 의 `B=D-…` 파싱은 자유서술이라 깨지기 쉽다.

**MVP 구현 규모: M.** register 표 파서(parseTable 재사용) + `inputs/` 스캔 + 교차참조. 미처리 감지만이면 ~80 LOC, 4종 전부면 ~200 LOC + fixture.

**권장 테스트 fixture.** `examples/reconciliation-validation/` — (a) 전부 reconciled(pass), (b) `input_id` 인데 register 행 없음(fail), (c) `Reconcile Status=in-progress`(fail), (d) **reconciled + 자식 decision open(반드시 pass = 오탐 가드)**, (e) open C-001 의 B=D-001 이 resolved(stale fail).

**어디에 사는가: `validate.mjs` 신규 검사(검사 11), `_meta/reconciliation-register.md` 를 명시 경로로 읽음.** 계약이 "CI 강제"를 후속으로 명시했으니 CI 게이트인 validate 가 맞다. 단 `_meta` 일반 walk 가 아니라 **그 파일만 콕 집어** 읽어 artifact_type 검사에 안 걸리게 한다(register 는 meta-register라 `artifact_type` 없음). 분리하고 싶으면 `scripts/validate-reconciliation.mjs` 도 가능.

---

## 비교 표

| # | 후보 | 막는 것(요지) | 규모 | 오탐 위험 | 사는 곳 | roadmap 근거 | 선행조건 |
|---|---|---|---|---|---|---|---|
| 1 | API ↔ 스키마 1:1 매칭 | confirmed 인데 코드에 스키마 없음(fail-open) | M | 중–높 | validate(검사 8 강화) | Tier1 강화(L77) | 매칭 키 규약(=`linked_schema`, schema 추가) |
| 2 | Interaction `Result` 구조화 | 검사 4 오탐·누락 | **L** | 낮(후)/높(이전) | spec.mjs+템플릿+validate(검사 4) | Tier1 강화(L78) | 전 screen-spec 마이그레이션 |
| 3 | forbidden_paths backstop | 경로 경계 위반(hook 없는 CI) | M | 중(설계로 차단) | **별도 스크립트**(CI) | 다음 후보 #2 | git diff 입력 설계 |
| 4 | 입력 frontmatter 검증 | input_id 누락·중복·덮어쓰기 | **S** | 낮–중 | validate(검사 10) | (recon 후속의 전제) | ✅ 정본 확정(2026-06-13) |
| 5 | expected-llm-after 비교 하니스 | 스크립트↔기대값 회귀 | S–M | 중 | **별도 스크립트**(npm test) | 불변식 7 확장 | 기대값 기계가독화 1건 |
| 6 | reconciliation-register 검증 | 미처리·stale 입력 | M | 중–높 | validate(검사 11) | recon MVP Placement(L446) | 후보 4 |

---

## 추천 도입 순서

설계 성숙도 · 안전가치 · 비용/위험 · 의존성을 종합한 결론. **단조 증가 순이 아니라, 인프라를 먼저 깔고 가장 잘 풀린 게이트부터 간다.**

```txt
Phase 0  (인프라)  후보 5  expected-llm-after 비교 하니스
Phase 1  (게이트)  후보 3  forbidden_paths backstop
Phase 2  (게이트)  후보 4  입력 frontmatter 검증        ← 정본 확정으로 즉시 착수 가능
Phase 3  (게이트)  후보 6  reconciliation-register 검증  ← 후보 4(input_id 검증) 위에 쌓임
Phase 4  (게이트)  후보 1  API ↔ 스키마 1:1 매칭        ← linked_schema 규약 선결 필요
Phase 5  (정밀화)  후보 2  Interaction Matrix Result 구조화
```

**근거.** (5→3→4→6→1→2 — 코덱스 권장 + 사용자 확정. 원안 대비 후보 1↔4 교체.)

- **후보 5 를 먼저(또는 후보 3 과 병행).** 골든 테스트 하니스는 제품 위험이 거의 없고, **나머지 다섯 후보가 각자 실행되는 회귀 테스트와 함께 출시되게** 만든다. 이 킷은 이미 "실제 실행으로 검증됨"·CI 멱등성 diff 처럼 실행 가능한 검증을 중시한다 — 그 가드를 전 예제로 넓히는 게 가장 먼저 와야 TDD 가 된다. *"만들기 전에 테스트 가능하게."*
- **후보 3 이 첫 게이트.** 가장 설계가 끝나 있고(open-decisions.md 가 오탐 함정까지 다 풀어둠), roadmap "다음 후보 #2"이며, hook 없는 CI 에서 게이트 무결성 구멍을 닫는다. **경고-only 로 시작**해 위험을 가둔다.
- **후보 4 가 둘째 (원안 셋째→상향).** 비용이 가장 싸고(**S**) **정본이 확정돼 설계 선행조건이 사라졌다** — 즉시 착수 가능. reconcile 파이프라인 입구(`input_id`)를 지켜 후보 6 의 전제가 된다.
- **후보 6 은 4 위에 쌓는다.** 입력 frontmatter·`input_id` 가 검증된 뒤라야 `input_id ↔ register` 교차참조가 의미 있다. 라이프사이클 오탐 위험이 가장 높아(반드시 `Reconcile Status` 만 본다) 신중히.
- **후보 1 이 다섯째 (원안 둘째→하향).** 환각 차단 가치는 가장 직접적(confirmed fail-open)이지만 **매칭 키 규약(`linked_schema`) 결정이 선행**이라, 선결조건 없는 4·6 을 먼저 보내고 뒤로 미룬다(코덱스 권장).
- **후보 2 가 마지막.** 안전가치(주로 검사 4 정밀화) 대비 **blast radius(전 screen-spec 템플릿 마이그레이션)** 가 가장 크고, `interaction_matrix_complete` 는 아직 게이트도 아니다. 비용-대-안전 비율이 가장 나빠서 후순위.

**대안 분기.** 사용자-대면 게이트를 먼저 보고 싶다면 **후보 3 을 Phase 0 으로** 올리고 후보 5 를 병행한다. reconcile 파이프라인 강화가 최우선이면 **후보 4 → 6 을 후보 3 보다 앞으로** 당긴다(단 후보 5 는 여전히 먼저 깔아 두기를 권장).

---

## 범위 밖 / 착수 전 풀어야 할 결정 (Open Decision 감)

이 후보들이 **하드룰을 건드리거나** 별도 의사결정이 필요한 지점 — 구현 세션 전에 명시적으로 정해야 한다.

```txt
후보 1   매칭 키를 frontmatter `linked_schema` 로 둘 것인가? → schema 추가. 안 두면 휴리스틱 매칭(오탐↑).
후보 2   단일 Result → 3컬럼 전환은 템플릿 변경 + 전 예제 마이그레이션. 하위호환 파서를 둘 것인가?
후보 2   interaction_matrix_complete 를 진짜 게이트로 승격? → policy(requires) 변경, 별건.
후보 4   입력 전용 스키마를 새로 만들 것인가, frontmatter.schema.json 에 input 타입을 추가할 것인가? → schema 추가(이번 세션 밖). 정본 필드 자체는 확정됨.
후보 4   ✅ 정본 결정 완료(2026-06-13): fixture/template 기준 flat schema 채택 — suggested_scope·frontmatter summary 는 deprecated alias.
         (정본을 input-reconciliation.md prose 계약에 반영하는 doc 패치는 기존 docs 수정이라 후속.)
후보 6   미처리 감지를 경고로 시작할지 곧장 fail 로 할지(reconcile hook/CI 강제 시점).
```

**지금 하지 말 것**(roadmap "지금 하지 말 것" 계열):
- 후보 하나를 명시적으로 고르지 않은 채 동시 착수.
- 새 산출물 축 추가 — 이 후보들은 전부 기존 게이트 강화 또는 테스트 인프라다.
- LLM 이 게이트를 **내리게** 만드는 자동화(resolve/confirm/conflict-close 는 사람-전용 불변식 유지).
- 후보 2·6 에서 `interaction_matrix`·register 를 새 readiness 게이트로 만들기(게이트는 Open Decision + 정책 fact 뿐).
