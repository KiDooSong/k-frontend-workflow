// 의도된 drift 케이스 — AuthShell 사용 + BrandLogo 직접 import + ad-hoc positioning +
// hardcoded copy. bootstrap findings(direct-screen-import/adhoc-positioning/hardcoded-copy)
// 와 draft 기반 visual-consistency 관찰의 재료가 된다.
import { AuthShell } from './AuthShell';
import { BrandLogo } from '../../components/ui/BrandLogo';
import { Button } from '../../components/ui/Button';

export function SignupScreen() {
  return (
    <AuthShell>
      <BrandLogo className="mt-12 absolute" />
      <h1>회원가입</h1>
      <footer>
        <Button>가입하기</Button>
      </footer>
    </AuthShell>
  );
}
