 'use client';
import Link from 'next/link';
import { useWorkspace } from './workspace-provider';
import { campaignProgress } from '@/lib/campaign-progress';
export function CampaignProgress() {
 const w = useWorkspace();
 if (!w.brandId) return null;
 const steps = campaignProgress(['dna','content','schedule','metrics'].flatMap(kind => w.records<unknown>(kind)), w.brandId);
 return <section className="panel journey-panel" aria-label="Brand workflow progress"><div className="section-title"><strong>Your next step · {w.brand?.name}</strong><span className="small muted">Loaded records · this brand</span></div><ol className="journey-steps">{steps.map((step,i) => <li key={step.label}><Link href={step.href}><span className="eyebrow">{i+1} / {step.count > 0 ? 'AVAILABLE' : 'NEXT'}</span><strong>{step.label}</strong><span className="small muted">{step.count} recorded</span></Link></li>)}</ol><p className="small muted">Draft locally without signing in. Automatic publishing and metrics require connected accounts and the secure server workspace.</p></section>;
}
