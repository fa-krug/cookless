"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/lib/i18n/provider";
import { toast } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createTagAction, updateTagAction, deleteTagAction, resetTagsAction } from "@/app/(app)/actions";
import type { RecipeTagDto } from "@/lib/queries/recipes";
import type { Locale } from "@/lib/i18n/config";

const CATEGORIES = ["DIETARY", "PROTEIN", "CUISINE", "MEAL_TYPE"] as const;

export function TagManagementClient({ tags, locale }: { tags: RecipeTagDto[]; locale: Locale }) {
  const { t } = useT();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [newCat, setNewCat] = useState<string>("CUISINE");
  const [newEn, setNewEn] = useState("");
  const [newDe, setNewDe] = useState("");

  async function run(fn: () => Promise<{ ok: boolean; message?: string }>) {
    setBusy(true);
    const res = await fn();
    setBusy(false);
    if (!res.ok) { toast.error(res.message || t("common.error")); return false; }
    router.refresh();
    return true;
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">{t("tags.manageTags")}</h1>

      {CATEGORIES.map((cat) => {
        const inCat = tags.filter((tg) => tg.category === cat);
        return (
          <section key={cat} className="space-y-2">
            <h2 className="text-sm uppercase text-muted-foreground">{t(`tags.categories.${cat}`)}</h2>
            {inCat.map((tg) => (
              <TagRow key={tg.id} tag={tg} locale={locale} busy={busy} run={run} />
            ))}
          </section>
        );
      })}

      <section className="flex flex-wrap items-end gap-2 rounded-md border p-2">
        <select className="rounded-md border bg-background p-2 text-sm" value={newCat} onChange={(e) => setNewCat(e.target.value)}>
          {CATEGORIES.map((c) => <option key={c} value={c}>{t(`tags.categories.${c}`)}</option>)}
        </select>
        <Input className="w-32" placeholder={t("tags.nameEn")} value={newEn} onChange={(e) => setNewEn(e.target.value)} />
        <Input className="w-32" placeholder={t("tags.nameDe")} value={newDe} onChange={(e) => setNewDe(e.target.value)} />
        <Button type="button" disabled={busy} onClick={async () => {
          if (!newEn.trim() || !newDe.trim()) return;
          const ok = await run(() => createTagAction({ category: newCat, nameEn: newEn.trim(), nameDe: newDe.trim() }));
          if (ok) { setNewEn(""); setNewDe(""); }
        }}>{t("tags.create")}</Button>
      </section>

      <Button type="button" variant="destructive" disabled={busy} onClick={async () => {
        if (!confirm(t("tags.resetConfirm"))) return;
        await run(() => resetTagsAction());
      }}>{t("tags.reset")}</Button>
    </div>
  );
}

function TagRow({ tag, locale, busy, run }: {
  tag: RecipeTagDto; locale: Locale; busy: boolean;
  run: (fn: () => Promise<{ ok: boolean; message?: string }>) => Promise<boolean>;
}) {
  const { t } = useT();
  const [editing, setEditing] = useState(false);
  const [en, setEn] = useState(tag.nameEn);
  const [de, setDe] = useState(tag.nameDe);

  if (editing) {
    return (
      <div className="flex items-center gap-2">
        <Input className="w-32" value={en} onChange={(e) => setEn(e.target.value)} />
        <Input className="w-32" value={de} onChange={(e) => setDe(e.target.value)} />
        <Button type="button" size="sm" disabled={busy} onClick={async () => {
          const ok = await run(() => updateTagAction(tag.id, { nameEn: en.trim(), nameDe: de.trim() }));
          if (ok) setEditing(false);
        }}>{t("common.save")}</Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>{t("common.cancel")}</Button>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <span className="flex-1 text-sm">{locale === "de" ? tag.nameDe : tag.nameEn}</span>
      <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(true)}>{t("common.edit")}</Button>
      <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={async () => {
        if (!confirm(t("tags.deleteConfirmPlain"))) return;
        await run(() => deleteTagAction(tag.id));
      }}>{t("common.remove")}</Button>
    </div>
  );
}
