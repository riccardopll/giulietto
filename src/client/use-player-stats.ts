import { useCallback, useEffect, useEffectEvent, useRef, useState } from "react";
import { RotateCw } from "lucide-react";
import { toast } from "./toast";
import type { Profile, StatsResponse } from "../shared/player-stats";
export function usePlayerStats(
  token: string,
  active: boolean,
  onProfile: (profile: Profile) => void,
) {
  const [data, setData] = useState<StatsResponse | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [saving, setSaving] = useState(false);
  const version = useRef(0);
  const receive = useEffectEvent(onProfile);
  const refresh = useCallback(() => {
    toast.dismiss("stats-error");
    setError("");
    setAttempt((a) => a + 1);
  }, []);
  useEffect(() => {
    if (!token || !active) return;
    const controller = new AbortController();
    const current = ++version.current;
    fetch("/api/stats", { headers: { "x-player-token": token }, signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw Error("Could not load player stats.");
        return (await response.json()) as StatsResponse;
      })
      .then((next) => {
        if (controller.signal.aborted || current !== version.current) return;
        setData(next);
        setError("");
        toast.dismiss("stats-error");
        if (next.profile.name) receive(next.profile);
      })
      .catch(() => {
        if (controller.signal.aborted || current !== version.current) return;
        const message = "Could not load player stats.";
        setError(message);
        toast.show(message, {
          id: "stats-error",
          action: { label: "Retry", icon: RotateCw, onClick: refresh },
        });
      });
    return () => controller.abort();
  }, [token, active, attempt, refresh]);
  async function save(profile: Profile) {
    setSaving(true);
    try {
      const response = await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-player-token": token },
        body: JSON.stringify(profile),
      });
      const next = (await response.json()) as Profile & { error?: string };
      if (!response.ok) throw Error(next.error || "Could not save your profile.");
      ++version.current;
      setData((current) =>
        current
          ? {
              ...current,
              profile: next,
              leaders: current.leaders.map((p) => (p.you ? { ...p, ...next } : p)),
            }
          : current,
      );
      onProfile(next);
      setAttempt((a) => a + 1);
    } finally {
      setSaving(false);
    }
  }
  return {
    data,
    error,
    saving,
    save,
    refresh,
  };
}
