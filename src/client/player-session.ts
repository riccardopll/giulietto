const tokenKey = "giulietto-token";
const nameKey = "giulietto-name";
const maxAge = 60 * 60 * 24 * 365;

export const cookieError = "Allow cookies to remember your name and keep your guest seat.";

function readCookie(key: string) {
  const value = document.cookie
    .split(";")
    .map((cookie) => cookie.trim())
    .find((cookie) => cookie.startsWith(`${key}=`))
    ?.slice(key.length + 1);
  try {
    return value === undefined ? undefined : decodeURIComponent(value);
  } catch {
    return undefined;
  }
}

function writeCookie(key: string, value: string) {
  const secure = location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${key}=${encodeURIComponent(value)}; Max-Age=${maxAge}; Path=/; SameSite=Lax${secure}`;
  if (readCookie(key) !== value) throw new Error(cookieError);
}

export function readStored(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function storeRoom(code: string | null) {
  try {
    if (code) localStorage.setItem("giulietto-room", code);
    else localStorage.removeItem("giulietto-room");
  } catch {
    // The player can still join by invite when only cookies are available.
  }
}

export function restorePlayer() {
  const savedToken = readCookie(tokenKey) || readStored(tokenKey);
  // The server derives the public player ID from this private credential.
  const token =
    savedToken && /^[0-9a-f-]{36,80}$/i.test(savedToken)
      ? savedToken
      : Array.from(crypto.getRandomValues(new Uint8Array(32)), (n) =>
          n.toString(16).padStart(2, "0"),
        ).join("");
  const name = (readCookie(nameKey) ?? readStored(nameKey) ?? "").trim().slice(0, 20);
  writeCookie(tokenKey, token);
  savePlayerName(name);
  try {
    // Move existing guests to cookies without changing their player ID.
    localStorage.removeItem(tokenKey);
    localStorage.removeItem(nameKey);
  } catch {
    // Cookies are sufficient to remember the player.
  }
  return { token, name };
}

export function savePlayerName(name: string) {
  // Replace incomplete Unicode characters before encoding the cookie.
  writeCookie(nameKey, new TextDecoder().decode(new TextEncoder().encode(name)));
}

export function restoreSession() {
  try {
    const player = restorePlayer();
    const code = new URLSearchParams(location.search).get("table")?.toUpperCase() || "";
    const joinCode = code || readStored("giulietto-room");
    return {
      ...player,
      name: player.name || (joinCode ? "Guest" : ""),
      code,
      joinCode,
      error: "",
    };
  } catch {
    return { token: "", name: "", code: "", joinCode: null, error: cookieError };
  }
}
