# testID 계약 최소 정본 반영안 — screen-spec / llm-rules 최소 patch 제안

> Status: **DESIGN / PROPOSAL ONLY**. 2026-06-21 · branch `docs/testid-contract-canon-patch`.
> 코드·정책·CI·매니페스트·정본 템플릿 변경 0. 이 PR이 추가하는 것은 **이 제안서 한 파일뿐**이다.
> PR #77 `docs/design/drafts/e2e-evidence/` 3종(README · testid-contract-candidate · e2e-evidence-discipline)의
> §5/§6 권고를 **현재 main 정본 텍스트에 대조**해 "어디까지·어떤 문구로 반영할지"를 결정-준비 상태로 좁힌 packet이다.
> **resolve·confirmed 승격·hard gate 신설/상향·정본 편집·구현 착수는 사람만.**
>
> 대상(향후 apply-slot에서 편집될 정본, 이 PR에선 **안 건드림**):
> - `frontend-workflow-kit/templates/screen/screen-spec.template.md` (Accessibility 섹션)
> - `frontend-workflow-kit/templates/global/llm-rules.template.md` (새 섹션 1개)
>
> 근거(main 동봉):
> - 계약: `frontend-workflow-kit/docs/design/drafts/e2e-evidence/testid-contract-candidate.md` §2·§3·§5·§6
> - 운영: `frontend-workflow-kit/docs/design/drafts/e2e-evidence/e2e-evidence-discipline.md` §1·§5·§6
> - evidence: `docs/research/playwright/dogfood-001-l010.md` §6 · `docs/research/playwright/03-workflow-integration.md` §6
> - 정본 현황 전수: `testID` 0건(템플릿·골든 예제·llm-rules), design draft에만 존재 — *처방됐으나 미채택* 갭.
>
> 경로 표기: 모두 **repo 루트 기준**(kit 내부 = `frontend-workflow-kit/…`, 리서치 = `docs/research/…`).

---

## 0. 한 줄 결론

testID 계약을 정본에 반영하되 **두 곳에만, additive(주석+예시 불릿/짧은 섹션)로**:

| 무엇 | 어디 | 형태 |
|---|---|---|
| **네이밍 규약**(린트로 못 박는 규칙) | `templates/global/llm-rules.template.md` | 새 섹션 1개(≤5줄) |
| **화면별 testID 앵커 선언** | `templates/screen/screen-spec.template.md` 의 **Accessibility** | 안내 주석 + 선택 예시 불릿 |
| 계약 설계·운영·drift·warning-first 후보 | design draft(현 위치 유지) | 편집 없음 |

핵심 정정 2가지(candidate §6 대비 더 좁힘):
1. **Acceptance Criteria 는 건드리지 않는다.** 그 칸의 "테스트 ID"는 이미 *테스트 파일 핸들*(`→ CouponListScreen.test.tsx` · `→ maestro/coupon-list.yaml`) 의미로 **사용 중**이다(골든 예제 확인). 여기에 앵커 `testID`를 끼우면 같은 한글표기 "테스트 ID"가 두 개념을 가리켜 **용어 충돌**이 난다. 앵커는 a11y 의미와 함께 사는 **Accessibility** 가 정확한 집.
2. **drift 문구·warning-first 검사는 정본에 넣지 않는다.** 운영 규율이지 화면-계약 텍스트가 아니다 → discipline draft에 유지(아래 §5·§6).

이 PR은 **위 편집을 하지 않는다.** 적용은 사람이 별도 명시 지시로 슬롯을 열 때(§7.2).

---

## 1. 이 세션이 지키는 경계 (전제 재확인)

- **E2E는 evidence다. gate가 아니다.** testID green이 OD를 닫거나 confirmed로 올리거나 readiness 모드를 끌어올리지 못한다.
- **testID는 Generator가 발명하지 않는다.** screen-spec이 선언 → 구현자가 삽입 → Playwright/Maestro/Detox/Generator가 소비(읽기). 방향은 **spec → 코드** 한 방향.
- **warning-first가 기본.** 이 반영은 새 필수 표·컬럼·readiness fact를 만들지 않는다. hard gate는 telemetry 후 별도 사람 OD.
- **substrate 의존 분리.** `web_e2e`/`native_e2e` role, `e2e-index`, validate 검사 14~16은 **Tier3 access-matrix substrate 이후** future/warning-first 후보. 이번 세션에서 E2E CI/harness 추가 0.
- **이번 산출물은 "최소 문구" 제안까지.** 정본 편집·harness·CI는 범위 밖.

---

## 2. 정본 반영 위치 결정 (작업 #1) — 5안 비교

| # | 옵션 | 장점 | 단점 / 위험 | 판정 |
|---|---|---|---|---|
| A | **screen-spec ▸ Accessibility** | 앵커가 `accessibilityRole`/`Label`과 **같은 요소 계약**에 동거(골든 예제가 이미 그 형태). 화면별 단일 출처. 표 아님 → 파싱 무영향 | a11y와 앵커를 혼동할 여지 → 주석으로 "둘 다 둔다" 명시로 차단 | ✅ **채택(앵커 선언)** |
| B | **screen-spec ▸ Acceptance Criteria** | 테스트 연결 지점이라 직관적 | **"테스트 ID"=테스트 파일 핸들로 이미 점유**(골든 예제). 앵커를 끼우면 용어 충돌. 게다가 Acceptance에 든 "표면 라우팅"은 testID 계약이 아니라 *evidence-discipline* 소관 | ❌ **제외** |
| C | **llm-rules** | "린트로 못 박는 규칙"의 정확한 집(파일 목적과 일치). cross-domain 1곳 | 길면 LLM 준수율↓ → 5줄로 최소화 필요 | ✅ **채택(네이밍 규약)** |
| D | **design draft만 유지(현상)** | 정본 무변경 = 가장 안전 | 도그푸드가 실증한 "처방됐으나 미채택" 갭을 **그대로 방치**. 이 세션의 목표(최소 정본 반영안)와 배치 | ❌ 목표 미달 |
| E | **hybrid (A + C, draft는 설계 근거로 유지)** | 규약은 llm-rules, 화면 선언은 screen-spec, 설계 토론은 draft — 각자 자연스러운 집 | 2곳 편집(그래도 각 additive·최소) | ✅ **추천(=A+C)** |

> **추천: E(=A+C) hybrid.** candidate §5의 3-way 권고와 같되, **B(Acceptance Criteria)를 명시적으로 제외**해 더 좁혔다.
> `frontend-workflow-kit/templates/domain/domain-rules.template.md`는 후보가 아니다 — 도메인별 비즈니스 규칙용이라 cross-domain 네이밍 규약의 자리가 아니다(확인함).

### 왜 B 제외가 중요한가 (용어 충돌, 실제 텍스트 근거)

골든 `coupon-list` screen-spec 실측:
```md
## Accessibility
- CouponCard: accessibilityRole="button", accessibilityLabel="{title}, {만료일}"   ← 앵커는 여기에 동거
## Acceptance Criteria
<!-- ... 테스트로 옮길 수 있는 항목은 테스트 ID 를 적는다 -->
- [ ] 쿠폰 클릭 시 상세 이동 → maestro/coupon-list.yaml                          ← "테스트 ID"=테스트 파일 핸들
```
- **"테스트 ID"(Acceptance)** = 이 기준을 덮는 *테스트 파일/핸들*(`→ *.test.tsx`/`→ maestro/*.yaml`).
- **"testID"(앵커)** = 카피·마크업이 바뀌어도 살아남는 *안정 셀렉터*(`coupon-list-item-42`).
- 둘은 다른 개념인데 한글표기가 겹친다. **앵커는 Accessibility, 핸들은 Acceptance** — 분리 유지가 최소 충돌.

---

## 3. 최소 patch (작업 #2) — 제안 텍스트 (정본 미적용)

> ⚠ 아래는 **제안**이다. 이 PR은 두 템플릿을 **편집하지 않는다**. 적용은 §7.2의 사람 승인 슬롯.

### 3.1 `frontend-workflow-kit/templates/screen/screen-spec.template.md` ▸ Accessibility (additive)

현재(main):
```md
## Accessibility
- {a11y 요구사항}
```

제안(주석 1개 + 선택 예시 불릿 — 헤더·필수성 불변):
```md
## Accessibility
<!-- 안정 E2E 앵커가 필요한 요소는 testID 를 함께 선언한다(선언만 — 도구가 발명하지 않는다).
     값은 카피/인덱스가 아니라 의미(역할·엔티티) 기반. 네이밍 규약은 llm-rules.
     앵커는 접근성(role/label)을 대체하지 않는다 — 둘 다 둔다. 미정이면 추측 말고 Open Decisions. -->
- {a11y 요구사항} (role / label)
- testID: `{screen}-{element}` — {요소}   ← E2E 안정 앵커(선언만, 선택)
```

근거: candidate §2(선언 주체=screen-spec 저자)·§4-4(앵커+a11y 둘 다). 앵커가 `accessibilityRole`/`Label` 옆에 동거 = 한 요소 계약의 두 면.

### 3.2 `frontend-workflow-kit/templates/global/llm-rules.template.md` ▸ 새 섹션 (additive, ≤5줄)

배치: "충돌 시 우선순위" 앞 또는 "판단 금지" 뒤(파일 목적상 "린트로 못 박는 규칙"). 제안:
```md
## E2E 앵커(testID) 네이밍
- testID 는 screen-spec 이 선언하고 구현자가 코드에 심는 계약이다. Generator/Playwright/Maestro 는 소비만 — 임의 발명 금지.
- 형식: `{screen}-{element}` · `{screen}-{action}` · 리스트 `{screen}-{entity}-item-{stableId}`
  (screen 슬러그가 이미 엔티티 컬렉션을 가리키면 `{entity}` 생략 → `{screen}-item-{stableId}`).
- stableId = 안정 도메인 id. **배열 인덱스/위치/카피 텍스트 금지**(재정렬·문구 변경에 깨진다).
- testID 는 접근성(role/label)을 대체하지 않는다 — 둘 다 둔다. 문구는 Copy Keys, 앵커는 testID 로 분리.
```

근거: dogfood §6.1("네이밍 규칙은 llm-rules에 고정")·candidate §6.1. 길수록 준수율↓ → lint 강제 0, 규약 진술만.

### 3.3 불변식 보존 체크 (왜 안전한가)

- **헤더/섹션명 불변(중요).** screen-spec 로더(`spec.mjs`)는 모든 `## 헤딩`을 소문자 키 섹션 맵으로 쪼갠다 — 그러나 **소비자가 키로 읽는 건 표 6종뿐**(`state matrix`·`interaction matrix`·`copy keys`·`unknowns`·`open decisions`·`api candidates`). `sections['accessibility']`를 읽는 코드는 **없다**(scripts/ 전수: `Accessibility` 0건, `Acceptance`는 workflow-packet 생성 출력에만). Accessibility는 표도 아니다 → 주석·불릿 추가는 섹션 맵에 **키 하나 더할 뿐** state/validate 판정에 무영향. **단 헤더명 `## Accessibility` 자체는 그대로 둔다**(로더가 헤딩 텍스트로 키를 만들므로 이름을 바꾸면 잠재 소비자가 깨진다 — "additive"의 전제). *(이 정밀화는 Codex 리뷰 지적 반영: "어떤 스크립트도 파싱 안 함"은 부정확 — 분할은 되나 소비가 없을 뿐.)*
- **새 필수 표·컬럼·readiness fact 신설 0.** 예시 불릿은 "(선언만, 선택)" — 누락이 신호를 켜지 않는다. `figma_mapping_status`처럼 fact에 합치지 않는다.
- **additive only.** 기존 줄 변경 없이 주석/불릿/섹션 **추가**만. VS-1이 figma-component-mapping에 옵션 섹션을 더한 패턴과 동형.

---

## 4. 네이밍 규약 최소화 (작업 #3)

| 종류 | 형식 | 예 |
|---|---|---|
| element | `{screen}-{element}` | `l010-title` · `coupon-list-empty` |
| action | `{screen}-{action}` | `l010-login-submit` · `signup-provider-google` |
| list item | `{screen}-{entity}-item-{stableId}` | `wishlist-product-item-SKU123` |

고정 규칙(이 3줄이 전부):
- **stableId = 안정 도메인 식별자(entity id).** **배열 인덱스/위치 기반 금지**(재정렬에 깨짐). **카피 텍스트 금지**.
- **stutter 예외는 한 형태로 고정:** `{screen}` 슬러그가 이미 엔티티 컬렉션이면 `{entity}` 생략 → **`{screen}-item-{stableId}`**(화면 `coupon-list` → `coupon-list-item-42`). 한 화면 안에서 **한 형태로 일관**.
- kebab-case. `{screen}`은 `screen_id`의 안정 슬러그(라우트 아님 — 라우트는 바뀐다).

> 의도적으로 **안 넣는 것**: 컴포넌트 트리 경로, 중첩 인덱스, prefix 네임스페이스 레지스트리. 규약이 길수록 LLM 준수율↓ → 3형식 + 금지 2개로 최소.

---

## 5. drift handling 문구 (작업 #4) — discipline draft 유지, **정본 미주입**

다듬은 운영 문구(현 위치 `e2e-evidence-discipline.md` §5 유지, 템플릿엔 넣지 않음):

> **E2E 실패가 spec↔implementation drift를 잡으면, Healer가 조용히 green으로 덮지 않는다.** 라이브 확인 후 세 갈래로 표면화하고 **판정은 사람**:
> - **screen-spec이 stale**(구현이 의도된 진화) → `reconcile-input`/Open Decision으로 screen-spec UPDATE를 표면화. 테스트는 현실에 맞추되 stale 행을 reconcile로 남긴다(register-first).
> - **구현이 회귀**(spec이 옳음) → 버그 보고. 테스트는 RED 유지(green으로 덮지 않음).
> - **미정** → Open Decision(open). 게이트는 사람.

근거: dogfood F9(email→J020 라우팅 드리프트를 E2E가 라이브 포착). **이 문구를 screen-spec/llm-rules에 넣지 않는 이유:** 화면-계약 텍스트가 아니라 evidence 운영 규율이고, 템플릿을 부풀리면 준수율·가독성이 떨어진다. drift 자동탐지 검사(spec route↔실제 라우팅)는 future warning-first 후보(아래 §6, 미구현).

---

## 6. future warning-first 후보 (작업 #5) — 유지하되 **구현 안 함**

| # | 후보 | 무엇을 보나 | 등급 | substrate |
|---|---|---|---|---|
| W1 | declared testID missing | screen-spec 선언 testID가 구현/tests에 없음 | warning-first(부재 시 skip) | testID 선언 관행 시작 후 |
| W2 | `test.fixme` without OD/conflict | 연결 OD/conflict 없는 fixme = Healer silent skip을 트리아지로 | warning-first | E2E 산출 후 |
| W3 | E2E provenance header missing | `tests/web/**`에 `// spec:`·`// seed:` 헤더 부재 | warning-first | E2E 산출 후 |
| W4 | `e2e-index` generated view | Acceptance 핸들 ↔ 실제 `tests/web/**`·`maestro/**` 역색인(읽기전용·멱등·GENERATED) | warning-first(부재 시 skip) | **Tier3 access-matrix substrate 이후** |

공통: 전부 **warning-first(exit 0)**, `--enforce`는 telemetry 후 **별도 사람 OD**(lint-baseline ratchet·VS-3 패턴). 어떤 신호도 readiness fact에 합치지 않는다. **이번 세션에서 배선·구현 0.**

---

## 7. PR scope

### 7.1 이 제안 PR (지금 — 이 브랜치)

**allowed**
- ADD: `frontend-workflow-kit/temp/proposals/testid-contract-canon-patch.md`(이 파일) **단 1개**.
- (선택) design draft에서 이 제안서로의 cross-link 1줄 추가 — *별도 요청 시에만*.

**forbidden**
- `screen-spec.template.md` / `llm-rules.template.md` **편집 금지**(정본 변경 = 별도 슬롯).
- 코드·정책·CI·매니페스트·preset·roles 변경 금지. harness/CI/검사 추가 금지.

### 7.2 향후 apply-slot PR (사람 명시 지시 후, **별개 PR**)

**allowed**
- §3.1 screen-spec Accessibility additive 주석+예시 불릿.
- §3.2 llm-rules 새 섹션(≤5줄).
- (선택) 골든 예제 1화면(`coupon-list`)에 testID 선언 시범 — 선언만, 코드 0.

**forbidden**
- 새 필수 표/컬럼/readiness fact 신설. 헤더 변경. Acceptance Criteria 의미 변경.
- `web_e2e`/`native_e2e` role, `e2e-index`, 검사 14~16 추가(= Tier3 substrate 이후).
- Playwright/Maestro/Detox harness, E2E CI 잡, Healer auto-fix.

---

## 8. "아직 하지 말 것" (금지 재확인)

- ❌ Playwright/Maestro/Detox **harness를 repo에 추가** — 리서치 하니스는 비추적 로컬(`temp/runs/maestro-dogfood-001/`).
- ❌ **E2E hard gate** — 전부 warning-first. hard 승격은 telemetry 후 별도 사람 OD.
- ❌ **Healer auto-fix를 CI에** — 로컬/PR diff 전용.
- ❌ **testID 누락을 readiness fact로 연결** — evidence 축이지 게이트 아님. 누락은 신호도 아님(이번 단계).
- ❌ **이번 PR에서 정본 템플릿 편집** — 제안까지만. 적용은 §7.2.
- ❌ **`web_e2e`/`native_e2e` role·`e2e-index`·검사 14~16 신설** — Tier3 access-matrix substrate 이후.
- ❌ **Acceptance Criteria에 앵커 끼우기** — 용어 충돌(§2). 앵커는 Accessibility만.
- ❌ **drift/warning-first 문구를 정본에 주입** — discipline draft 유지.

---

## Cross-links

- 계약: `frontend-workflow-kit/docs/design/drafts/e2e-evidence/testid-contract-candidate.md` §2·§3·§5·§6
- 운영·drift·warning-first: `frontend-workflow-kit/docs/design/drafts/e2e-evidence/e2e-evidence-discipline.md` §1·§5·§6
- 폴더 불변식: `frontend-workflow-kit/docs/design/drafts/e2e-evidence/README.md`
- evidence: `docs/research/playwright/dogfood-001-l010.md` §6 · `docs/research/playwright/03-workflow-integration.md` §6
- 정본(대상): `frontend-workflow-kit/templates/screen/screen-spec.template.md` · `frontend-workflow-kit/templates/global/llm-rules.template.md`
- 패턴 선례: `frontend-workflow-kit/docs/design/drafts/visual-spec-od-decisions.md`(VS-1 옵션 섹션화) · `frontend-workflow-kit/temp/proposals/tier3-access-matrix-revision.md`(제안서 포맷)
- substrate 의존: `frontend-workflow-kit/temp/proposals/tier3-access-matrix-revision.md`(mode×layer access matrix)
