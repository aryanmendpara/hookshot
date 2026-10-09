const VITE_ORIGIN = import.meta.env.VITE_API_ORIGIN ?? "";

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

async function request(path, init = {}) {
  let res;
  try {
    res = await fetch(VITE_ORIGIN + path, {
      // The session lives in an httpOnly cookie set by the API at login, so JS
      // never sees the token. "include" is what makes the browser send it.
      credentials: "include",
      headers: init.body ? { "Content-Type": "application/json" } : undefined,
      ...init,
    });
  } catch {
    throw new ApiError("Can't reach the server. Check your connection.", 0);
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(pickMessage(data) ?? fallback(res.status), res.status);
  return data;
}

function pickMessage(data) {
  return data?.message ?? data?.error;
}

function fallback(status) {
  if (status === 429) return "Too many attempts. Wait a moment and try again.";
  if (status === 401) return "Incorrect email or password.";
  if (status === 409) return "That email is already registered.";
  if (status === 404) return "Not found.";
  return "Something went wrong. Try again.";
}

const post = (path, body) => request(path, { method: "POST", body: JSON.stringify(body) });
const get = (path) => request(path);

// Both return the user ({ email, apiKey, apiKeyCreatedAt }). There is no token
// in the body to keep — the cookie does that job.
export const login = (email, password) => post("/api/auth/login", { email, password });

export const signup = (email, password, passwordConfirmation) =>
  post("/api/auth/register", { email, password, passwordConfirmation });

export const logout = () => post("/api/auth/logout");

// API responses may arrive as a bare array or wrapped in a collection key.
const asList = (data) => (Array.isArray(data) ? data : (data?.endpoints ?? data?.events ?? []));

export const getEndpoints = async () => asList(await get("/api/endpoints"));

export const getEvents = async () => asList(await get("/api/events"));

export const createEndpoint = (url, active) => post("/api/endpoints", { url, active });

export const updateEndpoint = (id, patch) =>
  request(`/api/endpoints/${id}`, { method: "PATCH", body: JSON.stringify(patch) });

export const deleteEndpoint = (id) => request(`/api/endpoints/${id}`, { method: "DELETE" });

// Case-insensitive field lookup with alias fallback, so a page degrades to "—"
// instead of blanking when the API's field naming drifts. Exported from here so
// every page reads response shapes one way. Both sides are lowercased: matching
// only the key made camelCase lookups like "createdAt" silently miss.
export const field = (row, ...names) => {
  if (!row || typeof row !== "object") return undefined;
  const wanted = names.map((n) => n.toLowerCase());
  for (const n of wanted) {
    const hit = Object.entries(row).find(([k]) => k.toLowerCase() === n);
    if (hit && hit[1] != null) return hit[1];
  }
  return undefined;
};

export const idOf = (row) => String(field(row, "_id", "id") ?? "");

export const getMe = () => get("/api/auth/me");

export const regenerateKey = () => post("/api/auth/regenerate-key");

export const changePassword = (currentPassword, newPassword, passwordConfirmation) =>
  request("/api/auth/password", {
    method: "PATCH",
    body: JSON.stringify({ currentPassword, newPassword, passwordConfirmation }),
  });

export const deleteAccount = () => request("/api/account", { method: "DELETE" });

// hk_live_98a7c2b54e114f089d3a771923f9a -> hk_live_••••••••3f9a
export const maskKey = (key) => {
  if (!key) return "—";
  if (key.length <= 12) return "•".repeat(key.length);
  return `${key.slice(0, 8)}${"•".repeat(8)}${key.slice(-4)}`;
};

export const fmtTime = (value) => {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return `${d.toISOString().slice(0, 19).replace("T", " ")} UTC`;
};

const csvCell = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;

export const toCsv = (header, rows) =>
  [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n");

// "Export Logs" is a client-side download of the rows already on screen — no
// backend call, because the events are already in memory. ponytail: capped at
// whatever the page holds (10 on Dashboard, up to 50 filtered on Events). Swap
// for a server-side streaming export once the log outgrows that window.
export const downloadCsv = (filename, header, rows) => {
  const url = URL.createObjectURL(
    new Blob([toCsv(header, rows)], { type: "text/csv;charset=utf-8" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};