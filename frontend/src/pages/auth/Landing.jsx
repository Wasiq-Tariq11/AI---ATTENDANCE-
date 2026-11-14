import { Link } from "react-router-dom";
import { ArrowRight, GraduationCap, ScanFace, ShieldCheck, UserRound } from "lucide-react";

const roles = [
  { id: "admin", title: "Administrator", text: "Manage students, teachers, classes, reports and audit logs.", icon: ShieldCheck, c: "from-indigo-500 to-violet-600" },
  { id: "teacher", title: "Teacher", text: "Start sessions and mark attendance with face recognition.", icon: UserRound, c: "from-sky-500 to-indigo-600" },
  { id: "student", title: "Student", text: "Check your attendance, subject-wise stats and reports.", icon: GraduationCap, c: "from-emerald-500 to-teal-600" },
];

export default function Landing() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-slate-50 via-indigo-50/60 to-violet-50">
      <div className="pointer-events-none absolute -left-24 -top-24 h-96 w-96 rounded-full bg-indigo-300/30 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -right-24 h-96 w-96 rounded-full bg-violet-300/30 blur-3xl" />
      <div className="relative mx-auto flex min-h-screen max-w-5xl flex-col justify-center px-5 py-12">
        <div className="mb-10 text-center">
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-600 text-white shadow-lg shadow-indigo-600/30"><ScanFace className="h-7 w-7" /></div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-5xl">AI Attendance Management</h1>
          <p className="mx-auto mt-3 max-w-xl text-slate-600">Fast, secure, face-recognition attendance for your college. Choose your portal to sign in.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          {roles.map((r) => (
            <Link key={r.id} to={`/login/${r.id}`} className="card group animate-rise p-6 transition hover:-translate-y-1 hover:shadow-xl hover:shadow-indigo-200/50">
              <div className={`mb-4 inline-flex rounded-2xl bg-gradient-to-br ${r.c} p-3 text-white shadow-md`}><r.icon className="h-6 w-6" /></div>
              <h2 className="text-lg font-semibold text-slate-900">{r.title}</h2>
              <p className="mt-1 text-sm text-slate-500">{r.text}</p>
              <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-indigo-600">Sign in <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" /></span>
            </Link>))}
        </div>
      </div>
    </div>
  );
}
