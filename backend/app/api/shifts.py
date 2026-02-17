"""
Shifts API Router - CRUD operations for shift/vardiya data
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from typing import List

from app.core.database import get_db
from app.models.schemas import ShiftCreate, ShiftUpdate, ShiftResponse

router = APIRouter()


@router.get("/", response_model=List[ShiftResponse])
async def get_shifts(db: AsyncSession = Depends(get_db)):
    """Get all shifts with employee counts."""
    query = text("""
        SELECT s.id, s.name, s.color, s.start_time, s.end_time,
               COALESCE(COUNT(e.id), 0) as employee_count
        FROM shifts s
        LEFT JOIN employees e ON e.shift_id = s.id
        GROUP BY s.id, s.name, s.color, s.start_time, s.end_time
        ORDER BY s.name
    """)
    
    result = await db.execute(query)
    rows = result.fetchall()
    
    return [
        ShiftResponse(
            id=row.id,
            name=row.name,
            color=row.color,
            start_time=str(row.start_time) if row.start_time else None,
            end_time=str(row.end_time) if row.end_time else None,
            employee_count=row.employee_count
        )
        for row in rows
    ]


@router.get("/{shift_id}", response_model=ShiftResponse)
async def get_shift(shift_id: int, db: AsyncSession = Depends(get_db)):
    """Get a specific shift."""
    query = text("""
        SELECT s.id, s.name, s.color, s.start_time, s.end_time,
               COALESCE(COUNT(e.id), 0) as employee_count
        FROM shifts s
        LEFT JOIN employees e ON e.shift_id = s.id
        WHERE s.id = :id
        GROUP BY s.id, s.name, s.color, s.start_time, s.end_time
    """)
    
    result = await db.execute(query, {"id": shift_id})
    row = result.fetchone()
    
    if not row:
        raise HTTPException(status_code=404, detail="Vardiya bulunamadı")
    
    return ShiftResponse(
        id=row.id,
        name=row.name,
        color=row.color,
        start_time=str(row.start_time) if row.start_time else None,
        end_time=str(row.end_time) if row.end_time else None,
        employee_count=row.employee_count
    )


@router.post("/", response_model=ShiftResponse)
async def create_shift(shift: ShiftCreate, db: AsyncSession = Depends(get_db)):
    """Create a new shift."""
    # Check if name exists
    check_query = text("SELECT id FROM shifts WHERE name = :name")
    result = await db.execute(check_query, {"name": shift.name})
    if result.fetchone():
        raise HTTPException(status_code=400, detail="Bu isimde bir vardiya zaten var")
    
    query = text("""
        INSERT INTO shifts (name, color, start_time, end_time)
        VALUES (:name, :color, :start_time, :end_time)
        RETURNING id, name, color, start_time, end_time
    """)
    
    result = await db.execute(query, {
        "name": shift.name,
        "color": shift.color or '#1976d2',
        "start_time": shift.start_time,
        "end_time": shift.end_time
    })
    await db.commit()
    
    row = result.fetchone()
    return ShiftResponse(
        id=row.id,
        name=row.name,
        color=row.color,
        start_time=str(row.start_time) if row.start_time else None,
        end_time=str(row.end_time) if row.end_time else None,
        employee_count=0
    )


@router.put("/{shift_id}", response_model=ShiftResponse)
async def update_shift(
    shift_id: int,
    shift: ShiftUpdate,
    db: AsyncSession = Depends(get_db)
):
    """Update an existing shift."""
    # Check if shift exists
    check_query = text("SELECT id FROM shifts WHERE id = :id")
    result = await db.execute(check_query, {"id": shift_id})
    if not result.fetchone():
        raise HTTPException(status_code=404, detail="Vardiya bulunamadı")
    
    # Check if new name conflicts with existing
    if shift.name:
        check_name = text("SELECT id FROM shifts WHERE name = :name AND id != :id")
        result = await db.execute(check_name, {"name": shift.name, "id": shift_id})
        if result.fetchone():
            raise HTTPException(status_code=400, detail="Bu isimde bir vardiya zaten var")
    
    # Build update query dynamically
    updates = []
    params = {"id": shift_id}
    
    if shift.name is not None:
        updates.append("name = :name")
        params["name"] = shift.name
    if shift.color is not None:
        updates.append("color = :color")
        params["color"] = shift.color
    if shift.start_time is not None:
        updates.append("start_time = :start_time")
        params["start_time"] = shift.start_time if shift.start_time else None
    if shift.end_time is not None:
        updates.append("end_time = :end_time")
        params["end_time"] = shift.end_time if shift.end_time else None
    
    if not updates:
        raise HTTPException(status_code=400, detail="Güncellenecek alan bulunamadı")
    
    query = text(f"""
        UPDATE shifts SET {', '.join(updates)}
        WHERE id = :id
        RETURNING id, name, color, start_time, end_time
    """)
    
    result = await db.execute(query, params)
    await db.commit()
    
    row = result.fetchone()
    
    # Get employee count
    count_query = text("SELECT COUNT(*) as count FROM employees WHERE shift_id = :id")
    count_result = await db.execute(count_query, {"id": shift_id})
    count_row = count_result.fetchone()
    
    return ShiftResponse(
        id=row.id,
        name=row.name,
        color=row.color,
        start_time=str(row.start_time) if row.start_time else None,
        end_time=str(row.end_time) if row.end_time else None,
        employee_count=count_row.count
    )


@router.delete("/{shift_id}")
async def delete_shift(shift_id: int, db: AsyncSession = Depends(get_db)):
    """Delete a shift. Employees will have their shift_id set to NULL."""
    # Check if shift exists
    check_query = text("SELECT id, name FROM shifts WHERE id = :id")
    result = await db.execute(check_query, {"id": shift_id})
    row = result.fetchone()
    
    if not row:
        raise HTTPException(status_code=404, detail="Vardiya bulunamadı")
    
    # Don't allow deleting the default "Genel" shift
    if row.name == "Genel":
        raise HTTPException(status_code=400, detail="Varsayılan vardiya silinemez")
    
    # Delete (employees will have shift_id set to NULL due to ON DELETE SET NULL)
    delete_query = text("DELETE FROM shifts WHERE id = :id")
    await db.execute(delete_query, {"id": shift_id})
    await db.commit()
    
    return {"message": "Vardiya silindi", "id": shift_id}


@router.put("/{shift_id}/assign-employees")
async def assign_employees_to_shift(
    shift_id: int,
    employee_ids: List[int],
    db: AsyncSession = Depends(get_db)
):
    """Assign multiple employees to a shift."""
    # Check if shift exists
    check_query = text("SELECT id FROM shifts WHERE id = :id")
    result = await db.execute(check_query, {"id": shift_id})
    if not result.fetchone():
        raise HTTPException(status_code=404, detail="Vardiya bulunamadı")
    
    if not employee_ids:
        return {"message": "Çalışan listesi boş", "updated": 0}
    
    # Update employees
    update_query = text("""
        UPDATE employees 
        SET shift_id = :shift_id 
        WHERE id = ANY(:employee_ids)
    """)
    
    await db.execute(update_query, {
        "shift_id": shift_id,
        "employee_ids": employee_ids
    })
    await db.commit()
    
    return {"message": f"{len(employee_ids)} çalışan vardiyaya atandı", "updated": len(employee_ids)}
