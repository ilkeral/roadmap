"""
OSRM Service - Interfaces with Open Source Routing Machine for road network calculations

Provides:
- Distance/duration matrix calculation
- Route polyline retrieval
- Turn-by-turn navigation
"""
import httpx
import asyncio
from typing import List, Tuple, Dict, Optional
import logging
import numpy as np

from app.core.config import settings

logger = logging.getLogger(__name__)


class OSRMService:
    """
    Service for interacting with OSRM routing engine.
    
    OSRM provides:
    - Real road network distances (not straight-line)
    - Actual driving durations considering road types
    - Route polylines for visualization
    """
    
    def __init__(self, base_url: str = None):
        """
        Initialize OSRM service.
        
        Args:
            base_url: OSRM server URL (default from settings)
        """
        self.base_url = base_url or settings.osrm_url
        self.timeout = httpx.Timeout(60.0, connect=10.0)
    
    async def get_distance_matrix(
        self,
        coordinates: List[Tuple[float, float]],
        profile: str = "driving",
        exclude_tolls: bool = False
    ) -> Dict:
        """
        Get distance and duration matrix between all coordinates.
        
        This is used by the VRP solver to know travel costs between stops.
        
        Args:
            coordinates: List of (lat, lng) tuples
            profile: Routing profile (driving, cycling, walking)
            exclude_tolls: Whether to exclude toll roads
            
        Returns:
            Dictionary with 'distances' and 'durations' matrices
        """
        if len(coordinates) < 2:
            return {
                "distances": [[0]],
                "durations": [[0]],
                "valid": True
            }
        
        # OSRM expects coordinates in lng,lat format (GeoJSON order)
        coords_str = ";".join([f"{lng},{lat}" for lat, lng in coordinates])
        
        url = f"{self.base_url}/table/v1/{profile}/{coords_str}"
        params = {
            "annotations": "distance,duration"
        }
        
        # Add toll exclusion if requested
        if exclude_tolls:
            params["exclude"] = "toll"
        
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.get(url, params=params)
                response.raise_for_status()
                data = response.json()
                
                if data.get("code") != "Ok":
                    logger.error(f"OSRM error: {data.get('message', 'Unknown error')}")
                    return self._fallback_distance_matrix(coordinates)
                
                return {
                    "distances": data.get("distances", []),
                    "durations": data.get("durations", []),
                    "valid": True
                }
                
        except httpx.HTTPError as e:
            logger.error(f"OSRM HTTP error: {e}")
            return self._fallback_distance_matrix(coordinates)
        except Exception as e:
            logger.error(f"OSRM error: {e}")
            return self._fallback_distance_matrix(coordinates)
    
    def _fallback_distance_matrix(
        self,
        coordinates: List[Tuple[float, float]]
    ) -> Dict:
        """
        Calculate straight-line distance matrix as fallback when OSRM is unavailable.
        
        Uses Haversine formula for geodesic distance.
        """
        from geopy.distance import geodesic
        
        n = len(coordinates)
        distances = np.zeros((n, n))
        durations = np.zeros((n, n))
        
        # Assume average speed of 30 km/h for duration estimation
        avg_speed_ms = 30 * 1000 / 3600  # m/s
        
        for i in range(n):
            for j in range(n):
                if i != j:
                    dist = geodesic(coordinates[i], coordinates[j]).meters
                    distances[i][j] = dist
                    # Multiply by 1.4 to account for road network vs straight line
                    durations[i][j] = (dist * 1.4) / avg_speed_ms
        
        logger.warning("Using fallback distance matrix (straight-line distances)")
        
        return {
            "distances": distances.tolist(),
            "durations": durations.tolist(),
            "valid": False,
            "fallback": True
        }
    
    async def get_route(
        self,
        coordinates: List[Tuple[float, float]],
        profile: str = "driving",
        exclude_tolls: bool = False
    ) -> Dict:
        """
        Get the optimal route through all coordinates (in order).
        
        Args:
            coordinates: List of (lat, lng) tuples in visit order
            profile: Routing profile
            exclude_tolls: Whether to exclude toll roads
            
        Returns:
            Route data including geometry, distance, duration
        """
        if len(coordinates) < 2:
            return {
                "geometry": [],
                "distance": 0,
                "duration": 0
            }
        
        # OSRM expects lng,lat format
        coords_str = ";".join([f"{lng},{lat}" for lat, lng in coordinates])
        
        url = f"{self.base_url}/route/v1/{profile}/{coords_str}"
        params = {
            "overview": "full",
            "geometries": "geojson",
            "steps": "true"
        }
        
        # Add toll exclusion if requested
        if exclude_tolls:
            params["exclude"] = "toll"
        
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.get(url, params=params)
                response.raise_for_status()
                data = response.json()
                
                if data.get("code") != "Ok":
                    logger.error(f"OSRM route error: {data.get('message')}")
                    return self._fallback_route(coordinates)
                
                route = data.get("routes", [{}])[0]
                geometry = route.get("geometry", {}).get("coordinates", [])
                
                # Convert from [lng, lat] to [lat, lng]
                polyline = [{"lat": coord[1], "lng": coord[0]} for coord in geometry]
                
                return {
                    "geometry": polyline,
                    "distance": route.get("distance", 0),
                    "duration": route.get("duration", 0),
                    "legs": route.get("legs", [])
                }
                
        except httpx.HTTPError as e:
            logger.error(f"OSRM route HTTP error: {e}")
            return self._fallback_route(coordinates)
        except Exception as e:
            logger.error(f"OSRM route error: {e}")
            return self._fallback_route(coordinates)
    
    def _fallback_route(
        self,
        coordinates: List[Tuple[float, float]]
    ) -> Dict:
        """
        Create a simple straight-line route as fallback.
        """
        from geopy.distance import geodesic
        
        polyline = [{"lat": lat, "lng": lng} for lat, lng in coordinates]
        
        total_distance = 0
        for i in range(len(coordinates) - 1):
            total_distance += geodesic(coordinates[i], coordinates[i + 1]).meters
        
        # Estimate duration at 30 km/h average
        total_duration = (total_distance * 1.4) / (30 * 1000 / 3600)
        
        return {
            "geometry": polyline,
            "distance": total_distance * 1.4,  # Account for roads
            "duration": total_duration,
            "fallback": True
        }
    
    async def check_health(self) -> bool:
        """Check if OSRM service is available."""
        try:
            # Simple request to check if OSRM is responding
            url = f"{self.base_url}/route/v1/driving/0,0;1,1"
            async with httpx.AsyncClient(timeout=httpx.Timeout(5.0)) as client:
                response = await client.get(url)
                return response.status_code in [200, 400]  # 400 means it's responding but invalid coords
        except Exception:
            return False
    
    async def get_trip(
        self,
        coordinates: List[Tuple[float, float]],
        roundtrip: bool = True,
        source: str = "first",
        destination: str = "last"
    ) -> Dict:
        """
        Get optimized trip (Traveling Salesman Problem solution from OSRM).
        
        This can be used as a quick TSP solution, but we use OR-Tools for
        the full CVRP solution instead.
        
        Args:
            coordinates: List of (lat, lng) tuples
            roundtrip: Whether to return to start
            source: Starting point constraint
            destination: Ending point constraint
            
        Returns:
            Optimized trip data
        """
        if len(coordinates) < 2:
            return {"waypoints": [], "trips": []}
        
        coords_str = ";".join([f"{lng},{lat}" for lat, lng in coordinates])
        
        url = f"{self.base_url}/trip/v1/driving/{coords_str}"
        params = {
            "roundtrip": str(roundtrip).lower(),
            "source": source,
            "destination": destination,
            "overview": "full",
            "geometries": "geojson"
        }
        
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.get(url, params=params)
                response.raise_for_status()
                return response.json()
        except Exception as e:
            logger.error(f"OSRM trip error: {e}")
            return {"waypoints": [], "trips": [], "error": str(e)}

    async def snap_to_road(
        self,
        coordinate: Tuple[float, float],
        profile: str = "driving",
        prefer_main_roads: bool = True,
        max_distance: float = 500
    ) -> Dict:
        """
        Snap a single coordinate to the nearest road network point.
        
        Uses OSRM's nearest service to find the closest point on a road.
        Prefers main roads over small residential streets (Sokak) when possible.
        
        Args:
            coordinate: (lat, lng) tuple
            profile: Routing profile
            prefer_main_roads: Whether to prefer main roads over small streets
            max_distance: Maximum acceptable distance to snap point (meters)
            
        Returns:
            Dictionary with snapped location and walking distance
        """
        lat, lng = coordinate
        url = f"{self.base_url}/nearest/v1/{profile}/{lng},{lat}"
        # Get many results to find main roads
        params = {"number": 100 if prefer_main_roads else 1}
        
        # Turkish road naming convention:
        # Main roads: Cadde, Bulvar, Bağlantı Yolu (connector roads)
        # Small residential streets: Sokak, Sokağı, Sk., Sok.
        main_road_keywords = [
            "cadde", "caddesi", "cad.", "cad ", 
            "bulvar", "bulvarı", "blv.", "blv ",
            "bağlantı", "ana yol", "anayol",
            "otoyol", "devlet yolu", "d-", "e-", "o-"
        ]
        # Small residential street patterns - these are NOT suitable for bus stops
        small_street_patterns = [
            "sokak", "sokağı", "sokaği", 
            " sk.", " sk ", "sk.", 
            " sok.", " sok ", "sok.",
            "ara yol", "arayol"
        ]
        
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.get(url, params=params)
                response.raise_for_status()
                data = response.json()
                
                if data.get("code") == "Ok" and data.get("waypoints"):
                    waypoints = data["waypoints"]
                    
                    selected_waypoint = waypoints[0]  # Default to closest
                    
                    if prefer_main_roads:
                        # Extended search radius for main roads - allow much farther for cadde
                        main_road_max_distance = max_distance * 3.0  # Allow 3x distance (1.5km) for main roads
                        
                        # Helper to check if road is a small residential street
                        def is_small_street(name):
                            if not name:
                                return False
                            name_lower = name.lower()
                            return any(pattern in name_lower for pattern in small_street_patterns)
                        
                        # Helper to check if road is a main road
                        def is_main_road(name):
                            if not name:
                                return False
                            name_lower = name.lower()
                            return any(keyword in name_lower for keyword in main_road_keywords)
                        
                        # Priority 1: Find named main roads (Cadde/Bulvar/Bağlantı)
                        main_road_waypoints = [
                            wp for wp in waypoints 
                            if is_main_road(wp.get("name")) and wp.get("distance", float("inf")) <= main_road_max_distance
                        ]
                        
                        if main_road_waypoints:
                            selected_waypoint = min(main_road_waypoints, key=lambda w: w.get("distance", float("inf")))
                            logger.info(f"✓ Ana cadde tercih edildi: {selected_waypoint.get('name')} ({selected_waypoint.get('distance'):.0f}m uzakta)")
                        else:
                            # Priority 2: Find any road that's NOT a small residential street
                            non_sokak_waypoints = [
                                wp for wp in waypoints
                                if not is_small_street(wp.get("name")) and wp.get("distance", float("inf")) <= main_road_max_distance
                            ]
                            
                            if non_sokak_waypoints:
                                selected_waypoint = min(non_sokak_waypoints, key=lambda w: w.get("distance", float("inf")))
                                road_name = selected_waypoint.get('name') or '(isimsiz yol)'
                                logger.info(f"✓ Sokak olmayan yol seçildi: {road_name} ({selected_waypoint.get('distance'):.0f}m)")
                            else:
                                # Priority 3: Use nearest road but log warning
                                for wp in waypoints:
                                    if wp.get("distance", float("inf")) <= max_distance:
                                        selected_waypoint = wp
                                        break
                                logger.warning(f"⚠ Ana yol bulunamadı, en yakın kullanıldı: {selected_waypoint.get('name')} ({selected_waypoint.get('distance'):.0f}m)")
                    
                    snapped_lng, snapped_lat = selected_waypoint["location"]
                    distance = selected_waypoint.get("distance", 0)
                    
                    return {
                        "original": {"lat": lat, "lng": lng},
                        "snapped": {"lat": snapped_lat, "lng": snapped_lng},
                        "walking_distance": distance,
                        "road_name": selected_waypoint.get("name", ""),
                        "valid": True
                    }
                    
        except Exception as e:
            logger.error(f"OSRM nearest error: {e}")
        
        # Fallback - return original
        return {
            "original": {"lat": lat, "lng": lng},
            "snapped": {"lat": lat, "lng": lng},
            "walking_distance": 0,
            "road_name": "",
            "valid": False
        }

    async def snap_multiple_to_road(
        self,
        coordinates: List[Tuple[float, float]],
        profile: str = "driving",
        prefer_main_roads: bool = True
    ) -> List[Dict]:
        """
        Snap multiple coordinates to the road network.
        
        Args:
            coordinates: List of (lat, lng) tuples
            profile: Routing profile
            prefer_main_roads: Whether to prefer main roads (Cadde) over small streets (Sokak)
            
        Returns:
            List of snapped results with walking distances
        """
        # Process in parallel for better performance
        tasks = [self.snap_to_road(coord, profile, prefer_main_roads) for coord in coordinates]
        results = await asyncio.gather(*tasks)
        return results


# Singleton instance
osrm_service = OSRMService()


async def get_distance_matrix(coordinates: List[Tuple[float, float]]) -> Dict:
    """Convenience function to get distance matrix."""
    return await osrm_service.get_distance_matrix(coordinates)


async def get_route(coordinates: List[Tuple[float, float]]) -> Dict:
    """Convenience function to get route."""
    return await osrm_service.get_route(coordinates)
