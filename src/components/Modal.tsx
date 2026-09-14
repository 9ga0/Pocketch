import { useEffect, useRef, type ReactNode, type RefObject } from "react";

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  labelledBy: string;
  describedBy?: string;
  disableEscape?: boolean;
  closeOnBackdropClick?: boolean;
  initialFocusRef?: RefObject<HTMLElement | null>;
  className?: string;
  children: ReactNode;
}

export function Modal({
  open,
  onClose,
  labelledBy,
  describedBy,
  disableEscape = false,
  closeOnBackdropClick = false,
  initialFocusRef,
  className,
  children,
}: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const returnFocus = document.activeElement as HTMLElement | null;
    const focusTarget =
      initialFocusRef?.current ?? dialogRef.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
    focusTarget?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !disableEscape) {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const elements = dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
      if (!elements?.length) return;
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      returnFocus?.focus();
    };
  }, [disableEscape, initialFocusRef, onClose, open]);

  if (!open) return null;
  return (
    <div
      className="dialog-backdrop"
      role="presentation"
      onClick={closeOnBackdropClick ? onClose : undefined}
    >
      <div
        aria-describedby={describedBy}
        aria-labelledby={labelledBy}
        aria-modal="true"
        className={className ? `dialog ${className}` : "dialog"}
        ref={dialogRef}
        role="dialog"
        onClick={closeOnBackdropClick ? (event) => event.stopPropagation() : undefined}
      >
        {children}
      </div>
    </div>
  );
}
