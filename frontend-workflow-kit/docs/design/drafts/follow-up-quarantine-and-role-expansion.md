# Follow-up Quarantine and Role Expansion

> Status: proposal / discussion draft. 2026-06-16.
> 목적: 작업 중 새로 발견되는 후속 작업을 현재 세션이 몰래 흡수하지 못하게 격리하고,
> 허용 경로가 부족할 때 프로젝트별 architecture role 을 어떻게 확장할지 정리한다.
> 이 문서는 실행 게이트를 추가하지 않는다. 현재 설계가 부족한 지점을 판단하기 위한 고민 문서다.

---

## 0. 결론 요약

role 확장은 현재 설계 방향과 일치한다.

킷은 이미 물리 경로를 고정하지 않고 `project-layout.yaml` + preset + `{roles.X}` 로 추상화하는 방향으로 가고 있다. 기본 preset 이 `screen`, `domain_component`, `hook` 처럼 작게 시작할 뿐, 최종 방향은 "세 가지 고정 패턴"이 아니라 **프로젝트별 architecture role 을 선언하고 readiness policy 가 모드별로 여는 구조**다.

반면 작업 중 발견되는 후속 작업은 아직 약하다. 지금도 `Open Decision`, `Unknowns`, `conflicts.md`, `Reconciliation Register`, `Investigation`, `Run Report ## Follow-up` 이 있지만, "현재 Work Packet 범위 밖에서 새로 발견된 일"을 구조적으로 격리하는 전용 형식은 없다. 그래서 후속이 대화 기억에만 남거나, 현재 세션이 작업 범위를 조용히 넓혀 처리할 위험이 있다.

핵심 원칙:

```txt
좋은 아이디어를 막지 않는다.
다만 현재 Work Packet 의 allowed_paths 를 세션이 자기 판단으로 넓히지 못하게 한다.
필요한 확장은 Follow-up / Scope Extension / Architecture Role Proposal 로 기록한 뒤,
사람이 새 Work Packet 또는 layout/policy 변경으로 승격한다.
```

---

## 1. 이미 있는 분류와 빈칸

현재 설계에서 후속성 정보를 담을 수 있는 곳:

| 상황 | 현재 위치 | 한계 |
|---|---|---|
| 진짜 막는 결정 | `open-decisions.md` | 사람 결정 게이트로는 강하지만, 단순 후속/개선까지 넣으면 무거움 |
| 사실 확인 | ScreenSpec `Unknowns` | 화면 정본에는 남지만 실행 세션의 발견 이력으로는 약함 |
| 입력 충돌 | `conflicts.md` 또는 Reconciliation Register | 입력 간 충돌에는 좋지만 구현 중 발견한 개선/부채에는 맞지 않음 |
| 실행 후 메모 | Run Report `## Follow-up` | 현재는 readiness `next_actions` 재표면화에 가까워 구조화가 약함 |
| 긴 조사 | Investigation / Verification | 장기 조사에는 좋지만 작은 후속을 전부 담기엔 무거움 |

빠진 영역은 다음이다.

| 빠진 유형 | 의미 |
|---|---|
| `scope-extension-request` | 현재 작업을 끝내려면 allowed_paths 밖 파일을 만져야 하는 경우 |
| `refactor-candidate` | 지금 구현은 가능하지만 더 좋은 구조가 보여 별도 작업으로 빼야 하는 경우 |
| `shared-contract-change` | hook return shape, component props, AsyncState, query key 등 공유 계약 변경 필요 |
| `architecture-role-proposal` | 현재 layout role 에 없는 계층이 필요해 보이는 경우 |
| `design-system-gap` | 공통 컴포넌트, token, component catalog, figma mapping gap |
| `validation-gap` | 수동으로 발견한 문제를 다음부터 스크립트/룰로 잡고 싶은 경우 |
| `cleanup-debt` | 중복, dead path, naming drift, 낡은 구현 |
| `cross-screen-impact` | 한 화면 작업 중 같은 도메인/다른 화면 영향이 보이는 경우 |

---

## 2. Follow-up Quarantine

### 2.1 문제

작업 세션은 보통 한 Work Packet 의 목표와 allowed_paths 를 들고 시작한다. 그런데 구현 중 이런 일이 생긴다.

- 공통 helper 를 만들면 더 깔끔함.
- 다른 화면에도 같은 상태/컴포넌트가 필요함.
- hook 계약이 현재 화면만을 위해 좁게 잡혀 있음.
- 현재 도메인에 adapter/mapper/schema 계층이 필요한데 preset role 에 없음.
- 지금 고치면 좋은 리팩터링이 보임.

이때 세션이 그대로 처리하면 "작업 A"가 "작업 A+B+C"로 커진다. 환각과 신뢰성 문제를 줄이려고 국소 단위로 자른 설계가 무너진다.

### 2.2 규칙

Work Packet 실행 중 새 일이 발견되면 세션은 다음 중 하나로 분류한다.

| class | 현재 세션 행동 | 설명 |
|---|---|---|
| `current-scope` | 계속 진행 가능 | 이미 allowed_paths 안이고 Goal/Expected Output 달성에 직접 필요 |
| `blocker` | 멈춤 | 이 결정을 하지 않으면 현재 작업을 계속하면 위험함. Open Decision/Unknown 후보로 올림 |
| `scope-extension-request` | 기록 후 사람 판단 | 현재 목표 달성에 필요하지만 allowed_paths 밖 파일이 필요함 |
| `follow-up` | record-only | 중요하지만 현재 packet 없이도 목표는 끝낼 수 있음 |
| `refactor-candidate` | record-only | 더 좋은 구조이지만 현재 세션에서 하면 범위 확장 |
| `duplicate` | 링크만 | 이미 다른 artifact 에 추적 중 |

금지:

```txt
- 세션이 자기 판단으로 allowed_paths 를 넓히지 않는다.
- 후속을 처리하기 위해 ScreenSpec/Open Decision 을 닫거나 confirmed 로 승격하지 않는다.
- helper/refactor/shared-contract 변경을 "작은 김에" 처리하지 않는다.
```

### 2.3 Run Report 섹션 제안

초기에는 새 전역 레지스터보다 Run Report 에 구조화된 섹션을 추가하는 편이 가볍다.

```md
## Discovered Work

| ID | Class | Title | Affected Scope | Current Session Action | Suggested Next |
|---|---|---|---|---|---|
| FU-20260616-001 | scope-extension-request | coupon price formatter helper 필요 | coupons / COUPON-001, COUPON-002 | recorded-only | new Work Packet |
| FU-20260616-002 | validation-gap | allowed_paths 밖 helper 생성 시 더 명확한 메시지 필요 | workflow-report | recorded-only | proposal |
```

세부 YAML 이 필요하면 각 행 아래에 둔다.

```yaml
id: FU-20260616-001
class: scope-extension-request
title: "Coupon screens need shared price formatting helper"
discovered_in: "WP-COUPON-001-screen-skeleton-001"
affected_domains: ["coupons"]
affected_screens: ["COUPON-001", "COUPON-002"]
evidence:
  - "src/features/coupons/screens/CouponListScreen.tsx"
needed_paths:
  - "src/features/coupons/lib/formatCoupon.ts"
current_session_action: recorded-only
suggested_next:
  kind: new-work-packet
  requested_mode: rough-fixture-ui
  note: "helper role 또는 domain lib role 이 열려야 함"
```

이 섹션은 evidence 이지 gate 가 아니다. 사람이 필요하다고 판단하면 새 Work Packet, Open Decision, layout/policy 변경, Investigation 으로 승격한다.

---

## 3. Scope Extension Request

### 3.1 언제 쓰나

현재 목표를 합리적으로 끝내려면 allowed_paths 밖 파일이 필요한 경우.

예:

```txt
현재 packet: COUPON-001 screen-skeleton
allowed_paths: src/features/coupons/screens/**
발견: 날짜/가격 포맷 helper 가 필요함
필요 경로: src/features/coupons/lib/formatCoupon.ts
```

이때 세션은 helper 를 만들지 않는다. 대신 둘 중 하나를 택한다.

1. allowed_paths 안에서 임시 국소 구현으로 목표를 끝낼 수 있으면 그렇게 끝내고 `scope-extension-request` 기록.
2. 임시 국소 구현이 제품/계약을 왜곡하면 `blocker` 로 멈춤.

### 3.2 판단 기준

| 질문 | yes 이면 |
|---|---|
| 이 파일 없이 현재 Expected Output 을 만족할 수 없는가? | `scope-extension-request` 또는 `blocker` |
| 지금 만들면 다른 화면/도메인 계약이 바뀌는가? | 현재 세션에서 금지, 후속화 |
| 단순 중복 제거 욕구인가? | `refactor-candidate` |
| 이미 role 이 있는데 readiness mode 가 아직 열지 않은 것인가? | 새 packet 또는 mode 상향 전제 필요 |
| role 자체가 없는 계층인가? | `architecture-role-proposal` |

---

## 4. Role Expansion

### 4.1 현재 설계와의 정합

role 확장은 현재 설계와 맞는다.

이미 존재하는 방향:

- `frontend-workflow-kit/policies/project-layout.yaml` 은 `preset: expo-feature` 를 기본으로 둔다.
- `frontend-workflow-kit/presets/expo-feature.yaml` 은 role → glob 을 정의한다.
- `implementation-mode-policy.yaml` 은 `{roles.screen}`, `{roles.domain_component}`, `{roles.hook}`, `{roles.api_client}` 같은 role 토큰을 사용한다.
- `scripts/lib/layout-profile.mjs` 는 preset, project-level `roles`, `domains.<d>.roles` 를 머지해 `resolvedLayout` 을 만든다.
- role 은 판정 로직이 아니라 경로 데이터다. 모드 판정은 여전히 `readiness.mjs` 가 단일 출처다.

따라서 "screen/domain/hook 세 개로 고정"하는 설계가 아니다. 기본 preset 이 작을 뿐이다.

### 4.2 role 은 무엇이어야 하나

role 은 "파일 폴더 이름"이 아니라 **현재 모드에서 열어도 되는 architecture surface**다.

가능한 확장 예:

```yaml
roles:
  screen: src/features/{domain}/screens/**
  domain_component: src/features/{domain}/components/**
  hook: src/features/{domain}/hooks/**
  domain_helper: src/features/{domain}/lib/**
  domain_adapter: src/features/{domain}/adapters/**
  domain_mapper: src/features/{domain}/mappers/**
  domain_schema: src/features/{domain}/schemas/**
  domain_model: src/features/{domain}/model/**
  query_factory: src/features/{domain}/queryKeys/**
  ui_primitive: src/components/ui/**
```

mode 별로 여는 role 은 별도로 정한다.

```yaml
rough-fixture-ui:
  allowed_paths:
    - "{roles.screen}"
    - "{roles.domain_component}"
    - "{roles.hook}"
    - "{roles.domain_helper}"

api-integrated-ui:
  allowed_paths:
    - "{roles.hook}"
    - "{roles.api_client}"
    - "{roles.domain_adapter}"
    - "{roles.domain_mapper}"
    - "{roles.domain_schema}"
```

### 4.3 언제 role 을 추가하나

role 추가는 가볍게 보이지만, allowed_paths 를 넓히는 효과가 있다. 따라서 다음 중 하나일 때만 고려한다.

| 조건 | role 추가 가능성 |
|---|---|
| 프로젝트 architecture 에 이미 해당 계층이 있음 | 높음 |
| 같은 유형의 후속이 여러 Work Packet 에서 반복됨 | 높음 |
| 한 화면 전용 helper 하나가 필요함 | 낮음. 우선 현재 allowed_paths 안 국소 구현 또는 follow-up |
| 다른 도메인과 공유되는 계층임 | 별도 shared role 필요. 신중 |
| 단지 구현 편의를 위한 임시 파일임 | 낮음 |

role 추가 후보는 `architecture-role-proposal` 로 기록한다.

```yaml
id: FU-20260616-004
class: architecture-role-proposal
title: "Add domain_helper role for coupons formatting helpers"
reason: "Repeated need for domain-local pure helpers across coupon screens"
proposed_role:
  name: domain_helper
  glob: "src/features/{domain}/lib/**"
proposed_policy_change:
  rough-fixture-ui:
    allowed_paths:
      add: ["{roles.domain_helper}"]
risk:
  - "widens rough-fixture-ui surface inside each domain"
  - "same-domain parallel sessions may now touch shared helper files"
current_session_action: recorded-only
```

---

## 5. 초기 설계가 충분하면 어떻게 다른가

입력 반영과 설계가 충분히 잘 되어 있었다면, helper/adapter/mapper/schema 계층은 처음부터 role 과 policy 에 반영될 수 있다.

좋은 초기 흐름:

```txt
Input/Reconciliation
→ domain architecture 확인
→ project-layout roles 확인/추가
→ implementation-mode-policy 가 모드별 role 을 엶
→ readiness output allowed_paths 에 helper/adapter 경로 포함
→ Work Packet 은 그 allowed_paths 안에서 실행
```

이 경우 helper 생성은 돌발이 아니라 정상 작업 범위다.

반대로 구현 중 발견했다면, 그건 "설계가 늦게 따라온 것"이다. 현재 세션이 몰래 처리하지 않고 후속으로 격리한다.

---

## 6. 같은 도메인 병렬 작업과 role 확장의 긴장

role 을 넓히면 같은 도메인 병렬 세션의 충돌 가능성도 커진다.

예:

```txt
COUPON-001 list 세션과 COUPON-002 detail 세션이 모두 coupons 도메인.
둘 다 rough-fixture-ui.
allowed_paths 에 src/features/coupons/components/** 와 hooks/** 가 열림.
두 세션이 같은 CouponCard 또는 useCoupons 계약을 다르게 바꿀 수 있음.
```

이 문서는 worktree 간 실시간 충돌 탐지를 해결하지 않는다. 대신 다음 보수 규칙을 둔다.

- shared role 을 건드리는 필요가 생기면 `shared-contract-change` 또는 `scope-extension-request` 로 남긴다.
- 현재 화면 전용 구현으로 끝낼 수 있으면 shared role 변경을 피한다.
- shared role 변경이 필수면 새 Work Packet 을 별도로 발급한다.
- role 추가 제안에는 "same-domain parallel risk" 를 반드시 적는다.

나중에 더 강하게 가려면 role 에 shared surface metadata 를 둘 수 있다.

```yaml
roles:
  domain_component:
    glob: src/features/{domain}/components/**
    shared_surface: domain
```

하지만 v1 에서는 metadata/gate 를 추가하지 않는다. Run Report 에 risk 를 남기는 수준이 안전하다.

---

## 7. 도입 옵션

### Option A — 문서/템플릿만

가장 가볍다.

- `run-report.template.md` 에 `## Discovered Work` 추가.
- `work-packet.template.md` 의 `Out of Scope` 에 "범위 밖 후속은 Discovered Work 에 기록" 한 줄 추가.
- `workflow-report.mjs` 는 일단 placeholder 만 렌더.

장점: 새 게이트 없음. 현재 철학과 정합.
단점: 사람이 잘 적어야 한다.

### Option B — 구조화된 collector

`workflow:report` 가 별도 파일을 받아 `Discovered Work` 를 합친다.

```bash
npm run workflow:report -- --discoveries temp/runs/x/discovered-work.yaml
```

장점: 세션/에이전트가 구조화된 후속을 남기기 쉬움.
단점: 새 입력 포맷과 검증 필요.

### Option C — Follow-up Register

전역 레지스터를 만든다.

```txt
docs/frontend-workflow/_meta/follow-up-register.md
```

장점: 여러 세션에서 후속을 모아 보기 좋음.
단점: 새 mutable status 표가 생김. 현재 roadmap 의 "새 산출물 축 추가 금지"와 충돌 가능성이 있어 신중해야 함.

권고: Option A 로 시작하고, 필요성이 반복되면 Option B 를 검토한다. Option C 는 나중.

---

## 8. 현재 문서에 추가할지 판단 기준

현재 설계 문서에 바로 넣을 필요가 있는 내용:

- Work Packet/Run Report 가 후속을 현재 세션에서 처리하지 말아야 한다는 규칙.
- `allowed_paths` 밖 작업이 필요하면 Scope Extension Request 로 남긴다는 규칙.
- role 확장은 가능하지만, 현재 세션이 직접 role/policy 를 넓히지 않는다는 규칙.

아직 정식 문서에 넣기 이른 내용:

- 전역 Follow-up Register.
- role metadata(`shared_surface`) 기반 병렬 충돌 표시.
- 자동 stale/freshness 판정.
- worktree 간 lease/lock.

---

## 9. Open Questions

1. `Discovered Work` 를 Run Report 에만 둘지, Work Packet 에도 "expected follow-up surface" 를 둘지?
2. `scope-extension-request` 가 현재 목표의 blocker 인지, 단순 후속인지를 누가 최종 판정할지?
3. role 추가는 어느 문서에서 승인할지: `project-layout.yaml` 변경 PR, Open Decision, 또는 별도 architecture note?
4. 같은 도메인 shared role 변경은 항상 별도 Work Packet 으로 분리할지?
5. 후속 ID 는 전역 ID(`FU-...`)가 필요한가, 아니면 Run Report 로컬 ID 로 충분한가?
