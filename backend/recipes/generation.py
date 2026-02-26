from __future__ import annotations

import json
import urllib.error
import urllib.request
from typing import Any

from recipes.models import Ingredient, Recipe, Tag, Unit

GEMINI_TEXT_URL = (
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent"
)

MAX_INGREDIENTS = 200
MAX_REFERENCE_RECIPES = 10


def build_generation_prompt(
    household: Any,
    count: int,
    tag_ids: list[str],
    free_text: str,
    language: str,
) -> str:
    """Build a layered prompt for Gemini recipe generation."""

    sections: list[str] = []

    # 1. System context
    sections.append(
        "You are a professional recipe creator. "
        "Your task is to generate creative, delicious recipes. "
        "Output structured JSON only."
    )

    # 2. Output schema
    lang_note = "German" if language == "de" else "English"
    sections.append(
        f"OUTPUT SCHEMA:\n"
        f"Return a JSON array of recipe objects. Each object must have:\n"
        f"- title (string, in {lang_note})\n"
        f"- default_servings (integer, typically 2-4)\n"
        f"- prep_time_minutes (integer)\n"
        f"- cook_time_minutes (integer)\n"
        f"- leftover_days (integer, 0-3)\n"
        f"- ingredients (array of objects with: name_en, name_de, category "
        f"[PRODUCE/DAIRY/MEAT/PANTRY/FROZEN/OTHER], quantity (number), "
        f"unit_abbreviation (string), order (integer starting at 0))\n"
        f"- manual_steps (array of objects with step_number (integer) and "
        f"instruction (string in {lang_note}))\n"
        f"- machine_steps (array of objects with step_number (integer) and "
        f"instruction (string in {lang_note}), "
        f"for Thermomix or similar kitchen machines; can be empty)\n"
        f"- tag_names_en (array of strings, English tag names that apply)"
    )

    # 3. Ingredient catalog
    ingredients = list(
        Ingredient.objects.values("name_en", "name_de", "category")[:MAX_INGREDIENTS]
    )
    if ingredients:
        ingredient_lines = [
            f"  - {ing['name_en']} / {ing['name_de']} ({ing['category']})" for ing in ingredients
        ]
        sections.append(
            "EXISTING INGREDIENTS (use exact names when possible; "
            "new ingredients allowed following the same pattern):\n" + "\n".join(ingredient_lines)
        )

    # 4. Unit catalog
    units = list(Unit.objects.values("abbreviation", "name_en", "name_de"))
    if units:
        unit_lines = [f"  - {u['abbreviation']} ({u['name_en']} / {u['name_de']})" for u in units]
        sections.append("AVAILABLE UNITS:\n" + "\n".join(unit_lines))

    # 5. Tag context
    all_tags = list(
        Tag.objects.filter(household=household).values("id", "name_en", "name_de", "category")
    )
    selected_tag_id_set = set(tag_ids)
    selected_tags = [t for t in all_tags if str(t["id"]) in selected_tag_id_set]
    if selected_tags:
        required_names = [t["name_en"] for t in selected_tags]
        sections.append(
            "REQUIRED TAGS (every generated recipe MUST match these):\n" + ", ".join(required_names)
        )
    if all_tags:
        all_tag_names = [f"{t['name_en']} ({t['category']})" for t in all_tags]
        sections.append("ALL AVAILABLE TAGS:\n" + ", ".join(all_tag_names))

    # 6. Style reference — up to 10 existing recipes, prioritizing tag-matching ones
    tag_matching_recipes = (
        Recipe.objects.filter(household=household, tags__id__in=tag_ids)
        .distinct()
        .prefetch_related("ingredients__ingredient", "ingredients__unit", "steps", "tags")[
            :MAX_REFERENCE_RECIPES
        ]
    )
    tag_matching_ids = {r.id for r in tag_matching_recipes}
    remaining_slots = MAX_REFERENCE_RECIPES - len(tag_matching_recipes)
    other_recipes: list[Any] = []
    if remaining_slots > 0:
        other_recipes = list(
            Recipe.objects.filter(household=household)
            .exclude(id__in=tag_matching_ids)
            .prefetch_related("ingredients__ingredient", "ingredients__unit", "steps", "tags")[
                :remaining_slots
            ]
        )
    reference_recipes = list(tag_matching_recipes) + other_recipes

    if reference_recipes:
        ref_lines: list[str] = []
        for recipe in reference_recipes:
            tag_names = [t.name_en for t in recipe.tags.all()]
            ing_lines = []
            for ri in recipe.ingredients.all():
                ing_lines.append(
                    f"    {ri.quantity} {ri.unit.abbreviation} {ri.ingredient.name_en}"
                )
            step_lines_manual = [s.instruction for s in recipe.steps.all() if s.method == "MANUAL"]
            step_lines_machine = [
                s.instruction for s in recipe.steps.all() if s.method == "MACHINE"
            ]
            ref = (
                f"  Title: {recipe.title}\n"
                f"  Servings: {recipe.default_servings}\n"
                f"  Prep time: {recipe.prep_time_minutes} min\n"
                f"  Cook time: {recipe.cook_time_minutes} min\n"
                f"  Leftover days: {recipe.leftover_days}\n"
                f"  Tags: {', '.join(tag_names)}\n"
                f"  Ingredients:\n" + "\n".join(ing_lines) + "\n"
                f"  Manual steps: {step_lines_manual}\n"
                f"  Machine steps: {step_lines_machine}"
            )
            ref_lines.append(ref)
        sections.append(
            "STYLE REFERENCE (existing recipes for tone and format reference):\n"
            + "\n---\n".join(ref_lines)
        )

    # 7. Do NOT repeat
    all_titles = list(Recipe.objects.filter(household=household).values_list("title", flat=True))
    if all_titles:
        title_list = "\n".join(f"  - {t}" for t in all_titles)
        sections.append(
            "Do NOT recreate or closely duplicate any of the following existing recipes. "
            "Generate completely different recipes:\n" + title_list
        )

    # 8. Variety
    sections.append(
        "VARIETY: Vary cooking methods, main ingredients, and complexity across "
        "the generated recipes. Avoid repeating the same protein or cooking technique."
    )

    # 9. Free text
    if free_text and free_text.strip():
        sections.append(f"ADDITIONAL REQUIREMENTS:\n{free_text.strip()}")

    # 10. Final instruction
    sections.append(f"Generate exactly {count} recipes. Respond with ONLY the JSON array.")

    return "\n\n".join(sections)


def call_gemini_text(api_key: str, prompt: str) -> list[dict[str, Any]]:
    """Call Gemini text model and return parsed JSON array of recipes."""

    body = json.dumps(
        {
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {
                "responseMimeType": "application/json",
            },
        }
    ).encode()

    url = f"{GEMINI_TEXT_URL}?key={api_key}"
    req = urllib.request.Request(
        url,
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            resp_data = json.loads(resp.read())
    except urllib.error.URLError as exc:
        raise RuntimeError(f"Gemini API request failed: {exc}") from exc
    except TimeoutError as exc:
        raise RuntimeError("Gemini API request timed out after 60 seconds") from exc

    text = resp_data["candidates"][0]["content"]["parts"][0]["text"]
    result = json.loads(text)

    if not isinstance(result, list):
        raise ValueError("Gemini response is not a JSON array")

    return result
