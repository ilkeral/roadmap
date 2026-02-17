"""
Geocoding Service - Address to coordinate conversion
Uses multiple providers with fallback and Turkish address normalization
"""
import asyncio
import httpx
import re
from typing import Optional, Tuple, Dict, List
import time
import logging

logger = logging.getLogger(__name__)


class GeocodingService:
    """
    Geocoding service with Turkish address normalization and multiple providers.
    """
    
    def __init__(self):
        # Primary: Photon (Komoot) - less restrictive
        self.photon_url = "https://photon.komoot.io/api/"
        # Fallback: Nominatim
        self.nominatim_url = "https://nominatim.openstreetmap.org/search"
        
        self.cache: Dict[str, Tuple[float, float]] = {}
        self.last_request_time = 0
        self.min_request_interval = 1.0  # 1 second between requests
        self.max_retries = 3
        
        # İstanbul ilçeleri
        self.istanbul_districts = [
            "ADALAR", "ARNAVUTKÖY", "ATAŞEHİR", "AVCILAR", "BAĞCILAR", "BAHÇELİEVLER",
            "BAKIRKÖY", "BAŞAKŞEHİR", "BAYRAMPAŞA", "BEŞİKTAŞ", "BEYKOZ", "BEYLİKDÜZÜ",
            "BEYOĞLU", "BÜYÜKÇEKMECE", "ÇATALCA", "ÇEKMEKÖY", "ESENLER", "ESENYURT",
            "EYÜPSULTAN", "EYÜP", "FATİH", "GAZİOSMANPAŞA", "GÜNGÖREN", "KADIKÖY", "KAĞITHANE",
            "KARTAL", "KÜÇÜKÇEKMECE", "MALTEPE", "PENDİK", "SANCAKTEPE", "SARIYER",
            "SİLİVRİ", "SULTANBEYLİ", "SULTANGAZİ", "ŞİLE", "ŞİŞLİ", "TUZLA",
            "ÜMRANİYE", "ÜSKÜDAR", "ZEYTİNBURNU"
        ]
        
        # Kocaeli ilçeleri
        self.kocaeli_districts = [
            "GEBZE", "DARICA", "ÇAYIROVA", "DİLOVASI", "KÖRFEZ", "GÖLCÜK",
            "İZMİT", "KARTEPE", "BAŞİSKELE", "DERİNCE", "KARAMÜRSEL", "KANDIRA"
        ]
        
        # Sakarya ilçeleri
        self.sakarya_districts = [
            "ADAPAZARI", "ARİFİYE", "ERENLER", "SERDIVAN", "SAPANCA", "HENDEK",
            "AKYAZI", "KAYNARCA", "FERIZLI", "SÖĞÜTLÜ", "GEYVE", "PAMUKOVA"
        ]
        
    def _simplify_turkish_address(self, address: str) -> List[str]:
        """
        Simplify Turkish address for better geocoding.
        Returns multiple variants to try.
        """
        addr = address.upper().strip()
        
        # Remove carriage returns and normalize spaces
        addr = addr.replace('\r', ' ').replace('\n', ' ')
        addr = re.sub(r'\s+', ' ', addr)
        
        # Find district (ilçe)
        district = None
        city = None
        
        # Check for Istanbul districts
        for d in self.istanbul_districts:
            if d in addr:
                district = d
                city = "İSTANBUL"
                break
        
        # Check for Kocaeli districts
        if not district:
            for d in self.kocaeli_districts:
                if d in addr:
                    district = d
                    city = "KOCAELİ"
                    break
        
        # Check for Sakarya districts
        if not district:
            for d in self.sakarya_districts:
                if d in addr:
                    district = d
                    city = "SAKARYA"
                    break
        
        # Check for city suffix patterns
        if "İSTANBUL" in addr:
            city = "İSTANBUL"
        elif "KOCAELİ" in addr:
            city = "KOCAELİ"
        elif "SAKARYA" in addr:
            city = "SAKARYA"
        
        # Default to Istanbul if no city found
        if not city:
            city = "İSTANBUL"
        
        # Extract neighborhood (mahalle)
        neighborhood = None
        mah_patterns = [
            r'([A-ZÇĞİÖŞÜa-zçğıöşü\s]+)\s*MAH\.?(?:ALLESİ)?',
            r'([A-ZÇĞİÖŞÜa-zçğıöşü\s]+)\s*MAHALLESİ',
            r'([A-ZÇĞİÖŞÜa-zçğıöşü\s]+)\s*MH\.?',
        ]
        
        for pattern in mah_patterns:
            match = re.search(pattern, addr, re.IGNORECASE)
            if match:
                neighborhood = match.group(1).strip().upper()
                # Clean up neighborhood name
                neighborhood = re.sub(r'\b(NO|SK|SOK|CAD|APT|BLOK|SİTESİ?|DAİRE|KAT)\b.*', '', neighborhood).strip()
                # Remove numbers
                neighborhood = re.sub(r'\d+', '', neighborhood).strip()
                if len(neighborhood) > 2:
                    break
                else:
                    neighborhood = None
        
        # Extract street (cadde/sokak)
        street = None
        street_patterns = [
            r'([A-ZÇĞİÖŞÜa-zçğıöşü\s]+)\s*(CAD\.?|CADDESİ)',
            r'([A-ZÇĞİÖŞÜa-zçğıöşü\s]+)\s*(SOK\.?|SOKAK|SOKAĞ)',
            r'([A-ZÇĞİÖŞÜa-zçğıöşü\s]+)\s*(SK\.?)',
        ]
        
        for pattern in street_patterns:
            match = re.search(pattern, addr, re.IGNORECASE)
            if match:
                street = match.group(1).strip().upper()
                street_type = match.group(2).upper()
                # Clean up
                street = re.sub(r'\b(NO|APT|BLOK|SİTESİ?|DAİRE|KAT)\b.*', '', street).strip()
                street = re.sub(r'\d+', '', street).strip()
                if len(street) > 2:
                    if 'CAD' in street_type:
                        street = f"{street} CAD."
                    else:
                        street = f"{street} SOK."
                    break
                else:
                    street = None
        
        # Build multiple address variants to try
        variants = []
        
        # Variant 1: Full address with mahalle, district, city
        if neighborhood and district:
            variants.append(f"{neighborhood} MAHALLESİ, {district}, {city}, TÜRKİYE")
        
        # Variant 2: With street
        if street and neighborhood and district:
            variants.append(f"{street}, {neighborhood} MAH., {district}, {city}")
        
        # Variant 3: Just neighborhood and district
        if neighborhood and district:
            variants.append(f"{neighborhood}, {district}, {city}")
        
        # Variant 4: District and city
        if district:
            variants.append(f"{district}, {city}, TÜRKİYE")
        
        # Variant 5: Original address with Turkey
        variants.append(f"{address}, Turkey")
        
        # Variant 6: Cleaned original
        cleaned = re.sub(r'\b(NO|:|\d+/\d+|APT|DAİRE|KAT|BLOK)\b', '', addr)
        cleaned = re.sub(r'\s+', ' ', cleaned).strip()
        variants.append(f"{cleaned}, Turkey")
        
        logger.debug(f"Address variants for '{address}': {variants}")
        return variants
    
    async def _wait_for_rate_limit(self):
        """Wait if necessary to respect rate limits."""
        elapsed = time.time() - self.last_request_time
        if elapsed < self.min_request_interval:
            await asyncio.sleep(self.min_request_interval - elapsed)
        self.last_request_time = time.time()
    
    async def _geocode_photon(self, address: str) -> Optional[Tuple[float, float]]:
        """Try geocoding with Photon API."""
        params = {
            "q": address,
            "limit": 1,
            "lang": "tr"
        }
        
        headers = {
            "User-Agent": "ShuttleRouteOptimizer/1.0"
        }
        
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                response = await client.get(self.photon_url, params=params, headers=headers)
                
                if response.status_code == 200:
                    data = response.json()
                    if data.get("features") and len(data["features"]) > 0:
                        coords = data["features"][0]["geometry"]["coordinates"]
                        return (coords[1], coords[0])  # lat, lon
        except Exception as e:
            logger.debug(f"Photon geocoding error for '{address}': {e}")
        
        return None
    
    async def _geocode_nominatim(self, address: str) -> Optional[Tuple[float, float]]:
        """Try geocoding with Nominatim API."""
        params = {
            "q": address,
            "format": "json",
            "limit": 1,
            "addressdetails": 1
        }
        
        headers = {
            "User-Agent": "ShuttleRouteOptimizer/1.0 (roadmap.alcom.dev)"
        }
        
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                response = await client.get(self.nominatim_url, params=params, headers=headers)
                
                if response.status_code == 200:
                    results = response.json()
                    if results and len(results) > 0:
                        lat = float(results[0]["lat"])
                        lon = float(results[0]["lon"])
                        return (lat, lon)
        except Exception as e:
            logger.debug(f"Nominatim geocoding error for '{address}': {e}")
        
        return None
    
    async def geocode(self, address: str, country: str = "Turkey") -> Optional[Tuple[float, float]]:
        """
        Convert an address to coordinates.
        Tries multiple address variants until one succeeds.
        """
        # Check cache first
        cache_key = address.lower().strip()
        if cache_key in self.cache:
            return self.cache[cache_key]
        
        # Get address variants to try
        variants = self._simplify_turkish_address(address)
        
        result = None
        tried_variants = []
        
        for variant in variants:
            # Check if variant is in cache
            variant_key = variant.lower()
            if variant_key in self.cache:
                result = self.cache[variant_key]
                break
            
            tried_variants.append(variant)
            
            # Rate limit
            await self._wait_for_rate_limit()
            
            # Try Photon first
            result = await self._geocode_photon(variant)
            if result:
                logger.info(f"Geocoded '{address}' using variant: '{variant}'")
                break
            
            # Try Nominatim as fallback
            await self._wait_for_rate_limit()
            result = await self._geocode_nominatim(variant)
            if result:
                logger.info(f"Geocoded '{address}' using Nominatim with variant: '{variant}'")
                break
        
        # Cache result
        if result:
            self.cache[cache_key] = result
            # Cache all tried variants
            for v in tried_variants:
                self.cache[v.lower()] = result
            return result
        
        logger.warning(f"Geocoding failed for '{address}' - tried variants: {tried_variants}")
        return None
    
    async def geocode_batch(self, addresses: list, country: str = "Turkey") -> Dict[str, Optional[Tuple[float, float]]]:
        """
        Geocode multiple addresses.
        """
        results = {}
        
        for i, address in enumerate(addresses):
            coords = await self.geocode(address, country)
            results[address] = coords
            
            # Log progress
            if (i + 1) % 10 == 0:
                logger.info(f"Geocoded {i + 1}/{len(addresses)} addresses")
            
        return results


# Singleton instance
geocoding_service = GeocodingService()
