# 04 — Figma MCP × REST 2채널 데이터 수집·조합 (Professional 기준)

> 한 줄 요약: 비주얼 스펙을 만들려면 13종 시각 필드를 모아야 하고, Professional 에서는 **토큰=플러그인 / 정확수치·에셋=REST / 시맨틱·구조·스크린샷=MCP** 로 채널을 나눠 수집한 뒤 **토큰 단일출처 → 컴포넌트 단독완성 → 동결된 visual-spec → 원본 미투입 조합 → diff 수렴** 순서로 합쳐야 Figma 와 거의 일치한다. 단일 채널로는 구조적으로 부족하다.
> 날짜: 2026-06-21 · status: draft(리서치 산출물, 게이트 아님)

---

## 한 줄 결론

**MCP 도, REST 도 단독으로는 "거의 일치"에 못 미친다.** REST 는 정확 수치·geometry·에셋·결정적 재현에 강하지만 시맨틱 토큰명·코드 힌트·스크린샷을 안 주고, MCP 는 시맨틱 토큰명·구조·시각 참조에 강하지만 수치가 임의 Tailwind 로 오염되고 다중 모드·variant 토큰에 한계가 있다. Professional 에서는 **Variables REST API 와 (커스텀) Code Connect 가 둘 다 막혀** 토큰은 플러그인으로, 컴포넌트→코드 매핑은 수동으로 메워야 한다. 거의-일치의 본질은 채널 선택이 아니라 **토큰 단일출처 + 동결된 시각 계약 산출물 + 비주얼 회귀 루프**라는 세 규율이다(보고서 [03](03-gaps-and-path-to-95.md) 처방 1·2·3 의 구현 레퍼런스).

이 장은 [01](01-what-the-kit-captures.md)·[02](02-where-visual-fidelity-leaks.md)·[03](03-gaps-and-path-to-95.md) 의 갭 분석과 [실험 프로토콜](../../../temp/proposals/figma-fidelity-experiment.md)·[EXTRACTION.md](../../../temp/runs/figma-fidelity-001/EXTRACTION.md) 의 채널 분담을 **전제**로 한다. 갭은 재설명하지 않고(→ 02·03), "그래서 무엇을 어느 채널로 어떻게 모아 어떻게 조합하나"라는 **데이터 수집·조합 레퍼런스**만 채운다.

---

## §1. 무엇을 수집해야 하는가 — Visual Spec 필드 분류

보고서 02 §B 가 못박은 근본 원인은 "값을 담을 칸이 없다"이다. 그 칸에 들어갈 **값의 전체 목록**이 곧 비주얼 스펙이다. 아래는 화면이 "그 화면처럼" 보이게 하는 데 필요한 시각 정보를, Figma 노드의 **정확한 필드명**과 함께 분류한 것이다. "리터럴 금지" 열은 [실험 프로토콜](../../../temp/proposals/figma-fidelity-experiment.md) 의 "값은 리터럴 금지·토큰 ID만" 규칙(처방 1·2)에 따라, 그 필드가 **토큰화 대상인지**(=정본은 토큰 시스템, visual-spec 엔 토큰 ID 만) 아니면 **노드 고유 구조값인지**(=수치를 그대로 적되 토큰 단위로 표현)를 가른다.

### 1a. 디자인 토큰 (DS 전체 1회 수집 — per-screen 아님)

| 항목 | Figma/REST 필드 | 무엇 | 왜 충실도에 필요 | 리터럴 금지(토큰화) |
|---|---|---|---|---|
| color | `fills`/`strokes`(Paint: SOLID `color{r,g,b,a}`) | 표면·텍스트·보더 색 | 빠지면 색·투명도 오류 | **예** — `color.*` 토큰 ID |
| spacing | `itemSpacing`·`padding*` 가 참조하는 변수 | 4/8 스케일 간격 | 간격 불일치=레이아웃 밀림 | **예** — `space.*` |
| typography | `style`(TypeStyle): `fontFamily`/`fontWeight`/`fontSize`/`lineHeightPx`/`letterSpacing` | 글자 모양 | 줄높이·자간 차로 전체 밀림 | **예** — `type.*`(합성 토큰) |
| radius | `cornerRadius`/`rectangleCornerRadii` | 모서리 | 카드/버튼 인상 좌우 | **예** — `radius.*` |
| shadow/elevation | `effects`(DROP_SHADOW: `color`/`offset{x,y}`/`radius`/`spread`) | 그림자·고도 | 깊이감·구분 | **예** — `shadow.*`/`elevation.*` |

> 토큰은 **per-screen 이 아니라 DS 전체에서 1회** 수집한다([실험 프로토콜](../../../temp/proposals/figma-fidelity-experiment.md) Phase 1: "토큰 *시스템* 추출"과 per-screen "토큰 *사용* 확인"의 분리). visual-spec 의 모든 색/간격/타이포/radius/shadow 칸은 이 토큰의 **ID 만** 참조한다.

### 1b. 노드 고유 구조값 (per-screen·per-node 수집)

| 항목 | Figma/REST 필드(정확 enum/값) | 무엇 | 왜 충실도에 필요 | 리터럴 금지 |
|---|---|---|---|---|
| auto-layout 방향 | `layoutMode`: `NONE`/`HORIZONTAL`/`VERTICAL`/`GRID` | row/column | 축이 틀리면 전부 어긋남 | 아니오(구조 enum) |
| gap | `itemSpacing`(Number), `counterAxisSpacing`(WRAP 줄간격) | 자식 간 간격 | 간격 붕괴 | 토큰화 권장(`space.*`) |
| padding | `paddingLeft/Right/Top/Bottom`(Number, default 0) | 내부 여백 | 밀도·정렬 | 토큰화 권장 |
| justify(주축) | `primaryAxisAlignItems`: `MIN`/`CENTER`/`MAX`/`SPACE_BETWEEN` | 주축 정렬 | 배치 어긋남 | 아니오 |
| align(교차축) | `counterAxisAlignItems`: `MIN`/`CENTER`/`MAX`/`BASELINE` | 교차축 정렬 | 배치 어긋남 | 아니오 |
| sizing(hug/fill/fixed) | `layoutSizingHorizontal`/`Vertical`: `FIXED`/`HUG`/`FILL` | 폭·높이 거동 | **가장 흔한 깨짐**(hug/fill 오판) | 아니오 |
| layoutGrow | `layoutGrow`(Number; 1=주축 늘어남) | flex-grow | 늘어남 붕괴 | 아니오 |
| 컨테이너 sizing | `primaryAxisSizingMode`/`counterAxisSizingMode`: `FIXED`/`AUTO`(AUTO=hug) | 컨테이너 자기 크기 | 폭 붕괴 | 아니오 |
| wrap | `layoutWrap`: `NO_WRAP`/`WRAP`, `counterAxisAlignContent`: `AUTO`/`SPACE_BETWEEN` | 줄바꿈 | 다열 레이아웃 | 아니오 |
| 중첩·계층 | 노드 트리/`children` 순서, `itemReverseZIndex` | z-order/순서 | 겹침 순서 | 아니오 |
| 절대배치 | `layoutPositioning`: `AUTO`/`ABSOLUTE` | 흐름 이탈 배치 | FAB/배지 위치 | 아니오 |
| constraints | `constraints`(LayoutConstraint `vertical`/`horizontal`: `TOP`/`BOTTOM`/`LEFT`/`RIGHT`/`CENTER`/`SCALE` 등) | 절대배치 리사이즈 | 비-auto-layout 프레임 위치 | 아니오 |
| 지오메트리 | `absoluteBoundingBox{x,y,width,height}`, `absoluteRenderBounds`(효과 포함) | 좌표·치수 | sizing 폴백·상대위치 산출 | 아니오(폴백 수치) |

### 1c. 면·텍스트·에셋·상태

| 항목 | Figma/REST 필드 | 무엇 | 왜 충실도에 필요 | 리터럴 금지 |
|---|---|---|---|---|
| fill/stroke/opacity | `fills`/`strokes`(Paint[]), `strokeWeight`/`individualStrokeWeights`, `strokeAlign`(`INSIDE`/`OUTSIDE`/`CENTER`), `opacity`, `blendMode` | 면·선·투명도 | 색·테두리 오류 | 색은 토큰화 |
| effects/shadow | `effects`(DROP_SHADOW/INNER_SHADOW/LAYER_BLUR/BACKGROUND_BLUR) | 그림자·블러 | 깊이 | 토큰화 권장 |
| 컴포넌트 인스턴스 | `componentId`/instance + variant props(MCP `get_metadata`, Code Connect 부재 시 수동) | 어떤 DS 컴포넌트·어떤 variant | 잘못된 컴포넌트=전부 틀림 | 매핑(토큰 아님) |
| 텍스트 내용·오버플로 | `characters`, `style.textAutoResize`, `styleOverrideTable`/`characterStyleOverrides`, (truncation/maxLines) | 문구·구간 스타일·말줄임 | 줄바꿈·말줄임 차이 | 카피는 ScreenSpec 출처 |
| 에셋(아이콘/이미지) | 벡터=`geometry=paths`(`fillGeometry`/`strokeGeometry`: SVG path+`windingRule`); export=REST `/v1/images`; 채움이미지 `imageRef`→`/v1/files/:key/images` | 아이콘·일러스트·이미지 | 비주얼 핵심 | 파일 경로(토큰 아님) |
| 프레임 클립/스크롤 | `clipsContent`(overflow:hidden), `overflowDirection`, `isMask`, `layoutGrids` | 클립·스크롤·마스크·그리드 | 잘림/스크롤 거동 | 아니오 |
| 상태/반응형 | variant(default/hover/pressed/disabled)·interaction; Figma 프레임은 보통 고정폭 | 인터랙션 시각 상태·반응형 | press/disabled·화면폭 변이 | 아니오(보고서 03 5·6순위) |

> **깨짐 영향이 큰 순서**(리서치 근거): `layoutSizing`(HUG/FILL) → 정렬(justify/align) → 타이포 → 간격 → 절대배치. 토큰·매핑으로 구조 차이를 0 으로 만든 뒤 잔차(폰트 안티앨리어싱)만 남기는 것이 §6 의 현실적 천장이다.

---

## §2. 두 채널의 역량

### 2a. Figma Dev Mode MCP — 도구별 출력·권장 순서·한계

Professional 에서 데스크톱(로컬) MCP 서버는 **Dev 또는 Full 좌석**으로 사용 가능하다(§3 검증). 충실도에 쓰는 핵심 도구와 출력:

| 도구 | 출력 | 용도 |
|---|---|---|
| `get_metadata` | 선택 트리의 **sparse XML**: 노드 ID/타입/이름/위치/크기만 | 구조·중첩·사이즈 개요. 큰 선택은 이걸로 먼저 노드맵 확보 |
| `get_design_context`(구 `get_code`) | **참조 코드 + 스크린샷 + 메타데이터**(기본 React+Tailwind) | 구조/코드 힌트. **최종 코드 아님 — 중간 표현으로 취급** |
| `get_variable_defs` | 선택에 쓰인 변수/스타일의 **`토큰명 → 값` 매핑**(예 `{'icon/default/secondary': #949494}`) | 시맨틱 토큰명 교차확인(같은 색의 여러 토큰 구분) |
| `get_screenshot` | 선택 노드 **PNG**(`contentsOnly` 옵션) | 시각 참조·baseline·diff 기준선 |

**권장 호출 순서**(공식 가이드): ①`get_metadata` 로 노드맵 → ②좁힌 nodeId 로 `get_design_context`/`get_variable_defs` → ③`get_screenshot` 로 검증 → ④에셋 다운로드 → ⑤Figma 와 1:1 대조. 입력은 selection(미지정 시 현재 선택) 또는 URL `?node-id=1-2`→nodeId `1:2`. **큰 선택은 느려지거나 응답이 잘리므로 작은 컴포넌트로 쪼개라**고 명시.

**강점**: 시맨틱 토큰명(스크린샷만으론 불가), 구조 XML, 시각 참조. **약점/한계(반드시 인지)**:

- `get_design_context` 는 **항상 React+Tailwind 편향** — `clientFrameworks`/`clientLanguages` 는 **로깅용**이라 출력 프레임워크를 안 바꾼다. Figma px 를 임의 Tailwind 클래스로 바꾸는 "context poisoning" 경향(→ RN/NativeWind 로 재해석 필요).
- **variant 토큰 불일치**(포럼 보고, confidence=medium): `get_design_context` 는 base 토큰을, `get_variable_defs` 는 variant 토큰을 반환 → variant 를 프로그램적으로 정확 생성 불가.
- `get_variable_defs` **모드 평탄화**(medium): 라이트/다크 등 다중 모드를 못 읽고 **기본 모드값만**, alias 미해결(최종값만). Figma 로드맵엔 있음.
- **큰 선택 토큰 초과**: Claude Code 에서 25000 토큰 초과 에러 → `MAX_MCP_OUTPUT_TOKENS` 로 상향.
- 데스크톱 에셋: localhost `:3845/assets/*` 호스팅(Download/Placeholder/Local server 3모드). **`download_assets` 는 원격 서버 전용**(데스크톱 ❌).

### 2b. Figma REST API — 엔드포인트별 출력·인증·레이트리밋

| 엔드포인트 | 출력 | Tier/스코프 |
|---|---|---|
| `GET /v1/files/:key` | 전체 document 트리 JSON(name/document/components/styles…). 파라미터 `ids`/`depth`/`geometry`/`version` | Tier 1 · `file_content:read` |
| `GET /v1/files/:key/nodes?ids=` | ID별 서브트리(`document`/`components`/`styles`). 배치/부분 추출 | Tier 1 · `file_content:read` |
| `GET /v1/images/:key?ids=&format=&scale=` | 노드 **렌더 export**, 만료 S3 URL. `format` png/jpg/svg/pdf, `scale` 0.01~4, `svg_outline_text`/`use_absolute_bounds` 등 | Tier 1 · `file_content:read` |
| `GET /v1/files/:key/images` | **채움 이미지** `imageRef`→다운로드 URL(원본 비트맵, ≤14일 만료) | Tier 2 · `file_content:read` |
| `GET /v1/files/:key/variables/local`·`/published`, `POST …/variables` | 변수/컬렉션/모드/값 | **Enterprise 전용** · `file_variables:read`/`write` |

노드 JSON 에서 §1 의 모든 구조값(`layoutMode`·`primaryAxisAlignItems`·`layoutSizing*`·`absoluteBoundingBox`·`fills`·`effects`·`cornerRadius`·`style`…)을 **정확 수치로** 읽는다. 아이콘/벡터는 `/nodes?ids=…&geometry=paths` 로 `fillGeometry`(SVG path) 까지.

**인증**: `X-Figma-Token: <PAT>` 헤더(또는 OAuth2 Bearer). PAT 는 **최대 90일 만료**, 무기한 PAT 생성 불가. 스코프는 파일 권한을 초과하지 못함(만든/공유받은 파일만). **레이트리밋**: leaky bucket + 429(`Retry-After`). Tier 1 기준 Dev/Full 좌석: Professional **15/min**(또는 200/day; 출처별 10/min 표기 혼재). View/Collab·Starter 는 사실상 월 6회 수준. Tier 2/3 는 분당 한도가 더 높다.

**강점**: 정확 px·geometry, 결정적·재현가능(CI/스크립트), `ids` 배치 대량 추출. **약점**: 시맨틱 토큰명·코드 힌트·스크린샷을 **안 줌**(그건 MCP). Professional 에선 변수명 대신 raw 색/숫자만 나옴(Variables API 불가).

> **상보성 요약**: 정밀 수치·자동화·에셋 = **REST**, 시맨틱·코드·시각맥락 = **MCP**. 한쪽만 쓰면 §6 의 실패모드로 떨어진다.

---

## §3. Professional 요금제 게이팅 매트릭스

아래는 **적대적 검증(verdict)** 을 반영한 단정이다. 가격은 변동 caveat 포함.

| 기능 | Professional 가능? | 근거(검증된 사실) | 대체수단 |
|---|---|---|---|
| **Variables REST API**(GET local/published, POST) | **불가(confirmed)** | `file_variables:read`/`write` 스코프가 "Enterprise plan only". "full members of Enterprise orgs"만, guest 불가 | **Tokens Studio 플러그인 export**(§4·§5) |
| **커스텀 Code Connect**(자체 DS 매핑 작성·게시) | **불가(mixed→커스텀은 confirmed 불가)** | Help/Dev 문서: "Organization·Enterprise 플랜 + Full/Dev 좌석". Professional 비어 있음 | **수동 매핑**(visual-spec Component Mapping 표) |
| Code Connect — 큐레이션 **UI 키트 코드 조회** | **가능(가격표 근거)** | 가격표 Professional 열: "Code Connect: Access component code in Dev Mode. **Available for UI kits**" | (SDS/Material 3/Apple 키트 한정 조회) |
| **Dev Mode MCP — 데스크톱(로컬) 서버** | **가능(confirmed)** | "The desktop server is available on a Dev or Full seat for all paid plans". Professional+Dev/Full = 200/day·15/min | (Dev/Full 좌석 필수; View/Collab 불가) |
| Dev Mode MCP — 원격 서버 | 가능 | "available on all seats and plans"(단 View/Collab/Starter 월 6회) | — |
| **REST `files`/`nodes`/`images`** | **가능(confirmed)** | `file_content:read` 만 필요, 플랜 제한 표기 없음. PAT 로 호출 | — |
| 커뮤니티 플러그인(Tokens Studio 등) | **가능(confirmed)** | 전 플랜 사용 가능. 단 **private 플러그인**은 Org/Enterprise 전용 | — |
| 에디터 Variables 기능(생성/모드) | 가능 | 모든 유료 플랜. **모드 수: Professional 컬렉션당 최대 10**(Schema 2025; Org 20, Enterprise 무제한) | — |

**가격(편집자 1인 월, 2026 기준 USD — caveat)**: Professional **Full $16/mo($12 연간 환산)**, **Dev $12/mo**, Collab $3/mo, View 무료. (참고: Organization Full $55, Enterprise Full $90, 연간 청구.) **주의**: 가격·좌석·MCP 접근정책·레이트리밋은 변동이 잦고(다수 문서 "beta"/"open beta"), 통화·지역·청구주기에 따라 다르다. 좌석 업그레이드 후 한도 미반영 버그 보고도 있다 — **도입 시점에 pricing/ rate-limits 페이지로 재확인**.

> Professional 의 두 결정적 게이트 = **Variables REST ❌ + 커스텀 Code Connect ❌**. 이 두 칸이 §4·§5 의 폴백(플러그인 토큰·수동 매핑)을 강제한다.

---

## §4. 데이터 × 채널 매트릭스 (핵심 산출물)

§1 의 각 시각 필드를 **Professional 에서 어느 채널로** 모으는지 — 1차 출처·2차(폴백)·수집 방법. 게이팅(§3) 을 그대로 반영한다.

| 시각 필드 | 1차 출처 (Professional) | 2차(폴백)·교차확인 | 수집 방법 |
|---|---|---|---|
| **토큰: color** | Tokens Studio 플러그인 export | MCP `get_variable_defs` 로 토큰명 교차확인 | DS 1회 export → `raw/tokens.studio.json` |
| **토큰: spacing** | Tokens Studio export | `get_variable_defs` | 동상 |
| **토큰: typography** | Tokens Studio export(합성 토큰 expand) | `get_variable_defs` | Style Dictionary `expandTypography` |
| **토큰: radius** | Tokens Studio export | `get_variable_defs` | 동상 |
| **토큰: shadow/elevation** | Tokens Studio export | `get_variable_defs` | Style Dictionary `expandShadow` |
| **auto-layout 수치**(mode/align/sizing/gap/padding/grow/wrap) | **REST `/nodes`**(정확 enum/Number) | MCP `get_metadata`(구조 보조) | `GET /v1/files/:key/nodes?ids=<node>` |
| **지오메트리** x/y/w/h | REST `absoluteBoundingBox` | `get_metadata`(sparse) | `/nodes` |
| **fill/stroke/opacity** | REST(`fills`/`strokes`/`strokeWeight`/`strokeAlign`/`opacity`) | `get_variable_defs`(색→토큰) | `/nodes`; 색은 토큰 ID 로 치환 |
| **effects/shadow** | REST `effects` | `get_variable_defs`(shadow 토큰) | `/nodes` |
| **컴포넌트 인스턴스+variant** | MCP `get_metadata`(인스턴스·variant props) | `get_design_context`(주의: base 토큰 반환) + **수동 매핑** | **Code Connect 불가** → visual-spec 매핑 표 수기 |
| **텍스트 내용·오버플로** | REST `characters`+`style`+`styleOverrideTable` | ScreenSpec(카피 단일출처) | `/nodes`; 카피 키는 ScreenSpec |
| **에셋: 아이콘/이미지/export** | **REST `/v1/images`**(svg/png, scale) | 채움이미지=`/v1/files/:key/images`(`imageRef`); 벡터정밀=`geometry=paths` | `GET /v1/images/:key?ids=&format=svg|png&scale=` |
| **constraints / 절대배치** | REST `constraints`+`layoutPositioning`+`absoluteBoundingBox` | `get_metadata` | `/nodes` |
| **상태/반응형** | (Figma variant 프레임) MCP `get_metadata`/`get_screenshot` | ScreenSpec State/Interaction Matrix(데이터 상태) | 노드별 캡처(보고서 03 5·6순위 — 부분적) |

핵심 패턴(EXTRACTION.md 채널 분담과 일치): **토큰=플러그인 1차 + MCP 교차확인 / auto-layout 수치=REST 1차 + MCP 보조 / 에셋=REST images / 컴포넌트 variant=MCP + 수동매핑(Code Connect 불가)**.

---

## §5. 조합(오케스트레이션) 레시피

Figma 와 거의 일치시키는 **단계 순서**. 각 단계는 [실험 프로토콜](../../../temp/proposals/figma-fidelity-experiment.md) Phase 1~5 의 구현이며, 산출물은 보고서 03 의 처방 1·2·3 실물이다.

**(1) 토큰 시스템 1회**(처방 1 / Phase 1). Tokens Studio 플러그인 export(`raw/tokens.studio.json`, alias 보존, 모드 제외) → `@tokens-studio/sd-transforms` → **Style Dictionary** 변환(`tokens/tailwind.tokens.js`, **GENERATED 헤더 + 멱등**, 킷 불변식 3·7) → `tailwind.config.js` `theme.extend` 가 참조 → **NativeWind className 으로 semantic 이름(`bg-surface`)이 살아있게**. semantic→atomic alias 보존의 핵심은 Style Dictionary `outputReferences: true`(기본은 raw 값으로 해소).

**(2) 컴포넌트 단독완성 + 검증 + 수동매핑**(Phase 2). DS 컴포넌트를 NativeWind 토큰만으로 구현 → Storybook 스토리(variant/state별) → **컴포넌트 단위 diff**(렌더 ↔ Figma 컴포넌트 export) 통과해야 "완성" → **수동 매핑**(Code Connect 불가): visual-spec 의 `## Component Mapping` 에 Figma 인스턴스 → 내 컴포넌트 import.

**(3) 화면 추출 → 동결**(처방 2 / Phase 3). MCP 권장 순서로 호출 후 한 묶음 동결:
`get_metadata`(`raw/<screen>.metadata.xml`) → `get_screenshot`(`raw/<screen>.baseline.png`, 시스템 크롬 제외) → `get_variable_defs`(`raw/<screen>.tokens-used.json`, *교차확인용*) + **REST `/nodes` 로 정확 수치 보강** + **REST `/v1/images` 로 에셋**. 이를 **`visual-spec.md`** 로 동결하되 값은 **토큰 ID 로만**(보고서 02 §D 의 "동결 안 됨" 누수를 닫는 단계).

**(4) 조합 구현 — 원본 Figma 미투입**(Phase 4). LLM 입력 = **visual-spec(매핑+레이아웃 토큰) + 컴포넌트 import + NativeWind 테마**. 원본 Figma 는 주지 않는다(동결 산출물만으로 재현 가능한지가 곧 테스트). 조합 변형:

| 변형 | LLM 에 주는 것 | 가설 |
|---|---|---|
| **V-A**(control) | visual-spec 만 | frozen 산출물만으로 충분한가 |
| **V-B** | A + `get_design_context`(구조 힌트, div→View 번역) | 코드 힌트가 도움/방해(변형-토큰 버그 주의) |
| **V-C** | A + baseline 스크린샷 비전 패스(자기보정) | 시각 피드백이 격차를 줄이나 |

**(5) 비주얼 회귀 diff 수렴**(처방 3 / Phase 5). Playwright 로 **Expo 웹**(`expo start --web`, react-native-web) 렌더 캡처(뷰포트=고정폭) → **odiff**(또는 pixelmatch)로 렌더 ↔ `baseline.png` diff → **mismatch ≤ 2%**(="95%"의 조작적 정의). 2-pass: diff 영역을 LLM 에 되먹임 → 수정 → 재측정. (`toHaveScreenshot` 은 자체 베이스라인용이라 *외부 Figma export 대조*엔 odiff 가 맞다 — [playwright 리서치](../playwright/README.md) 와 연결.) Playwright pixelmatch 기본 `threshold=0.2`(YIQ 색차, *바뀐 픽셀 비율 아님*), 이미지 허용은 `maxDiffPixelRatio`.

### auto-layout → NativeWind flex 매핑 (조합의 핵심 변환표)

REST/Plugin 필드를 RN/NativeWind 로 옮기는 결정적 매핑. RN 특이점이 결정적이다.

| Figma 필드(enum/값) | NativeWind/RN | 비고(RN 특이점) |
|---|---|---|
| `layoutMode` HORIZONTAL/VERTICAL | `flex-row` / `flex-col` | **RN 기본은 column** — 명시 필수 |
| `itemSpacing`(Number) | `gap-*`(`gap-x`/`gap-y`) | **gap 은 RN 0.71+·NativeWind v4 네이티브**(v2 는 margin 폴리필=불완전) |
| `counterAxisSpacing` | wrap 시 cross-axis gap | `gap-y` |
| `paddingLeft/Right/Top/Bottom` | `p-*`/`px-*`/`py-*` | px≈dp 취급 |
| `primaryAxisAlignItems` MIN/CENTER/MAX/SPACE_BETWEEN | `justify-start/center/end/between` | — |
| `counterAxisAlignItems` MIN/CENTER/MAX/BASELINE | `items-start/center/end/baseline` | — |
| `layoutSizingHorizontal/Vertical` FILL | 주축 `flex-1` / 교차축 `self-stretch`(또는 `w-full`) | **base flex 정의가 달라 통상 `flex-1` 추가 필요** |
| `…` HUG | `w-fit`/내용맞춤 | 주축 hug=flex 없음 |
| `…` FIXED | 고정 `w-[n]`/`h-[n]` | — |
| `layoutGrow` 1 | `flex-1`(flex-grow:1) | auto-layout 자식만 |
| `layoutAlign` STRETCH | `self-stretch` | align-self |
| `layoutPositioning` ABSOLUTE | `absolute` + `absoluteBoundingBox` 기반 `top/left` | 부모 relative |
| `layoutWrap` WRAP | `flex-wrap` | — |

> 추가 RN 제약: **%·px 혼합 계산 불가**(calc 막힘; `w-full`/`w-1/2` 는 OK), `flex-auto`/`flex-initial`/`flex-none` 은 **web 전용**, rem 네이티브 14/web 16. 따라서 V-B 의 `get_design_context`(web div+Tailwind)는 **View/Text/Image + 위 제약**으로 재해석해야 한다(미투입 원칙은 유지하되 힌트로만).

---

## §6. 거의-일치를 만드는 핵심 원칙 & 현실적 천장

**왜 둘을 합쳐야 하나(상보성).** 단일 채널 실패모드:
- **MCP 만** → 정밀 수치·재현가능 일괄추출·정확 에셋 한계 + `get_design_context` 가 web(div) 산출이라 RN 부적합 + variant/모드 토큰 버그.
- **REST 만** → 시맨틱 토큰명·코드 컴포넌트 매핑·코드 힌트·스크린샷 부재 → **raw 값만** 나와 토큰 alias 복원 불가(Professional 은 Variables API 도 막혀 더 심함).
→ **MCP 로 토큰명·구조·스크린샷, REST 로 정확 수치·에셋**을 합쳐야 둘의 빈칸이 서로 메워진다.

**왜 토큰 단일출처·동결 산출물·diff 루프가 본질인가.** 채널은 *수단*일 뿐이다. 보고서 02 의 4대 누수(담을 칸 없음·추측금지 TODO·동결 안 됨·게이트 0)는 채널을 바꾼다고 안 닫힌다. 닫는 것은 세 규율이다: **토큰 단일출처**(처방 1, 추측을 참조로) → **동결 visual-spec**(처방 2, 휘발성 추출을 재현가능 계약으로) → **diff 루프**(처방 3, 충실도를 숫자로). 이 셋이 없으면 어느 채널 조합이든 "측정 불가"로 남는다(보고서 01·03).

**100% 불가 천장.** 순수 픽셀 100% 일치는 어떤 파이프라인이든 **구조적으로 불가**:
- 폰트 렌더·OS·하드웨어·headless 차로 브라우저 렌더가 흔들림(Playwright 공식 경고: 동일 환경 baseline 필수).
- RN 은 추가로 iOS/Android **폰트 메트릭·dp 스케일·네이티브 텍스트 렌더**가 Figma(데스크톱) export 와 달라 텍스트 경계에 **항상 미세 diff** 잔존.
- RN↔Figma **레이아웃 엔진 차**.
→ 현실적 천장 = **토큰·구조 레벨 충실도를 0 차이로** 만든 뒤(간격/정렬/sizing) **잔차를 폰트 안티앨리어싱 수준으로** 낮추는 "허용 임계 내 수렴"(≤2%). "한 방에 100%"가 아니라 "측정 가능한 루프로 좁힌다".

---

## §7. 킷 통합 제안

이 장은 게이트가 아니다. 실제 도입은 아래를 Open Decision/제안서로 올려 사람이 판단한다(킷 절차: warning-first → telemetry → 사람-승인 decision).

### 확장된 visual-spec.md 스키마 (처방 2 프로토타입)

[figma-component-mapping.template.md](../../../frontend-workflow-kit/templates/screen/figma-component-mapping.template.md) 의 현재 4컬럼 표(`Figma Frame / Node | UI 요소 | 매핑 컴포넌트 | 비고` — 값 레벨 없음)에 **`## Visual Spec` 섹션 추가**. 값은 **리터럴 금지·토큰 ID만**([실험 프로토콜](../../../temp/proposals/figma-fidelity-experiment.md) 스키마):

| 필드 | 예시(토큰 ID) | 출처 채널(§4) |
|---|---|---|
| `direction` | `row` | REST `layoutMode` |
| `gap` | `space.4` | REST `itemSpacing` → 토큰 |
| `padding` | `space.4` | REST `padding*` → 토큰 |
| `align/justify` | `center/between` | REST `counter/primaryAxisAlignItems` |
| `sizing` | `fill` | REST `layoutSizing*` |
| `color` | `bg.surface` | REST `fills` → `get_variable_defs` 교차확인 |
| `type` | `title.md` | REST `style` → 타이포 토큰 |

예: `| Header | row | space.4 | space.4 | center/between | fill | bg.surface | title.md |`. 별도 `## Assets`(`node | path | format`), `## Component Mapping`(Code Connect 대체 수동 매핑).

### 게이트·결정 제안

- **figma-component-mapping 에 `## Visual Spec` 추가** — 컬럼/스키마/검사 슬라이스(값 칸 신설 = 보고서 02 §B 근본원인 해소).
- **warning-first 게이트** — visual-spec 의 토큰 ID 유효성(미정의 토큰 참조 금지)·필수 칸 존재를 `continue-on-error` 로 먼저(route-cross-check·interaction-matrix v2 도입 방식과 동일). 비주얼 회귀(≤2%)는 telemetry 후 별도 하드 게이트.
- **Open Decision 후보**: ①"design-tokens 생성 소스 계약"(Tokens Studio→Style Dictionary→NativeWind; component-catalog 생성 패턴 재사용 여부). ②"visual-spec Visual Spec 섹션·검사(warning-first) 슬라이스". ③"비주얼 회귀 evidence 도입"(Expo 웹+Playwright+odiff, warning-only smoke 부터). ④"Professional 게이팅 전제 명문화"(Variables REST ❌·커스텀 Code Connect ❌를 킷 README/EXTRACTION 에 못박기).
- **킷 원칙 준수**: 새 산출물 축 추가 금지 → **기존 design 축 강화**로 프레이밍(처방 1·2). 생성기는 멱등+GENERATED 마커. confirmed 승격·게이트 내림은 사람 전용.

### 크로스링크

- 갭 분석: [README](README.md) · [01 — 킷이 보장하는 것](01-what-the-kit-captures.md) · [02 — 시각 충실도 누수](02-where-visual-fidelity-leaks.md) · [03 — 95로 좁히기](03-gaps-and-path-to-95.md)
- 실험·추출: [실험 프로토콜](../../../temp/proposals/figma-fidelity-experiment.md)(V-A/V-B/V-C·합격선 ≤2%) · [EXTRACTION.md](../../../temp/runs/figma-fidelity-001/EXTRACTION.md)(채널 분담)
- 검증 도구: [playwright 리서치](../playwright/README.md)(Expo 웹 캡처)
- 정착지 템플릿: [figma-component-mapping.template.md](../../../frontend-workflow-kit/templates/screen/figma-component-mapping.template.md)
- 정식화 제안: [visual-spec-formalization](../../../kit-dev/docs/design/drafts/visual-spec-formalization.md) (§7 스키마의 채택 경로·PR69 드래프트 교정·후속 OD)

---

## 출처 (검증 시점 명시)

모든 항목 **as of 2026-06-21**(Figma 공식 개발자 문서·Help Center·가격 페이지 직접 fetch 및 적대적 검증 기준). Figma MCP/가격/레이트리밋은 변동이 잦으므로 도입 전 재확인 필요.

**Figma MCP 서버 (도구·출력·한계·접근)**
- 도구 목록·설명·파라미터: https://developers.figma.com/docs/figma-mcp-server/tools-and-prompts/
- 서버 개요·원격 권장: https://developers.figma.com/docs/figma-mcp-server/
- 로컬/데스크톱 설치(`127.0.0.1:3845/mcp`, 에셋 3모드): https://developers.figma.com/docs/figma-mcp-server/local-server-installation/
- 원격 설치(OAuth, `mcp.figma.com/mcp`): https://developers.figma.com/docs/figma-mcp-server/remote-server-installation/
- 가이드(권장 순서·데스크톱/원격 좌석 조건): https://help.figma.com/hc/en-us/articles/32132100833559-Guide-to-the-Figma-MCP-server
- 레이트리밋·접근(Professional+Dev/Full=200/day·15/min; View/Collab·Starter 월 6회): https://developers.figma.com/docs/figma-mcp-server/rate-limits-access/
- 클라이언트 이슈(25000 토큰 초과→`MAX_MCP_OUTPUT_TOKENS`): https://developers.figma.com/docs/figma-mcp-server/mcp-clients-issues/
- 스티어링 가이드(중간표현 취급·create_design_system_rules): https://github.com/figma/mcp-server-guide
- variant 토큰 불일치(포럼, medium): https://forum.figma.com/report-a-problem-6/mcp-get-design-context-returns-base-component-tokens-instead-of-variant-specific-tokens-50790
- 모드 평탄화·alias(포럼, medium): https://forum.figma.com/suggest-a-feature-11/figma-mcp-reading-variable-modes-42031 · https://forum.figma.com/ask-the-community-7/mcp-server-get-variable-defs-not-returning-aliases-47630
- MCP 소개(스크린샷+메타데이터 결합·Code Connect): https://www.figma.com/blog/introducing-figma-mcp-server/

**Figma REST API (노드 속성·엔드포인트·인증·레이트리밋)**
- 파일/노드/이미지 엔드포인트·파라미터·Tier: https://developers.figma.com/docs/rest-api/file-endpoints/
- 노드 타입·필드(layout/sizing/fills/effects/TypeStyle/constraints/geometry): https://developers.figma.com/docs/rest-api/file-node-types/
- API 타입 스펙(enum 교차확인): https://github.com/figma/rest-api-spec/blob/main/dist/api_types.ts
- Variables 엔드포인트(Enterprise 전용): https://developers.figma.com/docs/rest-api/variables-endpoints/ · https://developers.figma.com/docs/rest-api/variables/
- 스코프(`file_content:read` 무제한 / `file_variables:*` Enterprise only): https://developers.figma.com/docs/rest-api/scopes/
- PAT(최대 90일): https://developers.figma.com/docs/rest-api/personal-access-tokens/ · 인증: https://developers.figma.com/docs/rest-api/authentication/
- 레이트리밋(leaky bucket·429·Tier): https://developers.figma.com/docs/rest-api/rate-limits/

**Professional 게이팅·가격 (적대적 검증)**
- 가격(Professional Full $16/Dev $12/Collab $3; Code Connect UI 키트 한정): https://www.figma.com/pricing/
- 플랜·기능 비교표(Variables REST·Code Connect 열): https://help.figma.com/hc/en-us/articles/360040328273-Figma-plans-and-features
- 좌석 개편(2025-03-11, Dev seat): https://help.figma.com/hc/en-us/articles/27468498501527-Updates-to-Figma-s-pricing-seats-and-billing-experience
- 좌석 정의: https://help.figma.com/hc/en-us/articles/360039960434-Free-and-paid-seats-in-Figma
- Code Connect 가용성(Org/Enterprise+Full/Dev): https://help.figma.com/hc/en-us/articles/23920389749655-Code-Connect · https://developers.figma.com/docs/code-connect/
- Variables 모드 수(Schema 2025: Professional 10): https://help.figma.com/hc/en-us/articles/35794667554839-What-s-new-from-Schema-2025
- 플러그인 전 플랜(private 은 Org/Enterprise): https://help.figma.com/hc/en-us/articles/360042532714-Use-plugins-in-files
- Changelog(Variables 플랜 확대 항목 없음 확인): https://developers.figma.com/docs/rest-api/changelog/

**토큰 파이프라인·NativeWind·비주얼 회귀**
- Tokens Studio → Style Dictionary: https://docs.tokens.studio/transform-tokens/style-dictionary · https://www.npmjs.com/package/@tokens-studio/sd-transforms
- Style Dictionary(`outputReferences`): https://styledictionary.com/reference/utils/references/ · https://styledictionary.com/reference/hooks/formats/
- NativeWind 플랫폼 차이(flex-direction/flex-1/dp): https://www.nativewind.dev/docs/core-concepts/differences · gap(RN 0.71+): https://www.nativewind.dev/docs/tailwind/flexbox/gap
- RN flexbox: https://reactnative.dev/docs/flexbox
- Figma Plugin API(layoutmode/layoutsizing/layoutpositioning): https://www.figma.com/plugin-docs/api/node-properties/
- Playwright 스크린샷(threshold 0.2·maxDiffPixelRatio·동일환경 경고): https://playwright.dev/docs/test-snapshots · https://playwright.dev/docs/api/class-pageassertions
- pixelmatch(YIQ): https://github.com/mapbox/pixelmatch
- 스크린샷 비교 알고리즘(odiff 등): https://wopee.io/blog/screenshot-comparison-algorithms-visual-testing/
