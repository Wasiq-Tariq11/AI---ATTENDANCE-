import { useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { Eye, EyeOff, ScanFace } from "lucide-react";
import { useAuth } from "../../auth";
import { Button, Field } from "../../ui";

const COPY = {
  admin: { title: "Administrator sign in", id: "Username", hint: "The admin username you created" },
  teacher: { title: "Teacher sign in", id: "Employee ID", hint: "Given to you by the administrator" },
  student: { title: "Student sign in", id: "Roll number", hint: "Your institutional roll number" },
};

export default function Login() {
  const { role } = useParams(); const { login, user, ready } = useAuth(); const nav = useNavigate();
  const [f, setF] = useState({ username: "", password: "" }); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false); const [show, setShow] = useState(false);
  const c = COPY[role];
  if (!c) return <Navigate to="/" replace />;
  if (ready && user) return <Navigate to={`/${user.role}`} replace />;

  const submit = async (e) => {
    e.preventDefault(); setErr(""); setBusy(true);
    try { const u = await login(role, f.username.trim(), f.password); nav(`/${u.role}`, { replace: true }); }
    catch (x) { setErr(x.message); } finally { setBusy(false); }
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="relative hidden overflow-hidden bg-gradient-to-br from-indigo-600 via-indigo-700 to-violet-800 p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="absolute -right-20 -top-20 h-72 w-72 rounded-full bg-white/10 blur-2xl" /><div className="absolute -bottom-24 -left-10 h-80 w-80 rounded-full bg-violet-400/20 blur-3xl" />
        <div className="relative flex items-center gap-2.5 text-lg font-bold"><ScanFace className="h-6 w-6" />AI Attendance</div>
        <div className="relative"><h2 className="text-4xl font-bold leading-tight">Attendance, without the roll call.</h2>
          <p className="mt-4 max-w-md text-indigo-100">Face recognition marks students present in seconds. Every change is recorded in an audit trail.</p></div>
        <p className="relative text-sm text-indigo-200">Biometric data is encrypted and never leaves the server.</p>
      </div>
      <div className="flex items-center justify-center bg-white px-5 py-10 sm:px-10">
        <form onSubmit={submit} className="w-full max-w-sm animate-rise space-y-5">
          <div className="lg:hidden flex items-center gap-2 font-bold text-slate-900"><ScanFace className="h-5 w-5 text-indigo-600" />AI Attendance</div>
          <div><h1 className="text-2xl font-bold text-slate-900">{c.title}</h1><p className="mt-1 text-sm text-slate-500">Welcome back. Enter your details to continue.</p></div>
          {err && <div role="alert" className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{err}</div>}
          <Field label={c.id} hint={c.hint}><input className="input" autoFocus required autoComplete="username" value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} /></Field>
          <Field label="Password">
            <div className="relative"><input className="input pr-11" type={show ? "text" : "password"} required autoComplete="current-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
              <button type="button" className="icon-btn absolute right-1.5 top-1/2 -translate-y-1/2" onClick={() => setShow(!show)} aria-label={show ? "Hide password" : "Show password"}>{show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button></div>
          </Field>
          <Button type="submit" loading={busy} className="w-full">Sign in</Button>
          <p className="text-center text-sm text-slate-500">Not a {role}? <Link to="/" className="font-semibold text-indigo-600 hover:underline">Choose another portal</Link></p>
        </form>
      </div>
    </div>
  );
}
