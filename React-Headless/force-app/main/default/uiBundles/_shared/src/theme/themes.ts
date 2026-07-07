/**
 * Persona theme presets — the "signature identity per line of business" from
 * the Cumulus brand system: Retail teal, Commercial copper, Wealth gold.
 * Each persona cockpit selects its theme via <ThemeProvider persona="...">.
 */
export type PersonaKey = 'retail' | 'commercial' | 'wealth';

export interface PersonaTheme {
  key: PersonaKey;
  label: string;
  tagline: string;
  /** Primary accent (buttons, active states, sparkline strokes). */
  accent: string;
  /** Lighter accent for highlights / gauge tracks. */
  accentSoft: string;
  /** Signature hero gradient. */
  gradient: string;
  /** Ambient radial glow behind the hero, persona-tinted. */
  glow: string;
}

export const PERSONA_THEMES: Record<PersonaKey, PersonaTheme> = {
  retail: {
    key: 'retail',
    label: 'Retail Banking',
    tagline: 'Daily Book',
    accent: '#14b8a6', // teal-500
    accentSoft: '#5eead4', // teal-300
    gradient: 'linear-gradient(120deg, #0d9488 0%, #0f766e 55%, #115e59 100%)',
    glow: 'radial-gradient(60% 120% at 15% 0%, rgba(20,184,166,0.35) 0%, rgba(20,184,166,0) 60%)',
  },
  commercial: {
    key: 'commercial',
    label: 'Commercial Banking',
    tagline: 'Relationship Command',
    accent: '#d97706', // copper / amber-600
    accentSoft: '#fbbf24', // amber-400
    gradient: 'linear-gradient(120deg, #b45309 0%, #92400e 55%, #7c2d12 100%)',
    glow: 'radial-gradient(60% 120% at 15% 0%, rgba(217,119,6,0.35) 0%, rgba(217,119,6,0) 60%)',
  },
  wealth: {
    key: 'wealth',
    label: 'Wealth Management',
    tagline: 'Advisory Desk',
    accent: '#d4af37', // gold
    accentSoft: '#fde047', // yellow-300
    gradient: 'linear-gradient(120deg, #ca8a04 0%, #a16207 55%, #854d0e 100%)',
    glow: 'radial-gradient(60% 120% at 15% 0%, rgba(212,175,55,0.35) 0%, rgba(212,175,55,0) 60%)',
  },
};
