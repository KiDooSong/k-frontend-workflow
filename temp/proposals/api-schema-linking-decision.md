# API Candidates ↔ 스키마 매칭 규약(linking convention) 결정 제안

> 스냅샷: 2026-06-14. **설계 제안 초안일 뿐 구현이 아니다** — 이 세션의 산출물은 이 문서 하나다.
> `validate.mjs` / 템플릿 / 예제 / `package.json` 을 건드리지 않고, frontmatter 스키마도 추가하지 않는다.
> 여기서 정하는 것은 검사 8 을 "엔드포인트 단위"로 강화할 때의 **매칭 키(linking) 규약 하나**다. 실제 코드/예제/스키마 변경은 후속 세션 몫이다.
>
> 함께 읽을 것:
> [mvp-b-validation-candidates.md](./mvp-b-validation-candidates.md) ·
> [diff-based-forbidden-paths-backstop.md](./diff-based-forbidden-paths-backstop.md) ·
> [roadmap-current.md](../../frontend-workflow-kit/roadmap-current.md) ·
> [open-decisions.md](../../frontend-workflow-kit/open-decisions.md)
>
> 참조 코드/산출물:
> [validate.mjs](../../frontend-workflow-kit/scripts/validate.mjs) (검사 8 = :228-245) ·
> [lib/spec.mjs](../../frontend-workflow-kit/scripts/lib/spec.mjs) (`parseApiCandidates` = :308-320, `parseTable`/`col`/`hasHeader` = :50-109) ·
> [api-manifest.md](../../frontend-workflow-kit/examples/multi-screen-dry-run/docs/frontend-workflow/api/api-manifest.md) ·
> [screen-spec.template.md](../../frontend-workflow-kit/templates/screen/screen-spec.template.md) (API Candidates = :72-74) ·
> [frontmatter.schema.json](../../frontend-workflow-kit/schemas/frontmatter.schema.json) ·
> [artifact-manifest.yaml](../../frontend-workflow-kit/catalog/artifact-manifest.yaml)

> **이 문서의 위치.** [mvp-b-validation-candidates.md](./mvp-b-validation-candidates.md) 는 "후보 1 — API Candidates(confirmed) ↔ zod/OpenAPI 매칭"을 **Phase 4**(추천 도입 순서 `5→3→4→6→1→2` 중 다섯째 항목)로 미뤘고, 그 이유를 정확히 *"`linked_schema` 규약 선결 필요"* 로 적었다. 또 그 문서의 "범위 밖"에 *"후보 1: 매칭 키를 frontmatter `linked_schema` 로 둘 것인가? → schema 추가. 안 두면 휴리스틱 매칭(오탐↑)"* 이라 명시했다. 이 문서가 바로 그 **선결 결정**을 정하는 심화 제안서다. 결정 하나(매칭 키를 어디에 둘 것인가)만 확정하고, 강화 자체는 후속 세션으로 넘긴다.

---

## 1. Problem (문제)

검사 8 의 의도는 "화면이 **확정(confirmed)** 된 API 에 의존하는데, 그 API 를 뒷받침하는 스키마(zod 또는 OpenAPI)가 없다"를 잡는 것이다. 그런데 현재 구현은 **프로젝트에 스키마 소스가 하나라도 있으면 통과**한다 — 어떤 엔드포인트가 어떤 스키마로 뒷받침되는지는 보지 않는다.

그 결과 다음이 **fail-open** 으로 빠져나간다.

```txt
화면 A: ## API Candidates 에 "GET /coupons/{id} (confidence: confirmed)"
프로젝트: src/api/schemas/user.ts 가 UserDto 하나만 export (쿠폰과 무관)
→ hasZod = true (디렉터리에 .ts 가 있음) → 검사 8 통과
   그러나 GET /coupons/{id} 를 실제로 뒷받침하는 스키마는 어디에도 없다.
```

즉 "쿠폰 상세를 confirmed 로 올렸지만 정작 쿠폰 스키마는 코드에 없는" 상태가 게이트를 통과한다. LLM 이 `## API Candidates` 에 그럴듯한 엔드포인트를 적고 사람이 confirm 만 했을 때, "스키마는 나중에"가 조용히 묵인되는 구멍이다. 이는 [mvp-b-validation-candidates.md](./mvp-b-validation-candidates.md) 가 코덱스 리뷰로 확인한 기준선 그대로다.

이걸 닫으려면 검사 8 이 **엔드포인트(method+path) → 그 엔드포인트가 지목한 스키마 → 그 스키마의 실제 존재** 를 따라가야 한다. 그 해소를 가능하게 하는 **매칭 키를 어디에 둘 것인가**가 이 문서가 정하는 단 하나의 결정이다. 매칭 키 자리가 정해지지 않으면, 강화는 "method+path 로 스키마 이름을 추측하는 휴리스틱"으로 떨어져 경로 표기 불일치(`/coupons/{id}` vs `[id]`)와 동명 스키마 오인으로 오탐이 폭증한다.

---

## 2. Current check 8 behavior (검사 8 현재 동작)

코드 사실대로 ([validate.mjs](../../frontend-workflow-kit/scripts/validate.mjs):228-245):

```txt
hasZod    = dirHasFiles(srcDir/api/schemas, ['.ts'])          // 디렉터리에 .ts 가 "하나라도" 있으면 true
hasOpenApi = exists(projectRoot/openapi.yaml) || exists(.../openapi.yml)

for (각 screen-spec) {
  items     = parseApiCandidates(## API Candidates)            // {raw, confidence} 만 반환
  confirmed = items.filter(it => it.confidence === 'confirmed')
  if (confirmed.length && !hasZod && !hasOpenApi)
    → 에러 "[검사 8] confirmed API N건인데 zod 스키마/OpenAPI 부재"
}
```

성질:

- **전역 존재(existence) 검사다.** `hasZod`/`hasOpenApi` 는 프로젝트당 한 번 계산되고, 어떤 화면의 어떤 엔드포인트와도 연결되지 않는다.
- **엔드포인트 단위가 아니다.** confirmed 가 1건이든 10건이든, 스키마 소스가 1개라도 있으면 전부 통과한다.
- **매칭 키가 없다.** `parseApiCandidates` ([spec.mjs](../../frontend-workflow-kit/scripts/lib/spec.mjs):308-320)는 `## API Candidates` 의 `'-'` 로 시작하는 줄에서 `confidence` 정규식(`/confidence\s*[:=]\s*([a-zA-Z]+)/`)만 뽑고, `{ raw, confidence }` 만 반환한다. **method/path 를 별도로 파싱하지 않는다.**
- validate.mjs 주석(:228-230)이 이를 자인한다: *"MVP-A 범위: 스키마 소스의 '존재'만 확인. 후보↔스키마 매칭(엔드포인트→스키마명)은 api-manifest/OpenAPI 통합이 들어오는 MVP-B 에서 강화."*
- 검사 8 은 screen-spec 전용 검사 블록(4,5,8)의 거주자이며, `validate` 는 `docs/` 트리 스캔 · git 의존 없음 · exit 0/1 CI 게이트다. 이 경계는 이번 강화에서도 유지한다.

---

## 3. Why endpoint-level matching is needed (왜 엔드포인트 단위 매칭이 필요한가)

전역 존재 검사는 두 가지를 **막지 못한다**.

1. **Fail-open(거짓 통과).** §1 예시처럼 *무관한* 스키마 파일 하나가 모든 confirmed 엔드포인트를 면제시킨다. 검사의 의도("이 confirmed API 가 뒷받침되는가")와 구현("프로젝트에 스키마가 있는가") 사이에 간극이 있다.
2. **환각의 묵인.** LLM 이 `## API Candidates` 에 엔드포인트를 적는다(그게 candidate 단계의 정상 동작이다). 사람이 그중 일부를 confirmed 로 올리는 순간, 그 엔드포인트는 "확정 계약"을 주장한다. 그러나 *그 엔드포인트에 대응하는 스키마가 실제 코드에 있는지* 는 누구도 검증하지 않는다. confirmed 승격은 사람 전용이지만, 사람이 "스키마는 곧 만들겠지"라고 confirm 하면 검사는 침묵한다.

엔드포인트 단위 매칭은 검사 8 을 이렇게 바꾼다:

```txt
[현행] confirmed 있음 && 스키마 소스 전무      → 에러                       (프로젝트 단위 1회)
[강화] 각 confirmed 엔드포인트마다:
         endpoint(method+path) → 지목 스키마 → 그 스키마가 실제 존재?       (엔드포인트 단위 N회)
         해소 실패 시 → 에러
```

이때 핵심 설계 질문은 **"endpoint 가 지목하는 스키마를 어디서 읽는가"**, 즉 **매칭 키의 거주지** 다. method+path 만으로 스키마 이름을 추론하면(휴리스틱) 경로 표기 정규화(`/coupons/{id}` vs Expo Router `[id]`, vs `/coupons/{couponId}`)와 동명 스키마 오인으로 오탐이 늘어난다. 그래서 "사람/캐노니컬이 적은 매칭 키"가 필요하고, 그 키를 **어디에 둘지가 옵션 A/B/C/D 의 차이** 다.

세 가지 부수 사실이 옵션 선택을 좌우한다:

- **경로 표기 불일치는 실재한다.** api-manifest 와 OpenAPI 는 `/coupons/{id}`, Expo Router 화면 route 는 `/coupons/[id]`. 단 **화면 route 와 API path 는 별개 축** 이다 — screen-spec frontmatter 의 `route` 는 화면 경로지 API path 가 아니다. 두 축을 같은 정규화 함수로 섞으면 그 자체가 오탐원이 된다.
- **관계는 N:1 이다.** 스키마 하나(`CouponDto`)가 복수 엔드포인트를 뒷받침한다(`GET /coupons` → `CouponDto[]`, `GET /coupons/{id}` → `CouponDto`). 따라서 매칭은 문자 그대로의 "1:1"이 아니라 endpoint→schema(s) 다.
- **사실의 출처는 zod(코드)다(불변식 4).** 매칭 키가 *문서* 에 살더라도, 그 키가 가리키는 사실(스키마가 존재하는가)의 출처는 여전히 zod export 심볼이어야 한다. 문서는 코드 심볼을 *참조* 만 하고 사실을 새로 만들지 않는다.

---

## 4. Options (옵션 비교)

네 옵션 모두 공통 전제를 공유한다: 매칭 로직은 **`validate`(정적 IO 검사)에만** 산다(불변식 1 — 판정 단일 출처는 `readiness`). confirmed 승격은 여전히 **사람 전용**(LLM 은 candidate 만 제안)이다. 차이는 오직 **매칭 키를 어디에 두는가** 다.

### 옵션 A — `## API Candidates` 를 표로 전환하고 'Linked Schema' 컬럼 추가

`| Method | Path | Confidence | Linked Schema | Source |` 5컬럼 표. 현재 불릿(`- METHOD /path (confidence: ...)`)을 표로 전환하는 것을 포함한다. 매칭 키(스키마 이름)를 confidence 가 선언되는 **바로 그 행** 에 둔다.

- **매칭 키:** 스키마 export 식별자(예: `CouponDto`) — screen-spec 본문 표의 `Linked Schema` 셀에, method+path·confidence 와 **같은 행** 에 사람이 직접 선언.
- **Mechanism:** 새/교체 파서가 각 행을 `{method, path, confidence, linkedSchema, source}` 로 구조화 → `confidence==='confirmed'` 행만 필터(게이팅 유지) → 그 행의 `linkedSchema` 토큰을 실제 심볼(`src/api/schemas/*.ts` 의 export, 또는 `openapi.yaml` `components.schemas` 키)에 대조. **method+path 로 스키마를 추론하지 않으므로 path 정규화가 스키마 해소 경로에서 빠진다(이 옵션 고유의 최대 강점).**
- **파서 변경:** `parseApiCandidates` 는 라인 파서라 표를 못 읽는다 → (a) `parseTable` 재사용 표 파서로 교체하거나 (b) 신규 `parseApiCandidatesTable` 추가 후 검사 8 만 호출. **주의:** `parseApiCandidates` 는 `minApiConfidence`([spec.mjs](../../frontend-workflow-kit/scripts/lib/spec.mjs):322-333)→`deriveMetrics` 의 `api_confidence_min`(readiness 신호)도 먹인다. (a)로 교체하면 readiness 입력까지 바뀌므로, **표/불릿 양식을 모두 견디는 하위호환 파서**(표면 `parseTable`, 미발견 시 라인 폴백)가 안전. `col`(:97)은 현재 private → export 필요. 추가 신규: ① Linked Schema 셀 토크나이즈(N:1 이면 콤마 분리), ② **zod export 식별자 스캔**(`dirHasFiles` 는 파일 존재만 보므로 파일 내용 grep/AST 필요 — 가장 무거운 신규 작업), ③ OpenAPI 면 yaml 로드 후 `components.schemas` 조회.
- **마이그레이션:** **L.** `## API Candidates` 보유 16개 파일(템플릿 1 + 예제 screen-spec 15: coupon-feature 1 · multi-screen-dry-run 5 · input-reconciliation 9)을 전수 불릿→표 전환하고 Linked Schema·Source 셀을 채워야 함. 파서 교체가 readiness(`api_confidence_min`)·골든 fixture·테스트 스냅샷에 파급.
- **N:1:** 같은 스키마 이름이 여러 행에 반복 등장(행=엔드포인트 단위라 자연스러움). **약점은 교차-화면 중복 선언 drift** — 같은 `GET /coupons/{id}` 를 두 화면이 각자 적으면 Linked Schema 가 손으로 복제되고, 한쪽만 `CouponDto`→`CouponDetailDto` 로 바뀌면 두 화면이 같은 엔드포인트에 서로 다른 스키마를 주장한다. 옵션 A 자체엔 이를 잡는 canonical 출처가 없다(그건 옵션 C 의 영역).
- **FP:** 표기 불일치(`CouponDTO` vs `CouponDto`, `z.array(CouponDto)`) → 정규화 규약 없으면 "존재하는데 못 찾음"; 빈 셀이 일괄 에러로 폭발; 동명 심볼 오인(false-negative 잔존); 불릿/표 혼재 상태에서 `col` 느슨매칭이 컬럼을 못 잡아 무더기 오탐.
- **불변식 정합:** 1 — 정합(파서를 공유 라이브러리에 두면). 4 — Linked Schema 가 가리키는 사실 출처는 zod 심볼이라 정합하나, `Source` 가 OpenAPI 를 가리키면 사실 출처가 둘로 갈릴 소지 → "Linked Schema 의 진리값은 zod 우선" 명문화 필요. 7 — 결정적 파서 + 정렬·중복제거면 보존.
- **하드룰:** `frontmatter.schema.json`/`artifact-manifest.yaml` 무변경(키가 본문 표에 있음) → "schema 추가 금지"와 무충돌. 그러나 그 자리를 **문서 전수 마이그레이션 부담** 이 대체한다.

### 옵션 B — screen-spec frontmatter 에 `linked_schemas` 필드 추가

본문 `## API Candidates` 불릿은 그대로 두고, frontmatter 에 매칭 키를 신설.

- **매칭 키:** frontmatter 신규 키 `linked_schemas`. 권장 형태 (a) endpoint→schema 맵(`{"GET /coupons": CouponDto, "GET /coupons/{id}": CouponDto}`). 형태 (b) 단순 목록(`[CouponDto]`)은 "어느 엔드포인트가 어느 스키마"를 해소 못 해 엔드포인트 단위 매칭 목표를 못 이룬다.
- **Mechanism:** (1) `parseApiCandidates` 로 본문 confirmed 를 뽑되 method+path 를 새로 파싱 → (2) `frontmatter.linked_schemas` 를 읽어 같은 method+path 키로 스키마명 조회 → (3) 조회된 스키마명이 실제 존재하는지(zod export / OpenAPI) 검증. **매칭 키는 frontmatter, confidence 사실은 본문, 검증 대상은 코드/루트 — 출처가 3곳으로 흩어진다.**
- **파서 변경:** 4종 — ① `parseApiCandidates` 확장(method+path 추출) ② frontmatter 맵/목록 리더 ③ zod export 단위 스캔(신규) ④ path 정규화. `parseTable` 은 불필요(본문이 표 아님).
- **마이그레이션:** **M.** 키를 '필수'로 강제하려면 confirmed 후보 보유 screen-spec 전수에 키 추가 + 템플릿 1 + `artifact-manifest.yaml` 의 `screen-spec.required_frontmatter` 에 `linked_schemas` 추가(=schema류 변경, 검사 2 게이트). '선택'으로 두면 즉시 전수수정은 없으나 미선언 화면은 옛 존재검사로 남아 **강화가 opt-in 으로 희석** 된다. `frontmatter.schema.json` 은 `additionalProperties: true` 라 안 고쳐도 검사 1 통과 — 그러나 그게 곧 **"형태 무검증 = 자유통과"** 다.
- **N:1:** 맵(형태 a)으로 자연스럽게 표현. **약점은 이중 선언 drift** — endpoint 가 본문 불릿과 frontmatter 맵 키에 두 번 적힌다. 본문에서 path 를 고쳤는데 맵 키를 안 고치면 검사 8 이 오탐. 공유 엔드포인트는 화면 수만큼 맵에 복제된다.
- **FP:** opt-in 이면 미선언 화면 fail-open(놓침), 필수면 마이그레이션 전까지 전 화면 FP 폭발; 본문 vs 맵 키 표기 1바이트 어긋남 → 매칭 실패; `additionalProperties: true` 라 맵 형식 오류를 검사 1 이 못 잡아 검사 8 단계로 흘러 런타임 오탐.
- **불변식 정합:** 1 — 정합(단 `linked_schemas` 를 readiness fact 로 끌어올리면 위반 → 금지 명시). **4 — 부분 충돌:** frontmatter 의 endpoint→schema "주장"은 문서이지 코드가 아니다. export 단위 실재 검증을 반드시 동반하지 않으면 frontmatter 가 사실의 새 출처가 되어 zod 와 어긋날 수 있다. 7 — 정적 필드라 보존.
- **하드룰:** "결정"(매칭 키=frontmatter `linked_schemas`)은 가능. 단 필수화하면 `required_frontmatter` 수정이 따라오고, `linked_schemas` 형태(맵/목록·method enum·비빈값)를 schema 에 정의할지는 **별도 결정**(이 세션은 schema 추가 금지).

### 옵션 C — api-manifest `## Endpoints` 표를 canonical 로, ScreenSpec 은 (method+path) 참조만

api-manifest `## Endpoints` 표에 `Linked Schema` 컬럼을 신설해 **endpoint→schema 바인딩의 단일 출처** 로 삼는다. ScreenSpec `## API Candidates`(불릿 유지)는 (Method, Path) 로 그 행을 가리키기만 한다(스키마명을 ScreenSpec 에 적지 않음).

- **매칭 키:** **(Method, Path) 2-튜플.** 양쪽에 이미 존재한다 — ScreenSpec 불릿(`- GET /coupons (confidence: candidate)`)과 api-manifest 표(`| Method | Path | ... |`). schema 바인딩만 manifest 에 신설 `Linked Schema` 컬럼으로 단독 선언.
- **기존 `Response (요약)` 컬럼과의 관계(dual-source 방지):** api-manifest Endpoints 에는 이미 `Response (요약)` 컬럼이 있어 `CouponDto`·`CouponDto[]`·`{ token, user }` 같은 **사람용 서술값** 이 들어있다. 새 `Linked Schema` 는 **기계 검증용 canonical 포인터** 로 별개 컬럼이며, 검사 8 은 **오직 `Linked Schema` 만** 읽는다(`Response (요약)` 미독 — 둘이 달라도 검사 8 은 침묵). 자동 일관성 체크는 범위 밖(OD-8).
- **Mechanism:**
  ```txt
  (1) api-manifest.md 로드(validate 의 docs[] 가 artifact_type:api-manifest 로 이미 수집 → 별도 글롭 불필요)
      → ## Endpoints 를 parseTable 로 읽어 (정규화 method, 정규화 path) → {schema, manifestConfidence} 인덱스
  (2) 각 ScreenSpec confirmed 후보의 (method, path) 를 같은 정규화로 맞춰 인덱스 조회
  (3-a) manifest 에 행 없음        → "후보가 canonical 출처(api-manifest)에 미등록" 에러
  (3-b) 행 있으나 Linked Schema 빔  → "endpoint 에 스키마 미연결" 에러
  (3-c) Linked Schema(스키마 *이름*)가 가리키는 심볼 부재 → "지목 스키마 부재" 에러
        (이름 → zod export, 또는 OpenAPI 시 components.schemas[이름]. 엔드포인트 path 의 openapi.paths
         등재는 schema 해소가 아니라 §7 의 (3-d) 별개 보조검사)
  ```
  현행 전역 존재검사(`hasZod||hasOpenApi` 1회)가 endpoint 단위 3-스텝 해소로 바뀐다.
- **파서 변경:** 3종 — ① ScreenSpec 측 `parseApiCandidates` 확장(method+path 추출, **불릿 유지라 파서만 확장**) ② api-manifest `## Endpoints` 파서(신규지만 **`parseTable` 재사용** — `Method`/`Path`/`Linked Schema` col 추출) ③ path 정규화 유틸(method 대소문자·trailing slash·`{id}` 통일; **화면 route `[id]` 는 제외**). 단계 분리 권장: 1차는 파일 존재 근사(또는 OpenAPI 시 components.schemas 이름 존재) 수준, zod **심볼** 실재 확인은 2차(zod 파일 내용 파싱이라 범위↑).
- **마이그레이션:** **소비 프로젝트 기준** 문서 변경은 **S** — 그 프로젝트의 api-manifest.md **1개 파일** 에 Linked Schema 컬럼 + 행값. **ScreenSpec 전수수정 불필요**(불릿 유지, method+path 가 이미 들어있음). 단 **킷 자신의 골든 예제를 옮길 때는 트리마다 manifest 가 있어 대상이 복수** 다 — `examples/multi-screen-dry-run` · `examples/input-reconciliation/{project-before,expected-after,expected-llm-after}` 의 api-manifest.md 가 각각 컬럼을 받아야 한다(킷 마이그레이션은 §6 에서 1개 트리로 스코핑 권장). 코드(파서 3종)와 카탈로그 배선을 합치면 실질 **M.** (권장) `artifact-manifest.yaml` 에 api-manifest 등록(현재 미등록 — 검사 2 가 manifest 존재·경로를 보증하지 않음).
- **N:1:** **가장 자연스럽게 흡수.** manifest 가 엔드포인트 행의 집합이므로 한 스키마가 여러 행에 등장하는 게 정상(`| GET | /coupons | … | CouponDto[] |`, `| GET | /coupons/{id} | … | CouponDto |`). 같은 path 가 method 로 갈리는 케이스(`GET`/`PATCH /profile`)도 (Method,Path) 키가 자연 분해. **공유 엔드포인트는 manifest 행 1개를 N개 ScreenSpec 이 가리키므로 스키마명 중복 선언이 0** — 옵션 A/B 의 교차-화면 drift 를 구조적으로 방어. 단 drift 가 다른 축으로 이동: ScreenSpec path 와 manifest Path 의 표기 동기화 책임, confidence 이원화(ScreenSpec 후보 vs manifest 행 — 게이트 트리거는 **ScreenSpec 후보 confidence**, manifest confidence 는 정보용으로 못박을 것).
- **FP:** 경로 표기 불일치로 미등록 오탐 — 단 `{id}`↔`{couponId}` 같은 **파라미터명 차이는 normEndpoint 가 정규화로 흡수**(→ §8 PASS-3)하므로 FP 가 아니다. 실제 위험은 정규화가 못 잡는 **세그먼트 차이(`/coupon` vs `/coupons`)·대소문자·쿼리스트링**; **manifest 부재/미등록 시 정책 필요**(권장: manifest 없으면 검사 8 을 현행 전역 존재검사로 폴백); draft manifest 의 미완성 행이 confirmed 화면을 막는 역설; 화면 route 를 이 축에 섞으면 전량 오탐.
- **불변식 정합:** **4 — 4개 중 최선.** schema 의 진실은 zod(코드), manifest 의 Linked Schema 는 endpoint→코드 심볼 **포인터** 일 뿐. ScreenSpec 은 참조만 하므로 문서가 코드 사실을 복제·선점하지 않는다. (긴장: manifest 헤더 주석이 스스로를 "미확정 API 의 단일 출처, 확정분은 zod 로 이관"이라 하는데 검사 8 트리거는 confirmed 후보 → "Linked Schema 는 schema **정의** 가 아니라 코드 심볼로의 **참조**"임을 명문화해 봉합.) 1 — 매칭 로직 전부 validate 거주, readiness 무변경. 7 — `parseTable` 의 빈 줄 관대 처리([spec.mjs](../../frontend-workflow-kit/scripts/lib/spec.mjs):64)로 표 재정렬·공백 변화에 안정.
- **하드룰:** **frontmatter.schema.json 변경이 전혀 필요 없는 유일 계열에 가깝다**(새 frontmatter 키 없음, 매칭 키가 본문 표/불릿에 있음). "매칭 키=(Method,Path), schema 바인딩=manifest Linked Schema" 규약만 적으면 결정으로 완결. (권장) 카탈로그 등록은 schema류 변경이라 **별도 결정 항목** 으로 분리.

### 옵션 D — OpenAPI only mode: `openapi.yaml`.paths 가 confirmed 계약의 단일 출처, zod 는 codegen 파생

`openapi.yaml` 의 `paths:` 가 확정 계약의 canonical 이고, zod 는 거기서 코드젠으로 파생된 산출물(신뢰 출처 아님)로 간주.

- **매칭 키:** OpenAPI 의 method+path 쌍(`paths:` 맵의 경로 키 + 하위 HTTP 메서드). ScreenSpec 의 METHOD/path 는 그 키를 참조만.
- **Mechanism:** (1) ScreenSpec confirmed 후보를 method+path 파서로 추출 → (2) `openapi.yaml` 을 `yamlParse` 로 읽어 paths 를 `{METHOD path}` 집합으로 평탄화(`paths./coupons/{id}.get` → `GET /coupons/{id}`) → (3) 정규화 후 존재하면 pass, 없으면 fail. schema 명까지는 `$ref`(`#/components/schemas/CouponDto`)로 한 번 더 따라가는 **선택적 2차** 단계. zod 파일과 직접 매칭하지 않는다.
- **파서 변경:** ① ScreenSpec method+path 추출(불릿 유지, 정규식 1개) ② **OpenAPI paths 파서 신규** — 다행히 킷이 이미 `yaml`(^2.5.0)과 `readYaml`/`yamlParse`([util.mjs](../../frontend-workflow-kit/scripts/lib/util.mjs):6)를 가져 **새 npm 의존성 불필요** ③ path 정규화 — OpenAPI 파라미터명이 임의(`{id}`/`{couponId}`)라 중괄호를 placeholder 로 치환(`\{[^}]+\}`→`{}`).
- **마이그레이션:** 문서 측은 **작음**(불릿 유지 → ScreenSpec 본문·템플릿 무변경). 그러나 **구조적 blast radius 가 큼**: confirmed 매칭이 의미를 가지려면 프로젝트에 `openapi.yaml` 이 실재하고 confirmed 엔드포인트가 모두 거기 등재돼야 한다. **현 골든 예제엔 `openapi.yaml` 이 없고 확정 계약이 api-manifest.md(draft)에만 있다** → 예제용 openapi.yaml 신규 작성 또는 "부재 시 skip" 정책이 선결. 종합 **M**, 단 선결 결정 수가 가장 많음.
- **N:1:** OpenAPI paths 가 엔드포인트별 1행이고 schema 정의는 `$ref` 로 1회만 선언 → 중복 선언 drift 구조적으로 없음(옵션 C 와 동급). 단 ScreenSpec↔openapi 사이 method+path **참조 drift** 는 잔존.
- **FP:** `openapi.yaml` 부재 시 정책 미정이면 대량 오탐; 파라미터명 불일치/trailing slash/쿼리스트링; `$ref` 외부화·다중 파일 분할 시 단순 `yamlParse` 로 못 모음; **zod-only(코드 우선) 합법 프로젝트에서 confirmed 매칭 불가** → 불변식 4 환경과 충돌.
- **불변식 정합:** **4 — ★방향 충돌(핵심).** 현 킷은 zod(코드)를 사실 출처로 보는데, 옵션 D 는 `openapi.yaml`(스펙)을 confirmed 단일 출처로 **승격** 하고 zod 를 파생물로 **강등** 한다. 사실 출처가 코드→스펙으로 역전 — 단순 강화가 아니라 **불변식 4 의 재정의** 를 요구. 추가로 `forbidden-paths.mjs`([forbidden-paths.mjs](../../frontend-workflow-kit/scripts/forbidden-paths.mjs):39-43)가 `openapi.yaml` 을 *api-integrated-ui §8 미결 surface* 로 취급("현재 정책에 openapi.yaml 를 allow 하는 모드가 없음")하므로 **모드/경로 정책과도 선결 충돌**. 1 — 정합(매칭은 validate 거주). 7 — 결정적 파싱이면 보존.
- **하드룰:** "결정"은 가능하나, 후속 선결 사항이 다른 옵션의 1건(linked_schema 규약)이 아니라 **여러 건**(openapi 부재 정책 · 불변식 4 재정의 · forbidden-paths 지위 · 코드젠 파이프라인)이라 도입 비용이 가장 분산적.

### 비교 표

```txt
                          A (표+컬럼)      B (frontmatter)   C (manifest canonical)  D (OpenAPI only)
------------------------- ---------------- ----------------- ----------------------- ----------------------
매칭 키                   Linked Schema셀  linked_schemas    (Method,Path)+manifest  openapi.yaml paths
                          (스키마 식별자)  (frontmatter 신규) Linked Schema 컬럼      (method+path)
매칭 키가 이미 존재?      아니오(셀 신설)  아니오(키 신설)   예(양쪽에 method+path)  예(openapi paths)
키 거주지                 ScreenSpec 본문  ScreenSpec frontm. api-manifest(+ScreenSpec) openapi.yaml
confidence↔키 co-location 예(같은 행)★     아니오(본문/fm)   아니오(ScreenSpec/man.) 아니오(ScreenSpec/yaml)
------------------------- ---------------- ----------------- ----------------------- ----------------------
문서 마이그레이션 규모    L (16파일 전수)  M (전수 or opt-in) S (manifest 1파일)★     작음(불릿 유지)
ScreenSpec 전수수정?      예(불릿→표)      예(또는 희석)     아니오★                 아니오
파서 신규/재사용          parseTable재사용 본문파서+fm리더+  parseApiCand.확장+      방식+OpenAPI파서신규
                          +교체 회귀위험   export스캔        parseTable재사용        (yaml 기존)
------------------------- ---------------- ----------------- ----------------------- ----------------------
N:1 / 공유엔드포인트      행 반복(가능)    맵(가능)          행 1개·참조 N★          paths 1행·$ref 1★
중복 선언 drift           높음(화면마다)   높음(화면마다)    없음(canonical)★        없음(canonical)★
------------------------- ---------------- ----------------- ----------------------- ----------------------
불변식 4 (zod=코드)       정합(Source주의) 부분충돌(주장↔코드) 최선(포인터)★          ★방향 충돌(역전)
frontmatter schema 추가?  불필요★          필수화시 필요     불필요★                 불필요
하드룰 추가 선결          표기 규약        required_frontm.  (카탈로그 등록=별도)    다수(4↑)
------------------------- ---------------- ----------------- ----------------------- ----------------------
경로 정규화 필요?         스키마해소엔 불요 매칭에 필요       매칭에 필요             매칭에 필요
                          (중복검출엔 필요)
고유 강점                 키 co-location   본문 비파괴       마이그S+불변식4+DRY     계약우선팀 표준
고유 약점                 전수 L+교차drift 출처 3분할+검증공백 manifest stale 의존    불변식4 역전+무거운전제
```

(★ = 추천 기준에서 그 옵션의 우위 지점. 단 '문서 마이그레이션 규모'의 *1파일/작음* 은 **소비 프로젝트 기준** 이다 — 킷 골든 예제를 옮길 땐 트리별 manifest 가 있어 대상이 복수: §4·§6.)

---

## 5. Recommended option (추천)

### 결정: **옵션 C — api-manifest `## Endpoints` 를 endpoint→schema canonical 로 두고, ScreenSpec 은 (Method, Path) 로 참조** 를 채택한다.

추천 기준(가중치 높은 순)으로 채점하면 C 가 다섯 축에서 앞선다:

1. **마이그레이션 blast radius(최고 가중치):** C 는 문서 변경이 **(소비 프로젝트당) api-manifest.md 1개 파일**(Linked Schema 컬럼 1개 추가)로 끝난다(킷 골든 예제는 트리마다 manifest 가 있어 대상이 복수 — §4·§6). ScreenSpec 은 불릿 형식을 유지하고 이미 method+path 를 담고 있어 **전 screen-spec/템플릿을 건드리지 않는다.** A 는 16파일 전수 불릿→표 전환(L), B 는 전수 frontmatter 추가(M) 또는 opt-in 희석. 이 기준에서 C 가 압도적이다.
2. **DRY / N:1:** C 는 schema 바인딩이 manifest **한 곳** 에만 산다. 공유 엔드포인트(여러 화면이 `GET /coupons` 참조)는 manifest 행 1개를 N개 화면이 가리키므로 **스키마명 중복 선언 drift 가 구조적으로 0.** A/B 는 화면마다 Linked Schema 를 복제해 같은 엔드포인트의 스키마가 화면 간 어긋날 수 있다.
3. **불변식 정합(특히 4=zod 코드):** C 는 manifest 의 Linked Schema 가 zod 심볼로의 **포인터** 일 뿐 schema 정의를 복제하지 않아 불변식 4 와 **가장 잘 맞는다.** D 는 사실 출처를 코드→스펙으로 역전시켜 불변식 4 재정의가 필요하다 — *영구 기각이 아니라 후속 "옵트인 모드"로 둘 수 있다*(아래 참조).
4. **매칭 키가 이미 존재하는가:** C 의 (Method, Path) 는 ScreenSpec 불릿과 api-manifest 표 **양쪽에 이미** 있어 **새 규약을 발명하지 않는다.** 파서도 `parseTable` 재사용. A 는 셀 신설, B 는 frontmatter 키 신설(저작 비용↑).
5. **하드룰(스키마 추가 회피):** C 는 `frontmatter.schema.json` 변경이 **전혀 필요 없다.** B 는 필수화 시 `required_frontmatter` 변경(검사 2)을 동반한다.

**약점의 정직한 평가.** C 의 신뢰 기반이 `status: draft`·게이트 밖 문서(api-manifest)로 옮겨가는 것이 본질적 trade-off다. manifest 가 stale/미완성/누락이면 검사 8 이 무더기 오탐 또는 조용한 skip 으로 무력화된다. 이를 §7·§9 의 두 규칙으로 봉합한다: **(a) manifest 부재 시 현행 전역 존재검사로 폴백**(엄격 모드로 깨지 않음), **(b) Linked Schema 는 schema 정의가 아니라 코드 심볼 포인터** 라고 명문화(불변식 4 봉합). 또한 매칭 키가 ScreenSpec·manifest 두 파일에 중복 존재해 **표기 동기화 책임** 이 생기는데, 이는 §7 의 path 정규화 규칙(단일 함수)으로 흡수한다.

**기준 6(co-location)에서만 A 가 우위** 다 — A 는 confidence 와 매칭 키가 같은 행에 있어 한 종류의 drift(키-confidence 어긋남)를 없앤다. 그러나 이 이점은 가중치 최상위인 기준 1(마이그레이션)·기준 2(DRY)에서 A 가 치르는 비용(16파일 전수 + 교차-화면 drift)을 상쇄하지 못한다. C 는 confidence↔키 co-location 을 포기하는 대신 그 drift 를 "ScreenSpec confidence 가 게이트 트리거, manifest confidence 는 정보용"이라는 **단일 트리거 규칙** 으로 관리한다.

### 기각 사유

- **A 기각:** 강화 효과 자체는 충분하나(키 co-location 으로 path 정규화를 스키마 해소에서 제거하는 고유 강점 인정), **16파일 전수 불릿→표 마이그레이션 + 파서 교체의 readiness 회귀** 라는 1회성 blast radius 가 기준 1 에서 결정적으로 불리하다. 교차-화면 중복 drift 도 기준 2 에서 C 에 밀린다. ([diff-based-forbidden-paths-backstop.md](./diff-based-forbidden-paths-backstop.md) 류의 1파일 backstop 과 비교하면 blast radius 차이가 분명하다.) — **단, A 의 Linked Schema 컬럼 발상은 옵션 C 의 manifest 컬럼으로 흡수된다**(아래 하이브리드 주석).
- **B 기각:** 본문에 method+path 가 이미 있는데 매칭 키만 frontmatter 로 빼는 것은 **출처를 둘로 쪼개는 역행** 이다(출처 3분할: 키=frontmatter, confidence=본문, 검증=코드). `additionalProperties: true` 의 "추가는 공짜"가 곧 "형태 무검증"이라 검증 공백을 남기고, 강화 효과가 도입 방식(선택/필수)에 종속된다. 진짜 canonical(C)이 존재하므로 frontmatter 분산은 열위.
- **D 기각(영구 아님, 옵트인 후보로 보류):** 불변식 4 를 **역전**(zod→generated)시키고 `forbidden-paths.mjs` §8 미결과 충돌하며, 현 골든 예제에 `openapi.yaml` 이 없어 "부재 시 skip" 선결까지 필요하다. 디폴트로 삼기엔 전제가 무겁다. **그러나 계약 우선(contract-first) 팀에는 사실상 표준** 이므로, 후속에 **프로젝트 옵트인 모드**("이 프로젝트는 OpenAPI 를 confirmed 출처로 본다")로 둘 수 있는지를 §10 의 열린 결정으로 남긴다. C 와 D 는 출처 철학이 정면 대립하므로(api-manifest canonical vs openapi canonical) **디폴트는 하나만** — 그 디폴트가 C 다.

### 하이브리드 주석 (C 를 기본으로, A 의 컬럼 발상 + D 를 모드로)

추천은 순수 옵션 C 다. 다만 두 가지를 명시적으로 흡수한다:

- **A 흡수:** "Linked Schema 컬럼"이라는 A 의 핵심 발상을 ScreenSpec 표가 아니라 **api-manifest `## Endpoints` 표** 에 둔다. 즉 *컬럼은 쓰되 거주지를 canonical 로 옮긴다* — A 의 명시적 매칭 키 강점은 살리고, A 의 전수 마이그레이션·교차-화면 drift 약점은 버린다.
- **D 는 모드로 보류:** OpenAPI 가 있는 프로젝트는 후속에 옵트인으로 D 경로(openapi.yaml paths 매칭)를 켤 수 있게 설계 여지를 남기되, **디폴트 사실 출처는 zod(불변식 4)** 로 유지한다. C 의 (3-c) 단계에서 "zod 심볼 부재"를 검증하는 것이 디폴트이고, OpenAPI 는 보조(또는 옵트인 시 1급).

---

## 6. Migration plan (마이그레이션 계획)

**이 세션은 제안만 한다.** 아래는 후속 세션이 옵션 C 를 도입할 때의 단계 순서이며, 각 단계가 어느 하드룰에 닿는지 표시한다. ([mvp-b-validation-candidates.md](./mvp-b-validation-candidates.md) 의 후보 1 = **Phase 4**(도입 순서 `5→3→4→6→1→2` 중 다섯째)에 해당.)

```txt
[이 세션 — 결정만]
S0. 규약 확정(이 문서): 매칭 키=(Method,Path); schema 바인딩=api-manifest ## Endpoints 의 Linked Schema 컬럼;
    사실 출처=zod(포인터 규약); manifest 부재 시 전역 존재검사 폴백; 게이트 트리거=ScreenSpec confidence.

[후속 세션 — 구현. 권장 순서]
P1. 골든 예제 트리들(multi-screen-dry-run·input-reconciliation/*)의 api-manifest.md 에 Linked Schema 컬럼+행값.  ← 문서
      (소비 프로젝트는 1개 / 킷 예제는 트리별 복수 — 초기엔 1개 트리만 스코핑해 시작 권장)
      | Method | Path | 용도 | Response (요약) | confidence | Linked Schema |
P2. spec.mjs: parseApiCandidates 에 method+path 추출 확장(불릿 유지, 하위호환).  ← 코드
      ※ minApiConfidence/deriveMetrics(api_confidence_min) 공유 경로라 readiness 회귀 점검 필수.
P3. spec.mjs: api-manifest ## Endpoints 파서 신규(parseTable 재사용) + path 정규화 유틸.  ← 코드
P4. validate.mjs 검사 8 본문 교체: 전역 존재 → endpoint 3-스텝 해소(§7).        ← 코드
P5. 회귀 fixture 추가(§8) — confirmed 를 쓰는 신규 케이스는 별도 디렉터리로 격리(골든 멱등성 보호). ← 테스트
P6. (별도 결정 후) artifact-manifest.yaml 에 api-manifest 등록(path/required_frontmatter).
      ← schema류 변경(검사 2). 이 세션 범위 밖 — §10 의 열린 결정으로 분리.
```

핵심: **소비 프로젝트 기준 P1 의 문서 변경이 1파일**(킷 예제는 트리별 복수)이고 ScreenSpec 전수수정이 없다는 점이 옵션 C 채택의 실익이다. P2–P4 는 코드 변경이지만 `parseTable` 재사용으로 신규 인프라가 적다. zod **심볼** 존재 검증(P4 의 3-c)은 단계 분리해 1차는 파일 존재 근사로 시작할 수 있다.

---

## 7. validate.mjs check 8 extension plan (검사 8 확장 계획)

코드는 쓰지 않는다 — **계약과 알고리즘** 만 고정한다.

### 입력/출력 계약 (현행 경계 유지)

```txt
입력:   docs/ 트리에서 수집한 specs[](screen-spec)와 api-manifest(artifact_type:api-manifest).
        manifest 개수: 0 → step0 폴백 · 1 → canonical · ≥2(한 docs 트리) → 에러('api-manifest 중복')
        또는 Endpoints 병합(OD-1 과 함께 후속 결정). 한 소비 프로젝트엔 보통 1개.
        + srcDir/api/schemas/*.ts(zod 심볼 — 1차는 파일 존재, 2차는 export 스캔), + openapi.yaml(선택/옵트인).
출력:   add(8, spec.path, message) 형태의 에러 누적. exit 0/1 게이트.
불변:   git 의존 없음. 매칭 로직은 validate 거주(불변식 1). readiness 입력 신호 불변(공유 파서 회귀 금지).
```

### 알고리즘 (endpoint 3-스텝 해소)

```txt
0) manifest 존재 확인.
   - api-manifest 없음 → 폴백: 현행 전역 존재검사(hasZod||hasOpenApi) 그대로 수행. (엄격 모드로 깨지 않음)
1) manifest ## Endpoints 인덱싱:
   parseTable → 각 행에서 col(row,'Method'), col(row,'Path'), col(row,'Linked Schema') 추출
   → key = normEndpoint(method, path), value = { schema: linkedSchemaCell, manifestConfidence }
2) 각 screen-spec 에 대해:
   items     = parseApiCandidates(## API Candidates)        // 확장: {method, path, confidence}
   confirmed = items.filter(confidence === 'confirmed')      // 게이트 트리거 = ScreenSpec confidence
   각 confirmed 엔드포인트 e:
     k = normEndpoint(e.method, e.path)
     (3-a) manifest 인덱스에 k 없음        → add(8, "...에 미등록...")
     (3-b) 인덱스[k].schema 비었음          → add(8, "...스키마 미연결...")
     (3-c) 인덱스[k].schema(스키마 *이름*)가 가리키는 심볼 부재 → add(8, "...지목 스키마 부재...")
            해소 대상은 '스키마 이름'이다(엔드포인트 path 가 아님):
            - 디폴트(zod=사실): 그 이름이 src/api/schemas/*.ts 의 export 인가
              (1차=파일 존재 근사·현행 dirHasFiles 수준 → 2차 후속=export 식별자 스캔으로 심볼 실재 확인).
            - OpenAPI 보유 시: 그 이름이 components.schemas[이름] 에 있는가.
     (3-d) (선택 보조검사) 엔드포인트 (method,path) 자체가 openapi.yaml paths 에 등재됐는가 —
            (3-c) 의 이름 해소와 별개 신호다. 디폴트 게이트는 (3-c).
```

### 정규화 규칙 (`normEndpoint`)

```txt
method   대문자화(GET/POST/PUT/PATCH/DELETE).
path     trailing slash 제거; 중괄호 파라미터명 무시 — \{[^}]+\} → {} 로 치환
         (/coupons/{id} 와 /coupons/{couponId} 를 동일 키로).
★금지:   화면 route([id]) 를 이 정규화에 넣지 말 것. route(화면 축)와 API path(엔드포인트 축)는 별개.
         screen-spec frontmatter.route 는 이 검사에서 읽지 않는다.
```

### 출력 메시지 예시 (2건)

```txt
[검사 8] (coupons/coupon-detail) confirmed API 'GET /coupons/{id}' 가 api-manifest ## Endpoints 에 미등록 →
  해소: api/api-manifest.md 의 Endpoints 표에 | GET | /coupons/{id} | ... | <Linked Schema> | 행을 추가하세요.

[검사 8] (coupons/coupon-detail) confirmed API 'GET /coupons/{id}' 의 Linked Schema 'CouponDto' 에 대응하는
  zod export(src/api/schemas/*.ts)/OpenAPI components.schemas 가 없음 →
  해소: CouponDto 를 src/api/schemas 에 정의하거나, manifest 의 Linked Schema 표기를 실제 export 이름과 일치시키세요.
```

메시지 설계 원칙: (1) 어느 화면·어느 엔드포인트인지 항상 명시, (2) "해소:" 한 줄로 다음 행동을 지시(미등록 vs 미연결 vs 심볼 부재를 구분), (3) 게이트를 내리는 일(스키마 정의·confirmed 승격)은 사람 전용임이 메시지에서 드러나게.

---

## 8. Fixture plan (fixture 계획)

`docs` 트리·git 없는 검사 8 특성에 맞춰, 최소 api-manifest + screen-spec + (1차) 스키마 파일 존재를 짝지어 구성한다. **모두 후속 구현 시.** confirmed 를 쓰는 신규 fixture 는 **별도 디렉터리로 격리** 한다(현 골든 예제는 confirmed 0건이라 검사 8 무발화 상태 — 골든 멱등성을 깨지 않기 위함).

```txt
[PASS-1 정상 해소]
  ScreenSpec: "- GET /coupons (confidence: confirmed)"
  manifest:   | GET | /coupons | ... | CouponDto[] |   + src/api/schemas/coupon.ts(CouponDto)
  → 무에러, exit 0.

[PASS-2 N:1]
  ScreenSpec: confirmed "GET /coupons" + "GET /coupons/{id}"
  manifest:   GET /coupons → CouponDto[],  GET /coupons/{id} → CouponDto  (같은 CouponDto 로 해소)
  → 무에러 (N:1 반복 선언 정상).

[PASS-3 파라미터명 정규화]
  ScreenSpec: "GET /coupons/{id} (confidence: confirmed)"
  manifest:   | GET | /coupons/{couponId} | ... | CouponDto |
  → normEndpoint 가 {…}→{} 치환하므로 두 path 가 동일 키로 매칭 → 무에러 (파라미터명 차이 정규화 회귀 가드).

[FAIL-1 미등록]
  ScreenSpec: "- DELETE /coupons/{id} (confidence: confirmed)"
  manifest:   해당 (method,path) 행 없음
  → "[검사 8] confirmed API 'DELETE /coupons/{id}' 가 api-manifest 에 미등록".

[FAIL-2 미연결 / 진짜 path 불일치]
  (a) manifest 행은 있으나 Linked Schema 빈칸 → "스키마 미연결".
  (b) ScreenSpec "GET /coupons/{id}" 인데 manifest 엔 다른 세그먼트("GET /coupon/{id}")만 존재
      → normEndpoint 후에도 키 불일치 → "미등록".
  ※ {id} vs {couponId} 는 정규화로 매칭되므로(=PASS-3) 불일치 사례가 아니다.

[FAIL-3 심볼 부재]  (2차 — export 스캔 구현 시)
  manifest: GET /coupons/{id} → CouponDetailDto  인데 어떤 .ts 도 그 이름을 export 안 함
  → "지목 스키마 부재" (현행 전역 존재검사로는 통과했을 케이스 — 강화 효과 입증).

[EDGE 폴백]  manifest 파일 자체가 없는 프로젝트 + confirmed 후보 존재
  → 현행 전역 존재검사로 폴백되는지 검증(엄격 모드로 깨지지 않음).

[NEG 비퇴행]  confidence 가 candidate 뿐 / confirmed 0건
  → manifest Linked Schema 없어도 무에러(옛 동작 유지·비-FP 가드).

[멱등성]  PASS-1 을 두 번 실행해 동일 출력 확인(불변식 7).
```

---

## 9. False-positive risks (오탐 위험 — 통합)

옵션 C 채택 기준으로 정리하고 완화책을 단다.

```txt
위험                                  발생 원인                                완화책
------------------------------------- ---------------------------------------- ------------------------------------------
1. manifest 부재/미등록 무더기 오탐   confirmed 있는데 manifest 파일 없음/      §7 step0 폴백: manifest 없으면 현행
   또는 조용한 skip                    ## Endpoints 깨짐                          전역 존재검사로 떨어진다(엄격X).
2. 경로 표기 불일치                   {id} vs {couponId} vs trailing slash      normEndpoint 정규화(중괄호 placeholder
                                                                                 치환·slash 제거).
3. 화면 route 혼동                    /coupons/[id] 를 API 축에 섞음            정규화에서 route 제외 명문화. frontmatter.
                                       (네임스페이스 혼동)                       route 는 이 검사에서 읽지 않는다.
4. Linked Schema 미기재/오타          draft manifest 의 미완성 행이 confirmed   (3-b)/(3-c) 메시지로 "미연결" vs "부재"
                                       화면을 막음                               구분 + "해소:" 한 줄 안내.
5. draft↔confirmed 비대칭             화면은 confirmed 인데 manifest 행은       이는 진성 신호일 수 있음 — 막되 메시지로
                                       candidate/미연결                          다음 행동 명시(manifest 갱신 지시).
6. confidence 이원화 모호             ScreenSpec 후보 vs manifest 행 confidence 단일 트리거 규칙: 게이트는 ScreenSpec
                                                                                 confidence, manifest confidence 는 정보용.
7. 동명 심볼 오인(false-negative)     1차 파일존재만 보면 무관 도메인 동명      2차 export 스캔으로 심볼 실재 확인(범위↑).
                                       export 통과                               1차에서는 한계로 surface.
8. 표 파싱 멱등성                     표 재정렬·공백 변화                       parseTable 의 빈 줄 관대 처리(:64) 활용,
                                                                                 인덱스 정렬·중복제거.
9. (옵션 A 였다면) 불릿/표 혼재       부분 전환·헤더 오타로 col 미스            C 는 ScreenSpec 불릿 유지라 이 위험을
                                                                                 회피(A 고유 약점이 C 에선 소거됨).
```

특히 위험 1·5 가 옵션 C 의 핵심 신규 오탐원이다 — 둘 다 "검사 8 의 신뢰가 게이트 밖 draft 문서로 옮겨감"에서 비롯한다. 폴백(완화 1)과 단일 트리거 규칙(완화 6) + 명확한 메시지(완화 4·5)로 운영 마찰을 진성 신호와 구분한다.

---

## 10. Open Decisions (남은 결정 — 후속 세션)

이 문서는 매칭 키 거주지 하나를 정한다. 다음은 후속 세션이 정해야 할 결정이며, 일부는 schema류 변경이라 이 세션 범위 밖이다.

```txt
OD-1. api-manifest 의 catalog 등록.  현재 artifact-manifest.yaml 에 api-manifest 가 path/
      required_frontmatter 로 등록돼 있지 않다 → 검사 2 가 manifest 존재·경로·필수필드를 보증하지 못한다.
      등록 여부 = schema류 변경(검사 2 게이트). 옵션 C 가 견고하려면 사실상 선결이나, 이 세션은 결정만.

OD-2. Linked Schema 검증 강도(1차/2차).  해소 대상은 '스키마 이름'(§7 3-c): 1차=zod 파일 존재 근사 또는
      (OpenAPI 시) components.schemas 이름 존재 · 2차=zod export 심볼 스캔(파일 내용 파싱·범위↑). 엔드포인트
      path 의 openapi.paths 등재(§7 3-d)는 별개 보조검사 — 켤지 여부도 함께. 어디까지를 MVP-B 1차로 볼지.

OD-3. ✅ 결정(이 문서): manifest 부재 시 **현행 전역 존재검사로 폴백** — S0·§7 step0·§9 위험1 과 일치(엄격 모드로
      게이트가 깨지지 않음). 잔여 하위질문(게이트 영향 없음): confirmed 후보가 있는데 manifest 부재일 때
      '조용한 폴백' vs '경고(warning-first) 한 줄' — severity 만의 후속 결정.

OD-4. confidence 단일 트리거 확정.  "게이트=ScreenSpec confidence, manifest confidence=정보용" 을 규약으로
      못박을지(본 문서 권장).

OD-5. OpenAPI 옵트인 모드(옵션 D 보류분).  contract-first 프로젝트가 "openapi.yaml 을 confirmed 출처로 본다"를
      프로젝트 단위로 켤 수 있게 할지. 켜면 불변식 4 와의 관계를 open-decisions.md 에 정식 결정으로 올려야 하고,
      forbidden-paths.mjs §8(openapi 미결 surface) 지위 정리가 선결. 디폴트는 C(zod=사실) 유지.

OD-6. api-manifest 템플릿.  현재 킷엔 api-manifest 템플릿 파일이 없다. Linked Schema 컬럼을 표준 헤더로
      반영한 템플릿을 둘지(도입 시).

OD-7. Linked Schema 표기 정규화.  스키마명 대소문자/접미사/래핑(z.array(CouponDto)) 허용 범위와 정규화 규칙.

OD-8. Response (요약) ↔ Linked Schema 일관성.  기존 Response (요약)(사람용 서술)와 새 Linked Schema(기계
      포인터)가 어긋날 때 자동 경고를 둘지. 검사 8 은 Linked Schema 만 보므로(§4) 게이트엔 무영향 — 별도 lint 후보.
```

---

## 11. What not to implement yet (지금 하지 말 것)

**이 세션 하드룰 (반드시 준수):**

- `validate.mjs` / 템플릿(`screen-spec.template.md`) / 예제(`examples/**`) / `package.json` **수정 금지.**
- frontmatter 스키마(`frontmatter.schema.json`) 또는 `artifact-manifest.yaml` 의 `required_frontmatter` **추가/변경 금지.**
- 산출물은 **이 제안서 1개 파일** 뿐. 코드/파서/fixture 작성 금지.

**즉, 이 세션의 결과물은 "매칭 키 규약 결정"이라는 텍스트 합의뿐이다.** §6–§9 의 모든 단계(P1–P6, 파서 확장, 검사 8 본문 교체, fixture)는 **후속 세션 몫** 이며 여기서는 계획으로만 기술했다.

**영구 제외 / 다른 결정에 묶인 것:**

- 옵션 C 의 매칭 로직을 `readiness` 로 옮기지 않는다(불변식 1 — 판정 단일 출처). 검사 8 은 `validate` 의 정적 IO 검사로 남는다.
- `linked_schemas` 같은 신규 frontmatter 키를 만들지 않는다(옵션 B 기각 — 매칭 키는 본문/ manifest 에 둔다).
- 디폴트 사실 출처를 zod 에서 OpenAPI 로 역전시키지 않는다(옵션 D 디폴트 기각 — 불변식 4 유지). OpenAPI 는 OD-5 의 옵트인 모드로만 검토한다.
- LLM 이 `## API Candidates` 의 confidence 를 `confirmed` 로 승격하거나, manifest 행을 confirmed 로 만드는 일은 금지(게이트 하강은 사람 전용). 강화된 검사 8 도 이 규약을 바꾸지 않는다.
