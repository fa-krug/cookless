"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BookOpen,
  Calendar,
  CircleUser,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  ShoppingCart,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/provider";
import { logoutAction } from "@/app/(auth)/actions";
import { useSidebarCollapsed } from "./use-sidebar-collapsed";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const NAV = [
  { href: "/recipes", icon: BookOpen, key: "nav.recipes" },
  { href: "/plan", icon: Calendar, key: "nav.plan" },
  { href: "/shopping", icon: ShoppingCart, key: "nav.shopping" },
  { href: "/settings", icon: Settings, key: "nav.settings" },
] as const;

export function AppNav({
  email,
  householdName,
}: {
  email: string;
  householdName: string;
}) {
  const { t } = useT();
  const pathname = usePathname();
  const router = useRouter();
  const { collapsed, toggle } = useSidebarCollapsed();
  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");

  async function logout() {
    await logoutAction();
    router.push("/login");
    router.refresh();
  }

  return (
    <>
      {/* Mobile: bottom bar */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-background pb-[max(0.5rem,env(safe-area-inset-bottom))] md:hidden">
        <div className="flex items-center justify-around">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-1 flex-col items-center gap-0.5 py-2 text-xs",
                isActive(item.href) ? "text-primary" : "text-muted-foreground",
              )}
            >
              <item.icon className="h-6 w-6" />
              <span>{t(item.key)}</span>
            </Link>
          ))}
        </div>
      </nav>

      {/* Desktop: sidebar */}
      <nav
        className={cn(
          "fixed left-0 top-0 hidden h-full flex-col border-r border-border bg-background transition-[width] duration-200 md:flex",
          collapsed ? "w-16" : "w-56",
        )}
      >
        <div
          className={cn(
            "flex items-center py-6",
            collapsed ? "justify-center px-2" : "justify-between px-5",
          )}
        >
          {!collapsed && (
            <span className="text-2xl font-bold">
              <span className="text-primary">Cook</span>
              <span className="text-blue-500">less</span>
            </span>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={toggle}
                aria-label={collapsed ? t("nav.expandSidebar") : t("nav.collapseSidebar")}
              >
                {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">
              {collapsed ? t("nav.expandSidebar") : t("nav.collapseSidebar")}
            </TooltipContent>
          </Tooltip>
        </div>

        <div className={cn("flex flex-1 flex-col gap-1", collapsed ? "px-2" : "px-3")}>
          {NAV.map((item) => {
            const link = (
              <Link
                href={item.href}
                className={cn(
                  "flex items-center rounded-lg text-sm font-medium",
                  collapsed ? "justify-center p-2.5" : "gap-3 px-3 py-2.5",
                  isActive(item.href)
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <item.icon className="h-5 w-5" />
                {!collapsed && <span>{t(item.key)}</span>}
              </Link>
            );
            return collapsed ? (
              <Tooltip key={item.href}>
                <TooltipTrigger asChild>{link}</TooltipTrigger>
                <TooltipContent side="right">{t(item.key)}</TooltipContent>
              </Tooltip>
            ) : (
              <div key={item.href}>{link}</div>
            );
          })}
        </div>

        <div className={cn("border-t border-border", collapsed ? "p-2" : "p-3")}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              {collapsed ? (
                <Button variant="ghost" className="h-10 w-full justify-center p-0">
                  <CircleUser className="h-5 w-5" />
                </Button>
              ) : (
                <Button variant="ghost" className="h-auto w-full justify-start gap-3 px-3 py-2">
                  <CircleUser className="h-5 w-5 shrink-0" />
                  <div className="min-w-0 flex-1 text-left">
                    <p className="truncate text-sm font-medium">{email}</p>
                    <p className="truncate text-xs text-muted-foreground">{householdName}</p>
                  </div>
                </Button>
              )}
            </DropdownMenuTrigger>
            <DropdownMenuContent side="right" align="end" className="w-56">
              <DropdownMenuLabel className="font-normal">
                <p className="truncate text-sm font-medium">{email}</p>
                <p className="truncate text-xs text-muted-foreground">{householdName}</p>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/settings">
                  <Settings className="mr-2 h-4 w-4" />
                  {t("nav.settings")}
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={logout} className="text-destructive">
                <LogOut className="mr-2 h-4 w-4" />
                {t("auth.logout")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </nav>

      {/* Desktop content offset */}
      <div className={cn("hidden md:block", collapsed ? "md:w-16" : "md:w-56")} aria-hidden />
    </>
  );
}
