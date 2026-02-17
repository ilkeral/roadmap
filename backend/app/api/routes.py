"""
Routes API Router - Manage and retrieve route data
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from typing import List
from pydantic import BaseModel
import json

from app.core.database import get_db
from app.services.osrm_service import osrm_service
from app.services.ors_service import ors_service

router = APIRouter()


@router.get("/")
async def get_routes(db: AsyncSession = Depends(get_db)):
    """Get all saved routes."""
    query = text("""
        SELECT r.id, r.vehicle_id, r.total_distance, r.total_duration,
               r.route_order, r.created_at,
               v.name as vehicle_name, v.capacity as vehicle_capacity
        FROM routes r
        JOIN vehicles v ON r.vehicle_id = v.id
        ORDER BY r.created_at DESC
    """)
    
    result = await db.execute(query)
    
    return [
        {
            "id": row.id,
            "vehicle_id": row.vehicle_id,
            "vehicle_name": row.vehicle_name,
            "vehicle_capacity": row.vehicle_capacity,
            "total_distance": row.total_distance,
            "total_duration": row.total_duration,
            "route_order": row.route_order,
            "created_at": row.created_at.isoformat()
        }
        for row in result.fetchall()
    ]


@router.get("/{route_id}")
async def get_route(route_id: int, db: AsyncSession = Depends(get_db)):
    """Get a specific route with all details."""
    query = text("""
        SELECT r.id, r.vehicle_id, r.total_distance, r.total_duration,
               r.route_order, r.created_at,
               v.name as vehicle_name, v.capacity as vehicle_capacity,
               ST_AsGeoJSON(r.polyline_geometry) as geometry
        FROM routes r
        JOIN vehicles v ON r.vehicle_id = v.id
        WHERE r.id = :id
    """)
    
    result = await db.execute(query, {"id": route_id})
    row = result.fetchone()
    
    if not row:
        raise HTTPException(status_code=404, detail="Route not found")
    
    # Get stops for this route
    stops_query = text("""
        SELECT rs.stop_order, rs.arrival_time, rs.passengers_pickup,
               s.id as stop_id, s.name as stop_name,
               ST_Y(s.location) as lat, ST_X(s.location) as lng
        FROM route_stops rs
        JOIN shuttle_stops s ON rs.stop_id = s.id
        WHERE rs.route_id = :route_id
        ORDER BY rs.stop_order
    """)
    
    stops_result = await db.execute(stops_query, {"route_id": route_id})
    stops = [
        {
            "stop_id": stop.stop_id,
            "stop_name": stop.stop_name,
            "location": {"lat": stop.lat, "lng": stop.lng},
            "stop_order": stop.stop_order,
            "arrival_time": stop.arrival_time,
            "passengers_pickup": stop.passengers_pickup
        }
        for stop in stops_result.fetchall()
    ]
    
    # Parse geometry
    geometry = []
    if row.geometry:
        geo_json = json.loads(row.geometry)
        if geo_json.get("coordinates"):
            geometry = [
                {"lat": coord[1], "lng": coord[0]}
                for coord in geo_json["coordinates"]
            ]
    
    return {
        "id": row.id,
        "vehicle_id": row.vehicle_id,
        "vehicle_name": row.vehicle_name,
        "vehicle_capacity": row.vehicle_capacity,
        "total_distance": row.total_distance,
        "total_duration": row.total_duration,
        "stops": stops,
        "polyline": geometry,
        "created_at": row.created_at.isoformat()
    }


@router.post("/calculate")
async def calculate_route(
    stop_ids: List[int],
    db: AsyncSession = Depends(get_db)
):
    """
    Calculate route through specified stops.
    
    This is for manual route planning/testing.
    """
    if len(stop_ids) < 2:
        raise HTTPException(status_code=400, detail="Need at least 2 stops")
    
    # Get stop coordinates
    placeholders = ", ".join([f":id{i}" for i in range(len(stop_ids))])
    query = text(f"""
        SELECT id, ST_Y(location) as lat, ST_X(location) as lng
        FROM shuttle_stops
        WHERE id IN ({placeholders})
    """)
    
    params = {f"id{i}": sid for i, sid in enumerate(stop_ids)}
    result = await db.execute(query, params)
    
    stop_coords = {row.id: (row.lat, row.lng) for row in result.fetchall()}
    
    # Order coordinates by input order
    coordinates = [stop_coords[sid] for sid in stop_ids if sid in stop_coords]
    
    if len(coordinates) < 2:
        raise HTTPException(status_code=404, detail="Stops not found")
    
    # Get route from OSRM
    route_data = await osrm_service.get_route(coordinates)
    
    return {
        "stops": stop_ids,
        "distance": route_data.get("distance", 0),
        "duration": route_data.get("duration", 0),
        "polyline": route_data.get("geometry", [])
    }


@router.delete("/")
async def delete_all_routes(db: AsyncSession = Depends(get_db)):
    """Delete all saved routes."""
    await db.execute(text("DELETE FROM route_stops"))
    await db.execute(text("DELETE FROM routes"))
    await db.commit()
    return {"deleted": True}


class MeasurePoint(BaseModel):
    lat: float
    lng: float


class MeasureRequest(BaseModel):
    points: List[MeasurePoint]


@router.post("/measure")
async def measure_distance(request: MeasureRequest):
    """
    Measure real road distance and duration between points.
    Uses OSRM to calculate actual driving and walking routes.
    """
    if len(request.points) < 2:
        raise HTTPException(status_code=400, detail="En az 2 nokta gerekli")
    
    # Convert to coordinate tuples
    coordinates = [(p.lat, p.lng) for p in request.points]
    
    # Get driving route from OSRM (car profile)
    driving_data = await osrm_service.get_route(coordinates)
    
    # Get walking route from OpenRouteService API
    walking_data = await ors_service.get_walking_route(coordinates)
    
    # If ORS failed (fallback), use driving route geometry with walking time
    if walking_data.get("fallback"):
        walking_distance = driving_data.get("distance", 0)
        walking_polyline = driving_data.get("geometry", [])
        walking_duration = walking_distance / 1.39  # 5 km/h
    else:
        walking_distance = walking_data.get("distance", 0)
        walking_polyline = walking_data.get("geometry", [])
        walking_duration = walking_data.get("duration", 0)
    
    return {
        # Driving (araç)
        "distance": driving_data.get("distance", 0),
        "duration": driving_data.get("duration", 0),
        "polyline": driving_data.get("geometry", []),
        # Walking (yaya)
        "walking_distance": round(walking_distance),
        "walking_duration": round(walking_duration),
        "walking_polyline": walking_polyline
    }
