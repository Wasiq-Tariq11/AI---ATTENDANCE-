import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, CameraOff, Loader2 } from "lucide-react";
import { cn } from "../ui";

/* Tunable constants — adjust after testing on real devices */
const MIN_FACE_WIDTH = 0.2;   // face must be at least 20% of frame width
const MIN_BRIGHTNESS = 55;    // 0-255 average luminance
const TURN_OFFSET = 0.13;     // how far the nose must move from centre during the head-turn check
const CENTER_BAND = 0.06;     // how close to centre counts as "facing the camera"
const CHALLENGE_MS = 12000;

let faceapiPromise;
async function loadFaceApi() {
  if (!faceapiPromise) faceapiPromise = (async () => {
    const faceapi = await import("@vladmandic/face-api");
    await Promise.all([faceapi.nets.tinyFaceDetector.loadFromUri("/models"), faceapi.nets.faceLandmark68Net.loadFromUri("/models"), faceapi.nets.faceRecognitionNet.loadFromUri("/models")]);
    return faceapi;
  })();
  return faceapiPromise;
}

const yawOffset = (lm) => { const j = lm.getJawOutline(), nose = lm.getNose()[3]; return (nose.x - j[0].x) / (j[16].x - j[0].x) - 0.5; };

/**
 * mode="attend": needs a head-turn liveness check, then calls onFace(descriptor) -> {tone, text}.
 * mode="enroll": shows a Capture button; after `samples` captures calls onDone(descriptors[]).
 */
export default function FaceCamera({ mode, onFace, onDone, samples = 3, active = true }) {
  const video = useRef(); const canvas = useRef(); const st = useRef({ phase: "wait", since: 0, turned: false, busy: false, captures: [] });
  const [state, setState] = useState({ stage: "loading", msg: "Loading AI models…" });
  const [hint, setHint] = useState(""); const [flash, setFlash] = useState(null); const [count, setCount] = useState(0);
  const api = useRef({}); api.current = { onFace, onDone, active, mode, samples };

  const brightness = useCallback(() => {
    const c = canvas.current, v = video.current; if (!c || !v.videoWidth) return 255;
    const ctx = c.getContext("2d", { willReadFrequently: true }); ctx.drawImage(v, 0, 0, 32, 24);
    const d = ctx.getImageData(0, 0, 32, 24).data; let s = 0; for (let i = 0; i < d.length; i += 4) s += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    return s / (d.length / 4);
  }, []);

  useEffect(() => {
    let dead = false, stream, timer, faceapi;
    const opts = () => new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 });

    const describe = async () => {
      const r = await faceapi.detectSingleFace(video.current, opts()).withFaceLandmarks().withFaceDescriptor();
      return r ? Array.from(r.descriptor) : null;
    };

    const loop = async () => {
      if (dead) return;
      const s = st.current;
      try {
        if (!api.current.active || s.busy || video.current.readyState < 2) return;
        const dets = await faceapi.detectAllFaces(video.current, opts()).withFaceLandmarks();
        if (dead) return;
        if (dets.length === 0) { s.phase = "wait"; s.turned = false; return setHint("No face detected. Look at the camera."); }
        if (dets.length > 1) { s.phase = "wait"; return setHint("More than one face. Only one person at a time, please."); }
        const d = dets[0], w = d.detection.box.width / video.current.videoWidth;
        if (w < MIN_FACE_WIDTH) return setHint("Move closer to the camera.");
        if (brightness() < MIN_BRIGHTNESS) return setHint("Too dark. Move to a brighter place.");
        const off = yawOffset(d.landmarks);

        if (api.current.mode === "enroll") return setHint(Math.abs(off) > 0.1 ? "Face the camera directly." : "Good. Press Capture.");

        // --- attendance: head-turn liveness ---
        const now = Date.now();
        if (s.phase === "wait") { s.phase = "turn"; s.since = now; s.turned = false; }
        if (now - s.since > CHALLENGE_MS) { s.since = now; s.turned = false; }
        if (!s.turned) { setHint("Liveness check: slowly turn your head to one side."); if (Math.abs(off) >= TURN_OFFSET) s.turned = true; return; }
        if (Math.abs(off) > CENTER_BAND) return setHint("Now face the camera directly.");

        s.busy = true; setHint("Verifying…");
        const desc = await describe();
        let res = { tone: "warn", text: "Could not read the face. Try again." };
        if (desc) res = await api.current.onFace(desc);
        setFlash(res); setHint(""); s.phase = "wait"; s.turned = false;
        setTimeout(() => { if (!dead) { setFlash(null); s.busy = false; } }, 2300);
      } catch (e) { setHint("Detection error. Retrying…"); }
      finally { if (!dead) timer = setTimeout(loop, 160); }
    };

    (async () => {
      try {
        if (!window.isSecureContext) throw Object.assign(new Error(), { name: "Insecure" });
        faceapi = await loadFaceApi(); if (dead) return;
        setState({ stage: "loading", msg: "Starting camera…" });
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } }, audio: false });
        if (dead) return stream.getTracks().forEach((t) => t.stop());
        video.current.srcObject = stream; await video.current.play();
        setState({ stage: "ready" }); loop();
      } catch (e) {
        const m = { NotAllowedError: "Camera permission was denied. Allow camera access in your browser settings and reload.", NotFoundError: "No camera was found on this device.",
          NotReadableError: "The camera is being used by another app.", Insecure: "The camera needs a secure (HTTPS) connection." }[e.name] || "Could not start the camera or load the AI models.";
        if (!dead) setState({ stage: "error", msg: m });
      }
    })();
    return () => { dead = true; clearTimeout(timer); stream?.getTracks().forEach((t) => t.stop()); };
  }, [brightness]);

  const capture = async () => {
    const s = st.current; if (s.busy) return; s.busy = true; setHint("Capturing…");
    try {
      const faceapi = await loadFaceApi();
      const r = await faceapi.detectSingleFace(video.current, new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 })).withFaceLandmarks().withFaceDescriptor();
      if (!r) return setHint("No clear face found. Try again.");
      s.captures.push(Array.from(r.descriptor)); setCount(s.captures.length);
      if (s.captures.length >= api.current.samples) { const all = s.captures; s.captures = []; setCount(0); await api.current.onDone(all); }
    } finally { s.busy = false; }
  };

  return (
    <div>
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl bg-slate-900">
        <video ref={video} playsInline muted className="h-full w-full -scale-x-100 object-cover" />
        <canvas ref={canvas} width="32" height="24" className="hidden" />
        {state.stage !== "ready" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center text-slate-200">
            {state.stage === "loading" ? <Loader2 className="h-8 w-8 animate-spin" /> : <CameraOff className="h-8 w-8 text-rose-400" />}
            <p className="text-sm">{state.msg}</p></div>)}
        {state.stage === "ready" && !flash && hint && <div className="absolute inset-x-3 bottom-3 rounded-xl bg-slate-900/75 px-3 py-2 text-center text-sm text-white backdrop-blur">{hint}</div>}
        {flash && <div className={cn("absolute inset-x-3 bottom-3 animate-pop rounded-xl px-3 py-3 text-center text-sm font-semibold text-white shadow-lg", flash.tone === "success" ? "bg-emerald-600" : flash.tone === "error" ? "bg-rose-600" : "bg-amber-600")}>{flash.text}</div>}
        {state.stage === "ready" && <div className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-slate-900/70 px-2.5 py-1 text-xs text-white"><span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />Live</div>}
      </div>
      {mode === "enroll" && state.stage === "ready" && (
        <button type="button" onClick={capture} className="btn btn-primary mt-3 w-full"><Camera className="h-4 w-4" />Capture sample {count + 1} of {samples}</button>)}
    </div>
  );
}
