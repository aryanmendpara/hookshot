import { useEffect, useState } from "react";
import Modal from "../components/Modal";
import PageTabs from "../components/PageTabs";
import SkeletonRows from "../components/SkeletonRows";
import {
  createEndpoint,
  deleteEndpoint,
  field,
  fmtTime,
  getEndpoints,
  idOf,
  updateEndpoint,
} from "../lib/api";

const urlOf = (row) => String(field(row, "url") ?? "");
const isActive = (row) => field(row, "active") !== false;

// The export's peer/checked switch, verbatim. Controlled: `onChange` fires the
// PATCH, the row only flips once the API confirms.
function Toggle({ checked, onChange, disabled }) {
  return (
    <label className="inline-flex items-center gap-2 cursor-pointer select-none">
      <input
        type="checkbox"
        className="sr-only peer"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      {/* The input is sr-only, so it cannot show its own focus ring; the track
          div is its visual stand-in and must render the ring instead. Without
          peer-focus:ring-* the toggle is invisible to keyboard navigation. */}
      <div className="w-7 h-4 bg-surface-variant peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-on-surface peer-focus:ring-offset-2 peer-focus:ring-offset-surface rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-canvas-black after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-primary-container after:border-canvas-black after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-secondary-container relative" />
      <span
        className={`font-code-sm text-code-sm font-medium ${
          checked ? "text-status-success" : "text-text-muted"
        }`}
      >
        {checked ? "Active" : "Inactive"}
      </span>
    </label>
  );
}

// One table row. Exported so the markup can be rendered and checked without a
// DOM — the page's fetch effect never runs under renderToStaticMarkup.
export function EndpointRow({ row, busy, onToggle, onEdit, onDelete }) {
  return (
    <tr className="hover:bg-outline/40 transition-colors">
      <td className="py-2.5 px-4 text-on-surface font-code-md">
        <div className="truncate max-w-md select-all" title={urlOf(row)}>
          {urlOf(row) || "—"}
        </div>
      </td>
      <td className="py-2.5 px-4">
        <Toggle checked={isActive(row)} disabled={busy} onChange={onToggle} />
      </td>
      <td className="py-2.5 px-4 text-text-muted tabular-nums whitespace-nowrap font-code-sm">
        {fmtTime(field(row, "createdAt", "created", "timestamp"))}
      </td>
      <td className="py-2.5 px-4 text-right whitespace-nowrap">
        <div className="inline-flex items-center gap-1">
          <button
            type="button"
            aria-label="Edit endpoint"
            onClick={onEdit}
            className="p-1 text-text-muted hover:text-on-surface transition-colors rounded"
          >
            <span className="material-symbols-outlined text-[16px] leading-none block">edit</span>
          </button>
          <button
            type="button"
            aria-label="Delete endpoint"
            onClick={onDelete}
            className="p-1 text-text-muted hover:text-status-failure transition-colors rounded"
          >
            <span className="material-symbols-outlined text-[16px] leading-none block">delete</span>
          </button>
        </div>
      </td>
    </tr>
  );
}

export default function EndpointsPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // form: null = closed, {id?, url, active} = Add or Edit
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);
  const [pendingId, setPendingId] = useState(null);

  // confirm: id of the row awaiting delete confirmation
  const [confirm, setConfirm] = useState(null);
  const [confirmError, setConfirmError] = useState(null);

  useEffect(() => {
    let live = true;
    getEndpoints()
      .then((eps) => live && setRows(eps))
      .catch((err) => live && setError(err.message))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, []);

  const openAdd = () => {
    setFormError(null);
    setForm({ url: "", active: true });
  };

  const openEdit = (row) => {
    setFormError(null);
    setForm({ id: idOf(row), url: urlOf(row), active: isActive(row) });
  };

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    try {
      if (form.id) {
        await updateEndpoint(form.id, { url: form.url, active: form.active });
        setRows((list) =>
          list.map((r) => (idOf(r) === form.id ? { ...r, url: form.url, active: form.active } : r)),
        );
      } else {
        const created = await createEndpoint(form.url, form.active);
        setRows((list) => [...list, created ?? { url: form.url, active: form.active }]);
      }
      setForm(null);
    } catch (err) {
      // 400 belongs next to the input; anything else is a page-level problem.
      if (err.status === 400 || err.status === 422) setFormError(err.message);
      else if (err.status === 404) setError("That endpoint no longer exists.");
      else setFormError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (row, next) => {
    const id = idOf(row);
    setPendingId(id);
    setError(null);
    try {
      await updateEndpoint(id, { active: next });
      setRows((list) => list.map((r) => (idOf(r) === id ? { ...r, active: next } : r)));
    } catch (err) {
      setError(err.status === 404 ? "That endpoint no longer exists." : err.message);
    } finally {
      setPendingId(null);
    }
  };

  const remove = async () => {
    setSaving(true);
    setConfirmError(null);
    try {
      await deleteEndpoint(confirm);
      setRows((list) => list.filter((r) => idOf(r) !== confirm));
      setConfirm(null);
    } catch (err) {
      setConfirmError(err.status === 404 ? "That endpoint no longer exists." : err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col w-full">
      <div className="flex flex-col gap-6 p-6">
        {/* Header row — same shape as Dashboard */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-outline-variant">
          <div className="flex flex-col gap-1">
            <span className="font-code-sm text-code-sm uppercase tracking-widest text-text-muted">
              // DELIVERY TARGETS
            </span>
            <h1 className="font-headline-lg text-headline-lg text-on-surface tracking-tight font-semibold">
              Endpoints
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-3 self-start">
            <PageTabs active="/endpoints" />
            <button
              type="button"
              onClick={openAdd}
              className="inline-flex items-center justify-center font-sans text-body-sm font-medium bg-primary-container text-canvas-black hover:bg-primary-fixed-dim px-3.5 py-2 rounded-sm transition-colors cursor-pointer"
            >
              + Add Endpoint
            </button>
          </div>
        </div>

        {error && (
          <p role="alert" className="font-code-md text-code-md text-error">
            {error}
          </p>
        )}

        {/* Configured Endpoints */}
        <div className="flex flex-col bg-surface border border-outline-variant rounded overflow-hidden">
          <div className="flex flex-row items-center justify-between px-4 py-3 border-b border-outline-variant bg-surface-container-lowest">
            <div className="flex items-baseline gap-3">
              <h2 className="font-headline-sm text-headline-sm text-on-surface font-medium">
                Configured Endpoints
              </h2>
              <span className="font-code-sm text-code-sm text-text-muted">
                Showing {loading ? "—" : rows.length} endpoints
              </span>
            </div>
          </div>

          {!loading && rows.length === 0 ? (
            <div className="flex flex-col items-center gap-3 px-4 py-12">
              <span
                className="material-symbols-outlined text-[28px] text-outline"
                aria-hidden="true"
              >
                webhook
              </span>
              <p className="font-body-md text-body-md text-on-surface-variant">
                No endpoints configured yet.
              </p>
              <button
                type="button"
                onClick={openAdd}
                className="inline-flex items-center justify-center font-sans text-body-sm font-medium bg-primary-container text-canvas-black hover:bg-primary-fixed-dim px-3.5 py-2 rounded-sm transition-colors cursor-pointer"
              >
                + Add Endpoint
              </button>
            </div>
          ) : (
            <div className="w-full overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-outline-variant bg-surface-container-low font-code-sm text-label-sm text-text-muted uppercase tracking-wider select-none">
                    <th className="py-2.5 px-4 font-medium tracking-wider" scope="col">
                      URL
                    </th>
                    <th className="py-2.5 px-4 font-medium tracking-wider w-36" scope="col">
                      Status
                    </th>
                    <th className="py-2.5 px-4 font-medium tracking-wider w-48" scope="col">
                      Created
                    </th>
                    <th
                      className="py-2.5 px-4 font-medium tracking-wider text-right w-24"
                      scope="col"
                    >
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/60 font-code-md text-code-md">
                  {loading ? (
                    <SkeletonRows cols={4} rows={6} />
                  ) : (
                    rows.map((row) => {
                      const id = idOf(row);
                      return (
                        <EndpointRow
                          key={id || urlOf(row)}
                          row={row}
                          busy={pendingId === id}
                          onToggle={(next) => toggle(row, next)}
                          onEdit={() => openEdit(row)}
                          onDelete={() => {
                            setConfirmError(null);
                            setConfirm(id);
                          }}
                        />
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

      {/* Add / Edit */}
      {form && (
        <Modal
          title={form.id ? "Edit Endpoint" : "Add Endpoint"}
          onClose={() => setForm(null)}
          footer={
            <>
              <button
                type="button"
                onClick={() => setForm(null)}
                className="border border-secondary-container font-body-md text-body-md text-on-surface px-4 py-1.5 rounded-sm hover:bg-outline/40 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                form="endpoint-form"
                disabled={saving}
                className="font-body-md text-body-md font-semibold bg-primary-container text-canvas-black px-4 py-1.5 rounded-sm hover:bg-primary transition-colors disabled:opacity-50"
              >
                {saving ? "Saving..." : form.id ? "Save Changes" : "Create Endpoint"}
              </button>
            </>
          }
        >
          <form id="endpoint-form" onSubmit={submit} noValidate className="flex flex-col gap-1.5">
            <label
              className="font-label-sm text-label-sm uppercase tracking-wider text-text-muted"
              htmlFor="endpointUrl"
            >
              Target URL
            </label>
            <input
              id="endpointUrl"
              type="url"
              value={form.url}
              onChange={(e) => setForm({ ...form, url: e.target.value })}
              placeholder="https://api.yourdomain.com/v1/webhook"
              aria-invalid={formError ? true : undefined}
              aria-describedby={formError ? "endpointUrl-error" : undefined}
              className="w-full h-8 px-3 bg-surface border border-secondary-container text-text-silver font-code-md text-code-md rounded-sm focus:border-primary-container focus:outline-none placeholder:text-text-muted/60"
            />
            {formError && (
              <p
                id="endpointUrl-error"
                role="alert"
                className="font-code-sm text-code-sm text-status-failure"
              >
                {formError}
              </p>
            )}
          </form>

          <div className="flex items-center justify-between">
            <div className="flex flex-col">
              <span className="font-body-md text-body-md text-on-surface font-medium">Active</span>
              <span className="font-code-sm text-code-sm text-text-muted">
                Start accepting payloads immediately upon creation
              </span>
            </div>
            <Toggle
              checked={form.active}
              onChange={(next) => setForm({ ...form, active: next })}
            />
          </div>
        </Modal>
      )}

      {/* Delete confirm */}
      {confirm && (
        <Modal
          title="Delete Endpoint"
          onClose={() => setConfirm(null)}
          footer={
            <>
              <button
                type="button"
                onClick={() => setConfirm(null)}
                className="border border-secondary-container font-body-md text-body-md text-on-surface px-4 py-1.5 rounded-sm hover:bg-outline/40 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={remove}
                disabled={saving}
                className="font-body-md text-body-md font-semibold bg-status-failure text-canvas-black px-4 py-1.5 rounded-sm transition-colors disabled:opacity-50"
              >
                {saving ? "Deleting..." : "Delete"}
              </button>
            </>
          }
        >
          <p className="font-body-md text-body-md text-on-surface-variant">
            Delete this endpoint? Events will no longer be delivered to it. This can't be undone.
          </p>
          {confirmError && (
            <p role="alert" className="font-code-sm text-code-sm text-status-failure">
              {confirmError}
            </p>
          )}
        </Modal>
      )}
    </div>
  );
}
