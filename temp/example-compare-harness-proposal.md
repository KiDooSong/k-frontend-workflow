# (제안) example-compare 회귀 하니스 — reconcile-input dry-run 자동 대조

> 상태: **제안 초안** (킷 외부, `temp/`). 로드맵 후보 ③(reconcile-input 후속 — Register hook/CI 강제)의 **선행 도구**.
> ⚠️ 이것은 `roadmap-current.md` "다음 구현 후보"에 명시된 항목이 **아니다.** GPT 리뷰가 "MVP-B Phase 0"라 칭했으나
> roadmap 에는 그런 단계/이름이 없다(후보는 ①Work Packet ②forbidden_paths backstop ③reconcile-input vendor+hook/CI).
> 채택하려면 **후보 ③의 첫 스텝으로 명시적으로 선택**할 것. (그전까지 스크립트는 untracked 초안으로 둔다.)

## 동기
`reconcile-input-001/002` dry-run 에서 `actual-llm-after` ↔ `expected-llm-after` 대조를 손으로(hash+grep) 했다.
이걸 스크립트로 굳히면 — (a) 회귀(예: U-001 닫기 재발, U-002 재신설)를 즉시 잡고, (b) 후보 ③의 hook/CI 가 호출할 **판정기**가 생긴다.

## 어디에 들어가나 (로드맵 정합)
- **후보 ③** "reconcile-input 후속 — Register hook/CI 강제"의 선행 도구. CI 가 dry-run 출력을 expected 와 대조하려면 비교기가 필요하다.
- **새 산출물 축 아님**(테스트 인프라, `validate.mjs` 계열). **readiness 게이트 아님** — fixture 출력 검사일 뿐. → "지금 하지 말 것"(게이트 신설·축 추가) 위반 아님.

## 설계
1. **파싱 단일 출처 재사용**: 직접 md 파싱 금지. `lib/spec.mjs`(`parseTable`, `loadScreenSpec`, `splitFrontmatter`)를 그대로 쓴다 — validate/readiness 와 동일 파서라 표류 없음.
2. **stage-aware** (GPT 단일-stage 제안의 일반화): 같은 항목을 두 방향으로 검사.
   - `llm-after`: D-001/D-003/D-204·C-001·U-001 = **open 유지**, COUPON-001 `status` != confirmed, G-001 != accepted. (LLM 은 올리기만)
   - `after`(human-final): 같은 결정/충돌/unknown 이 resolved, COUPON-001 confirmed. **단 G-001 은 expected-after 도 open**(accept 는 사람) — 그래서 기대값을 ID별 manifest 로 둔다(일괄 반전 금지).
3. **manifest 기반** (GPT 하드코딩 제안의 일반화): 검사 대상 ID·stage별 기대 상태를 fixture manifest 로 선언 → 다른 fixture(`multi-screen-dry-run` 등)로 확장 가능.
4. **검사 3종**: 파일 존재(E) · register N행 reconciled(R) · 금지 전이 부재(F).

## MVP 범위 (이번 C — `scripts/example-compare.mjs`)
- `stage=llm-after` 만 구현. manifest 는 스크립트 내부 상수(외부 YAML 화는 후속).
- `input-reconciliation` fixture 고정. 출력: 체크별 ok/FAIL + 요약 + exit 0/1.
- 데모: `--actual reconcile-input-002` → **PASS**, `--actual reconcile-input-001` → **FAIL**(U-001 resolved + U-002 신설 검출). 즉 하니스가 그 회귀를 실제로 잡는다.

## 후속 (채택 시)
- `after`-stage 단언, manifest 외부화(YAML), 다른 fixture 추가, `npm run example:compare` + CI **warning-only** 연결(후보 ③), 그 뒤 fail 게이트.

## 불변식 점검
- 판정 단일 출처(`readiness.mjs`) 안 건드림 — 이건 fixture 출력 대조기일 뿐.
- 게이트 신설 안 함(Unknown/Conflict/gap 을 게이트로 승격 X).
- 파싱은 `lib/spec.mjs` 공유(검사기 표류 방지 불변식).
