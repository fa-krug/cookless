from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('recipes', '0007_recipe_description'),
    ]

    operations = [
        migrations.CreateModel(
            name='StepIngredient',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('quantity', models.DecimalField(decimal_places=2, max_digits=10)),
                ('recipe_ingredient', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='step_usages', to='recipes.recipeingredient')),
                ('step', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='step_ingredients', to='recipes.cookingstep')),
            ],
            options={
                'ordering': ['id'],
            },
        ),
    ]
