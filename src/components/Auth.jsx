import React, { useState } from 'react';
import { Mail, Lock } from 'lucide-react';
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
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Mail className="w-8 h-8 text-blue-600" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            {isSignUp ? 'Create Account' : 'Welcome Back!'}
          </h1>
          <p className="text-gray-600">
            {isSignUp ? 'Sign up for Family Schedule Assistant' : 'Sign in to your account'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
              Email address
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none"
              disabled={loading}
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none"
              disabled={loading}
            />
          </div>

          {error && (
            <div className="bg-red-50 border-2 border-red-200 rounded-lg p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                {isSignUp ? 'Creating account...' : 'Signing in...'}
              </>
            ) : (
              <>
                {isSignUp ? 'Sign Up' : 'Sign In'}
              </>
            )}
          </button>
        </form>

        <div className="mt-6 text-center">
          <button
            onClick={() => {
              setIsSignUp(!isSignUp);
              setError('');
            }}
            className="text-blue-600 hover:text-blue-700 text-sm font-medium"
          >
            {isSignUp ? 'Already have an account? Sign in' : "Don't have an account? Sign up"}
          </button>
        </div>
      </div>
    </div>
  );
}
