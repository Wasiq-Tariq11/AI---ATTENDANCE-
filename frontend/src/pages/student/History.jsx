import { useMemo, useState } from "react";
import { Badge, Empty, ErrorBox, PageHeader, StatusBadge, Table, fmtDate, useFetch } from "../../ui";

export default function History() {
  const { data, loading, error, reload } = useFetch("/api/student/history"); const [sub, setSub] = useState(""); const [st, setSt] = useState("");
  const subjects = useMemo(() => [...new Set((data || []).map((r) => r.subject_name))].sort(), [data]);
  const rows = (data || []).filter((r) => (!sub || r.subject_name === sub) && (!st || r.status === st));
  const cols = [{ label: "Date", nowrap: true, render: (r) => fmtDate(r.date) }, { label: "Subject", render: (r) => <span className="font-medium text-slate-900">{r.subject_name}</span> },
    { label: "Class", key: "class_name", hide: "md" }, { label: "Teacher", key: "teacher_name", hide: "sm" }, { label: "Status", render: (r) => <StatusBadge status={r.status} /> },
    { label: "Marked by", hide: "md", render: (r) => <Badge tone={r.method === "face" ? "indigo" : "slate"}>{r.method === "face" ? "Face recognition" : "Teacher"}</Badge> }];
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  return (<>
    <PageHeader title="Attendance history" subtitle="Every class you have attended or missed" />
    <div className="card overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row">
        <select className="input sm:w-56" value={sub} onChange={(e) => setSub(e.target.value)} aria-label="Subject"><option value="">All subjects</option>{subjects.map((s) => <option key={s}>{s}</option>)}</select>
        <select className="input sm:w-44" value={st} onChange={(e) => setSt(e.target.value)} aria-label="Status"><option value="">Present & absent</option><option value="present">Present</option><option value="absent">Absent</option></select></div>
      <Table cols={cols} rows={rows} loading={loading} empty={<Empty title="No records" text="Nothing matches these filters yet." />} />
    </div>
  </>);
}
