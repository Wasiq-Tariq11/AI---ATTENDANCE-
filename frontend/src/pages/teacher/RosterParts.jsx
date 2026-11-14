import { useState } from "react";
import { Check, Pencil, X } from "lucide-react";
import { api } from "../../api/client";
import { Badge, Button, Empty, Field, Modal, StatusBadge, useToast } from "../../ui";

const PRESETS = ["Face recognition failed", "Camera not working", "Student without registered face", "Correction after review", "Other"];

export function ManualMarkModal({ sid, student, onClose, onDone }) {
  const toast = useToast(); const [status, setStatus] = useState(student.status === "present" ? "absent" : "present");
  const [preset, setPreset] = useState(PRESETS[0]); const [note, setNote] = useState(""); const [busy, setBusy] = useState(false);
  const save = async (e) => { e.preventDefault(); setBusy(true);
    try { await api(`/api/teacher/sessions/${sid}/mark`, { method: "POST", body: { student_id: student.student_id, status, reason: preset === "Other" ? note : note ? `${preset}: ${note}` : preset } }); toast("success", "Attendance updated"); onDone(); }
    catch (x) { toast("error", x.message); } finally { setBusy(false); } };
  return (
    <Modal title="Manual attendance" onClose={onClose} size="sm" footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button form="mm" type="submit" loading={busy}>Save</Button></>}>
      <form id="mm" onSubmit={save} className="space-y-4">
        <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600"><b>{student.name}</b> ({student.roll}) is currently <StatusBadge status={student.status} /></p>
        <Field label="Mark as"><div className="grid grid-cols-2 gap-2">{["present", "absent"].map((s) => (
          <button type="button" key={s} onClick={() => setStatus(s)} className={`rounded-xl border px-3 py-2.5 text-sm font-semibold capitalize transition ${status === s ? (s === "present" ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-rose-500 bg-rose-50 text-rose-700") : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>{s}</button>))}</div></Field>
        <Field label="Reason (required)"><select className="input" value={preset} onChange={(e) => setPreset(e.target.value)}>{PRESETS.map((p) => <option key={p}>{p}</option>)}</select></Field>
        <Field label={preset === "Other" ? "Describe the reason" : "Extra note (optional)"}><input className="input" required={preset === "Other"} minLength={preset === "Other" ? 3 : 0} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      </form>
    </Modal>
  );
}

export function RosterList({ students, onMark, canMark = true }) {
  if (!students.length) return <Empty title="No students in this class" text="Ask the administrator to enrol students." />;
  return (
    <ul className="divide-y divide-slate-100">
      {students.map((s) => (
        <li key={s.student_id} className="flex items-center gap-3 px-4 py-3">
          <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${s.status === "present" ? "bg-emerald-100 text-emerald-600" : s.status === "absent" ? "bg-rose-100 text-rose-600" : "bg-slate-100 text-slate-400"}`}>
            {s.status === "present" ? <Check className="h-4 w-4" /> : s.status === "absent" ? <X className="h-4 w-4" /> : <span className="text-xs">—</span>}</div>
          <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-slate-900">{s.name}</p>
            <p className="text-xs text-slate-500">{s.roll}{s.method === "face" && s.confidence ? ` · face ${Math.round(s.confidence * 100)}%` : s.method === "manual" ? " · manual" : ""}</p></div>
          {s.method === "face" && <Badge tone="indigo">AI</Badge>}
          {canMark && <button className="icon-btn" title="Mark manually" onClick={() => onMark(s)}><Pencil className="h-4 w-4" /></button>}
        </li>))}
    </ul>
  );
}
