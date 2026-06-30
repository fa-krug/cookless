"use client";

import { useRouter } from "next/navigation";
import { useConfirm } from "@/components/ui/confirm-dialog";
import type { HouseholdDto } from "@/lib/households/serialize";
import type { MemberDto } from "@/lib/households/membership";
import { HouseholdInfo } from "./household-info";
import { MembersList } from "./members-list";
import { InviteSection } from "./invite-section";
import { ManageHouseholds } from "./manage-households";
import { DangerZone } from "./danger-zone";

interface HouseholdClientProps {
  households: HouseholdDto[];
  activeId: string | null;
  active: HouseholdDto | null;
  members: MemberDto[];
  currentEmail: string;
}

export function HouseholdClient({
  households,
  activeId,
  active,
  members,
  currentEmail,
}: HouseholdClientProps) {
  const router = useRouter();
  const { confirm, dialog } = useConfirm();

  const isOwner = active?.role === "OWNER";

  function refresh() {
    router.refresh();
  }

  return (
    <>
      {!active && (
        <p className="text-sm text-muted-foreground">
          {/* no active household */}
        </p>
      )}

      {active && (
        <HouseholdInfo
          active={active}
          isOwner={isOwner}
          onRefresh={refresh}
        />
      )}

      {active && (
        <MembersList
          householdId={active.id}
          members={members}
          currentEmail={currentEmail}
          isOwner={isOwner}
          confirm={confirm}
          onRefresh={refresh}
        />
      )}

      {active && isOwner && (
        <InviteSection householdId={active.id} />
      )}

      <ManageHouseholds
        households={households}
        activeId={activeId}
        confirm={confirm}
        onRefresh={refresh}
      />

      {active && (
        <DangerZone
          active={active}
          isOwner={isOwner}
          confirm={confirm}
          onRefresh={refresh}
        />
      )}

      {dialog}
    </>
  );
}
