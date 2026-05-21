# Put PSA Queue online (free) — Render + MongoDB Atlas

Your app needs **Node.js** (`server.js`), not static-only hosting.

---

## What you need (all free tiers)

1. **GitHub** account — to hold your code  
2. **MongoDB Atlas** — you already use this (database)  
3. **Render** — runs `node server.js` with HTTPS  
4. **Firebase** — login (already set up); add Render URL to allowed domains  

---

## Step 1 — Local `.env` (so PC still works)

1. In project folder, copy `.env.example` → `.env`  
2. Open MongoDB Atlas → **Database** → **Connect** → **Drivers** → copy connection string  
3. Paste into `.env` as `MONGODB_URI=...` (replace `<password>` with real password)  
4. Install and run:

```powershell
cd C:\Users\Acer\Downloads\psaqueuesystemv2-setup-v2-features
npm install
npm start
```

Open: http://localhost:3000/login.html

**Security:** Mongo password is no longer in `server.js`. Rotate password in Atlas if old one was shared.

---

## Step 2 — MongoDB Atlas allow cloud server

1. Atlas → **Network Access** → **Add IP Address**  
2. Choose **Allow access from anywhere** (`0.0.0.0/0`) for Render free tier  
   (or add Render’s outbound IPs later for stricter setup)  
3. Save  

---

## Step 3 — Push code to GitHub

```powershell
cd C:\Users\Acer\Downloads\psaqueuesystemv2-setup-v2-features
git init
git add .
git commit -m "Prepare for Render deploy"
```

Create empty repo on github.com (e.g. `psa-queue`), then:

```powershell
git remote add origin https://github.com/YOUR_USERNAME/psa-queue.git
git branch -M main
git push -u origin main
```

Do **not** commit `.env` (it is in `.gitignore`).

---

## Step 4 — Deploy on Render (free)

1. Go to https://render.com → sign up (GitHub login is easiest)  
2. **New +** → **Web Service**  
3. Connect your **psa-queue** GitHub repo  
4. Settings:
   - **Name:** `psa-queue` (or any name)  
   - **Runtime:** Node  
   - **Build Command:** `npm install`  
   - **Start Command:** `npm start`  
   - **Plan:** Free  
5. **Environment** → Add variable:
   - **Key:** `MONGODB_URI`  
   - **Value:** (same connection string as your `.env`)  
6. **Create Web Service**  
7. Wait ~5–10 min for first deploy  

Your public URL will look like:

`https://psa-queue-xxxx.onrender.com`

Login: `https://psa-queue-xxxx.onrender.com/login.html`

---

## Step 5 — Firebase (required for login online)

1. https://console.firebase.google.com → project **queue-project-login**  
2. **Authentication** → **Settings** → **Authorized domains**  
3. **Add domain:** `psa-queue-xxxx.onrender.com` (your Render hostname, no `https://`)  
4. Save  

Without this, Firebase login may fail on the live site.

---

## Step 6 — Test live site

1. Open `https://YOUR-APP.onrender.com/login.html`  
2. Register / login  
3. Admin: register with OTP from **Render Logs** (Dashboard → your service → **Logs**), same as local terminal  

**Note:** Free Render **sleeps** after ~15 min idle. First visit may take 30–60 seconds to wake up.

---

## Quick alternative — show online today from your PC (no GitHub)

**Cloudflare Tunnel** (free HTTPS URL to your laptop):

1. Install cloudflared: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/  
2. Run `npm start` on your PC  
3. In another terminal:

```powershell
cloudflared tunnel --url http://localhost:3000
```

4. Copy the `https://....trycloudflare.com` URL — works while PC is on  

Good for demo; **Render** is better for “always online” without your PC.

---

## Troubleshooting

| Problem | Fix |
|--------|-----|
| Deploy failed | Check Render **Logs**; run `npm install` locally first |
| Cannot connect DB | Atlas Network Access `0.0.0.0/0`; check `MONGODB_URI` on Render |
| Firebase auth error | Add Render domain to Firebase authorized domains |
| Slow first load | Free tier cold start — normal |
| Socket.io disconnects | Free plan limits; refresh page |

---

## After it is online (security — do soon)

- Lock `/api/set-role` so only admins can call it  
- Do not share Render URL publicly until APIs are secured  

---

## Files added for deploy

- `.env.example` — template for secrets  
- `render.yaml` — optional Render blueprint  
- `server.js` — uses `MONGODB_URI` from environment  
- `dotenv` — loads `.env` locally  
