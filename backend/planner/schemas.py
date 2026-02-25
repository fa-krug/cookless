from datetime import date, datetime
from uuid import UUID

from ninja import Schema


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


class MealPlanOut(Schema):
    id: UUID
    start_date: date
    end_date: date
    entries: list[MealPlanEntryOut]
    created_at: datetime


class GeneratePlanIn(Schema):
    start_date: date
    days: int = 7
    servings: int = 2
    known_ratio: float = 0.7
    default_leftover_days: int = 1


class UpdateEntryIn(Schema):
    recipe: UUID
    servings: int | None = None
    is_locked: bool | None = None
