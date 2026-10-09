import { field } from "./api";

// Delivery status -> chip class, implementing the design doc's Status Chips
// spec: 1px border + 10% tinted fill + solid status text. Colours only — the
// chip geometry (inline-flex span, not a td) lives at the call site, because
// setting display:flex on a table cell breaks the table layout.
// ponytail: exact-match map. If the API starts returning other states, add them
// here rather than picking a colour per page.
const STATUS_CLASS = {
  delivered: "text-status-success border-status-success/40 bg-status-success/10",
  duplicate: "text-status-warning border-status-warning/40 bg-status-warning/10",
  failed: "text-status-failure border-status-failure/40 bg-status-failure/10",
};

export const statusOf = (row) => String(field(row, "status", "state") ?? "Unknown");

export const statusClass = (row) =>
  STATUS_CLASS[statusOf(row).toLowerCase()] ??
  "text-on-surface-variant border-outline-variant bg-surface-container";
