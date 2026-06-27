"use client";

import { useState } from "react";
import { Copy, Share2 } from "lucide-react";
import { useT } from "@/lib/i18n/provider";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/components/ui/sonner";

export function ExportRecipeDialog({ title, text }: { title: string; text: string }) {
  const { t } = useT();
  const [open, setOpen] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(t("export.copied"));
    } catch {
      toast.error(t("common.errorRetry"));
    }
  }

  async function nativeShare() {
    if (navigator.share) {
      try {
        await navigator.share({ title, text });
      } catch {
        /* user cancelled — ignore */
      }
    } else {
      void copy();
    }
  }

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Share2 size={16} />
        {t("export.share")}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("export.title")}</DialogTitle>
          </DialogHeader>
          <textarea
            readOnly
            value={text}
            className="h-64 w-full resize-none rounded-md border border-border bg-muted/30 p-3 text-sm"
          />
          <div className="flex gap-2">
            <Button onClick={copy} className="flex-1">
              <Copy size={16} /> {t("export.copy")}
            </Button>
            <Button variant="outline" onClick={nativeShare} className="flex-1">
              <Share2 size={16} /> {t("export.share")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
