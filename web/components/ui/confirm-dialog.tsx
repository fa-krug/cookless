"use client";

import { useCallback, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export interface ConfirmOpts {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  input?: {
    placeholder: string;
    type?: string;
    expected?: string;
  };
}

interface ConfirmState extends ConfirmOpts {
  // resolve is stored separately in a ref to avoid stale closures
}

export function useConfirm() {
  const [opts, setOpts] = useState<ConfirmState | null>(null);
  const [inputValue, setInputValue] = useState("");
  const resolveRef = useRef<((value: string | boolean) => void) | null>(null);

  const confirm = useCallback((options: ConfirmOpts): Promise<string | boolean> => {
    return new Promise((resolve) => {
      resolveRef.current = resolve;
      setOpts(options);
      setInputValue("");
    });
  }, []);

  const settle = useCallback((value: string | boolean) => {
    if (resolveRef.current) {
      resolveRef.current(value);
      resolveRef.current = null;
    }
    setOpts(null);
    setInputValue("");
  }, []);

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open) settle(false);
    },
    [settle],
  );

  const confirmDisabled =
    opts?.input?.expected != null ? inputValue !== opts.input.expected : false;

  const dialog = (
    <Dialog open={!!opts} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{opts?.title}</DialogTitle>
        </DialogHeader>
        {opts?.message && <p className="text-sm text-muted-foreground">{opts.message}</p>}
        {opts?.input && (
          <Input
            type={opts.input.type ?? "text"}
            placeholder={opts.input.placeholder}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            autoFocus
          />
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => settle(false)}>
            {opts?.cancelLabel ?? "Cancel"}
          </Button>
          <Button
            type="button"
            variant={opts?.destructive ? "destructive" : "default"}
            disabled={confirmDisabled}
            onClick={() => settle(opts?.input ? inputValue : true)}
          >
            {opts?.confirmLabel ?? "Confirm"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  return { confirm, dialog };
}
