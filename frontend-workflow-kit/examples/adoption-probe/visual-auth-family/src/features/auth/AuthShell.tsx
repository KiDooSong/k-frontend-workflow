// auth family 의 layout/shell owner 후보 — BrandLogo 배치는 shell 이 소유한다.
// adoption-probe --visual 이 scratch copy 에서 bootstrap 을 돌릴 때 shell 후보 증거로 읽힌다.
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
