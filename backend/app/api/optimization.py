"""
Optimization API Router - Main endpoint for route optimization
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from typing import List
import logging

from app.core.database import get_db
from app.models.schemas import OptimizationParams, OptimizationResult, Coordinate
from app.services.clustering_service import cluster_employees
from app.services.osrm_service import osrm_service
from app.services.optimization_service import create_optimized_routes

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/run")
async def run_optimization(
    params: OptimizationParams,
    db: AsyncSession = Depends(get_db)
):
    """
    Run the complete route optimization pipeline.
    
    Steps:
    1. Fetch all employee locations from database
    2. Cluster employees into stops (within walking distance)
    3. Get distance matrix from OSRM
    4. Solve CVRP with OR-Tools
    5. Get route geometries from OSRM
    6. Save results to database
    """
    logger.info(f"Starting optimization with params: {params}")
    
    # Step 1: Fetch employees
    query = text("""
        SELECT id, name, 
               ST_Y(home_location) as lat, 
               ST_X(home_location) as lng
        FROM employees
    """)
    result = await db.execute(query)
    employees = [
        {"id": row.id, "name": row.name, "lat": row.lat, "lng": row.lng}
        for row in result.fetchall()
    ]
    
    if not employees:
        raise HTTPException(status_code=400, detail="No employees found in database")
    
    logger.info(f"Found {len(employees)} employees")
    
    # Step 2: Cluster employees into stops
    clustering_result = cluster_employees(
        employee_data=employees,
        max_walking_distance=params.max_walking_distance,
        method="dbscan"
    )
    
    stops = clustering_result["stops"]
    logger.info(f"Created {len(stops)} stops from clustering")
    
    if not stops:
        raise HTTPException(status_code=400, detail="Could not create any stops from clustering")
    
    # Save stops to database
    await db.execute(text("DELETE FROM shuttle_stops"))
    
    stop_id_mapping = {}  # cluster_id -> db_id
    for stop in stops:
        insert_query = text("""
            INSERT INTO shuttle_stops (name, location, cluster_id, employee_count)
            VALUES (:name, ST_SetSRID(ST_MakePoint(:lng, :lat), 4326), :cluster_id, :count)
            RETURNING id
        """)
        result = await db.execute(insert_query, {
            "name": f"Stop {stop['cluster_id']}",
            "lat": stop["location"]["lat"],
            "lng": stop["location"]["lng"],
            "cluster_id": stop["cluster_id"],
            "count": stop["employee_count"]
        })
        db_id = result.fetchone().id
        stop_id_mapping[stop["cluster_id"]] = db_id
        stop["db_id"] = db_id
    
    # Update employee assignments
    for stop in stops:
        for emp_id in stop["employee_ids"]:
            await db.execute(
                text("UPDATE employees SET assigned_stop_id = :stop_id WHERE id = :emp_id"),
                {"stop_id": stop["db_id"], "emp_id": emp_id}
            )
    
    await db.commit()
    
    # Step 3: Get distance matrix from OSRM
    # First coordinate is depot, followed by all stops
    depot = (params.depot_location.lat, params.depot_location.lng)
    coordinates = [depot]
    coordinates.extend([
        (stop["location"]["lat"], stop["location"]["lng"])
        for stop in stops
    ])
    
    logger.info(f"Getting distance matrix for {len(coordinates)} locations")
    matrix_result = await osrm_service.get_distance_matrix(coordinates)
    
    # Step 4: Solve CVRP
    logger.info("Solving CVRP...")
    optimization_result = create_optimized_routes(
        stops=stops,
        depot_location=depot,
        distance_matrix=matrix_result["distances"],
        num_16_seaters=params.use_16_seaters,
        num_27_seaters=params.use_27_seaters,
        time_limit_seconds=params.time_limit_seconds,
        vehicle_priority=params.vehicle_priority or "auto"
    )
    
    # Step 5: Get route geometries from OSRM
    routes_with_geometry = []
    for route in optimization_result["routes"]:
        # Start from depot, go through stops, return to depot
        route_coords = [depot]  # Start from depot
        route_coords.extend([
            (stop["location"]["lat"], stop["location"]["lng"])
            for stop in route["stops"]
        ])
        route_coords.append(depot)  # Return to depot
        
        if len(route_coords) >= 2:
            route_geometry = await osrm_service.get_route(route_coords)
            osrm_polyline = route_geometry.get("geometry", [])
            
            # Manually add depot at start and end of polyline
            # OSRM snaps to road network, so we need to ensure visual connection to depot
            depot_point = {"lat": depot[0], "lng": depot[1]}
            if osrm_polyline:
                # Insert depot at beginning if not already there
                if osrm_polyline[0] != depot_point:
                    osrm_polyline.insert(0, depot_point)
                # Append depot at end if not already there
                if osrm_polyline[-1] != depot_point:
                    osrm_polyline.append(depot_point)
            else:
                osrm_polyline = [depot_point]
            
            route["polyline"] = osrm_polyline
            route["distance"] = route_geometry.get("distance", route["distance"])
            route["duration"] = route_geometry.get("duration", 0)
        
        routes_with_geometry.append(route)
    
    # Step 6: Save optimization result
    save_query = text("""
        INSERT INTO optimization_results 
        (total_vehicles_used, total_distance, total_duration, parameters)
        VALUES (:vehicles, :distance, :duration, :params)
        RETURNING id, created_at
    """)
    
    import json
    result = await db.execute(save_query, {
        "vehicles": optimization_result["vehicles_used"],
        "distance": optimization_result["total_distance"],
        "duration": sum(r.get("duration", 0) for r in routes_with_geometry),
        "params": json.dumps(params.model_dump())
    })
    await db.commit()
    
    saved = result.fetchone()
    
    # Format response
    response = {
        "id": saved.id,
        "total_vehicles_used": optimization_result["vehicles_used"],
        "total_distance": optimization_result["total_distance"],
        "total_duration": sum(r.get("duration", 0) for r in routes_with_geometry),
        "total_passengers": optimization_result["total_passengers"],
        "routes": routes_with_geometry,
        "stops": [
            {
                "id": stop["db_id"],
                "cluster_id": stop["cluster_id"],
                "location": stop["location"],
                "employee_count": stop["employee_count"]
            }
            for stop in stops
        ],
        "clustering": {
            "total_stops": len(stops),
            "max_walking_distance": params.max_walking_distance
        },
        "osrm_available": not matrix_result.get("fallback", False),
        "created_at": saved.created_at.isoformat()
    }
    
    logger.info(f"Optimization complete: {optimization_result['vehicles_used']} vehicles, "
                f"{optimization_result['total_distance']}m total distance")
    
    return response


@router.get("/results")
async def get_optimization_results(db: AsyncSession = Depends(get_db)):
    """Get all previous optimization results."""
    query = text("""
        SELECT id, total_vehicles_used, total_distance, total_duration, 
               parameters, created_at
        FROM optimization_results
        ORDER BY created_at DESC
        LIMIT 20
    """)
    
    result = await db.execute(query)
    
    return [
        {
            "id": row.id,
            "total_vehicles_used": row.total_vehicles_used,
            "total_distance": row.total_distance,
            "total_duration": row.total_duration,
            "parameters": row.parameters,
            "created_at": row.created_at.isoformat()
        }
        for row in result.fetchall()
    ]


@router.get("/results/{result_id}")
async def get_optimization_result(result_id: int, db: AsyncSession = Depends(get_db)):
    """Get a specific optimization result with full route data."""
    # Get optimization result
    query = text("""
        SELECT id, total_vehicles_used, total_distance, total_duration, 
               parameters, created_at
        FROM optimization_results
        WHERE id = :id
    """)
    
    result = await db.execute(query, {"id": result_id})
    row = result.fetchone()
    
    if not row:
        raise HTTPException(status_code=404, detail="Optimization result not found")
    
    # Get routes for this optimization
    routes_query = text("""
        SELECT r.id, r.vehicle_id, r.total_distance, r.total_duration,
               v.name as vehicle_name, v.capacity as vehicle_capacity, v.vehicle_type,
               ST_AsGeoJSON(r.polyline_geometry) as geometry
        FROM routes r
        JOIN vehicles v ON r.vehicle_id = v.id
        WHERE r.id IN (
            SELECT id FROM routes 
            ORDER BY created_at DESC 
            LIMIT 20
        )
    """)
    
    # Get stops
    stops_query = text("""
        SELECT id, name, 
               ST_Y(location) as lat, 
               ST_X(location) as lng,
               cluster_id, employee_count
        FROM shuttle_stops
    """)
    
    stops_result = await db.execute(stops_query)
    stops = [
        {
            "id": stop.id,
            "name": stop.name,
            "location": {"lat": stop.lat, "lng": stop.lng},
            "cluster_id": stop.cluster_id,
            "employee_count": stop.employee_count
        }
        for stop in stops_result.fetchall()
    ]
    
    return {
        "id": row.id,
        "total_vehicles_used": row.total_vehicles_used,
        "total_distance": row.total_distance,
        "total_duration": row.total_duration,
        "parameters": row.parameters,
        "stops": stops,
        "created_at": row.created_at.isoformat()
    }


@router.get("/vehicles")
async def get_vehicles(db: AsyncSession = Depends(get_db)):
    """Get all available vehicles."""
    query = text("""
        SELECT id, name, capacity, vehicle_type, is_active
        FROM vehicles
        WHERE is_active = true
        ORDER BY capacity, name
    """)
    
    result = await db.execute(query)
    
    return [
        {
            "id": row.id,
            "name": row.name,
            "capacity": row.capacity,
            "vehicle_type": row.vehicle_type,
            "is_active": row.is_active
        }
        for row in result.fetchall()
    ]


@router.get("/status")
async def get_system_status(db: AsyncSession = Depends(get_db)):
    """Get current system status including OSRM availability."""
    # Check employee count
    emp_result = await db.execute(text("SELECT COUNT(*) as count FROM employees"))
    emp_count = emp_result.fetchone().count
    
    # Check stop count
    stop_result = await db.execute(text("SELECT COUNT(*) as count FROM shuttle_stops"))
    stop_count = stop_result.fetchone().count
    
    # Check vehicle count
    vehicle_result = await db.execute(
        text("SELECT COUNT(*) as count FROM vehicles WHERE is_active = true")
    )
    vehicle_count = vehicle_result.fetchone().count
    
    # Check OSRM
    osrm_available = await osrm_service.check_health()
    
    return {
        "employees": emp_count,
        "stops": stop_count,
        "vehicles": vehicle_count,
        "osrm_available": osrm_available,
        "ready": emp_count > 0 and vehicle_count > 0
    }
