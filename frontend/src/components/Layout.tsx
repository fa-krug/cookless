import { Navigate, Outlet } from "react-router-dom";
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
    <div className="flex min-h-screen flex-col bg-white">
      <InstallBanner />
      <main className="flex-1 overflow-y-auto pb-16">
        <Outlet />
      </main>
      <BottomNav />
    </div>
  );
}
