// Loading stand-in for a table body: pulsing bars roughly the width of the
// real columns, so a fetch never renders a card shell of headers + blank body.
// Widths cycle because each table has a different column count.
const WIDTHS = ["w-32", "w-16", "w-24", "w-40", "w-20"];

export default function SkeletonRows({ cols, rows = 5 }) {
  return Array.from({ length: rows }, (_, r) => (
    <tr key={r} aria-hidden="true">
      {Array.from({ length: cols }, (_, c) => (
        <td key={c} className="py-2.5 px-4">
          <span
            className={`block h-3 animate-pulse rounded bg-surface-container ${WIDTHS[c % WIDTHS.length]}`}
          />
        </td>
      ))}
    </tr>
  ));
}