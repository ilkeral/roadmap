"""
Configuration settings for the application
"""
from pydantic_settings import BaseSettings
from typing import List
import os


class Settings(BaseSettings):
    """Application settings"""
    
    # Database
    database_url: str = os.getenv(
        "DATABASE_URL",
        "postgresql://shuttle_user:shuttle_pass@localhost:5432/shuttle_routing"
    )
    
    # OSRM
    osrm_url: str = os.getenv("OSRM_URL", "http://localhost:5000")
    
    # CORS
    cors_origins: str = os.getenv("CORS_ORIGINS", "http://localhost:3000")
    
    # Optimization parameters
    max_walking_distance_meters: float = 200.0
    vehicle_capacities: List[int] = [16, 27]
    depot_location: List[float] = [0.0, 0.0]  # Will be set by user
    
    # Clustering parameters
    min_cluster_size: int = 3
    max_cluster_radius_meters: float = 200.0
    
    class Config:
        env_file = ".env"
    
    @property
    def cors_origins_list(self) -> List[str]:
        """Parse CORS origins from comma-separated string"""
        return [origin.strip() for origin in self.cors_origins.split(",")]
    
    @property
    def async_database_url(self) -> str:
        """Get async database URL for asyncpg"""
        return self.database_url.replace("postgresql://", "postgresql+asyncpg://")


settings = Settings()
