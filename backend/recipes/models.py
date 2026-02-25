import uuid
from decimal import Decimal

from django.db import models


class Ingredient(models.Model):
    CATEGORY_CHOICES = [
        ("PRODUCE", "Produce"),
        ("DAIRY", "Dairy"),
        ("MEAT", "Meat"),
        ("PANTRY", "Pantry"),
        ("FROZEN", "Frozen"),
        ("OTHER", "Other"),
    ]
    name_de = models.CharField(max_length=255)
    name_en = models.CharField(max_length=255)
    category = models.CharField(max_length=10, choices=CATEGORY_CHOICES, default="OTHER")

    class Meta:
        ordering = ["name_en"]

    def __str__(self) -> str:
        return self.name_en


class Unit(models.Model):
    name_de = models.CharField(max_length=50)
    name_en = models.CharField(max_length=50)
    abbreviation = models.CharField(max_length=10)
    base_unit = models.ForeignKey(
        "self",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="derived_units",
    )
    conversion_factor = models.DecimalField(max_digits=10, decimal_places=6, default=Decimal("1"))

    def __str__(self) -> str:
        return self.abbreviation

    def to_base(self, quantity: int | float | Decimal) -> Decimal:
        if self.base_unit:
            return Decimal(str(quantity)) * Decimal(str(self.conversion_factor))
        return Decimal(str(quantity))


class Recipe(models.Model):
    LIST_TYPE_CHOICES = [("KNOWN", "Known"), ("TO_TRY", "To Try")]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    household = models.ForeignKey(
        "users.Household", on_delete=models.CASCADE, related_name="recipes"
    )
    title = models.CharField(max_length=255)
    list_type = models.CharField(max_length=10, choices=LIST_TYPE_CHOICES)
    default_servings = models.PositiveIntegerField(default=2)
    prep_time_minutes = models.PositiveIntegerField(null=True, blank=True)
    cook_time_minutes = models.PositiveIntegerField(null=True, blank=True)
    leftover_days = models.PositiveIntegerField(default=1)
    image = models.ImageField(upload_to="recipes/", blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self) -> str:
        return self.title


class RecipeIngredient(models.Model):
    recipe = models.ForeignKey(Recipe, on_delete=models.CASCADE, related_name="ingredients")
    ingredient = models.ForeignKey(Ingredient, on_delete=models.CASCADE)
    quantity = models.DecimalField(max_digits=10, decimal_places=2)
    unit = models.ForeignKey(Unit, on_delete=models.CASCADE)
    order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["order"]

    def __str__(self) -> str:
        return f"{self.recipe.title} - {self.ingredient}"


class CookingStep(models.Model):
    METHOD_CHOICES = [("MANUAL", "Manual"), ("MACHINE", "Machine")]

    recipe = models.ForeignKey(Recipe, on_delete=models.CASCADE, related_name="steps")
    method = models.CharField(max_length=10, choices=METHOD_CHOICES)
    step_number = models.PositiveIntegerField()
    instruction = models.TextField()

    class Meta:
        ordering = ["method", "step_number"]

    def __str__(self) -> str:
        return f"{self.recipe.title} - {self.method} step {self.step_number}"
