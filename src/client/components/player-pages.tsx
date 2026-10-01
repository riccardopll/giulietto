import { useState, type CSSProperties } from "react";
import { errorMessage, formatDecimal, t } from "../i18n";
import { toast } from "../toast";
import { Pencil, PlayingCard, Target, Timer } from "lucide-react";
import type { Profile, StatsResponse } from "../../shared/player-stats";
import { type AvatarId } from "../../shared/avatars";
import { Avatar } from "./avatar";
import { AvatarPicker } from "./avatar-picker";
import { Button } from "@ui/button";
import { PageHeading } from "@ui/page-heading";
import { NameChangeInput } from "@ui/name-change-input";
import { ActionDialog } from "@ui/action-dialog";
import { Leaderboard } from "./leaderboard";
import { cn } from "../utils";

function ProfileEditor({
  mode,
  profile,
  saving,
  onSave,
  onClose,
}: {
  mode: "name" | "avatar";
  profile: Profile;
  saving: boolean;
  onSave: (profile: Profile) => Promise<void>;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [avatar, setAvatar] = useState<AvatarId>(profile.avatar);
  return (
    <ActionDialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={mode === "name" ? t.editName : t.profile.chooseAvatar}
      hideTitle={mode === "name"}
      actionLabel={saving ? t.saving : t.save}
      busy={saving}
      actionDisabled={mode === "name" && !name.trim()}
      onSubmit={async () => {
        toast.dismiss("profile-error");
        try {
          await onSave(
            mode === "name" ? { ...profile, name: name.trim() } : { ...profile, avatar },
          );
          onClose();
        } catch (e) {
          toast.show(errorMessage(e), { id: "profile-error" });
        }
      }}
    >
      {mode === "name" ? (
        <NameChangeInput value={name} disabled={saving} onChange={setName} />
      ) : (
        <AvatarPicker value={avatar} disabled={saving} onChange={setAvatar} />
      )}
    </ActionDialog>
  );
}

export function PlayerPages({
  page,
  data,
  profile,
  error,
  saving,
  onSave,
  onBack,
}: {
  page: "profile" | "leaderboard";
  data: StatsResponse | null;
  profile: Profile;
  error: string;
  saving: boolean;
  onSave: (profile: Profile) => Promise<void>;
  onBack: () => void;
}) {
  const [editing, setEditing] = useState<"name" | "avatar" | null>(null);
  const stats = data?.player;
  return (
    <main key={page} className="mx-auto w-full max-w-md animate-[page-in_.2s_ease-out] pb-8">
      <PageHeading
        title={page === "profile" ? t.profile.title : t.leaderboard.title}
        onBack={onBack}
      />
      {page === "profile" ? (
        <>
          <div className="flex flex-col items-center">
            <Button
              variant="ghost"
              size="pill"
              className="relative"
              aria-label={t.profile.editAvatar}
              disabled={!data || saving}
              onClick={() => setEditing("avatar")}
            >
              <Avatar avatar={profile.avatar} className="size-28" />
              <span className="absolute bottom-1 right-1 grid size-8 place-items-center rounded-full border bg-card">
                <Pencil className="size-4" />
              </span>
            </Button>
            <Button
              variant="ghost"
              className="mt-2 h-auto max-w-full"
              aria-label={t.editName}
              disabled={!data || saving}
              onClick={() => setEditing("name")}
            >
              <span className="text-2xl font-semibold whitespace-normal">
                {profile.name || t.guest}
              </span>
              <Pencil className="size-4 shrink-0 text-muted-foreground" />
            </Button>
            {stats && (
              <>
                <p className="mt-3 text-4xl font-semibold text-primary">{t.level(stats.level)}</p>
                <div className="mt-5 w-full max-w-xs">
                  <div
                    role="progressbar"
                    aria-label={t.profile.progress}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={stats.xp % 100}
                    className="h-2.5 overflow-hidden rounded-full bg-muted"
                  >
                    <div
                      className="h-full w-(--progress) rounded-full bg-primary transition-[width]"
                      style={{ "--progress": `${stats.xp % 100}%` } as CSSProperties}
                    />
                  </div>
                  <p className="mt-2 text-center text-sm text-muted-foreground">
                    {stats.xp % 100} / 100 XP
                  </p>
                </div>
              </>
            )}
          </div>
          {stats ? (
            <>
              <dl className="my-7 grid grid-cols-3 divide-x border-y py-5 text-center">
                {[
                  [t.profile.matches, stats.matches],
                  [t.profile.wins, stats.wins],
                  [
                    t.profile.winRate,
                    `${stats.matches ? Math.round((100 * stats.wins) / stats.matches) : 0}%`,
                  ],
                ].map(([label, value]) => (
                  <div key={label}>
                    <dd className="text-2xl font-semibold tabular-nums">{value}</dd>
                    <dt className="mt-1 text-sm text-muted-foreground">{label}</dt>
                  </div>
                ))}
              </dl>
              <dl className="divide-y">
                {[
                  {
                    label: t.profile.acesPlayed,
                    value: stats.acesOfCoinsPlayed ?? "—",
                    icon: PlayingCard,
                  },
                  {
                    label: t.profile.averagePrediction,
                    value:
                      stats.averagePrediction == null
                        ? "—"
                        : formatDecimal(stats.averagePrediction),
                    icon: Target,
                  },
                  {
                    label: t.profile.averageTurn,
                    value:
                      stats.averageDecisionMs == null
                        ? "—"
                        : `${formatDecimal(stats.averageDecisionMs / 1000)} s`,
                    icon: Timer,
                  },
                ].map(({ label, value, icon: Icon }) => (
                  <div key={label} className="flex items-center justify-between gap-4 py-4 text-sm">
                    <dt className="flex items-center gap-3 text-muted-foreground">
                      <Icon className="size-5 shrink-0" aria-hidden="true" />
                      {label}
                    </dt>
                    <dd className="shrink-0 font-medium tabular-nums">{value}</dd>
                  </div>
                ))}
              </dl>
            </>
          ) : (
            <p
              role="status"
              className={cn("mt-6 text-center text-sm text-muted-foreground", error && "invisible")}
            >
              {t.profile.loading}
            </p>
          )}
          {editing && (
            <ProfileEditor
              mode={editing}
              profile={profile}
              saving={saving}
              onSave={onSave}
              onClose={() => setEditing(null)}
            />
          )}
        </>
      ) : (
        <>
          {!data ? (
            <p role="status" className={error ? "invisible" : undefined}>
              {t.leaderboard.loading}
            </p>
          ) : (
            <Leaderboard players={data.leaders} />
          )}
        </>
      )}
    </main>
  );
}
