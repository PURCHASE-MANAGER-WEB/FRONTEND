import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mail, Lock, Eye, EyeOff, Truck, PackageCheck, ClipboardList, ShieldCheck, ArrowRight, Boxes } from 'lucide-react';
import { authApi, setSession, clearSession, getUser, isAuthenticated, APP_ROLE } from '../api/client';

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('loggedout') === '1') { clearSession(); return; }
    if (isAuthenticated() && getUser()?.role === APP_ROLE) navigate('/dashboard', { replace: true });
  }, [navigate]);

  const submit = async (e) => {
    e.preventDefault(); setError('');
    if (!email || !password) { setError('Please enter your email and password.'); return; }
    setLoading(true);
    try {
      const data = await authApi.login(APP_ROLE, email.trim(), password);
      if (data.user?.role && data.user.role !== APP_ROLE) { clearSession(); setError('This portal is for Purchase Managers only. Please use your own portal.'); return; }
      setSession(data.token, data.user);
      navigate('/dashboard', { replace: true });
    } catch (err) { setError(err.message || 'Invalid email or password.'); }
    finally { setLoading(false); }
  };

  const field = (icon, props, right) => (
    <div className="lg-field">{icon}<input {...props} />{right}</div>
  );

  return (
    <div className="lg">
      {/* ── Hero ── */}
      <aside className="lg-hero">
        <div className="lg-grid-bg" aria-hidden="true" />
        <div className="lg-glow" aria-hidden="true" />
        <Boxes className="lg-watermark" size={420} aria-hidden="true" strokeWidth={0.6} />

        <div className="lg-brand">
          <span className="lg-mark"><img src="/logo.png" alt="Tesco Structures" /></span>
          <div>
            <b>Tesco Structures</b>
            <span>Procurement</span>
          </div>
        </div>

        <div className="lg-hero-mid">
          <div className="lg-chip"><PackageCheck size={15} /> Purchase Manager Portal</div>
          <h1>Procurement,<br/>under control.</h1>
          <p>Register vendors, raise purchase orders, and track delivery &amp; payment progress — one precise ledger for the whole supply chain.</p>
          <div className="lg-feats">
            {[[Truck, 'Delivery tracking'], [ClipboardList, 'PO management'], [ShieldCheck, 'Vendor credit control']].map(([I, t], i) => (
              <div className="lg-feat" key={i} style={{ animationDelay: `${.25 + i * .08}s` }}><span><I size={16} /></span>{t}</div>
            ))}
          </div>
        </div>

        <div className="lg-foot">© {new Date().getFullYear()} Tesco Structures · Procurement</div>
      </aside>

      {/* ── Form ── */}
      <main className="lg-form">
        <div className="lg-form-inner">
          <div className="lg-mark lg-mark-sm"><img src="/logo.png" alt="Tesco Structures" /></div>
          <h2>Purchase Manager Login</h2>
          <p className="lg-lead">Sign in to the procurement portal.</p>
          {error && <div className="lg-alert err">{error}</div>}

          <form onSubmit={submit} noValidate>
            <label className="lg-label">Email</label>
            {field(<Mail size={17} className="lg-ic" />, { type: 'email', value: email, onChange: e => setEmail(e.target.value), placeholder: 'you@company.com', autoComplete: 'username' })}
            <label className="lg-label">Password</label>
            {field(<Lock size={17} className="lg-ic" />, { type: showPassword ? 'text' : 'password', value: password, onChange: e => setPassword(e.target.value), placeholder: '••••••••', autoComplete: 'current-password' },
              <button type="button" className="lg-eye" onClick={() => setShowPassword(s => !s)} aria-label="Toggle password">{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button>)}
            <button className="lg-cta" disabled={loading}>{loading ? 'Signing in…' : <>Sign in <ArrowRight size={17} /></>}</button>
          </form>

          <p className="lg-note">Forgot your password? Please <b>contact the Sales Head</b> to reset it.</p>
        </div>
      </main>

      <style>{`
        .lg{min-height:100vh;display:grid;grid-template-columns:1.05fr .95fr;
          background:
            linear-gradient(var(--grid) 1px,transparent 1px) 0 0/28px 28px,
            linear-gradient(90deg,var(--grid) 1px,transparent 1px) 0 0/28px 28px,
            var(--bg);}
        /* hero */
        .lg-hero{position:relative;overflow:hidden;background:linear-gradient(155deg,#0c1626 0%,#12243a 55%,#17304a 100%);color:#e9eef5;padding:60px 64px;display:flex;flex-direction:column;justify-content:space-between;gap:48px}
        .lg-grid-bg{position:absolute;inset:0;background:linear-gradient(rgba(255,255,255,.05) 1px,transparent 1px) 0 0/34px 34px,linear-gradient(90deg,rgba(255,255,255,.05) 1px,transparent 1px) 0 0/34px 34px;mask-image:radial-gradient(130% 90% at 20% 10%,#000 40%,transparent 90%)}
        .lg-glow{position:absolute;top:-180px;right:-140px;width:460px;height:460px;border-radius:50%;background:radial-gradient(circle,rgba(45,212,191,.42),transparent 62%);filter:blur(10px)}
        .lg-watermark{position:absolute;right:-70px;bottom:-60px;color:rgba(45,212,191,.12)}
        .lg-brand{position:relative;display:flex;align-items:center;gap:12px}
        .lg-mark{width:44px;height:44px;border-radius:12px;background:#fff;padding:7px;display:flex;align-items:center;justify-content:center;box-shadow:0 8px 20px -8px rgba(0,0,0,.5),0 0 0 1px rgba(45,212,191,.5) inset}
        .lg-mark img{width:100%;height:100%;object-fit:contain;display:block}
        .lg-brand b{font:700 16px var(--f-display);display:block;letter-spacing:.01em}
        .lg-brand span{font-size:10.5px;letter-spacing:.2em;text-transform:uppercase;color:#5eead4;opacity:.95}
        .lg-hero-mid{position:relative;max-width:480px;margin:auto 0}
        .lg-chip{display:inline-flex;align-items:center;gap:7px;background:rgba(45,212,191,.12);border:1px solid rgba(45,212,191,.4);color:#5eead4;padding:8px 14px;border-radius:999px;font-size:12px;font-weight:600;margin-bottom:26px;animation:lgUp .5s both}
        .lg-hero h1{font:700 48px/1.05 var(--f-display);margin:0 0 20px;letter-spacing:-.01em;animation:lgUp .5s .06s both}
        .lg-hero p{opacity:.78;font-size:16px;line-height:1.65;margin:0;max-width:430px;animation:lgUp .5s .12s both}
        .lg-feats{display:flex;flex-wrap:wrap;gap:12px;margin-top:34px}
        .lg-feat{display:flex;align-items:center;gap:9px;font-size:13.5px;color:#cdd8e6;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.08);padding:9px 13px;border-radius:10px;animation:lgUp .5s both}
        .lg-feat span{display:flex;color:#5eead4}
        .lg-foot{position:relative;font-size:11.5px;opacity:.5;letter-spacing:.02em}
        /* form */
        .lg-form{display:flex;align-items:center;justify-content:center;padding:56px 44px}
        .lg-form-inner{width:100%;max-width:400px;animation:lgUp .5s .1s both}
        .lg-mark-sm{display:none;margin-bottom:24px}
        .lg-form h2{font:700 27px var(--f-display);margin:0 0 7px;letter-spacing:-.005em}
        .lg-lead{color:var(--muted);font-size:15px;margin:0 0 32px}
        .lg-label{display:block;font-size:11.5px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;margin:0 0 8px}
        .lg-field{position:relative;margin-bottom:20px}
        .lg-field input{width:100%;padding:13px 44px;border-radius:11px;border:1px solid var(--line);background:var(--surface);color:var(--fg);font-size:14.5px;outline:none;transition:border-color .15s,box-shadow .15s}
        .lg-field input:focus{border-color:#14b8a6;box-shadow:0 0 0 3px rgba(45,212,191,.2)}
        .lg-ic{position:absolute;left:14px;top:50%;transform:translateY(-50%);color:var(--muted);pointer-events:none}
        .lg-eye{position:absolute;right:11px;top:50%;transform:translateY(-50%);background:none;border:0;cursor:pointer;color:var(--muted);display:flex}
        .lg-cta{width:100%;margin-top:10px;display:flex;align-items:center;justify-content:center;gap:9px;background:linear-gradient(180deg,#22405f,#13233b);color:#fff;border:none;border-radius:11px;padding:15px;font:700 14.5px var(--f-body);cursor:pointer;box-shadow:0 14px 30px -14px rgba(19,35,59,.9);transition:filter .15s,transform .05s}
        .lg-cta:hover{filter:brightness(1.1)} .lg-cta:active{transform:translateY(1px)} .lg-cta:disabled{opacity:.65;cursor:default}
        .lg-note{text-align:center;margin-top:22px;font-size:13.5px;color:var(--muted)}
        .lg-note b{color:var(--accent-ink);font-weight:700}
        .lg-alert{padding:11px 13px;border-radius:10px;font-size:13px;margin-bottom:16px}
        .lg-alert.err{background:var(--bad-bg);color:var(--bad)}
        @keyframes lgUp{from{opacity:0;transform:translateY(14px)}}
        @media (max-width:880px){.lg{grid-template-columns:1fr}.lg-hero{display:none}.lg-mark-sm{display:flex}}
      `}</style>
    </div>
  );
}
