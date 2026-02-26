from __future__ import annotations

import uuid
from typing import TYPE_CHECKING

from django.db import models

if TYPE_CHECKING:
    from recipes.models import Tag


class MealPlan(models.Model):
    """Long-lived meal plan configuration container, one per household."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    household = models.OneToOneField(
        "users.Household", on_delete=models.CASCADE, related_name="meal_plan"
    )
    iteration_weeks = models.PositiveIntegerField(default=1)
    shopping_day_1 = models.PositiveSmallIntegerField(
        default=5, help_text="First shopping weekday (0=Mon..6=Sun)"
    )
    shopping_day_2 = models.PositiveSmallIntegerField(
        null=True, blank=True, help_text="Optional second shopping weekday (0=Mon..6=Sun)"
    )
    servings = models.PositiveIntegerField(default=2)
    known_ratio = models.FloatField(default=0.7)
    default_leftover_days = models.PositiveIntegerField(default=1)
    created_at = models.DateTimeField(auto_now_add=True)
    excluded_tags: models.ManyToManyField[Tag, models.Model] = models.ManyToManyField(
        "recipes.Tag", blank=True, related_name="+"
    )

    def __str__(self) -> str:
        return f"MealPlan for {self.household}"

    @property
    def shopping_days(self) -> list[int]:
        days = [self.shopping_day_1]
        if self.shopping_day_2 is not None:
            days.append(self.shopping_day_2)
        return days


class PlanIteration(models.Model):
    """A single iteration (time window) of a meal plan."""

    class Status(models.TextChoices):
        ACTIVE = "ACTIVE", "Active"
        ARCHIVED = "ARCHIVED", "Archived"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    meal_plan = models.ForeignKey(MealPlan, on_delete=models.CASCADE, related_name="iterations")
    start_date = models.DateField()
    end_date = models.DateField()
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.ACTIVE)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-start_date"]

    def __str__(self) -> str:
        return f"{self.meal_plan.household}: {self.start_date} to {self.end_date} ({self.status})"


class MealPlanEntry(models.Model):
    MEAL_TYPE_CHOICES = [
        ("BREAKFAST", "Breakfast"),
        ("LUNCH", "Lunch"),
        ("DINNER", "Dinner"),
        ("SNACK", "Snack"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    iteration = models.ForeignKey(PlanIteration, on_delete=models.CASCADE, related_name="entries")
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
