# 다층(Clean Architecture) Expo 프로젝트 킷 도입 dry-run — 깨짐 지점 실측

> 2026-06-21 · branch `verify/multilayer-adoption-dryrun` · 목적: OD-12(Axis 2 선회)의 전제
> "다층 프로젝트가 킷을 도입하면 어디서 깨지는가"를 **추론이 아니라 실제 실행으로** 확인.
> 방법: 정본 Clean Architecture 6계층 Expo "profile" 피처를 손으로 만들고, 현재 킷(코드 무수정)을
> `--docs/--src/--layout` 로 도입 시도. 모든 결과는 실제 스크립트 출력.

## 실험 대상 (canonical Clean Architecture)

```
src/
  app/profile.tsx                               route_entry
  presentation/profile/
    screens/ProfileScreen.tsx                   screen        (View)
    viewmodels/useProfileViewModel.ts           view-model    ← load-bearing, 킷에 role 없음
    components/ProfileHeader.tsx                 domain_component
  domain/profile/
    entities/Profile.ts                         entity        ← role 없음
    usecases/GetProfileUseCase.ts               use-case      ← role 없음
    repositories/ProfileRepository.ts           repo interface ← role 없음 (의존성 역전)
  data/profile/
    repositories/ProfileRepositoryImpl.ts       repo impl     ← role 없음
    datasources/ProfileRemoteDataSource.ts      data-source
    mappers/ProfileMapper.ts                    mapper        ← role 없음
  components/ui/Button.tsx                       ui_primitive
  api/schemas/profile.schema.ts                 api_schema
  lib/asyncState.ts                             AsyncState 계약
```

`project-layout.yaml`: Tier1 으로 기존 7 role 을 clean-arch 경로에 재바인딩 + Axis 2 로 추가 계층 7개
(`view_model/use_case/entity/repository_interface/repository_impl/data_source/mapper`)를 **새 role 로 선언**
(보고서가 말한 "탈출구 (2) 새 role 글롭 추가" 그대로).

---

## 결과 — 무엇이 되고 무엇이 깨지나

### ✅ 되는 것 (Axis 1 — 같은 3계층, 다른 폴더)
| 관찰 | 증거 |
|---|---|
| clean-arch 폴더 구조를 role 재바인딩으로 흡수 | `readiness` 가 `src/presentation/profile/screens|components|viewmodels/**` 를 allowed_paths 로 렌더 |
| `validate` 12종 전부 통과 | `workflow:validate — OK (검사 12종 통과)` exit 0 |
| VM 을 hook role 로 매핑 → `fake_hook_exists: true` | `workflow-state.yaml` |

→ "같은 screen→hook→api 를 다른 폴더에 두는" 변형은 **지금도 도입 가능**. 보고서 Axis 1 판정과 일치.

### ❌ 깨지는 것 (Axis 2 — 계층이 더 깊게 쪼개짐)

**F1. 선언한 추가 계층 role 7개가 전부 inert (게이트/fact 0).**
readiness 출력의 allowed_paths/forbidden_paths 는 **내장 7 role 만** 참조한다. 내가 선언한
`use_case/entity/repository_interface/repository_impl/mapper/data_source/view_model` 는 **단 한 곳에도 안 나온다.**
→ role 추가는 "경로 이름표"만 줄 뿐, **모드 진입 자격도 완성도 게이트도 주지 않는다.**

```
readiness_mode: rough-fixture-ui
allowed_paths:   presentation/.../screens, components, viewmodels   ← 추가 계층 0
forbidden_paths: data/.../datasources, openapi.yaml                 ← 추가 계층 0
```

**F2. 게이트 사각지대 — 도메인+데이터 계층 전체가 "허용도 금지도 아님".**
`src/domain/**` 와 `src/data/.../repositories|mappers/**` 는 어느 모드의 allowed 에도 forbidden 에도 없다.
forbidden-paths 는 특정 guarded surface(api/openapi 계열)만 보므로 이 계층 편집은 **아무 모드에서도 안 막힌다**
(= 단계적 규율 0). 동시에 진입 자격으로도 안 쓰이니 **있어도 게이트가 안 열린다.**

**F3. [headline] 킷은 "완전한 6계층"과 "도메인+데이터 통째 누락"을 구분 못 한다.**
도메인 계층(entities/usecases/repository interface) + 데이터 계층(repository impl/mapper)을 **전부 제거**하고
재실행 → readiness **바이트 동일**(`rough-fixture-ui`, 같은 allowed_paths). Clean Architecture 의 핵심
load-bearing 계층이 통째로 비어도 readiness 는 "다음 단계 진행 OK"라고 답한다. 완성도 fact 가 그 계층을
읽지 않기 때문(spec.mjs 의 fact 집합에 `repository_present` 류 자체가 없음).

**F4. catalog-gen 은 project-layout 을 아예 안 읽는다 (UI_MARKER 하드코딩).**
`ui_primitive` 를 재바인딩해도 catalog-gen 은 `/src/components/ui/` 리터럴만 본다(catalog-gen.mjs:23).
이 실험은 ui 가 표준 경로라 통과했지만, ui 를 다른 곳(예: `presentation/components`, `shared/ui`)에 두는
다층 프로젝트는 **catalog 0건 → `component_catalog_generated:false` → rough-fixture-ui 진입 차단**. 도입 자체가 막힘.

**F5. validate 는 계층맹(layer-blind).**
12종 전부 통과하지만 전부 문서 일관성 검사다. 데이터/도메인 계층의 존재·부재·경계에 대해 **검사 항목이 없다.**
"validate 초록 = 다층 구현이 건강함"은 거짓 신호.

---

## OD-12 / tier3 결정에 주는 함의

- **OD-12 의 전제("다층은 게이트 천장 안에서 표현 불가")는 추론이 아니라 실측으로 확인됨.** F1~F3 이 그 직접 증거.
- **F3(사각지대)이 tier3 설계를 직접 정당화한다:** 필요한 건 정확히 ① 계층별 완성도 fact(`<role>_present`),
  ② mode↔layer 결합(`edits_at`/`gates`), ③ 순서 있는 `layers:`. tier3 §2~§5 가 겨냥하는 바와 일치.
- **tier3 blocker ①(비단조 forbidden)도 이 실험이 구체화한다:** 데이터 계층을 단계적으로 막으려면 단일
  `edits_at` 임계값만으론 부족하고 per-mode allow/deny 가 필요하다 — F2 의 "허용도 금지도 아님"을 닫으려면
  forbidden 표현력이 반드시 따라와야 함을 실물로 보여줌.
- **F4 는 tier3 §8 P1(catalog-gen ui_primitive 바인딩)이 "선결"인 이유의 실증** — Axis 2 이전에 Axis 1
  도입조차 비표준 ui 경로에서 막힌다.

## 정직한 한계 (이 실험이 증명하지 *못한* 것)
- 이 프로젝트는 **내가 합성한** canonical clean-arch 이지 실제 팀의 brownfield 가 아니다. → "킷이 Axis 2 를
  게이트 못 한다"(구조적 사실)는 증명하나, "실제 팀이 이 게이팅을 *원한다*"(수요)는 여전히 미검증.
- **Clean Architecture 한 종류만** 시험. MVVM/FSD 는 유사하나 다른 깨짐(F2 위치 차이)을 낼 것.
- 게이트 *표현* 계층(readiness/validate/catalog)만 시험. 실제 편집 차단 훅(pre-edit-mode-guard)은
  코드로 존재하지 않아(보고서 §1.2) 시험 대상이 아니었음.

## 재현 (worktree 기준)
```
KIT=frontend-workflow-kit ; APP=$KIT/temp/runs/multilayer-adoption-dryrun/app
node $KIT/scripts/workflow-state.mjs --docs $APP/docs/frontend-workflow --src $APP/src --layout $APP/project-layout.yaml --date 2026-06-21
node $KIT/scripts/catalog-gen.mjs    --src $APP/src --out $APP/docs/frontend-workflow/design/component-catalog.md
node $KIT/scripts/readiness.mjs      --docs $APP/docs/frontend-workflow --layout $APP/project-layout.yaml   # F1/F2
node $KIT/scripts/validate.mjs       --docs $APP/docs/frontend-workflow --src $APP/src --layout $APP/project-layout.yaml  # F5
# F3: src/domain + src/data/profile/{repositories,mappers} 제거 후 readiness 재실행 → 동일
```
