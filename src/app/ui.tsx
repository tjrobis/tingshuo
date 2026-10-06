// Shared UI primitives. Tailwind only; dark mode follows the system setting.
import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react';
import { speak } from '../lib/audio';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'good' | 'bad' };
const VARIANTS = {
  primary: 'bg-indigo-600 text-white hover:bg-indigo-500 active:bg-indigo-700',
  secondary: 'bg-slate-100 text-slate-900 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700',
  ghost: 'text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100',
  good: 'bg-emerald-600 text-white hover:bg-emerald-500',
  bad: 'bg-rose-600 text-white hover:bg-rose-500',
};

export function Button({ variant = 'primary', className = '', ...props }: ButtonProps) {
  return (
    <button
      type="button"
      {...props}
      className={`rounded-2xl px-5 py-3 font-medium transition select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 disabled:cursor-not-allowed disabled:opacity-40 ${VARIANTS[variant]} ${className}`}
    />
  );
}

export const Card = ({ className = '', ...props }: HTMLAttributes<HTMLDivElement>) => (
  <div {...props} className={`rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800 ${className}`} />
);

export const Label = ({ children }: { children: ReactNode }) => (
  <div className="text-xs font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400">{children}</div>
);

export function Chip({ active, children, onClick }: { active: boolean; children: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`rounded-full px-4 py-2 text-sm font-medium ring-1 transition ${
        active ? 'bg-indigo-600 text-white ring-indigo-600' : 'bg-white text-slate-700 ring-slate-300 hover:ring-slate-400 dark:bg-slate-900 dark:text-slate-200 dark:ring-slate-700'
      }`}
    >
      {children}
    </button>
  );
}

const SpeakerIcon = () => (
  <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M11 5 6 9H2v6h4l5 4V5z" />
    <path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14" />
  </svg>
);

/** Plays Chinese text at the learner's speed. `slow` offers a 0.6× button next to it. */
export function Speak({ text, slow = false, onPlay, voice }: { text: string; slow?: boolean; onPlay?: (slow: boolean) => void; voice?: number }) {
  const play = (isSlow: boolean) => {
    onPlay?.(isSlow);
    void speak(text, isSlow ? { rate: 0.6, voice } : { voice });
  };
  return (
    <span className="inline-flex gap-1">
      <button type="button" aria-label="Play audio" onClick={() => play(false)} className="rounded-full p-2 text-indigo-600 hover:bg-indigo-50 dark:text-indigo-400 dark:hover:bg-slate-800">
        <SpeakerIcon />
      </button>
      {slow && (
        <button type="button" aria-label="Play slowly" onClick={() => play(true)} className="rounded-full px-2 text-sm text-indigo-600 hover:bg-indigo-50 dark:text-indigo-400 dark:hover:bg-slate-800">
          0.6×
        </button>
      )}
    </span>
  );
}

export const Bar = ({ value, className = 'bg-indigo-500' }: { value: number; className?: string }) => (
  <div className="h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
    <div className={`h-full rounded-full transition-all ${className}`} style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }} />
  </div>
);

export const Screen = ({ children }: { children: ReactNode }) => (
  <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col gap-4 px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
    {children}
  </main>
);
