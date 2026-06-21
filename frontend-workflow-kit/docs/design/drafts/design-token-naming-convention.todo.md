# (TODO seed) Design-token Naming 규약 — VS-2 슬롯용

> Status: **TODO seed (규약 본문 아님)**. 2026-06-21.
> 이 파일은 VS-2 세션이 작성할 "design-token naming 규약" 문서의 **범위·소유·전제 메모**일 뿐이다.
> 규약 본문(형식·네임스페이스 확정값)은 여기 없다 — VS-2(사람-결정 슬롯)에서 작성한다. (OD-VS-2 = 옵션 a)
> 금지: 이 파일에 토큰 네이밍 규약을 상세 구현하지 않는다(VS-1 스코프 절제).

---

## 왜 (VS-1 이 남긴 빈칸)

- VS-1 정본 옵션 섹션의 `## Visual Spec`·`## Data Corrections` 가 **토큰 ID** 를 참조한다.
- 그 토큰 ID 가 "무엇을 만족해야 유효한가"의 규약이 아직 없다 → VS-1 템플릿의 예시 셀(`space.4`·`bg.surface`·`title.md`·`radius.md`)은 **규약이 아니라 형태 placeholder**.
- 이 규약이 있어야 VS-3 의 W1(토큰 ID **형식** 검사) 근거가 서고, W2(토큰 **존재** 검사)는 이 규약 + 소비 레포 토큰 source 를 전제로 가능해진다.

## 소유 (OD-VS-2 = 옵션 a, 사람-수용 2026-06-21)

- **킷**: 토큰 ID **네이밍 규약만** 정의(형식·네임스페이스·합성 규칙). 받아 적는 계약.
- **소비 레포**: 토큰 **값·생성·검증** 소유. 킷 core 는 Figma 수집기·토큰 생성기를 구현/번들하지 않는다.
- 생성기를 쓰는 소비 레포의 **멱등 + GENERATED 마커**는 규약에 **권고로만**(킷 미번들).

## VS-2 가 결정/작성할 것 (scope — 본 seed 에서 값 채우지 않음)

- [ ] 네임스페이스 집합 확정: `color.*` / `space.*` / `type.*` / `radius.*` / `shadow.*`(또는 `elevation.*`) — 최종 집합·계층 깊이.
- [ ] 형식 규약(형식만, 값 아님): 소문자·점-구분·세그먼트 의미(예: `color.<role>.<variant>` 류를 채택할지).
- [ ] 합성 토큰(typography): `type.*` 가 family/size/weight/lineHeight 를 어떻게 묶나(04 §1a "합성 토큰 expand").
- [ ] `raw N` ↔ 토큰 승격 경로: raw 가 어떤 조건에서 토큰화되나(`## Gaps / Open` → 토큰 추가 결정).
- [ ] 소비 레포 토큰 source 의 **인터페이스**(킷이 "받아 적는" 형식) — 생성기 자체는 소비 레포(Tokens Studio→Style Dictionary→NativeWind 는 *reference*, 04 §5).
- [ ] (검사 연결) W1 형식 검사가 읽을 패턴의 근거 정의(VS-3 가 소비; 여기선 규약만).

## 전제 / 비전제

- **전제**: VS-1(토큰 ID 칸 존재 — 정본 옵션 섹션) 반영 후.
- **비전제(범위 밖)**: 토큰 **생성기** 구현, 실제 토큰 **값**, validate/CI 구현, hard gate. 전부 별도 슬롯·사람.

## Cross-links

- VS-1 실행안: [visual-spec-vs1-execution.md](visual-spec-vs1-execution.md)
- 결정 기록: [visual-spec-od-decisions.md](visual-spec-od-decisions.md) (OD-VS-2 = a)
- 출처 제안: [visual-spec-formalization.md](visual-spec-formalization.md) (§8 OD 후보·§6 W1·W2)
- 리서치(reference): [04 — 토큰 분류·파이프라인](../../../../docs/research/figma-design/04-figma-mcp-rest-data-collection.md) (§1a 토큰 5종·§5 토큰 단일출처)
