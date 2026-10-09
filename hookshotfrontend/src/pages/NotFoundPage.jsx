import { Link } from "react-router-dom";

// The app declared no catch-all route, so any unknown URL matched nothing and
// <Outlet/> rendered an empty shell — a blank page with working navigation and
// no explanation. This is that dead end, filled in.
export default function NotFoundPage() {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-24 px-6 text-center">
      <span className="font-label-md text-label-md text-outline uppercase tracking-widest">
        Error 404
      </span>
      <h1 className="font-headline-lg text-headline-lg text-on-surface font-semibold tracking-tight">
        No route for this address
      </h1>
      <p className="font-body-md text-body-md text-on-surface-variant max-w-md leading-relaxed">
        The page you asked for isn't part of Hookshot. It may have been renamed, or the link
        may have a typo in it.
      </p>
      <Link
        to="/"
        className="mt-space-sm px-4 py-2 bg-primary-container hover:opacity-90 active:opacity-95 text-canvas-black font-headline-sm text-headline-sm font-semibold rounded transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-on-surface focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        Back to dashboard
      </Link>
    </div>
  );
}