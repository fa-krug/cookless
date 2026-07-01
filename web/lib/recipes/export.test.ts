// @vitest-environment jsdom
import { describe, expect, it, vi, afterEach } from "vitest";
import type { RecipeExportModel, ExportSections } from "./export";
import { generateMarkdown, generatePdf, shareOrDownload } from "./export";

function baseModel(): RecipeExportModel {
  return {
    title: "Tomato Soup",
    description: "A warm, comforting soup.",
    defaultServings: 2,
    prepTimeMinutes: 10,
    cookTimeMinutes: 20,
    imageUrl: null,
    ingredients: [
      { name: "Tomato", unitAbbr: "kg", quantity: 1 },
      { name: "Onion", unitAbbr: "pc", quantity: 2 },
    ],
    manualSteps: [
      {
        stepNumber: 1,
        instruction: "Chop the vegetables.",
        ingredients: [{ name: "Onion", unitAbbr: "pc", quantity: 2 }],
      },
    ],
    machineSteps: [
      {
        stepNumber: 1,
        instruction: "Blend everything.",
        ingredients: [],
      },
    ],
  };
}

const allSections: ExportSections = {
  includeDescription: true,
  includeIngredients: true,
  includeSteps: true,
};

describe("generateMarkdown", () => {
  it("renders title heading, description, meta, ingredients and steps in English", () => {
    const md = generateMarkdown(baseModel(), 2, allSections, "en");

    expect(md).toContain("# Tomato Soup");
    expect(md).toContain("A warm, comforting soup.");
    expect(md).toContain("2 Servings");
    expect(md).toContain("Prep: 10 min");
    expect(md).toContain("Cook: 20 min");
    expect(md).toContain("## Ingredients");
    expect(md).toContain("- 1 kg Tomato");
    expect(md).toContain("- 2 pc Onion");
    expect(md).toContain("## Steps");
    expect(md).toContain("1. Chop the vegetables.");
    expect(md).toContain("- 2 pc Onion");
    expect(md).toContain("## Machine Steps");
    expect(md).toContain("1. Blend everything.");
  });

  it("renders German headers and meta labels", () => {
    const md = generateMarkdown(baseModel(), 2, allSections, "de");

    expect(md).toContain("2 Portionen");
    expect(md).toContain("Vorbereitung: 10 min");
    expect(md).toContain("Kochen: 20 min");
    expect(md).toContain("## Zutaten");
    expect(md).toContain("## Zubereitung");
    expect(md).toContain("## Maschinenschritte");
  });

  it("scales ingredient quantities proportionally to portions", () => {
    const md = generateMarkdown(baseModel(), 4, allSections, "en");

    // defaultServings 2 -> portions 4 => scale factor 2
    expect(md).toContain("- 2 kg Tomato");
    expect(md).toContain("- 4 pc Onion");
    expect(md).toContain("4 Servings");
  });

  it("falls back to scale 1 when defaultServings is 0", () => {
    const model = { ...baseModel(), defaultServings: 0 };
    const md = generateMarkdown(model, 4, allSections, "en");

    expect(md).toContain("- 1 kg Tomato");
    expect(md).toContain("- 2 pc Onion");
  });

  it("omits the description block when includeDescription is false", () => {
    const md = generateMarkdown(baseModel(), 2, { ...allSections, includeDescription: false }, "en");
    expect(md).not.toContain("A warm, comforting soup.");
  });

  it("omits the ingredients block when includeIngredients is false", () => {
    const md = generateMarkdown(baseModel(), 2, { ...allSections, includeIngredients: false }, "en");
    expect(md).not.toContain("## Ingredients");
    expect(md).not.toContain("- 1 kg Tomato");
  });

  it("omits both step blocks when includeSteps is false", () => {
    const md = generateMarkdown(baseModel(), 2, { ...allSections, includeSteps: false }, "en");
    expect(md).not.toContain("## Steps");
    expect(md).not.toContain("## Machine Steps");
    expect(md).not.toContain("Chop the vegetables.");
  });

  it("skips manual/machine step headers when there are no steps of that kind", () => {
    const model = { ...baseModel(), machineSteps: [] };
    const md = generateMarkdown(model, 2, allSections, "en");
    expect(md).toContain("## Steps");
    expect(md).not.toContain("## Machine Steps");
  });
});

describe("shareOrDownload", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete (navigator as unknown as { canShare?: unknown }).canShare;
    delete (navigator as unknown as { share?: unknown }).share;
  });

  it("slugifies the title and uses .md/text-markdown for markdown format, sharing via navigator.share when available", async () => {
    const shareMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      canShare: vi.fn().mockReturnValue(true),
      share: shareMock,
    });

    const result = await shareOrDownload("Tomato Soup!", "# Tomato Soup", "markdown");

    expect(result).toBe("shared");
    expect(shareMock).toHaveBeenCalledTimes(1);
    const call = shareMock.mock.calls[0][0];
    expect(call.files[0].name).toBe("tomato-soup.md");
    expect(call.files[0].type).toBe("text/markdown");
  });

  it("uses .pdf/application-pdf for pdf format", async () => {
    const shareMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      canShare: vi.fn().mockReturnValue(true),
      share: shareMock,
    });

    const blob = new Blob(["%PDF-1.4"], { type: "application/pdf" });
    await shareOrDownload("Tomato Soup", blob, "pdf");

    const call = shareMock.mock.calls[0][0];
    expect(call.files[0].name).toBe("tomato-soup.pdf");
    expect(call.files[0].type).toBe("application/pdf");
  });

  it("falls back to a download link when navigator.canShare is unavailable", async () => {
    delete (navigator as unknown as { canShare?: unknown }).canShare;
    delete (navigator as unknown as { share?: unknown }).share;

    const createObjectURLSpy = vi
      .spyOn(URL, "createObjectURL")
      .mockReturnValue("blob:mock-url");
    const revokeObjectURLSpy = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    const result = await shareOrDownload("Tomato Soup", "# Tomato Soup", "markdown");

    expect(result).toBe("downloaded");
    expect(createObjectURLSpy).toHaveBeenCalledTimes(1);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(revokeObjectURLSpy).toHaveBeenCalledTimes(1);
  });
});

describe("generatePdf", () => {
  it("returns a non-empty application/pdf Blob for a minimal model without an image", async () => {
    const model = { ...baseModel(), imageUrl: null };
    const blob = await generatePdf(model, 2, { ...allSections, includeImage: false }, "en");

    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe("application/pdf");
    expect(blob.size).toBeGreaterThan(0);
  });
});
