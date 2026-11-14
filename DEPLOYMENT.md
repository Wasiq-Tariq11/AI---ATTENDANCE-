# Free deployment guide (total cost: ₹0)

Stack: **Neon** (PostgreSQL) + **Render** (FastAPI backend) + **Cloudflare Pages** (React frontend) + **GitHub**.
Limits below were checked in Nov 2026 and change often. Re-check each pricing page before relying on them.

## What "free" really means here
| Service | Free-tier behaviour you must accept |
|---|---|
| Render web service | Sleeps after 15 min without traffic; the next request takes about a minute. Local files are wiped on restart (so never use SQLite there). 750 free instance-hours/month. Do NOT use Render's own free Postgres: it expires after 30 days. |
| Neon Postgres | 1 GB per project. Compute scales to zero after ~5 min idle and wakes automatically on the next connection (first query is slower). |
| Cloudflare Pages | Unlimited static bandwidth, 500 builds/month. Always on. |
| Supabase (alternative DB) | 500 MB; the project **pauses after 1 week idle and must be resumed manually**. Not recommended for this app. |

Tell users: "The first login after a quiet period can take up to a minute."
Do not run a keep-alive pinger; it burns your free hours and goes against the spirit of the free tier.

## 1. Put the code on GitHub
1. Create a **private** repository on github.com (e.g. `attendance-system`).
2. In PowerShell, inside the project folder:
```
git init
git add .
git status          # make sure NO .env or .db file is listed
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/attendance-system.git
git push -u origin main
```
`.gitignore` already excludes `.env`, `*.db`, `*.csv`, `node_modules`. Never commit real student data or photos.

## 2. Database on Neon
1. Sign up at neon.com, create a project (pick the region closest to your users).
2. Copy the **connection string** (looks like `postgresql://user:pass@ep-xxxx.region.aws.neon.tech/neondb?sslmode=require`).
3. Keep it secret. Do not use the "Data API" feature; this app talks to the database only through its backend.

## 3. Backend on Render
1. render.com → **New → Web Service** → connect your GitHub repo.
2. Settings: **Root Directory** `backend` · **Runtime** Python · **Instance type** Free
   - Build command: `pip install -r requirements.txt`
   - Start command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT --proxy-headers --forwarded-allow-ips="*"`
3. Environment variables:
```
ENVIRONMENT=production
DATABASE_URL=<your Neon connection string>
SECRET_KEY=<run: python -c "import secrets; print(secrets.token_urlsafe(48))">
FACE_ENCRYPTION_KEY=<generate another one the same way; KEEP A COPY, losing it means re-registering all faces>
CORS_ORIGINS=https://YOUR-PROJECT.pages.dev     (fill in after step 4, then redeploy)
TIMEZONE=Asia/Kolkata
```
Optional staff-attendance settings (all have safe defaults):
```
STAFF_MATCH_THRESHOLD=0.45     # stricter than students; lower = stricter
STAFF_MIN_MINUTES=5            # minimum gap between check-in and check-out
CAMPUS_NETWORKS=               # e.g. 203.0.113.0/24  -> teachers can only check in/out from the campus network
REQUIRE_STAFF_CHECKIN=false    # true = a class cannot start before the teacher checked in
```
`CAMPUS_NETWORKS` uses the visitor's public IP. Find your campus Wi-Fi's public IP (search "what is my IP" while on it). Phones on mobile data will then be refused, which is the point. Leave it empty to turn the rule off.
4. Deploy. When it is live, open `https://YOUR-SERVICE.onrender.com/api/health`. You should see `{"status":"ok",...}`.
   The tables are created automatically on first start.
   If the build fails on the Python version, set `PYTHON_VERSION` to a 3.12.x release listed in Render's docs.

## 4. Create the first admin (from your own PC)
Render's free plan has no shell, so run this locally against the cloud database:
```
cd backend
.\venv\Scripts\Activate.ps1
copy .env.example .env
```
Edit `backend\.env`: set `DATABASE_URL` to the Neon string and `FACE_ENCRYPTION_KEY`/`SECRET_KEY` to the **same** values as Render. Then:
```
python -m app.scripts.create_admin
```
Delete the Neon URL from your local `.env` afterwards if you share the computer.

## 5. Frontend on Cloudflare Pages
1. dash.cloudflare.com → **Workers & Pages → Create → Pages → Connect to Git** → pick the repo.
2. **Root directory** `frontend` · **Build command** `npm run build` · **Output directory** `dist`
3. Environment variable: `VITE_API_URL` = `https://YOUR-SERVICE.onrender.com` (no trailing slash)
4. Deploy. Your site is `https://YOUR-PROJECT.pages.dev` (HTTPS is automatic, which the camera requires).
5. Go back to Render → set `CORS_ORIGINS` to that exact URL → it redeploys.

## 6. Smoke test (do this before real use)
- Open the site → Admin sign-in → create a class, a subject (add it to the class), a teacher, assign the teacher, add 2 students.
- Register a face for a student **with consent ticked**; this needs a real camera.
- Sign in as the teacher on a phone and laptop, start a session, test recognition in your real classroom lighting.
- Test an unregistered person and a photo of a student on a phone screen. Neither must be marked.
- Sign in as a student; check the dashboard and the PDF download.

## Backups
Free tiers do not promise backups (I did not verify Neon's free restore window). Export regularly:
- Admin → Attendance → **CSV** (monthly), and keep a copy of `FACE_ENCRYPTION_KEY`.
- Full database dump (needs PostgreSQL client tools installed): `pg_dump "<NEON URL>" -Fc -f backup.dump`

## If you choose Supabase instead of Neon
It is plain PostgreSQL, so only `DATABASE_URL` changes. Because Supabase exposes an automatic public API, run this once in its SQL editor to block it:
```
DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT tablename FROM pg_tables WHERE schemaname='public' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r.tablename);
  END LOOP; END $$;
```
The backend connects as the table owner, so it keeps working. Remember the 1-week pause.

## How proxy and duplicate attendance are blocked
| Risk | Control | Where enforced |
|---|---|---|
| Second check-in the same day | One row per teacher per day | Database unique constraint + API |
| Second check-out | Check-out is written once only | Conditional update + database CHECK rules |
| Check-out before check-in / backwards times | Rejected | Database CHECK + API |
| Accidental double scan | Check-out needs a minimum gap | API (`STAFF_MIN_MINUTES`) |
| Colleague checks in for you | Face must match the logged-in teacher AND be nobody else's closest match. Wrong face is rejected and logged as `staff_proxy_suspected` | API |
| One face registered under two people | Blocked across students and teachers | API (at registration) |
| Photo / replay | Head-turn liveness in the browser | Browser (see limitations) |
| Checking in from home | Optional campus-network restriction | API (`CAMPUS_NETWORKS`) |
| Two class sessions for the same class and subject on one day | One session per teacher/class/subject/day; closed ones are reopened | Database unique constraint + API |
| Manual overrides | Always need a reason, flagged in reports, written to the audit log | API |

## Known limitations (be honest with your institution)
- **Browser-side liveness can be bypassed by a determined attacker** (the liveness check runs on the user's device). It stops casual photo/proxy attempts, not a technically skilled one. For stronger assurance use the campus-network rule and review the Staff attendance report and the audit log.
- Anyone who knows a teacher's password can try to check in as them, but still needs that teacher's live face.
- **Liveness is basic.** The head-turn check stops a still photo. It will NOT reliably stop a replayed video, a 3-D mask or a determined attacker. Treat face attendance as convenience, with a teacher present.
- **Accuracy depends on lighting, camera and similar faces.** Tune `FACE_MATCH_THRESHOLD` (lower = stricter) after real testing.
- No self-service "forgot password": the admin resets passwords (a temporary password is shown once).
- Login lockout counters live in memory and reset when Render restarts the server.
- The login token is kept in the browser tab's sessionStorage (cleared when the tab closes). Do not add untrusted third-party scripts.
- Tables are created automatically but there are no migrations yet. Changing the schema later needs Alembic.
- Get written consent for biometric data and check your institution's data-protection rules before going live.
