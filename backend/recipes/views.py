from rest_framework import generics, status
from rest_framework.exceptions import NotFound
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.viewsets import ModelViewSet

from recipes.models import Ingredient, Recipe, Unit
from recipes.serializers import (
    CookingStepSerializer,
    IngredientSerializer,
    RecipeSerializer,
    UnitSerializer,
)
from users.permissions import IsHouseholdMember


class RecipeViewSet(ModelViewSet):
    serializer_class = RecipeSerializer
    permission_classes = [IsHouseholdMember]

    def get_queryset(self):
        qs = Recipe.objects.filter(household=self.request.user.active_household).prefetch_related(
            "ingredients", "steps"
        )
        list_type = self.request.query_params.get("list_type")
        if list_type:
            qs = qs.filter(list_type=list_type)
        return qs


class RecipeMoveView(APIView):
    permission_classes = [IsHouseholdMember]

    def post(self, request, pk):
        try:
            recipe = Recipe.objects.get(pk=pk, household=request.user.active_household)
        except Recipe.DoesNotExist:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

        if recipe.list_type == "KNOWN":
            recipe.list_type = "TO_TRY"
        else:
            recipe.list_type = "KNOWN"
        recipe.save()

        serializer = RecipeSerializer(recipe, context={"request": request})
        return Response(serializer.data)


class RecipeStepsView(generics.ListAPIView):
    serializer_class = CookingStepSerializer
    permission_classes = [IsHouseholdMember]

    def get_queryset(self):
        try:
            recipe = Recipe.objects.get(
                pk=self.kwargs["pk"],
                household=self.request.user.active_household,
            )
        except Recipe.DoesNotExist:
            raise NotFound() from None

        qs = recipe.steps.all()
        method = self.request.query_params.get("method")
        if method:
            qs = qs.filter(method=method)
        return qs


class IngredientListCreateView(generics.ListCreateAPIView):
    serializer_class = IngredientSerializer
    permission_classes = [IsHouseholdMember]
    queryset = Ingredient.objects.all()


class UnitListView(generics.ListAPIView):
    serializer_class = UnitSerializer
    permission_classes = [IsHouseholdMember]
    queryset = Unit.objects.all()
