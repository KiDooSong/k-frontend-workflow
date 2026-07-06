// auth family 의 layout/shell owner — BrandLogo 배치는 여기(shell)가 소유한다.
// (shell 은 screen entry 가 아니므로 direct-import 검사 대상이 아니다.)
import { BrandLogo } from '../../components/ui/BrandLogo';

export function AuthShell(props: { children?: unknown }) {
  return (
    <div data-testid="auth-shell">
      <header>
        <BrandLogo />
      </header>
      <main>{props.children}</main>
    </div>
  );
}
