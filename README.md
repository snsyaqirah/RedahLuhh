# 🏍️ RedahLuhh

> Smart route weather tracker for Malaysian motorcyclists — redah tanpa ragu (ride without doubt)

![Status](https://img.shields.io/badge/status-live-brightgreen)
![Version](https://img.shields.io/badge/version-0.3.0-blue)
![License](https://img.shields.io/badge/license-MIT-lightgrey)

---

## 📖 Table of Contents

- [Overview](#-overview)
- [Features](#-features)
- [Tech Stack](#-tech-stack)
- [Architecture](#-architecture)
- [User Flow](#-user-flow)
- [Auth Flow](#-auth--session-flow)
- [Database](#-database-erd)
- [API Structure](#-api-structure)
- [Frontend Components](#-frontend-components)
- [Feature Flows](#-feature-specific-flows)
- [Getting Started](#-getting-started)
- [Environment Variables](#-environment-variables)
- [Deployment](#-deployment)
- [Project Structure](#-project-structure)
- [Roadmap](#-roadmap)
- [License](#-license)

---

## 🧭 Overview

RedahLuhh checks the weather at every kilometre of your route — not just the destination. Enter your origin and destination, pick a departure time, and get a colour-coded (green / yellow / red) breakdown across all available routes so you can choose the driest path before you ride. It also integrates live MET Malaysia official weather warnings and a real-time GPS navigation mode that keeps your screen on while riding.

**Type:** `Solo`
**Brand:** `Luhh Series`
**Built with:** Independent

---

## ✨ Features

- ✅ Real-time weather at every waypoint along the route (not just the destination)
- ✅ Multi-route comparison — up to 3 routes ranked by weather score (driest first)
- ✅ Google Maps with colour-coded polyline (green / yellow / red per segment)
- ✅ Departure time scheduler for future trip planning + hourly forecast
- ✅ 5-provider weather cascade with automatic fallback (XWeather → Meteoblue → Tomorrow.io → Open-Meteo → WeatherAPI)
- ✅ MET Malaysia official weather warnings integrated
- ✅ Go Now full-screen navigation mode with live GPS tracking + screen wake lock
- ✅ Day/night map theme auto-switched based on Malaysia local time
- ✅ Auto-detect current location on page load
- ✅ Feedback system with public wall and admin dashboard (Supabase)
- ✅ Per-provider quota alerts with transparent active provider display
- 🚧 Saved/favourite routes *(in progress)*
- 💡 Push notifications for weather changes mid-journey *(planned)*
- 💡 Offline mode / PWA *(planned)*

---

## 🛠 Tech Stack

```mermaid
graph TD
    subgraph Frontend
        FE["Next.js 14 + TypeScript"]
        UI["Tailwind CSS + clsx"]
        MAP["@vis.gl/react-google-maps"]
    end
    subgraph Backend
        BE["FastAPI + Uvicorn\nPython"]
        RL["slowapi\nRate Limiting"]
    end
    subgraph Infrastructure
        DB[("Supabase\nFeedback + Auth")]
        HO["Vercel + Render"]
        EX["Google Routes API\nGoogle Maps JS\nXWeather · Meteoblue\nTomorrow.io · Open-Meteo\nWeatherAPI · MET Malaysia"]
    end
    FE --> BE
    FE --> DB
    BE --> EX
```

| Layer | Technology |
|---|---|
| Frontend | Next.js 14, TypeScript, Tailwind CSS |
| Backend | FastAPI, Uvicorn, Python |
| Database | Supabase (PostgreSQL) |
| Auth | Supabase Auth (admin dashboard only) |
| Hosting | Vercel (frontend), Render (backend) |
| Routing | Google Routes API, Google Maps JS + Places |
| Weather | XWeather, Meteoblue, Tomorrow.io, Open-Meteo, WeatherAPI |
| Alerts | MET Malaysia official warnings |
| Other | slowapi (rate limiting), date-fns, clsx |

---

## 📌 Architecture

### High-level Architecture

```mermaid
graph TD
    U[User / Browser] --> FE[Next.js Frontend]
    FE --> API[FastAPI Backend]
    FE --> SB[(Supabase)]
    API --> GR[Google Routes API]
    API --> WC[Weather Cascade\nXWeather → Meteoblue → Tomorrow.io\n→ Open-Meteo → WeatherAPI]
    API --> MET[MET Malaysia\nWarnings]
```

### System Architecture

```mermaid
graph TD
    subgraph Frontend
        P[Pages] --> C[Components]
        C --> H[Hooks / API Client]
    end
    subgraph Backend
        R[Routes\n/api] --> MW[CORS + Rate Limiter]
        MW --> E[Route Handler]
        E --> MS[maps_service\ndecode + sample waypoints]
        E --> WS[weather_service\n5-provider cascade]
        E --> MM[met_malaysia_service\nofficial warnings]
    end
    H --> R
    WS --> EXT[External Weather APIs]
    MS --> GR[Google Routes API]
```

---

## 👤 User Flow

```mermaid
flowchart TD
    A([Start]) --> B[Landing Page]
    B --> C[Enter Origin + Destination\noptional: Departure Time]
    C --> D[POST /api/route-weather]
    D --> E{Routes returned?}
    E -->|Yes| F[View Map Tab\nColour-coded polyline + waypoints]
    E -->|No| G[Error message]
    F --> H[Switch to Summary Tab]
    F --> I[Select different route\ne.g. Driest vs Fastest]
    F --> J[Tap Go Now]
    J --> K[Full-screen GPS navigation\nScreen wake lock on]
    K --> L[15-min weather refresh]
    H --> M([Done])
    L --> M
```

### Page Map

```mermaid
graph TD
    subgraph Public ["🌐 Public Routes"]
        ROOT["/\nMain App"]
        CL["/changelog"]
        FB["/feedback\nPublic wall"]
    end
    subgraph Protected ["🔐 Admin Only"]
        ADMIN["/admin\nDashboard"]
    end
    ROOT --> CL
    ROOT --> FB
    ROOT --> ADMIN

    style Public fill:#e8f5e9,stroke:#4caf50
    style Protected fill:#e3f2fd,stroke:#2196f3
```

### Wireframe Overview

```mermaid
graph TD
    subgraph Home ["📄 / (Home)"]
        H1["Header: Logo + Backend status"]
        H2["Hero text (pre-search only)"]
        H3["RouteForm: origin · destination · departure"]
        H4["Route selector chips (multi-route)"]
        H5["Map | Summary tabs"]
        H6["WeatherMap / WeatherSummary"]
        H7["Mini waypoint cards (scroll)"]
        H8["Footer: version · provider"]
        H1 --> H2 --> H3 --> H4 --> H5 --> H6 --> H7 --> H8
    end

    subgraph Nav ["📄 Go Now (full-screen overlay)"]
        N1["Full-screen Google Map"]
        N2["Live GPS dot"]
        N3["Weather refresh banner"]
        N1 --> N2 --> N3
    end
```

---

## 🔐 Auth & Session Flow

> The main app requires no login — it is fully public. Auth applies only to the `/admin` dashboard, which uses Supabase email/password auth.

```mermaid
sequenceDiagram
    participant U as Developer
    participant FE as Admin Page
    participant SB as Supabase Auth

    U->>FE: Open /admin
    FE->>FE: Check localStorage isAdmin
    FE-->>U: Show login screen (if not set)

    U->>FE: Enter email + password
    FE->>SB: supabase.auth.signInWithPassword()
    SB-->>FE: Session token
    FE->>FE: localStorage.setItem("isAdmin", "true")
    FE-->>U: Show admin dashboard
```

---

## 🗄️ Database (ERD)

> Supabase is used exclusively for the feedback and analytics system. Weather data is fetched live from external APIs and never stored.

### Core ERD

```mermaid
erDiagram
    FEEDBACK {
        uuid id PK
        string category
        text message
        string status
        timestamp created_at
    }
    ADMIN_REPLY {
        uuid id PK
        uuid feedback_id FK
        text message
        timestamp created_at
    }
    ANALYTICS_EVENT {
        uuid id PK
        string event_type
        jsonb payload
        timestamp created_at
    }
    FEEDBACK ||--o{ ADMIN_REPLY : "has"
```

### Database Schema Overview

| Table | Purpose | Key Relations |
|---|---|---|
| `feedback` | User-submitted bug reports, enhancements, testimonials | — |
| `admin_reply` | Developer replies to feedback entries | belongs to `feedback` |
| `analytics_event` | Page views and interaction events | — |

---

## 🔌 API Structure

### API Structure

```mermaid
graph TD
    API[FastAPI]
    API --> Meta[meta]
    API --> WR[/api]

    Meta --> M1[GET /health]
    Meta --> M2[GET /api/provider-status]
    Meta --> M3[GET /api/debug-weather]

    WR --> W1[POST /api/route-weather]
```

### Endpoint Reference

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/health` | Service health check |
| `GET` | `/api/provider-status` | Active weather provider + exhaustion flags |
| `GET` | `/api/debug-weather?lat=&lon=` | Test WeatherAPI at a coordinate |
| `POST` | `/api/route-weather` | Main endpoint — returns weather for all routes |

### Request/Response Flow

```mermaid
sequenceDiagram
    participant FE as Frontend
    participant MW as CORS + Rate Limiter
    participant API as Route Handler
    participant GR as Google Routes
    participant WC as Weather Cascade
    participant MET as MET Malaysia

    FE->>MW: POST /api/route-weather {origin, destination, departure_time}
    MW->>API: Pass request (max 30/min/IP)
    API->>GR: Fetch up to 3 routes
    API->>MET: Fetch active warnings
    Note over API: concurrent via asyncio.gather
    API->>WC: Get weather per sampled waypoint
    WC-->>API: WeatherCondition per waypoint
    API->>API: Rank routes by weather score (driest first)
    API-->>FE: MultiRouteWeatherResponse
```

---

## 🧩 Frontend Components

### Component Tree

```mermaid
graph TD
    App["App\n(Next.js + APIProvider)"]
    App --> Layout["layout.tsx\nfont + metadata"]
    Layout --> Home["page.tsx\n(Home)"]
    Home --> RF["RouteForm\norigin · destination · departure"]
    Home --> WMap["WeatherMap\nGoogle Maps + polyline + Go Now"]
    Home --> WSumm["WeatherSummary\nfull route breakdown"]
    Home --> AT["AnalyticsTracker\nevent tracking"]
    Home --> FW["FeedbackWidget\nsubmission modal"]
    WMap --> WCard["WeatherCard\nper-waypoint popup"]
```

### Key Components

| Component | Purpose |
|---|---|
| `RouteForm` | Origin + destination autocomplete and optional departure time picker |
| `WeatherMap` | Google Maps with colour-coded polyline, emoji waypoint markers, and Go Now full-screen navigation |
| `WeatherCard` | Individual waypoint weather detail popup on the map |
| `WeatherSummary` | Full-route breakdown: overall status, waypoint list, MET warnings, alerts |
| `FeedbackWidget` | Floating feedback button + submission modal (writes to Supabase) |
| `AnalyticsTracker` | Passive event tracker (writes to Supabase) |

---

## ⚙️ Feature-specific Flows

### Weather Cascade Flow

```mermaid
flowchart TD
    A([Waypoint needs weather]) --> B{XWeather quota OK?}
    B -->|Yes| C[Fetch XWeather\nroad weather · SE Asia]
    B -->|No / error| D{Meteoblue quota OK?}
    C -->|Success| Z([Return WeatherCondition])
    C -->|Quota hit| D
    D -->|Yes| E[Fetch Meteoblue\nhigh-res tropical model]
    D -->|No / error| F{Tomorrow.io quota OK?}
    E -->|Success| Z
    E -->|Quota hit| F
    F -->|Yes| G[Fetch Tomorrow.io\nrealtime or forecast]
    F -->|No / error| H[Fetch Open-Meteo\nECMWF · fully free]
    G -->|Success| Z
    G -->|Quota hit| H
    H -->|Success| Z
    H -->|Error| I[Fetch WeatherAPI\nGFS · last resort]
    I -->|Success| Z
    I -->|Error| J([Return fallback\n'Weather data unavailable'])
```

### Go Now Navigation Flow

```mermaid
sequenceDiagram
    participant U as Rider
    participant FE as Frontend
    participant GPS as Browser Geolocation
    participant WL as WakeLock API
    participant API as Backend

    U->>FE: Tap "Go Now"
    FE->>GPS: watchPosition()
    FE->>WL: navigator.wakeLock.request("screen")
    WL-->>FE: WakeLock acquired (screen stays on)
    FE-->>U: Full-screen map with live GPS dot

    loop Every 15 minutes
        FE->>API: POST /api/route-weather (refresh)
        API-->>FE: Updated weather conditions
        FE-->>U: Weather refresh banner
    end

    U->>FE: Exit Go Now
    FE->>WL: wakeLock.release()
    FE->>GPS: clearWatch()
```

### Route Ranking Flow

```mermaid
flowchart TD
    A([Routes from Google]) --> B[Process each route concurrently]
    B --> C[Sample 3–7 waypoints per route]
    C --> D[Fetch weather per waypoint\nvia cascade]
    D --> E[Calculate weather score\ngreen=0 · yellow=1 · red=3]
    E --> F[Sort routes by score ascending]
    F --> G{Score tied?}
    G -->|Yes| H[Sort by duration ascending]
    G -->|No| I[Label routes]
    H --> I
    I --> J["Rank 0 → Recommended / Driest Route"]
    I --> K["Fastest Route (if not rank 0)"]
    I --> L["Alternative N"]
    J --> M([Return MultiRouteWeatherResponse])
    K --> M
    L --> M
```

---

## 🚀 Getting Started

### Prerequisites

- Node.js `>=18`
- Python `>=3.11`
- Docker + Docker Compose *(optional)*

### Installation

```bash
git clone https://github.com/syaqirah/RedahLuhh.git
cd RedahLuhh
```

### Running locally

```bash
# Backend
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000

# Frontend (separate terminal)
cd frontend
npm install
npm run dev
```

### Running with Docker

```bash
# Development
docker compose up --build
```

```mermaid
graph LR
    subgraph Dev ["docker-compose.yml"]
        D1["frontend\nNext.js :3000"]
        D2["backend\nFastAPI :8000\n--reload"]
        D1 -. "NEXT_PUBLIC_API_URL" .-> D2
    end
    B1["🌐 Browser"] --> D1
```

| Service | Dev URL |
|---|---|
| Frontend | http://localhost:3000 |
| Backend | http://localhost:8000 |
| API Docs | http://localhost:8000/docs |

---

## 🔑 Environment Variables

### Backend (`backend/.env`)

```env
# Google
GOOGLE_MAPS_API_KEY=

# Weather providers (cascade order)
XWEATHER_CLIENT_ID=
XWEATHER_CLIENT_SECRET=
METEOBLUE_API_KEY=
TOMORROW_API_KEY=
WEATHERAPI_KEY=

# CORS
CORS_ORIGINS=["http://localhost:3000"]
```

### Frontend (`frontend/.env.local`)

```env
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=
NEXT_PUBLIC_API_URL=http://localhost:8000

# Supabase (feedback + admin auth)
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

> Copy `backend/.env.example` and `frontend/.env.local.example` and fill in your values.

---

## ☁️ Deployment

```mermaid
graph LR
    GH["GitHub\nmain branch"] -->|push| CI["Vercel / Render\nauto-deploy"]
    CI --> FE["Vercel\nNext.js Frontend"]
    CI --> BE["Render\nFastAPI Backend"]
    BE --> EXT["Google Routes API\nWeather APIs\nMET Malaysia"]
    FE --> SB[("Supabase\nFeedback + Auth")]
```

| Service | Platform | Notes |
|---|---|---|
| Frontend | Vercel | Auto-deploy on push to `main` |
| Backend | Render | Free tier — ~30 s cold start on first request |
| Database | Supabase | Managed PostgreSQL + Auth |

---

## 📁 Project Structure

```
RedahLuhh/
├── docker-compose.yml
│
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   │   ├── page.tsx          # Main app (home)
│   │   │   ├── layout.tsx
│   │   │   ├── changelog/
│   │   │   ├── feedback/
│   │   │   └── admin/
│   │   ├── components/
│   │   │   ├── RouteForm.tsx
│   │   │   ├── WeatherMap.tsx
│   │   │   ├── WeatherCard.tsx
│   │   │   ├── WeatherSummary.tsx
│   │   │   ├── FeedbackWidget.tsx
│   │   │   └── AnalyticsTracker.tsx
│   │   ├── hooks/
│   │   │   ├── useRouteWeather.ts
│   │   │   └── useBackendHealth.ts
│   │   └── lib/
│   │       ├── api.ts
│   │       ├── supabase.ts
│   │       └── types.ts
│   └── [config files]
│
└── backend/
    └── app/
        ├── main.py
        ├── config.py
        ├── models/
        │   └── schemas.py
        ├── routers/
        │   └── weather_route.py
        └── services/
            ├── maps_service.py
            ├── weather_service.py
            └── met_malaysia_service.py
```

---

## 🗺 Roadmap

- [x] Real-time weather along entire route (v0.1.0)
- [x] Multi-route comparison with weather scoring (v0.2.0)
- [x] Departure time scheduler + hourly forecast (v0.2.0)
- [x] 5-provider weather cascade with automatic fallback (v0.3.0)
- [x] Go Now full-screen navigation + screen wake lock (v0.3.0)
- [x] MET Malaysia official weather warnings (v0.3.0)
- [x] Feedback system with admin dashboard (v0.3.0)
- [ ] Saved/favourite routes
- [ ] Push notifications for weather changes mid-journey
- [ ] Offline mode / PWA support

---

## 📄 License

[MIT](LICENSE) © 2025 Syaqirah
