# adoption-probe / visual-auth-family — visual observation fixture

`workflow:adoption-probe -- --visual` 의 draft-only visual observation 동작을 고정하는
consumer-repo 모양 픽스처다. auth domain 화면 2개(AUTH-001 login · AUTH-002 signup),
부분 figma mapping(AUTH-001 만), component catalog(AuthShell 미등록 — gap 후보),
**기존 visual-consistency-contract 없음**(cold start — consistency 는 bootstrap draft 기준
advisory 로 돈다)을 담는다. `scripts/lib/adoption-probe.test.mjs` 가 이 트리를 읽는다.

실행 (킷 루트에서 — run 출력은 이 픽스처의 `temp/runs/` 아래에만 생기고 git-ignore 된다):

```bash
npm run workflow:adoption-probe -- --repo examples/adoption-probe/visual-auth-family --visual --json
```

기대 관측 (draft-only — probe exit 0):

| 항목 | 기대값 | 근거 |
|---|---|---|
| bootstrap candidate family | `auth` (AUTH-001, AUTH-002) | same domain · screen_id prefix AUTH · shared feature dir · repeated AuthShell/Button import |
| shell owner 후보 | `AuthShell` | 2/2 화면이 반복 import |
| component gap 후보 | `AuthShell` | shell-like 반복 import 인데 catalog 미등록 |
| bootstrap draft | `<probe-run>/visual/visual-consistency-contract.draft.md` | review-only draft (status: draft) |
| existing contract | not found (cold start) | `design/visual-consistency-contract.md` 부재 |
| visual-consistency | `contract_source: bootstrap-draft` advisory | canonical contract 부재 시 draft 기준 |
| observations | `<probe-run>/observations/visual-contract-bootstrap.*` · `visual-consistency.*` | JSON/stdout/stderr 관측 파일 |

AUTH-002(signup)는 의도된 drift 케이스다: BrandLogo 직접 import + ad-hoc `mt-12 absolute` +
"회원가입" 하드코딩 copy — bootstrap findings 와 consistency 관찰의 재료.
모든 출력은 probe run dir 내부(draft/observation)뿐이고 live docs/src 는 수정되지 않는다.
경고/후보는 gate·approval·confirmed 승격이 아니다.
