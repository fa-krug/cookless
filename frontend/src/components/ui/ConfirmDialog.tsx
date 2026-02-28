import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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

  return (
    <dialog
      ref={dialogRef}
      className="m-auto w-full max-w-sm rounded-2xl border-none bg-transparent p-0 shadow-xl backdrop:bg-black/40"
    >
      <div className="rounded-2xl bg-white p-5 shadow-xl">
        <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
        <p className="mt-2 text-sm text-gray-600">{message}</p>

        {(requireTypedConfirmation != null || inputField != null) && (
          <Input
            type={inputField?.type ?? "text"}
            value={typedValue}
            onChange={(e) => setTypedValue(e.target.value)}
            placeholder={inputField?.placeholder ?? requireTypedConfirmation}
            className="mt-3"
            autoFocus
          />
        )}

        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant={confirmVariant === "danger" ? "destructive" : "default"}
            onClick={() => onConfirm(inputField ? typedValue : undefined)}
            disabled={confirmDisabled}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </dialog>
  );
}
