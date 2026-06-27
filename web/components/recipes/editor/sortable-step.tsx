"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { ReactNode } from "react";

export function SortableStep({ id, children }: { id: string; children: ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }}
      className="rounded-md border p-3"
    >
      <button type="button" className="cursor-grab text-muted-foreground" aria-label="Drag to reorder" {...attributes} {...listeners}>
        ⠿
      </button>
      {children}
    </div>
  );
}
