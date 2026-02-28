import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Drawer as ShadDrawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/vaul-drawer";

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

  return (
    <ShadDrawer open={open} onOpenChange={(v) => !v && onClose()}>
      <DrawerContent style={{ maxHeight }}>
        <DrawerHeader className="flex flex-row items-center justify-between">
          <DrawerTitle>{title}</DrawerTitle>
          <Button variant="ghost" size="sm" onClick={onClose}>
            {t("common.close")}
          </Button>
        </DrawerHeader>
        <ScrollArea className="flex-1 px-4 pb-6">{children}</ScrollArea>
      </DrawerContent>
    </ShadDrawer>
  );
}
