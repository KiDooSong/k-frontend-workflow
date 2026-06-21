# Design-token Naming 규약 (VS-2) — 토큰 ID "받아 적기" 계약

> Status: **draft (규약 본문)**. 2026-06-21. (OD-VS-2 = 옵션 a 의 실행 산출물 — [결정 기록](visual-spec-od-decisions.md))
> 이 문서는 킷이 "받아 적는" **토큰 ID 네이밍 규약만** 정의한다.
> 토큰 **값·source·생성·검증은 소비 레포 소유** — 킷 core 는 Figma 수집기·토큰 생성기를 구현/번들하지 않는다.
> 이 문서는 게이트를 신설/상향하지 않는다. confirmed 승격·OD resolve·hard gate 신설/상향·구현 착수는 **사람**.
> 이 규약은 *드래프트* 다 — 정본(`final/`) 승격은 사람. VS-2 seed([design-token-naming-convention.todo.md](design-token-naming-convention.todo.md))를 대체한다(그 파일은 deprecated).

---

## 0. 결론 요약 (한 화면)

1. **네임스페이스 최소 5종**: `color` · `space` · `type` · `radius` · `shadow`\|`elevation`. **asset/icon 은 토큰 아님**(파일 경로 — `## Assets`); 아이콘-이름 레지스트리를 쓰는 레포만 `icon.*` 를 *확장*으로 허용.
2. **Visual Spec 8컬럼 매핑**: `gap`·`padding` → `space.*` / `color` → `color.*` / `type` → `type.*`. `radius.*` 는 **`sizing` 칸 inline**(컬럼 신설 안 함). `shadow`/`elevation` 은 **8컬럼 밖 optional**(inline 주석 또는 `## Notes`).
3. **형식 2단계**: *권장(canonical)* = 점-구분 소문자 `color.bg.surface`·`space.4`·`type.title.md`·`radius.md`. *허용(absorb)* = 소비 레포가 dialect 를 선언하면 `bg.surface`·`color/bg/surface`·`p-4` 같은 기존 표기도 흡수. **킷은 특정 DS 를 정본화하지 않는다.**
4. **raw 허용**: 토큰 없는 값은 `raw N` 으로 명시하되 출처마커 `⚠` + `## Gaps / Open` 등록을 **요구/권장**(승격 경로).
5. **검사 분리**: **W1 = 형식 검사**(킷이 *문서만으로* 가능, warning-first) vs **W2 = 존재 검사**(소비 레포가 토큰 manifest 를 제공할 때만 가능, opt-in). **둘 다 warning-only. W2 는 절대 hard gate 아님.**
6. **킷이 하지 *않는* 것**: 토큰 생성기/수집기 번들, 특정 회사 DS token set 정본화, 토큰 존재의 hard gate 화.

---

## 1. 범위와 소유 (OD-VS-2 = 옵션 a)

이 규약이 정의하는 것은 **토큰 ID 문자열의 모양**뿐이다. "그 ID 가 가리키는 값이 무엇이고, 어디서 와서, 실제로 존재하는가"는 전부 소비 레포의 몫이다.

| 책임 | 킷 core (이 규약) | 소비 레포 |
|---|---|---|
| 토큰 ID **네이밍 형식**(네임스페이스·구분자·세그먼트 문법) | ✅ 정의(받아 적는 계약) | (자기 dialect 를 선언만) |
| 토큰 **값**(`#2563eb`, `16px` …) | ❌ 안 가짐 | ✅ 소유 |
| 토큰 **source**(Figma Variables / Tokens Studio / 수기 …) | ❌ 안 가짐 | ✅ 소유 |
| 토큰 **생성기**(Style Dictionary 등) | ❌ 번들 안 함(불변식) | ✅ (쓴다면) 소유 — 멱등 + `GENERATED` 마커는 **권고만** |
| 토큰 **manifest**(존재 검사용 ID 목록) | ❌ 생성/추적 안 함 | ⬜ 선택 제공(있으면 W2 가능) |
| Visual Spec 칸에 토큰 ID **받아 적기** | ✅ 표준(`## Visual Spec`) | (값을 채움) |

> 04 의 파이프라인(Tokens Studio → `@tokens-studio/sd-transforms` → Style Dictionary → NativeWind, `outputReferences: true` 로 semantic alias 보존)은 **reference 일 뿐**이다 — 소비 레포가 그렇게 만들 수 있다는 예시이지, 킷이 그 경로를 강제·번들하지 않는다([04 §5](../../../../docs/research/figma-design/04-figma-mcp-rest-data-collection.md)).

---

## 2. 토큰 네임스페이스 최소 세트

리서치 [03 §1·처방1](../../../../docs/research/figma-design/03-gaps-and-path-to-95.md)·[04 §1a](../../../../docs/research/figma-design/04-figma-mcp-rest-data-collection.md) 의 "DS 전체 1회 수집" 5종을 그대로 네임스페이스 head 로 채택한다. **더 늘리지 않는다**(스코프 절제).

| # | 네임스페이스 head | 담는 것 | Figma/REST 출처(reference) | 필수? |
|---|---|---|---|---|
| 1 | `color` | 표면·텍스트·보더·아이콘 틴트 색 | `fills`/`strokes`(Paint) | **필수** |
| 2 | `space` | 간격 스케일 — gap·padding·(margin) | `itemSpacing`·`padding*` | **필수** |
| 3 | `type` | 타이포 **합성 토큰**(family/size/weight/lineHeight/letterSpacing 묶음) | `style`(TypeStyle) | **필수** |
| 4 | `radius` | 모서리 반경 | `cornerRadius`/`rectangleCornerRadii` | **필수** |
| 5 | `shadow` \| `elevation` | 그림자·고도 (둘 중 **레포가 하나 선택** — 같은 관심사의 alias) | `effects`(DROP_SHADOW) | **필수**(표기 위치는 §3 참고) |

**확장(extension) — 필수 아님, 소비 레포 선언 시 허용:**

- `icon` / `asset` — 아이콘-이름 *레지스트리*(토큰처럼 ID 로 참조)를 운영하는 레포만. 기본값은 **에셋 = 파일 경로**(`## Assets` 의 path·format) 이며 토큰이 아니다([04 §1c](../../../../docs/research/figma-design/04-figma-mcp-rest-data-collection.md): "에셋 = 파일 경로(토큰 아님)", [03 3순위](../../../../docs/research/figma-design/03-gaps-and-path-to-95.md): 에셋 파이프라인은 별도·core 밖).
- 기타 레포가 이미 가진 것(`size`/dimension, `opacity`, `z`/zIndex, `border`/width, `breakpoint` …) — 규약은 **금지하지 않되 요구하지도 않는다**. W1 은 선언된 확장 head 를 알고 있을 때만 통과시키고, 모르는 head 는 *경고*(에러 아님)한다(§5).

> **asset/icon 필요 여부 결론:** 토큰 네임스페이스 최소 세트에 **넣지 않는다**. 에셋은 경로 기반(`## Assets`)으로 남기고, 아이콘-이름 토큰 레지스트리는 *옵션 확장* `icon.*` 으로만 허용한다. 이는 "킷이 에셋 파이프라인을 책임지지 않는다"는 경계와 정합한다.

---

## 3. Visual Spec 필드 ↔ 네임스페이스 매핑

정본 템플릿 `## Visual Spec` 의 **최소 8컬럼**(VS-1 에서 고정, 더 늘리지 않음):
`Section/Node | direction | gap | padding | align/justify | sizing | color | type`

| 컬럼 | 토큰? | 네임스페이스 | 표기 |
|---|---|---|---|
| Section/Node | — | — | 노드 라벨/경로(라벨) |
| direction | ❌ 구조 enum | — | `row`/`column` (`layoutMode`) |
| **gap** | ✅ | **`space.*`** | `space.4`(또는 `raw N`) |
| **padding** | ✅ | **`space.*`** | `space.4` |
| align/justify | ❌ 구조 enum | — | `center`/`between` … (`primary/counterAxisAlignItems`) |
| sizing | ❌ 구조 enum (+ inline `radius.*`) | **`radius.*`**(inline) | `fill`/`hug`/`fixed` `· radius.md` |
| **color** | ✅ | **`color.*`** | `color.bg.surface` |
| **type** | ✅ | **`type.*`** | `type.title.md` (합성) |

### 3.1 radius 판단 — 별도 컬럼 신설 ❌, `sizing` 칸 inline ✅

`radius` 는 1급 네임스페이스이지만 **전용 컬럼을 만들지 않는다**(8컬럼 freeze). 정본 템플릿 예시가 이미 `sizing` 칸에 `fill ✔M · radius.md ✔T` 로 적고 있으므로, 그 관행을 규약으로 굳힌다: **radius 토큰은 `sizing` 칸에 inline 으로 덧붙인다**(둘 다 "박스의 기하/모양"을 다룸). 한 노드에 모양 토큰이 여럿이면 `## Notes` 로 뺀다. — *대안(허용)*: `## Notes` 에 노드별로 적어도 된다. 핵심은 **컬럼을 늘리지 않는 것**.

### 3.2 shadow/elevation 판단 — 8컬럼 밖 optional ✅

대부분의 노드는 그림자가 없고, 전용 컬럼은 드물게 쓰는 필드로 최소 표를 부풀린다. 따라서 **shadow/elevation 은 8컬럼에 넣지 않는다(optional).** 의미 있는 그림자가 있는 노드만, `sizing`/`color` 칸 inline 주석 또는 `## Notes`(필요시 별도 줄)로 `shadow.sm`/`elevation.1` 을 적는다. 네임스페이스는 §2 에 정의돼 있으니, *적을 때* 형식만 따르면 된다. 컬럼은 늘리지 않는다.

> 두 판단 모두 VS-1 의 "표 필드는 최소 8칸 — 더 늘리지 않는다(스코프 절제)"를 지킨다. 매핑은 **어느 칸이 토큰을 받는가**만 고정하고, 표 구조는 불변.

### 3.3 동일값 다중후보 — semantic 우선

같은 값에 토큰 ID 후보가 여럿일 때(템플릿 `## Gaps` 예시: "동일값 토큰 다중후보"), **역할 기반 semantic ID 를 primitive ID 보다 우선**한다(권고): `color.bg.surface` ≻ `color.blue.500`. 확정 불가하면 `## Gaps / Open` 에 후보를 남기고, manifest 가 있으면 W2 가 존재를 교차확인한다(§5).

---

## 4. 네이밍 형식 — 권장(canonical) vs 허용(absorb)

### 4.1 문법(grammar) — 킷이 의존하는 *불변*

토큰 ID 는 **head 1개 + 세그먼트 1개 이상**을 구분자로 이은 것이다.

```
token-id   := head ( SEP segment )+
head       := color | space | type | radius | shadow | elevation
              | <소비 레포가 선언한 확장/alias head>
segment    := [a-z0-9] [a-z0-9-]*          # 소문자·숫자, 세그먼트 내부 하이픈 허용
SEP        := "."                          # 권장. 허용: "/" (Tokens Studio 경로식)
```

- 문자: 소문자 `[a-z]`·숫자 `[0-9]`·세그먼트 내부 `-`. 공백·대문자·기타 문장부호는 권장 형식에서 제외.
- head 는 §2 의 네임스페이스(또는 레포가 선언한 확장/alias)여야 한다.
- 이 문법이 **W1(형식 검사)의 근거**다(§5). 문법은 "ID 처럼 생겼나"만 본다 — 값/존재는 보지 않는다.

### 4.2 권장(canonical) form — 킷 예시·신규 레포 기본

| 네임스페이스 | 권장 형식 | 예 |
|---|---|---|
| color | `color.<role>.<variant?>` | `color.bg.surface` · `color.text.primary` · `color.border.subtle` |
| space | `space.<step>` | `space.4`(수치 스케일) · `space.md`(명명 스케일) |
| type | `type.<role>.<size?>` (합성) | `type.title.md` · `type.body.sm` |
| radius | `radius.<size>` | `radius.md` · `radius.full` |
| shadow/elevation | `shadow.<level>` / `elevation.<level>` | `shadow.sm` · `elevation.1` |

> 권장형은 head 를 **명시**한다(`color.bg.surface`, `bg.surface` 아님). 신규 소비 레포는 권장형 채택을 권한다.

### 4.3 허용(absorb) form — 기존 DS 흡수

킷은 **다양한 design system 을 흡수**해야 하므로, 소비 레포가 이미 쓰는 표기를 강제로 rename 시키지 않는다. 소비 레포가 **dialect 를 선언**하면(아래) 다음을 허용한다:

| 허용 변형 | 예 | 흡수 조건 |
|---|---|---|
| head 생략(semantic) | `bg.surface` · `text.primary` | 레포가 `bg.*`·`text.*`·`border.*`·`icon.*` → `color` 매핑을 선언 |
| `/` 구분자(경로식) | `color/bg/surface` · `spacing/4` | `.` 과 동치 처리 |
| 유틸리티/atomic | `p-4` · `bg-surface` · `rounded-md` | 레포가 prefix 매핑 선언(`p-*`·`gap-*`·`m-*`→`space`, `rounded-*`→`radius`) |
| 스케일 flavor | `space.4` ↔ `space.md` | 수치/티셔츠 **둘 다 허용**(택1 강제 안 함) |
| 세그먼트 casing | `color.bgSurface` | 허용하되 **비권장**(W1 info 수준) |

**dialect 선언 = 소비 레포 소유, 킷은 받아 적기만.** 형식 강제 없음 — 토큰 manifest 헤더 한 줄, 또는 짧은 dialect 메모로 "구분자 / head-alias / 스케일 flavor"를 적으면 된다(예시):

```yaml
# (소비 레포 소유 — 킷이 생성/번들하지 않음. 있으면 W1/W2 가 정규화에 사용)
token-dialect:
  separator: "/"                      # 기본 "."
  scale: tshirt                       # numeric | tshirt
  aliases:                            # head 생략/유틸리티 → 네임스페이스
    "bg.*": color
    "text.*": color
    "p-*": space
    "rounded-*": radius
```

선언이 **없으면** W1 은 §4.1 권장 문법으로 폴백한다(허용형은 선언이 있어야 정규화 가능).

### 4.4 raw escape hatch + 승격 경로

토큰이 아직 없는 값은 **허용**하되, 묵살되지 않게 추적한다:

- 형식: `raw <value>` — `raw 48` · `raw #2563eb`.
- **요구/권장**: 같은 칸에 출처마커 `⚠` + `## Gaps / Open` 에 1줄 등록(승격 후보). (정본 템플릿이 이미 이 관행을 명시.)
- 승격: `## Gaps / Open` 의 raw 항목 → (소비 레포가) 토큰 추가 → 다음 갱신에서 `raw N` 을 토큰 ID 로 치환. **승격 결정/구현은 소비 레포·사람.**

### 4.5 placeholder

`{...}`(중괄호)는 **미채움 템플릿 슬롯**이다 — 에러가 아니라 "pending". W1 은 이를 통과시키되 info 로만 센다(§5). 빈 옵션 섹션은 통째 생략 가능(VS-1).

---

## 5. 검사 분리 — W1(형식) vs W2(존재)

> 이 문서는 **규약만** 정의한다. 실제 validate 스크립트·CI 와이어링 **구현은 VS-3 + 별도 명시 지시** 의 몫이다([OD-VS-3](visual-spec-od-decisions.md)). 아래는 *규칙 정의*일 뿐이며, **전부 warning-only**, 어떤 신호도 `figma_mapping_status` readiness fact 에 합치지 않는다.

핵심 분리: **W1 은 lexical(문서만으로 가능, 킷-내재) / W2 는 semantic(소비 레포 토큰 source 필요, 소비 레포-의존).**

### 5.1 W1 — 토큰 ID **형식** 검사 (킷 단독, warning-first, manifest 불필요)

| 규칙 | 본다 | 위반 시 |
|---|---|---|
| **W1-FORMAT** | 토큰 칸이 {§4.1 문법의 토큰 ID} \| {`raw <value>`} \| {placeholder `{...}`} \| (구조 칸) {알려진 enum} 중 하나인가 | warning |
| **W1-NS** | 토큰 head ∈ {§2 네임스페이스 ∪ 레포 선언 확장} 인가 | warning(모르는 head) |
| **W1-RAW** | `raw <value>` 칸이 `⚠` + `## Gaps / Open` 항목을 동반하는가 | warning *(formalization §6 W4 와 동일 관심사 — VS-3 에서 합치거나 정렬)* |
| **W1-PLACEHOLDER** | `{...}` 는 pending 으로 통과(에러 아님) | info |
| **W1-ENUM** | 구조 칸(direction/align·justify/sizing)은 enum 을 받음 — 토큰-형식 검사에서 **제외**(오탐 방지). 단 `sizing` 의 inline `radius.*` 는 토큰으로 함께 인식 | (오탐 방지 규칙) |
| **W1-CANON** | 권장 canonical 형식 이탈(`/`·head 생략·camelCase 등 허용형) | **info 만**(허용형은 유효 — 경고 아님) |

W1 은 **소비 레포 토큰 source 없이도** 항상 가능하다(문서 텍스트만 파싱). 그래서 VS-3 의 1차 후보다.

### 5.2 W2 — 토큰 ID **존재** 검사 (소비 레포 manifest 있을 때만, opt-in, warning-only, **never hard gate**)

| 규칙 | 본다 | 비고 |
|---|---|---|
| **W2-PRECOND** | 소비 레포가 토큰 **manifest**(ID 목록)를 선언된 경로/형식으로 제공하는가 | 없으면 W2 **전체 skip**(no-op, 실패 아님) |
| **W2-RESOLVE** | Visual Spec 의 각 토큰 ID 가 (dialect 정규화 후) manifest 에 존재하는가 | 미해결 → warning |
| **W2-EXEMPT** | `raw <value>` 칸은 W2 면제(W1-RAW/Gaps 가 추적) | — |
| **W2-NEVER-GATE** | warning-only 유지. hard 승격은 telemetry 후 *별도 사람 OD*. `figma_mapping_status` 에 합치지 않음 | **불변식** |

W2 는 (1) 이 네이밍 규약 + (2) 소비 레포 토큰 source 를 **둘 다** 전제한다. **킷은 manifest 를 생성·수집하지 않는다 — 소비 레포가 가리키는 것을 읽기만 한다.** 따라서 W2 는 VS-2(이 규약) *이후*, 그리고 manifest 가 있는 레포에서만 의미를 가진다([OD-VS-3](visual-spec-od-decisions.md): W2 는 VS-2 후).

> **왜 분리가 중요한가(한 줄):** W1 은 킷이 *문서만으로* 늘 할 수 있는 lexical 검사, W2 는 *소비 레포가 소유한 토큰 source* 가 있어야 하는 semantic 검사다. 이 경계가 "킷은 받아 적기만, 값/검증은 소비 레포"라는 OD-VS-2 를 검사 레벨에서 그대로 구현한다.

---

## 6. 산출물 — 정본 템플릿 patch **제안** (적용은 사람/오너)

정본 [figma-component-mapping.template.md](../../../templates/screen/figma-component-mapping.template.md) `## Visual Spec` 주석의 마지막 줄은 현재 "규약은 OD-VS-2 에서 확정"이라는 *forward-pointer* 다. 규약 드래프트가 생겼으니, **이 규약을 가리키도록** + "예시는 규약일 뿐 값의 출처가 아님"을 박는 **최소 문구**를 제안한다.

> ⚠ **적용하지 않았다(제안만).** 정본 템플릿 편집은 VS-1 에서 *오너 명시 지시* 로만 이뤄진 클래스이고, 본 규약은 아직 *드래프트*(미-confirmed)다. 아래는 confirmed 시점에 사람/오너가 적용할 정확한 diff 다.

**proposed diff — `## Visual Spec` 주석(현재 정본 라인 75–77):**

```diff
 <!-- (옵션) 노드별 auto-layout/토큰. 값 = 토큰 ID + 출처마커. 토큰 없으면 `raw N` + `⚠` + `## Gaps / Open` 등록.
      컴포넌트 내부 스타일은 ◎(여기 미지정). 표 필드는 최소 8칸에서 시작 — 더 늘리지 않는다(스코프 절제).
-     아래 셀의 `space.4`·`bg.surface`·`title.md` 등은 **형태 예시일 뿐, 토큰 네이밍 규약 아님** — 규약은 OD-VS-2 에서 확정. -->
+     아래 셀의 `space.4`·`bg.surface`·`title.md` 등은 **네이밍 규약 예시일 뿐 값의 출처가 아니다**(token ID examples are
+     convention, not a value source) — 토큰 ID 형식은 docs/design/drafts/design-token-naming-convention.md(VS-2)를 따르고,
+     토큰 값·source·생성·검증은 소비 레포 소유(킷 core 는 토큰 생성기·수집기를 번들하지 않는다). -->
```

**Visual Spec template 에 들어갈 짧은 문구(독립형, 위 diff 의 핵심):**

> **토큰 ID 예시는 네이밍 규약일 뿐 값의 출처가 아니다 — 값·source·생성·검증은 소비 레포 소유.**
> (*token ID examples are convention, not a value source.*)

이 patch 는 새 컬럼·새 필드·새 게이트를 만들지 않는다. 주석 한 단락만 바꾼다.

---

## 7. formalization / OD 동기화

### 7.1 적용함(이 브랜치 — record/index/draft 레이어, 결정 불변)

- [visual-spec-od-decisions.md](visual-spec-od-decisions.md) **OD-VS-2 에 실행 노트 append** — 규약 드래프트 작성됨, 결정(옵션 a) 불변, 여전히 draft(미-confirmed), 값/생성/검증 소비 레포 소유 재확인. *(OD-VS-1 이 받은 실행 노트와 동형. resolve 아님.)*
- [visual-spec-formalization.md](visual-spec-formalization.md) **§8 OD 표 VS-2 행 · §6 W1/W2 · Cross-links** 에 본 규약 cross-link 동기화(VS-1 의 §5 formalization 동기화와 동형).
- [design README](../README.md) **Drafts 인덱스**에 본 규약 1줄 추가.
- [design-token-naming-convention.todo.md](design-token-naming-convention.todo.md) **deprecated** 처리(배너 + status, 1사이클 유지 — 제거는 사람 정리 슬롯).

### 7.2 제안만(미적용)

- §6 정본 템플릿 patch(위 §6) — 사람/오너 적용.

> 어느 것도 게이트·정책·decision 을 바꾸지 않는다. policy·runtime(`src/`)·정본 템플릿 **불변**.

---

## 8. VS-3 로 넘길 W1/W2 규칙 목록 (handoff)

VS-3(warning-first validate) 슬롯이 *명시 지시* 와 함께 `continue-on-error` 로 구현할 후보. **이 세션은 어느 것도 구현하지 않는다.** 전부 warning-only, hard 승격은 telemetry 후 별도 사람 OD.

| # | 규칙 | 의존 | 심각도 | 상태 |
|---|---|---|---|---|
| W1-FORMAT | 토큰 칸 = 토큰ID \| `raw N` \| `{placeholder}` \| (구조칸)enum | 문서만(킷 단독) | warning | future / VS-3 |
| W1-NS | head ∈ 네임스페이스 ∪ 선언 확장 | 문서(+선택 dialect) | warning | future / VS-3 |
| W1-RAW | `raw N` ↔ `⚠` + `## Gaps` 동반 | 문서만 | warning | future / VS-3 *(formalization W4 와 정렬/합치기)* |
| W1-PLACEHOLDER | `{...}` = pending 통과 | 문서만 | info | future / VS-3 |
| W1-ENUM | 구조 칸은 토큰-형식 검사 제외(오탐 방지); `sizing` inline `radius.*` 는 토큰 인식 | 문서만 | (규칙) | future / VS-3 |
| W1-CANON | 권장형 이탈은 info(허용형 유효) | 문서(+dialect) | info | future / VS-3 |
| W2-PRECOND | manifest 없으면 W2 전체 skip(no-op) | **소비 레포 manifest** | (전제) | future / **VS-2 후**·manifest 레포만 |
| W2-RESOLVE | 토큰 ID 가 manifest 에 존재(dialect 정규화 후) | **소비 레포 manifest** | warning | future / **VS-2 후** |
| W2-EXEMPT | `raw N` 은 W2 면제 | 문서 | (규칙) | future |
| W2-NEVER-GATE | warning-only 유지·`figma_mapping_status` 불합치 | — | **불변식** | 항상 |

> 매핑(formalization §6 ↔ 본 문서): formalization W1 = 본 문서 W1-FORMAT/W1-NS, formalization W2 = 본 문서 W2-*. W3·W5·W6(필수 섹션·override 추적·4컬럼 유지)는 토큰 네이밍 범위 밖이라 그대로 formalization §6 / OD-VS-3 소관으로 둔다. **시각 *충실도*(픽셀 일치)는 여기 없음 — OD-VS-4(비주얼 회귀).**

---

## 9. 금지 / 경계 재확인 (세션 2 준수)

- **토큰 생성기·수집기를 킷 core 에 넣지 않는다.** Style Dictionary/Tokens Studio/Figma Variables 파이프라인은 §1·§4.3 에서 **reference·소비 레포 소유**로만 인용.
- **특정 회사 DS token set 을 정본화하지 않는다.** 규약은 *문법 + 권장형 + 흡수 규칙*만 — 값/세트는 소비 레포.
- **토큰 존재 검사(W2)를 hard gate 로 제안하지 않는다.** W2 는 opt-in·warning-only·`figma_mapping_status` 불합치.
- **confirmed 승격·OD resolve·hard gate 신설/상향·구현 착수는 사람.** 이 문서는 드래프트.
- **policy·runtime·정본 템플릿 미변경.** 템플릿 patch 는 §6 제안만.

---

## Cross-links

- 결정 기록: [visual-spec-od-decisions.md](visual-spec-od-decisions.md) (OD-VS-2 = a)
- VS-1 실행안: [visual-spec-vs1-execution.md](visual-spec-vs1-execution.md) · 대체 대상 seed: [design-token-naming-convention.todo.md](design-token-naming-convention.todo.md) (deprecated)
- 출처 제안: [visual-spec-formalization.md](visual-spec-formalization.md) (§6 W1·W2 · §8 OD)
- 정본 템플릿: [figma-component-mapping.template.md](../../../templates/screen/figma-component-mapping.template.md) (`## Visual Spec`)
- 정책(`figma_mapping_status`): [implementation-mode-policy.yaml](../../../policies/implementation-mode-policy.yaml)
- 리서치(reference): [03 — 95로 좁히기](../../../../docs/research/figma-design/03-gaps-and-path-to-95.md) (처방1 토큰 단일출처) · [04 — 토큰 분류·파이프라인](../../../../docs/research/figma-design/04-figma-mcp-rest-data-collection.md) (§1a 토큰 5종·§4 채널·§5 파이프라인)
