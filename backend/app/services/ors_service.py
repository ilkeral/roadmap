"""
OpenRouteService API Service for walking routes
https://openrouteservice.org/dev/#/api-docs/v2/directions
"""
import httpx
import logging
from typing import List, Tuple, Dict, Optional
from app.core.config import settings

logger = logging.getLogger(__name__)

# Cache for API key
_cached_api_key: Optional[str] = None


async def get_ors_api_key_from_db() -> Optional[str]:
    """Get ORS API key from database settings"""
    global _cached_api_key
    
    # Return cached key if available
    if _cached_api_key:
        return _cached_api_key
    
    try:
        from app.core.database import async_session
        from sqlalchemy import text
        
        async with async_session() as db:
            result = await db.execute(text(
                "SELECT ors_api_key FROM general_settings ORDER BY id DESC LIMIT 1"
            ))
            row = result.fetchone()
            if row and row[0]:
                _cached_api_key = row[0]
                return _cached_api_key
    except Exception as e:
        logger.debug(f"Could not get ORS API key from DB: {e}")
    
    # Fallback to environment variable
    return settings.ors_api_key if hasattr(settings, 'ors_api_key') else None


def clear_ors_api_key_cache():
    """Clear cached API key (call when settings are updated)"""
    global _cached_api_key
    _cached_api_key = None


class ORSService:
    """Service for OpenRouteService API (walking routes)"""
    
    BASE_URL = "https://api.openrouteservice.org/v2/directions/foot-walking"
    
    def __init__(self):
        self.timeout = 30.0
    
    async def get_walking_route(
        self,
        coordinates: List[Tuple[float, float]]
    ) -> Dict:
        """
        Get walking route from OpenRouteService API.
        
        Args:
            coordinates: List of (lat, lng) tuples
            
        Returns:
            Dict with geometry, distance, duration
        """
        # Get API key dynamically from database
        api_key = await get_ors_api_key_from_db()
        
        if not api_key:
            logger.warning("ORS API key not configured, using fallback")
            return self._fallback_route(coordinates)
        
        if len(coordinates) < 2:
            return self._fallback_route(coordinates)
        
        try:
            # ORS expects [lng, lat] format
            ors_coords = [[lng, lat] for lat, lng in coordinates]
            
            headers = {
                "Authorization": api_key,
                "Content-Type": "application/json"
            }
            
            body = {
                "coordinates": ors_coords,
                "instructions": False,
                "geometry_simplify": False
            }
            
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.post(
                    self.BASE_URL,
                    headers=headers,
                    json=body
                )
                response.raise_for_status()
                data = response.json()
                
                # Extract route from standard JSON response
                routes = data.get("routes", [])
                if not routes:
                    logger.error("ORS returned no routes")
                    return self._fallback_route(coordinates)
                
                route = routes[0]
                summary = route.get("summary", {})
                geometry = route.get("geometry", "")
                
                # Decode polyline geometry (encoded format)
                coords = self._decode_polyline(geometry)
                
                # Convert to {lat, lng} format
                polyline = [{"lat": lat, "lng": lng} for lat, lng in coords]
                
                return {
                    "geometry": polyline,
                    "distance": summary.get("distance", 0),  # meters
                    "duration": summary.get("duration", 0),  # seconds
                    "source": "openrouteservice"
                }
                
        except httpx.HTTPStatusError as e:
            if e.response.status_code == 403:
                logger.error("ORS API key invalid or quota exceeded")
            else:
                logger.error(f"ORS HTTP error: {e.response.status_code}")
            return self._fallback_route(coordinates)
        except Exception as e:
            logger.error(f"ORS error: {e}")
            return self._fallback_route(coordinates)
    
    def _decode_polyline(self, encoded: str, precision: int = 5) -> List[Tuple[float, float]]:
        """
        Decode an encoded polyline string into a list of (lat, lng) coordinates.
        ORS uses precision 5 by default.
        """
        inv = 1.0 / (10 ** precision)
        decoded = []
        previous = [0, 0]
        i = 0
        
        while i < len(encoded):
            ll = [0, 0]
            for j in range(2):
                shift = 0
                byte = 0x20
                
                while byte >= 0x20:
                    byte = ord(encoded[i]) - 63
                    i += 1
                    ll[j] |= (byte & 0x1f) << shift
                    shift += 5
                
                ll[j] = previous[j] + (~(ll[j] >> 1) if ll[j] & 1 else (ll[j] >> 1))
                previous[j] = ll[j]
            
            decoded.append((ll[0] * inv, ll[1] * inv))
        
        return decoded
    
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
        
        # Walking speed: ~5 km/h = 1.39 m/s
        total_duration = total_distance / 1.39
        
        return {
            "geometry": polyline,
            "distance": total_distance,
            "duration": total_duration,
            "fallback": True
        }


# Singleton instance
ors_service = ORSService()
