"use client";

import React, { useEffect, useId, useState } from "react";
import { AlertCircle, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/* -------------------------------------------------------------------------- */
/*  Form controls                                                             */
/* -------------------------------------------------------------------------- */

export const controlClass =
  "h-10 w-full rounded-field border border-line bg-input px-3.5 text-[13px] text-fg " +
  "placeholder:text-fg-subtle shadow-[inset_0_1px_0_rgb(255_255_255/0.02)] " +
  "transition-[border-color,box-shadow,background-color] duration-150 " +
  "hover:border-line-strong focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent/15 " +
  "disabled:cursor-not-allowed disabled:opacity-50";

export const labelClass = "text-[12px] font-medium text-fg";

interface FieldProps {
  label: React.ReactNode;
  htmlFor?: string;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}

export function Field({
  label,
  htmlFor,
  hint,
  error,
  action,
  className,
  children,
}: FieldProps) {
  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex min-h-5 items-center justify-between gap-3">
        <label htmlFor={htmlFor} className={labelClass}>
          {label}
        </label>
        {action}
      </div>
      {children}
      {error ? (
        <p className="flex items-start gap-1.5 text-[11.5px] leading-relaxed text-danger-text">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{error}</span>
        </p>
      ) : hint ? (
        <p className="text-[11.5px] leading-relaxed text-fg-subtle">{hint}</p>
      ) : null}
    </div>
  );
}

export function TextInput({
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(controlClass, className)} {...props} />;
}

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  wrapperClassName?: string;
}

export function Select({ className, wrapperClassName, children, ...props }: SelectProps) {
  return (
    <div className={cn("relative", wrapperClassName)}>
      <select
        className={cn(controlClass, "cursor-pointer appearance-none pr-9", className)}
        {...props}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle" />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Buttons                                                                   */
/* -------------------------------------------------------------------------- */

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md";

const buttonVariants: Record<ButtonVariant, string> = {
  primary:
    "bg-accent text-accent-ink shadow-[0_1px_2px_rgb(0_0_0/0.18)] hover:bg-accent-hover " +
    "focus-visible:ring-accent/30",
  secondary:
    "border border-line bg-card text-fg hover:border-line-strong hover:bg-hover " +
    "focus-visible:ring-accent/20",
  ghost:
    "text-fg-muted hover:bg-hover hover:text-fg focus-visible:ring-accent/20",
  danger:
    "text-danger-text hover:bg-danger-soft focus-visible:ring-danger/25",
};

const buttonSizes: Record<ButtonSize, string> = {
  sm: "h-8 gap-1.5 px-3 text-[12px]",
  md: "h-9 gap-2 px-4 text-[12.5px]",
};

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export function Button({
  variant = "secondary",
  size = "md",
  type = "button",
  className,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex items-center justify-center whitespace-nowrap rounded-field font-medium",
        "transition-[background-color,border-color,color,box-shadow,transform] duration-150",
        "focus-visible:outline-none focus-visible:ring-4",
        "active:scale-[0.98] disabled:pointer-events-none disabled:opacity-60",
        buttonVariants[variant],
        buttonSizes[size],
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}

interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  tone?: "default" | "danger";
}

export function IconButton({
  label,
  tone = "default",
  type = "button",
  className,
  children,
  ...props
}: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex h-8 w-8 items-center justify-center rounded-control",
        "transition-colors duration-150 focus-visible:outline-none focus-visible:ring-4",
        tone === "danger"
          ? "text-fg-muted hover:bg-danger-soft hover:text-danger-text focus-visible:ring-danger/25"
          : "text-fg-muted hover:bg-hover hover:text-fg focus-visible:ring-accent/20",
        "disabled:pointer-events-none disabled:opacity-50",
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/*  Badges                                                                    */
/* -------------------------------------------------------------------------- */

export type BadgeTone = "neutral" | "accent" | "success" | "warning" | "danger" | "info" | "violet";

const badgeTones: Record<BadgeTone, string> = {
  neutral: "border-line bg-hover text-fg-muted",
  accent: "border-accent-line bg-accent-soft text-accent-text",
  success: "border-success/25 bg-success-soft text-success-text",
  warning: "border-warning/25 bg-warning-soft text-warning-text",
  danger: "border-danger/25 bg-danger-soft text-danger-text",
  info: "border-info/25 bg-info-soft text-info-text",
  violet: "border-violet/25 bg-violet-soft text-violet-text",
};

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
  dot?: boolean;
}

export function Badge({
  tone = "neutral",
  dot = false,
  className,
  children,
  ...props
}: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1.5 rounded-full border px-2.5 text-[10.5px] font-medium",
        badgeTones[tone],
        className
      )}
      {...props}
    >
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />}
      {children}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/*  Segmented control                                                         */
/* -------------------------------------------------------------------------- */

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  icon?: React.ReactNode;
  title?: string;
}

interface SegmentedControlProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: SegmentedOption<T>[];
  ariaLabel: string;
  className?: string;
}

export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
  className,
}: SegmentedControlProps<T>) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn(
        "inline-flex items-center gap-0.5 rounded-control border border-line bg-panel p-0.5",
        className
      )}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={active}
            title={option.title ?? option.label}
            onClick={() => onChange(option.value)}
            className={cn(
              "inline-flex h-7 items-center gap-1.5 rounded-[6px] px-2.5 text-[11.5px] font-medium",
              "transition-[background-color,color,box-shadow] duration-150",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
              active
                ? "bg-raised text-fg shadow-[var(--shadow-card)]"
                : "text-fg-muted hover:bg-hover hover:text-fg"
            )}
          >
            {option.icon}
            <span>{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Collapsible section card                                                  */
/* -------------------------------------------------------------------------- */

interface SectionCardProps {
  title: string;
  description?: React.ReactNode;
  icon?: React.ReactNode;
  defaultOpen?: boolean;
  storageKey?: string;
  children: React.ReactNode;
  className?: string;
}

export function SectionCard({
  title,
  description,
  icon,
  defaultOpen = true,
  storageKey,
  children,
  className,
}: SectionCardProps) {
  const id = useId();
  const [open, setOpen] = useState(defaultOpen);

  useEffect(() => {
    if (!storageKey) return;
    try {
      const stored = localStorage.getItem(storageKey);
      // Hidratación: leer tras montar evita desajustes con el HTML del servidor.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (stored !== null) setOpen(stored === "1");
    } catch {
      // ignore
    }
  }, [storageKey]);

  const toggle = () => {
    setOpen((prev) => {
      const next = !prev;
      if (storageKey) {
        try {
          localStorage.setItem(storageKey, next ? "1" : "0");
        } catch {
          // ignore
        }
      }
      return next;
    });
  };

  return (
    <section
      className={cn(
        "overflow-hidden rounded-card border border-line bg-card shadow-[var(--shadow-card)]",
        className
      )}
    >
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-controls={id}
        className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/30"
      >
        {icon && <span className="mt-0.5 text-fg-subtle">{icon}</span>}
        <span className="min-w-0 flex-1">
          <span className="block text-[12.5px] font-semibold text-fg">{title}</span>
          {description && (
            <span className="mt-0.5 block text-[11.5px] leading-relaxed text-fg-subtle">
              {description}
            </span>
          )}
        </span>
        <ChevronDown
          className={cn(
            "mt-0.5 h-4 w-4 shrink-0 text-fg-subtle transition-transform duration-200",
            open && "rotate-180"
          )}
        />
      </button>

      <div
        id={id}
        className={cn(
          "grid transition-[grid-template-rows] duration-200 ease-out",
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        )}
      >
        <div className="overflow-hidden">
          <div className="border-t border-line px-4 py-4">{children}</div>
        </div>
      </div>
    </section>
  );
}
