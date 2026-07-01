import { formatQuantity } from "@/lib/display/format";

export interface ExportIngredient {
  name: string;
  unitAbbr: string;
  /** Quantity at defaultServings (unscaled). */
  quantity: number;
}

export interface ExportStep {
  stepNumber: number;
  instruction: string;
  ingredients: ExportIngredient[];
}

export interface RecipeExportModel {
  title: string;
  description: string;
  defaultServings: number;
  prepTimeMinutes: number | null;
  cookTimeMinutes: number | null;
  imageUrl: string | null;
  ingredients: ExportIngredient[];
  manualSteps: ExportStep[];
  machineSteps: ExportStep[];
}

export interface ExportSections {
  includeDescription: boolean;
  includeIngredients: boolean;
  includeSteps: boolean;
}

function scaleFor(model: RecipeExportModel, portions: number): number {
  return model.defaultServings > 0 ? portions / model.defaultServings : 1;
}

function fmtQty(quantity: number): string {
  return formatQuantity(String(quantity));
}

function ingredientLine(prefix: string, ing: ExportIngredient, scale: number): string {
  const qty = ing.quantity * scale;
  return `${prefix}${fmtQty(qty)} ${ing.unitAbbr} ${ing.name}`.replace(/ {2,}/g, " ").trimEnd();
}

function metaLabels(locale: string): {
  servings: string;
  prep: string;
  cook: string;
} {
  return locale === "de"
    ? { servings: "Portionen", prep: "Vorbereitung", cook: "Kochen" }
    : { servings: "Servings", prep: "Prep", cook: "Cook" };
}

function sectionLabels(locale: string): {
  ingredients: string;
  steps: string;
  machineSteps: string;
} {
  return locale === "de"
    ? { ingredients: "Zutaten", steps: "Zubereitung", machineSteps: "Maschinenschritte" }
    : { ingredients: "Ingredients", steps: "Steps", machineSteps: "Machine Steps" };
}

function formatStepsMarkdown(steps: ExportStep[], scale: number): string {
  return [...steps]
    .sort((a, b) => a.stepNumber - b.stepNumber)
    .map((step, i) => {
      let line = `${i + 1}. ${step.instruction}`;
      if (step.ingredients.length > 0) {
        const ingLines = step.ingredients.map((ing) => ingredientLine("   - ", ing, scale));
        line += "\n" + ingLines.join("\n");
      }
      return line;
    })
    .join("\n");
}

export function generateMarkdown(
  model: RecipeExportModel,
  portions: number,
  sections: ExportSections,
  locale: string,
): string {
  const scale = scaleFor(model, portions);
  const meta = metaLabels(locale);
  const labels = sectionLabels(locale);

  const lines: string[] = [];
  lines.push(`# ${model.title}`, "");

  if (sections.includeDescription && model.description) {
    lines.push(model.description, "");
  }

  const metaParts: string[] = [`${portions} ${meta.servings}`];
  if (model.prepTimeMinutes != null) metaParts.push(`${meta.prep}: ${model.prepTimeMinutes} min`);
  if (model.cookTimeMinutes != null) metaParts.push(`${meta.cook}: ${model.cookTimeMinutes} min`);
  lines.push(metaParts.join(" · "), "");

  if (sections.includeIngredients && model.ingredients.length > 0) {
    lines.push(`## ${labels.ingredients}`, "");
    for (const ing of model.ingredients) {
      lines.push(ingredientLine("- ", ing, scale));
    }
    lines.push("");
  }

  if (sections.includeSteps) {
    if (model.manualSteps.length > 0) {
      lines.push(`## ${labels.steps}`, "");
      lines.push(formatStepsMarkdown(model.manualSteps, scale), "");
    }
    if (model.machineSteps.length > 0) {
      lines.push(`## ${labels.machineSteps}`, "");
      lines.push(formatStepsMarkdown(model.machineSteps, scale), "");
    }
  }

  return lines.join("\n").trimEnd() + "\n";
}

export async function generatePdf(
  model: RecipeExportModel,
  portions: number,
  sections: ExportSections & { includeImage: boolean },
  locale: string,
): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const scale = scaleFor(model, portions);
  const meta = metaLabels(locale);
  const labels = sectionLabels(locale);

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
  const titleLines = doc.splitTextToSize(model.title, contentWidth) as string[];
  checkPage(titleLines.length * 8);
  doc.text(titleLines, margin, y);
  y += titleLines.length * 8 + 4;

  // Image
  if (sections.includeImage && model.imageUrl) {
    try {
      const response = await fetch(model.imageUrl);
      const blob = await response.blob();
      const dataUrl = await blobToDataUrl(blob);
      const { width: natW, height: natH } = await getImageDimensions(dataUrl);
      const imgWidth = contentWidth;
      const imgHeight = natW > 0 ? (natH / natW) * imgWidth : 60;
      const cappedHeight = Math.min(imgHeight, 100);
      checkPage(cappedHeight + 4);
      doc.addImage(dataUrl, margin, y, imgWidth, cappedHeight);
      y += cappedHeight + 6;
    } catch {
      // Skip image on failure
    }
  }

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);

  // Description
  if (sections.includeDescription && model.description) {
    const descLines = doc.splitTextToSize(model.description, contentWidth) as string[];
    checkPage(descLines.length * 5);
    doc.text(descLines, margin, y);
    y += descLines.length * 5 + 4;
  }

  // Metadata
  const metaParts: string[] = [`${portions} ${meta.servings}`];
  if (model.prepTimeMinutes != null) metaParts.push(`${meta.prep}: ${model.prepTimeMinutes} min`);
  if (model.cookTimeMinutes != null) metaParts.push(`${meta.cook}: ${model.cookTimeMinutes} min`);
  doc.setFontSize(9);
  doc.setTextColor(100);
  checkPage(6);
  doc.text(metaParts.join(" · "), margin, y);
  doc.setTextColor(0);
  y += 8;

  // Ingredients
  if (sections.includeIngredients && model.ingredients.length > 0) {
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    checkPage(10);
    doc.text(labels.ingredients, margin, y);
    y += 7;
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");

    for (const ing of model.ingredients) {
      const line = ingredientLine("• ", ing, scale);
      checkPage(5);
      doc.text(line, margin + 2, y);
      y += 5;
    }
    y += 4;
  }

  function addSteps(title: string, steps: ExportStep[]) {
    const sorted = [...steps].sort((a, b) => a.stepNumber - b.stepNumber);
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

      if (step.ingredients.length > 0) {
        doc.setFontSize(9);
        doc.setTextColor(100);
        for (const ing of step.ingredients) {
          const line = ingredientLine("  - ", ing, scale);
          checkPage(4);
          doc.text(line, margin + 6, y);
          y += 4;
        }
        doc.setFontSize(10);
        doc.setTextColor(0);
      }
    });
    y += 4;
  }

  if (sections.includeSteps) {
    if (model.manualSteps.length > 0) {
      addSteps(labels.steps, model.manualSteps);
    }
    if (model.machineSteps.length > 0) {
      addSteps(labels.machineSteps, model.machineSteps);
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

function getImageDimensions(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => resolve({ width: 0, height: 0 });
    img.src = dataUrl;
  });
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export async function shareOrDownload(
  title: string,
  content: string | Blob,
  format: "markdown" | "pdf",
): Promise<"shared" | "downloaded"> {
  const ext = format === "markdown" ? ".md" : ".pdf";
  const mime = format === "markdown" ? "text/markdown" : "application/pdf";
  const filename = `${slugify(title)}${ext}`;

  const blob = typeof content === "string" ? new Blob([content], { type: mime }) : content;
  const file = new File([blob], filename, { type: mime });

  if (navigator.canShare?.({ files: [file] })) {
    await navigator.share({ title, files: [file] });
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
