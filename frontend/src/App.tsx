import { Navigate, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import CookingViewPage from "./pages/CookingViewPage";
import HouseholdPage from "./pages/HouseholdPage";
import InvitePage from "./pages/InvitePage";
import LoginPage from "./pages/LoginPage";
import MealPlanPage from "./pages/MealPlanPage";
import RecipeCreatePage from "./pages/RecipeCreatePage";
import RecipeDetailPage from "./pages/RecipeDetailPage";
import RecipeListPage from "./pages/RecipeListPage";
import SettingsPage from "./pages/SettingsPage";
import ShoppingListDetailPage from "./pages/ShoppingListDetailPage";
import SetupWizardPage from "./pages/SetupWizardPage";
import ShoppingListPage from "./pages/ShoppingListPage";
import WelcomePage from "./pages/WelcomePage";

function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/invite/:code" element={<InvitePage />} />
      <Route path="/setup" element={<SetupWizardPage />} />
      <Route path="/welcome" element={<WelcomePage />} />

      <Route element={<Layout />}>
        <Route path="/recipes" element={<RecipeListPage />} />
        <Route path="/recipes/new" element={<RecipeCreatePage />} />
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
