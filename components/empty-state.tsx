import { Globe2 } from 'lucide-react';

export function Empty({ icon: Icon = Globe2, title, description }: {
  icon?: typeof Globe2; title: string; description: string;
}) {
  return <div className="empty-state"><Icon size={36} strokeWidth={1.3} /><h3>{title}</h3><p>{description}</p></div>;
}
