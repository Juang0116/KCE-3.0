// src/components/Header.tsx
'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import clsx from 'clsx';
import * as React from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';

import OpenChatButton from '@/features/ai/OpenChatButton';
import { Button } from '@/components/ui/Button';
import ThemeToggle from '@/components/ThemeToggle';

const NAV_LINKS: Array<{ href: string; label: string; show?: boolean }> = [
  { href: '/', label: 'Inicio', show: true },
  { href: '/tours', label: 'Tours', show: true },
  { href: '/review-demo', label: 'Reseñas (demo)', show: process.env.NODE_ENV !== 'production' },
];

function useScrolled(threshold = 4) {
  const [scrolled, setScrolled] = React.useState(false);
  React.useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > threshold);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [threshold]);
  return scrolled;
}

function MobileMenuPortal({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  // Lock scroll cuando esté abierto
  React.useEffect(() => {
    if (!open || typeof document === 'undefined') return;
    const { style } = document.documentElement;
    const prev = style.overflow;
    style.overflow = 'hidden';
    return () => {
      style.overflow = prev;
    };
  }, [open]);

  // Cerrar con Escape
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[var(--z-modal)] md:hidden">
          {/* Overlay */}
          <motion.button
            type="button"
            aria-label="Cerrar menú"
            className="absolute inset-0 bg-[var(--overlay-strong)]/40"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: { duration: 0.18 } }}
            exit={{ opacity: 0, transition: { duration: 0.14 } }}
          />
          {/* Panel */}
          <motion.div
            id="mobile-menu"
            role="dialog"
            aria-modal="true"
            aria-label="Menú móvil"
            className="absolute inset-x-0 top-[var(--header-h)] mx-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3 shadow-pop"
            initial={{ y: -16, opacity: 0.98 }}
            animate={{ y: 0, opacity: 1, transition: { duration: 0.22, ease: [0.16, 1, 0.3, 1] } }}
            exit={{ y: -10, opacity: 0.98, transition: { duration: 0.16 } }}
          >
            {children}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

export default function Header(): React.JSX.Element {
  const pathname = usePathname() || '/';
  const [open, setOpen] = React.useState(false);
  const scrolled = useScrolled(4);

  const isActive = (href: string) => (href === '/' ? pathname === '/' : pathname.startsWith(href));

  // Cierra el menú al navegar
  React.useEffect(() => setOpen(false), [pathname]);

  return (
    <header
      className={clsx(
        'sticky top-0 z-[var(--z-header)] border-b border-[var(--color-border)]',
        'bg-[var(--color-bg)]/70 backdrop-blur-md transition-shadow',
        scrolled ? 'shadow-[0_6px_24px_rgba(2,6,23,.08)]' : 'shadow-none',
      )}
    >
      <div className="mx-auto flex h-[var(--header-h)] max-w-6xl items-center justify-between px-4">
        {/* Marca */}
        <Link
          href="/"
          aria-label="KCE — Ir al inicio"
          className="group flex items-center gap-2 no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue/40 focus-visible:ring-offset-2"
        >
          <Image
            src="/brand/logo.png"
            alt="KCE"
            width={28}
            height={28}
            priority
            className="h-7 w-7 rounded-lg object-contain"
          />
          <span className="font-heading text-lg text-brand-blue group-hover:opacity-90 sm:text-xl">
            Knowing Cultures Enterprise
          </span>
        </Link>

        {/* Desktop nav + CTA */}
        <div className="hidden items-center gap-3 md:flex">
          <nav aria-label="Principal">
            <ul className="flex items-center gap-2">
              {NAV_LINKS.filter((l) => l.show).map((l) => {
                const active = isActive(l.href);
                return (
                  <li key={l.href}>
                    <Link
                      href={l.href}
                      aria-current={active ? 'page' : undefined}
                      className={clsx(
                        'rounded-full px-3 py-2 text-sm no-underline transition',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue/40',
                        active ? 'bg-black/10 dark:bg-[color:var(--color-surface)]/10 text-[color:var(--color-text)]' : 'hover:bg-black/5 dark:hover:bg-[color:var(--color-surface)]/10 text-[color:var(--color-text)]/90',
                      )}
                    >
                      {l.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>

          <ThemeToggle />

          <Button asChild variant="secondary" size="sm">
            <OpenChatButton addQueryParam>Habla con IA</OpenChatButton>
          </Button>
        </div>

        {/* Botón hamburguesa (Mobile) */}
        <button
          type="button"
          className={clsx(
            'md:hidden inline-flex items-center justify-center',
            'h-10 w-10 rounded-full',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue/40',
            'hover:bg-black/5',
          )}
          aria-label={open ? 'Cerrar menú' : 'Abrir menú'}
          aria-expanded={open}
          aria-controls="mobile-menu"
          onClick={() => setOpen((v) => !v)}
          data-state={open ? 'open' : 'closed'}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
            <path
              d={open ? 'M6 18L18 6M6 6l12 12' : 'M3 6h18M3 12h18M3 18h18'}
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
          <span className="sr-only">{open ? 'Cerrar menú' : 'Abrir menú'}</span>
        </button>
      </div>

      {/* Menú móvil */}
      <MobileMenuPortal open={open} onClose={() => setOpen(false)}>
        <nav>
          <ul className="divide-y divide-[var(--color-border)]">
            {NAV_LINKS.filter((l) => l.show).map((l) => {
              const active = isActive(l.href);
              return (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    className={clsx(
                      'block rounded-xl px-3 py-3 no-underline transition',
                      active ? 'bg-black/10 text-[color:var(--color-text)]' : 'hover:bg-black/5 text-[color:var(--color-text)]',
                    )}
                    onClick={() => setOpen(false)}
                  >
                    {l.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="mt-3">
          <Button asChild variant="secondary" block>
            <OpenChatButton addQueryParam>Habla con IA</OpenChatButton>
          </Button>
        </div>
      </MobileMenuPortal>
    </header>
  );
}
