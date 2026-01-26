import React, { useEffect, useState } from 'react';
import { Check, X } from 'lucide-react';
import { exchangeCodeForTokens } from '../lib/googleCalendar';

export default function OAuthCallback({ onSuccess, onError }) {
  const [status, setStatus] = useState('processing');

  useEffect(() => {
    handleCallback();
  }, []);

  const handleCallback = async () => {
    try {
      // Get the authorization code from URL
      const params = new URLSearchParams(window.location.search);
      const code = params.get('code');
      const error = params.get('error');

      if (error) {
        throw new Error(`OAuth error: ${error}`);
      }

      if (!code) {
        throw new Error('No authorization code received');
      }

      setStatus('exchanging');

      // Exchange code for tokens
      const tokens = await exchangeCodeForTokens(code);

      setStatus('success');

      // Call success callback with tokens
      if (onSuccess) {
        onSuccess(tokens);
      }
    } catch (error) {
      console.error('OAuth callback error:', error);
      setStatus('error');
      if (onError) {
        onError(error);
      }
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{ background: 'var(--canvas)', padding: 'var(--space-6)' }}
    >
      <div
        className="w-full max-w-md surface-raised text-center"
        style={{ padding: 'var(--space-8)' }}
      >
        {(status === 'processing' || status === 'exchanging') && (
          <>
            <div
              className="spinner mx-auto"
              style={{
                width: 40,
                height: 40,
                borderWidth: 3,
                borderTopColor: 'var(--accent)',
                marginBottom: 'var(--space-4)'
              }}
            />
            <h2
              style={{
                fontSize: 'var(--text-xl)',
                fontWeight: 600,
                color: 'var(--ink)',
                marginBottom: 'var(--space-2)'
              }}
            >
              {status === 'processing' ? 'Processing authorization...' : 'Connecting to Google Calendar...'}
            </h2>
            <p style={{ color: 'var(--ink-muted)', fontSize: 'var(--text-sm)' }}>
              {status === 'processing' ? 'Please wait' : 'Almost done'}
            </p>
          </>
        )}

        {status === 'success' && (
          <>
            <div
              className="icon-circle icon-circle-lg mx-auto"
              style={{
                background: 'var(--positive-subtle)',
                marginBottom: 'var(--space-4)'
              }}
            >
              <Check style={{ width: 28, height: 28, color: 'var(--positive)' }} />
            </div>
            <h2
              style={{
                fontSize: 'var(--text-xl)',
                fontWeight: 600,
                color: 'var(--ink)',
                marginBottom: 'var(--space-2)'
              }}
            >
              Successfully connected!
            </h2>
            <p style={{ color: 'var(--ink-muted)', fontSize: 'var(--text-sm)' }}>
              Redirecting...
            </p>
          </>
        )}

        {status === 'error' && (
          <>
            <div
              className="icon-circle icon-circle-lg mx-auto"
              style={{
                background: 'var(--negative-subtle)',
                marginBottom: 'var(--space-4)'
              }}
            >
              <X style={{ width: 28, height: 28, color: 'var(--negative)' }} />
            </div>
            <h2
              style={{
                fontSize: 'var(--text-xl)',
                fontWeight: 600,
                color: 'var(--ink)',
                marginBottom: 'var(--space-2)'
              }}
            >
              Connection failed
            </h2>
            <p style={{ color: 'var(--ink-muted)', fontSize: 'var(--text-sm)', marginBottom: 'var(--space-5)' }}>
              There was an error connecting to Google Calendar
            </p>
            <button
              onClick={() => window.location.href = '/'}
              className="btn btn-primary"
            >
              Go back
            </button>
          </>
        )}
      </div>
    </div>
  );
}
