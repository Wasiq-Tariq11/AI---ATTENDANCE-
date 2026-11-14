import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { BookOpen, CalendarCheck, Clock, GraduationCap, Percent, UserCheck, UserX, Users } from "lucide-react";
import { ErrorBox, PageHeader, Skeleton, StatCard, fmtTime, useFetch, Empty } from "../../ui";

export default function Dashboard() {
  const { data: d, loading, error, reload } = useFetch("/api/admin/stats");
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (loading) return <><PageHeader title="Dashboard" /><div className="grid grid-cols-2 gap-4 lg:grid-cols-4">{[...Array(8)].map((_, i) => <Skeleton key={i} className="h-28" />)}</div></>;
  const tick = { fontSize: 12, fill: "#64748b" };
  return (
    <>
      <PageHeader title="Dashboard" subtitle="Institution-wide attendance at a glance" />
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard icon={GraduationCap} label="Students" value={d.students} tone="indigo" />
        <StatCard icon={Users} label="Teachers" value={d.teachers} tone="sky" />
        <StatCard icon={BookOpen} label="Classes" value={d.classes} hint={`${d.subjects} subjects`} tone="violet" />
        <StatCard icon={Percent} label="Overall attendance" value={`${d.overall_percentage}%`} tone="amber" />
        <StatCard icon={UserCheck} label="Present today" value={d.today.present} tone="green" />
        <StatCard icon={UserX} label="Absent today" value={d.today.absent} tone="red" />
        <StatCard icon={CalendarCheck} label="Today's rate" value={d.today.present + d.today.absent ? `${Math.round((100 * d.today.present) / (d.today.present + d.today.absent))}%` : "—"} tone="green" />
        <StatCard icon={Clock} label="Staff checked in" value={`${d.staff_in_today}/${d.teachers}`} hint="Teachers today" tone="sky" />
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-5">
        <div className="card p-5 lg:col-span-3">
          <h2 className="mb-4 font-semibold text-slate-900">Last 14 days</h2>
          <div className="h-64"><ResponsiveContainer>
            <AreaChart data={d.trend} margin={{ left: -20, right: 8 }}>
              <defs><linearGradient id="g1" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#6366f1" stopOpacity={0.35} /><stop offset="95%" stopColor="#6366f1" stopOpacity={0} /></linearGradient></defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} /><XAxis dataKey="date" tick={tick} tickLine={false} axisLine={false} interval="preserveStartEnd" /><YAxis tick={tick} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0" }} />
              <Area type="monotone" dataKey="present" name="Present" stroke="#6366f1" strokeWidth={2.5} fill="url(#g1)" />
              <Area type="monotone" dataKey="absent" name="Absent" stroke="#f43f5e" strokeWidth={2} fill="none" />
            </AreaChart></ResponsiveContainer></div>
        </div>
        <div className="card p-5 lg:col-span-2">
          <h2 className="mb-4 font-semibold text-slate-900">Attendance % by class</h2>
          {d.per_class.length ? <div className="h-64"><ResponsiveContainer>
            <BarChart data={d.per_class} margin={{ left: -20, right: 8 }}><CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis dataKey="name" tick={tick} tickLine={false} axisLine={false} /><YAxis domain={[0, 100]} tick={tick} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0" }} /><Bar dataKey="percentage" name="Attendance %" fill="#8b5cf6" radius={[8, 8, 0, 0]} /></BarChart></ResponsiveContainer></div>
            : <Empty title="No attendance yet" text="Charts appear after a teacher closes a session." />}
        </div>
      </div>
      <div className="card mt-6 p-5">
        <h2 className="mb-3 font-semibold text-slate-900">Recent activity</h2>
        {d.recent.length ? <ul className="divide-y divide-slate-100">{d.recent.map((r, i) => (
          <li key={i} className="flex flex-col gap-0.5 py-2.5 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-sm text-slate-700"><b className="font-semibold">{r.actor || "System"}</b> · {r.action.replaceAll("_", " ")}{r.details ? <span className="text-slate-500"> — {r.details}</span> : null}</span>
            <span className="text-xs text-slate-400">{fmtTime(r.at)}</span></li>))}</ul> : <Empty title="No activity yet" />}
      </div>
    </>
  );
}
