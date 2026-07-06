# visual-reconciliation / auth-family — golden fixture

`workflow:visual-consistency` 의 warning-first 동작을 고정하는 픽스처다.
auth family(AUTH-001 · AUTH-002 · AUTH-404) 하나에 통과 화면 1개(AUTH-001 login)와
경고 화면 1개(AUTH-002 signup)를 담는다. `scripts/lib/visual-consistency.test.mjs` 가
이 트리를 읽어 기대 finding 을 대조한다 (읽기 전용 — 검사기는 아무것도 쓰지 않는다).

실행 (킷 루트에서):

```bash
node scripts/visual-consistency.mjs \
  --docs examples/visual-reconciliation/auth-family/docs/frontend-workflow \
  --src  examples/visual-reconciliation/auth-family/src \
  --json
```

기대 finding (warning-first — exit 0):

| severity | rule | 대상 | 원인 |
|---|---|---|---|
| warning | screen-not-found | AUTH-404 | contract member 인데 ScreenSpec 없음 |
| warning | figma-mapping-missing | AUTH-002 | family 중 signup 만 figma-component-mapping 누락 |
| warning | component-gap-candidate | MarketingBanner | contract 의 shared component 가 catalog 에 없음 (G-002 로 제안됨) |
| warning | direct-screen-import | AUTH-002 / BrandLogo | shell-owned(forbidden) 컴포넌트를 screen file 이 직접 import |
| warning | adhoc-positioning | AUTH-002 / BrandLogo | 로고 사용부에 ad-hoc `mt-12 absolute` |
| warning | exception-hygiene | AUTH-002 | Visual Exceptions 행에 Reason/Decision ID 누락 |
| info | hardcoded-copy-candidate | AUTH-002 | Copy Keys 가 있는데 "회원가입" 이 하드코딩됨 |

AUTH-001(login)은 통과 케이스다: AuthShell 경유, BrandLogo 직접 import 없음, copy 는
i18n 호출(`t('auth.login.*')`) 경유, figma mapping(draft) 존재.
