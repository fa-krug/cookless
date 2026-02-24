from django.urls import path

from rest_framework.routers import DefaultRouter

from recipes.views import (
    IngredientListCreateView,
    RecipeMoveView,
    RecipeStepsView,
    RecipeViewSet,
    UnitListView,
)

router = DefaultRouter()
router.register("recipes", RecipeViewSet, basename="recipe")

urlpatterns = router.urls + [
    path("recipes/<uuid:pk>/move/", RecipeMoveView.as_view(), name="recipe-move"),
    path("recipes/<uuid:pk>/steps/", RecipeStepsView.as_view(), name="recipe-steps"),
    path("ingredients/", IngredientListCreateView.as_view(), name="ingredient-list"),
    path("units/", UnitListView.as_view(), name="unit-list"),
]
