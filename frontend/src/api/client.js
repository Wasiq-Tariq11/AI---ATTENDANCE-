const API = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";
let token = sessionStorage.getItem("token");

export function setToken(t) {
  token = t;
  t ? sessionStorage.setItem("token", t) : sessionStorage.removeItem("token");
}

export async function api(path, { method = "GET", body, raw = false } = {}) {
  let res;
  try {
    res = await fetch(API + path, {
      method,
      headers: { ...(body ? { "Content-Type": "application/json" } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error("Cannot reach the server. If it was idle, wait a minute and try again.");
  }
  if (res.status === 401 && token) { setToken(null); window.dispatchEvent(new Event("auth-expired")); }
  if (!res.ok) {
    let msg = "Something went wrong";
    try {
      const j = await res.json();
      msg = typeof j.detail === "string" ? j.detail : Array.isArray(j.detail) ? j.detail.map((d) => d.msg).join(", ") : msg;
    } catch { /* ignore */ }
    throw new Error(msg);
  }
  return raw ? res : res.json();
}

export async function download(path, filename) {
  const res = await api(path, { raw: true });
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
