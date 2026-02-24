import uuid

from django.db import models


class MealPlan(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    household = models.ForeignKey(
        "users.Household", on_delete=models.CASCADE, related_name="meal_plans"
    )
    start_date = models.DateField()
    end_date = models.DateField()
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self) -> str:
        return f"{self.household}: {self.start_date} to {self.end_date}"


class MealPlanEntry(models.Model):
    MEAL_TYPE_CHOICES = [
        ("BREAKFAST", "Breakfast"),
        ("LUNCH", "Lunch"),
        ("DINNER", "Dinner"),
        ("SNACK", "Snack"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    meal_plan = models.ForeignKey(MealPlan, on_delete=models.CASCADE, related_name="entries")
    date = models.DateField()
    meal_type = models.CharField(max_length=10, choices=MEAL_TYPE_CHOICES)
    recipe = models.ForeignKey("recipes.Recipe", on_delete=models.CASCADE)
    servings = models.PositiveIntegerField()
    is_leftover = models.BooleanField(default=False)
    source_entry = models.ForeignKey(
        "self", on_delete=models.SET_NULL, null=True, blank=True, related_name="leftover_entries"
    )
    is_locked = models.BooleanField(default=False)

    def __str__(self) -> str:
        return f"{self.date} {self.meal_type}: {self.recipe}"
