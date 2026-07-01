"use client";

import { useState } from "react";
import { Clipboard, Link, UserPlus } from "lucide-react";
import { useT } from "@/lib/i18n/provider";
import { createHouseholdInviteAction } from "@/app/(account)/actions";
import { toast } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";
import { SettingsSection } from "../settings-section";

interface InviteData {
  code: string;
  expiresAt: Date;
}

interface InviteSectionProps {
  householdId: string;
}

export function InviteSection({ householdId }: InviteSectionProps) {
  const { t } = useT();
  const [invite, setInvite] = useState<InviteData | null>(null);
  const [copied, setCopied] = useState(false);
  const [isPending, setIsPending] = useState(false);

  async function handleGenerate() {
    setIsPending(true);
    const res = await createHouseholdInviteAction(householdId);
    setIsPending(false);
    if (!res.ok) {
      toast.error(t("errors.inviteCreate"));
      return;
    }
    setInvite(res.data);
    setCopied(false);
  }

  async function handleCopy() {
    if (!invite) return;
    await navigator.clipboard.writeText(invite.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <SettingsSection
      icon={UserPlus}
      title={t("household.generateInvite")}
      description={t("household.inviteDescription")}
    >
      <Button onClick={handleGenerate} disabled={isPending}>
        <Link size={16} />
        {t("household.generateInvite")}
      </Button>

      {invite && (
        <div className="mt-3 rounded-md bg-muted p-3">
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded bg-muted px-2 py-1 font-mono text-sm">
              {invite.code}
            </code>
            <Button variant="secondary" size="sm" onClick={handleCopy}>
              <Clipboard size={14} />
              {copied ? t("household.codeCopied") : t("household.copyCode")}
            </Button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {t("household.inviteExpiry", {
              date: new Date(invite.expiresAt).toLocaleDateString(),
            })}
          </p>
        </div>
      )}
    </SettingsSection>
  );
}
