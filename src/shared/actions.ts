/** Commands that enter a table over HTTP. */
export const ENTRY_ACTIONS: readonly string[] = ["create", "match", "join"];
/** Commands a seated player sends to their table. */
export const TABLE_ACTIONS: readonly string[] = [
  "rename",
  "settings",
  "start",
  "bid",
  "play",
  "emote",
  "leave",
];
