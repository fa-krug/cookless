import type { CookingStep, Ingredient, Recipe, Unit } from "../api/types";

export interface ExportOptions {
  recipe: Recipe;
  allIngredients: Ingredient[];
  allUnits: Unit[];
  lang: string;
  portions: number;
  includeDescription: boolean;
  includeIngredients: boolean;
  includeSteps: boolean;
}

export interface PdfExportOptions extends ExportOptions {
  includeImage: boolean;
}

function nameKey(lang: string): "name_en" | "name_de" {
  return lang === "de" ? "name_de" : "name_en";
}

function formatQty(qty: number): string {
  return Number.isInteger(qty) ? qty.toString() : qty.toFixed(1);
}

function formatSteps(steps: CookingStep[]): string {
  return [...steps]
    .sort((a, b) => a.step_number - b.step_number)
    .map((s, i) => `${i + 1}. ${s.instruction}`)
    .join("\n");
}

export function generateMarkdown(options: ExportOptions): string {
  const { recipe, allIngredients, allUnits, lang, portions, includeDescription, includeIngredients, includeSteps } =
    options;

  const key = nameKey(lang);
  const ingredientMap = new Map(allIngredients.map((i) => [i.id, i]));
  const unitMap = new Map(allUnits.map((u) => [u.id, u]));
  const scale = recipe.default_servings > 0 ? portions / recipe.default_servings : 1;

  const lines: string[] = [];

  lines.push(`# ${recipe.title}`, "");

  if (includeDescription && recipe.description) {
    lines.push(recipe.description, "");
  }

  // Metadata
  const meta: string[] = [`${portions} ${lang === "de" ? "Portionen" : "Servings"}`];
  if (recipe.prep_time_minutes != null) {
    meta.push(`${lang === "de" ? "Vorbereitung" : "Prep"}: ${recipe.prep_time_minutes} min`);
  }
  if (recipe.cook_time_minutes != null) {
    meta.push(`${lang === "de" ? "Kochen" : "Cook"}: ${recipe.cook_time_minutes} min`);
  }
  lines.push(meta.join(" · "), "");

  if (includeIngredients && recipe.ingredients.length > 0) {
    lines.push(`## ${lang === "de" ? "Zutaten" : "Ingredients"}`, "");
    const sorted = [...recipe.ingredients].sort((a, b) => a.order - b.order);
    for (const ri of sorted) {
      const ing = ingredientMap.get(ri.ingredient);
      const unit = unitMap.get(ri.unit);
      const qty = parseFloat(ri.quantity) * scale;
      const ingName = ing ? ing[key] : "?";
      const unitAbbr = unit?.abbreviation ?? "";
      lines.push(`- ${formatQty(qty)} ${unitAbbr} ${ingName}`.trimEnd());
    }
    lines.push("");
  }

  if (includeSteps) {
    if (recipe.manual_steps.length > 0) {
      lines.push(`## ${lang === "de" ? "Zubereitung" : "Steps"}`, "");
      lines.push(formatSteps(recipe.manual_steps), "");
    }
    if (recipe.machine_steps.length > 0) {
      lines.push(`## ${lang === "de" ? "Maschinenschritte" : "Machine Steps"}`, "");
      lines.push(formatSteps(recipe.machine_steps), "");
    }
  }

  return lines.join("\n").trimEnd() + "\n";
}

export async function generatePdf(options: PdfExportOptions): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const { recipe, allIngredients, allUnits, lang, portions, includeDescription, includeIngredients, includeSteps, includeImage } =
    options;

  const key = nameKey(lang);
  const ingredientMap = new Map(allIngredients.map((i) => [i.id, i]));
  const unitMap = new Map(allUnits.map((u) => [u.id, u]));
  const scale = recipe.default_servings > 0 ? portions / recipe.default_servings : 1;

  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 15;
  const contentWidth = pageWidth - margin * 2;
  let y = margin;

  function checkPage(needed: number) {
    const pageHeight = doc.internal.pageSize.getHeight();
    if (y + needed > pageHeight - margin) {
      doc.addPage();
      y = margin;
    }
  }

  // Title
  doc.setFontSize(20);
  doc.setFont("helvetica", "bold");
  const titleLines = doc.splitTextToSize(recipe.title, contentWidth) as string[];
  checkPage(titleLines.length * 8);
  doc.text(titleLines, margin, y);
  y += titleLines.length * 8 + 4;

  // Image
  if (includeImage && recipe.image) {
    try {
      const response = await fetch(recipe.image);
      const blob = await response.blob();
      const dataUrl = await blobToDataUrl(blob);
      const imgWidth = contentWidth;
      const imgHeight = 60;
      checkPage(imgHeight + 4);
      doc.addImage(dataUrl, margin, y, imgWidth, imgHeight);
      y += imgHeight + 6;
    } catch {
      // Skip image on failure
    }
  }

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);

  // Description
  if (includeDescription && recipe.description) {
    const descLines = doc.splitTextToSize(recipe.description, contentWidth) as string[];
    checkPage(descLines.length * 5);
    doc.text(descLines, margin, y);
    y += descLines.length * 5 + 4;
  }

  // Metadata
  const meta: string[] = [`${portions} ${lang === "de" ? "Portionen" : "Servings"}`];
  if (recipe.prep_time_minutes != null) meta.push(`${lang === "de" ? "Vorbereitung" : "Prep"}: ${recipe.prep_time_minutes} min`);
  if (recipe.cook_time_minutes != null) meta.push(`${lang === "de" ? "Kochen" : "Cook"}: ${recipe.cook_time_minutes} min`);
  doc.setFontSize(9);
  doc.setTextColor(100);
  checkPage(6);
  doc.text(meta.join(" · "), margin, y);
  doc.setTextColor(0);
  y += 8;

  // Ingredients
  if (includeIngredients && recipe.ingredients.length > 0) {
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    checkPage(10);
    doc.text(lang === "de" ? "Zutaten" : "Ingredients", margin, y);
    y += 7;
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");

    const sorted = [...recipe.ingredients].sort((a, b) => a.order - b.order);
    for (const ri of sorted) {
      const ing = ingredientMap.get(ri.ingredient);
      const unit = unitMap.get(ri.unit);
      const qty = parseFloat(ri.quantity) * scale;
      const ingName = ing ? ing[key] : "?";
      const unitAbbr = unit?.abbreviation ?? "";
      const line = `• ${formatQty(qty)} ${unitAbbr} ${ingName}`.trimEnd();
      checkPage(5);
      doc.text(line, margin + 2, y);
      y += 5;
    }
    y += 4;
  }

  // Steps helper
  function addSteps(title: string, steps: CookingStep[]) {
    const sorted = [...steps].sort((a, b) => a.step_number - b.step_number);
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    checkPage(10);
    doc.text(title, margin, y);
    y += 7;
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");

    sorted.forEach((step, i) => {
      const stepLines = doc.splitTextToSize(`${i + 1}. ${step.instruction}`, contentWidth - 4) as string[];
      checkPage(stepLines.length * 5);
      doc.text(stepLines, margin + 2, y);
      y += stepLines.length * 5 + 2;
    });
    y += 4;
  }

  if (includeSteps) {
    if (recipe.manual_steps.length > 0) {
      addSteps(lang === "de" ? "Zubereitung" : "Steps", recipe.manual_steps);
    }
    if (recipe.machine_steps.length > 0) {
      addSteps(lang === "de" ? "Maschinenschritte" : "Machine Steps", recipe.machine_steps);
    }
  }

  return doc.output("blob");
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export async function shareOrDownload(
  recipe: Recipe,
  content: string | Blob,
  format: "markdown" | "pdf",
): Promise<"shared" | "downloaded"> {
  const ext = format === "markdown" ? ".md" : ".pdf";
  const mime = format === "markdown" ? "text/markdown" : "application/pdf";
  const filename = `${slugify(recipe.title)}${ext}`;

  const blob = typeof content === "string" ? new Blob([content], { type: mime }) : content;
  const file = new File([blob], filename, { type: mime });

  if (navigator.canShare?.({ files: [file] })) {
    await navigator.share({ title: recipe.title, files: [file] });
    return "shared";
  }

  // Fallback: download
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  return "downloaded";
}
