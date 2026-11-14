import { useState } from "react";
import { Navigate, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { BookOpen, ClipboardList, Clock, GraduationCap, History, LayoutDashboard, LogOut, Menu, ScanFace, ScrollText, ShieldCheck, UserCircle, Users, X } from "lucide-react";
import { useAuth } from "./auth";
import { cn } from "./ui";

const NAV = {
  admin: [["", "Dashboard", LayoutDashboard], ["students", "Students", GraduationCap], ["teachers", "Teachers", Users], ["academics", "Academics", BookOpen],
    ["attendance", "Attendance", ClipboardList], ["staff", "Staff attendance", Clock], ["audit", "Audit log", ScrollText], ["account", "Account", UserCircle]],
  teacher: [["", "Dashboard", LayoutDashboard], ["presence", "Check in / out", Clock], ["attendance", "Take attendance", ScanFace], ["records", "Records & reports", ClipboardList], ["account", "Account", UserCircle]],
  student: [["", "My attendance", LayoutDashboard], ["history", "History", History], ["account", "Account", UserCircle]],
};

export default function Layout({ role }) {
  const { user, ready, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const loc = useLocation(); const nav = useNavigate();
  if (!ready) return null;
  if (!user || user.role !== role) return <Navigate to={`/login/${role}`} replace />;
  if (user.must_change_password && !loc.pathname.endsWith("/account")) return <Navigate to={`/${role}/account`} replace />;

  const links = NAV[role].map(([to, label, Icon]) => (
    <NavLink key={to} to={`/${role}${to ? "/" + to : ""}`} end={to === ""} onClick={() => setOpen(false)}
      className={({ isActive }) => cn("flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition", isActive ? "bg-indigo-50 text-indigo-700" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900")}>
      <Icon className="h-[18px] w-[18px]" />{label}</NavLink>));

  const side = (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2.5 px-5 py-5">
        <div className="rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 p-2 text-white shadow-md shadow-indigo-600/30"><ScanFace className="h-5 w-5" /></div>
        <div><p className="text-sm font-bold leading-tight text-slate-900">AI Attendance</p><p className="text-xs capitalize text-slate-500">{role} portal</p></div>
      </div>
      <nav className="flex-1 space-y-1 px-3" aria-label="Main">{links}</nav>
      <div className="m-3 rounded-2xl bg-slate-50 p-3">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-sm font-semibold text-white">{user.full_name.split(" ").map((w) => w[0]).slice(0, 2).join("")}</div>
          <div className="min-w-0"><p className="truncate text-sm font-semibold text-slate-800">{user.full_name}</p><p className="truncate text-xs text-slate-500">{user.username}</p></div>
        </div>
        <button onClick={() => { logout(); nav("/"); }} className="btn btn-ghost btn-sm mt-3 w-full"><LogOut className="h-3.5 w-3.5" />Sign out</button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen">
      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r border-slate-200 bg-white lg:block">{side}</aside>
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-slate-200 bg-white/80 px-4 py-3 backdrop-blur lg:hidden">
        <div className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-indigo-600" /><span className="font-bold text-slate-900">AI Attendance</span></div>
        <button className="icon-btn" onClick={() => setOpen(true)} aria-label="Open menu"><Menu className="h-5 w-5" /></button>
      </header>
      {open && (<div className="fixed inset-0 z-40 lg:hidden"><div className="absolute inset-0 bg-slate-900/50" onClick={() => setOpen(false)} />
        <div className="absolute inset-y-0 left-0 w-72 max-w-[85%] animate-pop bg-white shadow-2xl">
          <button className="icon-btn absolute right-3 top-4" onClick={() => setOpen(false)} aria-label="Close menu"><X className="h-5 w-5" /></button>{side}</div></div>)}
      <main className="lg:pl-64"><div className="mx-auto max-w-7xl animate-rise px-4 py-6 sm:px-6 lg:px-8 lg:py-8"><Outlet /></div></main>
    </div>
  );
}
