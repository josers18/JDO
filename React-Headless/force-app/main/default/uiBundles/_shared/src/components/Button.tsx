import type { ButtonHTMLAttributes, ReactNode } from 'react';
import clsx from 'clsx';

export type ButtonVariant = 'ai' | 'accent' | 'ghost';
export type ButtonSize = 'sm' | 'md';

/**
 * Shared action button carrying the command-center color language:
 *   · `accent` = "YOU act" (persona accent — CRM writes)
 *   · `ai`     = "AI acts" (violet→blue gradient — generate / recommend)
 *   · `ghost`  = secondary / cancel
 * Persona-agnostic: colors resolve from the active theme's tokens.
 */
export function Button({
  variant = 'ghost',
  size = 'md',
  className,
  children,
  ...rest
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children: ReactNode;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  const base =
    'inline-flex items-center justify-center gap-2 whitespace-nowrap border border-transparent font-semibold transition disabled:cursor-not-allowed disabled:opacity-60';
  const sizes: Record<ButtonSize, string> = {
    md: 'rounded-[11px] px-[15px] py-[9px] text-[12.5px]',
    sm: 'rounded-[9px] px-[11px] py-[6px] text-[11.5px]',
  };
  const variants: Record<ButtonVariant, string> = {
    ai: 'bg-gradient-ai text-white shadow-[0_6px_18px_rgba(124,108,255,0.32)] hover:brightness-110',
    accent: 'bg-accent text-white hover:brightness-110',
    ghost: 'border-line-strong text-muted hover:border-accent-border hover:text-fg',
  };
  return (
    <button type="button" className={clsx(base, sizes[size], variants[variant], className)} {...rest}>
      {children}
    </button>
  );
}
