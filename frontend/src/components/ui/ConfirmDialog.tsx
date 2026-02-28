import { useState } from "react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
  const [typedValue, setTypedValue] = useState("");

  const confirmDisabled =
    requireTypedConfirmation != null
      ? typedValue !== requireTypedConfirmation
      : inputField != null
        ? typedValue.length === 0
        : false;

  return (
    <AlertDialog open={open} onOpenChange={(v) => !v && onCancel()}>
      <AlertDialogContent className="sm:max-w-sm">
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{message}</AlertDialogDescription>
        </AlertDialogHeader>

        {(requireTypedConfirmation != null || inputField != null) && (
          <Input
            type={inputField?.type ?? "text"}
            value={typedValue}
            onChange={(e) => setTypedValue(e.target.value)}
            placeholder={inputField?.placeholder ?? requireTypedConfirmation}
            autoFocus
          />
        )}

        <AlertDialogFooter>
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
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
