import Drawer from "./Drawer";
import Modal from "./Modal";
import { useMediaQuery } from "./useMediaQuery";

interface ResponsiveOverlayProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  size?: "sm" | "md" | "lg";
}

export default function ResponsiveOverlay({
  open,
  onClose,
  title,
  children,
  size = "md",
}: ResponsiveOverlayProps) {
  const isDesktop = useMediaQuery("(min-width: 640px)");

  if (isDesktop) {
    return (
      <Modal open={open} onClose={onClose} title={title} size={size}>
        {children}
      </Modal>
    );
  }

  return (
    <Drawer open={open} onClose={onClose} title={title}>
      {children}
    </Drawer>
  );
}
