'use client';
import { useWorkspace } from './workspace-provider';
export function ActivationNotice({
  feature,
}: {
  feature: 'generation' | 'publishing' | 'analytics' | 'insights';
}) {
  const w = useWorkspace();
  if (!w.localMode) return null;
  const generationService = w.state.services.find(
    (service) => service.name === 'Generation & review',
  );
  const text = {
    generation:
      'Local image and text creation use conservative built-in reservations for the default Gemini models. Set your monthly and campaign limits, then keep this tab open until the run finishes. Custom models need explicit cost estimates. Video requires the server media workflow.',
    publishing:
      'Unattended posting requires the server workspace, a running Inngest worker, and an authorized social account. Local browser storage cannot publish after this tab closes. Once those services are configured, connect an account, approve a version, and select its date and time.',
    analytics:
      'No social accounts are connected to this browser workspace. Analytics become available after server setup and confirmed publication, when the platform supplies observations.',
    insights:
      'Customer tracking, imports and attribution require the server workspace. Connect verified purchase events and advertising spend to calculate revenue, CAC and ROAS.',
  }[feature];
  if (feature === 'generation')
    return (
      <details className="studio-setup">
        <summary>
          {generationService?.ready
            ? 'Generation settings'
            : 'Generation provider needs setup'}{' '}
          <span className="muted small">Provider and spending limits</span>
        </summary>
        {generationService?.ready && (
          <p className="muted small">{generationService.detail}</p>
        )}
        <p className="muted small">{text}</p>
        <button
          type="button"
          className="text-link small spaced"
          onClick={() => w.setSettings(true)}
        >
          Check setup and spending limits
        </button>
      </details>
    );
  return (
    <aside className="notice" role="note">
      <p>{text}</p>
      <button className="text-link spaced" onClick={() => w.setSettings(true)}>
        Check setup and spending limits
      </button>
    </aside>
  );
}
