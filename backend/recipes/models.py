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
