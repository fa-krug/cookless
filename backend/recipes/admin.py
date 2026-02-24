from django.contrib import admin

from recipes.models import CookingStep, Ingredient, Recipe, RecipeIngredient, Unit


@admin.register(Ingredient)
class IngredientAdmin(admin.ModelAdmin):
    list_display = ("name_en", "name_de", "category")
    list_filter = ("category",)
    search_fields = ("name_en", "name_de")


@admin.register(Unit)
class UnitAdmin(admin.ModelAdmin):
    list_display = ("abbreviation", "name_en", "name_de", "base_unit", "conversion_factor")
    search_fields = ("name_en", "name_de", "abbreviation")


class RecipeIngredientInline(admin.TabularInline):
    model = RecipeIngredient
    extra = 0


class CookingStepInline(admin.TabularInline):
    model = CookingStep
    extra = 0


@admin.register(Recipe)
class RecipeAdmin(admin.ModelAdmin):
    list_display = ("title", "household", "list_type", "default_servings", "created_at")
    list_filter = ("list_type",)
    search_fields = ("title",)
    readonly_fields = ("created_at", "updated_at")
    inlines = [RecipeIngredientInline, CookingStepInline]
