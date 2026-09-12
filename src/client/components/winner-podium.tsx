import { Crown } from "lucide-react";
import type { view } from "../../shared/game";
import { standings } from "../standings";
import { avatarHue, cn } from "../utils";
import { Button } from "./ui/button";

type State = ReturnType<typeof view>;
type Player = State["players"][number];

function Avatar({ player, winner = false }: { player: Player; winner?: boolean }) {
  return (
    <span
      aria-hidden="true"
      style={{ backgroundColor: `hsl(${avatarHue(player.id)} 45% 84%)` }}
      className={cn(
        "mx-auto flex size-12 items-center justify-center rounded-full border-2 border-background text-2xl font-semibold text-[#493642] shadow-[0_0_0_1px_#6f4a5e12] sm:size-16 sm:text-3xl",
        winner && "size-16 sm:size-20",
      )}
    >
      {Array.from(player.name)[0]?.toLocaleUpperCase()}
    </span>
  );
}

export function WinnerPodium({
  game,
  winner,
  onReset,
}: {
  game: State;
  winner: Player;
  onReset: () => void;
}) {
  const groups = standings(game.players, winner.id);
  const others = groups.filter((group) => group.place > 3);
  return (
    <section className="mx-auto my-4 w-full max-w-lg px-2 py-3 text-center sm:px-6">
      <h1 className="text-3xl font-bold wrap-anywhere sm:text-4xl">
        {winner.id === game.you ? "You win" : `${winner.name} wins`}
      </h1>
      <div className="mt-6 grid grid-cols-3 items-end gap-2 sm:gap-3" aria-label="Podium">
        {[2, 1, 3].map((place) => {
          const group = groups.find((entry) => entry.place === place);
          if (!group) return <div key={place} />;
          return (
            <section
              key={place}
              aria-label={`${["", "First", "Second", "Third"][place]} place`}
              className="min-w-0"
            >
              <div className="mb-3 space-y-2">
                {place === 1 && (
                  <Crown
                    className="mx-auto size-8 fill-[#dfb64d] text-[#dfb64d]"
                    aria-hidden="true"
                  />
                )}
                {group.players.length === 1 && (
                  <Avatar player={group.players[0]} winner={place === 1} />
                )}
                {group.players.map((player) => (
                  <p key={player.id} className="text-sm font-bold wrap-anywhere sm:text-base">
                    {player.name}
                    {player.id === game.you && (
                      <span className="block text-[10px] font-normal text-muted-foreground">
                        You
                      </span>
                    )}
                  </p>
                ))}
              </div>
              <div
                className={cn(
                  "rounded-t-2xl bg-accent px-2 pt-5",
                  place === 1
                    ? "h-52 bg-primary sm:h-64"
                    : place === 2
                      ? "h-40 sm:h-48"
                      : "h-28 sm:h-32",
                )}
              >
                <svg
                  aria-hidden="true"
                  viewBox="0 0 64 80"
                  className={cn(
                    "mx-auto h-[70px] w-14 sm:h-20 sm:w-16",
                    place === 1
                      ? "text-[#dfb64d]"
                      : place === 2
                        ? "text-[#c6cbd1]"
                        : "text-[#c68c65]",
                  )}
                >
                  <path
                    d="M14 45 7 77 21 70 30 79 34 48M30 48 34 79 43 70 57 77 50 45"
                    fill="#674653"
                  />
                  <circle cx="32" cy="31" r="29" fill="currentColor" />
                  <circle
                    cx="32"
                    cy="31"
                    r="23"
                    fill="none"
                    stroke="#302a30"
                    strokeOpacity=".25"
                    strokeWidth="2"
                  />
                  <text
                    x="32"
                    y="42"
                    textAnchor="middle"
                    fill="#302a30"
                    className="text-[32px] font-bold"
                  >
                    {place}
                  </text>
                </svg>
              </div>
            </section>
          );
        })}
      </div>
      {others.length > 0 && (
        <div className="mt-5">
          <h2 className="text-sm font-semibold">Other players</h2>
          <ul className="mt-3 flex flex-wrap justify-center gap-x-5 gap-y-3">
            {others.map((group) => (
              <li
                key={group.place}
                aria-label={`Place ${group.place}`}
                className="min-w-0 max-w-24 space-y-1"
              >
                {group.players.length === 1 && <Avatar player={group.players[0]} />}
                {group.players.map((player) => (
                  <p key={player.id} className="text-xs font-semibold wrap-anywhere">
                    {player.name}
                    {player.id === game.you ? " (you)" : ""}
                  </p>
                ))}
              </li>
            ))}
          </ul>
        </div>
      )}
      <Button
        className="mt-6 min-h-12 w-full whitespace-normal rounded-xl px-4 py-3 text-xl font-bold"
        onClick={onReset}
      >
        Back to tables
      </Button>
    </section>
  );
}
