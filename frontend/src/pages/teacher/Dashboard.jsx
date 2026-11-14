import { Link } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { BookOpen, Clock, ScanFace, UserCheck, UserX, Users } from "lucide-react";
import { Badge, Empty, ErrorBox, PageHeader, Skeleton, StatCard, Table, fmtClock, fmtDate, useFetch } from "../../ui";

export default function Dashboard() {
  const { data: d, loading, error, reload } = useFetch("/api/teacher/dashboard");
  const pres = useFetch("/api/teacher/presence/today");
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (loading) return <><PageHeader title="Dashboard" /><div className="grid grid-cols-2 gap-4 lg:grid-cols-4">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-28" />)}</div></>;
  const cols = [{ label: "Date", nowrap: true, render: (r) => fmtDate(r.date) }, { label: "Class", key: "class_name" }, { label: "Subject", key: "subject_name", hide: "sm" },
    { label: "Present", render: (r) => <span className="font-medium text-emerald-600">{r.present}</span> }, { label: "Absent", hide: "sm", render: (r) => <span className="font-medium text-rose-600">{r.absent}</span> },
    { label: "Status", render: (r) => r.status === "open" ? <Badge tone="amber">Open</Badge> : <Badge>Closed</Badge> }];
  return (<>
    <PageHeader title={`Hello, ${d.profile.name.split(" ").slice(-1)[0]}`} subtitle={d.profile.department || "Teacher dashboard"} actions={<Link to="/teacher/attendance" className="btn btn-primary"><ScanFace className="h-4 w-4" />Take attendance</Link>} />
    {pres.data && (() => { const r = pres.data.record; const tone = !r ? "bg-amber-50 text-amber-900" : r.check_out_at ? "bg-emerald-50 text-emerald-800" : "bg-indigo-50 text-indigo-900";
      return <Link to="/teacher/presence" className={`mb-5 flex items-center gap-3 rounded-2xl p-4 text-sm transition hover:opacity-90 ${tone}`}><Clock className="h-5 w-5 shrink-0" />
        <span className="flex-1">{!r ? "You have not checked in today. Tap to check in." : r.check_out_at ? `Day complete: ${fmtClock(r.check_in_at)} to ${fmtClock(r.check_out_at)} (${r.hours} h)` : `Checked in at ${fmtClock(r.check_in_at)}. Tap to check out when you leave.`}</span></Link>; })()}
    <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
      <StatCard icon={BookOpen} label="Assigned classes" value={new Set(d.assignments.map((a) => a.class_id)).size} tone="indigo" />
      <StatCard icon={Users} label="Assigned subjects" value={new Set(d.assignments.map((a) => a.subject_id)).size} tone="violet" />
      <StatCard icon={UserCheck} label="Present today" value={d.today.present} tone="green" /><StatCard icon={UserX} label="Absent today" value={d.today.absent} tone="red" /></div>
    <div className="mt-6 grid gap-6 lg:grid-cols-5">
      <div className="card p-5 lg:col-span-2"><h2 className="mb-3 font-semibold text-slate-900">My classes</h2>
        {d.assignments.length ? <ul className="space-y-2">{d.assignments.map((a) => (
          <li key={a.id}><Link to={`/teacher/attendance?class=${a.class_id}&subject=${a.subject_id}`} className="flex items-center justify-between rounded-xl border border-slate-200 p-3 transition hover:border-indigo-300 hover:bg-indigo-50/40">
            <div><p className="text-sm font-semibold text-slate-900">{a.subject_name}</p><p className="text-xs text-slate-500">{a.class_name} · {a.students} students</p></div><ScanFace className="h-4 w-4 text-indigo-500" /></Link></li>))}</ul>
          : <Empty title="No classes assigned" text="Ask the administrator to assign you to a class and subject." />}</div>
      <div className="card p-5 lg:col-span-3"><h2 className="mb-3 font-semibold text-slate-900">Attendance % by class</h2>
        {d.class_stats.length ? <div className="h-56"><ResponsiveContainer><BarChart data={d.class_stats} margin={{ left: -20, right: 8 }}><CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
          <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#64748b" }} tickLine={false} axisLine={false} /><YAxis domain={[0, 100]} tick={{ fontSize: 12, fill: "#64748b" }} tickLine={false} axisLine={false} />
          <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0" }} /><Bar dataKey="percentage" name="Attendance %" fill="#6366f1" radius={[8, 8, 0, 0]} /></BarChart></ResponsiveContainer></div>
          : <Empty title="No data yet" text="Close a session to see statistics." />}</div>
    </div>
    <div className="card mt-6 overflow-hidden"><h2 className="border-b border-slate-100 p-5 font-semibold text-slate-900">Recent sessions</h2><Table cols={cols} rows={d.recent_sessions} empty={<Empty title="No sessions yet" text="Start an attendance session to see it here." />} /></div>
  </>);
}
