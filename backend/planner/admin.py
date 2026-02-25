from django.contrib import admin

from planner.models import MealPlan, MealPlanEntry, PlanIteration


class PlanIterationInline(admin.TabularInline):
    model = PlanIteration
    extra = 0


@admin.register(MealPlan)
class MealPlanAdmin(admin.ModelAdmin):
    list_display = ("household", "iteration_weeks", "servings", "created_at")
    list_filter = ("household",)
    readonly_fields = ("created_at",)
    inlines = [PlanIterationInline]


@admin.register(PlanIteration)
class PlanIterationAdmin(admin.ModelAdmin):
    list_display = ("meal_plan", "start_date", "end_date", "status", "created_at")
    list_filter = ("status",)
    readonly_fields = ("created_at",)


@admin.register(MealPlanEntry)
class MealPlanEntryAdmin(admin.ModelAdmin):
    list_display = (
        "iteration",
        "date",
        "meal_type",
        "recipe",
        "servings",
        "is_leftover",
        "is_locked",
    )
    list_filter = ("meal_type", "is_leftover", "is_locked")
