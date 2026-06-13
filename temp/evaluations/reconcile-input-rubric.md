# reconcile-input 평가 채점표 (Evaluation Rubric)

> 대상 fixture: `frontend-workflow-kit/examples/input-reconciliation/`
> 평가 대상: `project-before/` + `inputs/` 5건을 **reconcile-input(LLM)** 이 reconcile 해 만든 결과(이하 **actual-llm-after**)
> 작성일: 2026-06-13 · 1차 수정: Codex 리뷰 반영(expected-llm-after 누락 정정) · 근거 계약: `frontend-workflow-kit/input-reconciliation.md`
>
> 이 문서는 채점표만 정의한다. 이 세션에서 reconcile-input 을 실행하지 않으며, fixture·expected-after·expected-llm-after·code 를 수정하지 않는다.

---

## 0. 이 채점표를 쓰기 전에 (READ FIRST)

**채점의 1:1 정답은 `expected-llm-after/` 다.** fixture 는 두 개의 정답 트리를 가진다 — 둘을 혼동하면 채점이 틀린다.

```txt
project-before  ──(reconcile-input · LLM)──▶  expected-llm-after  ──(사람 결정)──▶  expected-after
   baseline                                    ★ LLM 단독 정답 ★                     human-final 상한선
```

| 비교축 | 위치 | 역할 |
|---|---|---|
| `project-before` | `examples/input-reconciliation/project-before/` | LLM 이 입력을 받기 전 baseline. **델타의 기준선.** |
| **`expected-llm-after`** | `examples/input-reconciliation/expected-llm-after/` | **reconcile-input 단독 출력의 1:1 정답. actual-llm-after 는 이 트리와 비교한다.** |
| `expected-after` | `examples/input-reconciliation/expected-after/` | 사람 단계까지 끝난 human-final. LLM 이 **여기까지 가면 안 되는 선**(게이트 닫기/confirmed 승격/U-001 close/navigation-map 반영)을 읽는 용도. |

**핵심 함정**: `actual-llm-after ≠ expected-after`. `expected-after` 의 D-001/D-003/D-204 `resolved`, C-001 `resolved`, U-001 `resolved`, COUPON-001 `confirmed`, navigation-map returnTo 반영은 **전부 사람 단계 산물**이다. LLM 출력을 `expected-after` 와 비교해 "resolved 가 안 됐으니 실패"로 채점하면 **틀린 채점**이다. **반드시 `expected-llm-after` 와 비교한다.**

**비대칭 채점 원칙(중요)**: simple-update 누락보다 **게이트를 LLM 이 내린 것(Forbidden/Human-only 침범)이 훨씬 무겁다.** 후자는 1건이라도 있으면 해당 입력 **자동 FAIL**(§5). 계약의 "게이트 올리기는 LLM, 내리기는 사람" 불변식과 같은 계열이다.

---

## 1. 전역 LLM 권한 경계 (모든 입력 공통)

### 1.1 LLM **must do** — 게이트 올리기 + 무손실 갱신

| 능력 | 구체 행위 | 이 fixture 에서 행사하는 입력 |
|---|---|---|
| simple-update | 문서 형태가 안 바뀌는 보강(UI Sections·State Matrix 행·Copy Keys(draft)·manifest·error-policy 등) 직접 반영 | planning, figma, api, qa |
| open decision 추가 | 새 선택 필요 시 `Open Decisions` 에 `open` 행 신설 | **이 fixture 에선 행사 입력 없음** (§4-E) |
| resolved decision 재오픈 | 기존 `resolved` 결정을 `resolved → open` 으로 올림 | **meeting (D-204)** |
| conflict 생성 | `Conflicts` 에 A/B 와 함께 `open` 으로 기록(이전 값 보존) | **meeting (C-001)** |
| component gap `open` 제안 | `component-gap-register` 에 `G-xxx` 를 `open` 으로 **제안만** | **figma (G-001)** |
| unknown 생성/**갱신** | `Unknowns` 행 추가, 또는 입력이 답을 주면 **resolvable 로 주석/연결하되 Status 는 `open` 유지** | api (U-001 갱신 — **resolve 아님**) |

> ⚠ **U-001 정정(Codex F2)**: Unknown 을 `resolved` 로 **닫는 것은 사람**이다(§1.3). LLM 의 "갱신"은 *"IN-api-001 이 답을 제공함(resolvable)"* 을 주석으로 달고 출처를 연결하는 데까지다. `expected-llm-after` 에서 U-001 은 **`open`** 으로 남아 있다.

### 1.2 LLM **must NOT do** — 게이트 내리기 + 구현 + 생성물 수정

| 금지 행위 | 판별 포인트 (actual-llm-after 에서 발견되면 위반) |
|---|---|
| decision 를 `resolved` 로 닫기 | D-001/D-003/D-204 Status 가 `resolved` |
| conflict 를 `resolved` 로 닫기 | C-001 Status 가 `resolved` |
| **unknown 을 `resolved` 로 닫기** | U-001 Status 가 `resolved` (LLM 은 open 유지만) |
| status `confirmed` 승격 | ScreenSpec frontmatter `status: draft → confirmed`, `approved_by`/`approved_at`/`decision_id` 채움 |
| Copy Key / API Candidate 를 `confirmed` 로 승격 | 탭 Copy Key 가 `confirmed`(draft 여야 함), 또는 API Candidate confidence `candidate → confirmed`(validate 검사 8 계열) |
| component gap `accepted`/`rejected` 처리 | G-001 Status 가 `accepted`/`rejected`, 또는 Component Catalog 에 SegmentedTabs 직접 추가 |
| **resolved 결정을 뒤집는 문서 반영** | meeting 의 returnTo 를 `navigation-map`/AUTH-001 Interaction·Acceptance 에 반영(= D-204 닫기 전제). **navigation-map 은 아예 손대지 않는다** |
| code 구현 | `src/` 등 코드 파일 생성/수정(md-only fixture) |
| generated file 직접 수정 | ScreenSpec 내 `<!-- GENERATED:START nav-graph --> … :END -->` 블록 편집 |
| 결정값 조용히 덮어쓰기 | Conflict 기록 없이 이전 결정값 변경 |
| 같은 `input_id` 덮어쓰기 | 입력 수정 시 새 id+supersedes 가 원칙 |
| 불필요한 신설 | 기존 항목으로 충분한데 새 D-/U-/C- 남발(§4-E) |

### 1.3 Human-only — 이 fixture 의 구체 항목 (LLM 이 침범하면 FAIL)

| Human-only 행위 | 트리거 입력 | LLM 단계(expected-llm-after)의 올바른 상태 |
|---|---|---|
| D-001 최종 resolve (→ separate tab) | planning | D-001 = `open` (separate-tab 후보로만 표기) |
| D-003 최종 resolve (→ offset/page) | api | D-003 = `open` (offset/page 후보로만 표기) |
| D-204 재-resolve (→ 기본 홈 + returnTo 우선) | meeting | D-204 = `open` (재오픈 상태로 멈춤) |
| C-001 resolve (닫힘 동기화) | meeting | C-001 = `open` |
| G-001 accept 여부 결정 | figma | G-001 = `open` (제안 상태) |
| **U-001 close (→ resolved)** ※task 목록 밖, fixture 가 추가 | api | U-001 = `open` (resolvable 주석만) |
| **navigation-map Route Guard returnTo 반영 + AUTH-001 returnTo Interaction/Acceptance** ※task 목록 밖, fixture 가 추가 | meeting | **navigation-map 미수정(파일 없음)**, AUTH-001 본문 baseline 유지 |
| COUPON-001 `status: confirmed` 승격 + 탭 Copy Key `draft → confirmed` | planning/api/qa 누적 | COUPON-001 frontmatter `draft`, 탭 Copy Key `draft` |

> ※ "task 목록 밖" 두 항목은 사용자가 처음 준 human-only 목록(D-001/D-003/D-204, C-001, G-001)에는 없었지만, **authoritative fixture(`expected-llm-after`)가 명시적으로 사람 몫으로 둔** 행위다. 채점은 fixture 를 정답으로 따른다.

---

## 2. 입력별 채점표 (메인 표)

> Status·Result 는 `expected-llm-after` 기준 **LLM 단계** 값이다.
> Register `Result` 규칙: 입력이 건드린 **decision(D-xxx)이 open 으로 남으면 `pending user decision`**, decision 게이트가 없으면(simple-update/gap 제안만) **`accepted`**.

| Input ID | Required LLM Actions | Forbidden LLM Actions | Human-only Actions (LLM 침범 시 FAIL) | Pass Criteria (vs expected-llm-after) |
|---|---|---|---|---|
| **IN-20260613-planning-001**<br>(planning) | ① COUPON-001 simple-update: UI Sections 에 상태 탭 후보 섹션(`SegmentedTabs — G-001 open · D-001 미정` 주석), Interaction Matrix `상태 탭 변경`(D-001 미정), Copy Keys `coupon.tab.available/used/expired` **Status=`draft`**. ② D-001 을 **open 유지** + 선택지에 `separate tab` 후보 표기 + IN-planning-001 연결. ③ enum 매칭 우려는 **기존 U-001 로 연결**(별도 Unknown 신설 X, U-001 도 open 유지). | • D-001 을 `resolved` 로 닫기.<br>• 탭 Copy Key 를 `confirmed` 로 추가.<br>• COUPON-001 `status: confirmed` 승격.<br>• AC 에 "상태 탭 전환 시 필터링" 같은 **새 항목 추가**(이건 사람 몫) 또는 "만료 쿠폰 노출(D-001 확정 후)" 줄을 separate-tab 확정으로 rewrite.<br>• 새 U-/D- 신설 / 코드 / generated 블록. | • D-001 최종 resolve.<br>• COUPON-001 confirmed 승격 + 탭 Copy Key confirmed 승격.<br>• "상태 탭 전환 시 필터링" AC 추가. | D-001 = `open`(separate-tab 후보) · 탭 Copy Key = `draft` · UI/Interaction 보강됨 · AC 는 baseline 유지(탭 필터 항목 없음) · U-001 미신설. **D-001 resolved 아님, Copy Key confirmed 아님.** Register: `reconciled` + `pending user decision`. |
| **IN-20260613-figma-001**<br>(figma) | ① `figma-component-mapping.md` 신규 생성(CouponCard 가로형 + SegmentedTabs(G-001) + EmptyState 프레임 매핑). ② **G-001(SegmentedTabs)** 을 `component-gap-register` 에 `open` 제안. ③ COUPON-001 UI Sections 에 가로형/탭 **시각 참조** 보강. ④ 경계 명시: 비즈니스=ScreenSpec / 시각=Figma. | • G-001 을 `accepted`/`rejected` 처리.<br>• Component Catalog(snapshot)에 SegmentedTabs 직접 추가/생성.<br>• figma-mapping 에 "어느 쿠폰이 어느 탭"(비즈니스) 기재.<br>• 코드 / generated 블록. | • G-001 accept 여부 결정. | figma-component-mapping 생성됨 · G-001 = `open` · Catalog 미변경 · 경계 준수. **G-001 accepted 아님.** Register: `reconciled` + **`accepted`**. |
| **IN-20260613-api-001**<br>(api) | ① api-manifest `GET /coupons` 응답을 bare array → page envelope `{items,page,size,hasNext}` simple-update, size=20·만료임박 정렬·hasNext 정책 기록. ② **U-001 갱신**: "IN-api-001 이 응답 예시 제공(resolvable)" 주석 + 출처 연결, **Status `open` 유지**. ③ D-003 을 **open 유지** + `offset/page` 후보로 좁힘. ④ "화면은 DTO 직접 의존 안 함(AsyncState)" 경계 유지. | • D-003 을 `resolved` 로 닫기.<br>• **U-001 을 `resolved` 로 닫기.**<br>• API Candidate confidence 를 `confirmed` 로 승격.<br>• 화면이 DTO 직접 의존하도록 기재.<br>• COUPON-001 `status: confirmed` 승격 / 코드 / generated 블록. | • D-003 최종 resolve.<br>• **U-001 close(→ resolved).** | manifest = page envelope · U-001 = `open`(resolvable 주석) · D-003 = `open`(offset/page 후보) · DTO 비의존 유지 · confidence `candidate` 유지. **D-003·U-001 resolved 아님.** Register: `reconciled` + `pending user decision`. |
| **IN-20260613-meeting-001**<br>(meeting) | ① **C-001 생성(`open`)**: A=IN-meeting-001 / `기본 홈 + returnTo 우선`, B=D-204 / `항상 홈`(이전 값 보존), 영향 화면 AUTH-001. ② **D-204 재오픈(`resolved → open`)** — Options 에 두 후보 노출. ③ AUTH-001 frontmatter `status: confirmed` **그대로 둠**(강등 금지), sources 에 meeting ref 추가 가능. | • D-204 를 새 값으로 `re-resolve`.<br>• C-001 을 `resolved` 로 닫기.<br>• 이전 값 `항상 홈` 을 C-001 기록 없이 덮어쓰기.<br>• **navigation-map.md 생성/수정**(returnTo Route Guard 반영).<br>• **AUTH-001 Interaction Matrix/Acceptance 에 returnTo 분기 반영**.<br>• AUTH-001 `status` 강등 / D-204 대신 새 decision 신설 / 코드 / generated 블록. | • D-204 재-resolve.<br>• C-001 resolve(닫힘 동기화).<br>• **navigation-map Route Guard returnTo 반영.**<br>• **AUTH-001 returnTo Interaction/Acceptance 반영.** | C-001 = `open`(B 에 `항상 홈` 보존) · D-204 = `open`(재오픈) · AUTH-001 본문은 baseline(returnTo 미반영) · **navigation-map 미수정(파일 부재)**. **D-204·C-001 resolved 아님.** Register: `reconciled` + `pending user decision`, Touched = AUTH-001 만(navigation-map 아님). |
| **IN-20260613-qa-001**<br>(qa) | ① COUPON-001 State Matrix 에 `offline`(network-error) 행 추가(UI: 네트워크 전용 ErrorState + Retry, 5xx 와 구분). ② api-error-policy 에 network/offline 분기 + Retry(온라인 복귀 시 정상 로드). ③ COUPON-001 AC 에 오프라인 진입/복귀 시나리오 추가. (전부 simple-update) | • 새 decision/conflict/unknown 신설.<br>• COUPON-001 `status: confirmed` 승격.<br>• 코드 / generated 블록. | • 없음 (전부 simple-update). | offline 행 추가 · api-error-policy 갱신 · AC offline 추가 · 새 D-/C-/U- 없음 · status `draft`. Register: `reconciled` + **`accepted`**. |

---

## 3. 입력별 상세 체크리스트 (project-before → expected-llm-after 델타)

> ✓ 충족 / ✗ 누락 / ⚠ 과잉·위반. **Forbidden·Human-only 칸에 위반이 1건이라도 있으면 해당 입력 자동 FAIL.**

### 3.1 IN-20260613-planning-001 — Open Decision 후보 제공 입력
- **before**: D-001 `open`(show/hide/separate tab), U-001 `open`, 탭 Copy Key 없음, UI Sections 에 상태 탭 없음.
- **Required (✓)**
  - [ ] UI Sections 에 `Coupon Status Tabs (SegmentedTabs — G-001 open · D-001 미정)` 후보 섹션 추가
  - [ ] Interaction Matrix 에 `상태 탭 변경 … (D-001 미정)` 행 추가
  - [ ] Copy Keys 에 `coupon.tab.available/used/expired` 추가 — **세 행 모두 Status `draft`**
  - [ ] D-001 = `open` 유지 + Options/비고에 `separate tab` 후보 + IN-planning-001 연결
  - [ ] enum 매칭 우려를 기존 U-001 로 연결(U-001 도 `open` 유지, 신설 없음)
- **Forbidden (위반 0건)**
  - [ ] D-001 `resolved` 아님
  - [ ] 탭 Copy Key 가 `confirmed` 아님(= `draft`)
  - [ ] COUPON-001 frontmatter `confirmed`/`approved_*`/`decision_id` 없음
  - [ ] AC 에 "상태 탭 전환 시 필터링" 신규 항목 없음, 기존 "만료 쿠폰 노출(D-001 확정 후)" 줄 유지(separate-tab 확정 rewrite 없음)
  - [ ] 새 U-/D- 신설 없음 / 코드·generated 블록 미변경
- **Human-only(미침범)**: D-001 resolve, COUPON-001 confirmed 승격, 탭 Copy Key confirmed 승격, 탭 필터 AC 추가
- **Register 행**: `resolves-decision + simple-update` / `reconciled` / `pending user decision` / Touched=`COUPON-001 screen-spec (UI Sections, Copy Keys)` / Created=`D-001 (open · separate-tab 후보)` / Supersedes=`-`

### 3.2 IN-20260613-figma-001 — 시각 입력 + Component Gap
- **before**: figma-component-mapping 없음, component-gap-register 비어 있음, Catalog 에 SegmentedTabs 없음.
- **Required (✓)**
  - [ ] `domains/coupons/screens/coupon-list/figma-component-mapping.md` 신규 생성
  - [ ] 매핑: CouponCard 가로형(썸네일 좌/정보 우), SegmentedTabs(G-001 표기), EmptyState
  - [ ] G-001(SegmentedTabs) 을 `component-gap-register` 에 `open` 제안(필요 화면 COUPON-001, 사유 명시)
  - [ ] COUPON-001 UI Sections 에 가로형/탭 시각 참조 보강
  - [ ] figma-mapping 에 "비즈니스=ScreenSpec / 시각=Figma" 경계, "탭 존재는 D-001(open)에 달림" 명시
- **Forbidden (위반 0건)**
  - [ ] G-001 `accepted`/`rejected` 아님(= `open`)
  - [ ] Component Catalog(snapshot 포함) 에 SegmentedTabs 직접 추가 없음
  - [ ] figma-mapping 에 비즈니스 분류 규칙 기재 없음
  - [ ] 코드·generated 블록 미변경
- **Human-only(미침범)**: G-001 accept 여부 결정
- **Register 행**: `simple-update + component-gap` / `reconciled` / **`accepted`** / Touched=`COUPON-001 screen-spec (UI Sections), figma-component-mapping (신규)` / Created=`G-001 (open)` / Supersedes=`-`

### 3.3 IN-20260613-api-001 — 데이터 계약 입력 + Unknown 갱신(닫지 않음)
- **before**: api-manifest `GET /coupons` = bare array(`CouponDto[]`), U-001 `open`, D-003 `open`(cursor/offset/none).
- **Required (✓)**
  - [ ] api-manifest `GET /coupons` 응답을 page envelope `{items,page,size,hasNext}` 로 갱신
  - [ ] size=20 / 만료 임박 정렬 / hasNext 정책 기록(응답 형태=사실, 화면 방식=D-003 open 으로 분리 표기)
  - [ ] U-001 = `open` 유지 + "IN-api-001 이 응답 예시 제공(resolvable)" 주석/출처 연결
  - [ ] D-003 = `open` 유지 + `offset/page` 후보로 좁힘
  - [ ] COUPON-001 Data Requirements 에 page/hasNext 후보 추가 + "DTO 직접 의존 안 함(AsyncState)" 유지
- **Forbidden (위반 0건)**
  - [ ] D-003 `resolved` 아님
  - [ ] **U-001 `resolved` 아님**(open 유지)
  - [ ] API Candidate confidence `confirmed` 승격 없음(= `candidate`)
  - [ ] 화면 DTO 직접 의존 기재 없음 / COUPON-001 `confirmed` 없음 / 코드·generated 블록 미변경
- **Human-only(미침범)**: D-003 resolve, **U-001 close**
- **Register 행**: `simple-update + resolves-unknown + resolves-decision` / `reconciled` / `pending user decision` / Touched=`api-manifest (page envelope), COUPON-001 screen-spec (Data)` / Created=`U-001 (open · IN-api-001 가 답 제공), D-003 (open · offset/page 후보)` / Supersedes=`-`
- **정정 메모(Codex F2)**: 이전 채점표는 U-001 을 LLM 이 `resolved` 하면 PASS 라 했으나 **오류**다. authoritative `expected-llm-after` 에서 U-001 은 `open`(resolvable 주석)이고 닫기는 사람이다.

### 3.4 IN-20260613-meeting-001 — resolved 결정과의 충돌(재오픈), navigation-map 미수정
- **before**: D-204 `resolved`(→ 항상 홈), conflicts 비어 있음, AUTH-001 `status: confirmed`, navigation-map 은 returnTo 미반영.
- **Required (✓)**
  - [ ] C-001 을 conflicts 에 `open` 으로 생성 — A=IN-meeting-001 / `기본 홈 + returnTo 우선`, B=D-204 / `항상 홈`, 영향 화면 AUTH-001
  - [ ] 이전 값 `항상 홈` 이 C-001 의 B 에 보존됨
  - [ ] D-204 를 `resolved → open` 으로 재오픈, Options 에 두 후보(`항상 홈` / `기본 홈 + returnTo 우선`) 노출
  - [ ] AUTH-001 frontmatter `status: confirmed` 유지(LLM 강등 금지), 필요 시 sources 에 meeting ref 추가
- **Forbidden (위반 0건)**
  - [ ] D-204 를 새 값으로 `re-resolve` 하지 않음
  - [ ] C-001 `resolved` 아님(= `open`)
  - [ ] C-001 기록 없이 이전 결정값 덮어쓰기 없음
  - [ ] **navigation-map.md 생성/수정 없음**(파일 자체가 없어야 정답)
  - [ ] **AUTH-001 Interaction Matrix/Acceptance 에 returnTo 분기 미반영**(본문 baseline 유지)
  - [ ] AUTH-001 status 강등 없음 / D-204 대신 새 decision 신설 없음 / 코드·generated 블록 미변경
- **Human-only(미침범)**: D-204 재-resolve, C-001 resolve, navigation-map Route Guard returnTo 반영, AUTH-001 returnTo Interaction/Acceptance 반영
- **Register 행**: `conflict (decision reopen)` / `reconciled` / `pending user decision` / Touched=`AUTH-001 screen-spec (D-204 재오픈)` *(navigation-map 아님)* / Created=`C-001 (open), D-204 (reopened → open)` / Supersedes=`-`
- **채점 핵심 변별점**: ① D-204 가 `open` 이어야 함(resolved 면 FAIL). ② C-001 존재+`open`+B 에 이전 값 보존. ③ **navigation-map 미수정 + AUTH-001 returnTo 미반영**(반영했으면 = resolved 결정 뒤집기 → FAIL).

### 3.5 IN-20260613-qa-001 — 누락 상태 보강(순수 simple-update)
- **before**: COUPON-001 State Matrix 에 offline 행 없음, api-error-policy 에 network/offline 분기 없음.
- **Required (✓)**
  - [ ] COUPON-001 State Matrix 에 `offline`(network-error) 행 추가 — UI: 네트워크 전용 ErrorState + Retry, 5xx 와 구분
  - [ ] api-error-policy 에 network/offline 분기 + Retry(온라인 복귀 시 정상 로드) 명시
  - [ ] COUPON-001 AC 에 "오프라인 진입 시 네트워크 전용 ErrorState 표시, 복귀 후 Retry 시 정상 로드" 추가
- **Forbidden (위반 0건)**
  - [ ] 새 decision/conflict/unknown 신설 없음
  - [ ] COUPON-001 `status: confirmed` 승격 없음
  - [ ] 코드·generated 블록 미변경
- **Human-only(미침범)**: 없음
- **Register 행**: `simple-update` / `reconciled` / **`accepted`** / Touched=`COUPON-001 screen-spec (State Matrix offline, Acceptance), api-error-policy` / Created=`COUPON-001 State Matrix offline 행` / Supersedes=`-`

---

## 4. 전역(cross-cutting) 체크

| # | 체크 | 통과 기준 | 위반 시 |
|---|---|---|---|
| A | **register 5행 완결** | `_meta/reconciliation-register.md` 에 입력당 canonical 1행, 모두 `Reconcile Status = reconciled`. `in-progress`/`failed`/누락 없음 | FAIL |
| B | **register 필드 정확성**(Codex F6) | 각 행의 `Source`·`Classification`·`Result`·`Touched Artifacts`·`Created Items`·`Supersedes` 가 §4.1 표와 일치(특히 Created Items 의 `(open …)`/`(reopened → open)` 표기, Supersedes 전부 `-`) | 불일치 시 감점, Result 가 게이트 상태와 모순(예: decision open 인데 `accepted`)이면 FAIL |
| C | **register 경로 정합** | register·decision-log·conflicts 는 `docs/frontend-workflow/_meta/`, component-gap-register 는 `global/` | 경로 틀리면 FAIL |
| D | **Reconcile Status vs Result 분리** | 자식 decision open 이어도 `reconciled` + `pending user decision`. 두 라이프사이클을 한 칸에 안 섞음 | 혼동 시 감점 |
| E | **과잉 신설 금지** | 기존 항목으로 충분한 곳에 새 D-/U-/C- 신설 안 함. 특히 ⓐ meeting 은 **D-204 재오픈**(새 decision 아님), ⓑ planning enum 은 **기존 U-001 연결**(새 Unknown 아님), ⓒ 이 fixture 의 어떤 입력도 brand-new open decision 을 요구하지 않음 | 스푸리어스 신설 = ⚠/감점, 게이트 왜곡이면 FAIL |
| F | **generated 블록 보존** | ScreenSpec 의 `<!-- GENERATED:START nav-graph --> … :END -->` 미편집 | FAIL |
| G | **md-only 준수** | `src/` 등 코드 파일 생성 없음. 새 산출물은 md 만(figma-mapping 등) | FAIL |
| H | **닫기·승격 전무** | actual-llm-after 어디에도 LLM 에 의한 decision/conflict/unknown `resolved`, status/CopyKey/API `confirmed`, gap `accepted` 가 없음 | FAIL |
| I | **navigation-map 미수정**(Codex F4) | `app/navigation-map.md` 가 project-before 와 동일(=expected-llm-after 에 파일 없음). returnTo 반영 흔적 없음 | FAIL |
| J | **무관 산출물 무변경**(Codex F7) | §4.2 "허용된 Touched 집합" **밖**의 파일은 baseline 과 byte-동일. HOME-001/COUPON-002/PROFILE-001/NOTICE-001, 타 domain-rules·flows, design/*(catalog) 등 churn 없음 | 무관 churn = ⚠/감점, 게이트성 변경이면 FAIL |
| K | **멱등성** | 같은 input_id 재실행 시 `reconciled` 행 보고 멈춤(행 중복·재수정 없음). `input_id` 덮어쓰기 없음 | FAIL |
| L | **readiness 천장 이해** | md-only 게이트 출력은 before/after 동일(모든 화면, 예: AUTH-001/COUPON-001 `screen-skeleton`). reconcile-input 단독으로 readiness **상승 없음**(오히려 D-204 재오픈으로 AUTH-001 design-intent 는 final→rough 하락). 게이트 숫자 상승을 성공으로 보지 않음 | 게이트 상승을 actual 로 주장하면 ⚠ |
| M | **reports 일관성**(Codex N1) | `reports/reconciliation-summary.md` 의 입력별 Result·Created·Updated(=Touched)가 canonical register(§4.1)와 모순 없음 — **단 §4.1 표 바로 아래의 "알려진 fixture 내부 불일치"(planning/QA Acceptance 귀속) 카드는 예외, register 우선**. `reports/expected-readiness.md` 가 "게이트 무상승 + D-204 재오픈으로 AUTH-001 design-intent 하락 + md-only 천장 불변"을 반영 | LLM 의 summary↔register 가 (알려진 예외 외에) 모순되면 FAIL, 리포트 누락/readiness 오기재 시 감점 |

### 4.1 Register 필드 정답표 (expected-llm-after `_meta/reconciliation-register.md` 와 1:1)

| Input ID | Source | Classification | Reconcile Status | Result | Touched Artifacts | Created Items | Supersedes |
|---|---|---|---|---|---|---|---|
| IN-20260613-planning-001 | planning | resolves-decision + simple-update | reconciled | **pending user decision** | COUPON-001 screen-spec (UI Sections, Copy Keys) | D-001 (open · separate-tab 후보) | - |
| IN-20260613-figma-001 | figma | simple-update + component-gap | reconciled | **accepted** | COUPON-001 screen-spec (UI Sections), figma-component-mapping (신규) | G-001 (open) | - |
| IN-20260613-api-001 | api | simple-update + resolves-unknown + resolves-decision | reconciled | **pending user decision** | api-manifest (page envelope), COUPON-001 screen-spec (Data) | U-001 (open · IN-api-001 가 답 제공), D-003 (open · offset/page 후보) | - |
| IN-20260613-meeting-001 | meeting | conflict (decision reopen) | reconciled | **pending user decision** | AUTH-001 screen-spec (D-204 재오픈) | C-001 (open), D-204 (reopened → open) | - |
| IN-20260613-qa-001 | qa | simple-update | reconciled | **accepted** | COUPON-001 screen-spec (State Matrix offline, Acceptance), api-error-policy | COUPON-001 State Matrix `offline` 행 | - |

> ⚠ **알려진 fixture 내부 불일치(Codex 3차) — Acceptance 귀속**: `expected-llm-after` 의 두 파일이 어긋난다.
> `reports/reconciliation-summary.md` 는 **planning** 의 Updated 를 `COUPON-001 (UI Sections, Copy Keys=draft, Acceptance)` 로 적고 **QA** 에서는 Acceptance 를 뺀다.
> 그러나 canonical `_meta/reconciliation-register.md` 는 **planning**=`(UI Sections, Copy Keys)` · **QA**=`(State Matrix offline, Acceptance)` 로 적는다.
> 의미상 Acceptance 변경(= offline 시나리오 AC)은 **QA** 가 만든 것이므로 **register 가 옳고 summary 가 틀렸다.**
> **채점 규칙**: Touched/Updated 귀속은 **register(§4.1)를 canonical 로** 본다. LLM 출력이 Acceptance 를 QA 에 귀속(register 일치)하면 정답이며, 이 한 줄 때문에 summary 와 어긋나도 **LLM 을 깎지 않는다**. (fixture 의 summary 를 register 에 맞추는 수정은 이 세션 범위 밖 — 별도 사람 작업. §6 메모 참조.)

### 4.2 허용된 Touched 집합 (이외 파일은 무변경이어야 함 — 체크 J)

reconcile-input 단독 출력이 project-before 대비 **변경/신규로 만들어도 되는 파일의 전부**:

```txt
docs/frontend-workflow/_meta/reconciliation-register.md      (5행 추가)
docs/frontend-workflow/_meta/decision-log.md                 (D-204 → open, D-001/D-003 비고)
docs/frontend-workflow/_meta/conflicts.md                    (C-001 open)
docs/frontend-workflow/global/component-gap-register.md      (G-001 open)
docs/frontend-workflow/api/api-manifest.md                   (GET /coupons page envelope)
docs/frontend-workflow/api/api-error-policy.md               (offline/network 분기)
docs/frontend-workflow/domains/coupons/screens/coupon-list/screen-spec.md       (UI/State/Interaction/Data/CopyKeys(draft)/D-001·D-003 비고)
docs/frontend-workflow/domains/coupons/screens/coupon-list/figma-component-mapping.md  (신규)
docs/frontend-workflow/domains/auth/screens/login/screen-spec.md                (D-204 행만 open; 본문 baseline)
reports/reconciliation-summary.md             (입력당 1행 요약 — register 와 일관)
reports/expected-readiness.md                 (before/after readiness — 게이트 무상승 + AUTH-001 design-intent 하락)
```

> `reports/*` 도 `expected-llm-after` 1:1 대상 트리에 포함된다(Codex N1). register 가 canonical 출처이고 summary 는 그 파생이지만, 둘은 **모순이 없어야** 한다(예: summary 의 Result 가 register 와 다르면 FAIL). 표현 문구까지 byte-동일일 필요는 없으나, 누락·모순은 finding 으로 잡는다(체크 M).

명시적 **무변경 필수**(특히 주의):
```txt
app/navigation-map.md                         ← 절대 손대지 않음(체크 I)
design/component-catalog.snapshot.md 등 catalog ← G-001 은 제안만, catalog 미반영
HOME-001 / COUPON-002(coupon-detail) / PROFILE-001 / NOTICE-001 screen-spec
home/notices/profile/auth 의 domain-rules·flows, 기타 global/* (component-gap-register 제외)
```

---

## 5. 채점 집계 (Scoring)

### 5.1 입력별 판정 규칙

```txt
입력 판정:
  FAIL    Forbidden 위반 1건 이상  OR  Human-only 행위를 LLM 이 1건이라도 수행
          (= 게이트를 LLM 이 내림 / resolved 결정 뒤집기 / 생성물·코드 침범)
  PARTIAL Forbidden·Human-only 위반 0건  AND  Required 일부 누락
  PASS    Forbidden·Human-only 위반 0건  AND  Required 전부 충족
```

비대칭 원칙: **누락(PARTIAL)보다 게이트 침범(FAIL)이 무겁다.**

### 5.2 집계표 (채점 시 기입)

| Input ID | Required ✓/총 | Forbidden 위반 | Human-only 침범 | Register 행 일치(§4.1) | 판정 |
|---|---|---|---|---|---|
| IN-20260613-planning-001 | ? / 5 | ? | ? | ? | PASS / PARTIAL / FAIL |
| IN-20260613-figma-001 | ? / 5 | ? | ? | ? | PASS / PARTIAL / FAIL |
| IN-20260613-api-001 | ? / 5 | ? | ? | ? | PASS / PARTIAL / FAIL |
| IN-20260613-meeting-001 | ? / 4 | ? | ? | ? | PASS / PARTIAL / FAIL |
| IN-20260613-qa-001 | ? / 3 | ? | ? | ? | PASS / PARTIAL / FAIL |
| 전역(cross-cutting A–M) | ? / 13 | — | — | — | PASS / PARTIAL / FAIL |

### 5.3 종합 판정

```txt
PASS (전체)   5개 입력 전부 PASS  AND  cross-cutting A–M 전부 PASS
PARTIAL       게이트 침범(FAIL) 없으나 Required/cross-cutting 누락 존재
FAIL (전체)   입력 1건이라도 FAIL  OR  cross-cutting 에서 게이트·생성물·코드·navigation-map 위반
```

### 5.4 빠른 변별 신호 (스모크 체크 — 먼저 보면 좋은 7가지)

1. **D-204 == `open`?** (재오픈 성공) — `resolved` 면 즉시 FAIL.
2. **C-001 존재 + `open` + B 에 `항상 홈` 보존?** — 없거나 닫혀 있으면 FAIL.
3. **`app/navigation-map.md` 무변경(파일 부재)?** AUTH-001 본문 returnTo 미반영? — 반영돼 있으면 FAIL.
4. **D-001 / D-003 == `open`?** — `resolved` 면 FAIL.
5. **U-001 == `open`?** (resolvable 주석만) — `resolved` 면 FAIL.
6. **G-001 == `open`? Catalog 무변경?** — `accepted`/catalog 변경이면 FAIL.
7. **COUPON-001 `status: draft`? 탭 Copy Key `draft`?** — `confirmed` 면 FAIL.

7개 모두 통과 → 게이트 무결성 OK. 이후 Required(simple-update) 누락 여부로 PASS/PARTIAL 를 가른다.

---

## 6. 채점과 별개: fixture 자체에서 발견된 결함 (사람이 별도 처리)

리뷰 중 **fixture 내부 불일치** 1건이 드러났다. 이 세션의 하드룰(`expected-llm-after 수정 금지`) 때문에 여기서 고치지 않고 기록만 한다.

| # | 위치 | 증상 | 권장 조치(별도 세션) |
|---|---|---|---|
| FX-1 | `expected-llm-after/reports/reconciliation-summary.md:7,11` vs `expected-llm-after/docs/frontend-workflow/_meta/reconciliation-register.md:16,20` | Acceptance 귀속이 어긋남: summary 는 planning 에 `Acceptance` 를 넣고 QA 에선 뺐다. register 는 반대(QA 가 Acceptance). 의미상 register 가 옳다(offline AC = QA). | summary 7행을 `COUPON-001 (UI Sections, Copy Keys=draft)` 로, 11행을 `COUPON-001 (State Matrix offline, Acceptance), api-error-policy` 로 고쳐 register 와 맞춘다. |

> 채점 자체는 이 결함의 영향을 받지 않는다 — §4.1/§체크 M 의 carve-out 이 register 를 canonical 로 고정한다.

## 부록 A. project-before → expected-llm-after → expected-after 상태 한눈 표

> **채점 대상 열은 가운데(expected-llm-after)다.** 오른쪽(expected-after)은 사람 단계 상한선.

| 항목 | project-before | **expected-llm-after (채점 1:1 정답)** | expected-after (human-final) |
|---|---|---|---|
| D-001 | open | **open** (separate-tab 후보) | resolved (→ separate tab) |
| D-003 | open | **open** (offset/page 후보) | resolved (→ offset/page) |
| D-204 | resolved (→ 항상 홈) | **open** (재오픈) | resolved (→ 기본 홈 + returnTo 우선) |
| C-001 | 없음 | **open** (A/B, 이전 값 보존) | resolved (닫힘 동기화) |
| U-001 | open | **open** (resolvable 주석) | resolved |
| G-001 | 없음 | **open** (제안) | open (accept 는 사람) |
| COUPON-001 frontmatter status | draft | **draft** | confirmed (김PM) |
| COUPON-001 탭 Copy Key | 없음 | **draft** | confirmed |
| AUTH-001 frontmatter status | confirmed | **confirmed** (강등 금지) | confirmed (재확정) |
| AUTH-001 returnTo (Interaction/Acceptance) | 없음 | **미반영** (baseline) | 반영 |
| app/navigation-map.md | returnTo 미반영 | **파일 미수정/부재** | returnTo Route Guard 반영 |
| api-manifest GET /coupons | bare array | **page envelope** (D-003 은 open 표기) | page envelope |
| api-error-policy offline | 없음 | **반영** | 반영 |
| COUPON-001 State Matrix offline | 없음 | **반영** | 반영 |
| figma-component-mapping | 없음 | **생성** | 생성 |

## 부록 B. 채점 시 참고 파일

- **1:1 정답 트리**: `examples/input-reconciliation/expected-llm-after/` ← actual-llm-after 는 이것과 비교
  - `expected-llm-after/README.md` (LLM-vs-human 경계, "navigation-map 은 일부러 없음")
  - `expected-llm-after/docs/frontend-workflow/_meta/reconciliation-register.md` (§4.1 정답표 출처)
  - `expected-llm-after/docs/frontend-workflow/_meta/{decision-log,conflicts}.md`
  - `expected-llm-after/docs/frontend-workflow/global/component-gap-register.md`
  - `expected-llm-after/docs/frontend-workflow/domains/coupons/screens/coupon-list/{screen-spec,figma-component-mapping}.md`
  - `expected-llm-after/docs/frontend-workflow/domains/auth/screens/login/screen-spec.md`
  - `expected-llm-after/docs/frontend-workflow/api/{api-manifest,api-error-policy}.md`
  - `expected-llm-after/reports/{reconciliation-summary,expected-readiness}.md`
- 계약: `frontend-workflow-kit/input-reconciliation.md`
- human-final 상한선(차이 이해용): `examples/input-reconciliation/expected-after/`
- baseline: `examples/input-reconciliation/project-before/docs/frontend-workflow/`
