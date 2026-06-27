"use client";

import { useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { useRouter } from "next/navigation";
import { useT } from "@/lib/i18n/provider";
import { pickName } from "@/lib/display/format";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/sonner";
import { setupPlanAction } from "@/app/(app)/actions";
import type { RecipeTagDto } from "@/lib/queries/recipes";

interface Defaults {
  iterationWeeks: number;
  shoppingDays: number[];
  servings: number;
  knownRatio: number;
  defaultLeftoverDays: number;
  excludedTagIds: string[];
}

interface Props {
  triggerLabel: string;
  triggerClassName?: string;
  tags: RecipeTagDto[];
  defaults?: Defaults;
}

type FormValues = {
  iterationWeeks: number;
  servings: number;
  knownRatio: number;
  defaultLeftoverDays: number;
  shoppingDays: number[];
  excludedTagIds: string[];
};

const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6];

export function GeneratePlanDrawer({ triggerLabel, triggerClassName, tags, defaults }: Props) {
  const { locale, t } = useT();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const { register, handleSubmit, control, formState } = useForm<FormValues>({
    defaultValues: {
      iterationWeeks: defaults?.iterationWeeks ?? 1,
      servings: defaults?.servings ?? 2,
      knownRatio: defaults?.knownRatio ?? 0.7,
      defaultLeftoverDays: defaults?.defaultLeftoverDays ?? 1,
      shoppingDays: defaults?.shoppingDays ?? [5],
      excludedTagIds: defaults?.excludedTagIds ?? [],
    },
  });

  async function onSubmit(values: FormValues) {
    if (values.shoppingDays.length < 1 || values.shoppingDays.length > 2) {
      toast.error(t("plan.generate.shoppingDaysError"));
      return;
    }
    const res = await setupPlanAction({
      iterationWeeks: Number(values.iterationWeeks),
      servings: Number(values.servings),
      knownRatio: Number(values.knownRatio),
      defaultLeftoverDays: Number(values.defaultLeftoverDays),
      shoppingDays: values.shoppingDays.map(Number),
      excludedTagIds: values.excludedTagIds,
    });
    if (res.ok) {
      setOpen(false);
      toast.success(t("plan.generate.success"));
      router.refresh();
    } else {
      toast.error(
        res.status === 422 ? t("plan.generate.shoppingDaysError") : t("common.errorRetry"),
      );
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className={triggerClassName}>{triggerLabel}</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("plan.generate.title")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <label className="block text-sm">
            {t("plan.generate.iterationWeeks")}
            <Input
              type="number"
              min={1}
              max={3}
              {...register("iterationWeeks", { valueAsNumber: true })}
            />
          </label>
          <label className="block text-sm">
            {t("plan.generate.servings")}
            <Input
              type="number"
              min={1}
              max={12}
              {...register("servings", { valueAsNumber: true })}
            />
          </label>
          <label className="block text-sm">
            {t("plan.generate.knownRatio")}
            <Input
              type="number"
              step="0.1"
              min={0}
              max={1}
              {...register("knownRatio", { valueAsNumber: true })}
            />
          </label>
          <label className="block text-sm">
            {t("plan.generate.leftoverDays")}
            <Input
              type="number"
              min={0}
              max={3}
              {...register("defaultLeftoverDays", { valueAsNumber: true })}
            />
          </label>

          <fieldset>
            <legend className="text-sm font-medium">{t("plan.generate.shoppingDays")}</legend>
            <Controller
              control={control}
              name="shoppingDays"
              render={({ field }) => (
                <div className="mt-1 flex flex-wrap gap-2">
                  {WEEKDAYS.map((d) => {
                    const checked = field.value.includes(d);
                    return (
                      <button
                        key={d}
                        type="button"
                        onClick={() =>
                          field.onChange(
                            checked
                              ? field.value.filter((x) => x !== d)
                              : [...field.value, d],
                          )
                        }
                        className={`rounded border px-2 py-1 text-xs ${checked ? "bg-primary text-primary-foreground" : "border-border"}`}
                      >
                        {t(`plan.weekdays.${d}`)}
                      </button>
                    );
                  })}
                </div>
              )}
            />
          </fieldset>

          {tags.length > 0 && (
            <fieldset>
              <legend className="text-sm font-medium">{t("plan.generate.excludeTags")}</legend>
              <Controller
                control={control}
                name="excludedTagIds"
                render={({ field }) => (
                  <div className="mt-1 flex flex-wrap gap-2">
                    {tags.map((tag) => {
                      const checked = field.value.includes(tag.id);
                      return (
                        <button
                          key={tag.id}
                          type="button"
                          onClick={() =>
                            field.onChange(
                              checked
                                ? field.value.filter((x) => x !== tag.id)
                                : [...field.value, tag.id],
                            )
                          }
                          className={`rounded border px-2 py-1 text-xs ${checked ? "bg-destructive text-destructive-foreground" : "border-border"}`}
                        >
                          {pickName(locale, tag)}
                        </button>
                      );
                    })}
                  </div>
                )}
              />
            </fieldset>
          )}

          <Button type="submit" disabled={formState.isSubmitting} className="w-full">
            {t("plan.generate.submit")}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
