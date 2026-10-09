import { useEffect, useRef, useState } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { ApiError, field, getMe, logout } from "../lib/api";

const NAV = [
  { to: "/", label: "Dashboard", icon: "dashboard", end: true },
  { to: "/endpoints", label: "Endpoints", icon: "webhook", end: false },
  { to: "/events", label: "Events", icon: "data_object", end: false },
  { to: "/settings", label: "Settings", icon: "settings", end: false },
];

export default function AppShell() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [email, setEmail] = useState(null);
  // Theme: an explicit choice wins and persists; an empty string follows the
  // OS via the CSS media query. systemDark only decides which icon to show
  // before the first click.
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem("hs-theme") ?? "";
    } catch {
      return "";
    }
  });
  const [systemDark] = useState(
    () => window.matchMedia("(prefers-color-scheme: dark)").matches,
  );
  const resolved = theme === "" ? (systemDark ? "dark" : "light") : theme;

  useEffect(() => {
    const root = document.documentElement;
    if (theme) root.setAttribute("data-theme", theme);
    else root.removeAttribute("data-theme");
    try {
      if (theme) localStorage.setItem("hs-theme", theme);
      else localStorage.removeItem("hs-theme");
    } catch {
      /* persistence is best-effort */
    }
  }, [theme]);
  // pathname is only needed as the redirect target if the session turns out to be
  // dead. A ref keeps it out of the effect's deps, so /me is fetched once per
  // mount instead of on every navigation — otherwise the skeleton would re-flash
  // on every link click and each page load would pay a redundant round-trip.
  const where = useRef(pathname);

  // The exports hardcoded an address here. GET /api/auth/me is the real source.
  // This is the shell's session gate: every page it wraps needs an auth cookie
  // anyway, so a 401 here means the session is gone and the only honest move is
  // to send the user back to /login. On success we don't redirect — an
  // already-authenticated user landing on /login is their call to make.
  useEffect(() => {
    let live = true;
    getMe()
      .then((me) => {
        if (live) setEmail(String(field(me, "email") ?? "") || "—");
      })
      .catch((err) => {
        if (!live) return;
        // Network failure (status 0) or unauthenticated (401) both mean there's
        // no usable session. Any other error still leaves the page's own data
        // fetches to report, so only bounce when we're actually signed out.
        if (err instanceof ApiError && (err.status === 0 || err.status === 401)) {
          navigate("/login", { replace: true, state: { from: where.current } });
        }
      });
    return () => {
      live = false;
    };
  }, [navigate]);

  return (
    <div className="min-h-screen bg-background font-body-md text-body-md text-on-surface antialiased">
      {/* Keyboard users otherwise tab through all 4 nav links plus Logout before
          reaching the page content. sr-only + focus-visible keeps it invisible
          until it's actually focused. */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:top-2 focus:left-2 focus:px-3 focus:py-2 focus:bg-primary-container focus:text-canvas-black focus:font-label-md focus:text-label-md focus:rounded"
      >
        Skip to content
      </a>
      <aside className="fixed left-0 top-0 h-full w-60 bg-surface-container-low border-r border-outline-variant z-40 flex flex-col justify-between select-none">
        <div className="flex flex-col">
          <div className="h-16 flex items-center px-space-lg border-b border-outline-variant gap-space-sm">
            <div className="w-5 h-5 rounded bg-primary-container flex items-center justify-center">
              <span className="font-code-sm text-code-sm text-on-primary font-bold tracking-tighter">
                //
              </span>
            </div>
            <span className="font-headline-sm text-headline-sm text-on-surface tracking-tight font-semibold">
              Hookshot
            </span>
          </div>
          <nav className="flex flex-col py-space-sm px-space-xs gap-1">
            {NAV.map((item) => {
              const active = item.end
                ? pathname === item.to
                : pathname.startsWith(item.to);
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  aria-current={active ? "page" : undefined}
                  className={
                    "flex items-center gap-space-sm px-space-md py-space-sm rounded-lg font-body-md text-body-md transition-colors " +
                    (active
                      ? "bg-surface-container border border-outline/40 text-on-surface font-medium shadow-sm"
                      : "text-on-surface-variant hover:bg-surface-container hover:text-on-surface")
                  }
                >
                  <span
                    className={`material-symbols-outlined text-[18px] ${
                      active ? "text-primary-container" : ""
                    }`}
                  >
                    {item.icon}
                  </span>
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>
        <div className="p-space-sm border-t border-outline-variant">
          {/* A Link alone can't log you out: the token lives in an httpOnly cookie,
              so the browser will happily keep replaying it on /login. POST first,
              then navigate — and navigate even if the call fails, because a stuck
              user on a dead button is worse than a cookie that outlives the click. */}
          <button
            type="button"
            onClick={async () => {
              try {
                await logout();
              } catch {
                /* best effort — see above */
              }
              setEmail(null);
              navigate("/login", { replace: true });
            }}
            className="w-full flex items-center gap-space-sm px-space-md py-space-sm rounded-lg font-body-md text-body-md text-on-surface-variant hover:bg-error-container hover:text-error transition-colors"
          >
            <span className="material-symbols-outlined text-[18px]">logout</span>
            <span>Logout</span>
          </button>
        </div>
      </aside>

      <div className="pl-60">
        <header className="fixed top-0 left-60 right-0 h-16 bg-surface-container-low/95 backdrop-blur-sm border-b border-outline-variant z-30 flex items-center justify-between px-space-lg">
          <div className="flex items-center gap-space-md min-w-0">
            {/* The current route, dim mono — doubles as a breadcrumb for deep
                links and shows the raw path on the 404 page, where it's the
                only evidence of what the user actually typed. */}
            <span className="font-code-sm text-code-sm text-text-muted truncate">
              {pathname}
            </span>
          </div>
          <div className="flex items-center gap-space-md">
            <button
              type="button"
              onClick={() => setTheme(resolved === "dark" ? "light" : "dark")}
              aria-label={
                resolved === "dark" ? "Switch to light theme" : "Switch to dark theme"
              }
              className="w-8 h-8 flex items-center justify-center rounded text-text-muted hover:text-on-surface hover:bg-surface-container transition-colors"
            >
              <span className="material-symbols-outlined text-[18px]">
                {resolved === "dark" ? "light_mode" : "dark_mode"}
              </span>
            </button>
            <div className="h-4 w-px bg-outline-variant" />
            <div className="flex items-center gap-space-sm">
              {/* In flight: a pulsing bar about the width of an address, so the
                  header doesn't reflow when it lands. Never the export's
                  hardcoded placeholder, never a literal "—" while loading. */}
              {email === null ? (
                <span className="block h-3 w-36 rounded bg-surface-container animate-pulse" />
              ) : (
                <span className="font-code-sm text-code-sm text-text-muted">{email}</span>
              )}
              <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center shadow-sm">
                <span className="material-symbols-outlined text-on-primary text-[18px]">person</span>
              </div>
            </div>
          </div>
        </header>

        {/* min-h-screen, not calc(100vh - 4rem): preflight is border-box, so a
            minus-the-header value makes <main> 4rem short and exposes the canvas
            as a black band under the footer. pt-16 is padding *inside* it. */}
        {/* tabIndex -1: a fragment target scrolls the viewport but does NOT move
          keyboard focus, so the next Tab still lands in the nav. This makes
          <main> programmatically focusable so "skip to content" actually skips. */}
      <main
        id="main-content"
        tabIndex={-1}
        className="relative pt-16 bg-background min-h-screen focus:outline-none"
      >
          <Outlet />
        </main>
      </div>
    </div>
  );
}