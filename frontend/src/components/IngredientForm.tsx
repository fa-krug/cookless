import { Plus, X } from "lucide-react";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Ingredient, Unit } from "../api/types";

export interface IngredientRow {
  ingredient: number;
  ingredientName: string;
  quantity: string;
  unit: number;
  order: number;
}

interface IngredientFormProps {
  ingredients: IngredientRow[];
  onChange: (ingredients: IngredientRow[]) => void;
  allIngredients: Ingredient[];
  allUnits: Unit[];
}

export default function IngredientForm({
  ingredients,
  onChange,
  allIngredients,
  allUnits,
}: IngredientFormProps) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === "de" ? "de" : "en";

  function addRow() {
    onChange([
      ...ingredients,
      {
        ingredient: 0,
        ingredientName: "",
        quantity: "",
        unit: allUnits.length > 0 ? allUnits[0].id : 0,
        order: ingredients.length,
      },
    ]);
  }

  function removeRow(index: number) {
    const updated = ingredients.filter((_, i) => i !== index);
    onChange(updated.map((row, i) => ({ ...row, order: i })));
  }

  function updateRow(index: number, partial: Partial<IngredientRow>) {
    const updated = ingredients.map((row, i) => (i === index ? { ...row, ...partial } : row));
    onChange(updated);
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium">{t("ingredients.title")}</h3>
        <button
          type="button"
          onClick={addRow}
          className="rounded-md bg-orange-500 p-1.5 text-white hover:bg-orange-600"
          aria-label={t("ingredients.add")}
        >
          <Plus size={18} />
        </button>
      </div>

      {ingredients.length === 0 && (
        <p className="mt-2 text-sm text-gray-500">{t("ingredients.noIngredients")}</p>
      )}

      <div className="mt-2 space-y-2">
        {ingredients.map((row, index) => (
          <IngredientRowInput
            key={index}
            row={row}
            index={index}
            lang={lang}
            allIngredients={allIngredients}
            allUnits={allUnits}
            onUpdate={updateRow}
            onRemove={removeRow}
          />
        ))}
      </div>
    </div>
  );
}

interface IngredientRowInputProps {
  row: IngredientRow;
  index: number;
  lang: "en" | "de";
  allIngredients: Ingredient[];
  allUnits: Unit[];
  onUpdate: (index: number, partial: Partial<IngredientRow>) => void;
  onRemove: (index: number) => void;
}

function IngredientRowInput({
  row,
  index,
  lang,
  allIngredients,
  allUnits,
  onUpdate,
  onRemove,
}: IngredientRowInputProps) {
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
    <div className="flex items-start gap-1.5">
      {/* Quantity */}
      <input
        type="text"
        inputMode="decimal"
        value={row.quantity}
        onChange={(e) => onUpdate(index, { quantity: e.target.value })}
        placeholder={t("ingredients.quantity")}
        className="w-16 shrink-0 rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
      />

      {/* Unit */}
      <select
        value={row.unit}
        onChange={(e) => onUpdate(index, { unit: Number(e.target.value) })}
        className="w-20 shrink-0 rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
      >
        {allUnits.map((u) => (
          <option key={u.id} value={u.id}>
            {u.abbreviation || u[nameKey]}
          </option>
        ))}
      </select>

      {/* Ingredient autocomplete */}
      <div className="relative min-w-0 flex-1" ref={wrapperRef}>
        <input
          type="text"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setShowDropdown(true);
          }}
          onFocus={() => setShowDropdown(true)}
          onBlur={() => {
            // Delay to allow click on dropdown item
            setTimeout(() => setShowDropdown(false), 200);
          }}
          placeholder={t("ingredients.search")}
          className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
        />
        {showDropdown && filtered.length > 0 && (
          <ul className="absolute z-10 mt-1 max-h-40 w-full overflow-y-auto rounded-md border border-gray-200 bg-white shadow-lg">
            {filtered.slice(0, 20).map((ing) => (
              <li key={ing.id}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => selectIngredient(ing)}
                  className="w-full px-3 py-1.5 text-left text-sm hover:bg-orange-50"
                >
                  {ing[nameKey]}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Remove */}
      <button
        type="button"
        onClick={() => onRemove(index)}
        className="shrink-0 rounded-md p-1.5 text-red-600 hover:bg-red-50"
        aria-label={t("common.remove")}
      >
        <X size={18} />
      </button>
    </div>
  );
}
