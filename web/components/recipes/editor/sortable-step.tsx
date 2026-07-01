"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { ReactNode } from "react";

export function SortableStep({
  id,
  children,
  highlight = false,
}: {
  id: string;
  children: ReactNode;
  highlight?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }}
      className={
        highlight
          ? "rounded-md border border-primary/20 bg-primary/10 p-3"
          : "rounded-md border p-3"
      }
    >
      <button type="button" className="cursor-grab text-muted-foreground" aria-label="Drag to reorder" {...attributes} {...listeners}>
        ⠿
      </button>
      {children}
    </div>
  );
}
