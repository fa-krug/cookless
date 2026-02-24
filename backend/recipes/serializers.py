from django.db import transaction

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

    # Read: SerializerMethodField pulls from steps relation filtered by method
    manual_steps = serializers.SerializerMethodField()
    machine_steps = serializers.SerializerMethodField()

    # Write-only fields for accepting nested step data on create/update
    manual_steps_input = CookingStepSerializer(
        many=True, required=False, default=[], write_only=True
    )
    machine_steps_input = CookingStepSerializer(
        many=True, required=False, default=[], write_only=True
    )

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
            "manual_steps_input",
            "machine_steps_input",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def get_manual_steps(self, obj: Recipe) -> list:
        return CookingStepSerializer(obj.steps.filter(method="MANUAL"), many=True).data

    def get_machine_steps(self, obj: Recipe) -> list:
        return CookingStepSerializer(obj.steps.filter(method="MACHINE"), many=True).data

    def to_internal_value(self, data: dict) -> dict:
        # Allow clients to send "manual_steps" and "machine_steps" for writes;
        # map them to the write-only *_input fields internally.
        if isinstance(data, dict):
            data = data.copy()
            if "manual_steps" in data and "manual_steps_input" not in data:
                data["manual_steps_input"] = data.pop("manual_steps")
            if "machine_steps" in data and "machine_steps_input" not in data:
                data["machine_steps_input"] = data.pop("machine_steps")
        return super().to_internal_value(data)

    def _save_ingredients(self, recipe: Recipe, ingredients_data: list) -> None:
        recipe.ingredients.all().delete()
        for item in ingredients_data:
            RecipeIngredient.objects.create(recipe=recipe, **item)

    def _save_steps(self, recipe: Recipe, steps_data: list, method: str) -> None:
        recipe.steps.filter(method=method).delete()
        for item in steps_data:
            CookingStep.objects.create(recipe=recipe, method=method, **item)

    @transaction.atomic
    def create(self, validated_data: dict) -> Recipe:
        ingredients_data = validated_data.pop("ingredients", [])
        manual_steps_data = validated_data.pop("manual_steps_input", [])
        machine_steps_data = validated_data.pop("machine_steps_input", [])

        household = self.context["request"].user.active_household
        recipe = Recipe.objects.create(household=household, **validated_data)

        self._save_ingredients(recipe, ingredients_data)
        self._save_steps(recipe, manual_steps_data, "MANUAL")
        self._save_steps(recipe, machine_steps_data, "MACHINE")

        return recipe

    @transaction.atomic
    def update(self, instance: Recipe, validated_data: dict) -> Recipe:
        ingredients_data = validated_data.pop("ingredients", None)
        manual_steps_data = validated_data.pop("manual_steps_input", None)
        machine_steps_data = validated_data.pop("machine_steps_input", None)

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
