import { useEffect, useState } from "react";
import PageTabs from "../components/PageTabs";
import SkeletonRows from "../components/SkeletonRows";
import { field, fmtTime, getEvents, idOf, downloadCsv } from "../lib/api";
import { statusClass, statusOf } from "../lib/status";

const typeOf = (row) => String(field(row, "type", "eventType", "name") ?? "");

const idemKeyOf = (row) =>
  String(field(row, "idempotencyKey", "idempotency_key", "key") ?? "");

// Length of the event's endpointIds array. Absent means "unknown", not zero, so
// it renders as an em dash rather than a misleading 0.
const notifiedOf = (row) => {
  const ids = field(row, "endpointIds");
  return Array.isArray(ids) ? String(ids.length) : "—";
};

// Newest first, then narrowed by the type search. Exported so the ordering and
// the filter are checkable without a DOM.
export const selectEvents = (events, query) => {
  const sorted = [...events].sort(
    (a, b) =>
      new Date(field(b, "createdAt", "timestamp") ?? 0) -
      new Date(field(a, "createdAt", "timestamp") ?? 0),
  );
  const needle = query.trim().toLowerCase();
  return needle
    ? sorted.filter((row) => typeOf(row).toLowerCase().includes(needle))
    : sorted;
};

export function EventRow({ row }) {
  const key = idemKeyOf(row);
  return (
    <tr className="hover:bg-outline/40 transition-colors">
      <td className="py-2.5 px-4 font-medium text-on-surface font-code-md">
        {typeOf(row) || "—"}
      </td>
      <td
        className="py-2.5 px-4 text-text-muted max-w-xs truncate font-code-sm"
        title={key || undefined}
      >
        {key || "—"}
      </td>
      <td className="py-2.5 px-4">
        <span
          className={`inline-flex items-center border px-1.5 py-0.5 rounded font-code-sm font-medium ${statusClass(row)}`}
        >
          {statusOf(row)}
        </span>
      </td>
      <td className="py-2.5 px-4 text-text-silver font-code-sm tabular-nums">
        {notifiedOf(row)}
      </td>
      <td className="py-2.5 px-4 text-text-muted tabular-nums text-right font-code-sm">
        {fmtTime(field(row, "createdAt", "timestamp"))}
      </td>
    </tr>
  );
}

export default function EventsPage() {
  const [events, setEvents] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let live = true;
    getEvents()
      .then((evs) => live && setEvents(evs))
      .catch((err) => live && setError(err.message))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, []);

  // One pass: sorting and filtering live in selectEvents. Sorting doesn't change
  // the count, so events.length is the unfiltered total.
  const rows = selectEvents(events, query);
  const needle = query.trim();

  const label = loading
    ? "Loading events..."
    : needle
      ? `${rows.length} of ${events.length} events`
      : `Showing ${rows.length} events`;

  // Exports exactly what the table shows, so an active type filter carries into
  // the file rather than silently dumping the unfiltered log.
  const exportLogs = () =>
    downloadCsv(
      needle ? `hookshot-events-${needle.replace(/\W+/g, "-")}.csv` : "hookshot-events.csv",
      ["Type", "Idempotency Key", "Status", "Endpoints Notified", "Timestamp"],
      rows.map((row) => [
        typeOf(row),
        idemKeyOf(row),
        statusOf(row),
        notifiedOf(row),
        field(row, "createdat", "timestamp"),
      ]),
    );

  return (
    <div className="flex flex-col w-full">
      <div className="flex flex-col gap-6 p-6">
        {/* Header row — same shape as Dashboard */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-outline-variant">
          <div className="flex flex-col gap-1">
            <span className="font-code-sm text-code-sm uppercase tracking-widest text-text-muted">
              // DELIVERY LOG
            </span>
            <h1 className="font-headline-lg text-headline-lg text-on-surface tracking-tight font-semibold">
              Events
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-3 self-start">
            <PageTabs active="/events" />
          </div>
        </div>

        {error && (
          <p role="alert" className="font-code-md text-code-md text-error">
            {error}
          </p>
        )}

        {/* Type filter — client-side, against the events already fetched */}
        <div className="w-full">
          <div className="relative w-72">
            <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-[16px] text-text-muted">
              search
            </span>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter by event type..."
              aria-label="Filter events by type"
              className="w-full bg-surface-container-low border border-outline-variant text-on-surface font-code-sm text-code-sm pl-8 pr-3 py-1.5 rounded focus:outline-none focus:border-primary-container transition-colors"
            />
          </div>
        </div>

        {/* Event Log */}
        <div className="flex flex-col bg-surface border border-outline-variant rounded overflow-hidden">
          <div className="flex flex-row items-center justify-between px-4 py-3 border-b border-outline-variant bg-surface-container-lowest">
            <div className="flex items-baseline gap-3">
              <h2 className="font-headline-sm text-headline-sm text-on-surface font-medium">
                Event Log
              </h2>
              <span className="font-code-sm text-code-sm text-text-muted">{label}</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={exportLogs}
                disabled={!rows.length}
                className="px-2.5 py-1 text-body-sm font-code-sm bg-transparent border border-outline-variant text-text-silver hover:text-on-surface hover:bg-outline/40 rounded transition-colors disabled:opacity-40"
              >
                Export Logs
              </button>
            </div>
          </div>

          {rows.length === 0 && !loading ? (
            <p className="px-4 py-10 text-center font-body-md text-body-md text-on-surface-variant">
              {needle ? `No events match “${query.trim()}”.` : "No events received yet."}
            </p>
          ) : (
            <div className="w-full overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-outline-variant bg-surface-container-low font-code-sm text-label-sm text-text-muted uppercase tracking-wider select-none">
                    <th className="py-2.5 px-4 font-medium tracking-wider" scope="col">
                      Type
                    </th>
                    <th className="py-2.5 px-4 font-medium tracking-wider" scope="col">
                      Idempotency Key
                    </th>
                    <th className="py-2.5 px-4 font-medium tracking-wider" scope="col">
                      Status
                    </th>
                    <th className="py-2.5 px-4 font-medium tracking-wider" scope="col">
                      Endpoints Notified
                    </th>
                    <th
                      className="py-2.5 px-4 font-medium tracking-wider text-right"
                      scope="col"
                    >
                      Timestamp
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/60 font-code-md text-code-md">
                  {loading ? (
                    <SkeletonRows cols={5} rows={8} />
                  ) : (
                    rows.map((row, i) => (
                      <EventRow key={idOf(row) || i} row={row} />
                    ))
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
