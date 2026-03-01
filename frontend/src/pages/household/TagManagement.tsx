import {
  Check,
  ChevronDown,
  Pencil,
  RotateCcw,
  Tags,
  Trash2,
  X,
} from "lucide-react";
import { Spinner } from "../../components/ui/Spinner";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { TAG_CATEGORIES, type TagCategory } from "../../api/types";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/IconButton";
import { Input } from "@/components/ui/input";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import { useConfirm } from "../../hooks/useConfirm";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import {
  useCreateTag,
  useDeleteTag,
  useResetTags,
  useTags,
  useUpdateTag,
} from "../../hooks/useTags";
import { toast } from "sonner";

export function TagManagement({ isOwner }: { isOwner: boolean }) {
  const { t, i18n } = useTranslation();
  const { confirm, dialogProps } = useConfirm();
  const { data: groupedTags } = useTags();
  const createTag = useCreateTag();
  const updateTag = useUpdateTag();
  const deleteTag = useDeleteTag();
  const resetTags = useResetTags();

  const [editingTag, setEditingTag] = useState<string | null>(null);
  const [editNameEn, setEditNameEn] = useState("");
  const [editNameDe, setEditNameDe] = useState("");
  const [addingCategory, setAddingCategory] = useState<TagCategory | null>(null);
  const [newTagEn, setNewTagEn] = useState("");
  const [newTagDe, setNewTagDe] = useState("");

  return (
    <div className="mb-4 rounded-lg border border-border bg-card p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Tags size={20} className="text-muted-foreground" />
          <h2 className="text-lg font-semibold text-foreground">{t("tags.manageTags")}</h2>
        </div>
        {isOwner && (
          <Button
            variant="ghost"
            size="sm"
            onClick={async () => {
              const confirmed = await confirm({
                title: t("tags.resetToDefaults"),
                message: t("tags.resetConfirm"),
                confirmVariant: "danger",
                cancelLabel: t("common.cancel"),
              });
              if (confirmed) {
                resetTags.mutate(undefined, {
                  onSuccess: () => toast.success(t("tags.resetSuccess")),
                  onError: () => toast.error(t("errors.tagsReset")),
                });
              }
            }}
            disabled={resetTags.isPending}
          >
            {resetTags.isPending ? <Spinner /> : <RotateCcw size={14} />}
            {t("tags.resetToDefaults")}
          </Button>
        )}
      </div>
      <div className="space-y-3">
        {groupedTags &&
          TAG_CATEGORIES.map((category) => {
            const tags = groupedTags[category] || [];
            return (
              <Collapsible key={category} className="rounded-lg border">
                <CollapsibleTrigger className="flex w-full cursor-pointer items-center justify-between rounded-lg bg-muted px-4 py-2 font-medium">
                  <span>
                    {t(`tags.${category}`)}
                    <span className="ml-2 text-sm text-muted-foreground">({tags.length})</span>
                  </span>
                  <ChevronDown size={16} className="transition-transform duration-200 [[data-state=open]>&]:rotate-180" />
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-1 p-3">
                  {tags.length === 0 && (
                    <p className="text-sm text-muted-foreground">{t("tags.noTags")}</p>
                  )}
                  {tags.map((tag) => (
                    <div
                      key={tag.id}
                      className="flex items-center justify-between rounded px-2 py-1 hover:bg-muted"
                    >
                      {isOwner && editingTag === tag.id ? (
                        <div className="flex flex-1 items-center justify-between gap-2">
                          <div className="flex min-w-0 flex-1 items-center gap-2">
                            <Input
                              value={editNameEn}
                              onChange={(e) => setEditNameEn(e.target.value)}
                              className="h-8 w-28"
                              placeholder={t("tags.nameEn")}
                            />
                            <Input
                              value={editNameDe}
                              onChange={(e) => setEditNameDe(e.target.value)}
                              className="h-8 w-28"
                              placeholder={t("tags.nameDe")}
                            />
                          </div>
                          <div className="flex gap-1">
                            <IconButton
                              variant="ghost"
                              type="button"
                              onClick={async () => {
                                await updateTag.mutateAsync({
                                  id: tag.id,
                                  payload: { name_en: editNameEn, name_de: editNameDe },
                                });
                                setEditingTag(null);
                              }}
                              className="h-7 w-7 text-green-600 hover:bg-green-50"
                              tooltip={t("common.save")}
                              aria-label={t("common.save")}
                            >
                              <Check size={14} />
                            </IconButton>
                            <IconButton
                              variant="ghost"
                              type="button"
                              onClick={() => setEditingTag(null)}
                              className="h-7 w-7 text-muted-foreground hover:bg-muted"
                              tooltip={t("common.cancel")}
                              aria-label={t("common.cancel")}
                            >
                              <X size={14} />
                            </IconButton>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="flex items-center gap-2">
                            <span className="text-sm">
                              {i18n.language === "de" ? tag.name_de : tag.name_en}
                            </span>
                            {tag.is_default && (
                              <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                                default
                              </span>
                            )}
                          </div>
                          {isOwner && (
                            <div className="flex gap-1">
                              <IconButton
                                variant="ghost"
                                type="button"
                                onClick={() => {
                                  setEditingTag(tag.id);
                                  setEditNameEn(tag.name_en);
                                  setEditNameDe(tag.name_de);
                                }}
                                className="h-7 w-7 text-muted-foreground hover:bg-muted hover:text-primary"
                                tooltip={t("tags.editTag")}
                                aria-label={t("tags.editTag")}
                              >
                                <Pencil size={14} />
                              </IconButton>
                              <IconButton
                                variant="ghost"
                                type="button"
                                onClick={async () => {
                                  const confirmed = await confirm({
                                    title: t("tags.deleteTag"),
                                    message: t("tags.deleteConfirm", { count: 0 }),
                                    confirmVariant: "danger",
                                    cancelLabel: t("common.cancel"),
                                  });
                                  if (confirmed) {
                                    deleteTag.mutate(tag.id);
                                  }
                                }}
                                className="h-7 w-7 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                                tooltip={t("tags.deleteTag")}
                                aria-label={t("tags.deleteTag")}
                              >
                                <Trash2 size={14} />
                              </IconButton>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  ))}
                  {isOwner && (addingCategory === category ? (
                    <div className="mt-2 flex items-center justify-between gap-2 border-t pt-2">
                      <div className="flex min-w-0 flex-1 items-center gap-2">
                        <Input
                          value={newTagEn}
                          onChange={(e) => setNewTagEn(e.target.value)}
                          className="h-8 w-28"
                          placeholder={t("tags.nameEn")}
                        />
                        <Input
                          value={newTagDe}
                          onChange={(e) => setNewTagDe(e.target.value)}
                          className="h-8 w-28"
                          placeholder={t("tags.nameDe")}
                        />
                      </div>
                      <div className="flex gap-1">
                        <IconButton
                          variant="ghost"
                          type="button"
                          onClick={async () => {
                            if (newTagEn.trim() && newTagDe.trim()) {
                              await createTag.mutateAsync({
                                category,
                                name_en: newTagEn.trim(),
                                name_de: newTagDe.trim(),
                              });
                              setNewTagEn("");
                              setNewTagDe("");
                              setAddingCategory(null);
                            }
                          }}
                          className="h-7 w-7 text-green-600 hover:bg-green-50"
                          tooltip={t("common.save")}
                          aria-label={t("common.save")}
                        >
                          <Check size={14} />
                        </IconButton>
                        <IconButton
                          variant="ghost"
                          type="button"
                          onClick={() => {
                            setAddingCategory(null);
                            setNewTagEn("");
                            setNewTagDe("");
                          }}
                          className="h-7 w-7 text-muted-foreground hover:bg-muted"
                          tooltip={t("common.cancel")}
                          aria-label={t("common.cancel")}
                        >
                          <X size={14} />
                        </IconButton>
                      </div>
                    </div>
                  ) : (
                    <Button
                      variant="link"
                      type="button"
                      onClick={() => setAddingCategory(category)}
                      className="mt-2 w-full justify-start pt-2 text-sm text-primary hover:text-primary"
                    >
                      + {t("tags.addTag")}
                    </Button>
                  ))}
                </CollapsibleContent>
              </Collapsible>
            );
          })}
      </div>
      {dialogProps && <ConfirmDialog {...dialogProps} />}
    </div>
  );
}
