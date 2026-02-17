"""
Employee Shuttle Route Optimization System - Main Application
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import logging

from app.core.config import settings
from app.core.database import init_db
from app.api import employees, stops, optimization, routes, simulation, settings as settings_api, simulations

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler"""
    logger.info("Starting up Shuttle Route Optimization System...")
    await init_db()
    yield
    logger.info("Shutting down...")


app = FastAPI(
    title="Employee Shuttle Route Optimization System",
    description="A system for optimizing shuttle routes to transport employees with CVRP algorithms",
    version="1.0.0",
    lifespan=lifespan
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(employees.router, prefix="/api/employees", tags=["Employees"])
app.include_router(stops.router, prefix="/api/stops", tags=["Stops"])
app.include_router(optimization.router, prefix="/api/optimization", tags=["Optimization"])
app.include_router(routes.router, prefix="/api/routes", tags=["Routes"])
app.include_router(simulation.router, prefix="/api/simulation", tags=["Simulation"])
app.include_router(settings_api.router, prefix="/api/settings", tags=["Settings"])
app.include_router(simulations.router, prefix="/api/simulations", tags=["Simulations"])


@app.get("/")
async def root():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "service": "Shuttle Route Optimization System",
        "version": "1.0.0"
    }


@app.get("/health")
async def health_check():
    """Detailed health check"""
    return {
        "status": "healthy",
        "database": "connected",
        "osrm": settings.osrm_url
    }
