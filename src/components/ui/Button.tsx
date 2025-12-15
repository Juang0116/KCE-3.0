// src/components/ui/Button.tsx
'use client';

import { cva, type VariantProps } from 'class-variance-authority';
import cx from 'clsx';
import { motion, type MotionProps } from 'framer-motion';
import * as React from 'react';

const buttonStyles = cva(
  [
    'inline-flex items-center justify-center',
    'rounded-[var(--radius)] font-heading shadow-soft transition',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue/40 focus-visible:ring-offset-2',
    'disabled:opacity-60 disabled:cursor-not-allowed select-none',
  ].join(' '),
  {
    variants: {
      variant: {
        primary: 'bg-brand-yellow text-[color:var(--color-text)] hover:scale-[1.02]',
        accent: 'bg-brand-red text-white hover:scale-[1.02]',
        secondary: 'bg-brand-blue text-white hover:scale-[1.02]',
        outline:
          'bg-transparent text-brand-blue border border-brand-blue/30 hover:bg-brand-blue/5',
        ghost: 'bg-transparent text-[color:var(--color-text)] hover:bg-brand-dark/5',
        link: 'bg-transparent text-brand-blue underline-offset-4 hover:underline shadow-none px-0',
      },
      size: {
        sm: 'h-9 px-4 text-sm gap-2',
        md: 'h-11 px-6 text-base gap-2.5',
        lg: 'h-12 px-8 text-lg gap-3',
      },
      block: {
        true: 'w-full',
        false: '',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md', block: false },
  },
);

export type ButtonProps = Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  'style' | 'color'
> &
  MotionProps &
  VariantProps<typeof buttonStyles> & {
    asChild?: boolean;
    isLoading?: boolean;
    leftIcon?: React.ReactNode;
    rightIcon?: React.ReactNode;
    children?: React.ReactNode;
  };

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant,
      size,
      block,
      asChild,
      isLoading = false,
      leftIcon,
      rightIcon,
      whileTap = { scale: 0.98 },
      whileHover = { y: -1 },
      type,
      disabled,
      children,
      onClick, // ⬅️ lo extraemos para tiparlo correctamente
      ...props
    },
    ref,
  ) => {
    const classes = cx(
      buttonStyles({ variant, size, block }),
      isLoading && 'pointer-events-none',
      className,
    );

    const iconSize =
      size === 'sm' ? 'h-4 w-4' : size === 'lg' ? 'h-5 w-5' : 'h-[18px] w-[18px]';

    const Spinner = (
      <span className="mr-1.5 inline-flex items-center" role="status" aria-live="polite">
        <svg className={cx('animate-spin', iconSize)} viewBox="0 0 24 24" aria-hidden="true">
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
            fill="none"
          />
          <path
            className="opacity-90"
            d="M4 12a8 8 0 018-8"
            stroke="currentColor"
            strokeWidth="4"
            fill="none"
            strokeLinecap="round"
          />
        </svg>
        <span className="sr-only">Cargando…</span>
      </span>
    );

    // Fábrica de contenido (recibe SOLO el label – texto/nodos internos)
    const makeContent = (label: React.ReactNode) => (
      <>
        {isLoading ? (
          Spinner
        ) : (
          leftIcon && <span className={cx('inline-flex items-center', iconSize)}>{leftIcon}</span>
        )}
        <span className="truncate">{label}</span>
        {!isLoading && rightIcon && (
          <span className={cx('inline-flex items-center', iconSize)}>{rightIcon}</span>
        )}
      </>
    );

    // asChild: clona el hijo (Link, <a>, etc) SIN anidar otro <a>
    if (asChild && React.isValidElement(children)) {
      const child = children as React.ReactElement<any>;
      const label = child.props?.children; // ← usamos SOLO el contenido interno

      // Casteo del evento para respetar la firma de <button> y evitar el error TS
      type BtnEvt = React.MouseEvent<HTMLButtonElement, MouseEvent>;

      const composedOnClick: React.MouseEventHandler = (e) => {
        if (disabled || isLoading) {
          e.preventDefault();
          e.stopPropagation();
          return;
        }
        // onClick original del hijo (p.ej. <Link>)
        child.props?.onClick?.(e);
        // onClick del Button (tipado a <button>)
        onClick?.(e as unknown as BtnEvt);
      };

      // Si el hijo no es interactivo, añade role="button"
      const intrinsic = typeof child.type === 'string' ? child.type : '';
      const isInteractive = typeof child.props?.href === 'string' || /^(a|button)$/i.test(intrinsic);

      return React.cloneElement(child, {
        className: cx(classes, child.props?.className),
        'aria-disabled': disabled || isLoading ? true : undefined,
        tabIndex: disabled || isLoading ? -1 : child.props?.tabIndex,
        onClick: composedOnClick,
        role: !isInteractive ? 'button' : child.props?.role,
        'data-variant': variant,
        'data-size': size,
        'data-loading': isLoading ? 'true' : undefined,
        children: <span className="inline-flex items-center">{makeContent(label)}</span>,
      });
    }

    // Modo normal: <button>
    const motionProps: Partial<MotionProps> =
      disabled || isLoading ? {} : { whileTap, whileHover };

    return (
      <motion.button
        ref={ref}
        type={type ?? 'button'}
        aria-busy={isLoading || undefined}
        disabled={disabled || isLoading}
        className={classes}
        data-variant={variant}
        data-size={size}
        onClick={onClick}
        {...motionProps}
        {...props}
      >
        {makeContent(children)}
      </motion.button>
    );
  },
);

Button.displayName = 'Button';
