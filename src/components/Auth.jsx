import React, { useState } from 'react';
import { Mail } from 'lucide-react';
import { supabase } from '../lib/supabase';

export default function Auth() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();

    console.log('=== Auth Submit ===');
    console.log('isSignUp:', isSignUp);
    console.log('email:', email);

    if (!email.trim() || !password.trim()) {
      setError('Please enter both email and password');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    setLoading(true);
    setError('');

    try {
      if (isSignUp) {
        // Sign up
        console.log('Attempting sign up...');
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password: password.trim(),
        });

        console.log('Sign up response:', { data, error });
        if (error) throw error;

        // Auto sign in after sign up
        console.log('Auto signing in after sign up...');
        const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password: password.trim(),
        });

        console.log('Sign in response:', { signInData, signInError });
        if (signInError) throw signInError;

        console.log('Sign up and sign in successful!');
      } else {
        // Sign in
        console.log('Attempting sign in...');
        const { data, error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password: password.trim(),
        });

        console.log('Sign in response:', { data, error });
        if (error) throw error;

        console.log('Sign in successful!');
      }

      // Reload page to trigger account initialization
      console.log('Reloading page to initialize account...');
      window.location.reload();
    } catch (error) {
      console.error('Auth error:', error);
      setError(error.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center p-6"
      style={{ background: 'var(--canvas)' }}
    >
      <div
        className="w-full max-w-md surface-raised"
        style={{ padding: 'var(--space-8)' }}
      >
        {/* Header */}
        <div className="text-center" style={{ marginBottom: 'var(--space-8)' }}>
          <div
            className="icon-circle icon-circle-lg mx-auto"
            style={{
              background: 'var(--accent-subtle)',
              marginBottom: 'var(--space-4)'
            }}
          >
            <Mail
              style={{
                width: 24,
                height: 24,
                color: 'var(--accent)'
              }}
            />
          </div>
          <h1
            style={{
              fontSize: 'var(--text-2xl)',
              fontWeight: 600,
              color: 'var(--ink)',
              marginBottom: 'var(--space-2)',
              letterSpacing: '-0.02em'
            }}
          >
            {isSignUp ? 'Create Account' : 'Welcome Back'}
          </h1>
          <p style={{ color: 'var(--ink-muted)', fontSize: 'var(--text-sm)' }}>
            {isSignUp ? 'Sign up for Family Schedule Assistant' : 'Sign in to your account'}
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 'var(--space-4)' }}>
            <label
              htmlFor="email"
              style={{
                display: 'block',
                fontSize: 'var(--text-sm)',
                fontWeight: 500,
                color: 'var(--ink)',
                marginBottom: 'var(--space-2)'
              }}
            >
              Email address
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="input"
              disabled={loading}
            />
          </div>

          <div style={{ marginBottom: 'var(--space-5)' }}>
            <label
              htmlFor="password"
              style={{
                display: 'block',
                fontSize: 'var(--text-sm)',
                fontWeight: 500,
                color: 'var(--ink)',
                marginBottom: 'var(--space-2)'
              }}
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="input"
              disabled={loading}
            />
          </div>

          {error && (
            <div
              className="info-box info-box-negative"
              style={{
                marginBottom: 'var(--space-4)',
                fontSize: 'var(--text-sm)'
              }}
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="btn btn-primary"
            style={{
              width: '100%',
              padding: 'var(--space-3) var(--space-5)',
              fontSize: 'var(--text-base)',
              fontWeight: 500
            }}
          >
            {loading ? (
              <>
                <span className="spinner" style={{ borderTopColor: 'white' }} />
                {isSignUp ? 'Creating account...' : 'Signing in...'}
              </>
            ) : (
              isSignUp ? 'Sign Up' : 'Sign In'
            )}
          </button>
        </form>

        {/* Toggle */}
        <div className="text-center" style={{ marginTop: 'var(--space-6)' }}>
          <button
            onClick={() => {
              setIsSignUp(!isSignUp);
              setError('');
            }}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--accent)',
              fontSize: 'var(--text-sm)',
              fontWeight: 500,
              cursor: 'pointer'
            }}
          >
            {isSignUp ? 'Already have an account? Sign in' : "Don't have an account? Sign up"}
          </button>
        </div>
      </div>
    </div>
  );
}
