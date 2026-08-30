'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, LogIn } from 'lucide-react';

export function LoginForm() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

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
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Giriş yapılamadı.');
      router.replace('/');
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Giriş yapılamadı.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="login-page">
      <section className="login-card">
        <div className="login-brand"><span className="brand-logo" aria-hidden="true" /><strong>Suur</strong></div>
        <div className="login-copy"><span className="editor-kicker">HOŞ GELDİN</span><h1>Notlarına dön</h1><p>Devam etmek için Suur hesabınla giriş yap.</p></div>
        <form onSubmit={submit}>
          <label>Kullanıcı adı<input autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} required autoFocus /></label>
          <label>Şifre<span className="password-field"><input type={showPassword ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required /><button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? 'Şifreyi gizle' : 'Şifreyi göster'}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></span></label>
          {error && <p className="login-error" role="alert">{error}</p>}
          <button className="login-submit" disabled={loading}>{loading ? 'Giriş yapılıyor…' : <><LogIn size={18} /> Giriş yap</>}</button>
        </form>
        <p className="login-footnote">Notların yalnızca bu sunucuda saklanır.</p>
      </section>
    </main>
  );
}
