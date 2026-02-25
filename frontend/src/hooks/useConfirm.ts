import { useCallback, useState } from "react";

interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  confirmVariant?: "danger" | "primary";
  cancelLabel?: string;
  requireTypedConfirmation?: string;
  inputField?: { type: "text" | "password"; placeholder?: string };
}

interface ConfirmState extends ConfirmOptions {
  resolve: (value: string | boolean) => void;
}

export function useConfirm() {
  const [state, setState] = useState<ConfirmState | null>(null);

  const confirm = useCallback((options: ConfirmOptions): Promise<string | boolean> => {
    return new Promise((resolve) => {
      setState({ ...options, resolve });
    });
  }, []);

  const handleConfirm = useCallback(
    (inputValue?: string) => {
      if (!state) return;
      state.resolve(inputValue ?? true);
      setState(null);
    },
    [state],
  );

  const handleCancel = useCallback(() => {
    if (!state) return;
    state.resolve(false);
    setState(null);
  }, [state]);

  const dialogProps = state
    ? {
        open: true,
        title: state.title,
        message: state.message,
        confirmLabel: state.confirmLabel,
        confirmVariant: state.confirmVariant,
        cancelLabel: state.cancelLabel,
        requireTypedConfirmation: state.requireTypedConfirmation,
        inputField: state.inputField,
        onConfirm: handleConfirm,
        onCancel: handleCancel,
      }
    : null;

  return { confirm, dialogProps };
}
