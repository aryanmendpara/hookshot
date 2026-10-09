import { useEffect, useState } from "react";
import { field, fmtTime, getEndpoints, getEvents, downloadCsv } from "../lib/api";
import { statusClass, statusOf } from "../lib/status";
import PageTabs from "../components/PageTabs";
import SkeletonRows from "../components/SkeletonRows";

const isThrottled = (row) => {
  if (row.throttled === true || row.rateLimited === true) return true;
  const status = field(row, "status", "state");
  return typeof status === "string" && /throttl|rate.?limit/i.test(status);
};

// icon: a Material Symbol naming the metric; tone: semantic value colour, only
// used when the number genuinely means something (e.g. throttled > 0).
const StatCard = ({ label, value, suffix, icon, tone, loading }) => (
  <div className="bg-surface border border-outline-variant rounded p-4 flex flex-col justify-between">
    <div className="flex items-start justify-between gap-2">
      <span className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider">
        {label}
      </span>
      <span className="material-symbols-outlined text-[18px] text-outline" aria-hidden="true">
        {icon}
      </span>
    </div>
    <div className="mt-2 flex items-baseline">
      {loading ? (
        <span className="block h-7 w-16 animate-pulse rounded bg-surface-container" />
      ) : (
        <span
          className={`font-headline-lg text-headline-lg font-semibold tabular-nums text-on-surface tracking-tight ${
            tone ?? ""
          }`}
        >
          {value}
        </span>
      )}
      {suffix && (
        <span className="ml-2 font-code-sm text-code-sm text-on-surface-variant">{suffix}</span>
      )}
    </div>
  </div>
);

export default function DashboardPage() {
  const [endpoints, setEndpoints] = useState([]);
  const [events, setEvents] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let live = true;
    Promise.all([getEndpoints(), getEvents()])
      .then(([eps, evs]) => {
        if (!live) return;
        setEndpoints(eps);
        setEvents(evs);
      })
      .catch((err) => live && setError(err.message))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, []);

  const newestFirst = [...events].sort(
    (a, b) => new Date(field(b, "createdat", "timestamp") ?? 0) - new Date(field(a, "createdat", "timestamp") ?? 0),
  );
  const recent = newestFirst.slice(0, 10);

  const activeCount = endpoints.filter((e) => e.active !== false).length;
  const throttled = newestFirst.filter(isThrottled).length;

  // The task's Event model stores endpointIds (ObjectIds), not URLs, so the
  // table resolves them against the endpoint list we already fetched.
  const urlById = new Map(
    endpoints.map((e) => [String(field(e, "_id", "id")), String(field(e, "url") ?? "")]),
  );
  const endpointUrl = (row) => {
    const direct = field(row, "endpointUrl", "url");
    if (direct) return String(direct);
    const ids = field(row, "endpointIds");
    if (!Array.isArray(ids)) return null;
    const urls = ids.map((id) => urlById.get(String(id))).filter(Boolean);
    return urls.length ? urls.join(", ") : null;
  };

  const exportLogs = () =>
    downloadCsv(
      "hookshot-events.csv",
      ["Type", "Status", "Timestamp", "Endpoint URL"],
      recent.map((row) => [
        field(row, "type", "eventType", "name"),
        statusOf(row),
        field(row, "createdat", "timestamp"),
        endpointUrl(row) ?? "",
      ]),
    );

  return (
    <div className="flex flex-col w-full">
      <div className="flex flex-col gap-6 p-6">
        {/* Header row */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-outline-variant">
          <div className="flex flex-col gap-1">
            <span className="font-code-sm text-code-sm uppercase tracking-widest text-text-muted">
              // RECENT DELIVERY ACTIVITY
            </span>
            <h1 className="font-headline-lg text-headline-lg text-on-surface tracking-tight font-semibold">
              Overview
            </h1>
          </div>
          <PageTabs active="/" />
        </div>

        {error && (
          <p role="alert" className="font-code-md text-code-md text-error">
            {error}
          </p>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <StatCard
            loading={loading}
            icon="webhook"
            label="Active Endpoints"
            value={activeCount}
            suffix="/ 10 max"
          />
          <StatCard
            loading={loading}
            icon="data_object"
            label="Events (24h)"
            value={newestFirst.length}
            suffix="total"
          />
          <StatCard
            loading={loading}
            icon="speed"
            label="Rate Limit Hits (24h)"
            value={throttled}
            suffix="throttled"
            tone={throttled > 0 ? "text-status-warning" : undefined}
          />
        </div>

        {/* Recent Events */}
        <div className="flex flex-col bg-surface border border-outline-variant rounded overflow-hidden">
          <div className="flex flex-row items-center justify-between px-4 py-3 border-b border-outline-variant bg-surface-container-lowest">
            <div className="flex items-baseline gap-3">
              <h2 className="font-headline-sm text-headline-sm text-on-surface font-medium">
                Recent Events
              </h2>
              <span className="font-code-sm text-code-sm text-text-muted">
                {loading ? "Loading..." : `Showing last ${recent.length} events`}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={exportLogs}
                disabled={!recent.length}
                className="px-2.5 py-1 text-body-sm font-code-sm bg-transparent border border-outline-variant text-text-silver hover:text-on-surface hover:bg-outline/40 rounded transition-colors disabled:opacity-40"
              >
                Export Logs
              </button>
            </div>
          </div>

          {recent.length === 0 && !loading ? (
            <p className="px-4 py-10 text-center font-body-md text-body-md text-on-surface-variant">
              No events received yet.
            </p>
          ) : (
            <div className="w-full overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-outline-variant bg-surface-container-low font-code-sm text-label-sm text-text-muted uppercase tracking-wider select-none">
                    <th className="py-2.5 px-4 font-medium tracking-wider" scope="col">Type</th>
                    <th className="py-2.5 px-4 font-medium tracking-wider" scope="col">Status</th>
                    <th className="py-2.5 px-4 font-medium tracking-wider" scope="col">Timestamp</th>
                    <th className="py-2.5 px-4 font-medium tracking-wider" scope="col">Endpoint URL</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/60 font-code-md text-code-md">
                  {loading ? (
                    <SkeletonRows cols={4} rows={6} />
                  ) : (
                    recent.map((row, i) => {
                      const status = statusOf(row);
                      return (
                        <tr
                          key={field(row, "_id", "id") ?? i}
                          className="hover:bg-outline/40 transition-colors"
                        >
                          <td className="py-2.5 px-4 font-medium text-on-surface font-code-md">
                            {String(field(row, "type") ?? "—")}
                          </td>
                          <td className="py-2.5 px-4">
                            <span
                              className={`inline-flex items-center border px-1.5 py-0.5 rounded font-code-sm font-medium ${statusClass(row)}`}
                            >
                              {status}
                            </span>
                          </td>
                          <td className="py-2.5 px-4 text-text-muted tabular-nums font-code-sm">
                            {fmtTime(field(row, "createdAt", "timestamp"))}
                          </td>
                          <td className="py-2.5 px-4 text-on-surface-variant truncate max-w-xs md:max-w-md font-code-sm">
                            {endpointUrl(row) ?? "—"}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* Footer: single page. The header count already says how many rows
              there are, so remaining with dead Prev/Next controls was filler. */}
        </div>
      </div>
    </div>
  );
}