from django.contrib import admin

from planner.models import MealPlan, MealPlanEntry


class MealPlanEntryInline(admin.TabularInline):
    model = MealPlanEntry
    extra = 0


@admin.register(MealPlan)
class MealPlanAdmin(admin.ModelAdmin):
    list_display = ("household", "start_date", "end_date", "created_at")
    list_filter = ("household",)
    readonly_fields = ("created_at",)
    inlines = [MealPlanEntryInline]


@admin.register(MealPlanEntry)
class MealPlanEntryAdmin(admin.ModelAdmin):
    list_display = (
        "meal_plan",
        "date",
        "meal_type",
        "recipe",
        "servings",
        "is_leftover",
        "is_locked",
    )
    list_filter = ("meal_type", "is_leftover", "is_locked")
