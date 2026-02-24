from rest_framework import serializers

from recipes.models import CookingStep, Ingredient, Recipe, RecipeIngredient, Unit


class UnitSerializer(serializers.ModelSerializer):
    class Meta:
        model = Unit
        fields = ["id", "name_de", "name_en", "abbreviation"]


class IngredientSerializer(serializers.ModelSerializer):
    class Meta:
        model = Ingredient
        fields = ["id", "name_de", "name_en", "category"]


class RecipeIngredientSerializer(serializers.ModelSerializer):
    class Meta:
        model = RecipeIngredient
        fields = ["id", "ingredient", "quantity", "unit", "order"]


class CookingStepSerializer(serializers.ModelSerializer):
    class Meta:
        model = CookingStep
        fields = ["id", "step_number", "instruction"]


class RecipeSerializer(serializers.ModelSerializer):
    ingredients = RecipeIngredientSerializer(many=True, required=False, default=[])
    manual_steps = CookingStepSerializer(many=True, required=False, default=[])
    machine_steps = CookingStepSerializer(many=True, required=False, default=[])

    class Meta:
        model = Recipe
        fields = [
            "id",
            "title",
            "list_type",
            "default_servings",
            "prep_time_minutes",
            "cook_time_minutes",
            "image",
            "created_at",
            "updated_at",
            "ingredients",
            "manual_steps",
            "machine_steps",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def _save_ingredients(self, recipe: Recipe, ingredients_data: list) -> None:
        recipe.ingredients.all().delete()
        for item in ingredients_data:
            RecipeIngredient.objects.create(recipe=recipe, **item)

    def _save_steps(self, recipe: Recipe, steps_data: list, method: str) -> None:
        recipe.steps.filter(method=method).delete()
        for item in steps_data:
            CookingStep.objects.create(recipe=recipe, method=method, **item)

    def create(self, validated_data: dict) -> Recipe:
        ingredients_data = validated_data.pop("ingredients", [])
        manual_steps_data = validated_data.pop("manual_steps", [])
        machine_steps_data = validated_data.pop("machine_steps", [])

        household = self.context["request"].user.active_household
        recipe = Recipe.objects.create(household=household, **validated_data)

        self._save_ingredients(recipe, ingredients_data)
        self._save_steps(recipe, manual_steps_data, "MANUAL")
        self._save_steps(recipe, machine_steps_data, "MACHINE")

        return recipe

    def update(self, instance: Recipe, validated_data: dict) -> Recipe:
        ingredients_data = validated_data.pop("ingredients", None)
        manual_steps_data = validated_data.pop("manual_steps", None)
        machine_steps_data = validated_data.pop("machine_steps", None)

        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()

        if ingredients_data is not None:
            self._save_ingredients(instance, ingredients_data)
        if manual_steps_data is not None:
            self._save_steps(instance, manual_steps_data, "MANUAL")
        if machine_steps_data is not None:
            self._save_steps(instance, machine_steps_data, "MACHINE")

        return instance
