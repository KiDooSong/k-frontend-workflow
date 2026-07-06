// 정상 케이스 — AuthShell 경유, BrandLogo 직접 import 없음, copy 는 i18n 경유, 하단 CTA.
import { AuthShell } from './AuthShell';
import { Button } from '../../components/ui/Button';
import { t } from '../../lib/i18n';

export function LoginScreen() {
  return (
    <AuthShell>
      <h1>{t('auth.login.title')}</h1>
      <footer>
        <Button>{t('auth.login.cta')}</Button>
      </footer>
    </AuthShell>
  );
}
