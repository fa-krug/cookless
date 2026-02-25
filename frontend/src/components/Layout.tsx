import { ChevronRight } from "lucide-react";
import { Link, Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { useOnlineSync } from "../hooks/useOnlineSync";
import BottomNav from "./BottomNav";
import InstallBanner from "./InstallBanner";

export default function Layout() {
  const { user, isLoading } = useAuth();
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

  return (
    <div className="flex min-h-screen bg-white md:flex-row">
      <BottomNav />
      <div className="flex min-h-screen min-w-0 flex-1 flex-col md:ml-56">
        {user.active_household && (
          <Link
            to="/household"
            className="flex items-center border-b border-gray-200 px-4 py-2 md:hidden"
          >
            <span className="truncate text-sm font-medium text-gray-700">
              {user.active_household.name}
            </span>
            <ChevronRight className="ml-auto h-4 w-4 text-gray-400" />
          </Link>
        )}
        <InstallBanner />
        <main className="mx-auto w-full max-w-3xl flex-1 overflow-y-auto pb-16 md:pb-0">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
