import uuid

from django.db import models


class ShoppingList(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    meal_plan = models.ForeignKey(
        "planner.MealPlan", on_delete=models.CASCADE, related_name="shopping_lists"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self) -> str:
        return f"Shopping list for {self.meal_plan}"


class ShoppingListItem(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    shopping_list = models.ForeignKey(ShoppingList, on_delete=models.CASCADE, related_name="items")
    ingredient = models.ForeignKey("recipes.Ingredient", on_delete=models.CASCADE)
    quantity = models.DecimalField(max_digits=10, decimal_places=2)
    unit = models.ForeignKey("recipes.Unit", on_delete=models.CASCADE)
    is_checked = models.BooleanField(default=False)

    class Meta:
        ordering = ["ingredient__category", "ingredient__name_en"]

    def __str__(self) -> str:
        return f"{self.ingredient} - {self.quantity} {self.unit}"
