// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { Toaster } from "sonner";
import { I18nProvider } from "@/lib/i18n/provider";
import en from "@/lib/i18n/locales/en.json";
import type { RecipeSummary } from "@/lib/queries/recipes";
import { RecipeList } from "./recipe-list";

const refresh = vi.fn();
const replace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh, replace, push: vi.fn() }),
}));

const deleteRecipeAction = vi.fn();
vi.mock("@/app/(app)/actions", () => ({
  deleteRecipeAction: (...args: unknown[]) => deleteRecipeAction(...args),
}));

function makeRecipe(overrides: Partial<RecipeSummary> = {}): RecipeSummary {
  return {
    id: "r1",
    title: "Pasta",
    description: "",
    listType: "KNOWN",
    defaultServings: 2,
    prepTimeMinutes: null,
    cookTimeMinutes: null,
    leftoverDays: null,
    image: "",
    createdAt: new Date(),
    updatedAt: new Date(),
    tags: [],
    ...overrides,
  };
}

function renderList(
  items: RecipeSummary[],
  deletedId?: string,
  highlightId?: string,
) {
  return render(
    <I18nProvider locale="en" dict={en}>
      <RecipeList
        initialItems={items}
        totalCount={items.length}
        list="KNOWN"
        q=""
        sort="name-asc"
        tags={[]}
        locale="en"
        deletedId={deletedId}
        highlightId={highlightId}
      />
      <Toaster />
    </I18nProvider>,
  );
}

describe("RecipeList delete + undo", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    deleteRecipeAction.mockResolvedValue({ ok: true });
    refresh.mockClear();
    replace.mockClear();
    deleteRecipeAction.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("hides the row on confirm, shows undo toast, and restores it on undo", async () => {
    renderList([makeRecipe()]);

    expect(screen.getByText("Pasta")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Delete Pasta"));

    const confirmButton = await screen.findByRole("button", { name: "Delete" });
    fireEvent.click(confirmButton);

    await waitFor(() => expect(screen.queryByText("Pasta")).not.toBeInTheDocument());

    const undoButton = await screen.findByRole("button", { name: "Undo" });
    fireEvent.click(undoButton);

    await waitFor(() => expect(screen.getByText("Pasta")).toBeInTheDocument());

    await vi.advanceTimersByTimeAsync(5000);
    expect(deleteRecipeAction).not.toHaveBeenCalled();
  });

  it("calls the delete action after the undo window elapses without undo", async () => {
    renderList([makeRecipe()]);

    fireEvent.click(screen.getByLabelText("Delete Pasta"));
    const confirmButton = await screen.findByRole("button", { name: "Delete" });
    fireEvent.click(confirmButton);

    await waitFor(() => expect(screen.queryByText("Pasta")).not.toBeInTheDocument());

    await vi.advanceTimersByTimeAsync(5000);

    await waitFor(() => expect(deleteRecipeAction).toHaveBeenCalledWith("r1"));
  });
});

describe("RecipeList highlight", () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
  });

  it("applies animate-highlight only to the card matching highlightId", () => {
    renderList([makeRecipe({ id: "r1", title: "Pasta" }), makeRecipe({ id: "r2", title: "Soup" })], undefined, "r2");

    const pastaCard = screen.getByText("Pasta").closest('[class*="rounded"]');
    const soupCard = screen.getByText("Soup").closest('[class*="rounded"]');

    expect(soupCard).toHaveClass("animate-highlight");
    expect(pastaCard).not.toHaveClass("animate-highlight");
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith({
      behavior: "smooth",
      block: "center",
    });
  });
});
