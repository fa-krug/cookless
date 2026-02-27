import { X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useDialog } from "../../hooks/useDialog";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  size?: "sm" | "md" | "lg";
}

const SIZE_CLASSES = {
  sm: "sm:max-w-sm",
  md: "sm:max-w-md",
  lg: "sm:max-w-lg",
};

export default function Modal({ open, onClose, title, children, size = "md" }: ModalProps) {
  const { t } = useTranslation();
  const { dialogRef, titleId, handleBackdropClick } = useDialog({ open, onClose });

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onClick={handleBackdropClick}
      className={`m-auto w-full rounded-2xl border-none bg-transparent p-0 backdrop:bg-black/40 ${SIZE_CLASSES[size]}`}
    >
      <div className="rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 id={titleId} className="text-lg font-semibold text-gray-900">
            {title}
          </h2>
          <button
            onClick={onClose}
            aria-label={t("common.close")}
            className="rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}
