// auth family 의 layout/shell owner 후보 — BrandLogo 배치는 여기(shell)가 소유한다.
// bootstrap 은 이 파일을 shell 후보의 import 를 따라가(best-effort) logo/header 소유 증거로 읽는다.
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
