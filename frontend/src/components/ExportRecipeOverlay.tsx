import { useState } from "react";
import { Share2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import type { Recipe } from "../api/types";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Spinner } from "@/components/ui/Spinner";
import ResponsiveOverlay from "./ui/ResponsiveOverlay";
import { useIngredients } from "../hooks/useIngredients";
import { useUnits } from "../hooks/useUnits";
import { generateMarkdown, generatePdf, shareOrDownload } from "../lib/exportRecipe";

interface ExportRecipeOverlayProps {
  open: boolean;
  onClose: () => void;
  recipe: Recipe;
}

export default function ExportRecipeOverlay({ open, onClose, recipe }: ExportRecipeOverlayProps) {
  const { t, i18n } = useTranslation();
  const { data: allIngredients = [] } = useIngredients();
  const { data: allUnits = [] } = useUnits();

  const [includeImage, setIncludeImage] = useState(true);
  const [includeDescription, setIncludeDescription] = useState(true);
  const [includeIngredients, setIncludeIngredients] = useState(true);
  const [includeSteps, setIncludeSteps] = useState(true);
  const [portions, setPortions] = useState(recipe.default_servings);
  const [format, setFormat] = useState<"markdown" | "pdf">("markdown");
  const [exporting, setExporting] = useState(false);

  async function handleExport() {
    setExporting(true);
    try {
      const options = {
        recipe,
        allIngredients,
        allUnits,
        lang: i18n.language,
        portions,
        includeDescription,
        includeIngredients,
        includeSteps,
      };

      const content =
        format === "markdown" ? generateMarkdown(options) : await generatePdf({ ...options, includeImage });

      const result = await shareOrDownload(recipe, content, format);
      toast.success(t(result === "shared" ? "export.shared" : "export.downloaded"));
      onClose();
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      toast.error(t("export.failed"));
    } finally {
      setExporting(false);
    }
  }

  return (
    <ResponsiveOverlay open={open} onClose={onClose} title={t("export.title")}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleExport();
        }}
        className="space-y-5"
      >
        {/* What to include */}
        <div>
          <h4 className="mb-2 text-xs font-medium uppercase text-muted-foreground">
            {t("export.includeSection")}
          </h4>
          <div className="space-y-0.5">
            {recipe.image && (
              <label className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 hover:bg-muted">
                <Checkbox checked={includeImage} onCheckedChange={(c) => setIncludeImage(!!c)} />
                <span className="text-sm">{t("export.includeImage")}</span>
              </label>
            )}
            <label className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 hover:bg-muted">
              <Checkbox
                checked={includeDescription}
                onCheckedChange={(c) => setIncludeDescription(!!c)}
              />
              <span className="text-sm">{t("export.includeDescription")}</span>
            </label>
            <label className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 hover:bg-muted">
              <Checkbox
                checked={includeIngredients}
                onCheckedChange={(c) => setIncludeIngredients(!!c)}
              />
              <span className="text-sm">{t("export.includeIngredients")}</span>
            </label>
            <label className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 hover:bg-muted">
              <Checkbox checked={includeSteps} onCheckedChange={(c) => setIncludeSteps(!!c)} />
              <span className="text-sm">{t("export.includeSteps")}</span>
            </label>
          </div>
        </div>

        {/* Portions */}
        <div>
          <Label>{t("export.portions")}</Label>
          <Input
            type="number"
            min={1}
            value={portions}
            onChange={(e) => setPortions(Math.max(1, parseInt(e.target.value) || 1))}
            className="mt-1 w-24"
          />
        </div>

        {/* Format */}
        <div>
          <Label className="mb-1 block">{t("export.format")}</Label>
          <ToggleGroup
            type="single"
            value={format}
            onValueChange={(v) => {
              if (v) setFormat(v as "markdown" | "pdf");
            }}
            variant="outline"
          >
            <ToggleGroupItem value="markdown">{t("export.formatMarkdown")}</ToggleGroupItem>
            <ToggleGroupItem value="pdf">{t("export.formatPdf")}</ToggleGroupItem>
          </ToggleGroup>
        </div>

        {/* Export button */}
        <Button className="w-full" type="submit" disabled={exporting}>
          {exporting ? <Spinner /> : <Share2 size={16} />}
          {t("export.share")}
        </Button>
      </form>
    </ResponsiveOverlay>
  );
}
