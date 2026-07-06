// drift 케이스 — AuthShell 미사용, shell-owned 후보 BrandLogo 를 직접 import +
// ad-hoc positioning + hardcoded copy. (픽스처 의도: direct-screen-import-observed ·
// adhoc-positioning-observed · hardcoded-copy-candidate 발화)
import { BrandLogo } from '../../components/ui/BrandLogo';
import { Button } from '../../components/ui/Button';

export function SignupScreen() {
  return (
    <div>
      <BrandLogo className="mt-12 absolute" />
      <h1>회원가입</h1>
      <footer>
        <Button>가입하기</Button>
      </footer>
    </div>
  );
}
