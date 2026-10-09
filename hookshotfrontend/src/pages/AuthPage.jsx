import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ApiError, login, signup } from "../lib/api";
import "../lib/skyline.css";

// The eye button has to live inside the input's box, so the input gets right
// padding to keep its text clear of the button. `type="button"` is load-bearing:
// without it the click submits the form and logs you in.
function PasswordInput({ id, name, label, autoComplete, revealed, onToggle }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="font-label-md text-label-md uppercase text-outline" htmlFor={id}>
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          name={name}
          type={revealed ? "text" : "password"}
          autoComplete={autoComplete}
          required
          placeholder="••••••••••••"
          className="h-12 w-full bg-canvas-black border border-outline-variant rounded px-3 pr-11 font-code-md text-headline-sm text-on-surface placeholder:text-outline-variant focus:outline-none focus:border-primary-container"
        />
        <button
          type="button"
          onClick={onToggle}
          aria-label={revealed ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
          aria-pressed={revealed}
          title={revealed ? "Hide" : "Show"}
          className="absolute right-0 top-0 h-12 w-11 flex items-center justify-center text-outline hover:text-on-surface transition-colors focus:outline-none focus:text-on-surface"
        >
          <span className="material-symbols-outlined text-[20px]">
            {revealed ? "visibility_off" : "visibility"}
          </span>
        </button>
      </div>
    </div>
  );
}

export default function AuthPage() {
  const [mode, setMode] = useState("login");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);
  // One flag, not two: the confirmation mirrors the password, so revealing one
  // and not the other defeats the point of a confirm field.
  const [revealed, setRevealed] = useState(false);
  const navigate = useNavigate();
  const { state } = useLocation();

  function switchMode(next) {
    setMode(next);
    setError(null);
    setRevealed(false);
  }

  async function onSubmit(e) {
    e.preventDefault();
    if (pending) return;

    const form = new FormData(e.currentTarget);
    const email = form.get("email");
    const password = form.get("password");
    const passwordConfirmation = form.get("password_confirmation");

    setPending(true);
    setError(null);
    try {
      if (mode === "login") {
        await login(email, password);
      } else {
        await signup(email, password, passwordConfirmation);
      }
      // Return to wherever the session gate bounced us from, so a deep link like
      // /settings survives the round trip. Falls back to the dashboard. Only
      // same-app paths: `state.from` is written by our own router, but a crafted
      // history entry shouldn't be able to bounce anyone off-site.
      const from = typeof state?.from === "string" && state.from.startsWith("/") ? state.from : "/";
      navigate(from, { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Try again.");
      setPending(false);
    }
  }

  return (
    <div className="w-screen h-screen min-h-screen bg-canvas-black font-body-md text-body-md text-on-surface antialiased m-0 p-0 overflow-hidden">
      <div className="w-full h-full min-h-screen grid grid-cols-1 md:grid-cols-[380px_1fr] lg:grid-cols-[420px_1fr] bg-canvas-black m-0 p-0">
        <div className="auth-sky h-full border-b md:border-b-0 border-outline-variant flex flex-col justify-between items-stretch relative overflow-hidden">
          <div className="absolute top-8 left-8 z-10 flex items-center gap-2 select-none">
            {/* Same mark as the app shell's sidebar, so the panels carry the
                product's identity instead of an empty sky corner. */}
            <div className="w-5 h-5 rounded bg-primary-container flex items-center justify-center">
              <span className="font-code-sm text-code-sm text-on-primary font-bold tracking-tighter">
                //
              </span>
            </div>
            <span className="font-headline-sm text-headline-sm text-primary font-semibold tracking-tight">
              Hookshot
            </span>
          </div>

          {/* Night skyline: gradient sky, micro stars, two tower layers, lit windows, warning beacons. */}
          <svg
            className="w-full h-full block"
            viewBox="0 0 420 900"
            preserveAspectRatio="xMidYMax slice"
            xmlns="http://www.w3.org/2000/svg"
            shapeRendering="crispEdges"
          >
            {/* Sky comes from the .auth-sky CSS gradient on the panel, not
                from a rect here, so it lines up with the form column. */}

            {/* Scattered micro vector stars in upper night sky */}
            <g fill="#ccc9dc">
              <rect x="35" y="60" width="1.5" height="1.5" opacity="0.55" className="star-twinkle" style={{ animationDelay: "0s", animationDuration: "2.8s" }} />
              <rect x="110" y="95" width="1" height="1" opacity="0.35" className="star-twinkle" style={{ animationDelay: "0.8s", animationDuration: "3.2s" }} />
              <rect x="82" y="160" width="2" height="2" opacity="0.7" className="star-twinkle" style={{ animationDelay: "1.4s", animationDuration: "2.5s" }} />
              <rect x="175" y="70" width="1" height="1" opacity="0.4" className="star-twinkle" style={{ animationDelay: "2.1s", animationDuration: "3.6s" }} />
              <rect x="230" y="130" width="1.5" height="1.5" opacity="0.6" className="star-twinkle" style={{ animationDelay: "0.4s", animationDuration: "2.9s" }} />
              <rect x="310" y="55" width="2" height="2" opacity="0.75" className="star-twinkle" style={{ animationDelay: "1.8s", animationDuration: "3.1s" }} />
              <rect x="380" y="110" width="1" height="1" opacity="0.45" className="star-twinkle" style={{ animationDelay: "2.6s", animationDuration: "2.7s" }} />
              <rect x="345" y="180" width="1.5" height="1.5" opacity="0.5" className="star-twinkle" style={{ animationDelay: "0.9s", animationDuration: "3.4s" }} />
              <rect x="145" y="210" width="1" height="1" opacity="0.3" className="star-twinkle" style={{ animationDelay: "1.6s", animationDuration: "3s" }} />
              <rect x="275" y="240" width="1.5" height="1.5" opacity="0.65" className="star-twinkle" style={{ animationDelay: "0.2s", animationDuration: "2.6s" }} />
              <rect x="50" y="270" width="1" height="1" opacity="0.4" className="star-twinkle" style={{ animationDelay: "2.3s", animationDuration: "3.3s" }} />
              <rect x="390" y="260" width="2" height="2" opacity="0.7" className="star-twinkle" style={{ animationDelay: "1.1s", animationDuration: "2.4s" }} />
              <rect x="190" y="310" width="1.5" height="1.5" opacity="0.5" className="star-twinkle" style={{ animationDelay: "0.6s", animationDuration: "3.5s" }} />
              <rect x="20" y="370" width="1" height="1" opacity="0.35" className="star-twinkle" style={{ animationDelay: "1.9s", animationDuration: "2.9s" }} />
              <rect x="360" y="350" width="1" height="1" opacity="0.4" className="star-twinkle" style={{ animationDelay: "2.7s", animationDuration: "3.2s" }} />
              <rect x="120" y="410" width="1.5" height="1.5" opacity="0.6" className="star-twinkle" style={{ animationDelay: "0.5s", animationDuration: "2.8s" }} />
              <rect x="300" y="420" width="1" height="1" opacity="0.3" className="star-twinkle" style={{ animationDelay: "1.3s", animationDuration: "3.7s" }} />
            </g>

            {/* BACKGROUND TOWERS LAYER (#1b2a41) */}
            <g fill="#1b2a41" className="anim-bg-drift">
              {/* Far Left building */}
              <rect x="0" y="560" width="46" height="340" />
              <rect x="10" y="530" width="26" height="30" />
              <rect x="21" y="490" width="3" height="40" />

              {/* Mid-left tower */}
              <rect x="52" y="500" width="50" height="400" />
              <rect x="64" y="460" width="26" height="40" />
              <rect x="75" y="425" width="4" height="35" />

              {/* One World Trade Center silhouette (Chamfered geometry & iconic spire) */}
              <polygon points="120,530 148,340 162,340 190,530" />
              <rect x="120" y="530" width="70" height="370" />
              <rect x="150" y="325" width="10" height="15" />
              <rect x="153" y="270" width="4" height="55" />
              <rect x="154" y="225" width="2" height="45" />

              {/* Mid background block tower */}
              <rect x="198" y="480" width="42" height="420" />
              <rect x="206" y="440" width="26" height="40" />

              {/* Chrysler-style tiered spire tower */}
              <rect x="248" y="470" width="56" height="430" />
              <polygon points="254,470 276,370 298,470" />
              <rect x="274" y="310" width="4" height="60" />
              <rect x="275" y="260" width="2" height="50" />

              {/* Right background modern setback tower */}
              <rect x="314" y="520" width="48" height="380" />
              <rect x="324" y="475" width="28" height="45" />
              <rect x="336" y="435" width="4" height="40" />

              {/* Far right background tower */}
              <rect x="370" y="550" width="50" height="350" />
              <rect x="384" y="500" width="22" height="50" />
            </g>

            {/* FOREGROUND TOWERS LAYER (#324a5f) */}
            <g fill="#324a5f">
              {/* Far Left modern flat-top */}
              <rect x="0" y="640" width="38" height="260" />
              <rect x="5" y="615" width="28" height="25" />

              {/* Left foreground stepped tower */}
              <rect x="32" y="590" width="52" height="310" />
              <rect x="42" y="555" width="32" height="35" />
              <rect x="52" y="530" width="12" height="25" />

              {/* Empire State Building (Stepped tiers, mast, and needle) */}
              <rect x="92" y="610" width="74" height="290" />
              <rect x="101" y="515" width="56" height="95" />
              <rect x="111" y="435" width="36" height="80" />
              <rect x="119" y="375" width="20" height="60" />
              <rect x="124" y="335" width="10" height="40" />
              <rect x="127" y="295" width="4" height="40" />
              <rect x="128" y="240" width="2" height="55" />

              {/* Foreground commercial tower with angled roofline */}
              <rect x="174" y="570" width="62" height="330" />
              <polygon points="174,570 236,525 236,570" />

              {/* Mid-right stepped skyscraper */}
              <rect x="244" y="580" width="68" height="320" />
              <rect x="256" y="535" width="44" height="45" />
              <rect x="268" y="495" width="20" height="40" />
              <rect x="276" y="455" width="4" height="40" />

              {/* Modern right tower with setbacks */}
              <rect x="320" y="615" width="54" height="285" />
              <rect x="330" y="565" width="34" height="50" />
              <rect x="342" y="530" width="10" height="35" />

              {/* Far right foreground structure */}
              <rect x="380" y="630" width="40" height="270" />
              <rect x="392" y="590" width="20" height="40" />
            </g>

            {/* SPARSITY OF LIT OFFICE WINDOWS (#ccc9dc) */}
            <g fill="#ccc9dc">
              {/* Background Tower Windows */}
              <rect x="132" y="475" width="3" height="3" opacity="0.75" />
              <rect x="148" y="490" width="3" height="3" opacity="0.6" />
              <rect x="170" y="460" width="3" height="3" opacity="0.8" className="anim-flicker-a" />
              <rect x="142" y="520" width="3" height="3" opacity="0.55" />
              <rect x="165" y="540" width="3" height="3" opacity="0.7" />
              <rect x="212" y="495" width="3" height="3" opacity="0.65" />
              <rect x="224" y="520" width="3" height="3" opacity="0.8" />
              <rect x="262" y="490" width="3" height="3" opacity="0.7" />
              <rect x="282" y="480" width="3" height="3" opacity="0.55" />
              <rect x="330" y="535" width="3" height="3" opacity="0.75" />
              <rect x="342" y="505" width="3" height="3" opacity="0.6" />

              {/* Foreground Empire State Tower Windows */}
              <rect x="126" y="385" width="3" height="4" opacity="0.9" className="anim-flicker-b" />
              <rect x="118" y="450" width="3" height="3" opacity="0.85" />
              <rect x="136" y="460" width="3" height="3" opacity="0.7" />
              <rect x="122" y="485" width="3" height="3" opacity="0.9" />
              <rect x="130" y="485" width="3" height="3" opacity="0.6" />
              <rect x="108" y="530" width="4" height="3" opacity="0.8" />
              <rect x="140" y="540" width="3" height="3" opacity="0.85" />
              <rect x="124" y="565" width="4" height="3" opacity="0.75" />
              <rect x="146" y="580" width="3" height="3" opacity="0.65" />
              <rect x="112" y="630" width="3" height="3" opacity="0.85" />
              <rect x="134" y="645" width="4" height="3" opacity="0.7" />
              <rect x="150" y="660" width="3" height="3" opacity="0.8" />
              <rect x="104" y="685" width="3" height="3" opacity="0.6" />
              <rect x="126" y="710" width="4" height="3" opacity="0.85" className="anim-flicker-c" />
              <rect x="142" y="735" width="3" height="3" opacity="0.75" />

              {/* Foreground Left Towers Windows */}
              <rect x="12" y="660" width="3" height="3" opacity="0.8" />
              <rect x="22" y="690" width="3" height="3" opacity="0.6" />
              <rect x="48" y="605" width="3" height="3" opacity="0.85" />
              <rect x="64" y="625" width="3" height="3" opacity="0.7" />
              <rect x="42" y="655" width="3" height="3" opacity="0.75" />
              <rect x="68" y="680" width="4" height="3" opacity="0.8" />
              <rect x="54" y="720" width="3" height="3" opacity="0.65" />

              {/* Foreground Right Towers Windows */}
              <rect x="188" y="590" width="4" height="3" opacity="0.85" />
              <rect x="214" y="610" width="3" height="3" opacity="0.7" />
              <rect x="196" y="645" width="3" height="3" opacity="0.8" />
              <rect x="220" y="670" width="4" height="3" opacity="0.65" />
              <rect x="184" y="705" width="3" height="3" opacity="0.85" />
              <rect x="208" y="740" width="3" height="3" opacity="0.7" />
              <rect x="264" y="555" width="3" height="3" opacity="0.9" className="anim-flicker-a" />
              <rect x="280" y="570" width="3" height="3" opacity="0.75" />
              <rect x="258" y="610" width="4" height="3" opacity="0.8" />
              <rect x="290" y="630" width="3" height="3" opacity="0.6" />
              <rect x="272" y="665" width="3" height="3" opacity="0.85" />
              <rect x="284" y="705" width="4" height="3" opacity="0.75" />
              <rect x="338" y="635" width="3" height="3" opacity="0.75" />
              <rect x="356" y="650" width="3" height="3" opacity="0.85" />
              <rect x="332" y="690" width="3" height="3" opacity="0.6" />
              <rect x="350" y="725" width="4" height="3" opacity="0.8" />
              <rect x="394" y="650" width="3" height="3" opacity="0.7" />
              <rect x="406" y="685" width="3" height="3" opacity="0.85" />
            </g>

            {/* Warning beacons, each centred on the mast tip it belongs to */}
            <g id="aircraft-warning-beacons">
              <circle className="beacon-flash-1 anim-signal-pulse" cx="155" cy="225" r="2" fill="#ef4444" />
              <circle className="beacon-flash-2 anim-signal-pulse" cx="129" cy="240" r="2" fill="#ef4444" />
              <circle className="beacon-flash-1 anim-signal-pulse" cx="276" cy="260" r="1.75" fill="#ef4444" />
              <circle className="beacon-flash-2 anim-signal-pulse" cx="77" cy="425" r="1.5" fill="#ef4444" />
              <circle className="beacon-flash-1 anim-signal-pulse" cx="338" cy="435" r="1.5" fill="#ef4444" />
            </g>
          </svg>
        </div>

        {/* RIGHT PANEL */}
        <div className="auth-sky h-full flex items-center justify-center p-6 md:p-12 lg:p-16 relative overflow-hidden">
          {/* Same micro-star field as the skyline panel, so the sky reads
              continuous across the seam. */}
          <svg
            className="absolute inset-0 w-full h-full block pointer-events-none"
            viewBox="0 0 800 500"
            preserveAspectRatio="xMidYMin slice"
            xmlns="http://www.w3.org/2000/svg"
            shapeRendering="crispEdges"
            aria-hidden="true"
          >
            <g fill="#ccc9dc">
              <rect x="70" y="48" width="1.5" height="1.5" opacity="0.55" className="star-twinkle" style={{ animationDelay: "0s", animationDuration: "2.8s" }} />
              <rect x="205" y="88" width="1" height="1" opacity="0.35" className="star-twinkle" style={{ animationDelay: "0.8s", animationDuration: "3.2s" }} />
              <rect x="330" y="40" width="2" height="2" opacity="0.7" className="star-twinkle" style={{ animationDelay: "1.4s", animationDuration: "2.5s" }} />
              <rect x="452" y="96" width="1" height="1" opacity="0.4" className="star-twinkle" style={{ animationDelay: "2.1s", animationDuration: "3.6s" }} />
              <rect x="588" y="52" width="1.5" height="1.5" opacity="0.6" className="star-twinkle" style={{ animationDelay: "0.4s", animationDuration: "2.9s" }} />
              <rect x="702" y="84" width="2" height="2" opacity="0.75" className="star-twinkle" style={{ animationDelay: "1.8s", animationDuration: "3.1s" }} />
              <rect x="768" y="36" width="1" height="1" opacity="0.45" className="star-twinkle" style={{ animationDelay: "2.6s", animationDuration: "2.7s" }} />
              <rect x="128" y="140" width="1.5" height="1.5" opacity="0.5" className="star-twinkle" style={{ animationDelay: "0.9s", animationDuration: "3.4s" }} />
              <rect x="268" y="176" width="1" height="1" opacity="0.3" className="star-twinkle" style={{ animationDelay: "1.6s", animationDuration: "3s" }} />
              <rect x="416" y="132" width="1.5" height="1.5" opacity="0.65" className="star-twinkle" style={{ animationDelay: "0.2s", animationDuration: "2.6s" }} />
              <rect x="556" y="168" width="1" height="1" opacity="0.4" className="star-twinkle" style={{ animationDelay: "2.3s", animationDuration: "3.3s" }} />
              <rect x="742" y="126" width="2" height="2" opacity="0.7" className="star-twinkle" style={{ animationDelay: "1.1s", animationDuration: "2.4s" }} />
              <rect x="182" y="228" width="1.5" height="1.5" opacity="0.5" className="star-twinkle" style={{ animationDelay: "0.6s", animationDuration: "3.5s" }} />
              <rect x="352" y="262" width="1" height="1" opacity="0.35" className="star-twinkle" style={{ animationDelay: "1.9s", animationDuration: "2.9s" }} />
              <rect x="498" y="214" width="1" height="1" opacity="0.4" className="star-twinkle" style={{ animationDelay: "2.7s", animationDuration: "3.2s" }} />
              <rect x="648" y="248" width="1.5" height="1.5" opacity="0.6" className="star-twinkle" style={{ animationDelay: "0.5s", animationDuration: "2.8s" }} />
              <rect x="782" y="196" width="1" height="1" opacity="0.3" className="star-twinkle" style={{ animationDelay: "1.3s", animationDuration: "3.7s" }} />
            </g>
          </svg>

          <div className="relative w-full max-w-[540px] bg-surface border border-outline-variant rounded p-9 sm:p-12 flex flex-col shadow-xl">
            {/* Brand / Monogram Header */}
            <div className="flex items-center justify-between pb-space-lg border-b border-outline-variant mb-space-lg">
              <div className="flex flex-col gap-1 w-full text-center sm:text-left">
                <span className="font-label-md text-headline-md text-primary font-semibold tracking-wider uppercase">
                  Hookshot
                </span>
                <span className="font-code-md text-code-md text-outline-variant">
                  Webhook delivery for your billing events
                </span>
              </div>
            </div>

            {/* Segmented Mode Control */}
            <div className="grid grid-cols-2 p-1 bg-canvas-black border border-outline-variant rounded mb-space-lg">
              <button
                id="tab-login"
                type="button"
                aria-pressed={mode === "login"}
                onClick={() => switchMode("login")}
                className={
                  "py-2.5 px-3 text-center font-headline-sm text-headline-sm transition-colors duration-100 rounded " +
                  (mode === "login"
                    ? "bg-surface text-on-surface border border-outline-variant"
                    : "text-outline hover:text-on-surface")
                }
              >
                Log In
              </button>
              <button
                id="tab-signup"
                type="button"
                aria-pressed={mode === "signup"}
                onClick={() => switchMode("signup")}
                className={
                  "py-2.5 px-3 text-center font-headline-sm text-headline-sm transition-colors duration-100 rounded " +
                  (mode === "signup"
                    ? "bg-surface text-on-surface border border-outline-variant"
                    : "text-outline hover:text-on-surface")
                }
              >
                Sign Up
              </button>
            </div>

            {/* Auth Form */}
            <form className="flex flex-col gap-space-lg" onSubmit={onSubmit} noValidate>
              <div className="flex flex-col gap-1.5">
                <label className="font-label-md text-label-md uppercase text-outline" htmlFor="auth-email">
                  Email
                </label>
                <input
                  id="auth-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  placeholder="dev@organization.io"
                  className="h-12 w-full bg-canvas-black border border-outline-variant rounded px-3 font-code-md text-headline-sm text-on-surface placeholder:text-outline-variant focus:outline-none focus:border-primary-container"
                />
              </div>

              <PasswordInput
                id="auth-password"
                name="password"
                label="Password"
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                revealed={revealed}
                onToggle={() => setRevealed((v) => !v)}
              />

              {/* Confirm Password Field (Sign Up Mode Only) */}
              {mode === "signup" && (
                <PasswordInput
                  id="auth-password-confirm"
                  name="password_confirmation"
                  label="Confirm Passphrase"
                  autoComplete="new-password"
                  revealed={revealed}
                  onToggle={() => setRevealed((v) => !v)}
                />
              )}

              {error && (
                <p role="alert" className="font-code-md text-code-md text-error leading-relaxed">
                  {error}
                </p>
              )}

              <button
                id="submit-button"
                type="submit"
                disabled={pending}
                className="mt-space-sm h-10 w-full bg-primary-container hover:opacity-90 active:opacity-95 disabled:opacity-60 text-canvas-black font-headline-sm text-headline-sm font-semibold rounded flex items-center justify-center transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-on-surface focus-visible:ring-offset-2 focus-visible:ring-offset-canvas-black"
              >
                {pending
                  ? mode === "login"
                    ? "Logging in..."
                    : "Creating account..."
                  : mode === "login"
                    ? "Log In"
                    : "Sign Up"}
              </button>
            </form>

            {/* Context Switcher */}
            <div className="mt-space-lg pt-space-md border-t border-outline-variant text-center">
              <button
                type="button"
                onClick={() => switchMode(mode === "login" ? "signup" : "login")}
                className="font-body-md text-body-md text-outline hover:text-on-surface transition-colors focus:outline-none focus-visible:underline"
              >
                {mode === "login"
                  ? "Don't have an account? Sign up"
                  : "Already have an account? Log in"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}