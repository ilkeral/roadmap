"""
Simulation API Router - Endpoints for route simulation and animation data
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from typing import List, Optional
import json

from app.core.database import get_db
from app.models.schemas import SimulationConfig

router = APIRouter()


@router.get("/data")
async def get_simulation_data(
    db: AsyncSession = Depends(get_db)
):
    """
    Get all data needed for the simulation visualization.
    
    Returns employees, stops, and routes in a format ready for the frontend.
    """
    # Get employees
    emp_query = text("""
        SELECT e.id, e.name, 
               ST_Y(e.home_location) as lat, 
               ST_X(e.home_location) as lng,
               e.assigned_stop_id,
               e.address,
               e.photo_url,
               e.shift_id,
               s.name as shift_name,
               s.color as shift_color
        FROM employees e
        LEFT JOIN shifts s ON e.shift_id = s.id
    """)
    emp_result = await db.execute(emp_query)
    employees = [
        {
            "id": row.id,
            "name": row.name,
            "location": {"lat": row.lat, "lng": row.lng},
            "assigned_stop_id": row.assigned_stop_id,
            "address": row.address,
            "photo_url": row.photo_url,
            "shift_id": row.shift_id,
            "shift_name": row.shift_name,
            "shift_color": row.shift_color
        }
        for row in emp_result.fetchall()
    ]
    
    # Get stops
    stop_query = text("""
        SELECT id, name, 
               ST_Y(location) as lat, 
               ST_X(location) as lng,
               cluster_id, employee_count
        FROM shuttle_stops
    """)
    stop_result = await db.execute(stop_query)
    stops = [
        {
            "id": row.id,
            "name": row.name,
            "location": {"lat": row.lat, "lng": row.lng},
            "cluster_id": row.cluster_id,
            "employee_count": row.employee_count
        }
        for row in stop_result.fetchall()
    ]
    
    # Get latest optimization result
    opt_query = text("""
        SELECT id, total_vehicles_used, total_distance, total_duration,
               parameters, created_at
        FROM optimization_results
        ORDER BY created_at DESC
        LIMIT 1
    """)
    opt_result = await db.execute(opt_query)
    optimization = opt_result.fetchone()
    
    return {
        "employees": employees,
        "stops": stops,
        "optimization": {
            "id": optimization.id if optimization else None,
            "total_vehicles": optimization.total_vehicles_used if optimization else 0,
            "total_distance": optimization.total_distance if optimization else 0,
            "parameters": optimization.parameters if optimization else None
        } if optimization else None,
        "stats": {
            "total_employees": len(employees),
            "total_stops": len(stops),
            "assigned_employees": len([e for e in employees if e["assigned_stop_id"]])
        }
    }


@router.get("/animation-frames")
async def get_animation_frames(
    route_data: str = Query(..., description="JSON encoded route data"),
    frame_count: int = Query(100, ge=10, le=1000, description="Number of animation frames")
):
    """
    Generate animation frames for route visualization.
    
    Takes route polyline data and generates interpolated positions
    for smooth vehicle animation.
    """
    try:
        routes = json.loads(route_data)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid route data JSON")
    
    frames = []
    
    for route in routes:
        polyline = route.get("polyline", [])
        if not polyline:
            continue
        
        vehicle_frames = []
        total_points = len(polyline)
        
        if total_points < 2:
            continue
        
        # Generate interpolated positions
        for frame_idx in range(frame_count):
            progress = frame_idx / (frame_count - 1)
            point_idx = int(progress * (total_points - 1))
            
            # Linear interpolation between points
            if point_idx < total_points - 1:
                p1 = polyline[point_idx]
                p2 = polyline[point_idx + 1]
                
                local_progress = (progress * (total_points - 1)) - point_idx
                
                lat = p1["lat"] + (p2["lat"] - p1["lat"]) * local_progress
                lng = p1["lng"] + (p2["lng"] - p1["lng"]) * local_progress
            else:
                lat = polyline[-1]["lat"]
                lng = polyline[-1]["lng"]
            
            vehicle_frames.append({
                "frame": frame_idx,
                "position": {"lat": lat, "lng": lng},
                "progress": progress
            })
        
        frames.append({
            "vehicle_id": route.get("vehicle_id"),
            "frames": vehicle_frames
        })
    
    return {
        "frame_count": frame_count,
        "vehicles": frames
    }


@router.get("/bounds")
async def get_map_bounds(db: AsyncSession = Depends(get_db)):
    """
    Calculate the bounding box for all data to center the map.
    """
    # Get bounds from employees
    emp_bounds_query = text("""
        SELECT 
            MIN(ST_Y(home_location)) as min_lat,
            MAX(ST_Y(home_location)) as max_lat,
            MIN(ST_X(home_location)) as min_lng,
            MAX(ST_X(home_location)) as max_lng
        FROM employees
    """)
    
    result = await db.execute(emp_bounds_query)
    row = result.fetchone()
    
    if row.min_lat is None:
        # No data, return default bounds (Istanbul)
        return {
            "center": {"lat": 41.0082, "lng": 28.9784},
            "bounds": {
                "north": 41.1,
                "south": 40.9,
                "east": 29.1,
                "west": 28.8
            },
            "zoom": 12
        }
    
    # Add padding
    lat_padding = (row.max_lat - row.min_lat) * 0.1
    lng_padding = (row.max_lng - row.min_lng) * 0.1
    
    return {
        "center": {
            "lat": (row.min_lat + row.max_lat) / 2,
            "lng": (row.min_lng + row.max_lng) / 2
        },
        "bounds": {
            "north": row.max_lat + lat_padding,
            "south": row.min_lat - lat_padding,
            "east": row.max_lng + lng_padding,
            "west": row.min_lng - lng_padding
        },
        "zoom": 13
    }


@router.get("/colors")
async def get_route_colors():
    """Get color palette for route visualization."""
    return {
        "routes": [
            "#FF6B6B",  # Red
            "#4ECDC4",  # Teal
            "#45B7D1",  # Blue
            "#96CEB4",  # Green
            "#FFEAA7",  # Yellow
            "#DDA0DD",  # Plum
            "#98D8C8",  # Mint
            "#F7DC6F",  # Gold
            "#BB8FCE",  # Purple
            "#85C1E9",  # Light Blue
        ],
        "stops": "#FF5722",
        "depot": "#4CAF50",
        "employees": "#2196F3",
        "clusters": [
            "#E53935", "#D81B60", "#8E24AA", "#5E35B1",
            "#3949AB", "#1E88E5", "#039BE5", "#00ACC1",
            "#00897B", "#43A047", "#7CB342", "#C0CA33"
        ]
    }
