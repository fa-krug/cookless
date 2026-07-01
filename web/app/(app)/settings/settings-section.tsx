"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronRight, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";

function IconBadge({
  icon: Icon,
  variant = "default",
}: {
  icon: LucideIcon;
  variant?: "default" | "destructive";
}) {
  return (
    <span
      className={cn(
        "flex size-9 shrink-0 items-center justify-center rounded-lg",
        variant === "destructive"
          ? "bg-destructive/10 text-destructive"
          : "bg-primary/10 text-primary",
      )}
    >
      <Icon size={18} />
    </span>
  );
}

export function SettingsSection({
  icon,
  title,
  description,
  variant = "default",
  className,
  children,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  variant?: "default" | "destructive";
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <Card className={cn("space-y-4 p-4", className)}>
      <div className="flex items-start gap-3">
        <IconBadge icon={icon} variant={variant} />
        <div className="min-w-0 space-y-0.5">
          <h2
            className={cn(
              "text-base font-semibold leading-tight",
              variant === "destructive" && "text-destructive",
            )}
          >
            {title}
          </h2>
          {description ? (
            <p className="text-sm text-muted-foreground">{description}</p>
          ) : null}
        </div>
      </div>
      {children}
    </Card>
  );
}

export function SettingsNavRow({
  icon,
  title,
  description,
  href,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  href: string;
}) {
  return (
    <Card className="p-0 transition-colors hover:bg-accent">
      <Link href={href} className="flex items-center gap-3 p-4">
        <IconBadge icon={icon} />
        <div className="min-w-0 flex-1 space-y-0.5">
          <h2 className="text-base font-semibold leading-tight">{title}</h2>
          {description ? (
            <p className="text-sm text-muted-foreground">{description}</p>
          ) : null}
        </div>
        <ChevronRight size={18} className="shrink-0 text-muted-foreground" />
      </Link>
    </Card>
  );
}
