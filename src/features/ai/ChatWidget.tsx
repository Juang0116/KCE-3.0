// src/features/ai/ChatWidget.tsx
'use client';

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { MessageCircle, Loader2, X, Trash2, Square } from 'lucide-react';
import * as React from 'react';
import { createPortal } from 'react-dom';

type Role = 'user' | 'assistant';
type Msg = { id: string; role: Role; content: string; ts: number };

const STORAGE_KEY = 'kce.chat.v1';

function uid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function loadMessages(): Msg[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as Msg[];
    return Array.isArray(arr) ? arr.slice(-100) : [];
  } catch {
    return [];
  }
}

function saveMessages(messages: Msg[]) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-100)));
  } catch {
    /* ignore */
  }
}

/** Permite forzar proveedor: localStorage.kce.ai.provider = "gemini" | "openai" o query ?ai= */
function pickProvider(): 'gemini' | 'openai' | undefined {
  try {
    const q = new URLSearchParams(window.location.search).get('ai')?.trim().toLowerCase();
    if (q === 'gemini' || q === 'openai') return q;
  } catch {/* ignore */}
  try {
    const s = (localStorage.getItem('kce.ai.provider') || '').trim().toLowerCase();
    if (s === 'gemini' || s === 'openai') return s;
  } catch {/* ignore */}
  return undefined;
}

export default function ChatWidget() {
  const [mounted, setMounted] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  const [messages, setMessages] = React.useState<Msg[]>([]);
  const [pending, setPending] = React.useState(false);
  const [unread, setUnread] = React.useState(false);
  const [errorText, setErrorText] = React.useState<string | null>(null);
  const [online, setOnline] = React.useState<boolean>(true);

  const prefersReduced = useReducedMotion();

  const dialogRef = React.useRef<HTMLDivElement | null>(null);
  const listRef = React.useRef<HTMLDivElement | null>(null);
  const textareaRef = React.useRef<HTMLTextAreaElement | null>(null);
  const abortRef = React.useRef<AbortController | null>(null);

  // Montaje + eventos globales
  React.useEffect(() => {
    setMounted(true);
    setMessages(loadMessages());
    setOnline(typeof navigator === 'undefined' ? true : navigator.onLine);

    const openEv = () => setOpen(true);
    const closeEv = () => setOpen(false);
    const toggleEv = () => setOpen((v) => !v);
    window.addEventListener('kce:open-chat', openEv as any);
    window.addEventListener('kce:close-chat', closeEv as any);
    window.addEventListener('kce:toggle-chat', toggleEv as any);

    (window as any).kce = { ...(window as any).kce, openChat: openEv, closeChat: closeEv, toggleChat: toggleEv };

    // ?chat=open
    try {
      const p = new URLSearchParams(window.location.search);
      if (p.get('chat') === 'open' || p.get('chat') === '1') setOpen(true);
    } catch {/* ignore */}

    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);

    return () => {
      window.removeEventListener('kce:open-chat', openEv as any);
      window.removeEventListener('kce:close-chat', closeEv as any);
      window.removeEventListener('kce:toggle-chat', toggleEv as any);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      abortRef.current?.abort();
    };
  }, []);

  // Persistencia
  React.useEffect(() => {
    if (!mounted) return;
    saveMessages(messages);
  }, [messages, mounted]);

  // Autoscroll al final
  const scrollToEnd = React.useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
    });
  }, []);

  React.useEffect(() => {
    if (open) scrollToEnd();
  }, [messages, open, pending, scrollToEnd]);

  // Foco al abrir
  React.useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => textareaRef.current?.focus(), 10);
    return () => clearTimeout(t);
  }, [open]);

  // Cerrar con Escape
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  // Cerrar por click fuera
  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!dialogRef.current) return;
      if (!dialogRef.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [open]);

  // Focus trap dentro del diálogo — FIX: asegura first/last no undefined
  React.useEffect(() => {
    if (!open) return;
    const el = dialogRef.current;
    if (!el) return;
    const selector =
      'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),[tabindex]:not([tabindex="-1"])';
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const nodes = Array.from(el.querySelectorAll<HTMLElement>(selector)).filter(
        (n) => !n.hasAttribute('aria-hidden'),
      );
      const first = nodes.at(0);
      const last = nodes.at(-1);
      if (!first || !last) return;

      const active = document.activeElement as Element | null;

      if (e.shiftKey) {
        if (active === first || !el.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  // Badge no leído
  React.useEffect(() => {
    const last = messages[messages.length - 1];
    if (!open && last?.role === 'assistant') setUnread(true);
  }, [messages, open]);

  // Autosize del textarea
  const autoSize = React.useCallback((ta: HTMLTextAreaElement | null) => {
    if (!ta) return;
    ta.style.height = '0px';
    const next = Math.min(144, ta.scrollHeight);
    ta.style.height = `${next}px`;
  }, []);

  const stop = () => {
    if (!pending) return;
    abortRef.current?.abort();
  };

  const send = React.useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || pending) return;

      setErrorText(null);
      setUnread(false);

      const userMsg: Msg = { id: uid(), role: 'user', content: trimmed, ts: Date.now() };
      setMessages((m) => [...m, userMsg]);
      setPending(true);

      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;

      try {
        const payload = [...messages, userMsg]
          .slice(-16)
          .map(({ role, content }) => ({ role, content: content.slice(0, 4000) }));

        const provider = pickProvider();

        const resp = await fetch('/api/ai', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(provider ? { 'X-AI-Provider': provider } : {}),
          },
          body: JSON.stringify({
            messages: payload,
            locale:
              (typeof navigator !== 'undefined' && (navigator.language || (navigator as any).userLanguage)) ||
              'es-CO',
            hint: 'chat_widget',
          }),
          signal: ctrl.signal,
          keepalive: true,
        });

        if (!resp.ok) {
          const msg = `Error ${resp.status}: no pudimos obtener respuesta.`;
          throw new Error(msg);
        }
        const data = (await resp.json()) as { content?: string };
        const content =
          (data && typeof data.content === 'string' && data.content.trim()) ||
          'Estoy aquí para ayudarte ✨. Cuéntame fechas, ciudad y presupuesto para comenzar.';

        const botMsg: Msg = { id: uid(), role: 'assistant', content, ts: Date.now() };
        setMessages((m) => [...m, botMsg]);
      } catch (err) {
        if ((err as any)?.name === 'AbortError') return;
        setErrorText(
          online
            ? 'No pude responder ahora mismo. ¿Intentamos de nuevo?'
            : 'Parece que estás sin conexión. Intenta de nuevo cuando vuelvas a estar online.',
        );
        const fail: Msg = { id: uid(), role: 'assistant', content: '…', ts: Date.now() };
        setMessages((m) => [...m, fail]);
      } finally {
        setPending(false);
      }
    },
    [messages, pending, online],
  );

  // Envío
  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const el = textareaRef.current;
    const val = (el?.value ?? '').trim();
    if (!val) return;
    void send(val);
    if (el) {
      el.value = '';
      autoSize(el);
      el.blur();
    }
  };

  // Atajos y autosize en textarea
  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter') {
      const isModifier = e.metaKey || e.ctrlKey;
      if (!e.shiftKey || isModifier) {
        e.preventDefault();
        const val = (e.currentTarget.value ?? '').trim();
        if (val) void send(val);
      }
    }
  };
  const onInput = (e: React.FormEvent<HTMLTextAreaElement>) => {
    autoSize(e.currentTarget);
  };

  // Limpiar chat
  const clearChat = () => {
    if (!confirm('¿Limpiar conversación? Esta acción no se puede deshacer.')) return;
    setMessages([]);
    saveMessages([]);
    setErrorText(null);
    setUnread(false);
    setTimeout(() => textareaRef.current?.focus(), 10);
  };

  // Sugerencias de inicio
  const starters = [
    'Bogotá 3 días — cultura y comida',
    'Caldas 2 días — ruta del café',
    'Cartagena en familia — seguro y fácil',
  ];

  // Botón flotante
  const floatBtn = (
    <button
      type="button"
      aria-label={open ? 'Cerrar chat' : 'Abrir chat'}
      aria-haspopup="dialog"
      aria-expanded={open}
      aria-controls="kce-chat-dialog"
      onClick={() => {
        setOpen((v) => {
          const next = !v;
          if (next) setUnread(false);
          return next;
        });
      }}
      className="fixed bottom-6 right-6 z-[var(--z-chat)] rounded-full bg-brand-blue p-4 text-white shadow-soft transition hover:scale-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue/40 focus-visible:ring-offset-2"
    >
      <div className="relative">
        <MessageCircle />
        {unread && (
          <span className="absolute -right-1 -top-1 inline-block h-2 w-2 rounded-full bg-brand-yellow" />
        )}
      </div>
    </button>
  );

  // Diálogo
  const dialog = (
    <AnimatePresence>
      {open && (
        <motion.div
          role="dialog"
          id="kce-chat-dialog"
          aria-modal="true"
          aria-labelledby="kce-chat-title"
          initial={prefersReduced ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={prefersReduced ? { opacity: 0 } : { opacity: 0, y: 10 }}
          transition={{ duration: 0.16 }}
          ref={dialogRef}
          className="fixed bottom-[7.5rem] right-6 z-[var(--z-modal)] w-[22rem] overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-2xl"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3">
            <div className="min-w-0">
              <h2 id="kce-chat-title" className="truncate font-heading text-brand-blue">
                KCE — Travel Planner
              </h2>
              <p className="truncate text-xs text-[var(--color-text-muted)]">
                Dime ciudad, fechas e intereses ✈️
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              {pending && (
                <button
                  type="button"
                  onClick={stop}
                  className="rounded-full p-1 text-[color:var(--color-text)]/70 transition hover:bg-black/5 hover:text-[color:var(--color-text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue/40"
                  aria-label="Detener respuesta"
                  title="Detener"
                >
                  <Square className="h-5 w-5" />
                </button>
              )}
              <button
                type="button"
                onClick={clearChat}
                className="rounded-full p-1 text-[color:var(--color-text)]/60 transition hover:bg-black/5 hover:text-[color:var(--color-text)]/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue/40"
                aria-label="Limpiar conversación"
                title="Limpiar"
              >
                <Trash2 className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-full p-1 text-[color:var(--color-text)]/60 transition hover:bg-black/5 hover:text-[color:var(--color-text)]/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue/40"
                aria-label="Cerrar chat"
                title="Cerrar"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* Aviso offline */}
          {!online && (
            <div className="bg-amber-50 px-4 py-2 text-xs text-amber-800">
              Estás sin conexión. Puedes escribir y enviar cuando vuelvas a estar online.
            </div>
          )}

          {/* Mensajes */}
          <div
            ref={listRef}
            role="log"
            aria-live="polite"
            className="max-h-72 space-y-2 overflow-auto px-4 py-3 text-sm"
          >
            {messages.length === 0 && (
              <div className="space-y-3 text-[var(--color-text)]/80">
                <div>¡Hola! Soy tu asistente de viaje. ¿A dónde te gustaría ir en Colombia? 🇨🇴</div>
                <div className="flex flex-wrap gap-2">
                  {starters.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => void send(s)}
                      className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-1 text-xs text-[var(--color-text)] transition hover:bg-black/5"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m) => (
              <div key={m.id} className={m.role === 'user' ? 'text-right' : 'text-left'}>
                <span
                  className={
                    m.role === 'user'
                      ? 'inline-block max-w-[85%] whitespace-pre-wrap rounded-2xl bg-brand-blue/10 px-3 py-2 text-[var(--color-text)]'
                      : 'inline-block max-w-[85%] whitespace-pre-wrap rounded-2xl bg-[color:var(--color-bg)] px-3 py-2 text-[var(--color-text)]'
                  }
                >
                  {m.content}
                </span>
              </div>
            ))}

            {pending && (
              <div className="text-left">
                <span className="inline-flex items-center gap-2 rounded-2xl bg-[color:var(--color-bg)] px-3 py-2 text-[var(--color-text)]">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Escribiendo…
                </span>
              </div>
            )}

            {errorText && !pending && (
              <div className="text-left">
                <span
                  className="inline-block max-w-[85%] rounded-2xl bg-red-50 px-3 py-2 text-sm text-red-700"
                  role="status"
                >
                  {errorText}
                </span>
              </div>
            )}
          </div>

          {/* Input */}
          <form
            className="flex gap-2 border-t border-[var(--color-border)] px-3 py-3"
            onSubmit={onSubmit}
            autoComplete="off"
          >
            <textarea
              ref={textareaRef}
              name="q"
              placeholder="Cuéntame tu idea de viaje…"
              className="max-h-36 min-h-[40px] flex-1 resize-none rounded-xl border border-brand-dark/15 px-3 py-2 outline-none focus:ring-2 focus:ring-brand-blue/30"
              aria-label="Mensaje para el asistente"
              disabled={pending}
              rows={1}
              onKeyDown={onKeyDown}
              onInput={onInput}
            />
            <button
              type="submit"
              className="inline-flex items-center gap-2 rounded-xl bg-brand-yellow px-4 py-2 font-heading text-[color:var(--color-text)] shadow-soft transition hover:scale-[1.02] disabled:opacity-60"
              disabled={pending || !online}
            >
              {pending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Enviando…
                </>
              ) : (
                'Enviar'
              )}
            </button>
          </form>
        </motion.div>
      )}
    </AnimatePresence>
  );

  if (!mounted) return null;

  return (
    <>
      {createPortal(floatBtn, document.body)}
      {createPortal(dialog, document.body)}
    </>
  );
}
