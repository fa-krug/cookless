"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import type { RecipeSummary } from "@/lib/queries/recipes";
import { useT } from "@/lib/i18n/provider";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { toast } from "@/components/ui/sonner";
import { deleteRecipeAction } from "@/app/(app)/actions";
import { schedulePendingDelete, cancelPendingDelete } from "@/lib/recipes/pending-delete";
import { RecipeCard } from "./recipe-card";

const PAGE = 20;

interface RecipeListProps {
  initialItems: RecipeSummary[];
  totalCount: number;
  list: string;
  q: string;
  sort: string;
  tags: string[];
  locale: string;
  deletedId?: string;
  highlightId?: string;
}

export function RecipeList({
  initialItems,
  totalCount,
  list,
  q,
  sort,
  tags,
  locale,
  deletedId,
  highlightId,
}: RecipeListProps) {
  const { t } = useT();
  const router = useRouter();
  const { confirm, dialog } = useConfirm();
  const [items, setItems] = useState<RecipeSummary[]>(initialItems);
  const [loading, setLoading] = useState(false);
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  const loadingRef = useRef(false);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const handledDeletedIdRef = useRef<string | null>(null);
  const hasMore = items.length < totalCount;

  const startDeferredDelete = useCallback(
    (id: string) => {
      setHiddenIds((prev) => new Set(prev).add(id));

      const toastId = toast(t("recipes.deleted"), {
        duration: 5000,
        action: {
          label: t("common.undo"),
          onClick: () => {
            cancelPendingDelete(id);
            setHiddenIds((prev) => {
              const next = new Set(prev);
              next.delete(id);
              return next;
            });
            toast.dismiss(toastId);
          },
        },
      });

      schedulePendingDelete(id, async () => {
        const res = await deleteRecipeAction(id);
        if (!res.ok) {
          toast.error(t("common.errorRetry"));
          setHiddenIds((prev) => {
            const next = new Set(prev);
            next.delete(id);
            return next;
          });
        }
        router.refresh();
      });
    },
    [router, t],
  );

  const handleDelete = useCallback(
    async (recipe: RecipeSummary) => {
      const ok = await confirm({
        title: t("recipes.confirmDeleteTitle"),
        message: t("recipes.confirmDelete"),
        destructive: true,
        confirmLabel: t("common.delete"),
        cancelLabel: t("common.cancel"),
      });
      if (!ok) return;
      startDeferredDelete(recipe.id);
    },
    [confirm, startDeferredDelete, t],
  );

  useEffect(() => {
    if (!deletedId) return;
    if (handledDeletedIdRef.current === deletedId) return;
    if (hiddenIds.has(deletedId)) return;
    if (!items.some((r) => r.id === deletedId)) return;

    handledDeletedIdRef.current = deletedId;
    startDeferredDelete(deletedId);
    router.replace("/recipes");
  }, [deletedId, hiddenIds, items, router, startDeferredDelete]);

  const loadMore = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    try {
      const params = new URLSearchParams({
        offset: String(items.length),
        limit: String(PAGE),
        sort,
        locale,
      });
      if (list) params.set("list", list);
      if (q) params.set("q", q);
      if (tags.length) params.set("tags", tags.join(","));
      const res = await fetch(`/api/recipes?${params.toString()}`);
      if (!res.ok) return;
      const data = (await res.json()) as { items: RecipeSummary[] };
      setItems((prev) => [...prev, ...data.items]);
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, [items.length, list, q, sort, tags, locale]);

  useEffect(() => {
    if (!hasMore) return;
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadMore();
      },
      { threshold: 0.1 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, loadMore]);

  return (
    <div className="space-y-3">
      {items
        .filter((r) => !hiddenIds.has(r.id))
        .map((r) => (
          <RecipeCard
            key={r.id}
            recipe={r}
            locale={locale}
            onDelete={handleDelete}
            highlight={r.id === highlightId}
          />
        ))}
      {hasMore && (
        <div ref={sentinelRef} className="flex justify-center py-4">
          {loading && <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />}
        </div>
      )}
      {dialog}
    </div>
  );
}
