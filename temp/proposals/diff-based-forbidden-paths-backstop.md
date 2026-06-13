# Diff-based forbidden_paths backstop — 설계안

> 상태: **제안(설계만)**. 코드·`package.json`·`scripts/` 변경 없음.
> 위치: Tier 1 강화 잔여 — `roadmap-current.md` "다음 구현 후보 #2", `open-decisions.md` "Validate 통합" 의 *경로 backstop*.
> 참조 코드: `scripts/readiness.mjs`(`computeReadiness` export), `scripts/validate.mjs`(검사 9종, 트리 스캔),
> `policies/implementation-mode-policy.yaml`, `catalog/artifact-manifest.yaml`.
>
> 이 문서는 후속 세션이 단독으로 구현에 착수할 수 있을 만큼 경계·규칙·예시를 고정하는 것이 목적이다.
> 결정 로직을 새로 만들지 않는다 — readiness 출력을 **소비**한다 (불변식 #1: 모드 판정 단일 출처).
>
> 리뷰 반영: v2 (2026-06-13). 코덱스 리뷰로 repo-wide union-allow 의 over-masking·`computeReadiness`
> 시그니처·rename/push/staged/glob 정정. 핵심 규칙을 **project-level clearance threshold** 로 재정의하고
> 그 한계(cross-screen masking)를 명시 한계로 surface 했다.

---

## 1. Problem

readiness 출력에는 화면별 `allowed_paths` / `forbidden_paths` 가 있다. `implement-screen` 스킬은
이 경계 안에서만 수정해야 한다 (SKILL.md: "`src/api` 등 forbidden 경로는 건드리지 않는다").
하지만 이를 **사후에 강제하는 자동 장치가 없다.**

방어선은 두 층으로 설계돼 있다.

```txt
forward (1차)   readiness_mode = min(fact_mode, decision_cap) 다운그레이드
                + pre-edit-mode-guard 훅 (편집 직전에 막는 live gate)
backstop (2차)  실제로 경계를 넘은 변경을 사후에 잡는 그물
                — 훅이 없는 환경(CI, 비-Claude 편집, 훅 off)용
```

backstop 자리는 자연스럽게 `validate.mjs` 지만, validate 는 **트리 전체 스캔**이라 여기에 쓸 수 없다.
`src/api/**` 같은 경로는 여러 화면이 **공유**하고 리포에 **이미 존재**하므로, 트리 스캔은
"src/api 가 있다 = 위반" 으로 오탐한다 (golden example 에서 즉시 false-positive).
validate.mjs 헤더 주석(L12)·"Validate 통합"(open-decisions.md L227)이 이 이유로 backstop 을
**diff 기반 후속**으로 미뤄 둔 상태다.

따라서 backstop 은 **변경분(diff)만** 보고, **이미 존재하는 파일은 무시**해야 한다.
이 문서는 그 diff 기반 backstop 의 설계안이다.

### 무엇을 잡고 무엇을 잡지 않는가 (스코프의 핵심)

```txt
잡아야 한다 (true positive)
  어떤 화면도 API 통합 단계(api-integrated-ui)에 도달하지 못했는데(=전부 그 아래로 게이트됨)
  이번 변경이 src/api/** 또는 openapi.yaml/yml 을 새로 쓰거나 고쳤다.
  → "LLM 이 미확정 API 를 임의로 메우고 진행" 이라는 핵심 실패 모드.

잡지 말아야 한다 (false positive)
  (a) src/api 가 이미 리포에 존재 → diff 만 보면 해소.
  (b) 어떤 화면이 정당하게 api-integrated-ui 에 도달해 src/api 가 열림 → clearance threshold 로 해소(§4).
  (c) 워크플로우와 무관한 공유 코드(src/lib, src/components/ui) 편집 → guarded surface 스코핑으로 해소.
  (d) rough→final 처럼 '같은 경로 안'의 품질 승격 → 파일로 구분 불가, forward gate 담당(설계상 제외).
```

### 명시 한계 — clearance 는 화면별이 아니라 프로젝트 단위다 (의도된 false-negative)

`src/api/**` 는 **도메인 스코프가 아니다**(`{domain}` 가 없다). 따라서 변경된 `src/api/coupon.ts` 가
"어느 화면 소유인지" 를 **경로만으로 알 수 없다**(공유 인프라일 수도 있다). 그래서 MVP 의 clearance 는
**프로젝트 단위**다: 화면 *하나라도* api-integrated-ui 에 도달하면 그 diff 의 `src/api/**` 쓰기는
**전부** 통과된다 — 그 변경이 아직 cleared 되지 않은 *다른* 화면 소유여도 그렇다.

이건 버그가 아니라 **택한 trade-off** 다. 이 킷의 1순위는 false-positive 제거이고(트리 스캔을 버린 이유),
파일→화면 attribution 이 없으면 정확한 화면별 판정은 불가능하다. 따라서 MVP 는 "프로젝트가 API 레이어를
열 자격을 얻었는가" 라는 **굵은 게이트**만 건다. 화면별 정밀 attribution 은 §8 후속이 닫는다.

> 의미 변경 주의: open-decisions.md "Validate 통합" 의 옛 문구("화면의 산출물/diff 가 readiness_mode 의
> forbidden_paths 에 있으면 → validate 실패")는 *화면별* 표현이다. 이 제안은 MVP 에서 그것을
> **프로젝트 단위 clearance** 로 의도적으로 대체한다(이유: `src/api` 의 화면 attribution 부재).
> 채택 시 그 문서 문구를 맞춰 갱신한다 — §8 후속 doc-update.

---

## 2. Proposed CLI

> **제안 형태일 뿐 — 이번 작업에서 스크립트/`package.json` 을 만들지 않는다.**
> 아래는 후속 구현이 따라야 할 인터페이스 계약이다.

별도 스크립트로 둔다 (validate.mjs 와 분리). 이유: validate 는 git·base ref 개념이 없는
순수 FS 검사이고 멱등성 게이트에서도 돌기 때문에, diff/base 인자를 끌어들이면 두 관심사가 섞인다.

```txt
node scripts/forbidden-paths.mjs [options]

옵션
  --base <ref>      비교 기준 ref. 미지정 시 자동 해석(§3 base ref 표).
  --staged          working tree 대신 index(git diff --cached)를 본다. pre-commit 훅용(§6 caveat).
  --range <A...B>   명시적 범위. --base 보다 우선.
  --docs <dir>      기본 docs/frontend-workflow (readiness 입력과 동일).
  --src  <dir>      기본 src (정책 src 루트).
  --root <dir>      프로젝트 루트. diff 경로에서 이 접두를 떼고 정책 경로와 맞춘다(§6 monorepo).
  --policy <file>   기본 policies/implementation-mode-policy.yaml.
  --enforce         위반 시 exit 1. 미지정(기본)이면 경고만 출력하고 exit 0 (warning-first).
  --json            기계가독 출력.

exit code
  0   위반 없음 — 또는 --enforce 없이 위반을 경고로만 출력.
  1   --enforce 인데 위반 있음 (CI 게이트).
  2   입력 오류 (state/policy 부재, git 실행 실패, base ref 해석 실패 등).
```

readiness 와 동일하게, `computeReadiness` 를 **import 해서 in-process 로 소비**한다
(별도 판정 로직 0). 쉘/타 언어 훅에서는 `npm run workflow:readiness -- --json` 출력을
파싱하는 fallback 도 가능하다.

CI 통합도 **별도 step** 으로 추가한다 (`.github/workflows/frontend-workflow-kit.yml` 은
이미 `git diff --exit-code` 를 쓰므로 패턴이 낯설지 않다). — *제안일 뿐, 이번에 yml 수정 안 함.*

---

## 3. Inputs

### base ref 해석 (우선순위)

3-dot vs 2-dot 과 merge-base 를 명확히 한다. **merge-base 기준 3-dot 을 기본으로** 삼고,
`HEAD~1` 같은 깨지기 쉬운 fallback 은 쓰지 않는다.

```txt
1. --range A...B            명시 범위가 있으면 그대로.
2. --staged                 git diff --cached (index vs HEAD). pre-commit 훅(§6 caveat).
3. --base <ref>             git diff $(git merge-base <ref> HEAD)..HEAD  (= <ref>...HEAD, 3-dot).
4. CI(PR)                   base = merge-base(HEAD, PR target).
                           GitHub: origin/${{ github.base_ref }} 를 fetch → 3-dot.
5. CI(push, feature 브랜치)   base = merge-base(HEAD, origin/<default-branch>) → 3-dot.
6. CI(push, default 브랜치)   base = github.event.before .. HEAD (2-dot, 이 push 가 더한 범위).
                           default 브랜치에선 origin/<default>=HEAD 라 merge-base 가 HEAD 가 되어
                           diff 가 비고 全통과한다 → 여기서는 merge-base 를 쓰면 안 된다.
7. local 기본                git merge-base HEAD origin/<default-branch> → 그 지점..HEAD.

주의 (zero/missing before, 신규 브랜치)
  - github.event.before 가 0000...(브랜치 첫 push)이거나 없으면 HEAD~1 로 떨어지지 말 것
    — 여러 커밋을 한 번에 올린 경우를 놓친다.
  - feature 브랜치 push/PR: merge-base(HEAD, origin/<default>) 로 환원.
  - default 브랜치 첫 커밋 등 merge-base 가 없으면(완전 분리된 히스토리) empty-tree
    (4b825dc642cb6eb9a060e54bf8d69288fbee4904)와 diff 하거나 exit 2.
  - 절대 조용히 통과(fail-open)하지 않는다.
```

`--base` 자동 해석이 실패하면(예: origin/<default> 미fetch) 조용히 통과시키지 않고 exit 2 로 surface 한다.

### 판정 입력 (readiness 와 동일 — 두 번째 출처를 만들지 않음)

```txt
docs/frontend-workflow/_meta/workflow-state.yaml   화면별 사실/파생값
policies/implementation-mode-policy.yaml           모드별 allowed/forbidden + order(사다리)
catalog/artifact-manifest.yaml                     (후속) generated/do_not_edit 식별 — §6 참조
```

backstop 은 먼저 `workflow:state` 를 돌려(또는 갓 로드한 state 로) readiness 를 얻는다. 호출은
**정확한 시그니처**를 따른다(readiness.mjs L201):

```txt
computeReadiness({ state, policy, ci, manifest })   # ci, manifest 포함 — positional 아님

ci 는 {} 로 넘긴다. 경로 게이트는 CI fact 가 필요 없다:
  - guarded surface 의 threshold 인 api-integrated-ui 는 fact(api_confidence·state_matrix)만 요구.
  - production-ready 만 CI fact 를 쓰는데, ci={} 면 로컬에서 production-ready 미도달 →
    readiness.mjs 의 로컬 동작과 일치(보수적). 필요하면 --ci 로 주입 가능하게 열어 둔다.
```

커밋된 readiness 산출물을 재사용하지 않는다(stale 방지). CI 에서는 이미 `example:state`→
`example:readiness` 가 선행하므로 입력이 신선하다.

### guarded surface (MVP — 정책에서 파생)

backstop 이 감시하는 경로 집합. 정책의 forbidden 글롭 중 **global 하고 specific 한** 것만 취한다.

```txt
classify(forbidden glob):
  domain-scoped   원본에 {domain} 포함 → 파일→화면 attribution 필요. MVP 제외.
  blanket         src/** 처럼 src 루트 전체를 덮음           → 공유 코드 오탐. MVP 제외.
  global+specific 그 외 (src/api/**, openapi.yaml, openapi.yml) → MVP 채택.
```

현재 정책에서 MVP guarded surface = **`src/api/**`, `openapi.yaml`, `openapi.yml`**.
`src/api/**` 는 정책에서 도출된다 — 정책에 새 layer 경계가 생기면 자동 편입.
`openapi.yml` 은 정책엔 yaml 만 있지만 validate.mjs(L216-217)가 yaml/yml 둘 다 OpenAPI 소스로
취급하므로 parity 로 함께 가드한다(.yml 만 쓰는 리포에서 빠져나가지 않게).

### glob 매칭 — 새 helper 가 필요하다 (manifestPathRegex 를 그대로 쓰지 못한다)

`validate.mjs` 의 `manifestPathRegex` 는 정책 글롭에 **재사용 불가**다: 그 함수는 정규식 메타문자를
*전부 escape* 해서 `*` 를 **리터럴**로 만들고, `{domain}`/`{screen}` 치환과 `docs/frontend-workflow/`
접두 제거만 한다. 정책의 `src/api/**` 같은 `**`/`*` 글롭은 처리하지 못한다.

따라서 작은 `globToRegex(glob)` 를 **새로** 명세한다(의존성 추가 없이 — Node+yaml only, 같은 hand-roll 방식):

```txt
**   → 경로구분(/) 포함 임의 (.*)
*    → / 제외 임의 ([^/]*)
그 외 정규식 메타문자는 escape, ^...$ 앵커
경로는 posix 정규화(Windows 의 \ → /) 후 매칭 — validate.mjs 의 toPosix 와 동일.
readiness 가 이미 {domain} 을 치환했으므로 매칭 시점엔 플레이스홀더가 없다(리터럴 경로만).
```

---

## 4. Algorithm

핵심 규칙은 **diff(상태 인식) + clearance threshold + guarded-surface 교집합**.

### clearance threshold 정의 (정책에서 파생)

```txt
order = policy.order   # docs-only … api-integrated-ui … production-ready (사다리, 누적)

threshold(S) = allowed_paths 에 S '전체를 덮는' 글롭(= S 와 같거나 S 의 상위)을 올리는 가장 낮은 모드.
               단 blanket src/** 은 threshold '정의'에서 제외(아래 이유). S 의 하위 sub-glob
               (예: src/api/schemas/**)은 S 를 다 덮지 못하므로 threshold 가 되지 못한다.
  threshold(src/api/**) = api-integrated-ui      # allowed_paths 에 src/api/**(=S)를 올리는 최저 모드
  threshold(openapi.yaml) = (없음)               # 어떤 모드도 openapi.yaml 을 allow 하지 않음
  threshold(openapi.yml)  = (없음)               # .yml 동일 (validate parity)

cleared(S) = ∃ screen.  index(screen.readiness_mode) >= index(threshold(S))
  # 사다리가 누적이므로 production-ready(상위)도 api-integrated-ui 의 자격을 포함 → src/api 를 clear.
  # threshold 가 없으면 cleared = false (항상 미충족) → openapi.yaml/yml 변경은 항상 플래그.
```

blanket `src/**`(production-ready) 을 threshold 정의에서 제외하는 이유: 낮은 모드가 우연히 blanket
allow 를 가져도 게이트를 열어버리는 일을 막기 위함(현재 정책엔 그런 낮은 모드가 없지만, 정책이
바뀌어도 안전하게). production-ready 자체는 사다리 위치(index)로 clear 하므로 결과는 일관된다.

threshold 를 '하위 sub-glob' 이 아니라 'S 전체를 덮는 글롭' 으로만 정의하는 이유: 미래에 어떤 모드가
`src/api/schemas/**` 같은 *좁은* 경로만 허용해도, 그게 `src/api/**` 전체의 게이트를 열어버리면 안 된다.
좁은 allow 가 들어오면 surface 를 그 단위로 쪼개 파일별로 가장 좁은 surface 에 매칭해야 한다 —
MVP 는 guarded surface 를 쪼개지 않는다고 가정한다(§8 후속).

### 위반 판정 (writes-only)

diff 를 **상태 인식 레코드**로 읽는다(경로만 flatten 하지 않는다 — rename 모순 방지, finding #5).

```txt
records = gitChangedRecords(base)
  # git diff --name-status -M -z 로 (status, path[, oldPath]) 파싱. -M 만(복사 -C 미사용):
  # A/M: path 한 개.  R: oldPath→newPath 두 개(NUL 2개).  D: path 한 개.
  # 복사는 -M 에선 신규 파일 A 로 나타난다(C 레코드 없음). -C 도입은 후속(§8: C 는 R 처럼 2-경로).

write_paths(record):
  A, M     → { record.path }            # 내용 생성/수정 (복사된 새 파일도 A 로 들어옴)
  R        → { record.newPath }         # rename 의 '새 위치' 는 쓰기. oldPath 는 삭제측(아래).
  D        → { }                        # 삭제는 MVP 비대상(§8). oldPath/삭제측도 동일.

for F in ⋃ write_paths(record) over records:
    S = guardedSurfaceOf(F)             # F 가 어떤 guarded surface 에 속하나 (globToRegex 매칭)
    if S is none:        continue        # (c) 공유/무관 경로 — 감시 대상 아님
    if cleared(S):       continue        # (b) 프로젝트가 그 레이어를 열 자격 도달 — 침묵
    report VIOLATION(F, S)               # guarded ∧ 미cleared 위치에 '쓰기' 발생
```

- **writes 만 본다**: A/M + rename 의 새 경로. 미확정 API 를 *작성*하는 것이 핵심 실패 모드다.
- **삭제(D)·rename 의 옛 경로는 MVP 비대상**: 제거는 환각 계약을 만들지 못한다. §8 후속(`--include-deletions`).
- 이 정의가 §6 의 rename 동작과 모순 없이 맞물린다:
  - `src/x.ts → src/api/x.ts`: 새 경로 guarded·미cleared → **위반**.
  - `src/api/x.ts → src/features/coupons/...`: 새 경로 비guarded(침묵), 옛 경로는 삭제측(비대상) → **침묵**.
  - `src/api/a.ts → src/api/b.ts`: 새 경로 guarded·미cleared → **위반**.

출력(위반 1건):

```txt
file          src/api/coupon.ts
change        M (modified)
surface       src/api/**
reason        guarded(src/api/**) 인데 프로젝트의 어떤 화면도 api-integrated-ui 에 도달하지 못함
              (현재 최고 화면 모드: rough-fixture-ui)
would-clear   화면 하나라도 api-integrated-ui 이상 도달하면 src/api/** 전체가 열린다(프로젝트 단위·§1 한계).

# openapi.yaml/yml 의 reason 은 다르다:
reason(openapi.yaml/yml)  현재 정책에 openapi 를 allow 하는 모드가 없음 → 변경 시 항상 플래그.
would-clear(openapi.yaml/yml)  (정책 결정 필요: api-integrated-ui 가 openapi 를 허용해야 하는가? §8)
```

---

## 5. Example

상태: 화면 두 개. COUPON-001=`rough-fixture-ui`(index 3), AUTH-001=`final-fixture-ui`(index 4).
threshold(src/api/**)=api-integrated-ui(index 5). 두 화면 max=4 < 5 → **cleared(src/api/**)=false**.

diff (`--base origin/main`, `--name-status -M`):

```txt
M  src/features/coupons/screens/CouponListScreen.tsx
A  src/features/coupons/components/CouponCard.tsx
M  src/api/coupon.ts
D  src/api/legacy.ts
R  src/lib/oldClient.ts -> src/api/newClient.ts
M  src/components/ui/Button.tsx
M  docs/frontend-workflow/domains/coupons/screens/coupon-list/screen-spec.md
M  docs/frontend-workflow/_meta/workflow-state.yaml
```

판정:

```txt
src/features/coupons/screens/...   guarded 아님(도메인 스코프, MVP 제외)              → 침묵
src/features/coupons/components/.  guarded 아님                                        → 침묵
src/api/coupon.ts (M)              guarded ∧ 미cleared, 쓰기                           → 위반 ★
src/api/legacy.ts (D)              삭제 — MVP 비대상(§8)                                → 침묵
oldClient.ts -> src/api/newClient.ts (R)  새 경로 guarded ∧ 미cleared, 쓰기            → 위반 ★
src/components/ui/Button.tsx       guarded 아님(공유 코드, blanket 만 해당)            → 침묵 (c)
docs/.../screen-spec.md            guarded 아님(docs)                                  → 침묵
docs/.../_meta/workflow-state.yaml guarded 아님(docs) + generated                     → 침묵 (§6)
```

→ **위반 2건** (`src/api/coupon.ts`, `src/api/newClient.ts`). warning-first 면 경고 후 exit 0;
`--enforce` 면 exit 1.

**clearance 대조군 (§1 한계 시연)**: 같은 diff 인데 AUTH-001 이 `api-integrated-ui`(index 5)라면 —
`cleared(src/api/**)=true` 가 되어 위 두 src/api 쓰기가 **둘 다 침묵**한다. AUTH 가 자격을 얻은 것이지
COUPON 이 얻은 게 아니지만, MVP 는 화면별 attribution 이 없어 프로젝트 단위로 연다. 이게 §1 에서
명시한 **의도된 false-negative** 이고, §8 의 도메인 attribution 후속이 이 구멍을 닫는다.

---

## 6. Edge cases

```txt
deleted (D) / rename 의 옛 경로
  MVP 비대상 — 제거는 환각 계약을 못 만든다. 핵심은 '쓰기'. §8 후속(--include-deletions).

renamed (R)
  --name-status -M -z 로 oldPath→newPath 를 받아 '새 경로만' 표준 규칙으로 검사(§4 write_paths).
  옛 경로는 삭제측이라 비대상. 이로써 'guarded→허용영역 이동은 침묵' 이 알고리즘과 일관.
  -z(NUL 구분) 필수: rename 라인은 경로 2개가 NUL 로 온다. 공백/유니코드 경로 안전.

untracked (??)
  git diff 에 안 잡힌다. pre-commit 은 --staged(index)로, CI 는 전부 커밋되어 커버.
  working-tree 미스테이지 신규 파일까지 보려면 git status --porcelain 필요 — MVP 비대상(§8).

--staged 와 readiness 입력의 불일치 (주의)
  --staged 는 index(staged) diff 를 보지만 computeReadiness 는 디스크(working tree)의
  workflow-state/docs 를 읽는다. staged 코드 변경을 unstaged readiness 로 판정하는 어긋남이 생길 수 있다.
  MVP 계약: pre-commit --staged 는 편의 게이트이고 권위 게이트는 CI(클린 체크아웃)다.
  정확히 하려면 커밋 전에 workflow:state 를 돌려 _meta 를 함께 stage 하거나, working tree 를
  staged 변경 외엔 clean 으로 유지한다. (index 에서 state 를 읽는 git show :path 방식은 후속.)

generated / do_not_edit
  manifest 의 generated 산출물(screen-inventory·workflow-state·component-catalog)은 전부 docs/ 하위다
  (artifact-manifest.yaml 확인). MVP guarded surface(src/api/**·openapi.yaml/yml)엔 generated 가 없으므로
  exclusion 이 사실상 무의미 — 별도 처리 불필요. guarded surface 가 src 로 넓어지는 후속에서만
  manifest(kind=generated/do_not_edit) 기준 명시 제외가 필요해진다.

three-dot vs two-dot (CI)
  PR·feature 브랜치 push 는 merge-base 기준 3-dot (main 의 전진을 브랜치 변경으로 오인 방지).
  default 브랜치 push 는 github.event.before..HEAD 2-dot (§3 의 5/6번 — 거기선 merge-base 가 HEAD 라 비어버림).

shallow clone (CI)
  actions/checkout 기본 depth=1 이면 base sha 가 로컬에 없어 merge-base 실패.
  → fetch-depth: 0 또는 base ref 명시 fetch 필요. (제안: yml step 주석에 명시.)

monorepo / path prefix
  이 킷 리포에서 예제는 frontend-workflow-kit/examples/coupon-feature/ 아래 산다.
  git diff 는 repo-root 상대경로를 주고 정책은 project-root 상대(src/**)다.
  --root 로 project-root 접두를 떼고 매칭한다(validate.mjs 의 projectRoot 와 동일 처리).
  소비 프로젝트에선 repo-root=project-root 라 보통 불필요.

readiness 가 전부 docs-only 로 고정된 경우 (malformed Open Decision → fail-closed)
  어떤 화면도 api-integrated-ui 에 도달 못 함 → cleared=false → src/api 쓰기는 위반으로 잡힌다(의도된 보수성).

base ref 자동해석 실패 / git 실행 실패
  조용히 통과(fail-open) 금지. exit 2 로 surface.
```

---

## 7. MVP scope

```txt
형태        별도 스크립트 scripts/forbidden-paths.mjs (제안). validate.mjs 는 트리 전용으로 유지.
재사용      readiness.mjs 의 computeReadiness({state,policy,ci:{},manifest}) import — 모드 판정 로직 0.
guarded     src/api/**, openapi.yaml, openapi.yml (정책 파생 + validate parity 로 .yml).
clearance   프로젝트 단위 threshold: 화면 하나라도 threshold(S) 이상 도달하면 S 의 쓰기 통과.
            openapi.yaml/yml 은 허용 모드가 없어 변경 시 항상 플래그.
규칙        diff(상태 인식)의 '쓰기'(A/M + rename 새 경로) 중 guarded ∧ 미cleared → 위반.
변경유형    A/M/R 의 쓰기측만(-M, 복사는 A). 삭제(D)·rename 옛 경로는 비대상.
glob        새 globToRegex(**,*) 명세 — manifestPathRegex 재사용 아님. posix 정규화.
출력        위반 목록(file/change/surface/reason/would-clear) + --json.
롤아웃      warning-first: 기본 exit 0(경고만). --enforce 로 CI 차단 옵트인.
CI          example:readiness 뒤에 별도 경고 step 추가(제안). 신뢰되면 --enforce 승격.
            PR·feature push 는 merge-base 3-dot, default 브랜치 push 는 before..HEAD(§3). fetch-depth:0 주의.
local       pre-commit(--staged, 편의)/pre-push(range) git 훅. 권위 게이트는 CI.
의존성      Node 내장 + yaml 만.
한계        clearance 는 화면별이 아니라 프로젝트 단위(§1) — 의도된 false-negative.
```

---

## 8. Not doing now

```txt
- 화면별 attribution (cross-screen 정밀 판정).
    파일→화면 소유 맵이 필요. 이게 §1 의 프로젝트-단위 masking 한계를 닫는 정식 후속.
    src/api/** 가 도메인 스코프가 아니라 자명한 attribution 이 없음 — naming 규약/스키마 매핑 등 설계 선행 필요.
- 삭제(D)·rename 옛 경로 게이트(--include-deletions).
    제거는 환각 계약을 못 만들어 우선순위 낮음. 필요 시 옵트인 플래그로.
- openapi.yaml/yml 의 허용 모드 정책 결정.
    현재 어떤 모드도 openapi 를 allow 하지 않아 '변경=항상 플래그'다. api-integrated-ui 가
    openapi 를 허용해야 하는지는 policy 소유자가 결정(Open Decision 후보). 그 전까지 MVP 는
    '항상 플래그' 로 동작하고 reason 에 정책 결정 필요를 명시한다.
- guarded surface 확장: src/features/** (feature layer).
    clearance threshold 로 안전하게 편입 가능하지만 MVP 는 API 경계 하나로 시작.
- 도메인 스코프 forbidden(src/features/{domain}/screens/** 등) 강제.
    화면별 attribution 후속과 함께.
- blanket src/** (docs-only) 강제 + 공유코드 allowlist.
    src/lib·src/components/ui 오탐을 거르려면 allowlist 가 선행. 후속.
- validate.mjs 에 '검사 10' 으로 흡수.
    단일 진입점이 필요해지면 그때. MVP 는 validate 를 diff-free·tree-only 로 유지.
- working-tree 미스테이지/untracked 신규 파일 감지(git status --porcelain). MVP 는 staged/committed 만.
- --staged 의 index-기반 readiness(git show :path). MVP 는 working-tree readiness + CI 권위.
- 기본 차단(exit 1). warning-first 로 FP 율 관찰 후 승격.
- rough→final 같은 '같은 경로 내' 품질 승격 게이트.
    파일 경계가 아니라 내용 품질이라 diff 로 구분 불가 — forward(훅+다운그레이드) 담당. 설계상 영구 제외.
- guarded surface 분할(sub-glob).
    정책이 guarded surface 의 하위 경로(예: src/api/schemas/**)를 더 낮은 모드에서 허용하게 되면,
    그 surface 를 sub-glob 단위로 쪼개 파일별로 가장 좁은 surface 에 매칭. MVP 는 미분할 가정.
- 복사 감지(-C).
    MVP 는 -M 만(복사는 신규 A 로 들어옴). -C 도입 시 C 레코드는 R 처럼 2-경로 — 새 경로만 검사.
- open-decisions.md "Validate 통합" 문구 갱신.
    옛 per-screen 표현("readiness_mode 의 forbidden_paths 에 있으면 실패")을 이 제안의
    project-level clearance 로 맞춰 정정(채택 시). §1 의미변경 주의 참조.
- 다중 src 루트/모노레포 일반화, 비-git VCS.
- package.json 스크립트 추가 / npm 별칭. (이번 작업 hard rule: 코드·스크립트·package.json 변경 금지.)
```

---

## 부록 — false-positive / false-negative 를 다루는 장치 (요약)

```txt
false-positive 감축
  1. diff-only          이미 존재하는 트리는 절대 스캔하지 않음 → "src/api 이미 있음" 오탐 제거.
  2. clearance threshold 프로젝트가 그 레이어를 열 자격을 얻으면 침묵 → 정당한 작업 오탐 제거.
  3. guarded surface    감시 표면을 API 레이어로 좁힘 → 공유 디자인시스템/lib 노이즈 제거.
  4. writes-only        삭제/이동-아웃을 비대상으로 → rename 모순·삭제 오탐 제거.
  5. three-dot diff     CI 에서 main 의 전진을 브랜치 변경으로 오인하지 않음.
  6. warning-first      신뢰 전까지 비차단 — FP 를 관찰하며 점진 강화.
  7. forward 와 역할분리 같은-경로 품질 승격은 backstop 이 아예 보지 않음(경계 넘는 변경만).

알려진 false-negative (의도)
  A. cross-screen masking  clearance 가 프로젝트 단위라 한 화면의 자격이 다른 미cleared 화면의
                           src/api 쓰기를 가린다(§1). → §8 화면별 attribution 이 닫는다.
  B. 삭제/이동-아웃         guarded 파일 제거는 MVP 가 보지 않는다. → §8 --include-deletions.
```
