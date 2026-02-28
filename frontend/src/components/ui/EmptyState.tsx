import type { LucideIcon } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

interface ActionLink {
  label: string;
  to: string;
}

interface ActionButton {
  label: string;
  onClick: () => void;
}

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  action?: ActionLink | ActionButton;
}

export function EmptyState({ icon: Icon, title, subtitle, action }: EmptyStateProps) {
  return (
    <div className="mt-12 flex flex-col items-center text-center">
      <Icon size={48} className="text-gray-400" />
      <h3 className="mt-4 text-lg font-semibold text-gray-600">{title}</h3>
      {subtitle && <p className="mt-1 text-sm text-gray-500">{subtitle}</p>}
      {action && (
        "to" in action ? (
          <Link
            to={action.to}
            className="mt-4 inline-flex items-center rounded-lg bg-orange-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-orange-600"
          >
            {action.label}
          </Link>
        ) : (
          <Button type="button" className="mt-4" onClick={action.onClick}>
            {action.label}
          </Button>
        )
      )}
    </div>
  );
}
