import { AlertTriangle, CheckCircle2, Download, FileText, Hash, School, XCircle } from "lucide-react";
import { download } from "../../api/client";
import { Button, Empty, ErrorBox, PageHeader, Progress, Ring, Skeleton, StatCard, useFetch, useToast } from "../../ui";

export default function Dashboard() {
  const toast = useToast(); const { data: d, loading, error, reload } = useFetch("/api/student/summary");
  const exp = (fmt) => download(`/api/student/report?fmt=${fmt}`, `my-attendance.${fmt}`).catch((x) => toast("error", x.message));
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (loading) return <><PageHeader title="My attendance" /><Skeleton className="h-56" /></>;
  const o = d.overall;
  return (<>
    <PageHeader title={`Hi, ${d.profile.name.split(" ")[0]}`} subtitle="Your attendance overview" actions={<><Button variant="ghost" icon={Download} onClick={() => exp("csv")}>CSV</Button><Button variant="ghost" icon={FileText} onClick={() => exp("pdf")}>PDF</Button></>} />
    {o.total > 0 && o.percentage < 75 && <div className="mb-5 flex items-start gap-3 rounded-2xl bg-amber-50 p-4 text-sm text-amber-900"><AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />Your overall attendance is below 75%. Please speak to your teacher or department if you need support.</div>}
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="card flex flex-col items-center gap-5 p-6 sm:flex-row lg:col-span-2">
        <Ring value={o.percentage} size={150} />
        <div className="grid w-full flex-1 grid-cols-2 gap-3"><StatCard icon={CheckCircle2} label="Present" value={o.present} tone="green" /><StatCard icon={XCircle} label="Absent" value={o.absent} tone="red" /></div>
      </div>
      <div className="card p-6"><h2 className="font-semibold text-slate-900">{d.profile.name}</h2>
        <dl className="mt-4 space-y-3 text-sm"><div className="flex items-center gap-3 text-slate-600"><Hash className="h-4 w-4 text-slate-400" />Roll number <b className="ml-auto text-slate-900">{d.profile.roll}</b></div>
          <div className="flex items-center gap-3 text-slate-600"><School className="h-4 w-4 text-slate-400" />Class <b className="ml-auto text-slate-900">{d.profile.class_name || "—"}</b></div></dl></div>
    </div>
    <div className="card mt-6 p-6"><h2 className="mb-4 font-semibold text-slate-900">Subject-wise attendance</h2>
      {d.subjects.length ? <div className="grid gap-5 sm:grid-cols-2">{d.subjects.map((s) => (
        <div key={s.name}><div className="mb-1.5 flex items-baseline justify-between"><p className="text-sm font-medium text-slate-800">{s.name}</p><p className={`text-sm font-bold ${s.percentage < 60 ? "text-rose-600" : s.percentage < 75 ? "text-amber-600" : "text-emerald-600"}`}>{s.percentage}%</p></div>
          <Progress value={s.percentage} /><p className="mt-1 text-xs text-slate-500">{s.present} present · {s.absent} absent · {s.total} classes</p></div>))}</div>
        : <Empty title="No attendance recorded yet" text="Your attendance will appear here after your first class." />}</div>
  </>);
}
