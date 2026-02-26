from typing import Literal
from uuid import UUID

from ninja import Schema


class TagOut(Schema):
    id: UUID
    category: str
    name_en: str
    name_de: str
    is_default: bool


class TagCreateIn(Schema):
    category: Literal["DIETARY", "PROTEIN", "CUISINE", "MEAL_TYPE"]
    name_en: str
    name_de: str


class TagUpdateIn(Schema):
    name_en: str
    name_de: str


class GroupedTagsOut(Schema):
    DIETARY: list[TagOut] = []
    PROTEIN: list[TagOut] = []
    CUISINE: list[TagOut] = []
    MEAL_TYPE: list[TagOut] = []
