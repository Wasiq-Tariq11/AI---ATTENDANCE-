import { useState } from "react";
import { Activity, KeyRound, Pencil, Plus, ScanFace, Trash2, UserCheck, UserX } from "lucide-react";
import FaceEnrollModal from "../../face/FaceEnrollModal";
import { api } from "../../api/client";
import { Badge, Button, Empty, ErrorBox, Field, Modal, PageHeader, PasswordReveal, Table, fmtTime, useConfirm, useFetch, useToast } from "../../ui";

function Form({ t, onClose, onSaved }) {
  const toast = useToast(); const edit = !!t; const [busy, setBusy] = useState(false);
  const [f, setF] = useState({ username: t?.username || "", full_name: t?.full_name || "", department: t?.department || "", is_active: t?.is_active ?? true });
  const save = async (e) => { e.preventDefault(); setBusy(true);
    try { const r = await api(edit ? `/api/admin/teachers/${t.id}` : "/api/admin/teachers", { method: edit ? "PUT" : "POST", body: { ...f, department: f.department || null } }); toast("success", edit ? "Teacher updated" : "Teacher account created"); onSaved(r.temp_password); }
    catch (x) { toast("error", x.message); } finally { setBusy(false); } };
  return (
    <Modal title={edit ? "Edit teacher" : "Add teacher"} onClose={onClose} footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button form="tf" type="submit" loading={busy}>Save</Button></>}>
      <form id="tf" onSubmit={save} className="space-y-4">
        <Field label="Employee ID" hint={edit ? "Cannot be changed" : "Used as the teacher's login ID"}><input className="input" required minLength={2} disabled={edit} value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} /></Field>
        <Field label="Full name"><input className="input" required value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} /></Field>
        <Field label="Department"><input className="input" value={f.department} onChange={(e) => setF({ ...f, department: e.target.value })} /></Field>
      </form>
    </Modal>
  );
}

export default function Teachers() {
  const toast = useToast(); const confirm = useConfirm();
  const { data, loading, error, reload } = useFetch("/api/admin/teachers");
  const [form, setForm] = useState(null); const [pw, setPw] = useState(null); const [act, setAct] = useState(null); const [face, setFace] = useState(null);
  const run = async (fn, ok) => { try { await fn(); toast("success", ok); reload(); } catch (x) { toast("error", x.message); } };
  const toggle = async (t) => (await confirm({ title: t.is_active ? "Deactivate teacher?" : "Activate teacher?", message: t.is_active ? `${t.full_name} will not be able to sign in. Their records are kept.` : `${t.full_name} will be able to sign in again.`, confirmText: t.is_active ? "Deactivate" : "Activate", danger: t.is_active }))
    && run(() => api(`/api/admin/teachers/${t.id}`, { method: "PUT", body: { username: t.username, full_name: t.full_name, department: t.department, is_active: !t.is_active } }), "Updated");
  const remove = async (t) => (await confirm({ title: "Delete teacher?", message: `Delete ${t.full_name}? Only possible if they have no assignments or sessions.`, confirmText: "Delete", danger: true })) && run(() => api(`/api/admin/teachers/${t.id}`, { method: "DELETE" }), "Teacher deleted");
  const reset = async (t) => (await confirm({ title: "Reset password?", message: `Create a new temporary password for ${t.full_name}?`, confirmText: "Reset" })) && api(`/api/admin/users/${t.user_id}/reset-password`, { method: "POST" }).then((r) => setPw(r.temp_password)).catch((x) => toast("error", x.message));
  const activity = async (t) => { try { setAct({ t, rows: await api(`/api/admin/teachers/${t.id}/activity`) }); } catch (x) { toast("error", x.message); } };

  const cols = [
    { label: "Employee ID", key: "username", nowrap: true }, { label: "Name", render: (t) => <span className="font-medium text-slate-900">{t.full_name}</span> },
    { label: "Department", hide: "md", render: (t) => t.department || "—" }, { label: "Assignments", hide: "sm", key: "assignments" }, { label: "Sessions", hide: "lg", key: "sessions" },
    { label: "Face", hide: "sm", render: (t) => t.face_templates ? <Badge tone="green">Registered</Badge> : <Badge tone="amber">Not registered</Badge> },
    { label: "Status", hide: "sm", render: (t) => t.is_active ? <Badge tone="green">Active</Badge> : <Badge>Inactive</Badge> },
    { label: "Actions", right: true, render: (t) => (<div className="flex justify-end gap-0.5">
      <button className="icon-btn" title="Edit" onClick={() => setForm(t)}><Pencil className="h-4 w-4" /></button>
      <button className="icon-btn" title="Register face" onClick={() => setFace(t)}><ScanFace className="h-4 w-4" /></button>
      <button className="icon-btn" title="Activity" onClick={() => activity(t)}><Activity className="h-4 w-4" /></button>
      <button className="icon-btn" title="Reset password" onClick={() => reset(t)}><KeyRound className="h-4 w-4" /></button>
      <button className="icon-btn" title={t.is_active ? "Deactivate" : "Activate"} onClick={() => toggle(t)}>{t.is_active ? <UserX className="h-4 w-4" /> : <UserCheck className="h-4 w-4" />}</button>
      <button className="icon-btn hover:text-rose-600" title="Delete" onClick={() => remove(t)}><Trash2 className="h-4 w-4" /></button></div>) },
  ];
  return (
    <>
      <PageHeader title="Teachers" subtitle="Create teacher accounts. Assign classes and subjects under Academics." actions={<Button icon={Plus} onClick={() => setForm({})}>Add teacher</Button>} />
      <div className="card overflow-hidden">{error ? <ErrorBox message={error} onRetry={reload} /> : <Table cols={cols} rows={data} loading={loading} empty={<Empty title="No teachers yet" text="Create a teacher account so they can start taking attendance." />} />}</div>
      {form && <Form t={form.id ? form : null} onClose={() => setForm(null)} onSaved={(p) => { setForm(null); reload(); if (p) setPw(p); }} />}
      {pw && <PasswordReveal password={pw} onClose={() => setPw(null)} />}
      {face && <FaceEnrollModal name={face.full_name} endpoint={`/api/admin/teachers/${face.id}/face`} onClose={() => setFace(null)} onSaved={() => { setFace(null); reload(); }} />}
      {act && <Modal title={`Activity · ${act.t.full_name}`} onClose={() => setAct(null)} size="md">
        {act.rows.length ? <ul className="divide-y divide-slate-100">{act.rows.map((r, i) => <li key={i} className="py-2.5 text-sm"><span className="font-medium text-slate-800">{r.action.replaceAll("_", " ")}</span>{r.details && <span className="text-slate-500"> — {r.details}</span>}<div className="text-xs text-slate-400">{fmtTime(r.at)}</div></li>)}</ul> : <Empty title="No activity yet" />}</Modal>}
    </>
  );
}
