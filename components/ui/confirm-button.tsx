"use client";

import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import type { VariantProps } from "class-variance-authority";
import { cn } from "cn";
import { Button, buttonVariants } from "./button";

type ButtonVariant = VariantProps<typeof buttonVariants>["variant"];
type ButtonSize = VariantProps<typeof buttonVariants>["size"];

/**
 * Shared two-step confirmation for destructive actions, matching the
 * inline confirm idiom already used by the draft-delete flows:
 * idle control → armed [Confirm] + [Cancel] pair → action fires.
 */
function useConfirmAction(
  onConfirm: () => void | Promise<void>,
  disabled: boolean | undefined,
  resetMs: number
) {
  const [armed, setArmed] = useState(false);
  const [pending, setPending] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function clearTimer() {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }

  function disarm() {
    clearTimer();
    setArmed(false);
  }

  function arm() {
    if (disabled || pending) return;
    clearTimer();
    setArmed(true);
    if (resetMs > 0) {
      timerRef.current = setTimeout(disarm, resetMs);
    }
  }

  async function confirm() {
    if (disabled || pending) return;
    clearTimer();
    setPending(true);
    try {
      await onConfirm();
    } finally {
      setPending(false);
      setArmed(false);
    }
  }

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return { armed, pending, arm, disarm, confirm };
}

export function ConfirmButton({
  onConfirm,
  children,
  icon,
  confirmLabel = "Confirm",
  busyLabel = "Working…",
  cancelLabel = "Cancel",
  variant = "ghost",
  size = "sm",
  className,
  disabled,
}: {
  onConfirm: () => void | Promise<void>;
  children: ReactNode;
  icon?: ReactNode;
  confirmLabel?: string;
  busyLabel?: string;
  cancelLabel?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  disabled?: boolean;
}) {
  const { armed, pending, arm, disarm, confirm } = useConfirmAction(
    onConfirm,
    disabled,
    0
  );
  const idleRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const wasArmed = useRef(false);

  // Move focus into the confirm button when armed, and back to the
  // trigger when disarmed (skip the initial mount).
  useEffect(() => {
    if (armed === wasArmed.current) return;
    wasArmed.current = armed;
    if (armed) {
      confirmRef.current?.focus();
    } else {
      idleRef.current?.focus();
    }
  }, [armed]);

  if (!armed) {
    return (
      <Button
        ref={idleRef}
        type="button"
        variant={variant}
        size={size}
        className={className}
        disabled={disabled || pending}
        onClick={arm}
      >
        {icon}
        {children}
      </Button>
    );
  }

  return (
    <>
      <Button
        ref={confirmRef}
        type="button"
        variant="destructive"
        size={size}
        className={className}
        disabled={pending}
        onClick={() => void confirm()}
        onKeyDown={(event: ReactKeyboardEvent<HTMLButtonElement>) => {
          if (event.key === "Escape") {
            event.preventDefault();
            disarm();
          }
        }}
      >
        {icon}
        {pending ? busyLabel : confirmLabel}
      </Button>
      <Button
        type="button"
        variant="ghost"
        size={size}
        disabled={pending}
        onClick={disarm}
      >
        {cancelLabel}
      </Button>
    </>
  );
}

const ARMED_CLASSES =
  "bg-destructive text-white hover:bg-destructive/90 hover:text-white";

/**
 * Two-step confirmation for small icon-only controls where a two-button
 * morph would break the layout: first click arms the button (solid
 * destructive fill, "click again" label), second click confirms. Arms
 * auto-reset after `resetMs` and Escape disarms.
 */
export function ConfirmIconButton({
  onConfirm,
  icon,
  busyIcon,
  idleLabel,
  armedLabel = "Click again to confirm",
  title,
  className,
  disabled,
  resetMs = 4000,
}: {
  onConfirm: () => void | Promise<void>;
  icon: ReactNode;
  busyIcon?: ReactNode;
  idleLabel: string;
  armedLabel?: string;
  title?: string;
  className?: string;
  disabled?: boolean;
  resetMs?: number;
}) {
  const { armed, pending, arm, disarm, confirm } = useConfirmAction(
    onConfirm,
    disabled,
    resetMs
  );

  return (
    <button
      type="button"
      onClick={armed ? () => void confirm() : arm}
      onKeyDown={(event) => {
        if (armed && event.key === "Escape") {
          event.preventDefault();
          disarm();
        }
      }}
      disabled={disabled || pending}
      aria-label={armed ? armedLabel : idleLabel}
      title={armed ? armedLabel : (title ?? idleLabel)}
      className={cn(className, armed && !pending && ARMED_CLASSES)}
    >
      {pending && busyIcon ? busyIcon : icon}
    </button>
  );
}
