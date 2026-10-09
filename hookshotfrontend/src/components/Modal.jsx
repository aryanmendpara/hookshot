import { useEffect, useRef } from "react";

// One modal shell for the whole app: overlay, bordered card, header with close
// X, body, footer. The Regenerate/Delete modals on Settings use the same shape,
// so Add/Edit/Delete Endpoint reuse this rather than three near-copies.
// No backdrop-click dismissal: these gate destructive actions, so a stray click
// outside the card must not throw away a half-typed confirmation. Cancel/X only.
export default function Modal({ title, onClose, children, footer, wide }) {
  const card = useRef(null);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    card.current?.querySelector("input, button, select")?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-canvas-black/75 p-4">
      <div
        ref={card}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        // max-h + overflow on the body, not the card: the header and footer stay pinned
// while long content scrolls. Without it the Regenerate modal clips on a short
// viewport and its Confirm button becomes unreachable.
        className={`w-full ${wide ? "max-w-2xl" : "max-w-lg"} max-h-[90vh] border border-secondary-container bg-surface-deep rounded-sm shadow-2xl flex flex-col`}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-secondary-container bg-surface-container-lowest">
          <h2 className="font-headline-sm text-headline-sm text-on-surface font-semibold">{title}</h2>
          <button
            type="button"
            aria-label="Close modal"
            onClick={onClose}
            className="text-text-muted hover:text-on-surface transition-colors"
          >
            <span className="material-symbols-outlined text-[20px] leading-none block">close</span>
          </button>
        </div>
        <div className="p-5 flex flex-col gap-5 bg-surface-deep overflow-y-auto">{children}</div>
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-secondary-container bg-surface-container-lowest">
          {footer}
        </div>
      </div>
    </div>
  );
}
