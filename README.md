# 🧠 GreatUniHackDemo — React + FastAPI + Firebase (Auth + Firestore)

A **minimal full-stack demo** for hackathons and rapid prototyping.  
It integrates a modern, production-style stack:

- 🪄 **Frontend**: React (Vite)
- ⚙️ **Backend**: FastAPI
- 🔐 **Auth + Database**: Firebase (Google Sign-In + Firestore)
- 💻 **Local Dev**: Windows + WSL2 friendly
- ☁️ **Deploy**: Vercel (frontend) + Railway / Render (backend)

> ⚠️ Always use **your own Firebase project** and **never commit private credentials**.

## 🧩 System Requirements

| Tool | Version (tested) |
|------|------------------|
| Node.js | ≥ 20.x |
| npm | ≥ 10.x |
| Python | ≥ 3.12 |
| Firebase project | Enabled Firestore + Auth |
| OS | Ubuntu / WSL2 / macOS |

---

## 📁 Project Structure

```

GreatUniHackDemo/
├─ frontend/            # React app (Vite)
│  ├─ src/
│  │   ├─ components/
│  │   │   ├─ Header.jsx
│  │   │   ├─ NoteList.jsx
│  │   │   └─ NoteForm.jsx
│  │   ├─ styles/
│  │   │   └─ app.css
│  │   ├─ App.jsx        # UI + Firebase login
│  │   ├─ api.js         # API calls to FastAPI
│  │   ├─ firebase.js    # Firebase config
│  │   └─ main.jsx
│  ├─ index.html
│  ├─ package.json
│  └─ vite.config.js
└─ backend/             # FastAPI backend
├─ main.py
├─ requirements.txt
├─ .env               # (optional) FIREBASE_CREDENTIALS_PATH
└─ serviceAccountKey.json 🔒

```

---

## ☁️ 1) Firebase Setup (one-time)

1. Go to **[Firebase Console](https://console.firebase.google.com)** → Create a new project.  
2. Enable **Authentication → Sign-in method → Google**.  
3. Create a **Web App** → copy config → paste into:
```

frontend/src/firebase.js

````
4. Generate a **Service Account Key**  
- Go to Project Settings → *Service Accounts* → *Generate New Private Key*  
- Rename to `serviceAccountKey.json`  
- Place it under `backend/serviceAccountKey.json`
5. Enable **Cloud Firestore (Native mode)**.

---

## 🧠 2) Local Development

### 🐍 Backend (FastAPI)
> 💡 Recommended to run in **WSL2 (Ubuntu)**

```bash
$ cd backend
$ python -m venv .venv
$ source .venv/bin/activate   # On PowerShell: .venv\Scripts\Activate.ps1
$ pip install -r requirements.txt

# Optionally: create a .env file
echo "FIREBASE_CREDENTIALS_PATH=backend/serviceAccountKey.json" > .env

# Run server
$ uvicorn main:app --reload --host 0.0.0.0 --port 8000
````

Visit: [http://127.0.0.1:8000](http://127.0.0.1:8000)

Expected output:

```json
{"ok": true, "message": "🚀 Backend running successfully!"}
```

---

### ⚛️ Frontend (React + Vite)

> 💡 Run in a separate terminal

```bash
$ cd ~/Projects/greatunihackdemo/frontend
$ npm install
$ npm run dev
```

Then open → **[http://localhost:5173](http://localhost:5173)**

---

## 🔐 3) How It Works

**Authentication flow**

1. User clicks **Sign in with Google**
2. Firebase Auth returns an **ID token**
3. Frontend sends:

   ```
   Authorization: Bearer <idToken>
   ```
4. FastAPI verifies token via **Firebase Admin SDK** → extracts UID

**Data flow**

* `GET /notes` → returns user’s notes
* `POST /notes` → adds `{ uid, text, createdAt }` to Firestore

Data model:

```
notes (collection)
 ├─ <noteID>
 │   ├─ uid: "firebase_uid_12345"
 │   ├─ text: "Hello GreatUniHack!"
 │   └─ createdAt: 1730886000000
```

---

## ⚠️ 4) Common Issues & Fixes

### 🔸 `400 The query requires an index`

Firestore needs a **composite index** for:

```python
.where("uid", "==", uid).order_by("createdAt")
```

✅ Fix:
Click the **“Create index”** link shown in the error → enable it → wait a minute → refresh page.

Alternative (no ordering):

```python
docs = db.collection("notes").where("uid", "==", uid).stream()
```

---

### 🔸 CORS Errors

If you see:

```
CORS Missing Allow Origin
```

Ensure backend has:

```python
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # For local dev
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

---

## 🚀 5) Quick Test Run

```bash
# 1️⃣ Start backend
uvicorn main:app --reload --port 8000

# 2️⃣ Start frontend
npm run dev

# 3️⃣ Open
http://localhost:5173
```

Then:

* Sign in with Google
* Add a note
* It instantly syncs with Firestore 🔥

---

## ☁️ 6) Deployment Guide

### Frontend → **Vercel**

1. Import `frontend/`
2. It auto-detects Vite
3. Add env variable:

   ```
   VITE_API_BASE=https://your-backend-domain.com
   ```

### Backend → **Railway / Render**

1. Create a new Python web service
2. Upload all `backend/` files
3. Start command:

   ```bash
   uvicorn main:app --host 0.0.0.0 --port $PORT
   ```
4. Environment variables:

   ```
   FIREBASE_CREDENTIALS_PATH=/app/serviceAccountKey.json
   ```
5. Upload `serviceAccountKey.json` as a *secret file*

---

## 🔒 7) Security Checklist

| ✅ Action                                 | Description                         |
| ---------------------------------------- | ----------------------------------- |
| 🔑 Don’t commit `serviceAccountKey.json` | Add to `.gitignore`                 |
| 🧩 Restrict Firestore rules              | Each user sees only their own notes |
| 🌍 Restrict CORS origins                 | Use your production domain only     |
| 🧠 Use `.env` files                      | Keep secrets out of code            |

---

## 🧱 8) Tech Summary

| Layer      | Tech                    | Purpose               |
| ---------- | ----------------------- | --------------------- |
| Frontend   | React (Vite)            | UI + Firebase Auth    |
| Backend    | FastAPI                 | API + Auth validation |
| Database   | Firestore               | Cloud-hosted NoSQL DB |
| Auth       | Firebase Auth (Google)  | Secure login          |
| Dev Env    | WSL2 + Node.js + Python | Local workflow        |
| Deployment | Vercel + Railway        | Hosting               |

---

## ✨ 9) Features

* 🔐 Google sign-in with Firebase
* 📝 Per-user personal notes
* ☁️ Notes persisted in Firestore
* ⚙️ FastAPI backend with token verification
* 💻 Works seamlessly on Windows + WSL2
* 🚀 Deployable in minutes

---

## 🧭 10) Known Limitations / Future Improvements

* ⏱️ Token validation timing issues (slight delay after login)
* 💬 Real-time sync (Firestore listener) not yet implemented
* 📱 Responsive design can be improved
* 🧩 Better error handling / retry system (planned)

---

## 👤 Author & License

Made for **GreatUniHack** 🏫
MIT License · © 2025