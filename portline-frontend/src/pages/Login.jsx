import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useToast } from '../ui.jsx';
import { Brand, useTheme } from '../App.jsx';

export default function Login() {
  const { user, login } = useAuth();
  const toast = useToast();
  const nav = useNavigate();

  const [mode, setMode] = useState('login'); // 'login' | 'signup' | 'otp'
  const [f, setF] = useState({ email: '', password: '', full_name: '', otp: '' });
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [theme, toggle] = useTheme();

  if (user) return <Navigate to="/" replace />;

  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const run = (fn) => async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await fn();
    } catch (err) {
      toast(err.message, 'err');
    } finally {
      setBusy(false);
    }
  };

  const submit = run(async () => {
    if (mode === 'login') {
      try {
        await login(f.email, f.password);
        nav('/');
      } catch (err) {
        if (err.status === 403) {
          toast('Verify your email first. Enter the code we sent, or request a new one.', 'err');
          setMode('otp');
          return;
        }
        throw err;
      }
    } else if (mode === 'signup') {
      await api.signup({ email: f.email, password: f.password, full_name: f.full_name });
      toast('Account created. Enter the 6-digit code we emailed you.');
      setMode('otp');
    } else {
      await api.verifyOtp({ email: f.email, otp: f.otp });
      toast('Email verified. You can sign in now.');
      setMode('login');
    }
  });

  const T = {
    login: ['Welcome back', 'Sign in to your customs workspace.', 'Sign in'],
    signup: ['Create your account', 'We will email a verification code.', 'Create account'],
    otp: ['Verify your email', `Enter the 6-digit code sent to ${f.email}.`, 'Verify email'],
  }[mode];

  return (
    <div className="login">
      <header>
        <Brand />
        <button type="button" className="ghost" onClick={toggle}>
          {theme === 'dark' ? 'Light mode' : 'Dark mode'}
        </button>
      </header>

      <section className="hero">
        <h1>
          Move freight.<br />
          <span>Not paperwork.</span>
        </h1>
        <p>One workspace for customs documents: AI extraction, human verification, and export-ready filings.</p>
        <ul>
          <li>
            <b>Connected document intelligence</b>
            Invoice, packing list and bill of lading read together.
          </li>
          <li>
            <b>Compliance-first gatekeeping</b>
            Cross-checks and audited overrides before any export.
          </li>
          <li>
            <b>Operational clarity at scale</b>
            From document intake to customs filing.
          </li>
        </ul>
      </section>

      <form className="card" onSubmit={submit}>
        <h2>{T[0]}</h2>
        <p className="mut">{T[1]}</p>

        {mode === 'signup' && (
          <label>
            Full name
            <input
              required
              value={f.full_name}
              onChange={set('full_name')}
              placeholder="Documentation Executive"
            />
          </label>
        )}

        <label>
          Work email
          <input
            type="email"
            required
            disabled={mode === 'otp'}
            value={f.email}
            onChange={set('email')}
            placeholder="name@company.com"
            autoComplete="email"
          />
        </label>

        {mode !== 'otp' && (
          <label>
            Password
            <span className="pw">
              <input
                type={show ? 'text' : 'password'}
                required
                minLength={mode === 'signup' ? 8 : 1}
                value={f.password}
                onChange={set('password')}
                placeholder="Enter your password"
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              />
              <button
                type="button"
                className="icon"
                onClick={() => setShow(!show)}
                aria-label="Show password"
              >
                {show ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </span>
          </label>
        )}

        {mode === 'otp' && (
          <label>
            Verification code
            <input
              required
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              value={f.otp}
              onChange={set('otp')}
              placeholder="123456"
              className="mono"
            />
          </label>
        )}

        <button type="submit" className="primary wide" disabled={busy}>
          {busy ? 'Please wait…' : T[2]}
        </button>

        {mode === 'otp' && (
          <button
            type="button"
            className="ghost wide"
            onClick={run(async () => {
              await api.resendOtp(f.email);
              toast('If the address can be used, a new code was sent.');
            })}
          >
            Resend code
          </button>
        )}

        <p className="switch">
          {mode === 'login' ? (
            <>
              New to Portline? <a onClick={() => setMode('signup')}>Create an account</a>
            </>
          ) : (
            <>
              Already verified? <a onClick={() => setMode('login')}>Sign in</a>
            </>
          )}
          {mode === 'signup' && (
            <>
              {' · '}
              <a onClick={() => setMode('otp')}>I have a code</a>
            </>
          )}
        </p>
      </form>
    </div>
  );
}