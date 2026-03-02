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
}

export default function Drawer({
  open,
  onClose,
  title,
  children,
}: DrawerProps) {
  return (
    <ShadDrawer open={open} onOpenChange={(v) => !v && onClose()}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>{title}</DrawerTitle>
        </DrawerHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6">{children}</div>
      </DrawerContent>
    </ShadDrawer>
  );
}
