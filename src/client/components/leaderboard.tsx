import { useEffect, useState } from "react";
import { winRate, type Leader } from "../../shared/player-stats";
import { Medal, Swords, Trophy } from "lucide-react";
import { Avatar } from "./avatar";
import { PlacementMedal } from "@ui/placement-medal";
import { t } from "../i18n";
import { cn } from "../utils";

const REVEAL_MS = 4000;
const PEEK_DELAY_MS = 600;

export const statIcons = { matches: Swords, winRate: Trophy, secondPlaces: Medal };

function useReveal(peek: boolean) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!peek) return;
    const timer = setTimeout(() => setShown(true), PEEK_DELAY_MS);
    return () => clearTimeout(timer);
  }, [peek]);
  useEffect(() => {
    if (!shown) return;
    const timer = setTimeout(() => setShown(false), REVEAL_MS);
    return () => clearTimeout(timer);
  }, [shown]);
  return [shown, () => setShown((value) => !value)] as const;
}

function PlayerIdentity({ player, featured = false }: { player: Leader; featured?: boolean }) {
  return (
    <div className={cn("min-w-0", !featured && "flex-1")}>
      <p
        className={cn(
          "text-sm font-semibold",
          featured ? "line-clamp-2 wrap-anywhere" : "truncate",
        )}
        title={player.name}
      >
        {player.name}
        {player.you ? t.youSuffix : ""}
      </p>
      <p className="mt-0.5 truncate text-xs text-muted-foreground">{t.level(player.level)}</p>
    </div>
  );
}

function Wins({ player, featured = false }: { player: Leader; featured?: boolean }) {
  return (
    <span
      className={cn(
        "shrink-0 text-sm font-semibold tabular-nums",
        !featured && "min-w-14 text-right",
      )}
    >
      {t.leaderboard.wins(player.wins)}
    </span>
  );
}

function Stats({ player, featured = false }: { player: Leader; featured?: boolean }) {
  return [
    {
      label: t.profile.matches,
      value: player.matches,
      icon: statIcons.matches,
      width: "min-w-10",
      delay: "delay-0",
    },
    {
      label: t.profile.winRate,
      value: `${winRate(player)}%`,
      icon: statIcons.winRate,
      width: "min-w-12",
      delay: "delay-[60ms]",
    },
    {
      label: t.profile.secondPlaces,
      value: player.secondPlaces,
      icon: statIcons.secondPlaces,
      width: "min-w-9",
      delay: "delay-[120ms]",
    },
  ].map(({ label, value, icon: Icon, width, delay }) => (
    <span
      key={label}
      className={cn(
        delay,
        "flex shrink-0 items-center gap-0.5 font-semibold tabular-nums transition-[opacity,translate] duration-300 group-data-[state=closed]:opacity-0",
        featured
          ? "text-xs group-data-[state=closed]:-translate-y-1"
          : cn(width, "justify-end text-sm group-data-[state=closed]:translate-x-2"),
      )}
    >
      <Icon
        className={cn("shrink-0 text-muted-foreground", featured ? "size-3" : "size-3.5")}
        aria-hidden="true"
      />
      <span className="sr-only">{label}: </span>
      {value}
    </span>
  ));
}

const entryClass =
  "group w-full rounded-lg outline-2 outline-offset-2 outline-transparent transition-colors focus-visible:outline-ring active:bg-accent/60";

function PodiumEntry({ player, place, peek }: { player: Leader; place: number; peek: boolean }) {
  const [shown, toggle] = useReveal(peek);
  return (
    <button
      type="button"
      aria-expanded={shown}
      data-state={shown ? "open" : "closed"}
      onClick={toggle}
      className={cn(
        entryClass,
        "flex flex-col items-center px-1 py-2 text-center",
        player.you && "text-primary",
      )}
    >
      <div className="relative mb-7">
        <Avatar
          avatar={player.avatar}
          className={cn(
            place === 1
              ? "size-20 ring-2 ring-gold/60 ring-offset-2 ring-offset-background shadow-[0_0_20px] shadow-gold/20"
              : "size-16",
          )}
        />
        <PlacementMedal
          place={place}
          className="absolute -bottom-5 left-1/2 h-10 w-8 -translate-x-1/2"
        />
      </div>
      <PlayerIdentity player={player} featured />
      <div className="relative mt-1.5">
        <Wins player={player} featured />
        <div className="absolute top-full left-1/2 flex -translate-x-1/2 items-center gap-1.5 pt-1.5 whitespace-nowrap">
          <Stats player={player} featured />
        </div>
      </div>
    </button>
  );
}

function RowEntry({ player, place, peek }: { player: Leader; place: number; peek: boolean }) {
  const [shown, toggle] = useReveal(peek);
  return (
    <button
      type="button"
      aria-expanded={shown}
      data-state={shown ? "open" : "closed"}
      onClick={toggle}
      className={cn(
        entryClass,
        "flex min-h-16 min-w-0 items-center gap-3 rounded-none px-2 py-3 text-left",
        player.you && "bg-accent/60 text-primary",
      )}
    >
      <span className="w-5 shrink-0 text-center text-sm font-semibold text-muted-foreground tabular-nums">
        {place}
      </span>
      <div
        className={cn(
          "shrink-0 overflow-hidden transition-[width,margin,opacity] duration-300",
          shown ? "-mr-3 w-0 opacity-0" : "w-10",
        )}
      >
        <Avatar avatar={player.avatar} className="size-10" />
      </div>
      <PlayerIdentity player={player} />
      <div
        className={cn(
          "-ml-3 grid shrink-0 transition-[grid-template-columns] duration-300",
          shown ? "grid-cols-[1fr]" : "grid-cols-[0fr]",
        )}
      >
        <div className="flex min-w-0 items-center gap-1.5 overflow-hidden pl-2">
          <Stats player={player} />
        </div>
      </div>
      <Wins player={player} />
    </button>
  );
}

export function Leaderboard({ players }: { players: Leader[] }) {
  const peeked = Math.max(
    0,
    players.findIndex((player) => player.you),
  );
  return (
    <ol aria-label={t.leaderboard.title} className="grid grid-cols-3">
      {players.map((player, index) =>
        index < 3 ? (
          <li
            key={index}
            value={index + 1}
            aria-label={`${t.leaderboard.place(index + 1)}: ${player.name}${player.you ? t.youSuffix : ""}`}
            className={cn(
              "row-start-1 min-w-0 px-1 pb-8",
              index === 0 ? "col-start-2" : index === 1 ? "col-start-1 pt-8" : "col-start-3 pt-8",
            )}
          >
            <PodiumEntry player={player} place={index + 1} peek={index === peeked} />
          </li>
        ) : (
          <li key={index} value={index + 1} className="col-span-3 border-t">
            <RowEntry player={player} place={index + 1} peek={index === peeked} />
          </li>
        ),
      )}
    </ol>
  );
}
