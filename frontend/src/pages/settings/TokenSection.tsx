import {
  Check,
  Code,
  Copy,
  ExternalLink,
  Plus,
  Trash2,
} from "lucide-react";
import { Spinner } from "../../components/ui/Spinner";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { tokenCreateSchema, type TokenCreateFormValues } from "@/lib/schemas/settings";
import type { AccessTokenCreated } from "../../api/types";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { IconButton } from "@/components/ui/IconButton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Form,
  FormField,
  FormItem,
  FormControl,
  FormMessage,
} from "@/components/ui/form";
import { SettingsSkeleton } from "../../components/ui/SettingsSkeleton";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import { useConfirm } from "../../hooks/useConfirm";
import { useTokens, useCreateToken, useDeleteToken } from "../../hooks/useTokens";
import { toast } from "sonner";

const SCOPE_GROUPS = ["recipes", "planner", "shopping", "households"] as const;

export function TokenSection() {
  const { t } = useTranslation();
  const { confirm, dialogProps } = useConfirm();

  const { data: tokens = [], isLoading: tokensLoading } = useTokens();
  const createToken = useCreateToken();
  const deleteToken = useDeleteToken();
  const [showTokenForm, setShowTokenForm] = useState(false);
  const tokenForm = useForm<TokenCreateFormValues>({
    resolver: zodResolver(tokenCreateSchema),
    defaultValues: { name: "", scopes: [], preset: "90d", customDate: "" },
  });
  const [createdToken, setCreatedToken] = useState<AccessTokenCreated | null>(null);
  const [copied, setCopied] = useState(false);

  const tokenScopes = tokenForm.watch("scopes");
  const tokenPreset = tokenForm.watch("preset");
  const tokenName = tokenForm.watch("name");

  function toggleScope(scope: string) {
    const current = tokenForm.getValues("scopes");
    const next = current.includes(scope)
      ? current.filter((s) => s !== scope)
      : [...current, scope];
    tokenForm.setValue("scopes", next);
  }

  async function handleCreateToken(values: TokenCreateFormValues) {
    const payload: {
      name: string;
      scopes: string[];
      duration_preset?: string;
      expires_at?: string;
    } = {
      name: values.name.trim(),
      scopes: values.scopes,
    };

    if (values.preset === "custom" && values.customDate) {
      payload.expires_at = new Date(values.customDate).toISOString();
    } else if (values.preset && values.preset !== "never") {
      payload.duration_preset = values.preset;
    }

    try {
      const result = await createToken.mutateAsync(payload);
      setCreatedToken(result);
      setShowTokenForm(false);
      tokenForm.reset();
      toast.success(t("tokens.tokenCreated"));
    } catch {
      toast.error(t("errors.tokenCreate"));
    }
  }

  async function handleDeleteToken(id: string) {
    const confirmed = await confirm({
      title: t("tokens.deleteToken"),
      message: t("tokens.confirmDelete"),
      confirmLabel: t("common.remove"),
      confirmVariant: "danger",
      cancelLabel: t("common.cancel"),
    });
    if (!confirmed) return;
    try {
      await deleteToken.mutateAsync(id);
    } catch {
      toast.error(t("errors.tokenDelete"));
    }
  }

  async function copyToken(token: string) {
    await navigator.clipboard.writeText(token);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="mb-4 rounded-lg border border-border bg-card p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground">{t("tokens.title")}</h2>
        <a
          href="/api/v1/docs"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-xs text-primary hover:text-primary/80"
        >
          {t("tokens.docsLink")}
          <ExternalLink size={12} />
        </a>
      </div>

      {/* Created token display */}
      {createdToken && (
        <div className="mb-4 rounded-md border border-primary/30 bg-primary/10 p-3">
          <p className="mb-1 text-xs font-medium text-primary">{t("tokens.tokenLabel")}</p>
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 break-all rounded bg-background px-2 py-1 font-mono text-xs text-foreground">
              {createdToken.token}
            </code>
            <IconButton
              variant="ghost"
              className="h-8 w-8 shrink-0 text-primary hover:bg-primary/10"
              type="button"
              onClick={() => copyToken(createdToken.token)}
              tooltip={copied ? t("tokens.tokenLabel") : t("tokens.tokenLabel")}
            >
              {copied ? <Check size={16} /> : <Copy size={16} />}
            </IconButton>
          </div>
          <p className="mt-2 text-xs text-primary/80">{t("tokens.tokenWarning")}</p>
          <Button
            variant="link"
            className="mt-2 h-auto p-0 text-xs text-primary"
            type="button"
            onClick={() => setCreatedToken(null)}
          >
            {t("common.close")}
          </Button>
        </div>
      )}

      {/* Token list */}
      {tokensLoading ? (
        <SettingsSkeleton />
      ) : tokens.length === 0 && !showTokenForm ? (
        <p className="text-sm text-muted-foreground">{t("tokens.noTokens")}</p>
      ) : (
        <div className="space-y-3">
          {tokens.map((token) => (
            <div
              key={token.id}
              className="flex items-center justify-between rounded-md border border-border px-3 py-2"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-foreground">{token.name}</p>
                  {token.expires_at && new Date(token.expires_at) < new Date() && (
                    <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-xs text-destructive">
                      {t("tokens.expired")}
                    </span>
                  )}
                </div>
                <p className="font-mono text-xs text-muted-foreground">{token.token_prefix}...</p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {token.scopes.map((scope) => (
                    <span
                      key={scope}
                      className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground"
                    >
                      {scope}
                    </span>
                  ))}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {token.last_used_at
                    ? t("tokens.lastUsed", {
                        date: new Date(token.last_used_at).toLocaleDateString(),
                      })
                    : t("tokens.neverUsed")}
                </p>
              </div>
              <IconButton
                variant="ghost"
                className="h-8 w-8 shrink-0 text-destructive hover:bg-destructive/10"
                onClick={() => handleDeleteToken(token.id)}
                tooltip={t("tokens.deleteToken")}
                aria-label={t("tokens.deleteToken")}
              >
                <Trash2 size={16} />
              </IconButton>
            </div>
          ))}
        </div>
      )}

      {/* Create form */}
      {showTokenForm ? (
        <Form {...tokenForm}>
          <form
            onSubmit={tokenForm.handleSubmit(handleCreateToken)}
            className="mt-3 space-y-3 rounded-md border border-border p-3"
          >
            <FormField
              control={tokenForm.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormControl>
                    <Input
                      type="text"
                      placeholder={t("tokens.namePlaceholder")}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div>
              <p className="mb-2 text-sm font-medium text-foreground">{t("tokens.scopes")}</p>
              <div className="space-y-2">
                {SCOPE_GROUPS.map((group) => (
                  <div key={group} className="flex items-center gap-3">
                    <span className="w-24 text-sm text-muted-foreground">
                      {t(`tokens.scopeGroups.${group}`)}
                    </span>
                    <Label className="flex items-center gap-1.5 text-xs font-normal">
                      <Checkbox
                        checked={tokenScopes.includes(`${group}:read`)}
                        onCheckedChange={() => toggleScope(`${group}:read`)}
                      />
                      {t("tokens.scopeRead")}
                    </Label>
                    <Label className="flex items-center gap-1.5 text-xs font-normal">
                      <Checkbox
                        checked={tokenScopes.includes(`${group}:write`)}
                        onCheckedChange={() => toggleScope(`${group}:write`)}
                      />
                      {t("tokens.scopeWrite")}
                    </Label>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-2 text-sm font-medium text-foreground">{t("tokens.expiration")}</p>
              <div className="flex flex-wrap gap-2">
                {(["30d", "90d", "1y", "never", "custom"] as const).map((preset) => (
                  <Button
                    key={preset}
                    size="sm"
                    variant={tokenPreset === preset ? "default" : "secondary"}
                    type="button"
                    onClick={() => tokenForm.setValue("preset", preset)}
                  >
                    {t(`tokens.preset${preset.charAt(0).toUpperCase() + preset.slice(1)}`)}
                  </Button>
                ))}
              </div>
              {tokenPreset === "custom" && (
                <Input
                  type="date"
                  {...tokenForm.register("customDate")}
                  min={new Date().toISOString().split("T")[0]}
                  className="mt-2"
                />
              )}
            </div>

            <div className="flex gap-2">
              <Button
                className="flex-1"
                type="submit"
                disabled={
                  !tokenName.trim() ||
                  tokenScopes.length === 0 ||
                  createToken.isPending
                }
              >
                {createToken.isPending ? <Spinner /> : <Code size={16} />}
                {t("tokens.createToken")}
              </Button>
              <Button
                variant="ghost"
                type="button"
                onClick={() => setShowTokenForm(false)}
              >
                {t("common.cancel")}
              </Button>
            </div>
          </form>
        </Form>
      ) : (
        <Button
          variant="outline"
          className="mt-3 w-full border-primary text-primary hover:bg-primary/10"
          onClick={() => setShowTokenForm(true)}
        >
          <Plus size={16} />
          {t("tokens.createToken")}
        </Button>
      )}
      {dialogProps && <ConfirmDialog {...dialogProps} />}
    </div>
  );
}
