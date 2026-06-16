# Current Roadmap

> 스냅샷: 2026-06-16. MVP-B Phase 0 완료분 위에 **2026-06-15~16 추가 랜딩** — **검사 8 API-스키마 매칭 엔드포인트 단위 격상**(구현·하드, PR #19) · **Interaction Matrix v2 dual-read + 검사 13**(warning-first, #48) · **Tier2 route-tree 어댑터 솔기**(#49) · **component-catalog phase2-1 배럴 reconcile 진단**(warning-first, stderr-only). 잔여는 아래 "다음 구현 후보" 로 이어진다.
> 이전 스냅샷(2026-06-14): MVP-B Phase 0 **완료** — 회귀 하니스·경로 backstop[warning-first]·입력/register 검증; consumer-dogfood-001 외부 소비 dry-run 으로 end-to-end 검증, PR #17.
> 목적: **MVP-A 구현 범위 / 설계 계약(코드 후속) / Future Candidate** 세 티어의 경계를 한 파일로 고정한다.
> 문서별 역할·링크는 [README 문서 지도](README.md#문서-지도) 참조.

## 핵심 루프

```txt
Input Skill → Reconciliation → Documents → State → Readiness → Work → Validate
```

MVP-A 에서 코드로 강제되는 구간은 **Documents → State → Readiness → Validate** 다.
앞단(Input Skill·Reconciliation)은 아직 문서 계약이며, 실제 게이트는 readiness 다운그레이드가 담당한다.

## MVP-B Phase 0 — 구현 / 경고-전용 / 제안 (2026-06-14, 완료 — consumer-dogfood-001 외부 검증 PR #17)

- **구현·강제(하드)**: validate 검사 11·12 구조 검사(입력 결과물 frontmatter + Reconciliation Register) · `test-fixtures.mjs` golden fixture 회귀 하니스(CI 배선됨 — warning-only/`continue-on-error`; 하드 gating 후속).
- **경고-전용(warning-first, `--enforce` 로 하드)**: `forbidden-paths.mjs` 경로 backstop(Lane B) · Reconciliation Register 미처리 감지(검사 12 일부, Lane C).
- **여전히 제안(승격 금지)**: lint-gen/lint-baseline(MVP-B) · catalog/check-generated(MVP-C) · reconcile-input 킷 `skills/` vendor · API-스키마 1:1 매칭 · Interaction Matrix `Result` 컬럼 구조화 · Work Packet & Review Artifacts(템플릿만 존재, 강제 0).

## MVP-C Phase 1 — 생성 뷰 2종 (2026-06-14, 구현·읽기 전용)

- **구현(읽기 전용, 게이트 아님)**: `route-tree.mjs`(src/app 트리 → `_meta/route-tree.txt`) · `nav-graph.mjs`(screen-spec `## Interaction Matrix` + navigation-map → `_meta/nav-graph.yaml`). 결정적·멱등, 커밋된 골든 픽스처 byte-identical 재현. screen-spec/src 를 **읽기만** 한다.
- **패키징**: alias `workflow:route-tree`·`workflow:nav-graph` 승격(`package.json` + `package-scripts.template.json`). 매니페스트 `status: planned → active`.
- **CI 미배선(의도)**: warning-first 배선의 선행 = `test-fixtures.mjs` 에 두 뷰 픽스처 등록(그 후 기존 `example:test` warning-only step 이 자동 커버). 하드 게이트 승격 없음.
- 통합 점검 기록: [temp/runs/mvp-c-generated-views-integration.md](temp/runs/mvp-c-generated-views-integration.md).

## 산출물 축 (artifact axes)

```txt
저작 문서        screen-spec / navigation-map / llm-rules / domain-rules
생성 상태        _meta/workflow-state.yaml · screen-inventory.yaml
결정             Open Decisions (readiness cap)
입력 정합        Input Reconciliation (register · conflict · re-open)
조사/검증        Investigation / Verification (evidence handoff)
```

이 목록은 **닫혔다**. 지금 단계의 목표는 새 축을 더 만드는 게 아니라 위 축들의 경계를 선명히 하는 것이다.
리뷰는 **별도 축이 아니라** 아래 Future Candidate "Work Packet & Review Artifacts" 안에서 다룬다.

## MVP-A 게이트 인벤토리 (정확히 무엇을 막는가)

MVP-A 의 readiness/validate 가 게이트하는 것은 **딱 이것뿐**이다 — 여기 없는 건 자동 차단하지 않는다.

```txt
readiness_mode = min(fact_mode, decision_cap)

fact_mode      정책 fact 로만 도달 가능한 최고 모드.
               (implementation-mode-policy.yaml 의 requires 에 실제 쓰이는 fact:
                stub_screen_specs_count · navigation_map_status · screen_spec_status · screen_spec_authored ·
                component_catalog_generated · fake_hook_exists · figma_mapping_status · api_confidence_min ·
                state_matrix_complete · CI: ci_lint · ci_schema_validation · state_coverage_complete · llm_semantic_review)
               (interaction_matrix_complete 는 fact 로 정의돼 있으나 어떤 requires 에도 안 쓰여 게이트가 아니다)
decision_cap   열린 Open Decision 의 최저 Blocking Mode 바로 아래.
               (malformed Open Decision 은 fail-closed → docs-only 로 고정)
validate       검사 12종, CI exit 0/1
```

게이트하지 **않는** 것 (= MVP-A 자동 차단 없음):

```txt
Unknowns        fact-finding 큐. tbd_count 는 next-action 메시지에만 쓰이고 모드는 안 막는다.
Conflicts       passive log. 막으려면 Open Decision 으로 승격해야 한다.
Investigation   blocks_mode 를 readiness 가 직접 파싱하지 않는다. 막으려면 연결된 Open Decision 필요.
Review          MVP-A 에 없음 (Future Candidate).
```

## Tier 1 — MVP-A: 구현·강제됨 (코드)

- 템플릿: screen-spec(통합형+stub) · navigation-map(뼈대) · llm-rules · domain-rules · component-gap-register · conflicts
- `scripts/`: `workflow-state.mjs` · `readiness.mjs` · `validate.mjs` (+ 공유 lib: util/spec/schema)
- `schemas/frontmatter.schema.json` · `catalog/artifact-manifest.yaml` · `policies/implementation-mode-policy.yaml`
- `skills/implement-screen`
- Open Decisions readiness cap — 저작 규칙 + **게이트 해제는 사람-전용** 불변식 (LLM 은 open 추가/재오픈만)
- Open Decisions **validate 형식 검사**(검사 9) — 표 컬럼·`Status` enum·`Blocking Mode` 정책 모드·전역 ID 중복 (resolved→Options 는 경고)
- golden example: `coupon-feature` (end-to-end 1회 완주)

## Tier 2 — 설계 계약 작성됨 / 코드 강제 후속

문서로 계약은 동결됐지만 **스크립트 강제는 0** 이다. MVP-A 의 코드 게이트(위 인벤토리)에 들어가지 않는다.

- **Input Reconciliation** ([input-reconciliation.md](input-reconciliation.md)) — register · Reconcile Status 라이프사이클 · conflict 수동 로그 · `resolved→open` 재오픈 계약. 실제 게이트는 Open Decision(readiness)이 담당.
- **Investigation / Verification** ([investigation-and-verification.md](investigation-and-verification.md)) — 조사/검증 문서는 evidence 핸드오프 아티팩트. 막는 조사는 연결된 Open Decision 을 만들어야 하고, 그 Open Decision 이 blocker.

## Tier 3 — 후속 / Later (구현 안 함)

**Tier 1 강화:**
- ✅ Open Decisions validate **형식 검사** 구현됨(검사 9: 표·`Status`·`Blocking Mode`·전역 ID 중복). ✅ `forbidden_paths` 경계 backstop 구현(MVP-B Phase 0, diff 기반, warning-first — `scripts/forbidden-paths.mjs`; `--enforce` 로 하드).
- ✅ **API Candidate ↔ zod 스키마 매칭 검사 구현됨**(검사 8, 하드·exit 1 — PR #19, 옵션 C): confirmed ScreenSpec 후보의 `(Method, Path)` → api-manifest `## Endpoints` → Linked Schema → `src/api/schemas/*.ts` 실 export 해소까지. **Known limitation:** OpenAPI `components.schemas` 해소는 **아직 미구현**(zod export 매칭 중심) · manifest 부재 시 옛 전역 존재검사(`hasZod || hasOpenApi`)로 폴백 · manifest `Source` 컬럼은 정보용(검사에 미사용). 증거: [api-schema-match-001.md](../temp/runs/api-schema-match-001.md).
- 🔶 Interaction Matrix **`Result` 컬럼 구조화 — v2 dual-read 구현됨**(#48): 선택적 `Result Type`/`Target`/`Params` 컬럼 파서 + **검사 13(warning-only)** + v2 골든 픽스처. v1 free-form Result 는 정본 유지, v2 출력 byte-identical. **잔여(warning-first 유지):** route-tree.txt 토큰과의 **EXACT 교차검증**(현재 inventory 집합 약식 경고) · `Result Type` enum 동결 · 하드 게이트 승격. 증거: [interaction-matrix-v2-dual-read-001.md](temp/runs/interaction-matrix-v2-dual-read-001.md).
- decision-log.md 전역 이관 · deferred+Reversible+Assumptions 묶음 · 교차-화면 참조 (open-decisions.md 후속 절)

**Tier 2 구현:**
- ✅ **reconcile-input 스킬** 작성됨 — `.claude/skills/reconcile-input/`(리포-로컬, 절차 가이드·코드 강제 0). 남은 것: 킷 `skills/` 로 vendor.
- ✅ Reconciliation Register **검증 구현**(validate 검사 12 — 구조=하드, 미처리 감지=warning-first; +검사 11 입력 결과물 frontmatter). 남은 것: pre-edit/commit hook 으로의 확장.
- Investigation / Verification **템플릿 + manifest 등록** · `blocks_mode` **readiness 파싱**

**Future Candidate (새 축 아님 — 흡수형):**
- **Work Packet & Review Artifacts** — 작업 단위 인덱스/핸드오프 보드(Work Packet) + 리뷰 상세(Review Artifacts). **Review Gates 는 독립 축이 아니라 여기 안에서** 다룬다(처음엔 Work Packet 의 required 행으로 시작). Open Decision 이 여전히 readiness 게이트이고 Work Packet 은 인덱스일 뿐이다. *템플릿 초안이 킷 `templates/work-packet/`(work-packet·run-report·review-artifact)에 추가됨 — 설계/문서일 뿐 코드 강제 0, 여전히 Future Candidate. 원 설계 제안: `temp/work-packet-review-artifacts-proposal.md`.*

## 다음 구현 후보 (하나를 명시적으로 고를 때만 착수)

> **최근 랜딩(이 슬롯에서 내려감, 2026-06-15~16):** ① 검사 8 API-스키마 매칭 엔드포인트 단위 격상(구현·하드, PR #19) · ② Interaction Matrix v2 dual-read + 검사 13(warning-first, #48) · ③ Tier2 route-tree 어댑터 솔기(#49) · ④ component-catalog generated artifact + `check-generated` 가드(#40/#42) 및 phase2-1 배럴 reconcile **진단** 슬라이스(warning-first, stderr-only). 각 항목의 **잔여**가 아래 후보다.

1. **component-catalog phase2 — 첫 additive 섹션/컬럼 (PR-3)** — phase2-1 의 배럴 reconcile **진단(warning-first, stderr-only, 출력·exit·골든 불변)** 슬라이스는 머지됨. **다음 작은 PR** = 기존 4컬럼 `## Components` 테이블에 **첫 additive 섹션/컬럼**을 더하는 슬라이스 — **아직 미구현**. 새 골든 픽스처 뒤에서 두-run 결정성·byte-exact 입증 후에만 착수(design §6/§9/§11 PR-3). 설계: `temp/proposals/component-catalog-phase2.md`. 진단 슬라이스 기록: [component-catalog-phase2-1-diagnostics-001.md](temp/runs/component-catalog-phase2-1-diagnostics-001.md).
2. **Tier2 codegen 어댑터 (PR-3 잔여)** — route-tree 어댑터 솔기(PR-2: `scripts/lib/route-core.mjs` + `scripts/adapters/routers/{expo-router}.mjs` + `manifest.json`)는 #49 로 랜딩(golden byte-identical). **잔여 = codegen 절반**: `scripts/lib/codegen-core.mjs`(결정성 독점) + `scripts/adapters/codegens/{openapi-client}.mjs` + codegen 매니페스트 + 출력경로/**hook 네이밍**(§7·§8·§9) + validate/nav-graph 솔기. 설계: `temp/proposals/tier2-router-codegen-adapter.md` §17 PR-3. 솔기 랜딩 기록: [tier2-route-tree-adapter-seam-001.md](temp/runs/tier2-route-tree-adapter-seam-001.md).
3. **Interaction Matrix 정밀화 (잔여, warning-first)** — v2 dual-read·검사 13 은 #48 로 랜딩(위 Tier 3 절). 잔여 = route-tree.txt 토큰과의 **EXACT 교차검증**(현재 inventory 집합 약식 경고) + `Result Type` enum 동결. 하드 게이트 승격은 telemetry 후 별도 decision PR.
4. **lint-pack / adapt-lint-pack** — 기존 로드맵의 `lint-gen/lint-baseline(MVP-B)` 생성물 lint 게이트와 **동일 개념**의 라벨(별도 신규 스킬/파일 아님 — `lint-gen.mjs`+`lint-baseline.mjs` 생성기 + 브라운필드 도입용 `adapt-lint-pack` 스킬, frontend-workflow-kit-implementation.md §11).

> 위 재정렬로 직전 후보(Work Packet · reconcile-input 킷 vendor · test-fixtures 하드 게이팅 승격)는 *우선순위 슬롯*에서 내려가지만 문서 내 다른 곳에 그대로 남는다 — Work Packet=Future Candidate(아래) · reconcile-input vendor=Tier 2(위) · test-fixtures 하드 게이팅=Phase 0 "하드 gating 후속".

*이번 세션 완료: reconcile-input 스킬 작성(write-a-skill 방법론 + 코덱스 medium 1건 반영) — 리포-로컬 `.claude/skills/`.*
*MVP-B Phase 0 통합: test-fixtures 하니스 + forbidden_paths backstop(warning-first) + 입력/register 검증(검사 11·12).*

## 지금 하지 말 것

- 새 산출물 축 추가 — idea surface 확장 금지 (리뷰도 새 축 아님, Work Packet 후보로 흡수)
- 구현 후보 중 하나를 명시적으로 고르지 않은 채 MVP-A 확장
- LLM 이 게이트를 **내리게** 만드는 자동화 (resolve/confirm/conflict-close 는 사람-전용 불변식 유지)
- Unknown/Conflict/Work Packet/Review 를 readiness 게이트로 만들기 (게이트는 Open Decision + 정책 fact 뿐)
