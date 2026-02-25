# Rework MealPlan into config container + PlanIteration

import uuid

import django.db.models.deletion
from django.db import migrations, models


def migrate_data_forward(apps, schema_editor):
    """
    For each existing MealPlan, create a PlanIteration with its start_date/end_date,
    then point all MealPlanEntry rows at the new PlanIteration.
    """
    MealPlan = apps.get_model("planner", "MealPlan")
    PlanIteration = apps.get_model("planner", "PlanIteration")
    MealPlanEntry = apps.get_model("planner", "MealPlanEntry")

    for mp in MealPlan.objects.all():
        iteration = PlanIteration.objects.create(
            meal_plan=mp,
            start_date=mp.start_date,
            end_date=mp.end_date,
            status="ACTIVE",
        )
        MealPlanEntry.objects.filter(meal_plan=mp).update(iteration=iteration)


class Migration(migrations.Migration):
    dependencies = [
        ("planner", "0001_initial"),
        ("users", "0004_invite"),
    ]

    operations = [
        # 1. Create PlanIteration model
        migrations.CreateModel(
            name="PlanIteration",
            fields=[
                (
                    "id",
                    models.UUIDField(
                        default=uuid.uuid4,
                        editable=False,
                        primary_key=True,
                        serialize=False,
                    ),
                ),
                ("start_date", models.DateField()),
                ("end_date", models.DateField()),
                (
                    "status",
                    models.CharField(
                        choices=[("ACTIVE", "Active"), ("ARCHIVED", "Archived")],
                        default="ACTIVE",
                        max_length=10,
                    ),
                ),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                (
                    "meal_plan",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="iterations",
                        to="planner.mealplan",
                    ),
                ),
            ],
            options={
                "ordering": ["-start_date"],
            },
        ),
        # 2. Add nullable iteration FK to MealPlanEntry (temporary)
        migrations.AddField(
            model_name="mealplanentry",
            name="iteration",
            field=models.ForeignKey(
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name="entries",
                to="planner.planiteration",
            ),
            preserve_default=False,
        ),
        # 3. Migrate data: create PlanIteration per MealPlan, link entries
        migrations.RunPython(migrate_data_forward, migrations.RunPython.noop),
        # 4. Make iteration FK non-nullable
        migrations.AlterField(
            model_name="mealplanentry",
            name="iteration",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE,
                related_name="entries",
                to="planner.planiteration",
            ),
        ),
        # 5. Remove old meal_plan FK from MealPlanEntry
        migrations.RemoveField(
            model_name="mealplanentry",
            name="meal_plan",
        ),
        # 6. Remove start_date and end_date from MealPlan
        migrations.RemoveField(
            model_name="mealplan",
            name="start_date",
        ),
        migrations.RemoveField(
            model_name="mealplan",
            name="end_date",
        ),
        # 7. Add new MealPlan config fields
        migrations.AddField(
            model_name="mealplan",
            name="iteration_weeks",
            field=models.PositiveIntegerField(default=1),
        ),
        migrations.AddField(
            model_name="mealplan",
            name="shopping_days",
            field=models.JSONField(
                default=list,
                help_text="List of weekday ints (0=Mon..6=Sun)",
            ),
        ),
        migrations.AddField(
            model_name="mealplan",
            name="servings",
            field=models.PositiveIntegerField(default=2),
        ),
        migrations.AddField(
            model_name="mealplan",
            name="known_ratio",
            field=models.FloatField(default=0.7),
        ),
        migrations.AddField(
            model_name="mealplan",
            name="default_leftover_days",
            field=models.PositiveIntegerField(default=1),
        ),
        # 8. Change household FK to OneToOneField
        migrations.AlterField(
            model_name="mealplan",
            name="household",
            field=models.OneToOneField(
                on_delete=django.db.models.deletion.CASCADE,
                related_name="meal_plan",
                to="users.household",
            ),
        ),
    ]
