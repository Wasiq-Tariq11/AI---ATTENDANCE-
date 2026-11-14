import { useMemo, useState } from "react";
import { Download, Eye, FileText, Search } from "lucide-react";
import { download } from "../../api/client";
import { Badge, Button, Empty, ErrorBox, Modal, PageHeader, Progress, Table, Tabs, fmtDate, qs, useDebounced, useFetch, useToast } from "../../ui";
import { ManualMarkModal, RosterList } from "./RosterParts";

function SessionModal({ sid, onClose }) {
  const { data, reload } = useFetch(`/api/teacher/sessions/${sid}`); const [mark, setMark] = useState(null);
  return (<Modal title={data ? `${data.session.subject_name} · ${fmtDate(data.session.date)}` : "Session"} onClose={onClose} size="md">
    {data && <><p className="mb-2 text-xs text-slate-500">Corrections need a reason and are written to the audit log.</p><div className="-mx-5"><RosterList students={data.students} onMark={setMark} canMark={data.session.status === "closed"} /></div></>}
    {mark && <ManualMarkModal sid={sid} student={mark} onClose={() => setMark(null)} onDone={() => { setMark(null); reload(); }} />}</Modal>);
}

export default function Records() {
  const toast = useToast(); const { data: dash, error } = useFetch("/api/teacher/dashboard");
  const [tab, setTab] = useState("students"); const [classId, setClassId] = useState(""); const [subjectId, setSubjectId] = useState(""); const [q, setQ] = useState(""); const dq = useDebounced(q); const [view, setView] = useState(null);
  const classes = useMemo(() => [...new Map((dash?.assignments || []).map((a) => [a.class_id, a.class_name]))], [dash]);
  const subjects = (dash?.assignments || []).filter((a) => String(a.class_id) === classId);
  const cid = classId || (classes[0]?.[0] ?? ""); 
  const stu = useFetch(tab === "students" && cid ? `/api/teacher/students${qs({ class_id: cid, subject_id: subjectId, q: dq })}` : null);
  const ses = useFetch(tab === "sessions" ? `/api/teacher/sessions${qs({ class_id: classId })}` : null);
  const exp = (fmt) => download(`/api/teacher/report${qs({ class_id: cid, subject_id: subjectId, fmt })}`, `class-attendance.${fmt}`).catch((x) => toast("error", x.message));
  if (error) return <ErrorBox message={error} />;

  const sCols = [{ label: "Roll no", key: "roll", nowrap: true }, { label: "Student", render: (r) => <span className="font-medium text-slate-900">{r.name}</span> },
    { label: "Present", hide: "sm", key: "present" }, { label: "Absent", hide: "sm", key: "absent" },
    { label: "Attendance", render: (r) => r.percentage == null ? <span className="text-slate-400">No data</span> : <div className="flex min-w-28 items-center gap-2"><Progress value={r.percentage} className="flex-1" /><span className={`w-12 text-right text-sm font-semibold ${r.percentage < 60 ? "text-rose-600" : r.percentage < 75 ? "text-amber-600" : "text-slate-700"}`}>{r.percentage}%</span></div> }];
  const hCols = [{ label: "Date", nowrap: true, render: (r) => fmtDate(r.date) }, { label: "Class", key: "class_name" }, { label: "Subject", key: "subject_name", hide: "sm" },
    { label: "Present", render: (r) => <span className="font-medium text-emerald-600">{r.present}</span> }, { label: "Absent", render: (r) => <span className="font-medium text-rose-600">{r.absent}</span> },
    { label: "Status", hide: "sm", render: (r) => r.status === "open" ? <Badge tone="amber">Open</Badge> : <Badge>Closed</Badge> },
    { label: "", right: true, render: (r) => <button className="icon-btn" title="View / correct" onClick={() => setView(r.id)}><Eye className="h-4 w-4" /></button> }];
  return (<>
    <PageHeader title="Records & reports" subtitle="Student percentages, session history and downloads" actions={tab === "students" && cid ? <><Button variant="ghost" icon={Download} onClick={() => exp("csv")}>CSV</Button><Button variant="ghost" icon={FileText} onClick={() => exp("pdf")}>PDF</Button></> : null} />
    <Tabs value={tab} onChange={setTab} tabs={[["students", "Students"], ["sessions", "Session history"]]} />
    <div className="card overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row">
        <select className="input sm:w-48" value={classId || cid} onChange={(e) => { setClassId(e.target.value); setSubjectId(""); }} aria-label="Class">{classes.map(([id, n]) => <option key={id} value={id}>{n}</option>)}</select>
        {tab === "students" && <><select className="input sm:w-48" value={subjectId} onChange={(e) => setSubjectId(e.target.value)} aria-label="Subject"><option value="">All my subjects</option>{subjects.map((a) => <option key={a.id} value={a.subject_id}>{a.subject_name}</option>)}</select>
          <div className="relative flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input className="input pl-9" placeholder="Search by name or roll number" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search" /></div></>}
      </div>
      {tab === "students" ? (stu.error ? <ErrorBox message={stu.error} /> : <Table cols={sCols} rows={stu.data} loading={stu.loading} empty={<Empty title="No students found" />} />)
        : (ses.error ? <ErrorBox message={ses.error} /> : <Table cols={hCols} rows={ses.data} loading={ses.loading} empty={<Empty title="No sessions yet" />} />)}
    </div>
    {view && <SessionModal sid={view} onClose={() => { setView(null); ses.reload(); }} />}
  </>);
}
