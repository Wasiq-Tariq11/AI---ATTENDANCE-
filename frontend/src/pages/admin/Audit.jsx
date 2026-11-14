import { useState } from "react";
import { Badge, Empty, ErrorBox, PageHeader, Table, fmtTime, qs, useFetch } from "../../ui";

const tone = (a) => a.includes("fail") || a.includes("delet") ? "red" : a.includes("correct") || a.includes("reset") || a.includes("face") ? "amber" : a.includes("login") ? "slate" : "indigo";
export default function Audit() {
  const [action, setAction] = useState("");
  const { data, loading, error, reload } = useFetch("/api/admin/audit" + qs({ action }));
  const cols = [{ label: "When", nowrap: true, render: (r) => fmtTime(r.at) }, { label: "Who", render: (r) => r.actor || <span className="text-slate-400">Unknown</span> },
    { label: "Action", render: (r) => <Badge tone={tone(r.action)}>{r.action.replaceAll("_", " ")}</Badge> }, { label: "Details", hide: "md", render: (r) => <span className="text-slate-600">{r.details || "—"}</span> }];
  return (<>
    <PageHeader title="Audit log" subtitle="Every sign-in, correction and administrative change" />
    <div className="card overflow-hidden">
      <div className="border-b border-slate-100 p-4"><select className="input sm:w-64" value={action} onChange={(e) => setAction(e.target.value)} aria-label="Filter by action">
        <option value="">All actions</option>{["login_success", "login_failed", "attendance_corrected", "attendance_manual", "face_enrolled", "student_created", "teacher_created", "password_reset", "session_started", "session_closed"].map((a) => <option key={a} value={a}>{a.replaceAll("_", " ")}</option>)}</select></div>
      {error ? <ErrorBox message={error} onRetry={reload} /> : <Table cols={cols} rows={data} loading={loading} empty={<Empty title="No log entries" />} />}</div>
  </>);
}
