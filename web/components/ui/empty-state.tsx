import type { LucideIcon } from "lucide-react";

export function EmptyState({
  icon: Icon,
  title,
  subtitle,
  action,
  fill = false,
}: {
  icon?: LucideIcon;
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  fill?: boolean;
}) {
  const card = (
    <div className="flex w-full max-w-md flex-col items-center gap-3 rounded-xl border bg-card px-6 py-12 text-center shadow-sm">
      {Icon && <Icon className="h-10 w-10 text-muted-foreground" />}
      <h2 className="text-lg font-semibold">{title}</h2>
      {subtitle && <p className="max-w-sm text-sm text-muted-foreground">{subtitle}</p>}
      {action}
    </div>
  );

  if (fill) {
    return <div className="flex flex-1 items-center justify-center py-8">{card}</div>;
  }

  return <div className="flex justify-center py-8">{card}</div>;
}
