import { Suspense, lazy } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";

const CookingViewPage = lazy(() => import("./pages/CookingViewPage"));
const HouseholdPage = lazy(() => import("./pages/HouseholdPage"));
const InvitePage = lazy(() => import("./pages/InvitePage"));
const LoginPage = lazy(() => import("./pages/LoginPage"));
const MealPlanPage = lazy(() => import("./pages/MealPlanPage"));
const RecipeCreatePage = lazy(() => import("./pages/RecipeCreatePage"));
const RecipeDetailPage = lazy(() => import("./pages/RecipeDetailPage"));
const RecipeListPage = lazy(() => import("./pages/RecipeListPage"));
const SettingsPage = lazy(() => import("./pages/SettingsPage"));
const ShoppingListDetailPage = lazy(() => import("./pages/ShoppingListDetailPage"));
const SetupWizardPage = lazy(() => import("./pages/SetupWizardPage"));
const ShoppingListPage = lazy(() => import("./pages/ShoppingListPage"));
const WelcomePage = lazy(() => import("./pages/WelcomePage"));

function App() {
  return (
    <Suspense fallback={null}>
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
    </Suspense>
  );
}

export default App;
