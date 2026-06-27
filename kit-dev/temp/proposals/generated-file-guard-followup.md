# generated file guard — validate.mjs 후속 제안 (MVP-C Phase 0)

> 스냅샷: 2026-06-14. **설계 제안이다 — 이 문서는 구현이 아니다.** `scripts/validate.mjs` 는
> 이 세션에서 고치지 않았다(고칠 필요가 없었다 — §0). 여기 적힌 가드 확장은 MVP-C 착수 시점에
> `check-generated-files.mjs` 또는 검사 6 확장으로 구현할 후보다.
>
> 함께 읽을 것:
> [mvp-c-generated-views-scope.md](../../../temp/proposals/mvp-c-generated-views-scope.md) (§View 5 generated file guard) ·
> [artifact-manifest.yaml](../../../frontend-workflow-kit/catalog/artifact-manifest.yaml) (Phase 0 하드닝 — 생성물 계약) ·
> [generated-file-guard-001.md](../../../temp/runs/generated-file-guard-001.md) (이 작업 런 리포트) ·
> `frontend-workflow-kit-implementation.md` §3(생성 블록 규약)·§8(검사 6)·§9(생성기 명세)·§10(훅)

## 0. 결론 요약 — validate 를 왜 안 고쳤나

artifact-manifest 의 generated 계약을 **하드닝(필드 일관화 + planned 산출물 등록)** 하는 데
`validate.mjs` 변경이 **필요 없었다.** 코드를 추적한 근거(라인 번호는 현행 `scripts/validate.mjs`):

- **매니페스트 스키마 검증이 없다.** 매니페스트는 `loadYamlOrExit`(util.mjs)로 **순수 YAML 파싱만**
  한다 — 구조/필드 검증 없음. `validateSchema`(lib/schema.mjs)는 **문서 frontmatter 에만**
  적용된다(validate.mjs:159). 따라서 `generated: true`·`status: planned` 같은 **미지(未知) 필드는
  조용히 무시**된다. (기존 `component-catalog` 의 `mvp: C` 가 이미 그렇게 무해히 존재해 왔다.)
- **planned 산출물은 검사를 통과한다.** 검사 6 의 헤더 검사(아래 §1-ii)는 생성 파일이 **실제 존재할 때만**
  헤더를 본다 — `if (!exists(full)) continue;`(**validate.mjs:438**). 아직 생성기가 없어 파일도 없는
  `route-tree`·`nav-graph`·`eslint.workflow.config` 는 **건너뛴다(에러/경고 없음).**
- **`command`·`source` 는 validate 가 읽지도 실행하지도 않는다.** 존재하지 않는 명령/스크립트를
  가리켜도 무해하다.

검증: 편집한 매니페스트로 `npm run example:validate` 실행 → **`OK (검사 12종 통과)`, exit 0**
(런 리포트 §4 증거). 그래서 이 세션은 매니페스트·문서만 만지고 validate 코드는 **불변**으로 둔다.

## 1. 현행 검사 6 의 정확한 동작

검사 6(상단 목록 line 9 "do_not_edit 산출물의 GENERATED 헤더/마커 훼손")은 코드상 두 갈래다 —
본문 **섹션 마커** 검사와 **파일 전체 헤더** 검사. (코드 주석 라벨이 엇갈려 — 섹션 블록은 `6b`,
헤더 블록은 `6` — 아래는 기능+라인으로 적는다.) 불변식 #3: "생성물엔 GENERATED 헤더/마커, 마커
밖은 생성기가 안 건드린다."

### (i) 문서 내 생성 섹션 마커 — `validate.mjs:239–258` (코드 주석 라벨 `6b`)
- **하드코딩된 `'screen-spec'` 키**만 본다 —
  `(manifest.artifacts || {})['screen-spec']?.generated_sections`(:241–242).
- 각 (stub 아닌) screen-spec **본문**을 정규식 `new RegExp('GENERATED:START\\s+' + gen + '\\b')`
  / `...END...`(:248–249) 로 검사. 마커가 없거나 `START index >= END index`(:250) 면 에러 —
  메시지 `generated section 마커 부재/훼손/순서오류: ${sec.name} ...`(:254).
- **존재 가드(:438)와 무관**: 이 검사는 screen-spec 본문을 직접 순회하므로 (ii)의 파일-존재 가드를
  거치지 않는다. 그래서 **screen-spec 파일만 순회**하고 manifest 의 다른 항목·다른 in-file 블록은 못 본다.
  현재 in-file 블록을 쓰는 생성물은 screen-spec 의 `## Entry Points`(generator `nav-graph`) 하나뿐이라
  당장은 충분하지만, **데이터 주도(모든 `generated_sections`)가 아니다.**

### (ii) 생성 파일 전체 헤더 무결성 — `validate.mjs:432–443` (코드 주석 라벨 `6`)
- **모든 매니페스트 항목 순회**:
  `for (const [name, entry] of Object.entries(manifest.artifacts || {}))`(:433).
- **필터(:434):** `if (entry.kind !== 'generated' || entry.do_not_edit !== true) continue;`
  → 처리 대상은 **정확히 `kind === 'generated' && do_not_edit === true`**. (별도 `generated: true`
  필드는 보지 않는다.)
- **경로 매핑(:436–437):** `entry.path.replace(/^docs\/frontend-workflow\//, '')` 후
  `path.join(docsDir, rel)`.
- **존재 가드(:438):** `if (!exists(full)) continue;` — 파일이 없으면 건너뜀.
- **헤더 검사(:439–441):** 존재하면 앞 **400바이트**를 읽어 `/GENERATED FILE\s+—\s+DO NOT EDIT/`
  (em-dash U+2014) 매칭 실패 시 `add(6, full, …)` — 메시지 `생성물(${name})의 GENERATED 헤더 훼손/부재`
  (백틱 템플릿, name=아티팩트 키).

헤더 정본(impl §3): Markdown 은 `<!-- ... GENERATED FILE — DO NOT EDIT ... -->`,
YAML/JS 는 `# GENERATED FILE — DO NOT EDIT`. 실제 생성기(`workflow-state.mjs`)가 쓰는 바이트:
```
# GENERATED FILE — DO NOT EDIT
# Source:  docs/frontend-workflow/domains/**/screen-spec.md (frontmatter)
# Command: npm run workflow:state
```

## 2. 검사 6 이 잡는 것 / 못 잡는 것

| | 대상 | 현행 검사 6 |
|---|---|---|
| ✅ | do_not_edit:true 생성 파일의 **헤더 부재/훼손** (존재할 때) | 헤더 검사(:432–443) |
| ✅ | screen-spec Entry Points **블록 마커** 부재/순서오류 | 섹션 마커 검사(:239–258) |
| ❌ | 헤더가 멀쩡한데 **본문을 손으로 고친 경우** | **못 잡음** (앞 400바이트 헤더만 봄) |
| ❌ | screen-spec **외** 파일의 in-file 블록 마커 | 못 잡음 (`'screen-spec'` 하드코딩) |
| ❌ | **레포 루트** 생성 파일 (`eslint.workflow.config.mjs`) | 못 잡음 (경로 접두 가정, §3.1) |
| ❌ | 생성기 **멱등성 위반**(출력 드리프트) | 못 잡음 (재생성+diff 없음) |
| — | `component-catalog`(do_not_edit:**false**) | 의도적 제외 (MVP-A 수동 모드) |

**핵심:** 검사 6 은 *헤더/마커의 존재*만 본다. 불변식 #3 의 "마커 밖은 안 건드린다"를
**파일 전체 생성물의 본문 수정**에 대해선 **강제하지 못한다.** 이건 헤더 검사의 구조적 한계다(§3.3).

## 3. 제안 — generated 가드 4축

`check-generated-files.mjs`(`npm run workflow:check-generated`, 미존재) 또는 검사 6 확장이
수행할 규칙. **모두 매니페스트의 `kind: generated` 목록을 단일 출처로 읽는다** — 이 세션의 Phase 0
하드닝이 그 목록을 완전·일관하게 만든 것이 전제다.

### 3.1 generated header present (헤더 존재)
- **파일 목록을 매니페스트에서 끌어온다**: `kind: generated` 항목(선택적으로 `generated: true` 게이트).
  각 항목의 `path` 가 가리키는 파일이 존재하면 확장자에 맞는 헤더 형태(Markdown/YAML·JS)를 요구.
- **경로 해소를 고친다(가드 공백).** 현행 헤더 검사(:432–443)의 `path.replace(/^docs\/frontend-workflow\//,'')`
  +`join(docsDir,...)`(:436–437)는 **`docs/frontend-workflow/` 접두를 가정**한다. 그래서 루트 경로
  `eslint.workflow.config.mjs` 는 `docs/frontend-workflow/eslint.workflow.config.mjs` 로 잘못
  해소돼 **영원히 건너뛴다.** 가드는 매니페스트 `path` 를 **프로젝트 루트 기준**으로 해소하거나
  루트/_meta 경로를 분기 처리해야 한다.
- **planned 존중**: `status: planned` 이고 파일이 없으면 건너뛴다(현행 존재 가드가 이미 함). 단
  planned 인데 파일이 **나타나면** 헤더를 요구해 **반쪽짜리 수동 stub 을 잡는다.**

### 3.2 generated block markers present where applicable (블록 마커)
- **섹션 마커 검사(:239–258)를 데이터 주도로 일반화**: 하드코딩 `'screen-spec'` 대신 **모든 artifact 의
  `generated_sections`** 를 순회(현재는 screen-spec 의 `entry-points`/`nav-graph` 하나뿐이나,
  catalog/nav-graph 도입 시 늘어난다). 각 인스턴스에서 선언된 섹션의 `GENERATED:START <gen>` /
  `GENERATED:END <gen>` 쌍 존재 + `START < END` 를 검사.
- 정규식 계약 유지(`GENERATED:START\s+<gen>\b`). **공백/대소문자 민감**을 문서화하고 lint-policy 로 보강.

### 3.3 direct edits are not detectable without diff/hook (핵심 한계)
헤더/마커 검사로는 **본문 직접 편집을 못 잡는다**(헤더가 멀쩡하면 헤더 검사 통과). 본문 수정을 잡으려면
둘 중 하나가 **반드시** 필요하다:

- **(a) 재생성 + diff (멱등성 게이트, 유일한 본문 수준 보증).** 각 `status: active` 생성기를
  재실행하고 산출물을 `git diff --exit-code`. `generated_at` 한 줄(불변식 #7)을 제외한 모든 드리프트는
  **손편집이거나 비멱등 생성기**다. 전제: 생성기 멱등(#7) + **타임스탬프 정규화**(예: 기존
  `test-fixture.mjs` 의 `normalizeText` 패턴 재사용)로 `generated_at` 무시. (참고: 현재 impl/README
  어디에도 `git diff --exit-code` 게이트는 **명시돼 있지 않다** — 불변식으로만 선언. 이 제안이 그
  공백을 메운다.)
- **(b) pre-edit 훅 (impl §10 `pre-edit-generated-file`).** 생성 파일 편집을 **저작 시점에 차단**하고
  원본+명령을 안내. 훅은 매니페스트의 `kind: generated`(+`do_not_edit: true`) 목록을 경로 출처로 읽는다.
  현재 **설계만 있고 미구현.**

> 정리: 검사 6(헤더/마커)은 값싼 **1차선**이고, **2차선(diff 게이트)** 또는 **0차선(훅)** 없이는
> 전체 생성물의 본문 무결성을 강제할 수 없다. 셋을 겹쳐야 불변식 #3·#7 이 코드로 성립한다.

### 3.4 CI guard future options
- **옵션 A (권장) — 멱등성 게이트.** CI 에서 각 active 생성기 재실행 후 산출물 `git diff --exit-code`
  (generated_at 정규화). 손편집·생성기 회귀를 동시에 잡음. **fail-closed**.
- **옵션 B — 전용 검사기.** `check-generated-files.mjs` 를 `example:validate` **직전 최종 단계**로
  실행(헤더 + 블록 마커 + 선택적 diff). exit 1 로 게이트.
- **옵션 C — 로컬 훅.** pre-edit 훅을 매니페스트 generated 목록에 연결. warning-first → enforce.
- **도입 순서.** §3.1·§3.2(헤더/마커 일반화)는 **지금도 저위험**으로 검사 6 확장 가능. §3.3·§3.4의
  diff 게이트는 **첫 실제 생성기(catalog-gen)와 함께** 들어와야 한다 — 재생성할 산출물이 없으면
  diff 할 대상이 없다. **생성기 없는 시점에 diff 게이트를 먼저 넣지 말 것.**

## 4. 매니페스트 필드 계약과의 연결

이 세션의 Phase 0 하드닝이 가드가 읽을 계약을 만든다:

- **`generated: true`** — 현재 `kind: generated` 와 **의미가 겹친다(중복).** 두 가지 정직한 선택:
  (i) 가드의 **명시 셀렉터**로 채택해 `entry.generated === true` 로 분기, 또는 (ii) 빼고
  `kind` 만으로 분기. **하나를 골라 가드와 매니페스트를 일치**시켜야 한다. (이 세션은 하드닝 스펙대로
  추가했다 — 결정 대기 항목으로 남긴다.)
- **`status: active|planned`** — 가드/CI 가 **planned 생성기를 건너뛰게**(없는 명령을 실행하지 않게)
  하면서, 그래도 **존재하는 파일은 헤더 검사**하게 한다. **diff 게이트는 `status: active` 만 순회.**
- **`do_not_edit`** — 헤더 검사 필터(:434, `do_not_edit === true`)와 직접 연결. `component-catalog` 처럼
  수동 임시 허용 구간은 `false` 로 두어 **MVP-A 오탐을 피한다**(생성기 도입 시 true 전환).

## 5. 위험 / 비목표

- **오탐 방지**: do_not_edit:false(수동 모드)·비-생성 전역 폴더(src/api, src/components/ui)에 헤더 검사를
  과적용하지 말 것 — **매니페스트 `kind: generated` 로만 필터**.
- **타임스탬프 드리프트**: diff 게이트는 `generated_at` 정규화 없으면 매번 false-fail.
- **비용**: 블록 마커 스캔은 화면×섹션 O(N×M) — fail-fast/캐싱.
- **비목표(이 단계 금지)**: route-tree/nav-graph/catalog-gen/check-generated/lint-gen **구현**,
  package.json·CI·release 문서 변경, planned 을 구현된 것처럼 표기. 이 문서는 **설계뿐**이다.
