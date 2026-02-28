import { useState } from "react";
import { Navigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "../hooks/useAuth";
import { api } from "../api/client";
import { addPasskey } from "../api/webauthn";
import { KeyRound, Home, Lock, Check } from "lucide-react";

const STEPS = ["CHANGE_PASSWORD", "ADD_PASSKEY", "CREATE_HOUSEHOLD"] as const;

function StepIndicator({ currentStep }: { currentStep: string }) {
  const { t } = useTranslation();
  const icons = [Lock, KeyRound, Home];
  const currentIndex = STEPS.indexOf(currentStep as (typeof STEPS)[number]);

  return (
    <div className="mb-8">
      <p className="mb-4 text-center text-sm text-gray-500">
        {t("setup.step", { current: currentIndex + 1, total: 3 })}
      </p>
      <div className="flex items-center justify-center gap-2">
        {STEPS.map((step, i) => {
          const Icon = icons[i];
          const isActive = i === currentIndex;
          const isDone = i < currentIndex;
          return (
            <div key={step} className="flex items-center gap-2">
              {i > 0 && (
                <div
                  className={`h-0.5 w-8 ${isDone ? "bg-orange-500" : "bg-gray-200"}`}
                />
              )}
              <div
                className={`flex h-10 w-10 items-center justify-center rounded-full ${
                  isActive
                    ? "bg-orange-500 text-white"
                    : isDone
                      ? "bg-orange-100 text-orange-500"
                      : "bg-gray-100 text-gray-400"
                }`}
              >
                {isDone ? <Check size={20} /> : <Icon size={20} />}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

import { extractApiDetail, mapPasswordError } from "../utils/passwordErrors";

function ChangePasswordStep({ onComplete }: { onComplete: () => void }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (newPassword !== confirmPassword) {
      setError(t("setup.changePassword.mismatch"));
      return;
    }

    setSubmitting(true);
    try {
      await api.post("/api/v1/users/me/password/", {
        current_password: currentPassword,
        new_password: newPassword,
      });
      onComplete();
    } catch (err: unknown) {
      setError(mapPasswordError(extractApiDetail(err), t));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold text-gray-900">
          {t("setup.changePassword.title")}
        </h2>
        <p className="mt-1 text-sm text-gray-500">
          {t("setup.changePassword.description")}
        </p>
      </div>

      <div className="text-sm text-gray-500">{user?.email}</div>

      <div>
        <Label>
          {t("setup.changePassword.currentPassword")}
        </Label>
        <Input
          type="password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          required
        />
      </div>

      <div>
        <Label>
          {t("setup.changePassword.newPassword")}
        </Label>
        <Input
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          required
        />
      </div>

      <div>
        <Label>
          {t("setup.changePassword.confirmPassword")}
        </Label>
        <Input
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          required
        />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <Button
        type="submit"
        className="w-full"
        disabled={submitting}
      >
        {submitting ? t("common.loading") : t("setup.changePassword.submit")}
      </Button>
    </form>
  );
}

function AddPasskeyStep({ onComplete }: { onComplete: () => void }) {
  const { t } = useTranslation();
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");
  const [skipping, setSkipping] = useState(false);

  async function handleAdd() {
    setAdding(true);
    setError("");
    try {
      await addPasskey(navigator.userAgent);
      onComplete();
    } catch (err) {
      if (err instanceof DOMException && err.name === "NotAllowedError") {
        setAdding(false);
        return;
      }
      setError(t("errors.passkeyAdd"));
    } finally {
      setAdding(false);
    }
  }

  async function handleSkip() {
    setSkipping(true);
    try {
      await api.post("/api/v1/users/me/skip-passkey/");
      onComplete();
    } catch {
      setError(t("common.error"));
    } finally {
      setSkipping(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold text-gray-900">
          {t("setup.addPasskey.title")}
        </h2>
        <p className="mt-1 text-sm text-gray-500">
          {t("setup.addPasskey.description")}
        </p>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <Button
        className="w-full"
        onClick={handleAdd}
        disabled={adding || skipping}
      >
        <KeyRound size={18} />
        {adding ? t("common.loading") : t("setup.addPasskey.add")}
      </Button>

      <Button
        variant="outline"
        className="w-full"
        onClick={handleSkip}
        disabled={adding || skipping}
      >
        {skipping ? t("common.loading") : t("setup.addPasskey.skip")}
      </Button>
    </div>
  );
}

function CreateHouseholdStep({ onComplete }: { onComplete: () => void }) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      await api.post("/api/v1/households/", { name });
      onComplete();
    } catch {
      setError(t("errors.householdCreate"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold text-gray-900">
          {t("setup.createHousehold.title")}
        </h2>
        <p className="mt-1 text-sm text-gray-500">
          {t("setup.createHousehold.description")}
        </p>
      </div>

      <div>
        <Label>
          {t("setup.createHousehold.name")}
        </Label>
        <Input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t("setup.createHousehold.namePlaceholder")}
          required
        />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <Button
        type="submit"
        className="w-full"
        disabled={submitting || !name.trim()}
      >
        {submitting ? t("common.loading") : t("setup.createHousehold.submit")}
      </Button>
    </form>
  );
}

export default function SetupWizardPage() {
  const { user, refreshUser } = useAuth();

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (user.onboarding_step === "COMPLETED") {
    return <Navigate to="/welcome" replace />;
  }

  async function handleStepComplete() {
    await refreshUser();
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-lg">
        <h1 className="mb-6 text-center text-2xl font-bold text-gray-900">
          Cookless
        </h1>

        <StepIndicator currentStep={user.onboarding_step} />

        {user.onboarding_step === "CHANGE_PASSWORD" && (
          <ChangePasswordStep onComplete={handleStepComplete} />
        )}
        {user.onboarding_step === "ADD_PASSKEY" && (
          <AddPasskeyStep onComplete={handleStepComplete} />
        )}
        {user.onboarding_step === "CREATE_HOUSEHOLD" && (
          <CreateHouseholdStep onComplete={handleStepComplete} />
        )}
      </div>
    </div>
  );
}
