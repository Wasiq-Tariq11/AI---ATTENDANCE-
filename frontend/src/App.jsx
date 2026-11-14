import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./auth";
import { Spinner, UiProvider } from "./ui";
import Layout from "./Layout";
import Landing from "./pages/auth/Landing";
import Login from "./pages/auth/Login";
import Account from "./pages/Account";

const AdminDash = lazy(() => import("./pages/admin/Dashboard"));
const AdminStudents = lazy(() => import("./pages/admin/Students"));
const AdminTeachers = lazy(() => import("./pages/admin/Teachers"));
const AdminAcademics = lazy(() => import("./pages/admin/Academics"));
const AdminAttendance = lazy(() => import("./pages/admin/Attendance"));
const AdminAudit = lazy(() => import("./pages/admin/Audit"));
const AdminStaff = lazy(() => import("./pages/admin/StaffAttendance"));
const TeacherPresence = lazy(() => import("./pages/teacher/Presence"));
const TeacherDash = lazy(() => import("./pages/teacher/Dashboard"));
const TeacherAttend = lazy(() => import("./pages/teacher/Attend"));
const TeacherRecords = lazy(() => import("./pages/teacher/Records"));
const StudentDash = lazy(() => import("./pages/student/Dashboard"));
const StudentHistory = lazy(() => import("./pages/student/History"));

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider><UiProvider>
        <Suspense fallback={<div className="flex h-screen items-center justify-center"><Spinner className="h-8 w-8" /></div>}>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/login/:role" element={<Login />} />
            <Route path="/admin" element={<Layout role="admin" />}>
              <Route index element={<AdminDash />} /><Route path="students" element={<AdminStudents />} /><Route path="teachers" element={<AdminTeachers />} />
              <Route path="academics" element={<AdminAcademics />} /><Route path="attendance" element={<AdminAttendance />} /><Route path="audit" element={<AdminAudit />} /><Route path="staff" element={<AdminStaff />} />
              <Route path="account" element={<Account />} />
            </Route>
            <Route path="/teacher" element={<Layout role="teacher" />}>
              <Route index element={<TeacherDash />} /><Route path="attendance" element={<TeacherAttend />} /><Route path="records" element={<TeacherRecords />} /><Route path="presence" element={<TeacherPresence />} />
              <Route path="account" element={<Account />} />
            </Route>
            <Route path="/student" element={<Layout role="student" />}>
              <Route index element={<StudentDash />} /><Route path="history" element={<StudentHistory />} /><Route path="account" element={<Account />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </UiProvider></AuthProvider>
    </BrowserRouter>
  );
}
