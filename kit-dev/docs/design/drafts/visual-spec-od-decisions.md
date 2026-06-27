# Visual Spec OD 결정 기록 — VS-1~VS-4 (사람-수용)

> Status: **resolved / accepted (사람)**. 2026-06-21.
> 수용: 레포 오너 (only3ss@tongro.co.kr). 출처: [visual-spec-formalization](visual-spec-formalization.md) §8 의 후속 OD 후보.
> 이 문서는 **결정 기록**이다. "수용"은 *방향(권고 옵션) 채택*이며, 그 자체로 게이트를 신설/상향하지 않는다.
> hard 게이트 승격·confirmed 승격은 전부 **향후 별도 사람 OD**(telemetry 후)로 남는다.

---

## 0. 무엇이 수용됐고, 무엇이 아닌가

[visual-spec-formalization](visual-spec-formalization.md) §8 의 4개 후속 OD 를 **모두 권고 옵션대로 사람이 수용**했다.

**수용된 것 (= 방향 확정):**
- VS-1 = 옵션 (b) · VS-2 = 옵션 (a) · VS-3 = 옵션 (a) · VS-4 = 옵션 (a).
- 즉 각 축의 *진행 방향*이 정해졌고, 순차 슬롯에서 그 방향으로 진행해도 된다.

**수용에 포함되지 *않은* 것 (불변식 유지):**
- 어떤 **hard 게이트**도 신설/상향하지 않는다 — 전부 warning-first. hard 승격은 telemetry 후 *재차 별도 사람 OD*.
- **코드/정책/CI 구현을 지금 착수하지 않는다** — VS-3 validate 스크립트·VS-4 CI smoke 는 별도 *명시 지시 + 순차 슬롯* 필요(이 세션은 설계 중심).
- 정본 템플릿 옵션 섹션화·`.draft` deprecated 는 실행 슬롯(branch)에서 적용됨; `.draft` *제거*(단계2)·main merge 시점만 유보(사람).
- `figma_mapping_status` 는 **존재 신호로 유지** — 시각 충실도 게이트로 쓰지 않는다(formalization §2.2).
- 킷 core 는 Figma 수집기/토큰 생성기를 구현·번들하지 않는다(VS-2 소유 = 소비 레포).

---

## OD-VS-1 — Visual Spec 섹션 정식 채택 · 수용: 옵션 (b)

- **결정 질문:** PR69 의 `figma-component-mapping.template.draft.md`(+ §3 교정)를 정본 템플릿으로 승격할지.
- **수용된 옵션 (b):** `## Visual Spec` 등을 정본 `figma-component-mapping.template.md` 에 **옵션 섹션**으로 추가. `artifact_type` 불변(새 축 아님), 점진 적용.
- **지금 승인하는 것:** 정본 템플릿에 옵션 섹션을 더하는 방향. 기존 화면 일괄 마이그레이션은 강제하지 않는다.
- **유보(실행 슬롯에서):** `.draft` 제거·정본 완전 대체 *시점*, 기존 골든 예제 retrofit 범위.
- **전제·차단:** ⚠ **PR69 가 아직 OPEN**(2026-06-21 기준). 정합을 위해 (1) PR69 머지 → (2) §3 교정(Patch B: §3.1 격리경로·§3.2 provenance·§3.3 facts·§3.4 회사 screen id) 적용 → (3) 정본에 옵션 섹션 반영. **이 순서 전엔 정본 편집 금지.**
- **다음 구체 액션(수용 시점 계획):** PR69 머지 후 Patch B 적용 → 정본 템플릿 옵션 섹션화. (VS-1 이 다른 모든 VS 의 기반.)
- **실행 업데이트(2026-06-21, branch `docs/visual-spec-vs1-figma-mapping`):** 전제(PR69 OPEN) 해소(머지 가정) + 레포 오너 명시 지시로 §3.2 정본 옵션 섹션 적용·`.draft` deprecated(단계1). "정본 편집 금지"는 *LLM 자율 편집* 가드 — 사람 지시·브랜치 격리·사람 merge 로 충족. 결정(옵션 b) 불변. 남은 것 = `.draft` 제거(단계2)·main merge(PR #75) — 둘 다 사람. 근거: [visual-spec-vs1-execution.md](visual-spec-vs1-execution.md).

## OD-VS-2 — Design-token source 계약 · 수용: 옵션 (a)

- **결정 질문:** Visual Spec 이 참조하는 토큰 ID 의 정의·검증 출처와 소유.
- **수용된 옵션 (a):** 킷은 **토큰 ID 네이밍 규약만** 정의한다. 값·생성·검증 소유는 **소비 레포**(킷 core 가 수집/생성기 안 가짐 원칙과 정합).
- **지금 승인하는 것:** "design-token 네이밍 규약" 설계 문서(예: `color.*`/`space.*`/`type.*`/`radius.*`/`shadow.*` 형식 규약) 작성 방향. 생성기는 킷이 만들지 않는다.
- **유보:** 소비 레포가 생성기를 쓸 때의 *멱등 + GENERATED 마커* 는 규약 문서에 **권고**로만 적고, 킷이 번들하지 않는다.
- **전제:** VS-1(토큰 ID 칸 존재). 이 규약이 있어야 VS-3 의 W2(토큰 존재 검사)가 가능.
- **다음 구체 액션:** VS-1 후, "design-token naming 규약" 드래프트.
- **실행 업데이트(2026-06-21, branch `docs/vs2-design-token-naming`):** "design-token naming 규약" 드래프트 작성 → [design-token-naming-convention.md](design-token-naming-convention.md). 네임스페이스 최소 5종(color/space/type/radius/shadow\|elevation)·권장 vs 허용(소비 레포 dialect 흡수) 형식·`raw N` escape·**W1(형식)/W2(존재) 검사 분리** 정의. 결정(옵션 a) **불변**: 킷은 네이밍 규약만, 값/source/생성/검증은 소비 레포, 생성기·수집기 미번들. 규약은 **draft**(미-confirmed) — confirmed 승격·W2 hard gate 는 사람. VS-2 seed 는 deprecated. 정본 템플릿 patch 는 *제안만*(사람/오너 적용).
  - **정합성 점검(소비 레포 worked example, figma-fidelity 파일럿):** 파일럿의 **atomic→semantic 2-tier**(DTCG 슬래시 경로 — atomic `color/<palette>/<step>` → semantic `<role>/<variant>` alias) + NativeWind 유틸(`bg-*`/`rounded-*`/`text-<type>`·spacing=Tailwind 수치) 방향과 **구조적 차이 없음**을 확인했다. 규약 §4.2(semantic head 생략형 = 정본 템플릿 예시)·§4.3(dialect: 슬래시·`spacing`·유틸리티 흡수)·§4.6(2-tier 명시, 무결성 검증은 소비 레포)로 반영. 특정 DS 값/세트는 정본화하지 않음.

## OD-VS-3 — warning-first visual spec validate · 수용: 옵션 (a)

- **결정 질문:** formalization §6 의 검사(W1 토큰ID 형식 · W3 필수섹션 · W4 raw↔Gaps · W5 override↔decision · W6 4컬럼 유지)를 도입할지.
- **수용된 옵션 (a):** W1·W3·W4·W5·W6 을 **warning-only(`continue-on-error`)** 로. W2(토큰 존재)는 **VS-2 후**.
- **지금 승인하는 것:** warning-only 검사의 *설계/방향*. ⚠ **실제 validate 스크립트·CI 와이어링 구현은 미착수** — 별도 명시 지시 + 순차 슬롯 필요.
- **유보(중요):** **hard 게이트 승격은 이 수용에 미포함** — telemetry 후 *재차 별도 사람 OD*. 어떤 신호도 `figma_mapping_status` readiness fact 에 합치지 않는다.
- **전제:** VS-1(섹션 존재) · W2 는 VS-2.
- **다음 구체 액션:** VS-1·VS-2 후, validate 슬라이스 설계 → (명시 지시 시) warning-only 구현.

## OD-VS-4 — 비주얼 회귀 evidence 도입 · 수용: 옵션 (a)

- **결정 질문:** 렌더 스크린샷 ↔ baseline diff(Expo 웹 + Playwright + odiff, mismatch ≤2%)를 Verification 축 evidence 로 도입할지.
- **수용된 옵션 (a):** **warning-only CI smoke 부터.** Verification 축 evidence 로서 도입.
- **지금 승인하는 것:** 도입 *방향*. baseline 은 **소비 레포 산출물**(회사 런이면 비추적). 검증 도구(Expo 웹 캡처)는 playwright 리서치(`docs/research/playwright/`, **PR69 도입 예정**)와 연결.
- **유보:** evidence→hard 게이트 승격은 telemetry 후 사람. 실제 CI/test 구현은 명시 지시 + 슬롯.
- **전제:** baseline = 소비 레포 산출물. 픽셀 100% 는 구조적 불가(formalization/04 §6) → ≤2% 수렴이 현실적 천장.
- **다음 구체 액션:** VS-1~3 과 병행 트랙 가능하나, 구현은 순차 슬롯/명시 지시.

---

## 순차 실행 계획 (roadmap "병렬 금지 — 슬롯 하나씩")

```
[done] PR69 머지 + Patch B(§3 교정)
   └─> [done·branch] VS-1 (정본 옵션 섹션화)  ← merge·`.draft` 제거(단계2)는 사람
         └─> [draft·branch] VS-2 (토큰 네이밍 규약, 소비-레포 소유)  ← confirmed 승격은 사람
               └─> VS-3 (warning-only validate; W2 는 VS-2 후)
   VS-4 (비주얼 회귀 evidence) ── 병행 가능, 단 hard 게이트는 telemetry 후 별도 OD
```

- **VS-1 전제 해소 + VS-1 본체 = 완료**(branch `docs/visual-spec-vs1-figma-mapping`, 오너 지시: 정본 옵션 섹션 적용·`.draft` deprecated). 남은 슬롯 = `.draft` 제거(단계2)·main merge(PR #75) — 사람.
- 각 슬롯은 한 번에 하나. confirmed 승격·OD resolve·hard gate 신설/상향은 **사람만**.

## 이 수용이 하지 *않는* 것 (범위 밖)

- validate 스크립트·CI smoke 구현(별도 명시 지시 + 슬롯).
- 정본 템플릿 즉시 대체(PR69 머지·Patch B 선행) — *수용 자체*의 범위 밖. (이후 별도 오너 지시 실행으로 branch 에서 옵션 섹션화 반영됨.)
- 어떤 hard 게이트 신설/상향.
- `roadmap-current.md` "다음 구현 후보" 슬롯 편집(사람이 슬롯팅 — 본 기록을 근거로).

## Cross-links

- 출처 제안: [visual-spec-formalization](visual-spec-formalization.md) (§3 교정·§6 검사·§8 OD 후보)
- VS-2 규약 드래프트: [design-token-naming-convention.md](design-token-naming-convention.md) (OD-VS-2 실행 산출물)
- 정본 템플릿: [figma-component-mapping.template.md](../../../../frontend-workflow-kit/templates/screen/figma-component-mapping.template.md)
- 정책(`figma_mapping_status`): [implementation-mode-policy.yaml](../../../../frontend-workflow-kit/policies/implementation-mode-policy.yaml)
- 리서치: [figma-design](../../../../docs/research/figma-design/README.md) · 검증 도구 playwright 리서치(`docs/research/playwright/`, PR69 도입 예정)
- 로드맵(슬롯팅 근거): [roadmap-current.md](../../../roadmap-current.md)
