import { useState } from "react";
import { Modal } from "../../components/Modal";
import type { CollectedItem } from "../../domain/collection";
import { CameraCapture } from "./CameraCapture";
import { ItemRegistration } from "./ItemRegistration";

export interface CaptureModalProps {
  open: boolean;
  onClose: () => void;
  onSaved: (item: CollectedItem) => void;
  onManageItems: () => void;
}

export function CaptureModal({ open, onClose, onSaved, onManageItems }: CaptureModalProps) {
  const [captureBlob, setCaptureBlob] = useState<Blob | null>(null);

  const close = () => {
    setCaptureBlob(null);
    onClose();
  };

  const handleSaved = (item: CollectedItem) => {
    setCaptureBlob(null);
    onSaved(item);
  };

  const handleManageItems = () => {
    close();
    onManageItems();
  };

  return (
    <Modal
      open={open}
      onClose={close}
      labelledBy="capture-modal-title"
      closeOnBackdropClick
      className="capture-modal"
    >
      <button className="dialog__close" onClick={close} aria-label="촬영 닫기">×</button>
      <p className="eyebrow" id="capture-modal-title">ADD ITEM</p>
      {captureBlob ? (
        <ItemRegistration
          source={captureBlob}
          onCancel={close}
          onSaved={handleSaved}
          onManageItems={handleManageItems}
        />
      ) : (
        <CameraCapture
          onBackgroundRemovalRequested={setCaptureBlob}
          onSourceDiscarded={() => setCaptureBlob(null)}
        />
      )}
    </Modal>
  );
}
