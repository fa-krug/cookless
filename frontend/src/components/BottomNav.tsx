import { useTranslation } from "react-i18next";
import { NavLink, useNavigate } from "react-router-dom";
import {
  BookOpen,
  Calendar,
  CircleUser,
  Home,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  ShoppingCart,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import AppLogo from "./AppLogo";
import { Button } from "./ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { ConfirmDialog } from "./ui/ConfirmDialog";
import { useAuth } from "../hooks/useAuth";
import { useConfirm } from "../hooks/useConfirm";
import { useSidebarCollapsed } from "../hooks/useSidebarCollapsed";
import { cn } from "@/lib/utils";

interface NavItem {
  to: string;
  labelKey: string;
  icon: LucideIcon;
}

const navItems: NavItem[] = [
  { to: "/recipes", labelKey: "nav.recipes", icon: BookOpen },
  { to: "/plan", labelKey: "nav.plan", icon: Calendar },
  { to: "/shopping", labelKey: "nav.shopping", icon: ShoppingCart },
  { to: "/settings", labelKey: "nav.settings", icon: Settings },
];

export default function BottomNav() {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { collapsed, toggle } = useSidebarCollapsed();
  const { confirm, dialogProps } = useConfirm();

  const handleLogout = async () => {
    const confirmed = await confirm({
      title: t("auth.logout"),
      message: t("auth.logoutConfirm"),
      confirmLabel: t("auth.logout"),
      confirmVariant: "danger",
    });
    if (confirmed) {
      await logout();
    }
  };

  return (
    <>
      {/* Mobile: bottom bar */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-background pb-[env(safe-area-inset-bottom)] md:hidden">
        <div className="flex items-center justify-around">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex flex-1 flex-col items-center gap-0.5 py-2 text-xs ${
                  isActive ? "text-primary" : "text-muted-foreground"
                }`
              }
            >
              <item.icon className="h-6 w-6" />
              <span>{t(item.labelKey)}</span>
            </NavLink>
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
        {/* Header: logo + collapse toggle */}
        <div
          className={cn(
            "flex items-center py-6",
            collapsed ? "justify-center px-2" : "justify-between px-5",
          )}
        >
          {!collapsed && <AppLogo className="text-2xl" />}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0"
                onClick={toggle}
                aria-label={
                  collapsed ? t("nav.expandSidebar") : t("nav.collapseSidebar")
                }
              >
                {collapsed ? (
                  <PanelLeftOpen className="h-5 w-5" />
                ) : (
                  <PanelLeftClose className="h-5 w-5" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">
              {collapsed ? t("nav.expandSidebar") : t("nav.collapseSidebar")}
            </TooltipContent>
          </Tooltip>
        </div>

        {/* Nav items */}
        <div className={cn("flex flex-1 flex-col gap-1", collapsed ? "px-2" : "px-3")}>
          {navItems.map((item) =>
            collapsed ? (
              <Tooltip key={item.to}>
                <TooltipTrigger asChild>
                  <NavLink
                    to={item.to}
                    className={({ isActive }) =>
                      cn(
                        "flex items-center justify-center rounded-lg p-2.5 text-sm font-medium",
                        isActive
                          ? "bg-primary/10 text-primary"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground",
                      )
                    }
                  >
                    <item.icon className="h-5 w-5" />
                  </NavLink>
                </TooltipTrigger>
                <TooltipContent side="right">{t(item.labelKey)}</TooltipContent>
              </Tooltip>
            ) : (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium",
                    isActive
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )
                }
              >
                <item.icon className="h-5 w-5" />
                <span>{t(item.labelKey)}</span>
              </NavLink>
            ),
          )}
        </div>

        {/* User/Household dropdown */}
        {user && (
          <div
            className={cn(
              "border-t border-border",
              collapsed ? "p-2" : "p-3",
            )}
          >
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                {collapsed ? (
                  <Button
                    variant="ghost"
                    className="h-10 w-full justify-center p-0"
                    aria-label={t("nav.account")}
                  >
                    <CircleUser className="h-5 w-5" />
                  </Button>
                ) : (
                  <Button
                    variant="ghost"
                    className="h-auto w-full justify-start gap-3 px-3 py-2"
                  >
                    <CircleUser className="h-5 w-5 shrink-0" />
                    <div className="min-w-0 flex-1 text-left">
                      <p className="truncate text-sm font-medium">{user.email}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {user.active_household?.name}
                      </p>
                    </div>
                  </Button>
                )}
              </DropdownMenuTrigger>
              <DropdownMenuContent side="right" align="end" className="w-56">
                <DropdownMenuLabel className="font-normal">
                  <p className="truncate text-sm font-medium">{user.email}</p>
                  {user.active_household && (
                    <p className="truncate text-xs text-muted-foreground">
                      {user.active_household.name}
                    </p>
                  )}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate("/household")}>
                  <Home className="mr-2 h-4 w-4" />
                  {t("nav.manageHousehold")}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate("/settings")}>
                  <Settings className="mr-2 h-4 w-4" />
                  {t("nav.settings")}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={handleLogout}
                  className="text-destructive focus:text-destructive"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  {t("auth.logout")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </nav>

      {dialogProps && <ConfirmDialog {...dialogProps} />}
    </>
  );
}
