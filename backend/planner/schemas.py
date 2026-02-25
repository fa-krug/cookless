from datetime import date, datetime
from uuid import UUID

from ninja import Schema


class SetupPlanIn(Schema):
    iteration_weeks: int = 1
    shopping_days: list[int]
    servings: int = 2
    known_ratio: float = 0.7
    default_leftover_days: int = 1
    start_date: date


class MealPlanEntryOut(Schema):
    id: UUID
    date: date
    meal_type: str
    recipe: UUID
    servings: int
    is_leftover: bool
    source_entry: UUID | None = None
    is_locked: bool

    @staticmethod
    def resolve_recipe(obj):
        return obj.recipe_id

    @staticmethod
    def resolve_source_entry(obj):
        return obj.source_entry_id


class PlanIterationOut(Schema):
    id: UUID
    start_date: date
    end_date: date
    status: str
    entries: list[MealPlanEntryOut]
    created_at: datetime


class MealPlanOut(Schema):
    id: UUID
    iteration_weeks: int
    shopping_days: list[int]
    servings: int
    known_ratio: float
    default_leftover_days: int
    iterations: list[PlanIterationOut]
    created_at: datetime
