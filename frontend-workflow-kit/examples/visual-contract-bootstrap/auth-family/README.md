# visual-contract-bootstrap / auth-family — golden fixture

`workflow:visual-contract-bootstrap` 의 review-only draft 동작을 고정하는 픽스처다.
auth domain 화면 3개(AUTH-001 login · AUTH-002 signup · AUTH-003 reset-password)와
**부분적인 기존 contract**(auth family 에 AUTH-001·AUTH-002 만 등록)를 담는다.
`scripts/lib/visual-contract-bootstrap.test.mjs` 가 이 트리를 읽어 기대 후보를 대조한다
(읽기 전용 — bootstrap 은 `--out` 없이는 아무것도 쓰지 않는다).

실행 (킷 루트에서):

```bash
node scripts/visual-contract-bootstrap.mjs \
  --docs examples/visual-contract-bootstrap/auth-family/docs/frontend-workflow \
  --src  examples/visual-contract-bootstrap/auth-family/src \
  --json
```

기대 후보 (review-only — exit 0):

| 항목 | 기대값 | 근거 |
|---|---|---|
| candidate family | `auth` (confidence high) | same domain · screen_id prefix AUTH · shared feature dir · repeated AuthShell(2/3)/Button(3/3) import |
| shell owner 후보 | `AuthShell` | login·reset-password 가 반복 import |
| logo policy 후보 | `shell-owned candidate` | AuthShell 소스가 BrandLogo 를 import |
| header policy 후보 | `shell-owned candidate` | AuthShell 소스에 `<header>` |
| CTA policy 후보 | `shared-bottom-cta candidate` | Button 이 3/3 화면에서 반복 |
| figma coverage | present AUTH-001 · missing AUTH-002, AUTH-003 | mapping 파일 존재/부재 |
| component gap 후보 | `AuthShell` | 반복 shell-like import 인데 component catalog 에 없음 |
| suggested additions | family 행 1(AUTH-003 추가분) + component 행 1(Button) | 기존 contract 는 AUTH-001·AUTH-002·BrandLogo 만 담고 있음 |
| findings | existing-contract-not-overwritten(warning) · AUTH-002 direct BrandLogo import/ad-hoc positioning/hardcoded copy(info) | signup 이 drift 케이스 |

AUTH-002(signup)는 의도된 drift 케이스다: AuthShell 미사용, BrandLogo 직접 import +
ad-hoc `mt-12 absolute`, "회원가입" 하드코딩. 기존 contract 가 있으므로 bootstrap 은
overwrite 하지 않고 suggested additions 만 낸다.
