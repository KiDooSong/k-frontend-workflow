# examples/layout-profile — Tier1 layout-profile 테스트 픽스처

Tier1 layout-profile 로더(`scripts/lib/layout-profile.mjs`)의 회귀 픽스처 모음.
**소스 트리가 아니라 프로파일 로더 단위 테스트의 입력**이다(실제 `src/**` 동반 없음).

## custom-monorepo/project-layout.yaml

`expo-feature` 프리셋 위에 머지 3계층을 모두 깔아둔 최소 custom layout:

| 계층 | 내용 | 검증 |
|---|---|---|
| preset | `expo-feature`(= 현 하드코딩) | 비오버라이드 role 상속 |
| `roles:` (preset < roles) | `route_entry: app/**` 재바인딩 | top-level role 단위 교체 |
| `domains.legacy.roles` (roles < domains) | `screen: src/legacy/{domain}/screens/**` | 도메인-스코프 오버라이드 격리 |

소비처: `scripts/lib/layout-profile.test.mjs` 의 "custom fixture" 블록
(`npm run test:spec` / `node --test scripts/lib/layout-profile.test.mjs`).

배경·동기: `temp/runs/tier1-integration-dogfood-001.md` (read-only dogfood 보고서) §7-1·§8.

> 이 픽스처는 default layout(`policies/project-layout.yaml`)과 **다른** role 바인딩을 일부러 갖는다 —
> default 만으로는 못 잡는 머지 우선순위/도메인 오버라이드 해소를 커밋본으로 고정하기 위함이다.
