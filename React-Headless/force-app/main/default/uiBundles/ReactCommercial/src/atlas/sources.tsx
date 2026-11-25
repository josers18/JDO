import { Banknote, BarChart3, Building2, MessageSquareText, Radar, ShieldCheck, Sparkles, UserRoundCheck, type LucideIcon } from 'lucide-react';

/** One icon and color per evidence provider, so every signal shows where it came from. */
const SOURCES: Record<string, { icon: LucideIcon; tone: string }> = {
  UserGems: { icon: UserRoundCheck, tone: '#7c3aed' },
  Demandbase: { icon: Radar, tone: '#0b6bcb' },
  Harmonic: { icon: Banknote, tone: '#0f8a5f' },
  Gong: { icon: MessageSquareText, tone: '#c2410c' },
  BoardEx: { icon: Building2, tone: '#334155' },
  'Moody’s': { icon: BarChart3, tone: '#1d4ed8' },
  'World-Check': { icon: ShieldCheck, tone: '#b91c1c' },
};
const fallback = { icon: Sparkles, tone: '#0e7c86' };
export const sourceStyle = (source: string) => SOURCES[source] ?? fallback;

export function SourceMark({ source, size = 18 }: { source: string; size?: number }) {
  const { icon: Icon, tone } = sourceStyle(source);
  return <span className="ca-source-mark" style={{ ['--src' as string]: tone }} aria-hidden="true"><Icon size={size} strokeWidth={2.2} /></span>;
}

/** Lead signal badges ("Champion joined from …", "Intent 94 · …", "Raised $48M …") carry their provider by prefix. */
export function signalSource(badge: string) {
  if (badge.startsWith('Champion')) return 'UserGems';
  if (badge.startsWith('Intent')) return 'Demandbase';
  if (badge.startsWith('Raised')) return 'Harmonic';
  return 'Data 360';
}

export function SignalChip({ badge, as: Tag = 'em' }: { badge: string; as?: 'em' | 'li' }) {
  const source = signalSource(badge);
  return <Tag className="ca-signal-chip" style={{ ['--src' as string]: sourceStyle(source).tone }}>
    <SourceMark source={source} size={14} /><span>{badge}</span><b>{source}</b>
  </Tag>;
}
