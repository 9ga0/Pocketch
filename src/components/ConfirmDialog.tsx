import { useRef } from "react";
import { Button } from "./Button";
import { Modal } from "./Modal";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  return (
    <Modal
      open={open}
      onClose={onCancel}
      disableEscape={busy}
      labelledBy="confirm-dialog-title"
      describedBy="confirm-dialog-description"
      initialFocusRef={cancelRef}
    >
      <p className="eyebrow">확인이 필요해요</p>
      <h2 id="confirm-dialog-title">{title}</h2>
      <p id="confirm-dialog-description">{description}</p>
      <div className="dialog__actions">
        <Button ref={cancelRef} disabled={busy} onClick={onCancel}>취소</Button>
        <Button variant="danger" disabled={busy} onClick={onConfirm}>
          {busy ? "처리 중…" : confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}
