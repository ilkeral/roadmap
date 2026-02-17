"""
Simulations API Router - Manage simulation history with routes
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from typing import List, Optional, Any
from pydantic import BaseModel, Field
from datetime import datetime
import logging
import json
from geopy.distance import geodesic

from app.core.database import get_db
from app.models.schemas import OptimizationParams, Coordinate, TrafficMode, TRAFFIC_SCALING_FACTORS
from app.services.clustering_service import cluster_employees
from app.services.osrm_service import osrm_service
from app.services.optimization_service import create_optimized_routes

logger = logging.getLogger(__name__)

router = APIRouter()


# Schemas
class SimulationCreate(BaseModel):
    """Schema for creating a new simulation"""
    name: Optional[str] = None
    max_walking_distance: int = Field(default=200, ge=50, le=2000)
    use_16_seaters: int = Field(default=5, ge=0, le=50)
    use_27_seaters: int = Field(default=5, ge=0, le=50)
    vehicle_priority: Optional[str] = Field(default="auto", description="Vehicle priority: 'large', 'small', or 'auto'")
    max_travel_time: int = Field(default=65, ge=15, le=180, description="Max travel time per route in minutes")
    exclude_tolls: bool = Field(default=False, description="Exclude toll roads from routing")
    traffic_mode: TrafficMode = Field(default=TrafficMode.NONE, description="Traffic profile: none, morning, or evening")
    buffer_seats: int = Field(default=0, ge=0, le=5, description="Buffer seats to leave empty per vehicle")
    depot_location: Coordinate
    shift_id: Optional[int] = Field(default=None, description="Shift ID to filter employees. None means all employees")


class SimulationSummary(BaseModel):
    """Summary of a simulation for listing"""
    id: int
    name: str
    total_vehicles: int
    total_distance: float
    total_duration: float = 0
    total_passengers: int
    route_count: int
    created_at: str
    # Criteria fields
    traffic_mode: Optional[str] = None
    buffer_seats: Optional[int] = None
    vehicle_priority: Optional[str] = None
    max_travel_time: Optional[int] = None
    max_walking_distance: Optional[int] = None
    num_16_seaters: Optional[int] = None
    num_27_seaters: Optional[int] = None
    # Shift fields
    shift_id: Optional[int] = None
    shift_name: Optional[str] = None


class RouteDetail(BaseModel):
    """Route detail for a simulation"""
    id: int
    vehicle_id: int
    vehicle_type: str
    capacity: int
    passengers: int
    distance: float
    duration: float
    stop_count: int
    polyline: List[Any]  # Can be List[List[float]] or List[dict]
    stops: List[dict]


class SimulationDetail(BaseModel):
    """Full simulation detail with routes"""
    id: int
    name: str
    total_vehicles: int
    total_distance: float
    total_duration: float
    total_passengers: int
    max_walking_distance: int
    depot_lat: float
    depot_lng: float
    routes: List[RouteDetail]
    created_at: str
    # Criteria fields
    traffic_mode: Optional[str] = None
    buffer_seats: Optional[int] = None
    vehicle_priority: Optional[str] = None
    max_travel_time: Optional[int] = None
    num_16_seaters: Optional[int] = None
    num_27_seaters: Optional[int] = None
    # Shift fields
    shift_id: Optional[int] = None
    shift_name: Optional[str] = None


async def ensure_simulation_tables(db: AsyncSession):
    """Create simulation tables if they don't exist"""
    # Simulations table
    await db.execute(text("""
        CREATE TABLE IF NOT EXISTS simulations (
            id SERIAL PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            total_vehicles INT NOT NULL,
            total_distance DOUBLE PRECISION NOT NULL,
            total_duration DOUBLE PRECISION DEFAULT 0,
            total_passengers INT NOT NULL,
            max_walking_distance INT NOT NULL,
            depot_lat DOUBLE PRECISION NOT NULL,
            depot_lng DOUBLE PRECISION NOT NULL,
            traffic_mode VARCHAR(50) DEFAULT 'none',
            buffer_seats INT DEFAULT 0,
            vehicle_priority VARCHAR(50) DEFAULT 'auto',
            max_travel_time INT DEFAULT 65,
            num_16_seaters INT DEFAULT 5,
            num_27_seaters INT DEFAULT 5,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """))
    
    # Add new columns if they don't exist (for existing tables)
    for col_stmt in [
        "ALTER TABLE simulations ADD COLUMN IF NOT EXISTS traffic_mode VARCHAR(50) DEFAULT 'none'",
        "ALTER TABLE simulations ADD COLUMN IF NOT EXISTS buffer_seats INT DEFAULT 0",
        "ALTER TABLE simulations ADD COLUMN IF NOT EXISTS vehicle_priority VARCHAR(50) DEFAULT 'auto'",
        "ALTER TABLE simulations ADD COLUMN IF NOT EXISTS max_travel_time INT DEFAULT 65",
        "ALTER TABLE simulations ADD COLUMN IF NOT EXISTS num_16_seaters INT DEFAULT 5",
        "ALTER TABLE simulations ADD COLUMN IF NOT EXISTS num_27_seaters INT DEFAULT 5",
        "ALTER TABLE simulations ADD COLUMN IF NOT EXISTS shift_id INT DEFAULT NULL",
        "ALTER TABLE simulations ADD COLUMN IF NOT EXISTS shift_name VARCHAR(100) DEFAULT NULL"
    ]:
        try:
            await db.execute(text(col_stmt))
        except Exception:
            pass  # Column already exists
    
    # Simulation routes table
    await db.execute(text("""
        CREATE TABLE IF NOT EXISTS simulation_routes (
            id SERIAL PRIMARY KEY,
            simulation_id INT NOT NULL REFERENCES simulations(id) ON DELETE CASCADE,
            vehicle_id INT NOT NULL,
            vehicle_type VARCHAR(50) NOT NULL,
            capacity INT NOT NULL,
            passengers INT NOT NULL,
            distance DOUBLE PRECISION NOT NULL,
            duration DOUBLE PRECISION DEFAULT 0,
            polyline JSONB,
            stops JSONB,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """))
    
    await db.commit()


@router.post("/", response_model=SimulationSummary)
async def create_simulation(
    params: SimulationCreate,
    db: AsyncSession = Depends(get_db)
):
    """Create a new simulation - runs optimization and saves results"""
    try:
        await ensure_simulation_tables(db)
        
        # Get shift info if shift_id is provided
        shift_name = None
        if params.shift_id is not None:
            shift_query = text("SELECT name FROM shifts WHERE id = :shift_id")
            shift_result = await db.execute(shift_query, {"shift_id": params.shift_id})
            shift_row = shift_result.fetchone()
            if shift_row:
                shift_name = shift_row.name
            else:
                raise HTTPException(status_code=400, detail="Belirtilen vardiya bulunamadı")
        else:
            shift_name = "Tüm Çalışanlar"
        
        # Step 1: Fetch employees (filtered by shift_id if provided)
        if params.shift_id is not None:
            query = text("""
                SELECT id, name, 
                       ST_Y(home_location) as lat, 
                       ST_X(home_location) as lng
                FROM employees
                WHERE shift_id = :shift_id
            """)
            result = await db.execute(query, {"shift_id": params.shift_id})
        else:
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
            if params.shift_id is not None:
                raise HTTPException(status_code=400, detail=f"'{shift_name}' vardiyasında çalışan bulunamadı")
            raise HTTPException(status_code=400, detail="Veritabanında çalışan bulunamadı")
        
        logger.info(f"Simülasyon başlatılıyor: {len(employees)} çalışan (Vardiya: {shift_name})")
        
        # Step 2: Cluster employees into stops
        clustering_result = cluster_employees(
            employee_data=employees,
            max_walking_distance=params.max_walking_distance,
            method="dbscan"
        )
        
        stops = clustering_result["stops"]
        
        if not stops:
            raise HTTPException(status_code=400, detail="Durak oluşturulamadı")
        
        # Step 2.5: Snap stops to road network
        # This ensures stops are on actual roads where vehicles can stop
        stop_coords = [(s["location"]["lat"], s["location"]["lng"]) for s in stops]
        snapped_results = await osrm_service.snap_multiple_to_road(stop_coords)
        
        # Build employee lookup for walking distance calculation
        employee_lookup = {e["id"]: e for e in employees}
        
        # Update stop locations to snapped road positions
        for i, (stop, snap_result) in enumerate(zip(stops, snapped_results)):
            # Add employee names to stop
            employee_names = []
            for emp_id in stop.get("employee_ids", []):
                emp = employee_lookup.get(emp_id)
                if emp:
                    employee_names.append(emp.get("name", f"Çalışan #{emp_id}"))
            stop["employee_names"] = employee_names
            
            if snap_result.get("valid"):
                # Update stop location to road position
                stop["original_location"] = stop["location"].copy()
                stop["location"] = snap_result["snapped"]
                stop["road_name"] = snap_result.get("road_name", "")
                
                # Calculate actual walking distances for each employee to snapped stop
                max_walk = 0
                employee_walks = []
                for emp_id in stop.get("employee_ids", []):
                    emp = employee_lookup.get(emp_id)
                    if emp:
                        walk_dist = geodesic(
                            (emp["lat"], emp["lng"]),
                            (stop["location"]["lat"], stop["location"]["lng"])
                        ).meters
                        max_walk = max(max_walk, walk_dist)
                        employee_walks.append({
                            "employee_id": emp_id,
                            "walking_distance": round(walk_dist)
                        })
                
                stop["max_walking_distance"] = round(max_walk)
                stop["employee_walking_distances"] = employee_walks
                logger.info(f"Durak {i+1}: {stop['road_name'] or 'Yol'} - max yürüyüş: {round(max_walk)}m")
            else:
                stop["max_walking_distance"] = stop.get("max_distance_to_centroid", 0)
        
        # Step 3: Get distance matrix from OSRM
        depot = (params.depot_location.lat, params.depot_location.lng)
        coordinates = [depot]
        coordinates.extend([
            (stop["location"]["lat"], stop["location"]["lng"])
            for stop in stops
        ])
        
        # Get distance and duration matrix (with toll exclusion if requested)
        matrix_result = await osrm_service.get_distance_matrix(
            coordinates, 
            exclude_tolls=params.exclude_tolls
        )
        
        # Apply traffic scaling to duration matrix based on traffic mode
        traffic_factor = TRAFFIC_SCALING_FACTORS.get(params.traffic_mode, 1.0)
        duration_matrix = matrix_result.get("durations")
        
        if duration_matrix and traffic_factor != 1.0:
            # Scale all durations by traffic factor
            duration_matrix = [
                [int(d * traffic_factor) for d in row]
                for row in duration_matrix
            ]
            logger.info(f"Trafik modu: {params.traffic_mode.value} - süre faktörü: {traffic_factor}x")
        
        # Convert max_travel_time from minutes to seconds (also scaled by traffic)
        max_route_duration = int(params.max_travel_time * 60 * traffic_factor)
        
        # Calculate solver time limit based on number of stops
        # More stops = more time needed for optimization
        num_stops = len(stops)
        if num_stops > 40:
            solver_time_limit = 60  # 60 seconds for large problems
        elif num_stops > 20:
            solver_time_limit = 45  # 45 seconds for medium problems
        else:
            solver_time_limit = 30  # 30 seconds for small problems
        
        logger.info(f"Optimization for {num_stops} stops - solver time limit: {solver_time_limit}s")
        
        # Step 4: Solve CVRP with retry logic for tight time constraints
        num_16 = params.use_16_seaters
        num_27 = params.use_27_seaters
        max_retries = 5
        optimization_result = None
        
        for attempt in range(max_retries):
            optimization_result = create_optimized_routes(
                stops=stops,
                depot_location=depot,
                distance_matrix=matrix_result["distances"],
                num_16_seaters=num_16,
                num_27_seaters=num_27,
                time_limit_seconds=solver_time_limit,
                vehicle_priority=params.vehicle_priority or "auto",
                duration_matrix=duration_matrix,
                max_route_duration=max_route_duration,
                buffer_seats=params.buffer_seats
            )
            
            # Check if we got a valid solution
            if optimization_result.get("status") != "NO_SOLUTION" and optimization_result.get("vehicles_used", 0) > 0:
                if attempt > 0:
                    logger.info(f"Çözüm bulundu: {attempt + 1}. denemede, toplam {num_16 + num_27} araç ile")
                break
            
            # No solution found - increase vehicle count and retry
            logger.warning(f"Süre kısıtı nedeniyle çözüm bulunamadı (deneme {attempt + 1}). Araç sayısı artırılıyor...")
            
            # Add more vehicles based on priority
            if params.vehicle_priority == "small":
                num_16 += 2
            elif params.vehicle_priority == "large":
                num_27 += 2
            else:
                # Auto mode - add one of each
                num_16 += 1
                num_27 += 1
        
        if optimization_result.get("status") == "NO_SOLUTION" or optimization_result.get("vehicles_used", 0) == 0:
            raise HTTPException(
                status_code=400, 
                detail=f"Verilen süre kısıtı ({params.max_travel_time} dk) ile çözüm bulunamadı. Daha uzun süre veya daha fazla araç gerekli."
            )
        
        # Step 5: Get route geometries
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
                route_geometry = await osrm_service.get_route(route_coords, exclude_tolls=params.exclude_tolls)
                osrm_polyline = route_geometry.get("geometry", [])
                legs = route_geometry.get("legs", [])
                
                # Calculate remaining distance/duration to depot for each stop
                # legs[0] = depot -> stop1, legs[1] = stop1 -> stop2, ..., legs[N] = stopN -> depot
                if legs and len(route["stops"]) > 0:
                    num_stops = len(route["stops"])
                    for i, stop in enumerate(route["stops"]):
                        # Calculate remaining distance from this stop to depot
                        # This is sum of all legs from stop[i] to depot
                        remaining_distance = 0
                        remaining_duration = 0
                        for j in range(i + 1, len(legs)):  # From next leg to last leg (which goes to depot)
                            remaining_distance += legs[j].get("distance", 0)
                            remaining_duration += legs[j].get("duration", 0)
                        
                        stop["distance_to_depot"] = round(remaining_distance)
                        stop["duration_to_depot"] = round(remaining_duration * traffic_factor)
                
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
                # Apply traffic scaling to route duration
                raw_duration = route_geometry.get("duration", 0)
                route["duration"] = raw_duration * traffic_factor
            else:
                route["polyline"] = []
                route["duration"] = 0
            
            routes_with_geometry.append(route)
        
        # Generate simulation name
        sim_name = params.name or f"Simülasyon #{datetime.now().strftime('%d.%m.%Y %H:%M')}"
        
        # Step 6: Save simulation
        # Calculate total distance from actual OSRM route distances (not CVRP matrix)
        total_distance = sum(r.get("distance", 0) for r in routes_with_geometry)
        total_duration = sum(r.get("duration", 0) for r in routes_with_geometry)
        
        sim_query = text("""
            INSERT INTO simulations 
            (name, total_vehicles, total_distance, total_duration, total_passengers,
             max_walking_distance, depot_lat, depot_lng, traffic_mode, buffer_seats,
             vehicle_priority, max_travel_time, num_16_seaters, num_27_seaters,
             shift_id, shift_name)
            VALUES (:name, :vehicles, :distance, :duration, :passengers,
                    :walk_dist, :depot_lat, :depot_lng, :traffic_mode, :buffer_seats,
                    :vehicle_priority, :max_travel_time, :num_16_seaters, :num_27_seaters,
                    :shift_id, :shift_name)
            RETURNING id, created_at
        """)
        
        result = await db.execute(sim_query, {
            "name": sim_name,
            "vehicles": optimization_result["vehicles_used"],
            "distance": total_distance,
            "duration": total_duration,
            "passengers": optimization_result["total_passengers"],
            "walk_dist": params.max_walking_distance,
            "depot_lat": params.depot_location.lat,
            "depot_lng": params.depot_location.lng,
            "traffic_mode": params.traffic_mode.value if params.traffic_mode else "none",
            "buffer_seats": params.buffer_seats,
            "vehicle_priority": params.vehicle_priority or "auto",
            "max_travel_time": params.max_travel_time,
            "num_16_seaters": num_16,
            "num_27_seaters": num_27,
            "shift_id": params.shift_id,
            "shift_name": shift_name
        })
        
        sim_row = result.fetchone()
        simulation_id = sim_row.id
        created_at = sim_row.created_at
        
        # Helper function to convert numpy types to native Python types
        def convert_to_native(obj):
            if isinstance(obj, dict):
                return {k: convert_to_native(v) for k, v in obj.items()}
            elif isinstance(obj, list):
                return [convert_to_native(item) for item in obj]
            elif hasattr(obj, 'item'):  # numpy scalar
                return obj.item()
            return obj
        
        # Step 7: Save routes
        for route in routes_with_geometry:
            route_query = text("""
                INSERT INTO simulation_routes 
                (simulation_id, vehicle_id, vehicle_type, capacity, passengers, 
                 distance, duration, polyline, stops)
                VALUES (:sim_id, :v_id, :v_type, :cap, :pass, 
                        :dist, :dur, :poly, :stops)
            """)
            
            # Convert numpy types to native Python types
            polyline_data = convert_to_native(route.get("polyline", []))
            stops_data = convert_to_native(route["stops"])
            
            await db.execute(route_query, {
                "sim_id": simulation_id,
                "v_id": int(route["vehicle_id"]),
                "v_type": route["vehicle_type"],
                "cap": int(route["vehicle_capacity"]),
                "pass": int(route["load"]),
                "dist": float(route["distance"]),
                "dur": float(route.get("duration", 0)),
                "poly": json.dumps(polyline_data),
                "stops": json.dumps(stops_data)
            })
        
        await db.commit()
        
        logger.info(f"Simülasyon kaydedildi: ID={simulation_id}, {optimization_result['vehicles_used']} araç")
        
        return SimulationSummary(
            id=simulation_id,
            name=sim_name,
            total_vehicles=optimization_result["vehicles_used"],
            total_distance=total_distance,
            total_duration=total_duration,
            total_passengers=optimization_result["total_passengers"],
            route_count=len(routes_with_geometry),
            created_at=created_at.isoformat(),
            traffic_mode=params.traffic_mode.value if params.traffic_mode else "none",
            buffer_seats=params.buffer_seats,
            vehicle_priority=params.vehicle_priority or "auto",
            max_travel_time=params.max_travel_time,
            max_walking_distance=params.max_walking_distance,
            num_16_seaters=num_16,
            num_27_seaters=num_27,
            shift_id=params.shift_id,
            shift_name=shift_name
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Simülasyon hatası: {e}")
        await db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/", response_model=List[SimulationSummary])
async def list_simulations(
    skip: int = 0,
    limit: int = 50,
    db: AsyncSession = Depends(get_db)
):
    """List all simulations"""
    try:
        await ensure_simulation_tables(db)
        
        query = text("""
            SELECT s.id, s.name, s.total_vehicles, s.total_distance, s.total_duration,
                   s.total_passengers, s.created_at, s.traffic_mode, s.buffer_seats,
                   s.vehicle_priority, s.max_travel_time, s.max_walking_distance,
                   s.num_16_seaters, s.num_27_seaters, s.shift_id, s.shift_name,
                   COUNT(sr.id) as route_count
            FROM simulations s
            LEFT JOIN simulation_routes sr ON s.id = sr.simulation_id
            GROUP BY s.id
            ORDER BY s.created_at DESC
            OFFSET :skip LIMIT :limit
        """)
        
        result = await db.execute(query, {"skip": skip, "limit": limit})
        rows = result.fetchall()
        
        return [
            SimulationSummary(
                id=row.id,
                name=row.name,
                total_vehicles=row.total_vehicles,
                total_distance=row.total_distance,
                total_duration=row.total_duration or 0,
                total_passengers=row.total_passengers,
                route_count=row.route_count,
                created_at=row.created_at.isoformat(),
                traffic_mode=row.traffic_mode,
                buffer_seats=row.buffer_seats,
                vehicle_priority=row.vehicle_priority,
                max_travel_time=row.max_travel_time,
                max_walking_distance=row.max_walking_distance,
                num_16_seaters=row.num_16_seaters,
                num_27_seaters=row.num_27_seaters,
                shift_id=row.shift_id,
                shift_name=row.shift_name
            )
            for row in rows
        ]
        
    except Exception as e:
        logger.error(f"Simülasyon listesi hatası: {e}")
        return []


@router.get("/{simulation_id}", response_model=SimulationDetail)
async def get_simulation(
    simulation_id: int,
    db: AsyncSession = Depends(get_db)
):
    """Get simulation details with routes"""
    try:
        # Get simulation
        sim_query = text("""
            SELECT id, name, total_vehicles, total_distance, total_duration,
                   total_passengers, max_walking_distance, depot_lat, depot_lng, created_at,
                   traffic_mode, buffer_seats, vehicle_priority, max_travel_time,
                   num_16_seaters, num_27_seaters, shift_id, shift_name
            FROM simulations WHERE id = :id
        """)
        
        result = await db.execute(sim_query, {"id": simulation_id})
        sim = result.fetchone()
        
        if not sim:
            raise HTTPException(status_code=404, detail="Simülasyon bulunamadı")
        
        # Get routes
        routes_query = text("""
            SELECT id, vehicle_id, vehicle_type, capacity, passengers,
                   distance, duration, polyline, stops
            FROM simulation_routes
            WHERE simulation_id = :sim_id
            ORDER BY vehicle_id
        """)
        
        result = await db.execute(routes_query, {"sim_id": simulation_id})
        route_rows = result.fetchall()
        
        routes = []
        for row in route_rows:
            # Handle both string JSON and already-parsed objects (JSONB)
            if isinstance(row.polyline, str):
                polyline = json.loads(row.polyline) if row.polyline else []
            else:
                polyline = row.polyline if row.polyline else []
                
            if isinstance(row.stops, str):
                stops_data = json.loads(row.stops) if row.stops else []
            else:
                stops_data = row.stops if row.stops else []
            
            routes.append(RouteDetail(
                id=row.id,
                vehicle_id=row.vehicle_id,
                vehicle_type=row.vehicle_type,
                capacity=row.capacity,
                passengers=row.passengers,
                distance=row.distance,
                duration=row.duration,
                stop_count=len(stops_data),
                polyline=polyline,
                stops=stops_data
            ))
        
        return SimulationDetail(
            id=sim.id,
            name=sim.name,
            total_vehicles=sim.total_vehicles,
            total_distance=sim.total_distance,
            total_duration=sim.total_duration,
            total_passengers=sim.total_passengers,
            max_walking_distance=sim.max_walking_distance,
            depot_lat=sim.depot_lat,
            depot_lng=sim.depot_lng,
            routes=routes,
            created_at=sim.created_at.isoformat(),
            traffic_mode=sim.traffic_mode,
            buffer_seats=sim.buffer_seats,
            vehicle_priority=sim.vehicle_priority,
            max_travel_time=sim.max_travel_time,
            num_16_seaters=sim.num_16_seaters,
            num_27_seaters=sim.num_27_seaters,
            shift_id=sim.shift_id,
            shift_name=sim.shift_name
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Simülasyon detay hatası: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{simulation_id}")
async def delete_simulation(
    simulation_id: int,
    db: AsyncSession = Depends(get_db)
):
    """Delete a simulation and its routes"""
    try:
        # Check if exists
        check_query = text("SELECT id FROM simulations WHERE id = :id")
        result = await db.execute(check_query, {"id": simulation_id})
        
        if not result.fetchone():
            raise HTTPException(status_code=404, detail="Simülasyon bulunamadı")
        
        # Delete (cascades to routes)
        await db.execute(text("DELETE FROM simulations WHERE id = :id"), {"id": simulation_id})
        await db.commit()
        
        return {"message": "Simülasyon silindi", "id": simulation_id}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Simülasyon silme hatası: {e}")
        await db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


class StopUpdate(BaseModel):
    """Schema for updating a stop location"""
    stop_index: int
    lat: float
    lng: float


class RouteUpdateRequest(BaseModel):
    """Schema for updating route stops"""
    stops: List[StopUpdate]


@router.put("/{simulation_id}/routes/{route_id}")
async def update_route_stops(
    simulation_id: int,
    route_id: int,
    request: RouteUpdateRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    Update route stops with new coordinates and recalculate route.
    This recalculates distance, duration and polyline based on new stop positions.
    """
    try:
        # Get simulation for depot location and traffic mode
        sim_query = text("""
            SELECT depot_lat, depot_lng, traffic_mode 
            FROM simulations WHERE id = :sim_id
        """)
        sim_result = await db.execute(sim_query, {"sim_id": simulation_id})
        sim = sim_result.fetchone()
        
        if not sim:
            raise HTTPException(status_code=404, detail="Simülasyon bulunamadı")
        
        depot = (sim.depot_lat, sim.depot_lng)
        traffic_factor = TRAFFIC_SCALING_FACTORS.get(sim.traffic_mode or 'none', 1.0)
        
        # Get current route
        route_query = text("""
            SELECT id, vehicle_id, vehicle_type, capacity, passengers, stops
            FROM simulation_routes 
            WHERE id = :route_id AND simulation_id = :sim_id
        """)
        route_result = await db.execute(route_query, {"route_id": route_id, "sim_id": simulation_id})
        route = route_result.fetchone()
        
        if not route:
            raise HTTPException(status_code=404, detail="Rota bulunamadı")
        
        # Parse existing stops
        existing_stops = json.loads(route.stops) if isinstance(route.stops, str) else route.stops
        
        # Get all employee IDs from stops that will be updated
        all_employee_ids = set()
        stop_updates = {s.stop_index: (s.lat, s.lng) for s in request.stops}
        for stop_idx in stop_updates.keys():
            if 0 <= stop_idx < len(existing_stops):
                all_employee_ids.update(existing_stops[stop_idx].get("employee_ids", []))
        
        # Fetch employee locations from database
        employee_locations = {}
        if all_employee_ids:
            emp_query = text("""
                SELECT id, ST_Y(home_location::geometry) as lat, ST_X(home_location::geometry) as lng
                FROM employees WHERE id = ANY(:ids)
            """)
            emp_result = await db.execute(emp_query, {"ids": list(all_employee_ids)})
            for row in emp_result.fetchall():
                employee_locations[row.id] = (row.lat, row.lng)
        
        # Update stop locations and recalculate walking distances
        for stop_idx, new_location in stop_updates.items():
            if 0 <= stop_idx < len(existing_stops):
                existing_stops[stop_idx]["location"] = {
                    "lat": new_location[0],
                    "lng": new_location[1]
                }
                
                # Recalculate walking distances for employees in this stop
                employee_walks = []
                max_walk = 0
                for emp_id in existing_stops[stop_idx].get("employee_ids", []):
                    if emp_id in employee_locations:
                        emp_loc = employee_locations[emp_id]
                        walk_dist = geodesic(
                            emp_loc,
                            (new_location[0], new_location[1])
                        ).meters
                        max_walk = max(max_walk, walk_dist)
                        employee_walks.append({
                            "employee_id": emp_id,
                            "walking_distance": round(walk_dist)
                        })
                
                existing_stops[stop_idx]["employee_walking_distances"] = employee_walks
                existing_stops[stop_idx]["max_walking_distance"] = round(max_walk)
                existing_stops[stop_idx]["road_name"] = "Manuel düzenleme"
        
        # Build route coordinates: depot -> stops -> depot
        route_coords = [depot]
        for stop in existing_stops:
            loc = stop["location"]
            route_coords.append((loc["lat"], loc["lng"]))
        route_coords.append(depot)
        
        # Get new route from OSRM
        route_data = await osrm_service.get_route(route_coords)
        
        # Apply traffic factor to duration
        new_duration = route_data.get("duration", 0) * traffic_factor
        new_distance = route_data.get("distance", 0)
        new_polyline = route_data.get("geometry", [])
        
        # Update database
        update_query = text("""
            UPDATE simulation_routes 
            SET distance = :distance, duration = :duration, 
                polyline = :polyline, stops = :stops
            WHERE id = :route_id
        """)
        await db.execute(update_query, {
            "route_id": route_id,
            "distance": new_distance,
            "duration": new_duration,
            "polyline": json.dumps(new_polyline),
            "stops": json.dumps(existing_stops)
        })
        
        # Update simulation totals
        totals_query = text("""
            SELECT SUM(distance) as total_dist, SUM(duration) as total_dur
            FROM simulation_routes WHERE simulation_id = :sim_id
        """)
        totals_result = await db.execute(totals_query, {"sim_id": simulation_id})
        totals = totals_result.fetchone()
        
        await db.execute(text("""
            UPDATE simulations 
            SET total_distance = :dist, total_duration = :dur
            WHERE id = :sim_id
        """), {
            "sim_id": simulation_id,
            "dist": totals.total_dist or 0,
            "dur": totals.total_dur or 0
        })
        
        await db.commit()
        
        logger.info(f"Rota {route_id} güncellendi: {new_distance/1000:.1f}km, {new_duration/60:.0f}dk")
        
        return {
            "success": True,
            "route_id": route_id,
            "distance": new_distance,
            "duration": new_duration,
            "polyline": new_polyline,
            "stops": existing_stops
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Rota güncelleme hatası: {e}")
        await db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

