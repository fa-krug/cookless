from datetime import datetime
from decimal import Decimal
from uuid import UUID

from ninja import Schema


class ShoppingListItemOut(Schema):
    id: UUID
    ingredient_name: str
    ingredient_category: str
    quantity: Decimal
    unit_abbreviation: str
    is_checked: bool

    @staticmethod
    def resolve_ingredient_name(obj):
        return obj.ingredient.name_en

    @staticmethod
    def resolve_ingredient_category(obj):
        return obj.ingredient.category

    @staticmethod
    def resolve_unit_abbreviation(obj):
        return obj.unit.abbreviation


class ShoppingListOut(Schema):
    id: UUID
    meal_plan: UUID
    items: list[ShoppingListItemOut]
    created_at: datetime

    @staticmethod
    def resolve_meal_plan(obj):
        return obj.meal_plan_id


class GenerateShoppingListIn(Schema):
    meal_plan: UUID


class BulkToggleIn(Schema):
    item_ids: list[UUID]
    is_checked: bool
