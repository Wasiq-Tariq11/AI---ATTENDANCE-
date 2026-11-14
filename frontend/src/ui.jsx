import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Info, Inbox, Loader2, X, XCircle } from "lucide-react";
import { api } from "./api/client";

export const cn = (...a) => a.filter(Boolean).join(" ");

/* ---------- data hook ---------- */
export function useFetch(path) {
  const [s, setS] = useState({ data: null, loading: !!path, error: null });
  const load = useCallback(() => {
    if (!path) return Promise.resolve();
    setS((p) => ({ ...p, loading: true, error: null }));
    return api(path).then((data) => setS({ data, loading: false, error: null })).catch((e) => setS({ data: null, loading: false, error: e.message }));
  }, [path]);
  useEffect(() => { load(); }, [load]);
  return { ...s, reload: load };
}

/* ---------- toasts + confirm ---------- */
const UiCtx = createContext(null);
export const useToast = () => useContext(UiCtx).toast;
export const useConfirm = () => useContext(UiCtx).confirm;

export function UiProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const [dlg, setDlg] = useState(null);
  const toast = useCallback((type, text) => {
    const id = Math.random();
    setToasts((t) => [...t, { id, type, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4500);
  }, []);
  const confirm = useCallback((opts) => new Promise((resolve) => setDlg({ ...opts, resolve })), []);
  const close = (v) => { dlg.resolve(v); setDlg(null); };
  const icon = { success: CheckCircle2, error: XCircle, info: Info };
  const tone = { success: "text-emerald-600", error: "text-rose-600", info: "text-indigo-600" };
  return (
    <UiCtx.Provider value={{ toast, confirm }}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-3 z-[60] flex flex-col items-center gap-2 px-3 sm:items-end sm:pr-5" aria-live="polite">
        {toasts.map((t) => { const I = icon[t.type] || Info; return (
          <div key={t.id} className="pointer-events-auto flex w-full max-w-sm animate-rise items-start gap-3 rounded-xl border border-slate-200 bg-white p-3.5 shadow-lg shadow-slate-300/40">
            <I className={cn("mt-0.5 h-5 w-5 shrink-0", tone[t.type])} /><p className="text-sm text-slate-700">{t.text}</p>
          </div>); })}
      </div>
      {dlg && (
        <Modal title={dlg.title} onClose={() => close(false)} size="sm" footer={<>
          <button className="btn btn-ghost" onClick={() => close(false)}>Cancel</button>
          <button className={cn("btn", dlg.danger ? "btn-danger" : "btn-primary")} onClick={() => close(true)}>{dlg.confirmText || "Confirm"}</button></>}>
          <div className="flex gap-3">
            {dlg.danger && <AlertTriangle className="h-5 w-5 shrink-0 text-rose-500" />}
            <p className="text-sm text-slate-600">{dlg.message}</p>
          </div>
        </Modal>
      )}
    </UiCtx.Provider>
  );
}

/* ---------- primitives ---------- */
export function Modal({ title, onClose, children, footer, size = "md" }) {
  useEffect(() => {
    const k = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", k);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", k); document.body.style.overflow = ""; };
  }, [onClose]);
  const w = { sm: "sm:max-w-md", md: "sm:max-w-lg", lg: "sm:max-w-3xl" }[size];
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />
      <div className={cn("relative flex max-h-[92vh] w-full animate-pop flex-col rounded-t-3xl bg-white shadow-2xl sm:rounded-2xl", w)}>
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h3 className="text-base font-semibold text-slate-900">{title}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><X className="h-4 w-4" /></button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex flex-col-reverse gap-2 border-t border-slate-100 px-5 py-3.5 sm:flex-row sm:justify-end">{footer}</div>}
      </div>
    </div>
  );
}

export function Button({ variant = "primary", loading, icon: Icon, children, className, ...p }) {
  return (
    <button className={cn("btn", `btn-${variant}`, className)} disabled={loading || p.disabled} {...p}>
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : Icon && <Icon className="h-4 w-4" />}{children}
    </button>
  );
}

export function Field({ label, hint, children }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-slate-700">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  );
}

const tones = {
  green: "bg-emerald-50 text-emerald-700 ring-emerald-600/15", red: "bg-rose-50 text-rose-700 ring-rose-600/15",
  amber: "bg-amber-50 text-amber-700 ring-amber-600/20", slate: "bg-slate-100 text-slate-600 ring-slate-500/10",
  indigo: "bg-indigo-50 text-indigo-700 ring-indigo-600/15",
};
export const Badge = ({ tone = "slate", children }) => (
  <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset", tones[tone])}>{children}</span>
);
export const StatusBadge = ({ status }) =>
  status === "present" ? <Badge tone="green">Present</Badge> : status === "absent" ? <Badge tone="red">Absent</Badge> : <Badge>Not marked</Badge>;

export const Spinner = ({ className }) => <Loader2 className={cn("h-5 w-5 animate-spin text-indigo-600", className)} />;
export const Skeleton = ({ className }) => <div className={cn("animate-pulse rounded-lg bg-slate-200/70", className)} />;

export function Empty({ title = "Nothing here yet", text, action }) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      <div className="mb-3 rounded-2xl bg-slate-100 p-3 text-slate-400"><Inbox className="h-6 w-6" /></div>
      <p className="font-medium text-slate-700">{title}</p>
      {text && <p className="mt-1 max-w-sm text-sm text-slate-500">{text}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export const ErrorBox = ({ message, onRetry }) => (
  <div className="card flex flex-col items-center gap-3 p-8 text-center">
    <XCircle className="h-8 w-8 text-rose-500" /><p className="text-sm text-slate-600">{message}</p>
    {onRetry && <button className="btn btn-ghost btn-sm" onClick={onRetry}>Try again</button>}
  </div>
);

export function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div><h1 className="text-2xl font-bold tracking-tight text-slate-900">{title}</h1>{subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}</div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

const tint = { indigo: "bg-indigo-50 text-indigo-600", green: "bg-emerald-50 text-emerald-600", red: "bg-rose-50 text-rose-600", amber: "bg-amber-50 text-amber-600", sky: "bg-sky-50 text-sky-600", violet: "bg-violet-50 text-violet-600" };
export function StatCard({ icon: Icon, label, value, hint, tone = "indigo" }) {
  return (
    <div className="card animate-rise p-4 sm:p-5">
      <div className="flex items-center gap-3">
        <div className={cn("rounded-xl p-2.5", tint[tone])}><Icon className="h-5 w-5" /></div>
        <p className="text-sm font-medium text-slate-500">{label}</p>
      </div>
      <p className="mt-3 text-3xl font-bold tracking-tight text-slate-900">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

export function Progress({ value, className }) {
  const v = value ?? 0, c = v >= 75 ? "bg-emerald-500" : v >= 60 ? "bg-amber-500" : "bg-rose-500";
  return <div className={cn("h-2 w-full overflow-hidden rounded-full bg-slate-100", className)}><div className={cn("h-full rounded-full transition-all", c)} style={{ width: `${v}%` }} /></div>;
}

export function Ring({ value = 0, size = 140, label = "Attendance" }) {
  const r = 52, c = 2 * Math.PI * r, color = value >= 75 ? "#10b981" : value >= 60 ? "#f59e0b" : "#f43f5e";
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg viewBox="0 0 120 120" className="-rotate-90"><circle cx="60" cy="60" r={r} fill="none" stroke="#e2e8f0" strokeWidth="10" />
        <circle cx="60" cy="60" r={r} fill="none" stroke={color} strokeWidth="10" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c - (c * value) / 100} className="transition-all duration-700" /></svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center"><span className="text-3xl font-bold text-slate-900">{value}%</span><span className="text-xs text-slate-500">{label}</span></div>
    </div>
  );
}

const hide = { sm: "hidden sm:table-cell", md: "hidden md:table-cell", lg: "hidden lg:table-cell" };
export function Table({ cols, rows, loading, empty }) {
  if (loading) return <div className="space-y-3 p-5">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-10" />)}</div>;
  if (!rows?.length) return empty || <Empty />;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-full text-left text-sm">
        <thead><tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-500">
          {cols.map((c) => <th key={c.label} className={cn("whitespace-nowrap px-4 py-3 font-semibold", c.hide && hide[c.hide], c.right && "text-right")}>{c.label}</th>)}</tr></thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((r, i) => (
            <tr key={r.id ?? r.record_id ?? i} className="transition hover:bg-slate-50/70">
              {cols.map((c) => <td key={c.label} className={cn("px-4 py-3 text-slate-700", c.hide && hide[c.hide], c.right && "text-right", c.nowrap && "whitespace-nowrap")}>{c.render ? c.render(r) : r[c.key]}</td>)}
            </tr>))}
        </tbody>
      </table>
    </div>
  );
}

export function Tabs({ tabs, value, onChange }) {
  return (
    <div className="mb-5 inline-flex max-w-full gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1" role="tablist">
      {tabs.map(([k, label]) => (
        <button key={k} role="tab" aria-selected={value === k} onClick={() => onChange(k)}
          className={cn("whitespace-nowrap rounded-lg px-3.5 py-1.5 text-sm font-medium transition", value === k ? "bg-white text-indigo-700 shadow-sm" : "text-slate-600 hover:text-slate-900")}>{label}</button>))}
    </div>
  );
}

export function PasswordReveal({ title = "Temporary password", password, onClose }) {
  const toast = useToast(); const ref = useRef();
  return (
    <Modal title={title} onClose={onClose} size="sm" footer={<button className="btn btn-primary" onClick={onClose}>Done</button>}>
      <p className="text-sm text-slate-600">Share this with the user securely. It is shown only once, and they must change it at first login.</p>
      <div className="mt-3 flex items-center gap-2 rounded-xl bg-slate-100 p-3">
        <code ref={ref} className="flex-1 select-all break-all font-mono text-base font-semibold text-slate-900">{password}</code>
        <button className="btn btn-ghost btn-sm" onClick={() => navigator.clipboard?.writeText(password).then(() => toast("success", "Copied"))}>Copy</button>
      </div>
    </Modal>
  );
}

let TZ; // institute timezone, loaded from the server at start-up
export const setTz = (z) => { TZ = z; };
export const fmtDate = (d) => new Date(String(d).length === 10 ? d + "T00:00:00" : d).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
export const fmtTime = (d) => new Date(d).toLocaleString(undefined, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: TZ });

export function useDebounced(v, ms = 300) {
  const [d, setD] = useState(v);
  useEffect(() => { const t = setTimeout(() => setD(v), ms); return () => clearTimeout(t); }, [v, ms]);
  return d;
}
export const qs = (o) => { const p = new URLSearchParams(); Object.entries(o).forEach(([k, v]) => v !== "" && v != null && p.set(k, v)); const s = p.toString(); return s ? "?" + s : ""; };

export const fmtClock = (d) => (d ? new Date(d).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", timeZone: TZ }) : "—");
export const hm = (d) => (d ? new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: TZ }).format(new Date(d)) : "");
export const localToday = () => new Date().toLocaleDateString("en-CA", { timeZone: TZ });
