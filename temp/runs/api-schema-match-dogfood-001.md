---
title: "api-schema-match-dogfood-001 — 검사 8 소비자 dogfood"
kind: run-report
run_id: api-schema-match-dogfood-001
subject: "검사 8 (API Candidates(confirmed) ↔ api-manifest ## Endpoints ↔ zod export) dogfood"
kit_source_commit: "2776367 (#19) 에서 수행 → 14049d0 (main, parser-fix 머지)로 리베이스·재검증 — 검사 8 결과 불변"
worktree_branch: dogfood/api-schema-match-001 (rebased onto 14049d0)
fixture: "C:/Users/thdrl/source/repos/dogfood-api-schema-001 (ephemeral, 킷 레포 밖, rewards 앱 스타일)"
validate_source: "node frontend-workflow-kit/scripts/validate.mjs (worktree kit, yaml 1개 install)"
date: 2026-06-14
status: done
---

# Run Report: api-schema-match-dogfood-001

PR #19(검사 8 강화: API Candidates(confirmed) ↔ api-manifest ## Endpoints ↔ zod export 매칭)가 main(`2776367`)에 머지된 직후 실행한 **dogfood/리포트** 작업이다. 새 기능 구현이 아니며 `frontend-workflow-kit` 스크립트는 한 줄도 고치지 않았다.

질문: **"실제 소비 프로젝트 스타일 문서에서 검사 8을 그대로 쓸 수 있는가?"** — 키트 레포 **밖**에 가짜 소비 프로젝트(가상의 *rewards* 앱)를 만들고, 정상 통과 1 + 음성대조 1 + 요구된 실패 4 + 레거시-형 보너스 1 = **7개 케이스**를 실제 `validate` 로 돌려 확인했다.

- 소비 프로젝트(ephemeral): `C:/Users/thdrl/source/repos/dogfood-api-schema-001` — 킷 레포 **밖**. 보고가 곧 증거이므로 보관 불필요(아래 §재현에 전 파일 인라인).
- 킷 소스: `main` `2776367` 을 워크트리(`dogfood/api-schema-match-001`)로 분리. **현재 브랜치(main) 무변경**, 워크트리 작업트리는 이 보고서 1개만 추가(`git status --porcelain` 빈 출력 확인 후 작성).
- 판정 단일 출처: `validate.mjs` 출력 + exit code (텍스트 & `--json` 둘 다 캡처).

## Environment & 실행 방법

- OS Windows 11 · Node `v24.15.0` · 워크트리 킷에 `npm install --prefix .../frontend-workflow-kit` → `yaml` 1개(소비자와 동일한 경량 셋업).
- 정본 실행(케이스별):
  ```bash
  node frontend-workflow-kit/scripts/validate.mjs \
    --docs <case>/docs/frontend-workflow --src <case>/src [--json]
  ```
  스크립트를 **워크트리 킷**에서 실행 → `KIT_ROOT` 가 catalog/schemas/policies 를 공급하고, `--docs/--src` 만 소비 프로젝트(킷 밖)를 가리킨다. (consumer-dogfood-001 과 동일한 vendored 실행 모델.)

## 케이스 & 결과 (한눈에)

`--json` 요약(`ok`/`errors`/위반 검사번호):

```
case                         exit  ok     errors  check#  warn
----------------------------------------------------------------
pass                         0     true   0       -       0
pass-candidate-only          0     true   0       -       0
fail-missing-endpoint        1     false  1       8       0
fail-tbd-schema              1     false  1       8       0
fail-missing-export          1     false  1       8       0
fail-confidence-candidate    1     false  1       8       0
bonus-legacy-shape           1     false  1       8       0
```

★ 모든 실패가 **검사 8 단일 위반**(다른 검사 0건, 경고 0). 즉 통과 케이스의 docs 는 나머지 11종(1~7, 9~12)을 **실제로 통과**하며, 실패는 오직 검사 8 축에서만 발생한다 — 검사가 격리되어 동작함을 확인.

---

## 1. docs structure (통과 케이스)

소비 프로젝트 한 케이스의 트리(전 케이스 동일 골격, 케이스별로 단 한 축만 변형):

```
dogfood-api-schema-001/cases/pass/
├─ docs/frontend-workflow/
│  ├─ app/navigation-map.md                                   # artifact_type: navigation-map (status draft)
│  ├─ api/api-manifest.md                                     # artifact_type: api-manifest  (## Endpoints 표 = 검사 8 canonical)
│  └─ domains/rewards/screens/reward-list/screen-spec.md      # artifact_type: screen-spec   (status draft, 비-stub)
└─ src/api/schemas/reward.ts                                  # zod export (Linked Schema 해소 대상)
```

- 의도적으로 **최소**: navigation-map(검사 3 `depends_on` 해소용) + api-manifest + 화면 1 + zod 1.
- screen-spec 은 **비-stub**(Purpose 등 본문 있음)이라 Entry Points 의 `nav-graph` GENERATED 마커를 포함(검사 6 회피). `status: draft` 라 검사 7(승인 메타) 회피.
- **관찰**: api-manifest 는 `catalog/artifact-manifest.yaml` 에 **미등록**이라 경로/필수 frontmatter 강제가 없다(검사 2가 건드리지 않음). 그래서 `api/api-manifest.md` 위치·컬럼을 강제하는 주체는 오직 검사 8 의 파서(`lib/api-manifest.mjs`)다. → §7·§8 참조.

## 2. ScreenSpec API Candidates

`domains/rewards/screens/reward-list/screen-spec.md` 의 해당 섹션(전 실패 케이스 공통, 통과 케이스도 동일):

```markdown
## API Candidates
<!-- "- METHOD /path (confidence: unknown|candidate|confirmed)" 형식. -->
- GET /rewards (confidence: confirmed)
- GET /rewards/{rewardId} (confidence: candidate)
```

- 검사 8 은 **confirmed 후보만** 본다: `GET /rewards` 한 줄이 검사 대상, `GET /rewards/{rewardId} (candidate)` 는 무시.
- 파서(`parseApiCandidates`)는 `-` 불릿 + `\b(GET|POST|...)\b\s+(/...)` + `confidence: x` 를 읽는다. 위 형식 그대로 인식됨(실측).

## 3. api-manifest Endpoints

통과 케이스 `api/api-manifest.md` 본문(검사 8 규약 = 5컬럼):

```markdown
## Endpoints
| Method | Path | Confidence | Linked Schema | Source |
|---|---|---|---|---|
| GET | /rewards | confirmed | RewardListResponseSchema | openapi |
| GET | /rewards/{rewardId} | candidate | TBD | notion |
```

- canonical 컬럼: **Method, Path, Confidence, Linked Schema, Source**. 헤더는 `col()` 느슨매칭(대소문자/공백 무시).
- `Source=openapi` 라도 검사 8 은 **Source 를 쓰지 않는다** — Linked Schema 를 항상 zod export 로만 해소(OpenAPI 해소는 known limitation). 정보용 컬럼.
- candidate 행(`/rewards/{rewardId}` = TBD)은 confirmed ScreenSpec 후보가 가리키지 않으므로 검사 대상 아님 → TBD 여도 무해.

## 4. schema export file

통과 케이스 `src/api/schemas/reward.ts`:

```ts
// 소비 프로젝트 zod 스키마 — 검사 8 의 Linked Schema export 심볼 해소 대상.
import { z } from 'zod';

export const RewardSchema = z.object({
  id: z.string(),
  title: z.string(),
  points: z.number(),
});

export const RewardListResponseSchema = z.array(RewardSchema);
```

- 검사 8(`collectSchemaExports`)은 **정규식 스캔**으로 `export const|let|var|function|class|enum NAME` 과 `export { X }`(값 재-export)를 수집. `RewardListResponseSchema` 가 export 집합에 들어가 manifest 의 Linked Schema 와 매칭됨.
- AST 미사용 → "이 export 가 진짜 zod 인지"는 증명하지 않음(known limitation). `export type {X}`/`interface`/주석처리 export 는 **불인정**.

## 5. validate — 통과 케이스

```
$ node frontend-workflow-kit/scripts/validate.mjs --docs cases/pass/docs/frontend-workflow --src cases/pass/src
workflow:validate — OK (검사 12종 통과)
----- EXIT 0 -----
```

확정 흐름(happy path) 전 구간 통과: confirmed `GET /rewards` → manifest 의 confirmed 행 → Linked Schema `RewardListResponseSchema` → zod export 존재 → **검사 8 무위반**, 나머지 11종도 통과.

추가 **음성 대조군** `pass-candidate-only`(confirmed 0건 + api-manifest 없음 + src/api/schemas 없음):

```
$ node .../validate.mjs --docs cases/pass-candidate-only/... --src cases/pass-candidate-only/src
workflow:validate — OK (검사 12종 통과)
----- EXIT 0 -----
```

→ **초기 발굴 단계(미확정 candidate만 있는 화면)를 검사 8이 조기 차단하지 않음**을 실증. manifest/스키마가 아예 없어도 통과(폴백조차 confirmed 0건이면 안 탐). DX 양호.

## 6. validate — 실패 케이스

요구된 4 + 보너스 1. 각 케이스는 통과 트리에서 **딱 한 축만** 어긋나게 했다. 모두 **검사 8 단일 위반·exit 1**.

| # | 케이스 | 어긋난 축 | 위반 보고 파일 | exit |
|---|---|---|---|---|
| a | fail-missing-endpoint | manifest 에 `GET /rewards` 행 없음 | **screen-spec** | 1 |
| b | fail-tbd-schema | manifest `GET /rewards` confirmed, Linked Schema=`TBD` | **api-manifest** | 1 |
| c | fail-missing-export | Linked Schema=`RewardListResponseSchema` 인데 zod export 없음 | **api-manifest** | 1 |
| d | fail-confidence-candidate | manifest `GET /rewards` 행 confidence=`candidate` | **screen-spec** | 1 |
| e | bonus-legacy-shape | 레거시 표(Method/Path/용도/Response/confidence) — **Linked Schema 컬럼 부재** | **api-manifest** | 1 |

실측 출력(원문 그대로):

```text
========== a) fail-missing-endpoint ==========
  [검사 8] docs\frontend-workflow\domains\rewards\screens\reward-list\screen-spec.md:
  confirmed API GET /rewards 가 api-manifest ## Endpoints 에 매칭되는 엔드포인트가 없음
  → 해소: api/api-manifest.md ## Endpoints 에 GET /rewards 행을 추가하거나 ScreenSpec confidence 를 candidate 로 낮추세요.
----- EXIT 1 -----

========== b) fail-tbd-schema ==========
  [검사 8] docs\frontend-workflow\api\api-manifest.md:
  confirmed endpoint GET /rewards 에 Linked Schema 가 없음(빈칸/TBD)
  → 해소: ## Endpoints 행의 Linked Schema 에 실제 export 스키마명을 기입하세요.
----- EXIT 1 -----

========== c) fail-missing-export ==========
  [검사 8] docs\frontend-workflow\api\api-manifest.md:
  confirmed endpoint GET /rewards 의 Linked Schema=RewardListResponseSchema 가 src/api/schemas/*.ts export 에서 발견되지 않음
  → 해소: 스키마 export 를 추가하거나 Linked Schema 를 올바른 export 이름으로 수정하세요.
----- EXIT 1 -----

========== d) fail-confidence-candidate ==========
  [검사 8] docs\frontend-workflow\domains\rewards\screens\reward-list\screen-spec.md:
  confirmed API GET /rewards 의 api-manifest 엔드포인트 confidence=candidate 이라 confirmed 아님
  → 해소: manifest 행의 confidence 를 confirmed 로 올리거나 ScreenSpec 을 candidate 로 낮추세요.
----- EXIT 1 -----

========== e) bonus-legacy-shape ==========
  [검사 8] docs\frontend-workflow\api\api-manifest.md:
  confirmed endpoint GET /rewards 에 Linked Schema 가 없음(빈칸/TBD)
  → 해소: ## Endpoints 행의 Linked Schema 에 실제 export 스키마명을 기입하세요.
----- EXIT 1 -----
```

- a~d: 요구된 4개 실패가 정확히 각자의 메시지로 발화. 메시지에 **양방향 해소 힌트**("manifest 올리기 / ScreenSpec 낮추기")가 붙어 DX 좋음.
- e(보너스)는 **레거시 표 스키마**(키트의 기존 현실적 예제가 쓰는 컬럼)로 confidence=confirmed 를 줘도 실패한다 → §7-(2) 핵심 발견의 실증.

## 7. confusing UX (혼란 지점)

검사 8 로직·메시지는 견고하지만, **소비자가 정답 문서를 처음 만들 때**의 마찰이 분명히 있다.

1. **api-manifest 템플릿 부재 + 매니페스트 미등록 (가장 큰 갭).**
   검사 8 의 canonical 출처는 `api/api-manifest.md` 의 `## Endpoints`(5컬럼)인데 —
   - `templates/` 에 `api-manifest` 템플릿이 **없다**(11개 템플릿 중 없음).
   - `catalog/artifact-manifest.yaml` 에 `api-manifest` 가 **미등록**(경로/필수 frontmatter 강제 없음).
   소비자는 정확한 5컬럼 형식(특히 `Linked Schema` 컬럼명·`Confidence` enum·Source 의 의미)을 **예제나 소스에서 역추론**해야 한다. "복사해서 시작할" 정본이 없다.

2. **키트에 ## Endpoints 표 스키마가 두 종류 공존 — 함정.**
   - **레거시 형** `| Method | Path | 용도 | Response (요약) | confidence |` → `examples/multi-screen-dry-run`, `examples/input-reconciliation/{project-before,expected-after,expected-llm-after}` = 현실적 예제 **4곳 전부**. **Linked Schema 컬럼 없음.**
   - **검사 8 형** `| Method | Path | Confidence | Linked Schema | Source |` → `examples/api-schema-match/*` 픽스처에만.
   소비자가 "현실적 예제"(multi-screen-dry-run 등)를 본떠 api-manifest 를 만든 뒤, 어떤 후보를 confirmed 로 승격하면 **검사 8 이 갑자기 깨진다**. `Linked Schema` 컬럼 자체가 없기 때문(보너스 케이스 e 가 정확히 이 상황).

3. **"빈칸/TBD" 메시지가 '컬럼 부재' 를 구분 못 함.**
   레거시 표(Linked Schema 컬럼 없음)에서도 메시지는 `Linked Schema 가 없음(빈칸/TBD)` 로 동일하게 나온다(케이스 e). 컬럼이 아예 없는 소비자는 "TBD 라고 쓴 칸이 없는데?" 하며 표에서 존재하지 않는 셀을 찾게 된다. "셀이 비었음" vs "컬럼이 표에 없음" 이 같은 문장으로 합쳐져 있다.

4. **Source 컬럼이 권위 있어 보이지만 장식이다.**
   `Source=openapi` 로 적어도 검사 8 은 **항상 zod export 로만** 해소한다(OpenAPI components.schemas 미해소 = known limitation). 작성자가 보는 위치(템플릿/표 주석)에는 이 사실이 없어, "openapi 라고 적었으니 OpenAPI 로 풀리겠지" 라는 오해 소지가 있다.

5. **위반 보고 파일이 두 곳으로 갈린다.**
   missing-endpoint·confidence-candidate 는 **screen-spec** 에, tbd·missing-export 는 **api-manifest** 에 보고된다. 고칠 위치를 가리킨다는 점에선 합리적이지만, 소비자가 "한 링크(화면↔manifest↔스키마)"로 인식하는 대상이 케이스에 따라 다른 파일에 찍혀 처음엔 헷갈릴 수 있다(중간 심각도 아님, 인지 비용만).

6. **zod export 인식 규칙이 숨어 있다(저빈도).**
   `export type {X}`·`interface`·주석처리 export 는 불인정, 그러나 `export const X`(zod 아니어도) 는 인정. 이 규칙은 `examples/api-schema-match/README.md` 에만 있고 스키마 작성자가 보는 곳엔 없다.

> 긍정 UX: 해소 힌트(양방향), candidate-only 무발화(조기 차단 없음), 경로 파라미터 정규화(`{id}`/`:id`/`[id]` 흡수)로 표기차 오탐 방지 — 이 셋은 실측으로 잘 동작했다.

## 8. recommended docs/template updates

검사 8 코드(validate.mjs/api-manifest.mjs)는 **건드리지 않는 전제**에서, 문서·템플릿·예제 쪽 권고(우선순위 순):

1. **[P1] `templates/api/api-manifest.template.md` 신설.** 검사 8 의 5컬럼 `## Endpoints` 표를 정본으로 제공하고, 헤더 주석에 (a) `Confidence` enum=unknown|candidate|confirmed, (b) **Linked Schema = `src/api/schemas/*.ts` 의 export 심볼(zod 런타임 값)**, (c) **Source 는 정보용 — 검사는 zod export 로만 해소(OpenAPI 미해소)** 를 명시. → §7-(1)(4) 해소.

2. **[P1] `catalog/artifact-manifest.yaml` 에 `api-manifest` 등록.** `path: docs/frontend-workflow/api/api-manifest.md`, `required_frontmatter: [artifact_id, artifact_type, status]`, `template:` 위 신설 템플릿. 그러면 검사 2가 경로·필수필드를 잡고, 산출물이 레지스트리에서 **발견 가능**해진다. (검사 8과 독립적으로 작동, 회귀 위험 낮음 — 단 기존 api-manifest 인스턴스의 경로/frontmatter가 규칙에 맞는지 한 번 확인 필요.)

3. **[P1] 두 ## Endpoints 스키마 정합.** `examples/multi-screen-dry-run` 과 `examples/input-reconciliation/*` 의 레거시 표(용도/Response/confidence)를 5컬럼 정본(Confidence/Linked Schema/Source)으로 **마이그레이션**하거나, 최소한 "이 예제는 검사 8 이전 형식" 이라는 주석을 달아 함정을 제거. → §7-(2)(3) 해소. (이 dogfood 에서 두 형식 공존이 가장 실질적 함정으로 드러남.)

4. **[P2] 메시지 개선(검사 8 코드 변경 필요 → 본 dogfood 범위 밖, 후속 제안).** `## Endpoints` 표에 `Linked Schema` 헤더가 **아예 없을 때**는 `Linked Schema 가 없음(빈칸/TBD)` 대신 `Linked Schema 컬럼이 표에 없음(레거시 형식?)` 류로 분기. validate.mjs 수정이 필요하므로 여기서는 **권고만** 하고 구현하지 않는다.

5. **[P3] 작성자 노출 위치에 zod 인식 규칙 한 줄.** 템플릿/README 의 Linked Schema 설명에 "타입 전용 export(`export type`/`interface`)·주석 export 는 불인정" 를 명시. → §7-(6).

## 9. README/template update 필요한가?

**필요하다 (Yes).** 근거와 범위:

- **템플릿: 필요(P1).** 현재 검사 8 의 입력(api-manifest ## Endpoints)에 대응하는 **시작점 템플릿이 없다.** 소비자가 빈손에서 정확한 5컬럼을 맞추기 어렵다 — §8-(1)·(2)가 직접 처방.
- **README: 필요(P1, 보완).** `examples/api-schema-match/README.md` 자체는 규약을 잘 설명한다(매우 좋음). 그러나
  - 상위/저자용 문서(킷 루트 README·작성 가이드)가 "api-manifest 가 이제 검사 8 의 canonical 입력" 임을 가리키지 않는다 → 한 줄 포인터 필요.
  - 두 ## Endpoints 형식 공존(§7-2)이 README/예제 수준에서 정리되어야 함(§8-3).
- **검사 8 코드(validate.mjs/api-manifest.mjs): 변경 불필요.** 로직은 견고하고 모든 케이스가 의도대로 동작했다. 메시지 분기(§8-4)는 "있으면 더 좋은" 후속이지 게이트 정확성 문제는 아니다. **본 작업에서 수정하지 않았다.**

요약: **문서/템플릿/예제 보강 = 필요. 검사 8 엔진 = 그대로 충분.**

---

## main 리베이스 점검 (추가: 작업 중 main 전진 대조)

이 dogfood 수행 중 로컬 `main` 이 `2776367`(#19) → `14049d0` 로 전진했다(`fix/parser-gate-robustness` 머지: `6553c81` 표 파서 fix + `ae97ab8` 종합 분석 보고서). 워크트리를 `14049d0` 로 리베이스(빠른 전진)하고 재대조했다.

**① 리베이스로 해소되는 검사 8 결과 = 없음 (불변).**
- `6553c81` 은 `lib/spec.mjs` 표 파서를 고친다 — P1(빈 줄로 구분된 두 표가 병합돼 게이트 fail-open), P2(escaped pipe `\|` 미처리로 우측 컬럼 신호 오염). `parseTable`→`parseTables`/escape-aware `splitRow`/`pickTableBySignature`.
- 그러나 검사 8 의 입력은 ScreenSpec `parseApiCandidates`(라인 파서, **미변경**)와 manifest `## Endpoints`(단일 표 블록)뿐이고, 내 7개 케이스엔 escaped pipe·다중 표·표 중간 빈 줄이 **없다** → 영향 없음. `14049d0` 워크트리 키트로 7개 케이스 재실행 → exit code·메시지 **base(2776367)와 완전히 동일**(실측).

**② 리베이스로 해소되는 §7 저자-경험 갭 = 없음.** 새 커밋의 변경 파일은 `spec.mjs`·`spec.test.mjs`·`package.json`·`input-artifact.template.md`·CI·분석 보고서**뿐** — api-manifest 템플릿·매니페스트 등록·`validate.mjs`/검사 8·examples(두 ## Endpoints 형식)를 **건드리지 않는다**. 따라서 §7·§8 권고는 그대로 유효.

**③ 다만 main 의 새 분석 보고서가 본 dogfood 를 독립 확증/보완한다** — `temp/runs/project-analysis-report-2026-06-14.md`:
- **P9**("frontmatter schema enum 9종 vs artifact-manifest 7종 → `api-manifest`·`component-guidelines` 가 검사 2 스킵") = 본 보고 **§7-1 의 '미등록' 절반을 독립 확증**(경로가 다름: 정적 코드대조 ↔ 본 dogfood 실측).
- **P10**("검사 12 register 8컬럼 템플릿 부재 → 작성자가 예제에서 역설계") = §7-1 의 **'템플릿 부재 → 역추론' 패턴과 동일 클래스**(대상만 register ↔ api-manifest).
- **§7-2(## Endpoints 표 두 형식 공존: 레거시 용도/Response/confidence vs 검사8 Confidence/Linked Schema/Source)** 는 분석 보고서에 **없는 신규 발견** — 상호 보완.
- 분석 보고서 §7 우선순위 #4("P9·P10 문서-코드 정합")가 본 보고 §8-(1)(2)(api-manifest 템플릿 신설 + 매니페스트 등록)와 **같은 방향** → 합치면 한 액션으로 처리 가능.

> 결론(점검): **리베이스는 dogfood 결과·발견을 바꾸지 않는다** — 검사 8 은 이번 파서 fix 와 직교한다(실측 재확인). 대신 main 의 분석 보고서가 §7-1 을 독립 확증하고, 본 dogfood §7-2 가 그 보고서를 보완하므로, **두 보고서를 묶어 "api-manifest 템플릿 + 매니페스트 등록 + 예제 ## Endpoints 정합" 한 건으로 처리**하는 것이 합리적이다.

---

## 재현 (소비 프로젝트는 ephemeral)

킷 레포 밖 `dogfood-api-schema-001/make-cases.mjs` 가 7개 케이스 트리를 생성한다(통과 트리에서 케이스별 한 축만 변형). 핵심 변형분:

| 케이스 | manifest ## Endpoints 핵심 행 | reward.ts | 화면 후보 |
|---|---|---|---|
| pass | `GET /rewards · confirmed · RewardListResponseSchema · openapi` | export 존재 | confirmed |
| pass-candidate-only | (api-manifest 없음) | (src/api/schemas 없음) | candidate만 |
| fail-missing-endpoint | `POST /auth/login` 만 (rewards 행 없음) | export 존재 | confirmed |
| fail-tbd-schema | `GET /rewards · confirmed · TBD · notion` | export 존재 | confirmed |
| fail-missing-export | `GET /rewards · confirmed · RewardListResponseSchema` | **export 누락** | confirmed |
| fail-confidence-candidate | `GET /rewards · candidate · RewardListResponseSchema` | export 존재 | confirmed |
| bonus-legacy-shape | `GET /rewards · 용도 · RewardDto[] · confirmed` (Linked Schema 컬럼 **없음**) | export 존재 | confirmed |

실행: `node make-cases.mjs` → 케이스별 `node frontend-workflow-kit/scripts/validate.mjs --docs <case>/docs/frontend-workflow --src <case>/src [--json]`. 모든 docs/zod 본문은 위 §1~§4 에 그대로 인용됨.

## Gate Compliance ("Do not" 준수)

| 금지 | 준수 | 근거 |
|---|---|---|
| validate.mjs 수정 | ✅ | 무수정. 워크트리 `git status --porcelain` 빈 출력(이 보고서 추가 전). 메시지 개선은 §8-4 **권고만**. |
| readiness.mjs 수정 | ✅ | 미접근. |
| package.json 수정 | ✅ | 미수정(`npm install` 은 gitignore 된 node_modules 만 — package-lock 무변경 확인). |
| CI 수정 | ✅ | 미접근. |
| release docs 수정 | ✅ | 미접근. |
| candidate→confirmed 무단 승격 | ✅ | confirmed 후보는 **dogfood 테스트 데이터**로 ephemeral 프로젝트에 직접 작성. 키트의 어떤 실제 문서도 승격하지 않음. |
| frontend-workflow-kit scripts 수정 | ✅ | 무수정(소비 프로젝트는 킷 밖). |
| Output: temp/runs/api-schema-match-dogfood-001.md 만 생성 | ✅ | 워크트리 내 신규 파일은 이 보고서 1개. 소비 프로젝트는 킷 레포 밖(ephemeral). |

## 결론

검사 8 엔진은 **소비 프로젝트 스타일 문서에서 그대로 사용 가능**하다 — 정상 통과, 음성 대조(candidate-only 무발화), 요구된 4개 실패가 전부 의도대로(검사 8 단일 위반·정확한 메시지·양방향 해소 힌트) 동작했다. 다만 **저자 경험(authoring)에 갭**이 있다: (1) api-manifest 시작점 템플릿 부재 + 매니페스트 미등록, (2) 키트 안에서 ## Endpoints 표 스키마가 두 형식으로 공존(현실적 예제 4곳은 검사 8 이 못 푸는 레거시 형). 권고는 전부 **문서/템플릿/예제 쪽**이며 검사 8 게이트 로직(정확성)은 손댈 필요가 없다(메시지 문구만 §8-4 P2 로 개선 — §후속 구현).

---

## 후속 구현 (이 브랜치 — dogfood 권고 반영)

> ⚠ §8(권고)·§9·Gate Compliance 의 "구현하지 않음 / 검사 8 코드 변경 불필요" 프레이밍은 **dogfood 단계 기준**이다. 이후 사용자 요청으로 §8 권고 네 가지를 **이 브랜치에서 함께 구현**했다(아래). 이 보고서는 *발견*, 같은 변경의 코드/템플릿/예제가 *해소* 다.

구현·검증(모두 `14049d0` 워크트리 키트 기준):

| 권고 | 구현 | 핵심 |
|---|---|---|
| §8-1 P1a | `templates/api/api-manifest.template.md` 신설 | 5컬럼 정본 + Confidence enum / Linked Schema=zod export / Source 정보용·OpenAPI 미해소 주석 |
| §8-2 P1b | `catalog/artifact-manifest.yaml` 에 `api-manifest` 등록 | path·required_frontmatter·template (scope: api). 분석보고서 **P9 해소**(schema enum↔manifest 정합) |
| §8-3 P1c | 레거시 예제 4곳 `## Endpoints` → canonical 5컬럼(앞) + 용도/Response 참고 2컬럼 보존(7컬럼 superset) | multi-screen-dry-run + input-reconciliation ×3. 검사 8 은 앞 5컬럼만 읽음 → 트랩 제거 + **정보 손실 0**. Linked Schema=TBD(전부 candidate/unknown) |
| §8-4 P2 | `lib/api-manifest.mjs` `hasLinkedSchemaCol` + `validate.mjs` 메시지 분기 | "컬럼 부재(레거시)" vs "셀 빈칸/TBD" 구분 → §7-3 해소. 신규 `api-manifest.test.mjs`(단위 6 + validate 서브프로세스 E2E 2) |

**§7-3 해소 실측**(P2 후):
- `fail-tbd-schema`(컬럼 있음·셀=TBD): `… Linked Schema 가 비어있음(빈칸/TBD)`
- `bonus-legacy-shape`(컬럼 부재): `… ## Endpoints 표에 Linked Schema 컬럼이 없음(레거시 형식) → … templates/api/api-manifest.template.md 참조`

**회귀 가드**: `npm test`(test-fixtures 골든 21 + 단위 13건, 0 fail) EXIT 0 · `example:validate` EXIT 0 · api-schema-match 7픽스처 의도대로(pass 3 = exit 0 / fail 4 = 검사 8 단독) · `git stash` 대조로 input-reconciliation 예제 트리의 기존 오류(검사 3/4, navigation-map·Interaction route)가 내 변경과 **무관**함을 확인(변경 전후 동일 2·4건).

**Codex 리뷰**: 전체 변경에 Codex(codex-cli 0.130.0) 적대적 리뷰 1회 — **블로킹(P1) 0건**. P2 2건(예제 표 정보손실 → 7컬럼 superset 으로 용도/Response 가시 보존 · 검증기 메시지 E2E 테스트 부재 → validate 서브프로세스 E2E 2건 추가)과 P3 2건(`artifact-manifest.yaml` 헤더 주석 stale · README 템플릿 미기재) **모두 반영**.

> 정리: dogfood 가 찾은 두 갭(템플릿/등록 부재 · ## Endpoints 두 형식)과 메시지 모호성(§7-3)이 모두 닫혔다. 검사 8 **게이트 로직(정확성)** 은 불변, 바뀐 것은 메시지 문구(DX)·문서/템플릿/예제뿐.
