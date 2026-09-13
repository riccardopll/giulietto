import { useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Pencil, PlayingCard, Target, Timer } from "lucide-react";
import type { StatsResponse } from "@/shared/player-stats";
import { type AvatarId } from "@/shared/avatars";
import { Avatar } from "./avatar";
import { AvatarPicker } from "./avatar-picker";
import { Button } from "./ui/button";
import { NameChangeInput } from "./ui/name-change-input";
import { ActionDialog } from "./ui/action-dialog";
import { PageHeader } from "./ui/page-header";
import { TrophyIcon } from "./ui/trophy-icon";
import { PlacementMedal } from "./ui/placement-medal";
import { cn } from "../utils";

type Profile = StatsResponse["profile"];

function PageHeading({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <PageHeader className="mb-6 flex gap-2">
      <Button
        variant="ghost"
        className="size-11 shrink-0 p-0"
        aria-label="Back to home"
        onClick={onBack}
      >
        <ArrowLeft />
      </Button>
      <h1 className="min-w-0 flex-1 text-2xl font-semibold">{title}</h1>
    </PageHeader>
  );
}

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
      title={mode === "name" ? "Edit your name" : "Choose your avatar"}
      hideTitle={mode === "name"}
      centerTitle={mode === "avatar"}
      actionLabel={saving ? "Saving…" : "Save"}
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
          toast.error((e as Error).message, { id: "profile-error" });
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
    <main
      key={page}
      className="mx-auto w-full max-w-md animate-in fade-in slide-in-from-bottom-1 pb-8 duration-200 ease-out"
    >
      <PageHeading title={page === "profile" ? "Your profile" : "Leaderboard"} onBack={onBack} />
      {page === "profile" ? (
        <>
          <div className="flex flex-col items-center">
            <Button
              variant="ghost"
              className="relative h-auto rounded-full p-1"
              aria-label="Edit your avatar"
              onClick={() => setEditing("avatar")}
            >
              <Avatar avatar={profile.avatar} className="size-28" />
              <span className="absolute bottom-1 right-1 grid size-8 place-items-center rounded-full border bg-card">
                <Pencil className="size-4" />
              </span>
            </Button>
            <Button
              variant="ghost"
              className="mt-2 h-auto max-w-full gap-2 whitespace-normal text-2xl font-semibold"
              aria-label="Edit your name"
              onClick={() => setEditing("name")}
            >
              {profile.name || "Guest"}
              <Pencil className="size-4 shrink-0 text-muted-foreground" />
            </Button>
            {stats && (
              <>
                <p className="mt-3 text-4xl font-semibold text-primary">Level {stats.level}</p>
                <div className="mt-5 w-full max-w-xs">
                  <div
                    role="progressbar"
                    aria-label="Level progress"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={stats.xp % 100}
                    className="h-2.5 overflow-hidden rounded-full bg-muted"
                  >
                    <div
                      className="h-full rounded-full bg-primary transition-[width]"
                      style={{ width: `${stats.xp % 100}%` }}
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
                  ["Matches", stats.matches],
                  ["Wins", stats.wins],
                  [
                    "Win rate",
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
                    label: "Aces of Coins played",
                    value: stats.acesOfCoinsPlayed ?? "—",
                    icon: PlayingCard,
                  },
                  {
                    label: "Average prediction",
                    value: stats.averagePrediction?.toFixed(1) ?? "—",
                    icon: Target,
                  },
                  {
                    label: "Average turn time",
                    value:
                      stats.averageDecisionMs == null
                        ? "—"
                        : `${(stats.averageDecisionMs / 1000).toFixed(1)} s`,
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
              Loading stats…
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
              Loading leaderboard…
            </p>
          ) : data.leaders.length === 0 ? (
            <div className="rounded-xl border border-dashed p-8 text-center">
              <TrophyIcon className="mx-auto mb-3 size-8 text-primary" />
              <p>Finish a match to join the leaderboard.</p>
            </div>
          ) : (
            <ol aria-label="Leaderboard" className="grid gap-1">
              {data.leaders.map((player, index) => (
                <li
                  key={index}
                  className={cn(
                    "flex min-w-0 items-center gap-3 rounded-xl px-3 py-3",
                    player.you && "bg-accent/60 text-primary",
                  )}
                >
                  <span className="grid w-7 shrink-0 place-items-center text-sm font-semibold text-muted-foreground tabular-nums">
                    {index < 3 ? (
                      <>
                        <PlacementMedal place={index + 1} className="h-9 w-7" />
                        <span className="sr-only">{index + 1}</span>
                      </>
                    ) : (
                      index + 1
                    )}
                  </span>
                  <Avatar avatar={player.avatar} className="size-10" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">
                      {player.name}
                      {player.you ? " (you)" : ""}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">Level {player.level}</p>
                  </div>
                  <span className="shrink-0 text-sm font-semibold tabular-nums">
                    {player.wins} {player.wins === 1 ? "win" : "wins"}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </>
      )}
    </main>
  );
}
