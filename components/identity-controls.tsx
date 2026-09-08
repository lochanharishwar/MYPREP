'use client';
import { useState } from 'react';
import { useWorkspace } from './workspace-provider';
export function IdentityControls() {
  const w = useWorkspace();
  const [domain, setDomain] = useState(''),
    [factor, setFactor] = useState(''),
    [code, setCode] = useState(''),
    [uri, setUri] = useState('');
  const run = async (fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (e) {
      w.setNotice((e as Error).message);
    }
  };
  return (
    <details className="spaced field">
      <summary>Enterprise sign-in & authenticator</summary>
      {!w.session ? (
        <div className="field">
          <label>
            Organization domain
            <input
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              placeholder="company.com"
            />
          </label>
          <button
            className="secondary-btn"
            disabled={!w.client || !domain}
            onClick={() =>
              void run(async () => {
                const { data, error } = await w.client!.auth.signInWithSSO({
                  domain,
                  options: { redirectTo: location.origin },
                });
                if (error) throw error;
                if (data?.url) location.assign(data.url);
              })
            }
          >
            Continue with enterprise SSO
          </button>
          <p className="muted small">
            Your organization’s SAML connection must be configured in Supabase.
          </p>
        </div>
      ) : (
        <div className="field">
          <button
            className="secondary-btn"
            onClick={() =>
              void run(async () => {
                const { data, error } = await w.client!.auth.mfa.listFactors();
                if (error) throw error;
                const existing = data.totp.find((f) => f.status === 'verified');
                if (existing) {
                  setFactor(existing.id);
                  w.setNotice('Enter a code from your existing authenticator.');
                  return;
                }
                const enrollment = await w.client!.auth.mfa.enroll({
                  factorType: 'totp',
                  friendlyName: 'BrandCurrent',
                });
                if (enrollment.error) throw enrollment.error;
                setFactor(enrollment.data.id);
                setUri(enrollment.data.totp.uri);
              })
            }
          >
            Set up or verify authenticator
          </button>
          {uri && (
            <label>
              Authenticator setup URI · keep private
              <input readOnly value={uri} />
            </label>
          )}
          {factor && (
            <>
              <label>
                Six-digit authenticator code
                <input
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  maxLength={6}
                />
              </label>
              <button
                className="primary-btn"
                disabled={!/^\d{6}$/.test(code)}
                onClick={() =>
                  void run(async () => {
                    const { error } =
                      await w.client!.auth.mfa.challengeAndVerify({
                        factorId: factor,
                        code,
                      });
                    if (error) throw error;
                    setUri('');
                    setCode('');
                    w.setNotice('Authenticator verified.');
                    await w.refresh();
                  })
                }
              >
                Verify MFA
              </button>
            </>
          )}
        </div>
      )}
    </details>
  );
}
