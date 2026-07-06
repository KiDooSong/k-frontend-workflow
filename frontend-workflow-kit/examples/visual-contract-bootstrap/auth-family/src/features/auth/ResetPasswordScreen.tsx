// shell 사용 케이스 2 — AuthShell 경유, Button 하단 CTA 패턴 반복 (3/3 화면).
import { AuthShell } from './AuthShell';
import { Button } from '../../components/ui/Button';
import { t } from '../../lib/i18n';

export function ResetPasswordScreen() {
  return (
    <AuthShell>
      <h1>{t('auth.reset.title')}</h1>
      <footer>
        <Button>{t('auth.reset.cta')}</Button>
      </footer>
    </AuthShell>
  );
}
