import { useState } from "react";
import { KeyRound } from "lucide-react";
import { api } from "../api/client";
import { useAuth } from "../auth";
import { Badge, Button, Field, PageHeader, useToast } from "../ui";

export default function Account() {
  const { user, refresh } = useAuth(); const toast = useToast();
  const [f, setF] = useState({ current_password: "", new_password: "", again: "" }); const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    if (f.new_password !== f.again) return toast("error", "New passwords do not match");
    setBusy(true);
    try { await api("/api/auth/change-password", { method: "POST", body: { current_password: f.current_password, new_password: f.new_password } });
      toast("success", "Password changed"); setF({ current_password: "", new_password: "", again: "" }); refresh(); }
    catch (x) { toast("error", x.message); } finally { setBusy(false); }
  };
  return (
    <>
      <PageHeader title="Account" subtitle="Your profile and security" />
      <div className="grid gap-6 lg:grid-cols-5">
        <div className="card p-6 lg:col-span-2">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-600 text-xl font-bold text-white">{user.full_name[0]}</div>
          <h2 className="mt-4 text-lg font-semibold text-slate-900">{user.full_name}</h2>
          <p className="text-sm text-slate-500">{user.username}</p><div className="mt-3"><Badge tone="indigo">{user.role}</Badge></div>
        </div>
        <form onSubmit={submit} className="card space-y-4 p-6 lg:col-span-3">
          <h2 className="flex items-center gap-2 font-semibold text-slate-900"><KeyRound className="h-4 w-4 text-indigo-600" />Change password</h2>
          {user.must_change_password && <div className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">You are using a temporary password. Please choose a new one to continue.</div>}
          <Field label="Current password"><input className="input" type="password" autoComplete="current-password" required value={f.current_password} onChange={(e) => setF({ ...f, current_password: e.target.value })} /></Field>
          <Field label="New password" hint="At least 8 characters"><input className="input" type="password" autoComplete="new-password" minLength={8} required value={f.new_password} onChange={(e) => setF({ ...f, new_password: e.target.value })} /></Field>
          <Field label="Repeat new password"><input className="input" type="password" autoComplete="new-password" minLength={8} required value={f.again} onChange={(e) => setF({ ...f, again: e.target.value })} /></Field>
          <Button type="submit" loading={busy}>Update password</Button>
        </form>
      </div>
    </>
  );
}
