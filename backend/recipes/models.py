from __future__ import annotations

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


class TagCategory(models.TextChoices):
    DIETARY = "DIETARY", "Dietary"
    PROTEIN = "PROTEIN", "Protein"
    CUISINE = "CUISINE", "Cuisine"
    MEAL_TYPE = "MEAL_TYPE", "Meal Type"


class Tag(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    household = models.ForeignKey("users.Household", on_delete=models.CASCADE, related_name="tags")
    category = models.CharField(max_length=20, choices=TagCategory.choices)
    name_en = models.CharField(max_length=60)
    name_de = models.CharField(max_length=60)
    is_default = models.BooleanField(default=False)

    class Meta:
        ordering = ["category", "name_en"]
        constraints = [
            models.UniqueConstraint(
                fields=["household", "category", "name_en"],
                name="unique_tag_per_household_category",
            )
        ]

    def __str__(self) -> str:
        return f"{self.category}: {self.name_en}"


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
    leftover_days = models.PositiveIntegerField(null=True, blank=True)
    image = models.ImageField(upload_to="recipes/", blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    tags: models.ManyToManyField[Tag, models.Model] = models.ManyToManyField(
        "Tag", blank=True, related_name="recipes"
    )

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
    PROGRAM_CHOICES = [
        ("MANUAL_COOKING", "Manual Cooking"),
        ("CHOPPING", "Chopping"),
        ("KNEADING", "Kneading"),
        ("STEAMING", "Steaming"),
        ("BLENDING", "Blending"),
        ("SEARING", "Searing"),
        ("SLOW_COOKING", "Slow Cooking"),
        ("SOUS_VIDE", "Sous Vide"),
        ("WEIGHING", "Weighing"),
        ("TURBO", "Turbo"),
        ("EGG_COOKING", "Egg Cooking"),
        ("FERMENTATION", "Fermentation"),
        ("PRE_CLEANING", "Pre-Cleaning"),
    ]
    DIRECTION_CHOICES = [("LEFT", "Left"), ("RIGHT", "Right")]

    recipe = models.ForeignKey(Recipe, on_delete=models.CASCADE, related_name="steps")
    method = models.CharField(max_length=10, choices=METHOD_CHOICES)
    step_number = models.PositiveIntegerField()
    instruction = models.TextField(blank=True, default="")
    program_type = models.CharField(max_length=20, choices=PROGRAM_CHOICES, blank=True, default="")
    temperature = models.PositiveIntegerField(null=True, blank=True)
    duration_seconds = models.PositiveIntegerField(null=True, blank=True)
    speed = models.PositiveIntegerField(null=True, blank=True)
    turbo = models.BooleanField(default=False)
    direction = models.CharField(max_length=5, choices=DIRECTION_CHOICES, blank=True, default="")
    weight_grams = models.PositiveIntegerField(null=True, blank=True)

    class Meta:
        ordering = ["method", "step_number"]

    def __str__(self) -> str:
        return f"{self.recipe.title} - {self.method} step {self.step_number}"
