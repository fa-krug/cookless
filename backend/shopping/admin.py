from django.contrib import admin

from shopping.models import ShoppingList, ShoppingListItem


class ShoppingListItemInline(admin.TabularInline):
    model = ShoppingListItem
    extra = 0


@admin.register(ShoppingList)
class ShoppingListAdmin(admin.ModelAdmin):
    list_display = ["meal_plan", "created_at"]
    inlines = [ShoppingListItemInline]


@admin.register(ShoppingListItem)
class ShoppingListItemAdmin(admin.ModelAdmin):
    list_display = ["shopping_list", "ingredient", "quantity", "unit", "is_checked"]
