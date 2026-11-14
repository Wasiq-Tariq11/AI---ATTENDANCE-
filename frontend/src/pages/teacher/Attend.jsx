import { useCallback, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Flag, ScanFace, Search } from "lucide-react";
import { api } from "../../api/client";
import FaceCamera from "../../face/FaceCamera";
import { Button, Empty, ErrorBox, Field, Modal, PageHeader, Skeleton, Spinner, useConfirm, useFetch, useToast } from "../../ui";
import { ManualMarkModal, RosterList } from "./RosterParts";

function Session({ sid, onEnd }) {
  const toast = useToast(); const confirm = useConfirm(); const { data, loading, error, reload } = useFetch(`/api/teacher/sessions/${sid}`);
  const [mark, setMark] = useState(null); const [q, setQ] = useState(""); const [summary, setSummary] = useState(null); const [closing, setClosing] = useState(false);

  const onFace = useCallback(async (embedding) => {
    try {
      const r = await api(`/api/teacher/sessions/${sid}/face-match`, { method: "POST", body: { embedding } }); reload();
      if (r.result === "marked") return { tone: "success", text: `✓ ${r.student.name} (${r.student.roll}) · ${Math.round(r.confidence * 100)}% — marked present` };
      if (r.result === "already") return { tone: "warn", text: `${r.student.name} is already marked present` };
      if (r.result === "ambiguous") return { tone: "warn", text: "Could not tell students apart. Use manual marking." };
      return { tone: "error", text: "Face not recognised. Attendance NOT marked." };
    } catch (x) { return { tone: "error", text: x.message }; }
  }, [sid, reload]);

  const end = async () => {
    if (!(await confirm({ title: "End this session?", message: `Students not yet marked (${data.counts.unmarked}) will be recorded as absent. You can still correct records later.`, confirmText: "End session", danger: true }))) return;
    setClosing(true);
    try { setSummary(await api(`/api/teacher/sessions/${sid}/close`, { method: "POST" })); } catch (x) { toast("error", x.message); } finally { setClosing(false); }
  };
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (!data) return <Skeleton className="h-96" />;
  const { session: s, counts: c } = data; const list = data.students.filter((x) => !q || (x.name + x.roll).toLowerCase().includes(q.toLowerCase()));
  return (<>
    <PageHeader title={`${s.subject_name} · ${s.class_name}`} subtitle="Attendance session in progress" actions={<Button variant="danger" icon={Flag} loading={closing} onClick={end}>End session</Button>} />
    <div className="grid gap-6 lg:grid-cols-5">
      <div className="lg:col-span-3"><div className="card p-4"><FaceCamera mode="attend" onFace={onFace} active={!mark && !summary} />
        <p className="mt-3 text-xs text-slate-500">One student at a time. Each student is asked to turn their head briefly as a liveness check. Unrecognised faces are never marked. Use the pencil icon for manual attendance.</p></div></div>
      <div className="lg:col-span-2"><div className="card overflow-hidden">
        <div className="grid grid-cols-3 divide-x divide-slate-100 border-b border-slate-100 text-center">
          {[["Present", c.present, "text-emerald-600"], ["Absent", c.absent, "text-rose-600"], ["Not marked", c.unmarked, "text-slate-700"]].map(([l, v, t]) => <div key={l} className="py-3"><p className={`text-xl font-bold ${t}`}>{v}</p><p className="text-xs text-slate-500">{l}</p></div>)}</div>
        <div className="relative border-b border-slate-100 p-3"><Search className="absolute left-6 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input className="input pl-9" placeholder="Search students" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search students" /></div>
        <div className="max-h-[28rem] overflow-y-auto"><RosterList students={list} onMark={setMark} /></div></div></div>
    </div>
    {mark && <ManualMarkModal sid={sid} student={mark} onClose={() => setMark(null)} onDone={() => { setMark(null); reload(); }} />}
    {summary && <Modal title="Session complete" onClose={onEnd} size="sm" footer={<Button onClick={onEnd}>Done</Button>}>
      <div className="grid grid-cols-3 gap-3 text-center">{[["Present", summary.present, "text-emerald-600"], ["Absent", summary.absent, "text-rose-600"], ["Total", summary.total, "text-slate-800"]].map(([l, v, t]) => <div key={l} className="rounded-xl bg-slate-50 p-3"><p className={`text-2xl font-bold ${t}`}>{v}</p><p className="text-xs text-slate-500">{l}</p></div>)}</div></Modal>}
  </>);
}

export default function Attend() {
  const toast = useToast(); const [sp] = useSearchParams(); const { data, loading, error, reload } = useFetch("/api/teacher/dashboard");
  const [sel, setSel] = useState(sp.get("class") && sp.get("subject") ? `${sp.get("class")}:${sp.get("subject")}` : ""); const [sid, setSid] = useState(null); const [busy, setBusy] = useState(false);
  const [verify, setVerify] = useState(false); const [manual, setManual] = useState(false); const [reason, setReason] = useState("");

  const begin = useCallback((extra = {}) => {
    const [class_id, subject_id] = sel.split(":").map(Number);
    return api("/api/teacher/sessions", { method: "POST", body: { class_id, subject_id, ...extra } });
  }, [sel]);
  const onFace = useCallback(async (embedding) => {
    try {
      const r = await begin({ embedding });
      if (r.result === "started") { setTimeout(() => { setVerify(false); setSid(r.id); }, 1200); return { tone: "success", text: "✓ Identity verified. Starting class…" }; }
      return { tone: "error", text: { not_registered: "Your face is not registered. Use the manual option or ask the administrator.", mismatch: "This face does not match your account. The attempt has been logged.", invalid: "Could not read the face. Try again." }[r.reason] || "Verification failed" };
    } catch (x) { return { tone: "error", text: x.message }; }
  }, [begin]);

  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (loading) return <div className="flex justify-center py-20"><Spinner className="h-8 w-8" /></div>;
  if (sid) return <Session sid={sid} onEnd={() => setSid(null)} />;

  const start = async (e) => { e.preventDefault(); setBusy(true);
    try { const r = await begin(); if (r.result === "started") setSid(r.id); else if (r.result === "verification_required") setVerify(true); }
    catch (x) { toast("error", x.message); } finally { setBusy(false); } };
  const startManual = async (e) => { e.preventDefault(); setBusy(true);
    try { const r = await begin({ manual_reason: reason }); if (r.result === "started") { setManual(false); setVerify(false); setSid(r.id); } }
    catch (x) { toast("error", x.message); } finally { setBusy(false); } };

  return (<>
    <PageHeader title="Take attendance" subtitle="Verify yourself, then open the class camera" />
    {data.assignments.length ? (
      <form onSubmit={start} className="card mx-auto max-w-lg space-y-5 p-6">
        <Field label="Class and subject"><select className="input" required value={sel} onChange={(e) => setSel(e.target.value)}><option value="">Select…</option>
          {data.assignments.map((a) => <option key={a.id} value={`${a.class_id}:${a.subject_id}`}>{a.class_name} — {a.subject_name}</option>)}</select></Field>
        <Button type="submit" icon={ScanFace} loading={busy} className="w-full">Verify my face &amp; start</Button>
        <p className="text-xs text-slate-500">Starting a class records that <b>you</b> were present. If you already started this class today, it resumes without another check.</p>
      </form>) : <div className="card"><Empty title="No classes assigned" text="Ask the administrator to assign you to a class and subject." /></div>}
    {verify && <Modal title="Verify it's you" onClose={() => setVerify(false)} size="md">
      <FaceCamera mode="attend" onFace={onFace} active={!manual} />
      <p className="mt-3 text-xs text-slate-500">Look at the camera, then slowly turn your head to one side and back.</p>
      <button type="button" className="mt-3 text-sm font-semibold text-indigo-600 hover:underline" onClick={() => setManual(true)}>Camera not working? Start with a reason</button></Modal>}
    {manual && <Modal title="Start without face verification" onClose={() => setManual(false)} size="sm" footer={<><Button variant="ghost" onClick={() => setManual(false)}>Cancel</Button><Button form="ms" type="submit" loading={busy}>Start class</Button></>}>
      <form id="ms" onSubmit={startManual} className="space-y-3"><div className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">This is flagged for the administrator and written to the audit log.</div>
        <Field label="Reason (required)"><textarea className="input" rows={3} required minLength={5} value={reason} onChange={(e) => setReason(e.target.value)} /></Field></form></Modal>}
  </>);
}
