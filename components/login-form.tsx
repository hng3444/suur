'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, LogIn } from 'lucide-react';
import { languages, normalizeLocale, translate } from '@/lib/i18n';
import type { Locale } from '@/lib/types';
import type { BrandingSettings } from '@/lib/types';
import { BrandMark } from '@/components/brand-mark';

export function LoginForm({ branding }: { branding: BrandingSettings }) {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [locale, setLocale] = useState<Locale>('tr');
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);

  useEffect(() => {
    const task = window.setTimeout(() => setLocale(normalizeLocale(window.localStorage.getItem('suur-locale') || navigator.language)), 0);
    return () => window.clearTimeout(task);
  }, []);

  useEffect(() => {
    window.localStorage.setItem('suur-locale', locale);
    document.cookie = `suur_locale=${locale}; Path=/; Max-Age=31536000; SameSite=Lax`;
    document.documentElement.lang = locale;
    document.documentElement.dir = languages.find((language) => language.value === locale)?.dir || 'ltr';
    document.title = `${translate(locale, 'page.login')} · ${branding.appName}`;
  }, [branding.appName, locale]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      await response.json();
      if (!response.ok) throw new Error(response.status === 401 ? t('login.invalid') : t('login.failed'));
      router.replace('/');
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('login.failed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="login-page">
      <section className="login-stage">
        <header className="login-header">
          <div className="login-brand"><BrandMark branding={branding} /><strong>{branding.appName}</strong></div>
          <select className="login-language" value={locale} aria-label="Language" onChange={(event) => setLocale(event.target.value as Locale)}>{languages.map((language) => <option key={language.value} value={language.value}>{language.label}</option>)}</select>
        </header>

        <section className="login-card">
          <div className="login-copy"><h1>{t('login.title')}</h1></div>
          <form onSubmit={submit}>
            <label>{t('login.username')}<input autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} required autoFocus /></label>
            <label>{t('login.password')}<span className="password-field"><input type={showPassword ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required /><button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? t('login.hidePassword') : t('login.showPassword')}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></span></label>
            {error && <p className="login-error" role="alert">{error}</p>}
            <button className="login-submit" disabled={loading}>{loading ? t('login.loading') : <>{t('login.action')} <LogIn size={18} /></>}</button>
          </form>
        </section>
      </section>
    </main>
  );
}
