# 🧠 GreatUniHackDemo — React + FastAPI + Firebase (Auth + Firestore)

A **minimal full-stack demo** built for hackathons and quick prototyping.  
Combines modern tech:
- 🪄 **Frontend**: React (Vite)
- ⚙️ **Backend**: FastAPI
- 🔐 **Auth + Database**: Firebase (Google Sign-In + Firestore)
- 💻 **Local Dev**: Windows + WSL2 friendly
- ☁️ **Deploy**: Vercel (frontend) + Railway / Render (backend)

> ⚠️ For security, always use **your own Firebase project** and never commit private credentials.

---

## 📁 Project structure

```
GreatUniHackDemo/
├─ frontend/            # React app (Vite)
│  ├─ src/
│  │  ├─ App.jsx        # UI + Firebase login
│  │  ├─ api.js         # API calls to FastAPI
│  │  ├─ firebase.js    # Firebase config
│  │  └─ main.jsx
│  ├─ index.html
│  ├─ package.json
│  └─ vite.config.js
└─ backend/             # FastAPI backend
   ├─ main.py
   ├─ requirements.txt
   └─ serviceAccountKey.json (🔒 private Firebase admin key)
```

---

## ☁️ 1) Firebase setup (one-time)

1. Go to **[Firebase Console](https://console.firebase.google.com)** → Create a new project.
2. Enable **Authentication → Sign-in method → Google**.
3. Create a **Web app** → copy its config and paste into:
   ```
   frontend/src/firebase.js
   ```
4. Generate a **Service Account Key**:
   - Go to Project settings → *Service accounts* → *Generate new private key*  
   - Rename to `serviceAccountKey.json`
   - Place it under `backend/serviceAccountKey.json`
5. Enable **Cloud Firestore (Native mode)** in “Build → Firestore Database”.

---

## 🧠 2) Local development (step-by-step)

### 🐍 Backend (FastAPI)

> 💡 Recommended to run inside **WSL2 (Ubuntu)**

```bash
# Enter backend folder
cd backend

# Create and activate virtual environment
python -m venv .venv
source .venv/bin/activate  # Windows PowerShell: .venv\Scripts\Activate.ps1

# Install dependencies
pip install -r requirements.txt

# Run the backend server
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

📍 Then visit → http://127.0.0.1:8000  
You should see:
```json
{"ok": true, "message": "🚀 Backend running successfully!"}
```

---

### ⚛️ Frontend (React + Vite)

> 💡 Run in a **separate terminal**, also under WSL2

```bash
cd ~/Projects/greatunihackdemo/frontend

# Install Node dependencies
npm install

# Start dev server
npm run dev
```

Then open → **http://localhost:5173**

---

## 🔐 3) How it works

**Login flow**
1. User clicks “Sign in with Google”.
2. Firebase Auth returns an ID token (`getIdToken()`).
3. Frontend calls backend API with:
   ```
   Authorization: Bearer <idToken>
   ```
4. FastAPI verifies token via Firebase Admin SDK and extracts user UID.

**Data flow**
- `GET /notes` → returns notes belonging to the user.
- `POST /notes` → adds a new note `{ uid, text, createdAt }`.

All notes are securely stored in Firestore:
```
notes (collection)
 ├─ <noteID>
 │   ├─ uid: "firebase_uid_12345"
 │   ├─ text: "Hello GreatUniHack!"
 │   └─ createdAt: 1730886000000
```

---

## ⚠️ 4) Common issues & fixes

### 🧩 Error: `400 The query requires an index`
→ Firestore requires a **composite index** for:
```python
.where("uid", "==", uid).order_by("createdAt")
```

✅ Fix:
1. Open the Firebase Console link provided in the error (it auto-generates it).
2. Click **Create index**.
3. Wait until it’s “Enabled” (1–2 minutes).
4. Refresh your app → works immediately!

If you just want a quick bypass (no sort order):
```python
docs = db.collection("notes").where("uid", "==", uid).stream()
```

---

### 🌍 Error: CORS (Cross-Origin Request)
If you see:
```
CORS Missing Allow Origin
```
Make sure your backend has this middleware:
```python
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # For local dev only
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

---

## 🚀 5) Quick test demo

```bash
# 1️⃣ Run backend (port 8000)
uvicorn main:app --reload --port 8000

# 2️⃣ Run frontend (port 5173)
npm run dev

# 3️⃣ Open browser:
http://localhost:5173
```

Then:
- Click “Sign in with Google”
- Write a note
- Click “Add” → it appears instantly (stored in Firestore)

---

## ☁️ 6) Deployment guide

### Frontend → **Vercel**
1. Import the `frontend/` folder.
2. Vercel auto-detects Vite → no config needed.
3. Add environment variable:
   ```
   VITE_API_BASE=https://your-backend-domain.com
   ```

### Backend → **Railway / Render**
1. Create a new Python web service.
2. Upload all `backend/` files.
3. Set start command:
   ```bash
   uvicorn main:app --host 0.0.0.0 --port $PORT
   ```
4. Add environment variable:
   ```
   FIREBASE_CREDENTIALS_PATH=/app/serviceAccountKey.json
   ```
5. Upload `serviceAccountKey.json` as a *secret file* (never in repo).

---

## 🔒 7) Security checklist

| ✅ Action | Description |
|-----------|--------------|
| 🔑 Do **not** commit `serviceAccountKey.json` | Add it to `.gitignore` |
| 🧩 Restrict Firestore rules | Only allow users to read/write their own notes |
| 🌍 In production | Use `allow_origins=["https://yourapp.vercel.app"]` |
| 🧠 Use `.env` files | Store secrets like `FIREBASE_CREDENTIALS_PATH` safely |

---

## 🧱 8) Tech summary

| Layer | Tech | Purpose |
|--------|------|----------|
| Frontend | React (Vite) | UI + Firebase Auth |
| Backend | FastAPI | API + Auth verification |
| Database | Firestore | Store notes |
| Auth | Firebase Auth (Google) | User identity |
| Local Runtime | WSL2 + Node.js + Python | Dev environment |
| Deployment | Vercel + Railway | Hosting |

---

## ✨ 9) Demo features

- 🔐 Google login via Firebase
- 📝 Personal note board per user
- ☁️ Data stored securely in Firestore
- ⚙️ FastAPI backend with CORS + token validation
- 💻 Compatible with Windows + WSL2
- 🌈 Deployable in under 10 minutes

---

## 🧩 10) Author & License

Made for **GreatUniHack** 🏫  
MIT License · 2025
