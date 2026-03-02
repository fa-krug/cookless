import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { useOnlineSync } from "../hooks/useOnlineSync";
import { useSidebarCollapsed } from "../hooks/useSidebarCollapsed";
import BottomNav from "./BottomNav";
import InstallBanner from "./InstallBanner";
import { cn } from "@/lib/utils";

export default function Layout() {
  const { user, isLoading } = useAuth();
  const { collapsed } = useSidebarCollapsed();
  useOnlineSync();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-orange-500 border-t-transparent" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (user.onboarding_step !== "COMPLETED") {
    return <Navigate to="/setup" replace />;
  }

  return (
    <div className="flex min-h-screen bg-background md:flex-row">
      <BottomNav />
      <div
        className={cn(
          "flex min-h-screen min-w-0 flex-1 flex-col transition-[margin] duration-200",
          collapsed ? "md:ml-16" : "md:ml-56",
        )}
      >
        <InstallBanner />
        <main className="mx-auto w-full max-w-3xl flex-1 overflow-y-auto pb-[calc(3.5rem+env(safe-area-inset-bottom))] md:pb-0">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
