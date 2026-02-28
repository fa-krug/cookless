import { Plus, X } from "lucide-react";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type {
  FieldArrayWithId,
  UseFieldArrayAppend,
  UseFieldArrayRemove,
  UseFieldArrayUpdate,
} from "react-hook-form";
import type { RecipeFormValues } from "@/lib/schemas/recipe";
import type { Ingredient, Unit } from "../api/types";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/IconButton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import ResponsiveOverlay from "./ui/ResponsiveOverlay";
import { ScrollArea } from "@/components/ui/scroll-area";

export type IngredientRow = RecipeFormValues["ingredients"][number];

interface IngredientFormProps {
  fields: FieldArrayWithId<RecipeFormValues, "ingredients">[];
  append: UseFieldArrayAppend<RecipeFormValues, "ingredients">;
  remove: UseFieldArrayRemove;
  update: UseFieldArrayUpdate<RecipeFormValues, "ingredients">;
  allIngredients: Ingredient[];
  allUnits: Unit[];
}

export default function IngredientForm({
  fields,
  append,
  remove,
  update,
  allIngredients,
  allUnits,
}: IngredientFormProps) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === "de" ? "de" : "en";
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  function addRow() {
    const newIndex = fields.length;
    append({
      ingredient: 0,
      ingredientName: "",
      quantity: "",
      unit: allUnits.length > 0 ? allUnits[0].id : 0,
      order: newIndex,
    });
    setEditingIndex(newIndex);
  }

  function removeRow(index: number) {
    setEditingIndex(null);
    remove(index);
  }

  function updateRow(index: number, partial: Partial<IngredientRow>) {
    const current = fields[index];
    update(index, { ...current, ...partial });
  }

  const nameKey = lang === "de" ? "name_de" : "name_en";

  return (
    <div>
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium">{t("ingredients.title")}</h3>
        <IconButton
          type="button"
          onClick={addRow}
          className="h-8 w-8"
          tooltip={t("ingredients.add")}
          aria-label={t("ingredients.add")}
        >
          <Plus size={18} />
        </IconButton>
      </div>

      {fields.length === 0 && (
        <p className="mt-2 text-sm text-muted-foreground">{t("ingredients.noIngredients")}</p>
      )}

      <div className="mt-3 space-y-2">
        {fields.map((row, index) => {
          const unitObj = allUnits.find((u) => u.id === row.unit);
          const unitLabel = unitObj?.abbreviation || unitObj?.[nameKey] || "";
          const displayText = row.ingredientName
            ? `${row.quantity ? row.quantity + " " : ""}${unitLabel ? unitLabel + " " : ""}${row.ingredientName}`
            : t("ingredients.search");
          const isEmpty = !row.ingredientName;

          return (
            <div
              key={row.id}
              className="flex cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-2.5"
              onClick={() => setEditingIndex(index)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setEditingIndex(index);
                }
              }}
            >
              <span
                className={`min-w-0 flex-1 truncate text-sm ${isEmpty ? "italic text-muted-foreground" : ""}`}
              >
                {displayText}
              </span>
              <IconButton
                type="button"
                variant="ghost"
                onClick={(e) => {
                  e.stopPropagation();
                  removeRow(index);
                }}
                className="h-8 w-8 shrink-0 text-destructive hover:bg-destructive/10"
                tooltip={t("common.remove")}
                aria-label={t("common.remove")}
              >
                <X size={16} />
              </IconButton>
            </div>
          );
        })}
      </div>

      {editingIndex !== null && fields[editingIndex] && (
        <IngredientEditDrawer
          row={fields[editingIndex]}
          index={editingIndex}
          lang={lang}
          allIngredients={allIngredients}
          allUnits={allUnits}
          onUpdate={updateRow}
          onClose={() => setEditingIndex(null)}
        />
      )}
    </div>
  );
}

interface IngredientEditDrawerProps {
  row: IngredientRow;
  index: number;
  lang: "en" | "de";
  allIngredients: Ingredient[];
  allUnits: Unit[];
  onUpdate: (index: number, partial: Partial<IngredientRow>) => void;
  onClose: () => void;
}

function IngredientEditDrawer({
  row,
  index,
  lang,
  allIngredients,
  allUnits,
  onUpdate,
  onClose,
}: IngredientEditDrawerProps) {
  const { t } = useTranslation();
  const [search, setSearch] = useState(row.ingredientName);
  const [showDropdown, setShowDropdown] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const nameKey = lang === "de" ? "name_de" : "name_en";

  const filtered = search.trim()
    ? allIngredients.filter((ing) => ing[nameKey].toLowerCase().includes(search.toLowerCase()))
    : allIngredients;

  function selectIngredient(ing: Ingredient) {
    onUpdate(index, { ingredient: ing.id, ingredientName: ing[nameKey] });
    setSearch(ing[nameKey]);
    setShowDropdown(false);
  }

  return (
    <ResponsiveOverlay open={true} onClose={onClose} title={t("ingredients.name")} size="sm">
      <div className="space-y-4">
        <div className="flex gap-3">
          <div className="flex-1">
            <Label>
              {t("ingredients.quantity")}
            </Label>
            <Input
              type="text"
              inputMode="decimal"
              value={row.quantity}
              onChange={(e) => onUpdate(index, { quantity: e.target.value })}
              placeholder={t("ingredients.quantity")}
            />
          </div>
          <div className="flex-1">
            <Label>
              {t("ingredients.unit")}
            </Label>
            <Select
              value={String(row.unit)}
              onValueChange={(val) => onUpdate(index, { unit: Number(val) })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {allUnits.map((u) => (
                  <SelectItem key={u.id} value={String(u.id)}>
                    {u.abbreviation || u[nameKey]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="relative" ref={wrapperRef}>
          <Label>
            {t("ingredients.name")}
          </Label>
          <Input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setShowDropdown(true);
            }}
            onFocus={() => setShowDropdown(true)}
            onBlur={() => {
              setTimeout(() => setShowDropdown(false), 200);
            }}
            placeholder={t("ingredients.search")}
          />
          {showDropdown && filtered.length > 0 && (
            <ul className="absolute z-10 mt-1 w-full rounded-md border border-border bg-card shadow-lg">
              <ScrollArea className="max-h-40">
                {filtered.slice(0, 20).map((ing) => (
                  <li key={ing.id}>
                    <Button
                      type="button"
                      variant="ghost"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => selectIngredient(ing)}
                      className="w-full justify-start px-3 py-1.5 text-sm font-normal hover:bg-primary/10"
                    >
                      {ing[nameKey]}
                    </Button>
                  </li>
                ))}
              </ScrollArea>
            </ul>
          )}
        </div>
      </div>
    </ResponsiveOverlay>
  );
}
