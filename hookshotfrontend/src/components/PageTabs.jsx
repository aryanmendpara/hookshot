import { Link } from "react-router-dom";

const TABS = [
  { to: "/", label: "Dashboard" },
  { to: "/endpoints", label: "Endpoints" },
  { to: "/events", label: "Events" },
];

export default function PageTabs({ active }) {
  return (
    <div className="inline-flex p-1 rounded bg-surface-dim border border-outline-variant items-center gap-1 select-none self-start">
      {TABS.map((t) => (
        <Link
          key={t.to}
          to={t.to}
          aria-current={t.to === active ? "page" : undefined}
          className={
            "px-3 py-1 font-sans text-body-md rounded-sm transition-colors " +
            (t.to === active
              ? "bg-primary-container text-canvas-black font-medium cursor-default"
              : "text-on-surface-variant hover:text-on-surface")
          }
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}
