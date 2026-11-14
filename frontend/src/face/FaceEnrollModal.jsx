import { useState } from "react";
import { api } from "../api/client";
import { Modal, useToast } from "../ui";
import FaceCamera from "./FaceCamera";

export default function FaceEnrollModal({ name, endpoint, onClose, onSaved }) {
  const toast = useToast(); const [consent, setConsent] = useState(false);
  const done = async (embeddings) => {
    try { await api(endpoint, { method: "POST", body: { consent: true, embeddings } }); toast("success", "Face registered"); onSaved(); }
    catch (x) { toast("error", x.message); }
  };
  return (
    <Modal title={`Face registration · ${name}`} onClose={onClose} size="md">
      <div className="space-y-4">
        <div className="rounded-xl bg-amber-50 p-3.5 text-sm text-amber-900">Face data is biometric information. Register it only after the person has given <b>informed, written consent</b>. Templates are encrypted and never shown in the app. A face can only be registered to one person.</div>
        <label className="flex items-start gap-3 text-sm text-slate-700"><input type="checkbox" className="mt-0.5 h-4 w-4 accent-indigo-600" checked={consent} onChange={(e) => setConsent(e.target.checked)} />I confirm that {name} has given written consent for face data to be stored and used for attendance.</label>
        {consent ? <FaceCamera mode="enroll" samples={3} onDone={done} /> : <p className="rounded-xl bg-slate-100 p-6 text-center text-sm text-slate-500">Tick the consent box to open the camera.</p>}
        <p className="text-xs text-slate-500">Capture 3 samples: straight on, slightly left, slightly right. Use good, even lighting.</p>
      </div>
    </Modal>
  );
}
