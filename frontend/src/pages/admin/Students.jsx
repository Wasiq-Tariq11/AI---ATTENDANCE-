import { useState } from "react";
import { KeyRound, Pencil, Plus, ScanFace, Search, Trash2, UserCheck, UserX } from "lucide-react";
import { api } from "../../api/client";
import FaceEnrollModal from "../../face/FaceEnrollModal";
import { Badge, Button, Empty, ErrorBox, Field, Modal, PageHeader, PasswordReveal, Table, qs, useConfirm, useDebounced, useFetch, useToast } from "../../ui";

function StudentForm({ s, classes, onClose, onSaved }) {
  const toast = useToast(); const edit = !!s;
  const [f, setF] = useState({ roll_number: s?.roll_number || "", full_name: s?.full_name || "", email: s?.email || "", class_id: s?.class_id || "", is_active: s?.is_active ?? true });
  const [busy, setBusy] = useState(false);
  const save = async (e) => {
    e.preventDefault(); setBusy(true);
    try {
      const body = { ...f, email: f.email || null, class_id: f.class_id ? Number(f.class_id) : null };
      const r = await api(edit ? `/api/admin/students/${s.id}` : "/api/admin/students", { method: edit ? "PUT" : "POST", body });
      toast("success", edit ? "Student updated" : "Student created"); onSaved(r.temp_password);
    } catch (x) { toast("error", x.message); } finally { setBusy(false); }
  };
  return (
    <Modal title={edit ? "Edit student" : "Add student"} onClose={onClose} footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button form="sf" type="submit" loading={busy}>Save</Button></>}>
      <form id="sf" onSubmit={save} className="space-y-4">
        <Field label="Roll number" hint={edit ? "Cannot be changed" : "Also used as the student's login ID"}><input className="input" required disabled={edit} value={f.roll_number} onChange={(e) => setF({ ...f, roll_number: e.target.value })} /></Field>
        <Field label="Full name"><input className="input" required value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} /></Field>
        <Field label="Email (optional)"><input className="input" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
        <Field label="Class"><select className="input" value={f.class_id} onChange={(e) => setF({ ...f, class_id: e.target.value })}><option value="">Not assigned</option>{classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
      </form>
    </Modal>
  );
}

export default function Students() {
  const toast = useToast(); const confirm = useConfirm();
  const [q, setQ] = useState(""); const [cls, setCls] = useState(""); const dq = useDebounced(q);
  const { data, loading, error, reload } = useFetch("/api/admin/students" + qs({ q: dq, class_id: cls }));
  const { data: classes } = useFetch("/api/admin/classes");
  const [form, setForm] = useState(null); const [face, setFace] = useState(null); const [pw, setPw] = useState(null);

  const act = async (fn, ok) => { try { await fn(); toast("success", ok); reload(); } catch (x) { toast("error", x.message); } };
  const toggle = async (s) => (await confirm({ title: s.is_active ? "Deactivate student?" : "Activate student?", message: s.is_active ? `${s.full_name} will no longer be able to sign in. Attendance history is kept.` : `${s.full_name} will be able to sign in again.`, confirmText: s.is_active ? "Deactivate" : "Activate", danger: s.is_active }))
    && act(() => api(`/api/admin/students/${s.id}`, { method: "PUT", body: { roll_number: s.roll_number, full_name: s.full_name, email: s.email, class_id: s.class_id, is_active: !s.is_active } }), "Updated");
  const remove = async (s) => (await confirm({ title: "Delete student?", message: `Permanently delete ${s.full_name}? This only works if they have no attendance history.`, confirmText: "Delete", danger: true }))
    && act(() => api(`/api/admin/students/${s.id}`, { method: "DELETE" }), "Student deleted");
  const reset = async (s) => (await confirm({ title: "Reset password?", message: `Create a new temporary password for ${s.full_name}?`, confirmText: "Reset" }))
    && api(`/api/admin/users/${s.user_id}/reset-password`, { method: "POST" }).then((r) => setPw(r.temp_password)).catch((x) => toast("error", x.message));

  const cols = [
    { label: "Roll no", key: "roll_number", nowrap: true }, { label: "Name", render: (s) => <span className="font-medium text-slate-900">{s.full_name}</span> },
    { label: "Class", hide: "md", render: (s) => s.class_name || <span className="text-slate-400">—</span> },
    { label: "Face", hide: "sm", render: (s) => s.face_templates ? <Badge tone="green">Registered</Badge> : <Badge tone="amber">Not registered</Badge> },
    { label: "Status", hide: "sm", render: (s) => s.is_active ? <Badge tone="green">Active</Badge> : <Badge>Inactive</Badge> },
    { label: "Actions", right: true, render: (s) => (
      <div className="flex justify-end gap-0.5">
        <button className="icon-btn" title="Edit" onClick={() => setForm(s)}><Pencil className="h-4 w-4" /></button>
        <button className="icon-btn" title="Register face" onClick={() => setFace(s)}><ScanFace className="h-4 w-4" /></button>
        <button className="icon-btn" title="Reset password" onClick={() => reset(s)}><KeyRound className="h-4 w-4" /></button>
        <button className="icon-btn" title={s.is_active ? "Deactivate" : "Activate"} onClick={() => toggle(s)}>{s.is_active ? <UserX className="h-4 w-4" /> : <UserCheck className="h-4 w-4" />}</button>
        <button className="icon-btn hover:text-rose-600" title="Delete" onClick={() => remove(s)}><Trash2 className="h-4 w-4" /></button></div>) },
  ];
  return (
    <>
      <PageHeader title="Students" subtitle="Register students, assign classes and enrol faces" actions={<Button icon={Plus} onClick={() => setForm({})}>Add student</Button>} />
      <div className="card overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row">
          <div className="relative flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input className="input pl-9" placeholder="Search by name or roll number" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search students" /></div>
          <select className="input sm:w-48" value={cls} onChange={(e) => setCls(e.target.value)} aria-label="Filter by class"><option value="">All classes</option>{classes?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        </div>
        {error ? <ErrorBox message={error} onRetry={reload} /> : <Table cols={cols} rows={data} loading={loading} empty={<Empty title="No students found" text="Add your first student to get started." action={<Button icon={Plus} onClick={() => setForm({})}>Add student</Button>} />} />}
      </div>
      {form && <StudentForm s={form.id ? form : null} classes={classes || []} onClose={() => setForm(null)} onSaved={(p) => { setForm(null); reload(); if (p) setPw(p); }} />}
      {face && <FaceEnrollModal name={face.full_name} endpoint={`/api/admin/students/${face.id}/face`} onClose={() => setFace(null)} onSaved={() => { setFace(null); reload(); }} />}
      {pw && <PasswordReveal password={pw} onClose={() => setPw(null)} />}
    </>
  );
}
