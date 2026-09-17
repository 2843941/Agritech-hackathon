import { useState } from 'react';
import { supabase } from '../supabaseClient';
import Icon from './Icon';

export default function AuthModal({ onAuthenticated }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const handleSignUp = async (e) => {
    e.preventDefault();
    setLoading(true);
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) setMessage(error.message);
    else {
      setMessage('Account created! Check your email for confirmation or sign in.');
      if (data.session) onAuthenticated(data.session.access_token);
    }
    setLoading(false);
  };

  const handleSignIn = async (e) => {
    e.preventDefault();
    setLoading(true);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setMessage(error.message);
    else {
      setMessage('Successfully logged in!');
      onAuthenticated(data.session.access_token);
    }
    setLoading(false);
  };

  const handleSubmit = (e) => {
    handleSignIn(e);
  };

  return (
    <div className="auth-shell">
      <section className="auth-intro">
        <div className="auth-intro-top">
          <span className="auth-mini-mark"><Icon name="leaf" size={18} /></span>
          <span>NURU FIELD ADVISER</span>
        </div>
        <div className="auth-intro-copy">
          <p className="auth-kicker">YOUR FIELD, IN FOCUS</p>
          <h1>Grow with a little more certainty.</h1>
          <p>Practical guidance for healthier crops, smarter watering, and better days in the field.</p>
        </div>
        <div className="auth-stats" aria-label="App benefits">
          <span><strong>01</strong> Local insight</span>
          <span><strong>02</strong> Simple decisions</span>
        </div>
      </section>

      <section className="auth-form-panel">
        <div className="auth-form-heading">
          <p className="auth-kicker">WELCOME BACK</p>
          <h2>Enter your field notes.</h2>
          <p>Sign in to continue your growing journey.</p>
        </div>
        <form className="auth-form" onSubmit={handleSubmit}>
          <label htmlFor="auth-email">Email address</label>
          <input id="auth-email" type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <label htmlFor="auth-password">Password</label>
          <input id="auth-password" type="password" placeholder="Enter your password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          <button className="auth-submit button button-dark" type="submit" disabled={loading}>
            {loading ? 'Working...' : 'Sign in'}
            {!loading && <Icon name="arrow" size={17} />}
          </button>
          <button className="auth-signup" type="button" onClick={handleSignUp} disabled={loading}>
            New here? <strong>Create an account</strong>
          </button>
        </form>
        {message && <p className="auth-message" role="status">{message}</p>}
      </section>
    </div>
  );
}