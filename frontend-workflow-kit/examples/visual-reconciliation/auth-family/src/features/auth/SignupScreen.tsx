// 경고 케이스 — shell-owned BrandLogo 를 직접 import + ad-hoc positioning + hardcoded copy.
// (픽스처 의도: direct-screen-import · adhoc-positioning · hardcoded-copy-candidate 발화)
import { AuthShell } from './AuthShell';
import { BrandLogo } from '../../components/ui/BrandLogo';

export function SignupScreen() {
  return (
    <AuthShell>
      <BrandLogo className="mt-12 absolute" />
      <h1>회원가입</h1>
    </AuthShell>
  );
}
