import type { LucideIcon } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

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
    <Card className="mt-12 border-dashed">
      <CardContent className="flex flex-col items-center py-10 text-center">
        <Icon size={48} className="text-muted-foreground" />
        <h3 className="mt-4 text-lg font-semibold text-foreground">{title}</h3>
        {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
        {action && (
          "to" in action ? (
            <Button asChild className="mt-4">
              <Link to={action.to}>
                {action.label}
              </Link>
            </Button>
          ) : (
            <Button type="button" className="mt-4" onClick={action.onClick}>
              {action.label}
            </Button>
          )
        )}
      </CardContent>
    </Card>
  );
}
