// src/components/ThemeToggle.tsx
'use client';

import * as React from 'react';
import { Moon, Sun } from 'lucide-react';
import clsx from 'clsx';

const STORAGE_KEY = 'kce-theme';

type Theme = 'light' | 'dark';

function getInitialTheme(): Theme {
  if (typeof window === 'undefined') return 'light';
  const stored = window.localStorage.getItem(STORAGE_KEY) as Theme | null;
  if (stored === 'light' || stored === 'dark') return stored;
  const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
  return prefersDark ? 'dark' : 'light';
}

export default function ThemeToggle(props: { className?: string }) {
  const [theme, setTheme] = React.useState<Theme>('light');

  React.useEffect(() => {
    const t = getInitialTheme();
    setTheme(t);
    const root = document.documentElement;
    root.dataset.theme = t;
    root.classList.toggle('dark', t === 'dark');
  }, []);

  const toggle = () => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    window.localStorage.setItem(STORAGE_KEY, next);

    const root = document.documentElement;
    root.dataset.theme = next;
    root.classList.toggle('dark', next === 'dark');
  };

  const Icon = theme === 'dark' ? Sun : Moon;
  const label = theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro';

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={label}
      className={clsx(
        'inline-flex items-center justify-center',
        'h-10 w-10 rounded-full',
        'transition',
        'hover:bg-black/5 dark:hover:bg-[color:var(--color-surface)]/10',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue/40',
        props.className,
      )}
    >
      <Icon className="h-5 w-5" aria-hidden="true" />
    </button>
  );
}
