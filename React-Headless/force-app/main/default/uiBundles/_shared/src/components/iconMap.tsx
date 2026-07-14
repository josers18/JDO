import {
  Home, Users, BarChart3, CheckCircle2, Bell, Phone, Handshake, ListChecks,
  Calendar, ArrowRight, Sparkles, Search, House, Baby, Briefcase, PalmtreeIcon,
  HeartHandshake, Circle, Activity, CalendarHeart, UserPlus, TrendingUp, Wand2,
  Mail, GraduationCap, type LucideIcon,
} from 'lucide-react';

export type IconKey =
  | 'home' | 'clients' | 'pipeline' | 'tasks' | 'alerts'
  | 'call' | 'meeting' | 'task' | 'event' | 'email'
  | 'arrow' | 'sparkle' | 'search' | 'wand'
  | 'metrics' | 'lifeEvent' | 'leads' | 'pulse' | 'graduation'
  | 'homePurchase' | 'newChild' | 'jobChange' | 'retirement' | 'marriage';

const MAP: Record<IconKey, LucideIcon> = {
  home: Home, clients: Users, pipeline: BarChart3, tasks: CheckCircle2, alerts: Bell,
  call: Phone, meeting: Handshake, task: ListChecks, event: Calendar, email: Mail,
  arrow: ArrowRight, sparkle: Sparkles, search: Search, wand: Wand2,
  metrics: Activity, lifeEvent: CalendarHeart, leads: UserPlus, pulse: TrendingUp,
  graduation: GraduationCap,
  homePurchase: House, newChild: Baby, jobChange: Briefcase,
  retirement: PalmtreeIcon, marriage: HeartHandshake,
};

export function Icon({ name, size = 18, className }: { name: IconKey; size?: number; className?: string }) {
  const Cmp = MAP[name] ?? Circle;
  return <Cmp size={size} className={className} aria-hidden="true" />;
}
