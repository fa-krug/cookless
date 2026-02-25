import { useEffect, useRef, useState } from "react";

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  confirmVariant?: "danger" | "primary";
  cancelLabel?: string;
  onConfirm: (inputValue?: string) => void;
  onCancel: () => void;
  requireTypedConfirmation?: string;
  inputField?: { type: "text" | "password"; placeholder?: string };
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  confirmVariant = "danger",
  cancelLabel = "Cancel",
  onConfirm,
  onCancel,
  requireTypedConfirmation,
  inputField,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [typedValue, setTypedValue] = useState("");

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    function handleCancel(e: Event) {
      e.preventDefault();
      onCancel();
    }
    dialog.addEventListener("cancel", handleCancel);
    return () => dialog.removeEventListener("cancel", handleCancel);
  }, [onCancel]);

  const confirmDisabled =
    requireTypedConfirmation != null
      ? typedValue !== requireTypedConfirmation
      : inputField != null
        ? typedValue.length === 0
        : false;

  const confirmBtnClass =
    confirmVariant === "danger"
      ? "rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
      : "rounded-md bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-50";

  return (
    <dialog
      ref={dialogRef}
      className="w-full max-w-sm rounded-lg bg-white p-0 shadow-xl backdrop:bg-black/40"
    >
      <div className="p-5">
        <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
        <p className="mt-2 text-sm text-gray-600">{message}</p>

        {(requireTypedConfirmation != null || inputField != null) && (
          <input
            type={inputField?.type ?? "text"}
            value={typedValue}
            onChange={(e) => setTypedValue(e.target.value)}
            placeholder={inputField?.placeholder ?? requireTypedConfirmation}
            className="mt-3 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
            autoFocus
          />
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={() => onConfirm(inputField ? typedValue : undefined)}
            disabled={confirmDisabled}
            className={confirmBtnClass}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </dialog>
  );
}
