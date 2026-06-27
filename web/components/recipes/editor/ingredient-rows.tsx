"use client";

import { useState } from "react";
import { useFormContext, useFieldArray } from "react-hook-form";
import { useT } from "@/lib/i18n/provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { RecipeFormValues } from "@/lib/schemas/recipe";
import type { IngredientLite, UnitLite } from "@/lib/queries/recipes";
import type { Locale } from "@/lib/i18n/config";

function ingredientName(i: IngredientLite, locale: Locale) {
  return locale === "de" ? i.nameDe : i.nameEn;
}

export function IngredientRows({
  ingredients, units, locale,
}: { ingredients: IngredientLite[]; units: UnitLite[]; locale: Locale }) {
  const { t } = useT();
  const { control, register, setValue, watch } = useFormContext<RecipeFormValues>();
  const { fields, append, remove } = useFieldArray({ control, name: "ingredients" });
  const [query, setQuery] = useState("");

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-medium">{t("ingredients.title")}</h2>
      {fields.map((field, idx) => {
        const matches = query.trim()
          ? ingredients.filter((i) => ingredientName(i, locale).toLowerCase().includes(query.toLowerCase())).slice(0, 6)
          : [];
        return (
          <div key={field.id} className="flex flex-wrap items-center gap-2 rounded-md border p-2">
            <div className="relative min-w-[10rem] flex-1">
              <Input
                defaultValue={watch(`ingredients.${idx}.nameEn`)}
                placeholder={t("ingredients.searchPlaceholder")}
                onChange={(e) => {
                  const v = e.target.value;
                  setQuery(v);
                  setValue(`ingredients.${idx}.ingredientId`, null);
                  setValue(`ingredients.${idx}.nameEn`, v);
                  setValue(`ingredients.${idx}.nameDe`, v);
                }}
              />
              {matches.length > 0 && (
                <ul className="absolute z-10 mt-1 w-full rounded-md border bg-popover shadow">
                  {matches.map((m) => (
                    <li key={m.id}>
                      <button
                        type="button"
                        className="block w-full px-2 py-1 text-left text-sm hover:bg-accent"
                        onClick={() => {
                          setValue(`ingredients.${idx}.ingredientId`, m.id);
                          setValue(`ingredients.${idx}.nameEn`, m.nameEn);
                          setValue(`ingredients.${idx}.nameDe`, m.nameDe);
                          setQuery("");
                        }}
                      >
                        {ingredientName(m, locale)}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <Input className="w-20" placeholder={t("ingredients.quantity")} {...register(`ingredients.${idx}.quantity`)} />
            <select
              className="rounded-md border bg-background p-2 text-sm"
              {...register(`ingredients.${idx}.unitId`, { valueAsNumber: true })}
            >
              {units.map((u) => (
                <option key={u.id} value={u.id}>{u.abbreviation}</option>
              ))}
            </select>
            <Button type="button" variant="ghost" onClick={() => remove(idx)}>{t("common.remove")}</Button>
          </div>
        );
      })}
      <Button
        type="button"
        variant="outline"
        onClick={() => append({ ingredientId: null, nameEn: "", nameDe: "", quantity: "", unitId: units[0]?.id ?? 1 })}
      >
        {t("ingredients.add")}
      </Button>
    </section>
  );
}
