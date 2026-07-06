// 통과 케이스 — AuthShell 경유, BrandLogo 직접 import 없음, copy 는 i18n 경유.
import { AuthShell } from './AuthShell';
import { t } from '../../lib/i18n';

export function LoginScreen() {
  return (
    <AuthShell>
      <h1>{t('auth.login.title')}</h1>
      <button type="submit">{t('auth.login.cta')}</button>
    </AuthShell>
  );
}
