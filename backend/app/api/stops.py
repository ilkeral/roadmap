"""
Stops API Router - Manage shuttle stops
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from typing import List

from app.core.database import get_db
from app.models.schemas import StopCreate, StopResponse, Coordinate, EmployeeResponse

router = APIRouter()


@router.get("/", response_model=List[StopResponse])
async def get_stops(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    db: AsyncSession = Depends(get_db)
):
    """Get all shuttle stops."""
    query = text("""
        SELECT id, name, 
               ST_Y(location) as lat, 
               ST_X(location) as lng,
               cluster_id,
               employee_count
        FROM shuttle_stops
        ORDER BY id
        OFFSET :skip LIMIT :limit
    """)
    
    result = await db.execute(query, {"skip": skip, "limit": limit})
    rows = result.fetchall()
    
    stops = []
    for row in rows:
        # Get assigned employees for this stop
        emp_query = text("""
            SELECT id, name, 
                   ST_Y(home_location) as lat, 
                   ST_X(home_location) as lng
            FROM employees
            WHERE assigned_stop_id = :stop_id
        """)
        emp_result = await db.execute(emp_query, {"stop_id": row.id})
        employees = [
            EmployeeResponse(
                id=emp.id,
                name=emp.name,
                home_location=Coordinate(lat=emp.lat, lng=emp.lng),
                assigned_stop_id=row.id
            )
            for emp in emp_result.fetchall()
        ]
        
        stops.append(StopResponse(
            id=row.id,
            name=row.name,
            location=Coordinate(lat=row.lat, lng=row.lng),
            cluster_id=row.cluster_id,
            employee_count=row.employee_count,
            assigned_employees=employees
        ))
    
    return stops


@router.get("/count")
async def get_stop_count(db: AsyncSession = Depends(get_db)):
    """Get total stop count."""
    query = text("SELECT COUNT(*) as count FROM shuttle_stops")
    result = await db.execute(query)
    row = result.fetchone()
    return {"count": row.count}


@router.post("/", response_model=StopResponse)
async def create_stop(
    stop: StopCreate,
    db: AsyncSession = Depends(get_db)
):
    """Create a new shuttle stop."""
    query = text("""
        INSERT INTO shuttle_stops (name, location)
        VALUES (:name, ST_SetSRID(ST_MakePoint(:lng, :lat), 4326))
        RETURNING id, name, ST_Y(location) as lat, ST_X(location) as lng
    """)
    
    result = await db.execute(query, {
        "name": stop.name,
        "lat": stop.location.lat,
        "lng": stop.location.lng
    })
    await db.commit()
    
    row = result.fetchone()
    return StopResponse(
        id=row.id,
        name=row.name,
        location=Coordinate(lat=row.lat, lng=row.lng),
        employee_count=0,
        assigned_employees=[]
    )


@router.get("/within-distance")
async def get_employees_within_distance(
    lat: float = Query(..., description="Center latitude"),
    lng: float = Query(..., description="Center longitude"),
    distance: float = Query(200.0, description="Distance in meters"),
    db: AsyncSession = Depends(get_db)
):
    """Find all employees within a certain distance of a point."""
    query = text("""
        SELECT id, name, 
               ST_Y(home_location) as lat, 
               ST_X(home_location) as lng,
               ST_Distance(
                   home_location::geography,
                   ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography
               ) as distance_meters
        FROM employees
        WHERE ST_DWithin(
            home_location::geography,
            ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography,
            :distance
        )
        ORDER BY distance_meters
    """)
    
    result = await db.execute(query, {
        "lat": lat,
        "lng": lng,
        "distance": distance
    })
    
    return [
        {
            "id": row.id,
            "name": row.name,
            "location": {"lat": row.lat, "lng": row.lng},
            "distance_meters": row.distance_meters
        }
        for row in result.fetchall()
    ]


@router.delete("/", response_model=dict)
async def delete_all_stops(db: AsyncSession = Depends(get_db)):
    """Delete all shuttle stops."""
    # First unassign all employees
    await db.execute(text("UPDATE employees SET assigned_stop_id = NULL"))
    # Then delete stops
    await db.execute(text("DELETE FROM shuttle_stops"))
    await db.commit()
    return {"deleted": True}


@router.get("/{stop_id}", response_model=StopResponse)
async def get_stop(stop_id: int, db: AsyncSession = Depends(get_db)):
    """Get a specific stop by ID."""
    query = text("""
        SELECT id, name, 
               ST_Y(location) as lat, 
               ST_X(location) as lng,
               cluster_id,
               employee_count
        FROM shuttle_stops
        WHERE id = :id
    """)
    
    result = await db.execute(query, {"id": stop_id})
    row = result.fetchone()
    
    if not row:
        raise HTTPException(status_code=404, detail="Stop not found")
    
    # Get assigned employees
    emp_query = text("""
        SELECT id, name, 
               ST_Y(home_location) as lat, 
               ST_X(home_location) as lng
        FROM employees
        WHERE assigned_stop_id = :stop_id
    """)
    emp_result = await db.execute(emp_query, {"stop_id": stop_id})
    employees = [
        EmployeeResponse(
            id=emp.id,
            name=emp.name,
            home_location=Coordinate(lat=emp.lat, lng=emp.lng),
            assigned_stop_id=stop_id
        )
        for emp in emp_result.fetchall()
    ]
    
    return StopResponse(
        id=row.id,
        name=row.name,
        location=Coordinate(lat=row.lat, lng=row.lng),
        cluster_id=row.cluster_id,
        employee_count=row.employee_count,
        assigned_employees=employees
    )


@router.delete("/{stop_id}")
async def delete_stop(stop_id: int, db: AsyncSession = Depends(get_db)):
    """Delete a specific stop."""
    # Unassign employees first
    await db.execute(
        text("UPDATE employees SET assigned_stop_id = NULL WHERE assigned_stop_id = :id"),
        {"id": stop_id}
    )
    
    query = text("DELETE FROM shuttle_stops WHERE id = :id RETURNING id")
    result = await db.execute(query, {"id": stop_id})
    await db.commit()
    
    if not result.fetchone():
        raise HTTPException(status_code=404, detail="Stop not found")
    
    return {"deleted": True}
