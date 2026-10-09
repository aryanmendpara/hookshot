import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Modal from "../components/Modal";
import {
  changePassword,
  deleteAccount,
  field,
  fmtTime,
  getMe,
  maskKey,
  regenerateKey,
} from "../lib/api";

const CONFIRM_WORD = "DELETE";
const MIN_PASSWORD = 12;
const COPY_FEEDBACK_MS = 1800;

const BTN = "h-8 px-3 inline-flex items-center gap-1.5 border border-outline-variant hover:bg-outline/40 text-on-surface font-body-md text-body-md font-medium rounded transition-colors";
const INPUT =
  "w-full h-9 px-3 bg-surface-deep border border-outline-variant text-text-silver font-code-md text-code-md rounded focus:outline-none focus:border-primary-container";

export default function SettingsPage() {
  const navigate = useNavigate();

  const [me, setMe] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [loading, setLoading] = useState(true);

  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [regenOpen, setRegenOpen] = useState(false);
  const [regenBusy, setRegenBusy] = useState(false);
  const [regenError, setRegenError] = useState(null);

  const [pw, setPw] = useState({ current: "", next: "", confirm: "" });
  const [pwBusy, setPwBusy] = useState(false);
  const [pwError, setPwError] = useState(null);
  const [pwDone, setPwDone] = useState(false);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState(null);

  useEffect(() => {
    let live = true;
    getMe()
      .then((data) => live && setMe(data))
      .catch((err) => live && setLoadError(err.message))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, []);

  const apiKey = String(field(me, "apiKey", "key") ?? "");
  const email = String(field(me, "email") ?? "");
  const keyCreated = fmtTime(field(me, "apiKeyCreatedAt", "createdAt"));

  const copy = async () => {
    // The API key is only ever held in memory — never localStorage, never a URL.
    try {
      await navigator.clipboard.writeText(apiKey);
      setCopied(true);
      setTimeout(() => setCopied(false), COPY_FEEDBACK_MS);
    } catch {
      setCopied(false);
    }
  };

  const doRegenerate = async () => {
    setRegenBusy(true);
    setRegenError(null);
    try {
      const data = await regenerateKey();
      // The server owns the key. Never mint one here.
      setMe((prev) => ({ ...prev, ...data, apiKeyCreatedAt: new Date().toISOString() }));
      setRevealed(false);
      setRegenOpen(false);
    } catch (err) {
      setRegenError(err.message);
    } finally {
      setRegenBusy(false);
    }
  };

  const savePassword = async (e) => {
    e.preventDefault();
    setPwDone(false);
    setPwError(null);
    if (pw.next.length < MIN_PASSWORD) {
      setPwError(`New password must be at least ${MIN_PASSWORD} characters.`);
      return;
    }
    if (pw.next !== pw.confirm) {
      setPwError("New passwords do not match.");
      return;
    }
    setPwBusy(true);
    try {
      await changePassword(pw.current, pw.next, pw.confirm);
      setPw({ current: "", next: "", confirm: "" });
      setPwDone(true);
    } catch (err) {
      setPwError(err.message);
    } finally {
      setPwBusy(false);
    }
  };

  const doDelete = async () => {
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      await deleteAccount();
      navigate("/login", { replace: true });
    } catch (err) {
      setDeleteError(err.message);
    } finally {
      setDeleteBusy(false);
    }
  };

  return (
    <div className="flex flex-col w-full">
      <div className="p-6 max-w-5xl flex flex-col gap-6">
        {/* Breadcrumb / Context Marker */}
        <div className="flex items-center justify-between pb-3 border-b border-outline-variant">
          <div className="flex items-center gap-2">
            <span className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">
              Configuration
            </span>
            <span className="font-label-md text-label-md text-outline-variant">/</span>
            <span className="font-headline-md text-headline-md text-on-surface font-semibold">
              Settings
            </span>
          </div>
        </div>

        {loadError && (
          <p role="alert" className="font-code-md text-code-md text-error">
            {loadError}
          </p>
        )}

        {/* Section 1: API Key */}
        <div className="bg-surface border border-outline-variant rounded p-6 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-headline-md text-headline-md text-on-surface font-semibold">
                API Key
              </h2>
              <p className="font-body-md text-body-md text-on-surface-variant mt-1">
                Use this key to authenticate webhook delivery and manage subscriptions
                via API.
              </p>
            </div>
            <span className="font-code-md text-code-md text-secondary bg-surface-container border border-outline-variant px-2 py-0.5 rounded">
              Scope: Full Access
            </span>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-1">
            <div className="relative flex-1">
              <input
                id="apiKeyInput"
                readOnly
                type={revealed ? "text" : "password"}
                value={loading ? "" : revealed ? apiKey : maskKey(apiKey)}
                aria-label="API key"
                className={`${INPUT} tracking-wider`}
              />
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setRevealed((v) => !v)}
                disabled={!apiKey}
                className={BTN}
              >
                <span className="material-symbols-outlined text-[16px]">
                  {revealed ? "visibility_off" : "visibility"}
                </span>
                <span>{revealed ? "Hide" : "Reveal"}</span>
              </button>
              <button type="button" onClick={copy} disabled={!apiKey} className={BTN}>
                <span className="material-symbols-outlined text-[16px]">
                  {copied ? "check" : "content_copy"}
                </span>
                <span>{copied ? "Copied" : "Copy"}</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setRegenError(null);
                  setRegenOpen(true);
                }}
                disabled={!apiKey}
                className={BTN}
              >
                <span className="material-symbols-outlined text-[16px]">autorenew</span>
                <span>Regenerate Key</span>
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2 pt-1">
            <span className="material-symbols-outlined text-[14px] text-on-surface-variant">
              info
            </span>
            <span className="font-code-md text-code-md text-on-surface-variant">
              Created on {keyCreated}. Pass as header:{" "}
              <code className="text-secondary bg-surface-container px-1 py-0.5 rounded">
                X-Hookshot-Key
              </code>
            </span>
          </div>
        </div>

        {/* Section 2: Account */}
        <div className="bg-surface border border-outline-variant rounded p-6 flex flex-col gap-6">
          <div>
            <h2 className="font-headline-md text-headline-md text-on-surface font-semibold">
              Account
            </h2>
            <p className="font-body-md text-body-md text-on-surface-variant mt-1">
              Manage operator credentials and authentication profile.
            </p>
          </div>

          <div className="flex flex-col gap-1.5 max-w-lg">
            <label
              className="font-code-md text-code-md text-on-surface-variant flex items-center justify-between"
              htmlFor="accountEmail"
            >
              <span>EMAIL ADDRESS</span>
              <span className="font-code-md text-code-md text-on-surface-variant border border-outline-variant px-1.5 py-0.5 rounded">
                (Read-only)
              </span>
            </label>
            <input
              id="accountEmail"
              readOnly
              value={loading ? "" : email || "—"}
              className="w-full h-9 px-3 bg-surface-deep/70 border border-outline-variant text-on-surface-variant font-code-md text-code-md rounded cursor-not-allowed select-all"
            />
          </div>

          <div className="h-px bg-outline-variant w-full" />

          <form onSubmit={savePassword} noValidate className="flex flex-col gap-4 max-w-lg">
            <div className="flex flex-col">
              <span className="font-headline-md text-headline-md text-on-surface font-semibold">
                Change Password
              </span>
              <span className="font-body-md text-body-md text-on-surface-variant mt-0.5">
                Ensure standard minimum length of {MIN_PASSWORD} characters.
              </span>
            </div>

            {[
              ["currentPassword", "CURRENT PASSWORD", pw.current, "current"],
              ["newPassword", "NEW PASSWORD", pw.next, "next"],
              ["confirmPassword", "CONFIRM NEW PASSWORD", pw.confirm, "confirm"],
            ].map(([id, label, value, key]) => (
              <div key={id} className="flex flex-col gap-1">
                <label
                  className="font-code-md text-code-md text-on-surface-variant"
                  htmlFor={id}
                >
                  {label}
                </label>
                <input
                  id={id}
                  type="password"
                  autoComplete={id === "currentPassword" ? "current-password" : "new-password"}
                  placeholder="••••••••••••"
                  value={value}
                  aria-invalid={pwError ? true : undefined}
                  onChange={(e) => {
                    setPwDone(false);
                    setPw({ ...pw, [key]: e.target.value });
                  }}
                  className={INPUT}
                />
              </div>
            ))}

            {pwError && (
              <p role="alert" className="font-code-md text-code-md text-error">
                {pwError}
              </p>
            )}

            <div className="pt-1 flex items-center gap-3">
              <button
                type="submit"
                disabled={pwBusy}
                className="bg-primary-container text-canvas-black font-semibold font-body-md text-body-md px-3.5 py-2 rounded hover:bg-primary-fixed-dim transition-colors disabled:opacity-50"
              >
                {pwBusy ? "Saving..." : "Save Password"}
              </button>
              {pwDone && (
                <span className="font-code-md text-code-md text-status-success">
                  Password updated.
                </span>
              )}
            </div>
          </form>
        </div>

        {/* Section 3: Danger Zone */}
        <div className="border border-error-container bg-surface rounded p-6 flex flex-col gap-4">
          <div className="flex items-center gap-2 text-error">
            <span className="material-symbols-outlined text-[18px]">warning</span>
            <h2 className="font-headline-md text-headline-md font-semibold tracking-tight">
              Danger Zone
            </h2>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-3 border-t border-error-container">
            <div className="flex flex-col">
              <span className="font-headline-md text-headline-md text-on-surface font-medium">
                Delete Account
              </span>
              <span className="font-body-md text-body-md text-on-surface-variant mt-0.5">
                Permanently remove all webhook endpoints, event history, and account
                data.
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                setTyped("");
                setDeleteError(null);
                setDeleteOpen(true);
              }}
              className="h-8 px-3 self-start sm:self-auto inline-flex items-center gap-1.5 border border-error/40 text-error hover:bg-error-container font-body-md text-body-md font-medium rounded transition-colors whitespace-nowrap"
            >
              <span className="material-symbols-outlined text-[16px]">delete_forever</span>
              <span>Delete Account</span>
            </button>
          </div>
        </div>
      </div>

      {/* Regenerate Key */}
      {regenOpen && (
        <Modal
          title="Regenerate API Key"
          onClose={() => setRegenOpen(false)}
          footer={
            <>
              <button
                type="button"
                onClick={() => setRegenOpen(false)}
                className="border border-secondary-container font-body-md text-body-md text-on-surface px-4 py-1.5 rounded-sm hover:bg-outline/40 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={doRegenerate}
                disabled={regenBusy}
                className="font-body-md text-body-md font-semibold bg-primary-container text-canvas-black px-4 py-1.5 rounded-sm hover:bg-primary transition-colors disabled:opacity-50"
              >
                {regenBusy ? "Regenerating..." : "Regenerate Key"}
              </button>
            </>
          }
        >
          <p className="font-body-md text-body-md text-on-surface-variant">
            Regenerating issues a new key and immediately revokes the current one. Any
            integration still using the old key will start failing with 401s.
          </p>
          {regenError && (
            <p role="alert" className="font-code-md text-code-md text-error">
              {regenError}
            </p>
          )}
        </Modal>
      )}

      {/* Delete Account */}
      {deleteOpen && (
        <Modal
          title="Delete Account"
          onClose={() => setDeleteOpen(false)}
          footer={
            <>
              <button
                type="button"
                onClick={() => setDeleteOpen(false)}
                className="border border-secondary-container font-body-md text-body-md text-on-surface px-4 py-1.5 rounded-sm hover:bg-outline/40 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={doDelete}
                disabled={deleteBusy || typed !== CONFIRM_WORD}
                className="font-body-md text-body-md font-semibold bg-status-failure text-canvas-black px-4 py-1.5 rounded-sm hover:opacity-90 transition-opacity disabled:opacity-40 cursor-not-allowed"
              >
                {deleteBusy ? "Deleting..." : "Delete Account"}
              </button>
            </>
          }
        >
          <p className="font-body-md text-body-md text-on-surface-variant">
            This permanently deletes your account, all webhook endpoints, and the full
            event history. It can't be undone.
          </p>
          <div className="flex flex-col gap-1.5">
            <label
              className="font-code-md text-code-md text-on-surface-variant"
              htmlFor="deleteConfirm"
            >
              Type {CONFIRM_WORD} to confirm
            </label>
            <input
              id="deleteConfirm"
              type="text"
              value={typed}
              autoComplete="off"
              aria-invalid={typed !== "" && typed !== CONFIRM_WORD ? true : undefined}
              onChange={(e) => {
                setDeleteError(null);
                setTyped(e.target.value);
              }}
              className={`${INPUT} ${typed !== "" && typed !== CONFIRM_WORD ? "border-error" : ""}`}
            />
          </div>
          {deleteError && (
            <p role="alert" className="font-code-md text-code-md text-error">
              {deleteError}
            </p>
          )}
        </Modal>
      )}
    </div>
  );
}
