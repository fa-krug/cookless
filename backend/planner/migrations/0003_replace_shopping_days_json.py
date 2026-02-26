from django.db import migrations, models


def copy_shopping_days_forward(apps, schema_editor):
    MealPlan = apps.get_model("planner", "MealPlan")
    for plan in MealPlan.objects.all():
        days = plan.shopping_days or []
        if days:
            plan.shopping_day_1 = days[0]
            if len(days) > 1:
                plan.shopping_day_2 = days[1]
            plan.save(update_fields=["shopping_day_1", "shopping_day_2"])


class Migration(migrations.Migration):
    dependencies = [
        ("planner", "0002_rework_mealplan_add_planiteration"),
    ]

    operations = [
        # Step 1: Add new fields
        migrations.AddField(
            model_name="mealplan",
            name="shopping_day_1",
            field=models.PositiveSmallIntegerField(
                default=5, help_text="First shopping weekday (0=Mon..6=Sun)"
            ),
        ),
        migrations.AddField(
            model_name="mealplan",
            name="shopping_day_2",
            field=models.PositiveSmallIntegerField(
                blank=True,
                null=True,
                help_text="Optional second shopping weekday (0=Mon..6=Sun)",
            ),
        ),
        # Step 2: Copy data
        migrations.RunPython(copy_shopping_days_forward, migrations.RunPython.noop),
        # Step 3: Remove old field
        migrations.RemoveField(
            model_name="mealplan",
            name="shopping_days",
        ),
    ]
