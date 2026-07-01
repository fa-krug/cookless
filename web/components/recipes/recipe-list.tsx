"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import type { RecipeSummary } from "@/lib/queries/recipes";
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
}

export function RecipeList({
  initialItems,
  totalCount,
  list,
  q,
  sort,
  tags,
  locale,
}: RecipeListProps) {
  const [items, setItems] = useState<RecipeSummary[]>(initialItems);
  const [loading, setLoading] = useState(false);
  const loadingRef = useRef(false);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const hasMore = items.length < totalCount;

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
      {items.map((r) => (
        <RecipeCard key={r.id} recipe={r} locale={locale} />
      ))}
      {hasMore && (
        <div ref={sentinelRef} className="flex justify-center py-4">
          {loading && <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />}
        </div>
      )}
    </div>
  );
}
