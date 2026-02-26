from datetime import date, datetime
from uuid import UUID

from ninja import Field, Schema


class SetupPlanIn(Schema):
    iteration_weeks: int = Field(default=1, ge=1, le=3)
    shopping_days: list[int]
    servings: int = Field(default=2, ge=1, le=12)
    known_ratio: float = Field(default=0.7, ge=0.0, le=1.0)
    default_leftover_days: int = Field(default=1, ge=0, le=3)
    excluded_tag_ids: list[UUID] = []


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
    excluded_tag_ids: list[UUID] = []
    iterations: list[PlanIterationOut]
    created_at: datetime

    @staticmethod
    def resolve_excluded_tag_ids(obj):
        return [tag.id for tag in obj.excluded_tags.all()]
