# 🚌 Employee Shuttle Route Optimization & Simulation System

A professional, full-stack application for optimizing shuttle routes to transport employees to a workplace. The system uses advanced algorithms to cluster employees into stops, solve the Capacitated Vehicle Routing Problem (CVRP), and visualize routes on an interactive map.

![Architecture](https://img.shields.io/badge/Architecture-Microservices-blue)
![Python](https://img.shields.io/badge/Python-3.11-green)
![React](https://img.shields.io/badge/React-18.2-blue)
![Docker](https://img.shields.io/badge/Docker-Compose-blue)

## 📋 Table of Contents

- [Features](#-features)
- [Architecture](#-architecture)
- [Quick Start](#-quick-start)
- [OSRM Setup](#-osrm-setup)
- [Usage Guide](#-usage-guide)
- [API Documentation](#-api-documentation)
- [Algorithm Details](#-algorithm-details)
- [Configuration](#-configuration)
- [Development](#-development)
- [Troubleshooting](#-troubleshooting)

## ✨ Features

### Core Functionality
- **Employee Clustering**: DBSCAN algorithm groups employees within 200m walking distance
- **Route Optimization**: Google OR-Tools solves CVRP with mixed fleet (16 & 27-seater vehicles)
- **Real Road Routing**: OSRM provides actual road network distances and routes
- **Interactive Visualization**: React + Leaflet map with animated route simulation

### Technical Highlights
- **Spatial Queries**: PostGIS for efficient geographic calculations
- **Scalable**: Handles 200+ employees across multiple vehicles
- **Real-time Updates**: WebSocket-ready architecture
- **Docker Orchestration**: Single-command deployment

## 🏗 Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Docker Network                           │
├─────────────┬─────────────┬─────────────┬─────────────┬─────────┤
│   Frontend  │   Backend   │  PostgreSQL │    OSRM     │  OSRM   │
│   (React)   │  (FastAPI)  │  (PostGIS)  │  (Backend)  │ (Prep)  │
│   :3000     │   :8000     │   :5432     │   :5000     │  (init) │
└─────────────┴─────────────┴─────────────┴─────────────┴─────────┘
```

### Component Overview

| Service | Technology | Purpose |
|---------|------------|---------|
| Frontend | React 18 + Leaflet | Map visualization & UI |
| Backend | FastAPI + OR-Tools | API & optimization |
| Database | PostgreSQL 15 + PostGIS | Spatial data storage |
| Routing | OSRM | Road network calculations |

## 🚀 Quick Start

### Prerequisites

- Docker & Docker Compose installed
- At least 4GB RAM available
- Internet connection (for map tiles)

### Step 1: Clone and Navigate

```bash
cd /srv/RoadMap
```

### Step 2: Download OSRM Map Data

Before starting, you need to download OpenStreetMap data for your region:

```bash
# Create the data directory
mkdir -p osrm-data

# Download Turkey map data (or your preferred region)
# Option A: Turkey (recommended for Istanbul)
wget -O osrm-data/map.osm.pbf https://download.geofabrik.de/europe/turkey-latest.osm.pbf

# Option B: Smaller region - Istanbul extract (faster)
# wget -O osrm-data/map.osm.pbf https://download.geofabrik.de/europe/turkey/istanbul-latest.osm.pbf

# Option C: For testing - Monaco (tiny, downloads fast)
# wget -O osrm-data/map.osm.pbf https://download.geofabrik.de/europe/monaco-latest.osm.pbf
```

### Step 3: Start All Services

```bash
# Build and start all containers
docker-compose up --build

# Or run in detached mode
docker-compose up -d --build
```

**First Run Notes:**
- OSRM data preparation takes 5-30 minutes depending on map size
- PostgreSQL initialization runs database migrations
- Frontend builds React application

### Step 4: Access the Application

- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:8000
- **API Documentation**: http://localhost:8000/docs

## 🗺 OSRM Setup

### Understanding OSRM Data Preparation

OSRM requires preprocessed map data. The `osrm-prepare` container handles this automatically on first run:

```
osrm-extract → osrm-partition → osrm-customize
```

### Alternative Map Regions

| Region | Size | Download Command |
|--------|------|-----------------|
| Monaco | 1MB | `wget https://download.geofabrik.de/europe/monaco-latest.osm.pbf` |
| Istanbul | ~50MB | Regional extract |
| Turkey | ~500MB | `wget https://download.geofabrik.de/europe/turkey-latest.osm.pbf` |
| Germany | ~3GB | `wget https://download.geofabrik.de/europe/germany-latest.osm.pbf` |

### Manual OSRM Preparation (Optional)

If you need to re-prepare OSRM data:

```bash
docker-compose run --rm osrm-prepare
```

## 📖 Usage Guide

### 1. Generate Sample Employee Data

1. Open http://localhost:3000
2. In the left panel, set:
   - **Number of Employees**: 200
   - **Center Coordinates**: Istanbul (41.0082, 28.9784)
   - **Spread Radius**: 5 km
3. Click **"Generate 200 Employees"**

### 2. Configure Optimization Parameters

- **Max Walking Distance**: 200m (employees must be within this distance of their stop)
- **Fleet Configuration**:
  - 16-Seaters: 5 vehicles
  - 27-Seaters: 5 vehicles
- **Time Limit**: 30 seconds (solver time)

### 3. Set Depot Location

**Right-click** on the map to set the workplace/depot location (green marker).

### 4. Run Optimization

Click **"Run Optimization"** to:
1. Cluster employees into stops
2. Calculate distance matrix via OSRM
3. Solve CVRP with OR-Tools
4. Display optimized routes

### 5. View Simulation

Click **"Play"** in Animation Controls to watch shuttles travel their routes.

## 📚 API Documentation

### Key Endpoints

#### Generate Employees
```bash
POST /api/employees/generate
{
  "num_employees": 200,
  "center_lat": 41.0082,
  "center_lng": 28.9784,
  "spread_km": 5.0
}
```

#### Run Optimization
```bash
POST /api/optimization/run
{
  "depot_location": {"lat": 41.0082, "lng": 28.9784},
  "max_walking_distance": 200,
  "use_16_seaters": 5,
  "use_27_seaters": 5,
  "time_limit_seconds": 30
}
```

#### Get Simulation Data
```bash
GET /api/simulation/data
```

### Full API Documentation

Visit http://localhost:8000/docs for interactive Swagger documentation.

## 🧮 Algorithm Details

### Clustering Algorithm (DBSCAN)

```python
# DBSCAN parameters
eps = 200  # meters (max walking distance)
min_samples = 2  # minimum employees per stop

# Process:
1. Calculate geodesic distance matrix
2. Run DBSCAN with precomputed distances
3. Calculate cluster centroids as stop locations
4. Assign unclustered employees to nearest stops
```

### CVRP Solver (OR-Tools)

```python
# OR-Tools configuration
first_solution_strategy = PATH_CHEAPEST_ARC
local_search_metaheuristic = GUIDED_LOCAL_SEARCH
time_limit = 30 seconds

# Constraints:
- Vehicle capacities: [16, 16, 16, 16, 16, 27, 27, 27, 27, 27]
- Start/end at depot (index 0)
- Visit all stops exactly once
- Minimize total distance
```

### Distance Matrix

- **OSRM Available**: Real road network distances
- **Fallback**: Haversine (straight-line) × 1.4 approximation

## ⚙ Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | postgresql://... | PostgreSQL connection |
| `OSRM_URL` | http://osrm-backend:5000 | OSRM service URL |
| `CORS_ORIGINS` | http://localhost:3000 | Allowed origins |
| `REACT_APP_API_URL` | http://localhost:8000 | Backend API URL |

### Modifying Fleet Configuration

Edit `scripts/init-db.sql` to add more vehicles:

```sql
INSERT INTO vehicles (name, capacity, vehicle_type) VALUES
    ('Shuttle-40-A', 40, '40-seater');
```

## 🔧 Development

### Running Without Docker

**Backend:**
```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

**Frontend:**
```bash
cd frontend
npm install
npm start
```

### Project Structure

```
/srv/RoadMap/
├── docker-compose.yml
├── README.md
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt
│   └── app/
│       ├── main.py
│       ├── core/
│       │   ├── config.py
│       │   └── database.py
│       ├── api/
│       │   ├── employees.py
│       │   ├── stops.py
│       │   ├── optimization.py
│       │   ├── routes.py
│       │   └── simulation.py
│       ├── models/
│       │   └── schemas.py
│       └── services/
│           ├── clustering_service.py
│           ├── osrm_service.py
│           └── optimization_service.py
├── frontend/
│   ├── Dockerfile
│   ├── package.json
│   ├── public/
│   │   └── index.html
│   └── src/
│       ├── index.js
│       ├── App.js
│       ├── components/
│       │   ├── MapView.js
│       │   ├── ControlPanel.js
│       │   └── StatsPanel.js
│       ├── services/
│       │   └── api.js
│       └── styles/
│           └── index.css
├── osrm-data/
│   └── map.osm.pbf (download required)
└── scripts/
    └── init-db.sql
```

## 🔍 Troubleshooting

### OSRM Not Starting

**Problem**: `osrm-backend` container fails to start

**Solution**:
1. Ensure `osrm-data/map.osm.pbf` exists
2. Check if `osrm-prepare` completed successfully:
   ```bash
   docker-compose logs osrm-prepare
   ```
3. Re-run preparation:
   ```bash
   docker-compose run --rm osrm-prepare
   ```

### Database Connection Failed

**Problem**: Backend can't connect to PostgreSQL

**Solution**:
```bash
# Check if PostgreSQL is healthy
docker-compose ps postgres

# View logs
docker-compose logs postgres

# Restart database
docker-compose restart postgres
```

### Optimization Returns No Routes

**Problem**: CVRP solver finds no solution

**Possible Causes**:
- Total demand exceeds fleet capacity
- Time limit too short for complex problems

**Solutions**:
1. Add more vehicles
2. Increase time limit
3. Check employee count vs capacity

### Map Not Loading

**Problem**: Blank map in frontend

**Solutions**:
1. Check browser console for errors
2. Ensure Leaflet CSS is loaded
3. Verify API URL in environment

### Slow Optimization

**Problem**: Optimization takes too long

**Solutions**:
1. Reduce number of employees
2. Increase time limit (better solution quality vs time trade-off)
3. Use larger vehicles to reduce number of routes

## 📄 License

MIT License - feel free to use for personal or commercial projects.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Submit a pull request

---

**Built with ❤️ using FastAPI, React, OR-Tools, and OSRM**
