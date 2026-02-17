"""
Settings API endpoints for managing application settings like center location
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
import logging

from app.core.database import get_db
from pydantic import BaseModel, Field
from typing import Optional

logger = logging.getLogger(__name__)

router = APIRouter()


class CenterSettings(BaseModel):
    """Center/Depot settings schema"""
    address: str = Field(..., description="Center address")
    lat: float = Field(..., ge=-90, le=90, description="Latitude")
    lng: float = Field(..., ge=-180, le=180, description="Longitude")


class CenterSettingsResponse(CenterSettings):
    """Response schema with id"""
    id: int


class GeneralSettings(BaseModel):
    """General application settings"""
    google_maps_api_key: Optional[str] = Field(default=None, description="Google Maps API Key for traffic data")
    map_type: str = Field(default="street", description="Map tile type: street, satellite, terrain, dark")


class GeneralSettingsResponse(GeneralSettings):
    """Response schema with id"""
    id: int


# Default center location
DEFAULT_CENTER = {
    "address": "Pendik, İstanbul",
    "lat": 40.8783,
    "lng": 29.2333
}


async def ensure_settings_table(db: AsyncSession):
    """Create settings table if it doesn't exist"""
    await db.execute(text("""
        CREATE TABLE IF NOT EXISTS center_settings (
            id SERIAL PRIMARY KEY,
            address VARCHAR(255) NOT NULL,
            lat DOUBLE PRECISION NOT NULL,
            lng DOUBLE PRECISION NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """))
    await db.commit()


@router.get("/center", response_model=CenterSettingsResponse)
async def get_center_settings(db: AsyncSession = Depends(get_db)):
    """Get current center/depot settings"""
    try:
        # Ensure table exists
        await ensure_settings_table(db)
        
        # Get current settings
        result = await db.execute(text(
            "SELECT id, address, lat, lng FROM center_settings ORDER BY id DESC LIMIT 1"
        ))
        row = result.fetchone()
        
        if row:
            return CenterSettingsResponse(
                id=row[0],
                address=row[1],
                lat=row[2],
                lng=row[3]
            )
        
        # If no settings exist, create default
        await db.execute(text("""
            INSERT INTO center_settings (address, lat, lng)
            VALUES (:address, :lat, :lng)
        """), DEFAULT_CENTER)
        await db.commit()
        
        # Fetch the newly created record
        result = await db.execute(text(
            "SELECT id, address, lat, lng FROM center_settings ORDER BY id DESC LIMIT 1"
        ))
        row = result.fetchone()
        
        return CenterSettingsResponse(
            id=row[0],
            address=row[1],
            lat=row[2],
            lng=row[3]
        )
        
    except Exception as e:
        logger.error(f"Error getting center settings: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/center", response_model=CenterSettingsResponse)
async def update_center_settings(
    settings: CenterSettings,
    db: AsyncSession = Depends(get_db)
):
    """Update center/depot settings"""
    try:
        # Ensure table exists
        await ensure_settings_table(db)
        
        # Check if settings exist
        result = await db.execute(text(
            "SELECT id FROM center_settings ORDER BY id DESC LIMIT 1"
        ))
        row = result.fetchone()
        
        if row:
            # Update existing
            await db.execute(text("""
                UPDATE center_settings 
                SET address = :address, lat = :lat, lng = :lng, updated_at = CURRENT_TIMESTAMP
                WHERE id = :id
            """), {"address": settings.address, "lat": settings.lat, "lng": settings.lng, "id": row[0]})
            settings_id = row[0]
        else:
            # Insert new
            result = await db.execute(text("""
                INSERT INTO center_settings (address, lat, lng)
                VALUES (:address, :lat, :lng)
                RETURNING id
            """), {"address": settings.address, "lat": settings.lat, "lng": settings.lng})
            settings_id = result.fetchone()[0]
        
        await db.commit()
        
        logger.info(f"Center settings updated: {settings.address} ({settings.lat}, {settings.lng})")
        
        return CenterSettingsResponse(
            id=settings_id,
            address=settings.address,
            lat=settings.lat,
            lng=settings.lng
        )
        
    except Exception as e:
        logger.error(f"Error updating center settings: {e}")
        await db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


# ============== General Settings ==============

DEFAULT_GENERAL_SETTINGS = {
    "google_maps_api_key": "",
    "map_type": "street"
}


async def ensure_general_settings_table(db: AsyncSession):
    """Create general_settings table if it doesn't exist"""
    await db.execute(text("""
        CREATE TABLE IF NOT EXISTS general_settings (
            id SERIAL PRIMARY KEY,
            google_maps_api_key VARCHAR(255),
            map_type VARCHAR(50) DEFAULT 'street',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """))
    await db.commit()


@router.get("/general", response_model=GeneralSettingsResponse)
async def get_general_settings(db: AsyncSession = Depends(get_db)):
    """Get general application settings"""
    try:
        await ensure_general_settings_table(db)
        
        result = await db.execute(text(
            "SELECT id, google_maps_api_key, map_type FROM general_settings ORDER BY id DESC LIMIT 1"
        ))
        row = result.fetchone()
        
        if row:
            return GeneralSettingsResponse(
                id=row[0],
                google_maps_api_key=row[1] or "",
                map_type=row[2] or "street"
            )
        
        # Create default settings
        await db.execute(text("""
            INSERT INTO general_settings (google_maps_api_key, map_type)
            VALUES (:api_key, :map_type)
        """), DEFAULT_GENERAL_SETTINGS)
        await db.commit()
        
        result = await db.execute(text(
            "SELECT id, google_maps_api_key, map_type FROM general_settings ORDER BY id DESC LIMIT 1"
        ))
        row = result.fetchone()
        
        return GeneralSettingsResponse(
            id=row[0],
            google_maps_api_key=row[1] or "",
            map_type=row[2] or "street"
        )
        
    except Exception as e:
        logger.error(f"Error getting general settings: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/general", response_model=GeneralSettingsResponse)
async def update_general_settings(
    settings: GeneralSettings,
    db: AsyncSession = Depends(get_db)
):
    """Update general application settings"""
    try:
        await ensure_general_settings_table(db)
        
        result = await db.execute(text(
            "SELECT id FROM general_settings ORDER BY id DESC LIMIT 1"
        ))
        row = result.fetchone()
        
        if row:
            await db.execute(text("""
                UPDATE general_settings 
                SET google_maps_api_key = :api_key, map_type = :map_type, updated_at = CURRENT_TIMESTAMP
                WHERE id = :id
            """), {
                "api_key": settings.google_maps_api_key,
                "map_type": settings.map_type,
                "id": row[0]
            })
            settings_id = row[0]
        else:
            result = await db.execute(text("""
                INSERT INTO general_settings (google_maps_api_key, map_type)
                VALUES (:api_key, :map_type)
                RETURNING id
            """), {
                "api_key": settings.google_maps_api_key,
                "map_type": settings.map_type
            })
            settings_id = result.fetchone()[0]
        
        await db.commit()
        
        logger.info(f"General settings updated: map_type={settings.map_type}")
        
        return GeneralSettingsResponse(
            id=settings_id,
            google_maps_api_key=settings.google_maps_api_key or "",
            map_type=settings.map_type
        )
        
    except Exception as e:
        logger.error(f"Error updating general settings: {e}")
        await db.rollback()
        raise HTTPException(status_code=500, detail=str(e))
