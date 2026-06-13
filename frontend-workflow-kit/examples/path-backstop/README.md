# path-backstop 픽스처

`scripts/forbidden-paths.mjs` (diff 기반 forbidden_paths backstop)의 결정적 테스트 입력.
설계: [`temp/proposals/diff-based-forbidden-paths-backstop.md`](../../../temp/proposals/diff-based-forbidden-paths-backstop.md).

backstop 은 **변경분(diff)만** 본다 (이미 존재하는 트리는 스캔하지 않는다 — 공유 `src/api` 오탐 회피).
모드 판정은 `readiness.mjs` 의 `computeReadiness` 를 그대로 소비한다(판정 로직 중복 0).
현재 정책에서 파생되는 **guarded surface = `src/api/**`, `openapi.yaml`, `openapi.yml`**.

## 두 상태(state)

readiness 입력인 `_meta/workflow-state.yaml` 두 벌. 화면은 둘 다 COUPON-001 / AUTH-001.

| 상태 | 파일 | COUPON-001 | AUTH-001 | `cleared(src/api/**)` |
|------|------|------------|----------|------------------------|
| UNCLEARED | `docs/frontend-workflow/_meta/workflow-state.yaml` | rough-fixture-ui (3) | final-fixture-ui (4) | **false** (max 4 < api-integrated-ui 5) |
| CLEARED | `cleared/docs/frontend-workflow/_meta/workflow-state.yaml` | rough-fixture-ui (3) | **api-integrated-ui (5)** | **true** |

CLEARED 는 AUTH-001 의 `api_confidence_min` 만 `candidate→confirmed` 로 올린 것이다
(`state_matrix_complete` 는 이미 true). 이로써 AUTH 가 `api-integrated-ui` 에 도달한다.

> **§1 cross-screen masking 한계 시연**: clearance 는 화면별이 아니라 **프로젝트 단위**다.
> CLEARED 에서 AUTH 가 자격을 얻으면, COUPON 이 미cleared 여도 `src/api/**` 쓰기가 **프로젝트 전체에서** 침묵한다.
> 이건 버그가 아니라 택한 trade-off (파일→화면 attribution 부재). §8 후속이 닫는다.

상태 파일은 `readiness.mjs` 로 검증 가능하다:

```bash
node frontend-workflow-kit/scripts/readiness.mjs \
  --docs frontend-workflow-kit/examples/path-backstop/docs/frontend-workflow --json
# → COUPON-001: rough-fixture-ui, AUTH-001: final-fixture-ui
```

## diff 케이스 (`diffs/`)

`git diff --name-status -M` 텍스트 형식. **필드는 단일 TAB 구분** (A/M/D: `STATUS⇥path`,
R/C: `STATUS⇥old⇥new`). `--diff <file>` 로 주입한다.

| 케이스 | 내용 | 상태 | 위반 | exit |
|--------|------|------|------|------|
| `case1-api-write.txt` | `M src/api/coupon.ts`, `A src/api/newClient.ts` | UNCLEARED | **2** (둘 다) | 0 (warning-first) |
| `case1` + `--enforce` | 위와 동일 | UNCLEARED | 2 | **1** |
| `case2-screen-allowed.txt` | `M src/features/coupons/screens/CouponListScreen.tsx` | UNCLEARED | 0 (feature 경로는 비guarded) | 0 |
| `case3-generated-docs.txt` | `M .../workflow-state.yaml`, `M .../screen-spec.md` | UNCLEARED | 0 (docs 는 비guarded) | 0 |
| `case4-rough-to-final-samepath.txt` | `M src/features/coupons/components/CouponCard.tsx` | UNCLEARED | 0 (같은-경로 품질 승격 — forward 담당) | 0 |
| `case1-api-write.txt` | (동일) | **CLEARED** | 0 (프로젝트 단위 clearance) | 0 |
| `case6-rename.txt` | rename-IN/OUT + 삭제 (아래) | UNCLEARED | **1** (rename-IN 만) | 0 |
| `case7-openapi.txt` | `M openapi.yaml` | UNCLEARED | **1** (allow 하는 모드 없음) | 0 |

`case6-rename.txt` 세부 (writes-only 규칙 — A/M + rename 새 경로만 검사):

```
R100  src/lib/oldClient.ts → src/api/newClient.ts          새 경로 guarded·미cleared  → 위반 ★
R100  src/api/legacy.ts    → src/features/coupons/utils/…   새 경로 비guarded          → 침묵
D     src/api/deprecated.ts                                 삭제(MVP 비대상)           → 침묵
```

## 실행 방법

`--diff` 가 최우선 소스다. 워크플로우 에이전트는 cwd 가 달라질 수 있으니 **절대경로**를 권장한다.

```bash
# T1: src/api 쓰기 2건 (UNCLEARED) — 경고만, exit 0
node C:/Users/thdrl/source/repos/k-frontend-workflow-path-backstop/frontend-workflow-kit/scripts/forbidden-paths.mjs \
  --diff C:/Users/thdrl/source/repos/k-frontend-workflow-path-backstop/frontend-workflow-kit/examples/path-backstop/diffs/case1-api-write.txt \
  --docs C:/Users/thdrl/source/repos/k-frontend-workflow-path-backstop/frontend-workflow-kit/examples/path-backstop/docs/frontend-workflow \
  --json

# T1b: --enforce 를 더하면 exit 1 (CI 차단)
#   … 위와 동일 + --enforce

# T5: 같은 diff 를 CLEARED 상태로 → 0 위반 (프로젝트가 api 레이어를 열 자격 도달)
node C:/Users/thdrl/source/repos/k-frontend-workflow-path-backstop/frontend-workflow-kit/scripts/forbidden-paths.mjs \
  --diff C:/Users/thdrl/source/repos/k-frontend-workflow-path-backstop/frontend-workflow-kit/examples/path-backstop/diffs/case1-api-write.txt \
  --docs C:/Users/thdrl/source/repos/k-frontend-workflow-path-backstop/frontend-workflow-kit/examples/path-backstop/cleared/docs/frontend-workflow \
  --json
```

라이브 git 모드(`--diff` 없이 `--base`/`--range`/`--staged`)에서는 base ref 해석/`git diff` 가
실패하면 조용히 통과하지 않고 **exit 2** 로 surface 한다(fail-closed). 모노레포에서 diff 경로가
repo-root 상대이고 정책이 project-root 상대(`src/**`)면 `--root <repo-상대 접두>` 로 접두를 떼고 매칭한다.
