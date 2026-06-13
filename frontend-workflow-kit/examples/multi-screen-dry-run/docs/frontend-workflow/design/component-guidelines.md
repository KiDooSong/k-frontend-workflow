---
artifact_id: component-guidelines
artifact_type: component-guidelines
status: draft
last_reviewed: 2026-06-12
---

# Component Guidelines

카탈로그(`design/component-catalog.snapshot.md`)에 등록된 공통 컴포넌트를 화면에서 사용할 때의 규칙이다. ScreenSpec 의 UI Sections / State Matrix 는 가능한 한 이 카탈로그 컴포넌트로 환원한다.

## 사용 원칙
- 카탈로그에 이미 있는 컴포넌트(`Button`, `TextField`, `SkeletonList`, `EmptyState`, `ErrorState`, `Avatar`)를 우선 재사용한다. 화면별 1회용 컴포넌트를 새로 만들지 않는다.
- 로딩/빈 상태/에러 상태는 각각 `SkeletonList` / `EmptyState` / `ErrorState` 로 표현한다. State Matrix 의 `loading` / `empty` / `error` 행과 1:1 로 매핑한다.
- import 경로는 카탈로그에 적힌 `@/components/ui/*` 형태를 그대로 따른다.

## variant 사용 규칙
- `Button` 의 1차 액션은 `variant: 'primary'`, 보조 액션은 `variant: 'secondary'` 를 사용한다. 한 화면 안에 primary 버튼은 하나만 둔다.
- 카탈로그에 정의되지 않은 variant 값(예: `danger`, `ghost`)을 임의로 가정하지 않는다. 필요하면 Component Gap Register 에 제안한다.

## 접근성
- 모든 인터랙티브 컴포넌트(`Button`, `TextField`)에는 접근성 레이블을 제공한다. 아이콘 only 버튼은 특히 누락되기 쉬우므로 레이블을 반드시 채운다.
- `TextField` 의 `error` 는 시각 표시만이 아니라 스크린리더가 읽을 수 있는 형태로 노출한다.
- 색상만으로 상태를 구분하지 않는다(텍스트/아이콘 보조 표시 병행).
- 터치 타깃은 최소 44x44 를 권장한다.

## 새 공통 컴포넌트가 필요할 때
- 카탈로그로 표현이 안 되는 새 공통 컴포넌트가 필요하면 직접 추가하지 말고 **Component Gap Register 에 제안(open)만** 한다. 채택(accept)은 사람 결정이다.
- gap 제안에는 "필요한 화면"과 "기존 카탈로그로 안 되는 이유"를 함께 적는다.

## 디자인 값 추측 금지
- 색상·간격·타이포 등 구체 디자인 값은 추측하지 않는다. Figma 등 출처가 없으면 값을 채우지 말고 **TODO** 로 남긴다.
- 비즈니스 동작은 ScreenSpec 이 우선, 시각 디자인은 Figma 가 우선이다. 둘이 충돌하면 임의로 합치지 말고 충돌로 기록한다.
