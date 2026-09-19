'use client';

import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const liquidButtonVariants = cva(
  'relative inline-flex cursor-pointer items-center justify-center gap-2 overflow-hidden rounded-full border border-white/20 bg-white/10 px-5 font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.22),inset_0_-8px_18px_rgba(2,15,20,0.25),0_8px_24px_rgba(0,0,0,0.22)] backdrop-blur-xl transition-[transform,filter,box-shadow] duration-200 hover:brightness-110 hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.3),inset_0_-8px_18px_rgba(2,15,20,0.25),0_10px_28px_rgba(0,0,0,0.28)] active:translate-y-px active:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200/80 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0b1015] disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'bg-cyan-100/15 text-cyan-50',
        primary: 'bg-[#91e9d1]/90 text-[#0b2426]',
        outline: 'bg-transparent text-white',
      },
      size: {
        sm: 'h-8 px-3 text-xs [&_svg]:size-3.5',
        default: 'h-10 px-4 text-sm [&_svg]:size-4',
        lg: 'h-11 px-5 text-sm [&_svg]:size-4',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

type LiquidButtonProps = React.ComponentPropsWithoutRef<'button'> &
  VariantProps<typeof liquidButtonVariants> & { asChild?: boolean };

const LiquidButton = React.forwardRef<HTMLButtonElement, LiquidButtonProps>(
  ({ className, variant, size, asChild = false, children, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    const buttonClassName = cn(
      liquidButtonVariants({ variant, size, className }),
    );

    if (asChild) {
      return (
        <Comp
          ref={ref}
          data-slot="liquid-button"
          className={buttonClassName}
          {...props}
        >
          {children}
        </Comp>
      );
    }

    return (
      <Comp
        ref={ref}
        data-slot="liquid-button"
        className={buttonClassName}
        {...props}
      >
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-[linear-gradient(115deg,rgba(255,255,255,0.26),transparent_36%,rgba(255,255,255,0.06))]"
        />
        <span className="relative z-10 inline-flex items-center gap-2">
          {children}
        </span>
      </Comp>
    );
  },
);
LiquidButton.displayName = 'LiquidButton';

export { LiquidButton, liquidButtonVariants };
