import { useState } from "react";
import { Check, Pencil, Plus, Trash2 } from "lucide-react";
import { api } from "../../api/client";
import { Badge, Button, Empty, ErrorBox, Field, Modal, PageHeader, Table, Tabs, fmtDate, useConfirm, useFetch, useToast } from "../../ui";

function useCrud(path) {
  const toast = useToast(); const confirm = useConfirm(); const f = useFetch(path);
  const run = async (fn, ok) => { try { await fn(); if (ok) toast("success", ok); f.reload(); return true; } catch (x) { toast("error", x.message); return false; } };
  const del = async (url, what) => (await confirm({ title: `Delete ${what}?`, message: "This cannot be undone. If it is in use, you will be asked to deactivate it instead.", confirmText: "Delete", danger: true })) && run(() => api(url, { method: "DELETE" }), "Deleted");
  return { ...f, run, del };
}

function ClassesTab() {
  const c = useCrud("/api/admin/classes"); const { data: subs } = useFetch("/api/admin/subjects"); const { data: sessions } = useFetch("/api/admin/academic-sessions");
  const [form, setForm] = useState(null); const [pick, setPick] = useState(null); const [busy, setBusy] = useState(false);
  const save = async (e) => { e.preventDefault(); setBusy(true);
    const body = { name: form.name, academic_session_id: form.academic_session_id ? Number(form.academic_session_id) : null, is_active: form.is_active ?? true };
    if (await c.run(() => api(form.id ? `/api/admin/classes/${form.id}` : "/api/admin/classes", { method: form.id ? "PUT" : "POST", body }), "Saved")) setForm(null); setBusy(false); };
  const saveSubs = async () => { setBusy(true); if (await c.run(() => api(`/api/admin/classes/${pick.id}/subjects`, { method: "PUT", body: { subject_ids: pick.ids } }), "Subjects updated")) setPick(null); setBusy(false); };
  const cols = [
    { label: "Class", render: (r) => <span className="font-medium text-slate-900">{r.name}</span> }, { label: "Students", key: "students", hide: "sm" },
    { label: "Subjects", render: (r) => r.subjects.length ? <div className="flex flex-wrap gap-1">{r.subjects.map((s) => <Badge key={s.id} tone="indigo">{s.name}</Badge>)}</div> : <span className="text-slate-400">None</span> },
    { label: "Status", hide: "md", render: (r) => r.is_active ? <Badge tone="green">Active</Badge> : <Badge>Inactive</Badge> },
    { label: "", right: true, render: (r) => <div className="flex justify-end gap-1"><Button variant="soft" className="btn-sm" onClick={() => setPick({ id: r.id, name: r.name, ids: r.subjects.map((s) => s.id) })}>Subjects</Button>
      <button className="icon-btn" title="Edit" onClick={() => setForm(r)}><Pencil className="h-4 w-4" /></button><button className="icon-btn hover:text-rose-600" title="Delete" onClick={() => c.del(`/api/admin/classes/${r.id}`, "class")}><Trash2 className="h-4 w-4" /></button></div> },
  ];
  return (<>
    <div className="mb-3 flex justify-end"><Button icon={Plus} onClick={() => setForm({ name: "" })}>Add class</Button></div>
    <div className="card overflow-hidden">{c.error ? <ErrorBox message={c.error} onRetry={c.reload} /> : <Table cols={cols} rows={c.data} loading={c.loading} empty={<Empty title="No classes yet" />} />}</div>
    {form && <Modal title={form.id ? "Edit class" : "Add class"} onClose={() => setForm(null)} footer={<><Button variant="ghost" onClick={() => setForm(null)}>Cancel</Button><Button form="cf" type="submit" loading={busy}>Save</Button></>}>
      <form id="cf" onSubmit={save} className="space-y-4"><Field label="Class name"><input className="input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
        <Field label="Academic session"><select className="input" value={form.academic_session_id || ""} onChange={(e) => setForm({ ...form, academic_session_id: e.target.value })}><option value="">None</option>{sessions?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-indigo-600" checked={form.is_active ?? true} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />Active</label></form></Modal>}
    {pick && <Modal title={`Subjects · ${pick.name}`} onClose={() => setPick(null)} footer={<><Button variant="ghost" onClick={() => setPick(null)}>Cancel</Button><Button onClick={saveSubs} loading={busy}>Save</Button></>}>
      {subs?.length ? <div className="space-y-2">{subs.map((s) => <label key={s.id} className="flex items-center gap-3 rounded-xl border border-slate-200 p-3 text-sm"><input type="checkbox" className="h-4 w-4 accent-indigo-600" checked={pick.ids.includes(s.id)} onChange={(e) => setPick({ ...pick, ids: e.target.checked ? [...pick.ids, s.id] : pick.ids.filter((i) => i !== s.id) })} /><span className="font-medium">{s.code}</span> {s.name}</label>)}</div> : <Empty title="Create subjects first" />}</Modal>}
  </>);
}

function SubjectsTab() {
  const c = useCrud("/api/admin/subjects"); const [form, setForm] = useState(null); const [busy, setBusy] = useState(false);
  const save = async (e) => { e.preventDefault(); setBusy(true); if (await c.run(() => api(form.id ? `/api/admin/subjects/${form.id}` : "/api/admin/subjects", { method: form.id ? "PUT" : "POST", body: { code: form.code, name: form.name, is_active: form.is_active ?? true } }), "Saved")) setForm(null); setBusy(false); };
  const cols = [{ label: "Code", key: "code", nowrap: true }, { label: "Subject", render: (r) => <span className="font-medium text-slate-900">{r.name}</span> },
    { label: "Status", hide: "sm", render: (r) => r.is_active ? <Badge tone="green">Active</Badge> : <Badge>Inactive</Badge> },
    { label: "", right: true, render: (r) => <div className="flex justify-end"><button className="icon-btn" title="Edit" onClick={() => setForm(r)}><Pencil className="h-4 w-4" /></button><button className="icon-btn hover:text-rose-600" title="Delete" onClick={() => c.del(`/api/admin/subjects/${r.id}`, "subject")}><Trash2 className="h-4 w-4" /></button></div> }];
  return (<>
    <div className="mb-3 flex justify-end"><Button icon={Plus} onClick={() => setForm({ code: "", name: "" })}>Add subject</Button></div>
    <div className="card overflow-hidden">{c.error ? <ErrorBox message={c.error} onRetry={c.reload} /> : <Table cols={cols} rows={c.data} loading={c.loading} empty={<Empty title="No subjects yet" />} />}</div>
    {form && <Modal title={form.id ? "Edit subject" : "Add subject"} onClose={() => setForm(null)} footer={<><Button variant="ghost" onClick={() => setForm(null)}>Cancel</Button><Button form="sbf" type="submit" loading={busy}>Save</Button></>}>
      <form id="sbf" onSubmit={save} className="space-y-4"><Field label="Subject code"><input className="input" required value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} /></Field>
        <Field label="Subject name"><input className="input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-indigo-600" checked={form.is_active ?? true} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />Active</label></form></Modal>}
  </>);
}

function AssignmentsTab() {
  const c = useCrud("/api/admin/assignments"); const { data: teachers } = useFetch("/api/admin/teachers"); const { data: classes } = useFetch("/api/admin/classes");
  const [f, setF] = useState({ teacher_id: "", class_id: "", subject_id: "" }); const [busy, setBusy] = useState(false);
  const subs = classes?.find((x) => String(x.id) === f.class_id)?.subjects || [];
  const add = async (e) => { e.preventDefault(); setBusy(true); const ok = await c.run(() => api("/api/admin/assignments", { method: "POST", body: { teacher_id: +f.teacher_id, class_id: +f.class_id, subject_id: +f.subject_id } }), "Teacher assigned"); if (ok) setF({ ...f, subject_id: "" }); setBusy(false); };
  const cols = [{ label: "Teacher", render: (r) => <span className="font-medium text-slate-900">{r.teacher}</span> }, { label: "Class", key: "class_name" }, { label: "Subject", key: "subject_name" },
    { label: "", right: true, render: (r) => <button className="icon-btn hover:text-rose-600" title="Remove" onClick={() => c.del(`/api/admin/assignments/${r.id}`, "assignment")}><Trash2 className="h-4 w-4" /></button> }];
  return (<>
    <form onSubmit={add} className="card mb-4 grid gap-3 p-4 sm:grid-cols-4">
      <select className="input" required value={f.teacher_id} onChange={(e) => setF({ ...f, teacher_id: e.target.value })} aria-label="Teacher"><option value="">Teacher…</option>{teachers?.filter((t) => t.is_active).map((t) => <option key={t.id} value={t.id}>{t.full_name}</option>)}</select>
      <select className="input" required value={f.class_id} onChange={(e) => setF({ ...f, class_id: e.target.value, subject_id: "" })} aria-label="Class"><option value="">Class…</option>{classes?.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
      <select className="input" required value={f.subject_id} onChange={(e) => setF({ ...f, subject_id: e.target.value })} aria-label="Subject"><option value="">Subject…</option>{subs.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
      <Button type="submit" loading={busy} icon={Plus}>Assign</Button>
    </form>
    <div className="card overflow-hidden">{c.error ? <ErrorBox message={c.error} onRetry={c.reload} /> : <Table cols={cols} rows={c.data} loading={c.loading} empty={<Empty title="No assignments yet" text="A subject must be added to the class before a teacher can be assigned to it." />} />}</div>
  </>);
}

function SessionsTab() {
  const c = useCrud("/api/admin/academic-sessions"); const [form, setForm] = useState(null); const [busy, setBusy] = useState(false);
  const save = async (e) => { e.preventDefault(); setBusy(true); if (await c.run(() => api("/api/admin/academic-sessions", { method: "POST", body: form }), "Session created")) setForm(null); setBusy(false); };
  const cols = [{ label: "Name", render: (r) => <span className="font-medium text-slate-900">{r.name}</span> }, { label: "From", render: (r) => fmtDate(r.start_date) }, { label: "To", render: (r) => fmtDate(r.end_date) },
    { label: "Current", render: (r) => r.is_current ? <Badge tone="green">Current</Badge> : <Button variant="soft" className="btn-sm" icon={Check} onClick={() => c.run(() => api(`/api/admin/academic-sessions/${r.id}/make-current`, { method: "POST" }), "Updated")}>Make current</Button> }];
  return (<>
    <div className="mb-3 flex justify-end"><Button icon={Plus} onClick={() => setForm({ name: "", start_date: "", end_date: "" })}>Add session</Button></div>
    <div className="card overflow-hidden">{c.error ? <ErrorBox message={c.error} onRetry={c.reload} /> : <Table cols={cols} rows={c.data} loading={c.loading} empty={<Empty title="No academic sessions" text="For example: 2026-27" />} />}</div>
    {form && <Modal title="Add academic session" onClose={() => setForm(null)} footer={<><Button variant="ghost" onClick={() => setForm(null)}>Cancel</Button><Button form="asf" type="submit" loading={busy}>Save</Button></>}>
      <form id="asf" onSubmit={save} className="space-y-4"><Field label="Name"><input className="input" required placeholder="2026-27" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
        <div className="grid grid-cols-2 gap-3"><Field label="Start date"><input className="input" type="date" required value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} /></Field>
          <Field label="End date"><input className="input" type="date" required value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} /></Field></div></form></Modal>}
  </>);
}

export default function Academics() {
  const [tab, setTab] = useState("classes");
  return (<>
    <PageHeader title="Academics" subtitle="Classes, subjects, teacher assignments and academic sessions" />
    <Tabs value={tab} onChange={setTab} tabs={[["classes", "Classes"], ["subjects", "Subjects"], ["assign", "Teacher assignments"], ["sessions", "Academic sessions"]]} />
    {tab === "classes" && <ClassesTab />}{tab === "subjects" && <SubjectsTab />}{tab === "assign" && <AssignmentsTab />}{tab === "sessions" && <SessionsTab />}
  </>);
}
