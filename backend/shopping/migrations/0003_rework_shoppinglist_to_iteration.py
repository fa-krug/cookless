# Rework ShoppingList FK from MealPlan to PlanIteration

import django.db.models.deletion
from django.db import migrations, models


def migrate_shopping_lists(apps, schema_editor):
    """
    For each ShoppingList pointing at a MealPlan, find the corresponding
    PlanIteration (created in planner migration) and point the ShoppingList at it.
    """
    ShoppingList = apps.get_model("shopping", "ShoppingList")
    PlanIteration = apps.get_model("planner", "PlanIteration")

    for sl in ShoppingList.objects.all():
        # Find the iteration created from this meal_plan
        iteration = PlanIteration.objects.filter(meal_plan=sl.meal_plan).first()
        if iteration:
            sl.iteration = iteration
            sl.save(update_fields=["iteration"])


class Migration(migrations.Migration):
    dependencies = [
        ("shopping", "0002_alter_shoppinglistitem_options"),
        ("planner", "0002_rework_mealplan_add_planiteration"),
    ]

    operations = [
        # 1. Add nullable iteration FK
        migrations.AddField(
            model_name="shoppinglist",
            name="iteration",
            field=models.ForeignKey(
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name="shopping_lists",
                to="planner.planiteration",
            ),
        ),
        # 2. Add shopping_date field
        migrations.AddField(
            model_name="shoppinglist",
            name="shopping_date",
            field=models.DateField(blank=True, null=True),
        ),
        # 3. Migrate data
        migrations.RunPython(migrate_shopping_lists, migrations.RunPython.noop),
        # 4. Make iteration FK non-nullable
        migrations.AlterField(
            model_name="shoppinglist",
            name="iteration",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE,
                related_name="shopping_lists",
                to="planner.planiteration",
            ),
        ),
        # 5. Remove old meal_plan FK
        migrations.RemoveField(
            model_name="shoppinglist",
            name="meal_plan",
        ),
    ]
