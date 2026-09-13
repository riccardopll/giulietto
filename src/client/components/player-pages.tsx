import { useState } from "react";
import { ArrowLeft, Check, Pencil, RefreshCw } from "lucide-react";
import type { StatsResponse } from "@/shared/player-stats";
import { avatars, type AvatarId } from "@/shared/avatars";
import { Avatar } from "./avatar";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { ActionDialog } from "./ui/action-dialog";
import { PageHeader } from "./ui/page-header";
import { TrophyIcon } from "./ui/trophy-icon";
import { cn } from "../utils";

type Profile = StatsResponse["profile"];

function PageHeading({
  title,
  onBack,
  refresh,
}: {
  title: string;
  onBack: () => void;
  refresh?: () => void;
}) {
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
      {refresh && (
        <Button
          variant="ghost"
          className="size-11 shrink-0 p-0"
          aria-label="Refresh stats"
          onClick={refresh}
        >
          <RefreshCw className="size-4" />
        </Button>
      )}
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
  const [name, setName] = useState(profile.name);
  const [avatar, setAvatar] = useState<AvatarId>(profile.avatar);
  const [error, setError] = useState("");
  return (
    <ActionDialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={mode === "name" ? "Edit your name" : "Choose your avatar"}
      actionLabel={saving ? "Saving…" : mode === "name" ? "Save name" : "Save avatar"}
      busy={saving}
      actionDisabled={mode === "name" && !name.trim()}
      onSubmit={async () => {
        setError("");
        try {
          await onSave(
            mode === "name" ? { ...profile, name: name.trim() } : { ...profile, avatar },
          );
          onClose();
        } catch (e) {
          setError((e as Error).message);
        }
      }}
    >
      {mode === "name" ? (
        <label className="grid gap-2 text-sm font-medium">
          Display name
          <Input
            className="h-12 text-base md:text-base"
            autoComplete="nickname"
            maxLength={20}
            value={name}
            disabled={saving}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
      ) : (
        <fieldset disabled={saving}>
          <legend className="mb-3 text-sm font-medium">Player avatar</legend>
          <div className="grid grid-cols-3 gap-3">
            {avatars.map((option) => (
              <label key={option.id} className="relative cursor-pointer">
                <input
                  className="peer absolute inset-0 z-10 size-full cursor-pointer opacity-0"
                  type="radio"
                  name="avatar"
                  value={option.id}
                  checked={avatar === option.id}
                  onChange={() => setAvatar(option.id)}
                  aria-label={option.name}
                />
                <span className="flex flex-col items-center gap-2 rounded-xl border-2 border-transparent p-2 text-center text-xs peer-checked:border-primary peer-checked:bg-accent/40 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ring peer-disabled:opacity-50">
                  <Avatar avatar={option.id} className="size-16" />
                  <span>{option.name}</span>
                  {avatar === option.id && (
                    <Check className="absolute right-2 top-2 size-4 rounded-full bg-primary p-0.5 text-white" />
                  )}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
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
  refresh,
  onSave,
  onBack,
}: {
  page: "profile" | "leaderboard";
  data: StatsResponse | null;
  profile: Profile;
  error: string;
  saving: boolean;
  refresh: () => void;
  onSave: (profile: Profile) => Promise<void>;
  onBack: () => void;
}) {
  const [editing, setEditing] = useState<"name" | "avatar" | null>(null);
  const stats = data?.player;
  return (
    <main className={cn("mx-auto w-full max-w-md pb-8", page === "leaderboard" && "pt-5 sm:pt-8")}>
      <PageHeading
        title={page === "profile" ? "Your profile" : "Leaderboard"}
        onBack={onBack}
        refresh={page === "leaderboard" ? refresh : undefined}
      />
      {error && (
        <p role="alert" className="mb-4 rounded-xl border p-4 text-sm">
          {error}{" "}
          <Button variant="link" onClick={refresh}>
            Retry
          </Button>
        </p>
      )}
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
              <ul aria-label="Locked stats" className="divide-y">
                {[0, 1, 2].map((slot) => (
                  <li
                    key={slot}
                    aria-label="Locked"
                    className="flex items-center justify-between gap-4 py-4"
                  >
                    <span aria-hidden="true" className="h-3 w-32 rounded-full bg-muted" />
                    <span aria-hidden="true">🔒</span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            !error && (
              <p role="status" className="mt-6 text-center text-sm text-muted-foreground">
                Loading stats…
              </p>
            )
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
          <p className="mb-5 text-sm text-muted-foreground">All time · Ranked by wins</p>
          {!data ? (
            !error && <p role="status">Loading leaderboard…</p>
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
                  <span
                    className={cn(
                      "grid size-7 shrink-0 place-items-center rounded-full text-sm font-semibold tabular-nums",
                      index === 0
                        ? "bg-[#c9a43e] text-white"
                        : index === 1
                          ? "bg-[#a5a1a3] text-white"
                          : index === 2
                            ? "bg-[#aa7350] text-white"
                            : "text-muted-foreground",
                    )}
                  >
                    {index + 1}
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
