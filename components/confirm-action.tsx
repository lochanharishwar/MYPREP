"use client";
import { useRef, useState } from "react";
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogCancel,
} from "./ui/alert-dialog";

export function ConfirmAction({
  label,
  title,
  description,
  confirmLabel,
  disabled,
  className = "secondary-btn",
  onConfirm,
}: {
  label: string;
  title: string;
  description: string;
  confirmLabel: string;
  disabled?: boolean;
  className?: string;
  onConfirm: () => Promise<unknown>;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const inFlight = useRef(false);
  const cancel = useRef<HTMLButtonElement>(null);
  async function confirm() {
    if (inFlight.current || disabled) return;
    inFlight.current = true;
    setPending(true);
    setError("");
    try {
      await onConfirm();
      setOpen(false);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "The action could not be completed. Please retry.",
      );
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }
  return (
    <AlertDialog
      open={open}
      onOpenChange={(value) => {
        if (inFlight.current) return;
        setOpen(value);
        if (value) setError("");
      }}
    >
      <AlertDialogTrigger className={className} disabled={disabled}>
        {label}
      </AlertDialogTrigger>
      <AlertDialogContent initialFocus={cancel}>
        <AlertDialogTitle>{title}</AlertDialogTitle>
        <AlertDialogDescription>{description}</AlertDialogDescription>
        {error && (
          <p role="alert" className="notice">
            {error}
          </p>
        )}
        {pending && (
          <output className="muted small">Completing your request…</output>
        )}
        <div className="tabs-row">
          <AlertDialogCancel ref={cancel} disabled={pending}>
            Cancel
          </AlertDialogCancel>
          <button
            className="primary-btn"
            disabled={disabled || pending}
            onClick={() => void confirm()}
          >
            {pending ? "Please wait…" : confirmLabel}
          </button>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}
