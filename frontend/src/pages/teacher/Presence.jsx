import { useCallback, useState } from "react";
import { CheckCircle2, LogIn, LogOut, ShieldAlert, Wifi } from "lucide-react";
import { api } from "../../api/client";
import FaceCamera from "../../face/FaceCamera";
import { Badge, Button, Empty, ErrorBox, Modal, PageHeader, Skeleton, Table, fmtClock, fmtDate, useFetch } from "../../ui";

const REASONS = {
  not_registered: "Your face is not registered yet. Please ask the administrator.",
  mismatch: "This face does not match your account. The attempt has been logged.",
  invalid: "Could not read the face clearly. Try again.",
};

export default function Presence() {
  const { data: t, loading, error, reload } = useFetch("/api/teacher/presence/today");
  const hist = useFetch("/api/teacher/presence/history");
  const [action, setAction] = useState(null);

  const done = useCallback(() => { setTimeout(() => { setAction(null); reload(); hist.reload(); }, 1800); }, [reload, hist]);
  const onFace = useCallback(async (embedding) => {
    try {
      const r = await api(`/api/teacher/presence/${action}`, { method: "POST", body: { embedding } });
      switch (r.result) {
        case "checked_in": done(); return { tone: "success", text: `✓ Checked in at ${fmtClock(r.record.check_in_at)}` };
        case "checked_out": done(); return { tone: "success", text: `✓ Checked out at ${fmtClock(r.record.check_out_at)} · ${r.record.hours} h today` };
        case "already": done(); return { tone: "warn", text: `Already recorded today (${fmtClock(action === "check-in" ? r.record.check_in_at : r.record.check_out_at)})` };
        case "no_check_in": return { tone: "warn", text: "No check-in found for today. Check in first." };
        case "too_soon": return { tone: "warn", text: `Too soon. Please wait ${r.wait_minutes} more minute(s).` };
        default: return { tone: "error", text: REASONS[r.reason] || "Verification failed" };
      }
    } catch (x) { return { tone: "error", text: x.message }; }
  }, [action, done]);

  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (loading) return <><PageHeader title="Check in / out" /><Skeleton className="h-72" /></>;
  const r = t.record; const state = !r ? "none" : r.check_out_at ? "done" : "in";
  const cols = [{ label: "Date", nowrap: true, render: (x) => fmtDate(x.date) }, { label: "Check-in", render: (x) => fmtClock(x.check_in_at) }, { label: "Check-out", render: (x) => fmtClock(x.check_out_at) },
    { label: "Hours", hide: "sm", render: (x) => x.hours ?? "—" }, { label: "Method", hide: "sm", render: (x) => <Badge tone={x.in_method === "face" ? "indigo" : "amber"}>{x.in_method === "face" ? "Face" : "Manual (admin)"}</Badge> }];

  return (<>
    <PageHeader title="Check in / out" subtitle="Record your arrival and departure with face verification" />
    <div className="grid gap-6 lg:grid-cols-5">
      <div className="card overflow-hidden lg:col-span-3">
        <div className={`p-6 text-white ${state === "done" ? "bg-gradient-to-br from-emerald-600 to-teal-700" : "bg-gradient-to-br from-indigo-600 to-violet-700"}`}>
          <p className="text-sm text-white/80">{fmtDate(t.date)}</p>
          <h2 className="mt-1 text-2xl font-bold">{state === "none" ? "You have not checked in yet" : state === "in" ? "You are checked in" : "All done for today"}</h2>
        </div>
        <div className="grid grid-cols-3 divide-x divide-slate-100 border-b border-slate-100 text-center">
          {[["Check-in", fmtClock(r?.check_in_at)], ["Check-out", fmtClock(r?.check_out_at)], ["Hours", r?.hours ?? "—"]].map(([l, v]) => <div key={l} className="py-4"><p className="text-xl font-bold text-slate-900">{v}</p><p className="text-xs text-slate-500">{l}</p></div>)}</div>
        <div className="space-y-4 p-5">
          {!t.face_registered && <div className="flex items-start gap-3 rounded-xl bg-amber-50 p-3.5 text-sm text-amber-900"><ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />Your face is not registered yet, so you cannot check in. Ask the administrator to register it.</div>}
          {state === "none" && <Button icon={LogIn} className="w-full" disabled={!t.face_registered} onClick={() => setAction("check-in")}>Check in with face</Button>}
          {state === "in" && <Button icon={LogOut} className="w-full" disabled={!t.face_registered} onClick={() => setAction("check-out")}>Check out with face</Button>}
          {state === "done" && <div className="flex items-center justify-center gap-2 rounded-xl bg-emerald-50 py-3 text-sm font-semibold text-emerald-700"><CheckCircle2 className="h-4 w-4" />Attendance complete for today</div>}
          <ul className="space-y-1.5 text-xs text-slate-500">
            <li>• One check-in and one check-out per day. Duplicates are blocked.</li>
            <li>• Check-out is allowed {t.min_minutes}+ minutes after check-in.</li>
            <li>• Your face must match your own account. Using someone else's face is logged for the administrator.</li>
            {t.campus_restricted && <li className="flex items-center gap-1.5 text-indigo-600"><Wifi className="h-3.5 w-3.5" />Only works on the campus network.</li>}
          </ul>
        </div>
      </div>
      <div className="card overflow-hidden lg:col-span-2"><h2 className="border-b border-slate-100 p-5 font-semibold text-slate-900">Last 30 days</h2>
        <Table cols={cols} rows={hist.data} loading={hist.loading} empty={<Empty title="No history yet" />} /></div>
    </div>
    {action && <Modal title={action === "check-in" ? "Check in" : "Check out"} onClose={() => setAction(null)} size="md">
      <FaceCamera mode="attend" onFace={onFace} /><p className="mt-3 text-xs text-slate-500">Look at the camera, then slowly turn your head to one side and back. This proves a real person is present.</p></Modal>}
  </>);
}
