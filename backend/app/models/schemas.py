"""
Pydantic schemas for API request/response models
"""
from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime
from enum import Enum


class TrafficMode(str, Enum):
    """Traffic mode for route optimization"""
    NONE = "none"           # No traffic scaling (baseline)
    MORNING_PEAK = "morning" # Morning rush hour (07:00-09:00)
    EVENING_PEAK = "evening" # Evening rush hour (17:00-19:00)


# Traffic scaling factors based on Istanbul traffic data
TRAFFIC_SCALING_FACTORS = {
    TrafficMode.NONE: 1.0,
    TrafficMode.MORNING_PEAK: 1.4,  # 40% longer during morning rush
    TrafficMode.EVENING_PEAK: 1.6,  # 60% longer during evening rush
}


# ============== Employee Schemas ==============
class Coordinate(BaseModel):
    """Geographic coordinate"""
    lat: float = Field(..., ge=-90, le=90, description="Latitude")
    lng: float = Field(..., ge=-180, le=180, description="Longitude")


# ============== Shift Schemas ==============
class ShiftBase(BaseModel):
    """Base shift schema"""
    name: str = Field(..., min_length=1, max_length=100)
    color: Optional[str] = Field(default='#1976d2', max_length=20)
    start_time: Optional[str] = None
    end_time: Optional[str] = None


class ShiftCreate(ShiftBase):
    """Schema for creating a shift"""
    pass


class ShiftUpdate(BaseModel):
    """Schema for updating a shift"""
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    color: Optional[str] = Field(None, max_length=20)
    start_time: Optional[str] = None
    end_time: Optional[str] = None


class ShiftResponse(ShiftBase):
    """Schema for shift response"""
    id: int
    employee_count: int = 0

    class Config:
        from_attributes = True


class EmployeeBase(BaseModel):
    """Base employee schema"""
    name: str = Field(..., min_length=1, max_length=100)
    home_location: Coordinate


class EmployeeCreate(EmployeeBase):
    """Schema for creating an employee"""
    address: Optional[str] = None
    photo_url: Optional[str] = None
    shift_id: Optional[int] = None


class EmployeeBulkCreate(BaseModel):
    """Schema for bulk creating employees"""
    employees: List[EmployeeCreate]


class EmployeeResponse(EmployeeBase):
    """Schema for employee response"""
    id: int
    assigned_stop_id: Optional[int] = None
    distance_to_stop: Optional[float] = None
    address: Optional[str] = None
    photo_url: Optional[str] = None
    shift_id: Optional[int] = None
    shift_name: Optional[str] = None
    shift_color: Optional[str] = None

    class Config:
        from_attributes = True


# ============== Stop Schemas ==============
class StopBase(BaseModel):
    """Base stop schema"""
    name: Optional[str] = None
    location: Coordinate


class StopCreate(StopBase):
    """Schema for creating a stop"""
    pass


class StopResponse(StopBase):
    """Schema for stop response"""
    id: int
    cluster_id: Optional[int] = None
    employee_count: int = 0
    assigned_employees: List[EmployeeResponse] = []

    class Config:
        from_attributes = True


# ============== Vehicle Schemas ==============
class VehicleBase(BaseModel):
    """Base vehicle schema"""
    name: str
    capacity: int
    vehicle_type: str


class VehicleResponse(VehicleBase):
    """Schema for vehicle response"""
    id: int
    is_active: bool = True

    class Config:
        from_attributes = True


# ============== Route Schemas ==============
class RouteStopDetail(BaseModel):
    """Details of a stop within a route"""
    stop_id: int
    stop_name: Optional[str]
    location: Coordinate
    stop_order: int
    arrival_time: Optional[float] = None
    passengers_pickup: int = 0


class RouteResponse(BaseModel):
    """Schema for route response"""
    id: int
    vehicle_id: int
    vehicle_name: str
    vehicle_capacity: int
    total_distance: float  # in meters
    total_duration: float  # in seconds
    stops: List[RouteStopDetail]
    polyline: List[Coordinate] = []

    class Config:
        from_attributes = True


# ============== Optimization Schemas ==============
class OptimizationParams(BaseModel):
    """Parameters for route optimization"""
    depot_location: Coordinate = Field(..., description="Workplace/depot location")
    max_walking_distance: float = Field(default=200.0, ge=50, le=500, description="Max walking distance in meters")
    use_16_seaters: int = Field(default=5, ge=0, le=20, description="Number of 16-seater vehicles")
    use_27_seaters: int = Field(default=5, ge=0, le=20, description="Number of 27-seater vehicles")
    vehicle_priority: Optional[str] = Field(default="auto", description="Vehicle priority: 'large' (27 first), 'small' (16 first), or 'auto'")
    max_travel_time: int = Field(default=65, ge=15, le=180, description="Max travel time per route in minutes (first to last pickup)")
    exclude_tolls: bool = Field(default=False, description="Exclude toll roads from routing")
    time_limit_seconds: int = Field(default=30, ge=5, le=300, description="Optimization time limit")
    traffic_mode: TrafficMode = Field(default=TrafficMode.NONE, description="Traffic profile: none, morning (08:00), or evening (18:00)")
    buffer_seats: int = Field(default=0, ge=0, le=5, description="Buffer seats to leave empty per vehicle for comfort")


class ClusteringResult(BaseModel):
    """Result of clustering algorithm"""
    stops: List[StopResponse]
    unclustered_employees: List[EmployeeResponse]
    total_clusters: int
    average_employees_per_cluster: float


class OptimizationResult(BaseModel):
    """Result of route optimization"""
    id: int
    total_vehicles_used: int
    total_distance: float  # in meters
    total_duration: float  # in seconds
    routes: List[RouteResponse]
    clustering: ClusteringResult
    parameters: OptimizationParams
    created_at: datetime


# ============== Simulation Schemas ==============
class SimulationConfig(BaseModel):
    """Configuration for route simulation"""
    speed_multiplier: float = Field(default=1.0, ge=0.1, le=10.0, description="Playback speed multiplier")
    show_employees: bool = True
    show_stops: bool = True
    animate_routes: bool = True


class SimulationState(BaseModel):
    """Current state of simulation"""
    optimization_id: int
    current_time: float
    vehicles: List[dict]  # Current position and status of each vehicle
    completed_pickups: int
    total_pickups: int


# ============== Data Generation Schema ==============
class GenerateDataParams(BaseModel):
    """Parameters for generating sample employee data"""
    num_employees: int = Field(default=200, ge=10, le=1000)
    center_lat: float = Field(default=41.0082, description="Center latitude for data generation")
    center_lng: float = Field(default=28.9784, description="Center longitude for data generation")
    spread_km: float = Field(default=5.0, ge=1.0, le=20.0, description="Spread radius in km")
