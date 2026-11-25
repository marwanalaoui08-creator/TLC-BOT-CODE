import { useState } from 'react';
import { Shield } from 'lucide-react';

interface ClubBadgeProps {
  src?: string | null;
  name: string;
  size?: 'sm' | 'md' | 'lg';
}

export function ClubBadge({ src, name, size = 'md' }: ClubBadgeProps) {
  const [errored, setErrored] = useState(false);

  const dims =
    size === 'sm' ? 'w-7 h-7 text-[10px]' : size === 'lg' ? 'w-14 h-14 text-base' : 'w-9 h-9 text-xs';

  if (!src || errored) {
    return (
      <div
        className={`${dims} rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-600 font-semibold shrink-0`}
        title={name}
      >
        <Shield className="w-4 h-4 text-slate-400" />
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={`${name} crest`}
      referrerPolicy="no-referrer"
      onError={() => setErrored(true)}
      className={`${dims} rounded-lg object-cover border border-slate-200 shrink-0 bg-slate-100`}
    />
  );
}
