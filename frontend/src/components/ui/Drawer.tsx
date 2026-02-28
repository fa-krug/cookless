import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { useDialog } from "../../hooks/useDialog";

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  maxHeight?: string;
}

export default function Drawer({
  open,
  onClose,
  title,
  children,
  maxHeight = "85vh",
}: DrawerProps) {
  const { t } = useTranslation();
  const { dialogRef, titleId, handleBackdropClick } = useDialog({ open, onClose });

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onClick={handleBackdropClick}
      className="m-0 mt-auto w-full max-w-lg border-none bg-transparent p-0 backdrop:bg-black/40"
    >
      <div
        className="rounded-t-2xl bg-white shadow-xl"
        style={{ maxHeight }}
      >
        <div className="flex justify-center pb-2 pt-3">
          <div className="h-1 w-10 rounded-full bg-gray-300" />
        </div>

        <div className="flex items-center justify-between px-4 pb-3">
          <h2 id={titleId} className="text-lg font-semibold text-gray-900">
            {title}
          </h2>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label={t("common.close")}>
            {t("common.close")}
          </Button>
        </div>

        <div className="overflow-y-auto px-4 pb-6" style={{ maxHeight: `calc(${maxHeight} - 5rem)` }}>
          {children}
        </div>
      </div>
    </dialog>
  );
}
