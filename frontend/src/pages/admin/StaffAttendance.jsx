import { useState } from "react";
import { Download, FileText, Pencil, Plus } from "lucide-react";
import { api, download } from "../../api/client";
import { Badge, Button, Empty, ErrorBox, Field, Modal, PageHeader, StatCard, Table, Tabs, fmtClock, fmtDate, fmtTime, hm, localToday, qs, useFetch, useToast } from "../../ui";
import { Clock, LogIn, LogOut, UserX } from "lucide-react";

const MethodBadge = ({ m }) => m ? <Badge tone={m === "face" ? "indigo" : "amber"}>{m === "face" ? "Face" : "Manual"}</Badge> : null;

function ManualModal({ init, teachers, onClose, onSaved }) {
  const toast = useToast(); const [f, setF] = useState(init); const [busy, setBusy] = useState(false);
  const save = async (e) => { e.preventDefault(); setBusy(true);
    try { await api("/api/admin/staff-attendance", { method: "PUT", body: { teacher_id: +f.teacher_id, work_date: f.work_date, check_in_time: f.check_in_time || null, check_out_time: f.check_out_time || null, reason: f.reason } });
      toast("success", "Saved and written to the audit log"); onSaved(); } catch (x) { toast("error", x.message); } finally { setBusy(false); } };
  return (
    <Modal title="Manual staff attendance" onClose={onClose} footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button form="smf" type="submit" loading={busy}>Save</Button></>}>
      <form id="smf" onSubmit={save} className="space-y-4">
        <div className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">Use only when face check-in is not possible. There is still only one record per teacher per day, and your reason is saved permanently.</div>
        <Field label="Teacher"><select className="input" required value={f.teacher_id} onChange={(e) => setF({ ...f, teacher_id: e.target.value })}><option value="">Select…</option>{teachers?.map((t) => <option key={t.id} value={t.id}>{t.full_name}</option>)}</select></Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Date"><input className="input" type="date" required max={localToday()} value={f.work_date} onChange={(e) => setF({ ...f, work_date: e.target.value })} /></Field>
          <Field label="Check-in"><input className="input" type="time" value={f.check_in_time} onChange={(e) => setF({ ...f, check_in_time: e.target.value })} /></Field>
          <Field label="Check-out"><input className="input" type="time" value={f.check_out_time} onChange={(e) => setF({ ...f, check_out_time: e.target.value })} /></Field></div>
        <Field label="Reason (required)"><textarea className="input" rows={2} required minLength={3} value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} /></Field>
      </form>
    </Modal>
  );
}

export default function StaffAttendance() {
  const toast = useToast(); const [tab, setTab] = useState("daily");
  const [f, setF] = useState({ date_from: localToday(), date_to: localToday(), teacher_id: "" }); const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const daily = useFetch(tab === "daily" ? "/api/admin/staff-attendance" + qs(f) : null); const presence = useFetch(tab === "class" ? "/api/admin/class-presence" + qs(f) : null);
  const { data: teachers } = useFetch("/api/admin/teachers"); const [manual, setManual] = useState(null);
  const blank = { teacher_id: "", work_date: f.date_from, check_in_time: "", check_out_time: "", reason: "" };
  const exp = (fmt) => download(`/api/admin/staff-attendance/export${qs({ ...f, fmt })}`, `staff-attendance.${fmt}`).catch((x) => toast("error", x.message));
  const d = daily.data; const s = d?.summary;

  const dCols = [{ label: "Date", nowrap: true, render: (r) => fmtDate(r.date) }, { label: "Teacher", render: (r) => <div><p className="font-medium text-slate-900">{r.teacher}</p><p className="text-xs text-slate-500">{r.username}</p></div> },
    { label: "Check-in", nowrap: true, render: (r) => <span className="flex items-center gap-1.5">{fmtClock(r.check_in_at)}<MethodBadge m={r.in_method} /></span> },
    { label: "Check-out", nowrap: true, render: (r) => r.check_out_at ? <span className="flex items-center gap-1.5">{fmtClock(r.check_out_at)}<MethodBadge m={r.out_method} /></span> : <Badge tone="amber">Still in</Badge> },
    { label: "Hours", hide: "sm", render: (r) => r.hours ?? "—" }, { label: "Network", hide: "lg", render: (r) => <span className="text-xs text-slate-500">{r.in_ip || "—"}</span> },
    { label: "", right: true, render: (r) => <button className="icon-btn" title="Correct" onClick={() => setManual({ teacher_id: r.teacher_id, work_date: r.date, check_in_time: hm(r.check_in_at), check_out_time: hm(r.check_out_at), reason: "" })}><Pencil className="h-4 w-4" /></button> }];
  const cCols = [{ label: "Date", nowrap: true, render: (r) => fmtDate(r.date) }, { label: "Teacher", render: (r) => <span className="font-medium text-slate-900">{r.teacher}</span> },
    { label: "Class", key: "class_name" }, { label: "Subject", key: "subject_name", hide: "sm" }, { label: "Verified at", nowrap: true, render: (r) => fmtTime(r.verified_at) },
    { label: "How", render: (r) => r.method === "face" ? <Badge tone="indigo">Face {r.confidence ? Math.round(r.confidence * 100) + "%" : ""}</Badge> : <span title={r.reason}><Badge tone="amber">Manual</Badge></span> },
    { label: "Reason", hide: "lg", render: (r) => <span className="text-slate-500">{r.reason || "—"}</span> }];

  return (<>
    <PageHeader title="Staff attendance" subtitle="Teacher arrival, departure and class presence" actions={<>{tab === "daily" && <><Button variant="ghost" icon={Download} onClick={() => exp("csv")}>CSV</Button><Button variant="ghost" icon={FileText} onClick={() => exp("pdf")}>PDF</Button></>}<Button icon={Plus} onClick={() => setManual(blank)}>Manual entry</Button></>} />
    <Tabs value={tab} onChange={setTab} tabs={[["daily", "Arrival & departure"], ["class", "Class presence"]]} />
    <div className="card mb-4 grid gap-3 p-4 sm:grid-cols-3">
      <input className="input" type="date" value={f.date_from} onChange={set("date_from")} aria-label="From date" /><input className="input" type="date" value={f.date_to} onChange={set("date_to")} aria-label="To date" />
      <select className="input" value={f.teacher_id} onChange={set("teacher_id")} aria-label="Teacher"><option value="">All teachers</option>{teachers?.map((t) => <option key={t.id} value={t.id}>{t.full_name}</option>)}</select></div>
    {tab === "daily" ? (<>
      {s && <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4"><StatCard icon={LogIn} label="Checked in" value={s.checked_in} tone="green" /><StatCard icon={LogOut} label="Checked out" value={s.checked_out} tone="indigo" />
        <StatCard icon={Clock} label="Still in" value={s.still_in} tone="amber" /><StatCard icon={UserX} label="Not checked in" value={d.missing.length ? s.missing : f.date_from === f.date_to && !f.teacher_id ? 0 : "—"} tone="red" /></div>}
      <div className="card overflow-hidden">{daily.error ? <ErrorBox message={daily.error} onRetry={daily.reload} /> : <Table cols={dCols} rows={d?.rows} loading={daily.loading} empty={<Empty title="No check-ins for this period" />} />}</div>
      {d?.missing?.length > 0 && <div className="card mt-4 p-5"><h2 className="mb-3 font-semibold text-slate-900">Not checked in on {fmtDate(f.date_from)}</h2>
        <ul className="divide-y divide-slate-100">{d.missing.map((m) => <li key={m.teacher_id} className="flex items-center justify-between py-2.5 text-sm"><span><b className="font-medium text-slate-800">{m.teacher}</b> <span className="text-slate-400">{m.username}</span></span>
          <Button variant="soft" className="btn-sm" onClick={() => setManual({ ...blank, teacher_id: m.teacher_id })}>Add manually</Button></li>)}</ul></div>}
    </>) : (<div className="card overflow-hidden">{presence.error ? <ErrorBox message={presence.error} onRetry={presence.reload} /> : <Table cols={cCols} rows={presence.data} loading={presence.loading} empty={<Empty title="No classes started in this period" text="A record appears when a teacher verifies themselves to start a class." />} />}</div>)}
    {manual && <ManualModal init={manual} teachers={teachers} onClose={() => setManual(null)} onSaved={() => { setManual(null); daily.reload(); }} />}
  </>);
}
