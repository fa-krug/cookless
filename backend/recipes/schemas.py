from datetime import datetime
from decimal import Decimal
from uuid import UUID

from ninja import Schema
from pydantic import Field

from recipes.tag_schemas import TagOut


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


class RecipeListOut(Schema):
    id: UUID
    title: str
    list_type: str
    default_servings: int
    prep_time_minutes: int | None = None
    cook_time_minutes: int | None = None
    leftover_days: int | None = None
    image: str | None = None
    created_at: datetime
    updated_at: datetime
    tags: list[TagOut] = []

    @staticmethod
    def resolve_image(obj, context):
        if obj.image:
            request = context["request"]
            return request.build_absolute_uri(obj.image.url)
        return None


class PaginatedRecipeListOut(Schema):
    items: list[RecipeListOut]
    total_count: int


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
    leftover_days: int | None = None
    image: str | None = None
    ingredients: list[RecipeIngredientOut]
    manual_steps: list[CookingStepOut]
    machine_steps: list[CookingStepOut]
    created_at: datetime
    updated_at: datetime
    tags: list[TagOut] = []

    @staticmethod
    def resolve_image(obj, context):
        if obj.image:
            request = context["request"]
            return request.build_absolute_uri(obj.image.url)
        return None

    @staticmethod
    def resolve_manual_steps(obj):
        if hasattr(obj, "manual_steps_list"):
            return obj.manual_steps_list
        return obj.steps.filter(method="MANUAL")

    @staticmethod
    def resolve_machine_steps(obj):
        if hasattr(obj, "machine_steps_list"):
            return obj.machine_steps_list
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
    leftover_days: int | None = None
    ingredients: list[RecipeIngredientIn] = []
    manual_steps: list[CookingStepIn] = []
    machine_steps: list[CookingStepIn] = []
    tag_ids: list[UUID] = []


class GenerateRecipesIn(Schema):
    count: int = Field(default=10, ge=1, le=20)
    tag_ids: list[UUID] = []
    free_text: str = ""
    generate_images: bool = True
