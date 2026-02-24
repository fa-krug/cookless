from datetime import datetime
from decimal import Decimal
from uuid import UUID

from ninja import Schema


class UnitOut(Schema):
    id: int
    name_de: str
    name_en: str
    abbreviation: str


class IngredientOut(Schema):
    id: int
    name_de: str
    name_en: str
    category: str


class IngredientCreateIn(Schema):
    name_de: str
    name_en: str
    category: str = "OTHER"


class RecipeIngredientOut(Schema):
    id: int
    ingredient: int
    quantity: Decimal
    unit: int
    order: int

    @staticmethod
    def resolve_ingredient(obj):
        return obj.ingredient_id

    @staticmethod
    def resolve_unit(obj):
        return obj.unit_id


class CookingStepOut(Schema):
    id: int
    step_number: int
    instruction: str


class RecipeOut(Schema):
    id: UUID
    title: str
    list_type: str
    default_servings: int
    prep_time_minutes: int | None = None
    cook_time_minutes: int | None = None
    ingredients: list[RecipeIngredientOut]
    manual_steps: list[CookingStepOut]
    machine_steps: list[CookingStepOut]
    created_at: datetime
    updated_at: datetime

    @staticmethod
    def resolve_manual_steps(obj):
        return obj.steps.filter(method="MANUAL")

    @staticmethod
    def resolve_machine_steps(obj):
        return obj.steps.filter(method="MACHINE")


class CookingStepIn(Schema):
    step_number: int
    instruction: str


class RecipeIngredientIn(Schema):
    ingredient: int
    quantity: Decimal
    unit: int
    order: int = 0


class RecipeCreateIn(Schema):
    title: str
    list_type: str
    default_servings: int = 2
    prep_time_minutes: int | None = None
    cook_time_minutes: int | None = None
    ingredients: list[RecipeIngredientIn] = []
    manual_steps: list[CookingStepIn] = []
    machine_steps: list[CookingStepIn] = []
