import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const args = process.argv.slice(2);
if (args.includes("--help")) {
  console.log(
    "Usage: npm run logs -- [--errors] [--minutes=60] [--from=ISO_DATE] [--to=ISO_DATE]\nReads a local observability token from ~/.config/giulietto/observability-token or CLOUDFLARE_OBSERVABILITY_TOKEN.",
  );
  process.exit(0);
}
const option = (name) =>
  args
    .find((arg) => arg.startsWith(`--${name}=`))
    ?.split("=")
    .slice(1)
    .join("=");
const to = option("to") ? Date.parse(option("to")) : Date.now();
const minutes = Number(option("minutes") ?? 60);
const from = option("from") ? Date.parse(option("from")) : to - minutes * 60000;
if (
  !Number.isFinite(from) ||
  !Number.isFinite(to) ||
  from >= to ||
  args.some((arg) => !/^--(?:errors$|(?:minutes|from|to)=)/.test(arg))
) {
  throw Error("Invalid arguments. Use npm run logs -- --help.");
}
const token =
  process.env.CLOUDFLARE_OBSERVABILITY_TOKEN?.trim() ||
  (await readFile(join(homedir(), ".config/giulietto/observability-token"), "utf8")).trim();
const account = process.env.CLOUDFLARE_ACCOUNT_ID || "5e685011a567671bf6498aa211e42cb4";
const filters = [
  { key: "$workers.scriptName", operation: "eq", type: "string", value: "giulietto" },
];
if (args.includes("--errors"))
  filters.push({ key: "$metadata.error", operation: "exists", type: "string" });
let offset;
let total = 0;
const seen = new Set();
for (;;) {
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${account}/workers/observability/telemetry/query`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        queryId: "giulietto-cli",
        view: "events",
        limit: 2000,
        timeframe: { from, to },
        parameters: { filters, filterCombination: "and" },
        ...(offset ? { offset, offsetDirection: "next" } : {}),
      }),
    },
  );
  const data = await response.json();
  if (!response.ok || !data.success)
    throw Error(`Cloudflare log query failed (${response.status}): ${JSON.stringify(data.errors)}`);
  const events = data.result.events?.events ?? data.result.events ?? [];
  if (!Array.isArray(events)) throw Error("Unexpected Cloudflare event response.");
  for (const event of events) {
    const id = event.$metadata?.id;
    if (id && seen.has(id)) continue;
    if (id) seen.add(id);
    console.log(JSON.stringify(event));
    total++;
  }
  const next = events.at(-1)?.$metadata?.id;
  if (events.length < 2000 || !next || next === offset) break;
  offset = next;
}
console.error(
  `${total} events from ${new Date(from).toISOString()} to ${new Date(to).toISOString()}`,
);
