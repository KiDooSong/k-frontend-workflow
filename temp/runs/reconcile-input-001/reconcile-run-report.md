# reconcile-input dry-run report — reconcile-input-001

- **Run**: `temp/runs/reconcile-input-001/`
- **Date**: 2026-06-13
- **Fixture**: `frontend-workflow-kit/examples/input-reconciliation/`
- **Baseline**: `project-before/docs/frontend-workflow` (34 docs, md-only)
- **Inputs**: 5건 (planning / figma / api / meeting / qa), 모두 `captured_at: 2026-06-13`
- **Compared against**: `expected-llm-after/` (LLM 단독 정답지)
- **코드 변경 없음** — src/package/scripts 미수정, `examples/` 원본 미수정, `expected-*` 미수정. 모든 쓰기는 `temp/runs/...` 한정.

## 방법 (honesty note)
`actual-llm-after` 는 baseline + 5개 입력 + skill 계약(`input-reconciliation.md`, `SKILL.md`)만으로 **expected-llm-after 를 보기 전에** 독립 생성했다. 생성을 끝낸 뒤에야 expected 를 읽고 대조했다. 신호 보존을 위해 actual 을 expected 에 맞춰 사후 수정하지 않았다 — 아래 diff 가 실제 실행 산출물과 정답지의 격차다.

---

## 0. Scorecard

| 검사 | 결과 |
|---|---|
| 변경 파일 집합 (footprint) | ✅ **정확히 일치** — actual 이 건드린 9개 == golden 9개 (7 changed + 2 new) |
| 무관 baseline 문서 보존 | ✅ 34개 중 27개 무수정 |
| `navigation-map` 미수정 (LLM-vs-human 경계) | ✅ 일치 (golden 도 미수정) |
| 게이트 **올리기만** 불변식 (decision/conflict/confirmed/gap) | ✅ 일치 — resolve·close·승격·accept **0건** |
| D-204 resolved→open 재오픈 | ✅ 일치 |
| C-001 conflict open 기록 (A/B 보존) | ✅ 일치 |
| G-001 component-gap open 제안 | ✅ 일치 |
| D-001 / D-003 open 유지 + 후보 기록 | ✅ 일치 |
| simple-update (page envelope, offline 행, figma 매핑, error policy) | ✅ 일치 (사실 동일, 표현 차이) |
| **U-001 처리** | ❌ **불일치** — actual=`resolved`, golden=`open` (Unknown 닫기도 사람) |
| 그 외 내용/배치/스키마 | ⚠️ 다수 cosmetic + 소수 substantive (§3) |

**총평**: 이 테스트의 핵심 합격 기준(= 게이트 델타를 올바르게 만들었는가)에서 **고위험 경계는 전부 정확**하다. 단 하나, `resolves-unknown` 을 "닫기"로 해석해 U-001 을 resolved 로 내린 것이 golden 과 갈린다(그리고 그 여파로 U-002 신설). 나머지는 표현·배치·스키마 수준 차이다.

---

## 1. Footprint (파일 단위) — PASS

actual 이 baseline 대비 건드린 파일:

```
CHANGED  _meta/conflicts.md
CHANGED  _meta/decision-log.md
NEW      _meta/reconciliation-register.md
CHANGED  api/api-error-policy.md
CHANGED  api/api-manifest.md
CHANGED  domains/auth/screens/login/screen-spec.md
NEW      domains/coupons/screens/coupon-list/figma-component-mapping.md
CHANGED  domains/coupons/screens/coupon-list/screen-spec.md
CHANGED  global/component-gap-register.md
```

→ `expected-llm-after/docs` 의 9개 파일 집합과 **정확히 동일**. 다른 27개 baseline 문서는 무수정. `app/navigation-map.md` 가 변경 목록에 없다는 점이 LLM-vs-human 경계(returnTo 반영은 사람)를 정확히 재현한다.

---

## 2. 핵심 불변식 — "LLM 은 올리기만, 닫지 않는다"

| 닫기·승격 행위 (사람 전용) | golden | actual | 판정 |
|---|---|---|---|
| decision `resolved` (D-001/D-003/D-204) | 안 함 | 안 함 | ✅ |
| conflict `resolved` (C-001) | 안 함 | 안 함 | ✅ |
| status `confirmed` 승격 (COUPON-001) | 안 함 (draft 유지) | 안 함 (draft 유지) | ✅ |
| AUTH-001 confirmed **강등** | 안 함 | 안 함 | ✅ |
| gap `accepted` (G-001) | 안 함 (open) | 안 함 (open) | ✅ |
| **unknown `resolved` (U-001)** | **안 함 (open)** | **함 (resolved)** | ❌ |

올리기 행위는 전부 일치: D-204 재오픈, C-001 open, G-001 open, D-001/D-003 open 유지. **유일한 위반은 U-001 을 resolved 로 내린 것** — golden 은 Unknown 닫기조차 사람 몫으로 본다("아무 것도 닫지 않는다").

---

## 3. 실질(substantive) 격차 — 6건

### S1. U-001 을 resolved 로 닫음 (golden: open) — 가장 중요
- **actual**: COUPON-001 `U-001 → resolved` (api 입력이 응답 예시 위치의 답을 제공하므로).
- **golden**: `U-001 → open`. 명시 주석: *"IN-api-001 이 답을 제공해 resolvable 이지만, resolved 로 닫는 것은 사람. LLM 은 open 유지."*
- **원인/판단**: 계약 분류표는 `resolves-unknown | Unknown을 resolved 처리` 라고 적혀 있고, 본 작업 지시 step 3 은 "unknown 생성/갱신 가능", step 4(사람 전용)에 unknown 은 **없다**. 즉 *지시문 문자 그대로면 U-001 닫기는 허용 범위* 다. 그러나 golden 은 메타원칙("LLM 은 닫지 않는다")을 Unknown 에까지 **균일 적용**한다.
- **분류**: 계약 ↔ golden **불일치(문서 결함 후보)**. → §5 로 escalate.

### S2. U-002 신설 (golden: 없음)
- **actual**: planning 입력의 "상태 탭 ↔ 서버 enum 1:1 매칭 미확인" 을 새 Unknown `U-002 (open)` 로 만들었다.
- **golden**: U-002 없음. 대신 그 enum 매칭 질문을 **기존 U-001 로 흡수** — api-manifest 주석: *"상태 탭(planning)과 enum 매칭은 U-001(open) 의 응답 예시로 확인 가능"*.
- **분류**: S1 의 부수 효과. golden 은 U-001 을 "쿠폰 API 응답 예시" 단일 Unknown 으로 유지하고 enum 확인까지 거기에 건다. actual 은 U-001 을 닫아버려서 enum 질문을 담을 새 Unknown 이 필요해졌다.
- **참고**: 만약 U-001 을 open 으로 두었다면 U-002 는 불필요했다 — 두 격차는 한 뿌리.

### S3. 탭 Copy Keys Status: `tbd` (golden: `draft`)
- **actual**: `coupon.tab.available/used/expired` → Status **`tbd`** (템플릿 "미확정은 tbd" 근거).
- **golden**: Status **`draft`**. 주석: *"라벨은 입력이 제공한 값(=TBD 아님). 탭 존재가 D-001(open)에 달려 draft. 사람이 separate-tab 으로 닫으며 confirmed 승격."*
- **영향**: `workflow-state` 의 `copy_keys_has_tbd`/`tbd_count` 가 달라진다 — actual 은 +3 tbd, golden 은 +0 tbd(draft 는 미집계). 측정값이 갈린다.
- **분류**: substantive (집계에 영향). golden 의 `draft` 가 "문구는 있으나 미확정" 을 더 정확히 표현.

### S4. page-envelope DTO 를 screen-spec API Candidates 에 노출
- **actual**: COUPON-001 `API Candidates` 의 `GET /coupons` 줄에 `{ items, page, size, hasNext }` + 정렬 주석을 직접 붙였다.
- **golden**: COUPON-001 API Candidates 는 **baseline 그대로**(`GET /coupons (confidence: candidate)`). page-envelope 사실은 **api-manifest 에만** 둔다.
- **분류**: substantive — "화면은 API DTO 에 직접 의존하지 않는다" 경계 위반. actual 이 DTO 형태를 화면 문서로 새게 했다. golden 은 DTO 를 manifest 에 가두고 화면엔 AsyncState(page/hasNext) 개념만 둔다.

### S5. register 의 api 입력 Result: `accepted(+pending)` (golden: `pending user decision`)
- **actual**: api 행 Result = "accepted (page envelope, U-001 resolved); D-003 pending".
- **golden**: api 행 Result = **`pending user decision`** (D-003 open + U-001 open 이 사람 결정 대기이므로 입력 전체를 pending 으로).
- **분류**: substantive(어휘 규칙). golden 은 "열린 자식이 사람 결정을 요구하면 입력 Result 는 pending" 으로 일관. actual 은 simple-update 부분을 accepted 로 분리 표기 — U-001 을 닫았다고 본 영향도 섞임.

### S6. figma-component-mapping frontmatter: `status` 누락 + 비표준 필드
- **actual**: `status: draft` **누락**, 비표준 `figma_frame_ref:` 필드 추가.
- **golden**: `status: draft` 포함, `figma_frame_ref` 없음(프레임 ref 는 본문/sources 에).
- **분류**: substantive(스키마). 신규 artifact 에 `status` 누락은 validate 잠재 위험. (이 fixture 는 validate 미실행이라 실측 미확인 — §6 참조.)

---

## 4. 경미(cosmetic / 배치) 격차 — 표현은 다르나 reconcile 결론 동일

| # | 항목 | actual | golden | 결론 동일? |
|---|---|---|---|---|
| C1 | D-001 후보 표기 위치 | decision-log 비고에만 | screen-spec Options 컬럼 + decision-log 둘 다 | ✅ (둘 다 open + separate-tab 후보) |
| C2 | D-003 Options 편집 방식 | 재정렬 `offset/page ... / cursor / none` | 원문 유지 `cursor / offset / none` + "후보" 주석 첨부 | ✅ (golden 이 원문 보존이라 더 안전) |
| C3 | COUPON-001 `sources` | typed 4건 추가 + last_reviewed bump | 기존 ref 를 `coupon-list-12-v2` 로 갱신(1건) + bump | ✅ provenance, 방식 차이 |
| C4 | State Matrix `offline` 행 위치 | 맨 끝에 append | `error` 뒤·`refreshing` 앞 삽입 + error 에 "(서버)" 대비표기 | ✅ (행 내용 동일) |
| C5 | Data Requirements | "탭별 필터" 줄 + AsyncState 경계문 추가 | page 상태 1줄(`offset/page 후보, D-003 open`)만 | ✅ (golden 이 더 간결, AsyncState 는 manifest 로) |
| C6 | Acceptance Criteria | 기존 "5개 상태" 유지 + 탭 기준 추가 | "loading/.../offline/refreshing 모두" 로 갱신, 탭 기준 없음 | ⚠️ actual 의 "5개" 는 offline 추가로 **stale** |
| C7 | UI Sections / Interaction 문구 | "상태 탭 전환", `coupon_tab_switch`, blockquote 포인터 | "상태 탭 변경", `coupon_tab_change`, 섹션 라벨에 G-001/D-001 인라인 | ✅ (이벤트명은 양쪽 다 창작) |
| C8 | Purpose 문장 | baseline 유지 | "표시 방식은 D-001(open)에 달림" 으로 보강 | ✅ |
| C9 | figma-mapping 표 스키마 | 2행(CouponCard, SegmentedTabs), `카탈로그` 컬럼 | 3행(+EmptyState), 구체 컴포넌트 경로 | ✅ (핵심 매핑·G-001·경계 동일) |
| C10 | 제목 `(expected-llm-after)` · 상단 해설 주석 | 없음 | 있음 | — (정답지 라벨링, reconcile 산출 아님) |

> golden 의 screen-spec/매핑에는 `# ... (expected-llm-after)` 제목과 "왜 이렇게 했는가" 해설 HTML 주석이 붙어 있다. 이는 **정답지 주석**이지 reconcile 출력이 아니므로 actual 에 없는 게 정상이다.

---

## 5. 계약 ↔ golden 모순 (escalate) — `resolves-unknown` 의미

S1 은 단순 실행 실수가 아니라 **문서 간 모순**을 드러낸다:

- `input-reconciliation.md` 분류표: `resolves-unknown → Unknown을 resolved 처리` (= 닫으라는 뜻으로 읽힘). resolves-**decision** 에만 `(사람)` 주석이 붙고 resolves-**unknown** 엔 없다 → "Unknown 은 LLM 이 닫아도 된다" 로 해석 가능.
- 본 작업 지시: step 3 "unknown 생성/갱신 가능", step 4(사람 전용)에 unknown **없음** → 역시 닫기 허용으로 읽힘.
- 그러나 golden + `expected-llm-after/README`: *"아무 것도 닫지 않는다"*, U-001 `open` 유지, 닫기는 사람.

**제안**: 다음 중 하나로 정합을 맞추는 것이 좋다 —
1. (golden 채택 시) 분류표를 `resolves-unknown → Unknown 을 resolvable 로 표시하되 open 유지, resolved 닫기는 사람` 으로 수정하고, skill "금지"·작업 지시 step 4 에 "unknown resolved 금지" 를 명시. **(권장 — 메타원칙과 일관)**
2. (분류표 채택 시) golden 의 U-001 을 resolved 로 바꾸고 "Unknown 은 비-게이트라 LLM 이 닫을 수 있다" 를 README 에 명문화.

현재 actual 은 (1)의 부재 때문에 (분류표·지시문 문자) 를 따랐고, 그래서 golden 과 갈렸다. 즉 **이 dry-run 이 잡아낸 진짜 결함은 "resolves-unknown 의 닫기 권한이 문서마다 다르게 읽힌다" 는 점**이다.

---

## 6. reports/ 커버리지

| 파일 | golden | actual | 비고 |
|---|---|---|---|
| `reports/reconciliation-summary.md` | 있음(U/D/C/Gap 컬럼 스키마) | 있음(다른 스키마, 동등 내용) | ✅ 내용 동등, 표 형식 차이. U-001 표기만 S1 따라 갈림 |
| `reports/expected-readiness.md` | 있음 | **없음** | ⚠️ 미생성. readiness 투영은 본 dry-run 범위(코드 미실행)에서 제외했다. 단 그 추론(D-204 재오픈→AUTH-001 design-intent 하락, D-001/D-003 가 COUPON-001 cap, md-only fact 천장=screen-skeleton before/after 동일)은 actual 의 `reconciliation-summary.md` "게이트 변화" 절과 **일치**한다 |

`workflow:state/readiness/validate` 는 실행하지 않았다(작업 지시 = md-only dry-run, 코드 변경 금지). 따라서 S3(tbd_count)·S6(status 누락)의 validate/state 영향은 **논리 추론**이며 실측은 후속 세션 몫이다.

---

## 7. Verdict

- **게이트 경계 재현 (이 테스트의 본질)**: ✅ **PASS** — 올리기/유지/simple-update 전부 정확, 닫기·승격·accept 0건, navigation-map 보류까지 정확.
- **파일 footprint**: ✅ **PASS** — golden 과 동일한 9파일, 무관 문서 무손상.
- **내용 정합**: ⚠️ **PARTIAL** — 실질 격차 6건(S1~S6). 그중 S1(U-001 닫기)·S2(U-002)는 한 뿌리이고 §5 의 문서 모순에서 비롯. S4(DTO 누수)·S6(status 누락)은 actual 측 규율 미스. S3·S5 는 어휘/집계 차이.
- **순수 my-run 결함 (golden 기준 고쳐야 할 것)**: S4(API Candidates DTO 누수), S6(figma-mapping `status` 누락/비표준 필드), C6(Acceptance "5개 상태" stale).
- **문서 결함 (skill/계약 측 고쳐야 할 것)**: S1/S2 의 뿌리 — `resolves-unknown` 닫기 권한 모호성(§5).

### 권고 (actual 을 golden 에 맞추려면)
1. `U-001 → open` 으로 되돌리고 `U-002` 제거 (enum 확인은 U-001 주석으로).
2. 탭 Copy Keys Status `tbd → draft`.
3. COUPON-001 API Candidates 에서 envelope DTO 문구 제거 (사실은 api-manifest 에만).
4. register api 행 Result `pending user decision` 로.
5. figma-component-mapping frontmatter 에 `status: draft` 추가, `figma_frame_ref` 제거.
6. Acceptance "5개 상태" → "loading/success/empty/error/offline/refreshing" 로 갱신.

> 위 1~6 은 **의도적으로 적용하지 않았다** — actual 은 본 실행의 진짜 산출물로 보존한다(테스트 신호). 적용 여부는 사용자 판단.
