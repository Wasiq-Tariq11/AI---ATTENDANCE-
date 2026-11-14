import { useState } from "react";
import { Download, FileText, Pencil, Search } from "lucide-react";
import { api, download } from "../../api/client";
import { Badge, Button, Empty, ErrorBox, Field, Modal, PageHeader, StatCard, StatusBadge, Table, fmtDate, qs, useDebounced, useFetch, useToast } from "../../ui";
import { CalendarCheck, Percent, UserCheck, UserX } from "lucide-react";

export default function Attendance() {
  const toast = useToast();
  const [f, setF] = useState({ date_from: "", date_to: "", class_id: "", subject_id: "", teacher_id: "", q: "" }); const dq = useDebounced(f.q);
  const query = qs({ ...f, q: dq });
  const { data, loading, error, reload } = useFetch("/api/admin/attendance" + query);
  const { data: classes } = useFetch("/api/admin/classes"); const { data: subjects } = useFetch("/api/admin/subjects"); const { data: teachers } = useFetch("/api/admin/teachers");
  const [fix, setFix] = useState(null); const [busy, setBusy] = useState(false); const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const save = async (e) => { e.preventDefault(); setBusy(true);
    try { await api(`/api/admin/attendance/${fix.record_id}`, { method: "PATCH", body: { status: fix.status, reason: fix.reason } }); toast("success", "Attendance corrected and logged"); setFix(null); reload(); }
    catch (x) { toast("error", x.message); } finally { setBusy(false); } };
  const exp = (fmt) => download(`/api/admin/attendance/export${qs({ ...f, q: dq, fmt })}`, `attendance.${fmt}`).catch((x) => toast("error", x.message));
  const s = data?.summary;
  const cols = [{ label: "Date", nowrap: true, render: (r) => fmtDate(r.date) }, { label: "Roll no", key: "roll", nowrap: true }, { label: "Student", render: (r) => <span className="font-medium text-slate-900">{r.student_name}</span> },
    { label: "Class", key: "class_name", hide: "md" }, { label: "Subject", key: "subject_name", hide: "sm" }, { label: "Teacher", key: "teacher_name", hide: "lg" },
    { label: "Status", render: (r) => <StatusBadge status={r.status} /> }, { label: "Method", hide: "lg", render: (r) => <Badge tone={r.method === "face" ? "indigo" : "slate"}>{r.method}</Badge> },
    { label: "", right: true, render: (r) => <button className="icon-btn" title="Correct" onClick={() => setFix({ ...r, reason: "" })}><Pencil className="h-4 w-4" /></button> }];
  return (<>
    <PageHeader title="Attendance" subtitle="Search, correct and export attendance across the institution" actions={<><Button variant="ghost" icon={Download} onClick={() => exp("csv")}>CSV</Button><Button variant="ghost" icon={FileText} onClick={() => exp("pdf")}>PDF</Button></>} />
    <div className="card mb-4 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-6">
      <div className="relative sm:col-span-2 lg:col-span-2"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input className="input pl-9" placeholder="Student name or roll no" value={f.q} onChange={set("q")} aria-label="Search" /></div>
      <select className="input" value={f.class_id} onChange={set("class_id")} aria-label="Class"><option value="">All classes</option>{classes?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
      <select className="input" value={f.subject_id} onChange={set("subject_id")} aria-label="Subject"><option value="">All subjects</option>{subjects?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
      <select className="input" value={f.teacher_id} onChange={set("teacher_id")} aria-label="Teacher"><option value="">All teachers</option>{teachers?.map((c) => <option key={c.id} value={c.id}>{c.full_name}</option>)}</select>
      <div className="grid grid-cols-2 gap-2 sm:col-span-2 lg:col-span-1"><input className="input" type="date" value={f.date_from} onChange={set("date_from")} aria-label="From date" /><input className="input" type="date" value={f.date_to} onChange={set("date_to")} aria-label="To date" /></div>
    </div>
    {s && <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4"><StatCard icon={CalendarCheck} label="Records" value={s.total} /><StatCard icon={UserCheck} label="Present" value={s.present} tone="green" /><StatCard icon={UserX} label="Absent" value={s.absent} tone="red" /><StatCard icon={Percent} label="Attendance" value={`${s.percentage}%`} tone="amber" /></div>}
    <div className="card overflow-hidden">{error ? <ErrorBox message={error} onRetry={reload} /> : <Table cols={cols} rows={data?.rows} loading={loading} empty={<Empty title="No attendance records" text="Records appear after a teacher closes an attendance session. Try clearing the filters." />} />}</div>
    {data?.rows?.length === 500 && <p className="mt-2 text-xs text-slate-500">Showing the latest 500 records. Exports include everything that matches the filters.</p>}
    {fix && <Modal title="Correct attendance" onClose={() => setFix(null)} footer={<><Button variant="ghost" onClick={() => setFix(null)}>Cancel</Button><Button form="fx" type="submit" loading={busy}>Save correction</Button></>}>
      <form id="fx" onSubmit={save} className="space-y-4">
        <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600"><b>{fix.student_name}</b> · {fix.subject_name} · {fmtDate(fix.date)}</p>
        <Field label="Status"><select className="input" value={fix.status} onChange={(e) => setFix({ ...fix, status: e.target.value })}><option value="present">Present</option><option value="absent">Absent</option></select></Field>
        <Field label="Reason (required)" hint="Saved permanently in the audit log"><textarea className="input" rows={3} required minLength={3} value={fix.reason} onChange={(e) => setFix({ ...fix, reason: e.target.value })} /></Field></form></Modal>}
  </>);
}
