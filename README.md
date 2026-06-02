<p align="center">
  <img src="https://img.shields.io/badge/QBOSS--3L-Quantum%20Biometric%20OS%20Security-blueviolet?style=for-the-badge&logo=data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0id2hpdGUiPjxwYXRoIGQ9Ik0xMiAxYTExIDExIDAgMSAwIDAgMjIgMTEgMTEgMCAwIDAgMC0yMnptMCAyMGE5IDkgMCAxIDEgMC0xOCA5IDkgMCAwIDEgMCAxOHoiLz48cGF0aCBkPSJNMTIgNmEyIDIgMCAwIDAtMiAydjRhMiAyIDAgMCAwIDQgMFY4YTIgMiAwIDAgMC0yLTJ6Ii8+PC9zdmc+" alt="QBOSS-3L Badge" />
</p>

<h1 align="center">🔐 QBOSS-3L</h1>

<h3 align="center">
  <em>Quantum-enhanced Biometric Operating System Security — 3-Layer Authentication</em>
</h3>

<p align="center">
  <img src="https://img.shields.io/badge/Python-3.10+-3776AB?style=flat-square&logo=python&logoColor=white" />
  <img src="https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=black" />
  <img src="https://img.shields.io/badge/Flask-3.1-000000?style=flat-square&logo=flask&logoColor=white" />
  <img src="https://img.shields.io/badge/Vite-8-646CFF?style=flat-square&logo=vite&logoColor=white" />
  <img src="https://img.shields.io/badge/OpenCV-4.11-5C3EE8?style=flat-square&logo=opencv&logoColor=white" />
  <img src="https://img.shields.io/badge/MediaPipe-0.10-00A98F?style=flat-square&logo=google&logoColor=white" />
  <img src="https://img.shields.io/badge/License-MIT-green?style=flat-square" />
</p>

<p align="center">
  A next-generation, multi-modal biometric authentication system featuring <strong>4 sequential verification layers</strong> — face recognition, hand geometry, gesture passwords, and quantum-inspired voice verification (QNV) — all orchestrated through a sleek, real-time web interface.
</p>

---

## 📋 Table of Contents

- [Overview](#-overview)
- [Architecture](#-architecture)
- [The 4 Security Layers](#-the-4-security-layers)
- [Quantum Noise Voice (QNV) Engine](#-quantum-noise-voice-qnv-engine)
- [Security Model](#-security-model)
- [Tech Stack](#-tech-stack)
- [Project Structure](#-project-structure)
- [Getting Started](#-getting-started)
- [API Reference](#-api-reference)
- [Admin Panel](#-admin-panel)
- [CLI Tools](#-cli-tools)
- [Contributing](#-contributing)
- [License](#-license)

---

## 🧠 Overview

**QBOSS-3L** implements a "vault" paradigm — a secure resource can only be unlocked by sequentially passing all 4 biometric layers in real-time. Unlike traditional password systems, each layer captures a fundamentally different biometric modality, making spoofing or replay attacks exponentially harder.

```
┌────────────────────────────────────────────────────────┐
│                   🔒 VAULT LOCKED                      │
│                                                        │
│  Layer 1 → 👤 Face Recognition      [DCT + LBP]       │
│  Layer 2 → ✋ Hand Biometric         [SVM + MediaPipe] │
│  Layer 3 → 🤙 Gesture Password      [Sequence Match]  │
│  Layer 4 → 🎙️ Voice + QNV           [Phase Projection]│
│                                                        │
│  All 4 ✓ → 🔓 ACCESS GRANTED                          │
└────────────────────────────────────────────────────────┘
```

### Key Highlights

- **Multi-factor, multi-modal** — 4 independent biometric channels
- **Real-time verification** — Live webcam + microphone processing
- **Quantum-inspired voice protection** — Stochastic phase projection (QNV)
- **Anti-replay detection** — Audio fingerprinting prevents recorded playback
- **Encrypted storage** — Fernet (AES-128-CBC) encryption for all biometric templates
- **Integrity verification** — SHA-256 checksums on every biometric read
- **Multi-user support** — Full user management with per-user enrollment profiles
- **Audit logging** — Complete verification trail for forensic analysis

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        FRONTEND (React + Vite)                  │
│  ┌───────────┐  ┌───────────┐  ┌───────────┐  ┌─────────────┐  │
│  │ LockScreen│  │ Enrollment│  │ AdminPanel│  │ DatabasePanel│ │
│  │  (4-Layer │  │ (Biometric│  │ (User Mgmt│  │ (Audit Logs, │ │
│  │   Verify) │  │  Capture) │  │  + Status)│  │  Enrollment) │ │
│  └─────┬─────┘  └─────┬─────┘  └─────┬─────┘  └──────┬──────┘  │
│        └───────────────┴───────────────┴───────────────┘        │
│                            REST API                             │
└────────────────────────────────┬────────────────────────────────┘
                                 │ HTTP (JSON + FormData)
┌────────────────────────────────┴────────────────────────────────┐
│                     BACKEND (Flask + Python)                    │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────────────┐  │
│  │   Face   │  │   Hand   │  │ Gestures │  │     Voice      │  │
│  │ OpenCV   │  │MediaPipe │  │MediaPipe │  │ Librosa + QNV  │  │
│  │ DCT+LBP  │  │ SVM/RBF  │  │ Sequence │  │ Phase Project. │  │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └───────┬────────┘  │
│       └──────────────┴──────────────┴───────────────┘           │
│                            │                                    │
│  ┌─────────────────────────┴──────────────────────────────────┐ │
│  │               Biometric Store (SQLite + Fernet)            │ │
│  │  • AES-128-CBC encrypted templates                         │ │
│  │  • SHA-256 integrity checks on every read                  │ │
│  │  • Versioned enrollment with audit log                     │ │
│  └────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🔑 The 4 Security Layers

### Layer 1: 👤 Face Recognition

| Component | Detail |
|-----------|--------|
| **Detection** | Haar Cascade Classifier (`haarcascade_frontalface_default`) |
| **Feature Extraction** | DCT (Discrete Cosine Transform) + LBP (Local Binary Pattern) |
| **Embedding Dimension** | 128-D normalized vector |
| **Enrollment** | Minimum 5 face samples, quality-rated (Excellent/Good/Fair/Poor) |
| **Verification** | Cosine similarity against stored mean embedding |
| **Preprocessing** | Histogram equalization, face crop with 18% margin, resize to 64×64 |

The face engine extracts a **64-dimensional DCT** feature set from the frequency domain and a **64-dimensional LBP histogram** capturing texture patterns across 4 spatial regions, producing a **128-D L2-normalized embedding**.

---

### Layer 2: ✋ Hand Biometric

| Component | Detail |
|-----------|--------|
| **Detection** | MediaPipe Hands (21 landmarks per hand) |
| **Feature Extraction** | Normalized inter-landmark distances and angles |
| **Classification** | SVM with RBF kernel (scikit-learn) |
| **Enrollment** | Minimum 20 positive + 20 negative hand samples |
| **Verification** | SVM probability output with threshold |

Hand geometry features are extracted from MediaPipe's 21-point hand landmark model, computing normalized distances and angular relationships that capture the unique proportions of an individual's hand.

---

### Layer 3: 🤙 Gesture Password

| Component | Detail |
|-----------|--------|
| **Detection** | MediaPipe Hands |
| **Recognition** | Rule-based finger state classifier |
| **Supported Gestures** | `fist`, `palm`, `peace`, `point`, `three`, `five`, `rock`, `two`, `ok` |
| **Password Format** | Ordered sequence of 3 gestures |
| **Verification** | Exact sequence match with 10-frame stability requirement |

Users define a **3-gesture sequence** (e.g., `peace → fist → ok`) during enrollment. During verification, each gesture must be held stably for 10 consecutive frames before being captured, preventing accidental triggers.

---

### Layer 4: 🎙️ Voice + Quantum Noise Voice (QNV)

| Component | Detail |
|-----------|--------|
| **Feature Extraction** | 194-D acoustic vector (MFCCs, deltas, Δ², mel-spectrogram, spectral stats, pitch) |
| **QNV Projection** | 160-D quantum-inspired stochastic phase projection |
| **Anti-Replay** | Audio fingerprinting with SHA-256 hash comparison |
| **Challenge-Response** | Server-generated spoken challenge for liveness |
| **Quality Metrics** | Duration, RMS, clipping, silence ratio, voiced ratio, spectral flatness |
| **Enrollment** | Minimum 3 voice samples |

> This layer is the most sophisticated — see the [QNV Engine section](#-quantum-noise-voice-qnv-engine) below.

---

## ⚛️ Quantum Noise Voice (QNV) Engine

The QNV engine is the crown jewel of QBOSS-3L. It applies a **quantum-inspired stochastic transformation** to voice biometric vectors, creating a mathematical space where template theft is computationally useless.

### How QNV Works

```
Raw Audio → [194-D Acoustic Vector] → [QNV Phase Projection] → [160-D Protected Vector]
                                              │
                                    ┌─────────┴──────────┐
                                    │  Per-user salt      │
                                    │  BLAKE2b seeded RNG │
                                    │  Random projection  │
                                    │  Phase mixing:      │
                                    │  sin(Ax + φ) ×      │
                                    │  cos(0.5Ax - φ)     │
                                    │  L2 normalization    │
                                    └─────────────────────┘
```

#### 1. Acoustic Feature Extraction (194-D)
The system extracts a rich acoustic profile:
- **24 MFCCs** + deltas + Δ² (mean & std) = 144 dimensions
- **16-band mel-spectrogram** (mean & std) = 32 dimensions
- **Spectral statistics**: centroid, bandwidth, rolloff, flatness, ZCR, RMS = 12 dimensions
- **Pitch statistics**: log-F0 mean/std, P10/P90, jitter, voiced probability = 6 dimensions

Features are robustly normalized: `tanh((x - median) / IQR / 3)`

#### 2. Quantum-Inspired Phase Projection (160-D)
For each user, a **unique random projection matrix** is deterministically generated from:
```python
seed = BLAKE2b("qnv-matrix" || salt || user_id || input_dim || output_dim)
matrix = Normal(0, 1/√input_dim)   # Random Gaussian projection
phase  = Uniform(-π, π)             # Random phase offsets
```

The projection applies **nonlinear phase mixing**:
```
projected = matrix @ vector
mixed = sin(projected + phase) × cos(0.5 × projected - phase)
output = mixed / ‖mixed‖₂
```

This bounded, nonlinear transform means:
- **No inverse exists** — you cannot recover the original voice features from the QNV vector
- **Per-user uniqueness** — same voice produces completely different QNV vectors for different users
- **Template non-reversibility** — stolen QNV templates cannot be used to reconstruct voice data

#### 3. Multi-Score Fusion Verification
Verification combines multiple distance metrics:

| Metric | Weight | Threshold |
|--------|--------|-----------|
| Acoustic Z-distance | 42% | ≤ 3.75 |
| QNV Z-distance | ~22% | ≤ 3.65 |
| QNV Cosine distance | ~16% | ≤ 0.46 |
| Quality penalty | 20% | ≤ 0.62 |
| Replay detection | +35% penalty | Must be false |

All conditions must be satisfied simultaneously — a single failure rejects the attempt.

#### 4. Anti-Replay Protection
Every audio sample is fingerprinted:
1. Resample to 2 kHz
2. Normalize amplitude
3. Quantize to 8-bit signed integers
4. SHA-256 hash the byte stream

If the fingerprint matches any enrolled sample, verification is **immediately rejected** with a 35% penalty score, defeating recorded playback attacks.

---

## 🛡️ Security Model

### Encryption at Rest
```
Biometric Data → Fernet.encrypt(data) → SQLite BLOB
                      │
           ┌──────────┴───────────┐
           │ AES-128-CBC          │
           │ HMAC-SHA256 auth tag │
           │ Per-installation key │
           │ Key file: 0600 perms │
           └──────────────────────┘
```

### Integrity Verification
Every biometric template is stored with a SHA-256 hash. On each read:
```python
plaintext = decrypt(blob)
assert sha256(plaintext) == stored_hash  # Tamper detection
```

### Data Isolation
- Each biometric modality is stored independently per user
- Users are managed with unique IDs and usernames
- Deletion cascades through foreign key constraints
- Complete audit trail of enroll/verify/delete operations

---

## 🛠️ Tech Stack

### Backend
| Technology | Purpose |
|------------|---------|
| **Python 3.10+** | Runtime |
| **Flask 3.1** | REST API framework |
| **OpenCV 4.11** | Face detection & feature extraction |
| **MediaPipe 0.10** | Hand landmark detection |
| **scikit-learn 1.6** | SVM classification for hand biometrics |
| **Librosa 0.10** | Audio processing & feature extraction |
| **NumPy 1.26** | Numerical computation |
| **cryptography 47+** | Fernet encryption for biometric storage |
| **SQLite** | Database (WAL mode, foreign keys) |

### Frontend
| Technology | Purpose |
|------------|---------|
| **React 19** | UI framework |
| **React Router 7** | Client-side routing |
| **Vite 8** | Build tool & dev server |
| **Web APIs** | MediaDevices (camera), MediaRecorder (audio) |

---

## 📁 Project Structure

```
QBOSS-3L/
├── backend/
│   ├── app.py                    # Flask API server (all endpoints)
│   ├── requirements.txt          # Python dependencies
│   ├── db/
│   │   └── biometric_store.py    # Encrypted SQLite storage + audit log
│   ├── face/
│   │   ├── face_enroll.py        # DCT + LBP face embedding engine
│   │   └── face_verify.py        # Face verification + frame processing
│   ├── biometrics/
│   │   ├── hand_enroll.py        # SVM hand model training
│   │   ├── hand_verify.py        # Hand geometry verification
│   │   └── hand_features.py      # MediaPipe landmark feature extraction
│   ├── gestures/
│   │   ├── gesture_detector.py   # Real-time gesture classification
│   │   ├── gesture_enroll.py     # Gesture sequence enrollment
│   │   └── gesture_verify.py     # Gesture sequence verification
│   └── voice/
│       ├── features.py           # 194-D acoustic feature extraction
│       ├── qnv.py                # Quantum Noise Voice projection engine
│       ├── verify.py             # Voice verification orchestrator
│       ├── challenge.py          # Challenge-response liveness system
│       └── config.py             # Audio processing constants
│
├── frontend/
│   ├── index.html
│   ├── package.json
│   ├── vite.config.js
│   └── src/
│       ├── App.jsx               # Route definitions
│       ├── main.jsx              # React entry point
│       ├── App.css               # Global styles & design system
│       ├── index.css             # Base styles
│       ├── components/
│       │   ├── LockScreen.jsx    # 4-layer live verification UI
│       │   ├── Enrollment.jsx    # Biometric enrollment wizard
│       │   ├── AdminPanel.jsx    # User & system management
│       │   ├── DatabasePanel.jsx # Enrollment status & audit logs
│       │   ├── Dashboard.jsx     # System overview
│       │   ├── FaceVerify.jsx    # Face verification component
│       │   ├── HandVerify.jsx    # Hand verification component
│       │   ├── GestureVerify.jsx # Gesture verification component
│       │   ├── VoiceVerify.jsx   # Voice verification component
│       │   ├── Layout.jsx        # App shell layout
│       │   └── AdminLayout.jsx   # Admin panel layout
│       └── utils/
│           ├── api.js            # Backend API client
│           └── audio.js          # WAV recording utility
│
├── CLI/                          # Standalone CLI tools
│   ├── Hand/                     # CLI hand biometric module
│   └── Voicee/                   # CLI voice biometric module
│
├── CONTRIBUTORS.md
└── README.md
```

---

## 🚀 Getting Started

### Prerequisites

- **Python** 3.10 or higher
- **Node.js** 18 or higher
- **npm** 9 or higher
- A **webcam** and **microphone** for biometric capture

### 1. Clone the Repository

```bash
git clone https://github.com/viswaspp/QBOSS-3L.git
cd QBOSS-3L
```

### 2. Backend Setup

```bash
# Create and activate a virtual environment
cd backend
python -m venv .venv

# Windows
.venv\Scripts\activate

# macOS / Linux
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt
```

### 3. Start the Backend Server

```bash
python app.py
```

The API server starts at **http://localhost:5001**

You should see:
```
==================================================
  QBOSS-3L Biometric Auth API  v2.0 (multi-user)
  Running on http://localhost:5001
==================================================
```

### 4. Frontend Setup

```bash
# Open a new terminal
cd frontend
npm install
npm run dev
```

The frontend dev server starts at **http://localhost:5173**

### 5. First-Time Usage

1. Navigate to **http://localhost:5173/admin** → create a new user
2. Go to **http://localhost:5173/enroll** → enroll all 4 biometric layers
3. Go to **http://localhost:5173/** → authenticate through the 4-layer vault

---

## 📡 API Reference

### System

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/status` | Service health check |
| `GET` | `/api/diagnostics` | Backend module availability report |

### User Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/users` | List all users with enrollment status |
| `POST` | `/api/users` | Create a new user (`username`, `display_name`) |
| `GET` | `/api/users/:id` | Get user details + enrollment status |
| `DELETE` | `/api/users/:id` | Delete user and all biometric data |

### Face Authentication

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/auth/face/process` | Detect face & extract embedding from frame |
| `POST` | `/api/auth/face/enroll` | Enroll face embeddings (min 5 samples) |
| `POST` | `/api/auth/face/verify` | Verify face embedding against profile |
| `GET` | `/api/auth/face/meta` | Get face enrollment metadata |

### Hand Authentication

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/auth/hand/frame` | Process hand frame & extract landmarks |
| `POST` | `/api/auth/hand/enroll` | Train SVM on hand samples (min 20+20) |
| `POST` | `/api/auth/hand/verify` | Verify hand landmarks against model |

### Gesture Authentication

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/gesture/detect` | Detect gesture from camera frame |
| `POST` | `/api/gesture/enroll` | Save gesture password sequence |
| `POST` | `/api/gesture/verify` | Verify gesture sequence |
| `GET` | `/api/gesture/count` | Get enrolled gesture count |

### Voice + QNV Authentication

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/auth/voice/challenge` | Get challenge phrase for liveness |
| `POST` | `/api/auth/voice/enroll` | Create QNV voice profile (min 3 samples) |
| `POST` | `/api/auth/voice/verify` | Verify voice with QNV + anti-replay |

### Database & Audit

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/db/status` | Enrollment status per modality |
| `GET` | `/api/db/audit` | Enrollment/verification audit log |
| `DELETE` | `/api/db/delete/:modality` | Delete specific biometric enrollment |
| `GET` | `/api/models/status` | Per-user enrollment model status |

---

## ⚙️ Admin Panel

Access the admin panel at `/admin` to:

- **User Management** — Create, view, and delete user profiles
- **Enrollment Status** — See which biometric layers each user has enrolled
- **Database Inspector** — Browse encrypted biometric profiles and metadata
- **Audit Logs** — Full chronological log of all enroll/verify/delete events
- **System Diagnostics** — Check backend module availability and health

---

## 🖥️ CLI Tools

The `CLI/` directory contains standalone command-line tools for individual biometric testing:

### Hand Biometric CLI (`CLI/Hand/`)
Standalone hand geometry enrollment and verification via terminal.

### Voice Biometric CLI (`CLI/Voicee/`)
Standalone voice enrollment and verification with QNV processing.

These are useful for testing individual modalities without the full web stack.

---

## 🤝 Contributing

We welcome contributions! See [CONTRIBUTORS.md](CONTRIBUTORS.md) for the current team.

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Development Notes

- Backend runs on port **5001**, frontend on **5173**
- CORS is configured for both localhost ports
- SQLite database is auto-created in `backend/models/`
- Encryption key is auto-generated on first run

---

## 📄 License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.

---

<p align="center">
  <sub>Built with 🔐 by <a href="https://github.com/viswaspp">Viswas PP</a> & <a href="https://github.com/kanika1511">Kanika Sangwan</a></sub>
</p>
