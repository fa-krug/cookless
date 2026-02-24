import { Navigate, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout.tsx";
import CookingViewPage from "./pages/CookingViewPage.tsx";
import HouseholdPage from "./pages/HouseholdPage.tsx";
import InvitePage from "./pages/InvitePage.tsx";
import LoginPage from "./pages/LoginPage.tsx";
import MealPlanPage from "./pages/MealPlanPage.tsx";
import RecipeDetailPage from "./pages/RecipeDetailPage.tsx";
import RecipeListPage from "./pages/RecipeListPage.tsx";
import SettingsPage from "./pages/SettingsPage.tsx";
import ShoppingListDetailPage from "./pages/ShoppingListDetailPage.tsx";
import ShoppingListPage from "./pages/ShoppingListPage.tsx";

function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/invite/:code" element={<InvitePage />} />

      <Route element={<Layout />}>
        <Route path="/recipes" element={<RecipeListPage />} />
        <Route path="/recipes/:id" element={<RecipeDetailPage />} />
        <Route path="/plan" element={<MealPlanPage />} />
        <Route path="/shopping" element={<ShoppingListPage />} />
        <Route path="/shopping/:id" element={<ShoppingListDetailPage />} />
        <Route path="/cook/:id" element={<CookingViewPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/household" element={<HouseholdPage />} />
      </Route>

      <Route path="*" element={<Navigate to="/recipes" replace />} />
    </Routes>
  );
}

export default App;
