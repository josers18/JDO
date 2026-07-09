import {
  Home, Users, BarChart3, CheckCircle2, Bell, Phone, Handshake, ListChecks,
  Calendar, ArrowRight, Sparkles, Search, House, Baby, Briefcase, PalmtreeIcon,
  HeartHandshake, Circle, type LucideIcon,
} from 'lucide-react';

export type IconKey =
  | 'home' | 'clients' | 'pipeline' | 'tasks' | 'alerts'
  | 'call' | 'meeting' | 'task' | 'event'
  | 'arrow' | 'sparkle' | 'search'
  | 'homePurchase' | 'newChild' | 'jobChange' | 'retirement' | 'marriage';

const MAP: Record<IconKey, LucideIcon> = {
  home: Home, clients: Users, pipeline: BarChart3, tasks: CheckCircle2, alerts: Bell,
  call: Phone, meeting: Handshake, task: ListChecks, event: Calendar,
  arrow: ArrowRight, sparkle: Sparkles, search: Search,
  homePurchase: House, newChild: Baby, jobChange: Briefcase,
  retirement: PalmtreeIcon, marriage: HeartHandshake,
};

export function Icon({ name, size = 18, className }: { name: IconKey; size?: number; className?: string }) {
  const Cmp = MAP[name] ?? Circle;
  return <Cmp size={size} className={className} aria-hidden="true" />;
}
