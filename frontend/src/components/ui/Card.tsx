import clsx from 'clsx';
import type { HTMLAttributes, ReactNode } from 'react';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  padding?: boolean;
}

export function Card({ children, padding = true, className, ...props }: CardProps) {
  return (
    <div className={clsx('bg-white rounded-xl border border-gray-200 shadow-sm', padding && 'p-6', className)} {...props}>
      {children}
    </div>
  );
}
