"""
Employees API Router - CRUD operations for employee data
"""
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from typing import List, Optional
import random
import numpy as np
import pandas as pd
import io

from app.core.database import get_db
from app.models.schemas import (
    EmployeeCreate, EmployeeBulkCreate, EmployeeResponse, 
    Coordinate, GenerateDataParams
)
from app.services.geocoding_service import geocoding_service

router = APIRouter()


@router.get("/", response_model=List[EmployeeResponse])
async def get_employees(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    db: AsyncSession = Depends(get_db)
):
    """Get all employees with pagination."""
    query = text("""
        SELECT id, name, 
               ST_Y(home_location) as lat, 
               ST_X(home_location) as lng,
               assigned_stop_id,
               address
        FROM employees
        ORDER BY id
        OFFSET :skip LIMIT :limit
    """)
    
    result = await db.execute(query, {"skip": skip, "limit": limit})
    rows = result.fetchall()
    
    return [
        EmployeeResponse(
            id=row.id,
            name=row.name,
            home_location=Coordinate(lat=row.lat, lng=row.lng),
            assigned_stop_id=row.assigned_stop_id,
            address=row.address
        )
        for row in rows
    ]


@router.get("/count")
async def get_employee_count(db: AsyncSession = Depends(get_db)):
    """Get total employee count."""
    query = text("SELECT COUNT(*) as count FROM employees")
    result = await db.execute(query)
    row = result.fetchone()
    return {"count": row.count}


@router.post("/", response_model=EmployeeResponse)
async def create_employee(
    employee: EmployeeCreate,
    db: AsyncSession = Depends(get_db)
):
    """Create a new employee."""
    query = text("""
        INSERT INTO employees (name, home_location, address)
        VALUES (:name, ST_SetSRID(ST_MakePoint(:lng, :lat), 4326), :address)
        RETURNING id, name, ST_Y(home_location) as lat, ST_X(home_location) as lng, address
    """)
    
    result = await db.execute(query, {
        "name": employee.name,
        "lat": employee.home_location.lat,
        "lng": employee.home_location.lng,
        "address": employee.address
    })
    await db.commit()
    
    row = result.fetchone()
    return EmployeeResponse(
        id=row.id,
        name=row.name,
        home_location=Coordinate(lat=row.lat, lng=row.lng),
        address=row.address
    )


@router.post("/bulk", response_model=dict)
async def create_employees_bulk(
    data: EmployeeBulkCreate,
    db: AsyncSession = Depends(get_db)
):
    """Create multiple employees at once."""
    created_count = 0
    
    for employee in data.employees:
        query = text("""
            INSERT INTO employees (name, home_location)
            VALUES (:name, ST_SetSRID(ST_MakePoint(:lng, :lat), 4326))
        """)
        await db.execute(query, {
            "name": employee.name,
            "lat": employee.home_location.lat,
            "lng": employee.home_location.lng
        })
        created_count += 1
    
    await db.commit()
    return {"created": created_count}


@router.post("/generate", response_model=dict)
async def generate_sample_employees(
    params: GenerateDataParams,
    db: AsyncSession = Depends(get_db)
):
    """
    Generate sample employee data for testing.
    
    Creates employees distributed around a center point with some clustering
    to simulate realistic residential patterns.
    """
    # Clear existing employees
    await db.execute(text("DELETE FROM employees"))
    
    center_lat = params.center_lat
    center_lng = params.center_lng
    spread_km = params.spread_km
    num_employees = params.num_employees
    
    # Convert km to degrees (approximately)
    spread_deg = spread_km / 111.0
    
    # Create clusters to simulate neighborhoods
    num_clusters = max(10, num_employees // 20)
    cluster_centers = []
    
    for _ in range(num_clusters):
        c_lat = center_lat + np.random.uniform(-spread_deg, spread_deg)
        c_lng = center_lng + np.random.uniform(-spread_deg, spread_deg)
        cluster_centers.append((c_lat, c_lng))
    
    # Generate employees
    first_names = ["Ali", "Mehmet", "Ayşe", "Fatma", "Mustafa", "Ahmet", "Zeynep", 
                   "Elif", "Emre", "Burak", "Deniz", "Cem", "Selin", "Mert", "Ece"]
    last_names = ["Yılmaz", "Kaya", "Demir", "Şahin", "Çelik", "Yıldız", "Öztürk",
                  "Aydın", "Özdemir", "Arslan", "Doğan", "Kılıç", "Aslan", "Çetin"]
    
    created_count = 0
    for i in range(num_employees):
        # Pick a random cluster center
        cluster_idx = random.randint(0, num_clusters - 1)
        c_lat, c_lng = cluster_centers[cluster_idx]
        
        # Add small random offset (within ~200m to create dense clusters)
        offset = 0.002  # ~200m
        lat = c_lat + np.random.uniform(-offset, offset)
        lng = c_lng + np.random.uniform(-offset, offset)
        
        name = f"{random.choice(first_names)} {random.choice(last_names)}"
        
        query = text("""
            INSERT INTO employees (name, home_location)
            VALUES (:name, ST_SetSRID(ST_MakePoint(:lng, :lat), 4326))
        """)
        await db.execute(query, {"name": name, "lat": lat, "lng": lng})
        created_count += 1
    
    await db.commit()
    
    return {
        "created": created_count,
        "clusters": num_clusters,
        "center": {"lat": center_lat, "lng": center_lng},
        "spread_km": spread_km
    }


@router.delete("/", response_model=dict)
async def delete_all_employees(db: AsyncSession = Depends(get_db)):
    """Delete all employees."""
    await db.execute(text("DELETE FROM employees"))
    await db.commit()
    return {"deleted": True}


@router.get("/template")
async def get_excel_template():
    """
    Get information about Excel template format.
    """
    return {
        "required_columns": [
            {"name": "ADI", "alternatives": ["name", "isim", "ad"], "description": "Çalışan adı"},
            {"name": "SOYADI", "alternatives": ["surname", "soyad"], "description": "Çalışan soyadı"},
            {"name": "ADRES", "alternatives": ["address", "ev adresi"], "description": "Ev adresi (geocoding için)"}
        ],
        "example_data": [
            {"ADI": "ABDULLAH", "SOYADI": "TEKİN", "ADRES": "ORHANGAZİ MAH. ENVER SK. SİTESİ BLOK NO:56 İÇ KAPI NO:1 PENDİK-İSTANBUL"},
            {"ADI": "ADEM", "SOYADI": "KURTOĞLU", "ADRES": "AYDINLI MAH. YAVUZER SK. EMİR APT. NO:15 İÇ KAPI NO:3 TUZLA"},
            {"ADI": "AHMET", "SOYADI": "AYDIN", "ADRES": "VELİ BABA MAH. GÜVEN SK. NO:49 İÇ KAPI NO:1 PENDİK"}
        ],
        "notes": [
            "Excel dosyası .xlsx, .xls veya .csv formatında olabilir",
            "İlk satır sütun başlıkları için kullanılmalıdır",
            "ADI ve SOYADI sütunları otomatik birleştirilir",
            "Tek sütunda ad soyad da kullanılabilir (isim veya name)",
            "Aynı isimde kayıt varsa mükerrer eklenmez",
            "Adresler Türkiye için geocode edilir"
        ]
    }


@router.post("/upload-excel", response_model=dict)
async def upload_employees_excel(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db)
):
    """
    Upload employees from Excel/CSV file.
    
    Expected columns (case-insensitive):
    - ADI + SOYADI: First name and surname (separate columns)
    - OR name/isim: Full name (single column)
    - ADRES/address: Address for geocoding (required)
    
    Features:
    - Supports Excel (.xlsx, .xls) and CSV formats
    - Converts addresses to coordinates using geocoding
    - Skips duplicate entries (same name)
    - Returns summary of imported, skipped, and failed records
    """
    # Validate file type
    filename_lower = file.filename.lower()
    if not filename_lower.endswith(('.xlsx', '.xls', '.csv')):
        raise HTTPException(status_code=400, detail="Sadece Excel (.xlsx, .xls) veya CSV (.csv) dosyaları kabul edilir")
    
    try:
        # Read file content
        content = await file.read()
        
        # Parse file based on type
        if filename_lower.endswith('.csv'):
            # Try different encodings for CSV
            for encoding in ['utf-8', 'utf-8-sig', 'iso-8859-9', 'cp1254', 'latin1']:
                try:
                    df = pd.read_csv(io.BytesIO(content), encoding=encoding)
                    break
                except UnicodeDecodeError:
                    continue
            else:
                raise HTTPException(status_code=400, detail="CSV dosyası okunamadı. Karakter kodlaması desteklenmiyor.")
        else:
            # Parse Excel
            try:
                df = pd.read_excel(io.BytesIO(content), engine='openpyxl')
            except Exception:
                df = pd.read_excel(io.BytesIO(content), engine='xlrd')
        
        if df.empty:
            raise HTTPException(status_code=400, detail="Dosya boş")
        
        # Normalize column names
        df.columns = df.columns.str.lower().str.strip()
        
        # Find name column(s) - support both single name column and separate first/last name columns
        name_col = None
        first_name_col = None
        last_name_col = None
        
        # Check for separate first name and last name columns first
        for col in ['adi', 'adı', 'ad', 'first_name', 'firstname', 'isim']:
            if col in df.columns:
                first_name_col = col
                break
        
        for col in ['soyadi', 'soyadı', 'soyad', 'last_name', 'lastname', 'surname']:
            if col in df.columns:
                last_name_col = col
                break
        
        # If we have both first and last name columns, we'll combine them
        # Otherwise look for a single full name column
        if not (first_name_col and last_name_col):
            for col in ['name', 'isim', 'ad soyad', 'adsoyad', 'ad_soyad', 'çalışan', 'personel', 'tam ad', 'full_name']:
                if col in df.columns:
                    name_col = col
                    break
        
        if not name_col and not (first_name_col and last_name_col):
            raise HTTPException(
                status_code=400, 
                detail="İsim sütunu bulunamadı. 'ADI' ve 'SOYADI' sütunları veya 'isim' sütunu gerekli"
            )
        
        # Find address column
        address_col = None
        for col in ['address', 'adres', 'ev adresi', 'adres bilgisi', 'konum']:
            if col in df.columns:
                address_col = col
                break
        
        if not address_col:
            raise HTTPException(
                status_code=400, 
                detail="Adres sütunu bulunamadı. 'address' veya 'adres' sütunu gerekli"
            )
        
        # Get existing employee names for duplicate check
        existing_query = text("SELECT LOWER(name) as name FROM employees")
        existing_result = await db.execute(existing_query)
        existing_names = {row.name for row in existing_result.fetchall()}
        
        # Process records
        imported = 0
        skipped = 0
        failed = []
        geocode_failed = []
        
        for index, row in df.iterrows():
            # Build full name from columns
            if first_name_col and last_name_col:
                # Combine first and last name
                first_name = str(row[first_name_col]).strip() if pd.notna(row[first_name_col]) else ""
                last_name = str(row[last_name_col]).strip() if pd.notna(row[last_name_col]) else ""
                name = f"{first_name} {last_name}".strip()
                if first_name == 'nan':
                    first_name = ""
                if last_name == 'nan':
                    last_name = ""
                name = f"{first_name} {last_name}".strip()
            else:
                name = str(row[name_col]).strip() if pd.notna(row[name_col]) else None
            
            address = str(row[address_col]).strip() if pd.notna(row[address_col]) else None
            
            # Skip empty rows
            if not name or not address or name == 'nan' or address == 'nan':
                failed.append({"row": index + 2, "reason": "Boş isim veya adres"})
                continue
            
            # Check for duplicate
            if name.lower() in existing_names:
                skipped += 1
                continue
            
            # Geocode address
            coords = await geocoding_service.geocode(address, country="Turkey")
            
            if not coords:
                geocode_failed.append({
                    "row": index + 2,
                    "name": name,
                    "address": address,
                    "reason": "Adres koordinata çevrilemedi"
                })
                continue
            
            lat, lng = coords
            
            # Insert employee with address
            try:
                insert_query = text("""
                    INSERT INTO employees (name, home_location, address)
                    VALUES (:name, ST_SetSRID(ST_MakePoint(:lng, :lat), 4326), :address)
                """)
                await db.execute(insert_query, {
                    "name": name,
                    "lat": lat,
                    "lng": lng,
                    "address": address
                })
                
                # Add to existing names to prevent duplicates within same upload
                existing_names.add(name.lower())
                imported += 1
                
            except Exception as e:
                failed.append({"row": index + 2, "name": name, "reason": str(e)})
        
        await db.commit()
        
        return {
            "success": True,
            "imported": imported,
            "skipped": skipped,
            "geocode_failed": len(geocode_failed),
            "other_failed": len(failed),
            "total_processed": len(df),
            "geocode_failed_details": geocode_failed[:10],  # First 10 failed geocodes
            "failed_details": failed[:10]  # First 10 other failures
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Excel işleme hatası: {str(e)}")


@router.post("/geocode-address")
async def geocode_address(address: str = Query(..., description="Geocode edilecek adres")):
    """
    Geocode a single address and return coordinates.
    Use this to get coordinates before updating an employee.
    """
    if not address or len(address.strip()) < 5:
        raise HTTPException(status_code=400, detail="Geçerli bir adres girin")
    
    coords = await geocoding_service.geocode(address.strip())
    
    if not coords:
        raise HTTPException(
            status_code=404, 
            detail="Adres için koordinat bulunamadı. Farklı bir adres deneyin veya manuel koordinat girin."
        )
    
    return {
        "address": address,
        "lat": coords[0],
        "lng": coords[1],
        "message": "Koordinatlar başarıyla hesaplandı"
    }


@router.get("/{employee_id}", response_model=EmployeeResponse)
async def get_employee(employee_id: int, db: AsyncSession = Depends(get_db)):
    """Get a specific employee by ID."""
    query = text("""
        SELECT id, name, 
               ST_Y(home_location) as lat, 
               ST_X(home_location) as lng,
               assigned_stop_id,
               address
        FROM employees
        WHERE id = :id
    """)
    
    result = await db.execute(query, {"id": employee_id})
    row = result.fetchone()
    
    if not row:
        raise HTTPException(status_code=404, detail="Employee not found")
    
    return EmployeeResponse(
        id=row.id,
        name=row.name,
        home_location=Coordinate(lat=row.lat, lng=row.lng),
        assigned_stop_id=row.assigned_stop_id,
        address=row.address
    )


@router.delete("/{employee_id}")
async def delete_employee(employee_id: int, db: AsyncSession = Depends(get_db)):
    """Delete a specific employee."""
    query = text("DELETE FROM employees WHERE id = :id RETURNING id")
    result = await db.execute(query, {"id": employee_id})
    await db.commit()
    
    if not result.fetchone():
        raise HTTPException(status_code=404, detail="Employee not found")
    
    return {"deleted": True}


@router.put("/{employee_id}/coordinates")
async def update_employee_coordinates(
    employee_id: int,
    lat: float = Query(..., description="Enlem (latitude)"),
    lng: float = Query(..., description="Boylam (longitude)"),
    address: Optional[str] = Query(None, description="Adres (opsiyonel)"),
    db: AsyncSession = Depends(get_db)
):
    """
    Update employee coordinates manually.
    Use this when geocoding failed or produced incorrect results.
    """
    # Check if employee exists
    check_query = text("SELECT id FROM employees WHERE id = :id")
    result = await db.execute(check_query, {"id": employee_id})
    if not result.fetchone():
        raise HTTPException(status_code=404, detail="Çalışan bulunamadı")
    
    # Update coordinates and optionally address
    if address:
        update_query = text("""
            UPDATE employees 
            SET home_location = ST_SetSRID(ST_MakePoint(:lng, :lat), 4326),
                address = :address
            WHERE id = :id
            RETURNING id, name, ST_Y(home_location) as lat, ST_X(home_location) as lng, assigned_stop_id, address
        """)
        result = await db.execute(update_query, {"id": employee_id, "lat": lat, "lng": lng, "address": address})
    else:
        update_query = text("""
            UPDATE employees 
            SET home_location = ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)
            WHERE id = :id
            RETURNING id, name, ST_Y(home_location) as lat, ST_X(home_location) as lng, assigned_stop_id, address
        """)
        result = await db.execute(update_query, {"id": employee_id, "lat": lat, "lng": lng})
    
    await db.commit()
    
    row = result.fetchone()
    return EmployeeResponse(
        id=row.id,
        name=row.name,
        home_location=Coordinate(lat=row.lat, lng=row.lng),
        assigned_stop_id=row.assigned_stop_id,
        address=row.address
    )


@router.put("/{employee_id}/geocode")
async def geocode_employee_address(
    employee_id: int,
    address: str = Query(..., description="Geocode edilecek adres"),
    db: AsyncSession = Depends(get_db)
):
    """
    Geocode address and update employee coordinates in one step.
    """
    # Check if employee exists
    check_query = text("SELECT id, name FROM employees WHERE id = :id")
    result = await db.execute(check_query, {"id": employee_id})
    employee = result.fetchone()
    
    if not employee:
        raise HTTPException(status_code=404, detail="Çalışan bulunamadı")
    
    if not address or len(address.strip()) < 5:
        raise HTTPException(status_code=400, detail="Geçerli bir adres girin")
    
    # Geocode the address
    coords = await geocoding_service.geocode(address.strip())
    
    if not coords:
        raise HTTPException(
            status_code=404, 
            detail="Adres için koordinat bulunamadı. Farklı bir adres deneyin veya manuel koordinat girin."
        )
    
    # Update coordinates and save address
    update_query = text("""
        UPDATE employees 
        SET home_location = ST_SetSRID(ST_MakePoint(:lng, :lat), 4326),
            address = :address
        WHERE id = :id
        RETURNING id, name, ST_Y(home_location) as lat, ST_X(home_location) as lng, assigned_stop_id, address
    """)
    
    result = await db.execute(update_query, {"id": employee_id, "lat": coords[0], "lng": coords[1], "address": address.strip()})
    await db.commit()
    
    row = result.fetchone()
    return {
        "employee": EmployeeResponse(
            id=row.id,
            name=row.name,
            home_location=Coordinate(lat=row.lat, lng=row.lng),
            assigned_stop_id=row.assigned_stop_id,
            address=row.address
        ),
        "geocoded_address": address,
        "message": f"Koordinatlar güncellendi: {coords[0]:.6f}, {coords[1]:.6f}"
    }
