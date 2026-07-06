// shell 사용 케이스 1 — AuthShell 경유, BrandLogo 직접 import 없음, copy 는 i18n 경유,
// Button 하단 CTA 패턴 (shared-bottom-cta 후보 증거).
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
