import { useSyncExternalStore } from "react";
import { en } from "./locales/en";
import { it } from "./locales/it";

const dictionaries = { en, it };
export type Locale = keyof typeof dictionaries;
const storageKey = "giulietto-locale";

function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && Object.hasOwn(dictionaries, value);
}

function detect(): Locale {
  try {
    const stored = localStorage.getItem(storageKey);
    if (isLocale(stored)) return stored;
  } catch {}
  const preferred = typeof navigator === "undefined" ? [] : navigator.languages;
  return preferred.map((tag) => tag.slice(0, 2).toLowerCase()).find(isLocale) ?? "en";
}

export let locale = detect();
export let t = dictionaries[locale];
const listeners = new Set<() => void>();

export function setLocale(next: Locale) {
  locale = next;
  t = dictionaries[next];
  try {
    localStorage.setItem(storageKey, next);
  } catch {}
  for (const listener of listeners) listener();
}

export function useLocale() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => locale,
  );
}

export function errorMessage(error: unknown) {
  const code = error instanceof Error ? error.message : error;
  return typeof code === "string" && Object.hasOwn(t.errors, code)
    ? t.errors[code as keyof typeof t.errors]
    : t.errors.unreachable;
}

export function formatDecimal(value: number) {
  return value.toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

export function cardLabel(card: number) {
  const rank = ((card - 1) % 10) + 1;
  return t.cards.name(
    t.cards.ranks[rank] ?? String(rank),
    t.cards.suits[Math.floor((card - 1) / 10)],
  );
}
