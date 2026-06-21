# (TODO seed) Design-token Naming 규약 — VS-2 슬롯용

> ⚠ DEPRECATED (2026-06-21~): 이 seed 의 역할(VS-2 범위·소유·전제 메모)은 규약 본문
> [design-token-naming-convention.md](design-token-naming-convention.md) 로 **대체**됐다. 신규 참조는 그 문서를 쓴다.
> 본 파일은 seed→규약 추적 근거 보존용으로 **한 사이클만 유지** 후 제거 예정(제거는 사람 정리 슬롯).
> 아래 체크리스트는 규약 본문에서 어떻게 해소됐는지의 대조용 기록으로만 남긴다.
>
> Status: ~~TODO seed~~ → **superseded by design-token-naming-convention.md**. 2026-06-21.
> 이 파일은 VS-2 세션이 작성할 "design-token naming 규약" 문서의 **범위·소유·전제 메모**였다(규약 본문 아님).
> 규약 본문(형식·네임스페이스 확정값)은 여기 없다 — VS-2 에서 위 문서로 작성됨. (OD-VS-2 = 옵션 a)

---

## 왜 (VS-1 이 남긴 빈칸)

- VS-1 정본 옵션 섹션의 `## Visual Spec`·`## Data Corrections` 가 **토큰 ID** 를 참조한다.
- 그 토큰 ID 가 "무엇을 만족해야 유효한가"의 규약이 아직 없다 → VS-1 템플릿의 예시 셀(`space.4`·`bg.surface`·`title.md`·`radius.md`)은 **규약이 아니라 형태 placeholder**.
- 이 규약이 있어야 VS-3 의 W1(토큰 ID **형식** 검사) 근거가 서고, W2(토큰 **존재** 검사)는 이 규약 + 소비 레포 토큰 source 를 전제로 가능해진다.

## 소유 (OD-VS-2 = 옵션 a, 사람-수용 2026-06-21)

- **킷**: 토큰 ID **네이밍 규약만** 정의(형식·네임스페이스·합성 규칙). 받아 적는 계약.
- **소비 레포**: 토큰 **값·생성·검증** 소유. 킷 core 는 Figma 수집기·토큰 생성기를 구현/번들하지 않는다.
- 생성기를 쓰는 소비 레포의 **멱등 + GENERATED 마커**는 규약에 **권고로만**(킷 미번들).

## VS-2 가 결정/작성할 것 (scope — ✅ 규약 본문에서 해소됨)

- [x] 네임스페이스 집합 확정 → 규약 §2 (필수 5종 `color`/`space`/`type`/`radius`/`shadow`\|`elevation` + 확장; asset/icon 은 토큰 아님).
- [x] 형식 규약(형식만, 값 아님) → 규약 §4.1 문법 + §4.2 권장 canonical.
- [x] 합성 토큰(typography) → 규약 §2(`type` = 합성) + §4.2(`type.<role>.<size>`); expand 는 소비 레포(04 §5 reference).
- [x] `raw N` ↔ 토큰 승격 경로 → 규약 §4.4.
- [x] 소비 레포 토큰 source 인터페이스("받아 적는" 형식) → 규약 §1 소유 표 + §4.3 dialect 선언(킷 미번들).
- [x] (검사 연결) W1 형식 검사 근거 → 규약 §4.1 문법 + §5.1 W1; VS-3 가 소비(§8 handoff).

## 전제 / 비전제

- **전제**: VS-1(토큰 ID 칸 존재 — 정본 옵션 섹션) 반영 후.
- **비전제(범위 밖)**: 토큰 **생성기** 구현, 실제 토큰 **값**, validate/CI 구현, hard gate. 전부 별도 슬롯·사람.

## Cross-links

- VS-1 실행안: [visual-spec-vs1-execution.md](visual-spec-vs1-execution.md)
- 결정 기록: [visual-spec-od-decisions.md](visual-spec-od-decisions.md) (OD-VS-2 = a)
- 출처 제안: [visual-spec-formalization.md](visual-spec-formalization.md) (§8 OD 후보·§6 W1·W2)
- 리서치(reference): [04 — 토큰 분류·파이프라인](../../../../docs/research/figma-design/04-figma-mcp-rest-data-collection.md) (§1a 토큰 5종·§5 토큰 단일출처)
