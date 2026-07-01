import { ShoppingListSkeleton } from "@/components/shopping/shopping-list-skeleton";

export default function ShoppingLoading() {
  // ShoppingListSkeleton already includes a heading placeholder (h-8 w-48)
  // and an info-bar placeholder — no outer wrapper needed; page renders
  // ShoppingListView which provides its own container.
  return <ShoppingListSkeleton />;
}
