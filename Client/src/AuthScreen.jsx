import { useState } from 'react';
import { PackageCheck, Zap, X } from 'lucide-react';
import { api, jsonBody, setAuthToken } from './api.js';

export default function AuthScreen({ dbStatus, onSuccess, initialError, clearInitialError }) {
  const [mode, setMode] = useState('login'); // 'login' | 'register'
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState(initialError || '');

  async function handleSubmit(e) {
    e.preventDefault();
    setFormError('');
    if (clearInitialError) clearInitialError();
    setSubmitting(true);

    try {
      const endpoint = mode === 'login' ? '/api/auth/login' : '/api/auth/register';
      const payload = mode === 'login' ? { email, password } : { name, email, password };
      const data = await api(endpoint, {
        method: 'POST',
        body: jsonBody(payload)
      });
      setAuthToken(data.token);
      onSuccess(data.user);
    } catch (err) {
      setFormError(err.message || 'Authentication failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  function fillDemo() {
    setEmail('demo@keepwise.local');
    setPassword('demo123456');
    setMode('login');
    setFormError('');
  }

  return (
    <div className="auth-wrapper">
      <div className="auth-bg-decor" />
      <div className="auth-card">
        <div className="auth-brand">
          <div className="brand-mark"><PackageCheck size={20} /></div>
          <span className="brand-word">keepwise</span>
          <span className="brand-dot">.</span>
        </div>
        <p className="auth-tagline">Care for what you own · Household inventory & warranty tracker</p>

        <div className="auth-tabs" role="tablist">
          <button
            type="button"
            className={`auth-tab ${mode === 'login' ? 'active' : ''}`}
            onClick={() => { setMode('login'); setFormError(''); }}
            role="tab"
            aria-selected={mode === 'login'}
          >
            Sign in
          </button>
          <button
            type="button"
            className={`auth-tab ${mode === 'register' ? 'active' : ''}`}
            onClick={() => { setMode('register'); setFormError(''); }}
            role="tab"
            aria-selected={mode === 'register'}
          >
            Create account
          </button>
        </div>

        {formError && (
          <div className="error-banner" style={{ margin: '0 0 16px' }}>
            <span><Zap size={14} /> {formError}</span>
            <button aria-label="Dismiss" className="error-close" onClick={() => setFormError('')}><X size={14} /></button>
          </div>
        )}

        <form className="auth-form" onSubmit={handleSubmit}>
          {mode === 'register' && (
            <label className="form-field">
              <span>Your name<b> *</b></span>
              <input
                type="text"
                required
                maxLength={80}
                placeholder="e.g. Alex Sharma"
                value={name}
                onChange={e => setName(e.target.value)}
                disabled={submitting}
              />
            </label>
          )}

          <label className="form-field">
            <span>Email address<b> *</b></span>
            <input
              type="email"
              required
              placeholder="alex@example.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              disabled={submitting}
            />
          </label>

          <label className="form-field">
            <span>Password<b> *</b></span>
            <input
              type="password"
              required
              minLength={6}
              placeholder={mode === 'register' ? 'At least 6 characters' : 'Enter your password'}
              value={password}
              onChange={e => setPassword(e.target.value)}
              disabled={submitting}
            />
          </label>

          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? 'Please wait...' : mode === 'login' ? 'Sign in to Keepwise' : 'Create Keepwise account'}
          </button>
        </form>

        <div className="auth-help-tip">
          {mode === 'login' ? (
            <span>
              Exploring sample items? Use <button type="button" onClick={fillDemo} style={{ background: 'none', border: 0, padding: 0, textDecoration: 'underline', color: '#2f6e47', fontWeight: 700, cursor: 'pointer' }}>Demo login</button> (<code>demo@keepwise.local</code> / <code>demo123456</code>).
            </span>
          ) : (
            <span>Passwords are hashed with bcrypt. Each household account is isolated.</span>
          )}
        </div>

        <div className="auth-pill-row">
          <div className={`db-pill ${dbStatus === 'connected' ? 'db-good' : ''}`}>
            <i />
            {dbStatus === 'connected' ? 'MongoDB connected' : dbStatus === 'offline' ? 'API offline' : 'Checking database connection'}
          </div>
        </div>
      </div>
    </div>
  );
}
