"""
Clustering Service - Groups employees into shuttle stops using DBSCAN and K-Means

This module implements spatial clustering to group employees within walking distance
of shuttle stops (200m constraint).
"""
import numpy as np
from sklearn.cluster import DBSCAN, KMeans
from sklearn.metrics import pairwise_distances
from typing import List, Tuple, Dict
from geopy.distance import geodesic
import logging

logger = logging.getLogger(__name__)


class ClusteringService:
    """
    Service for clustering employee locations into shuttle stops.
    Uses DBSCAN for density-based clustering with geodesic distance.
    """
    
    def __init__(self, max_walking_distance_meters: float = 200.0):
        """
        Initialize clustering service.
        
        Args:
            max_walking_distance_meters: Maximum walking distance to a stop (default 200m)
        """
        self.max_walking_distance = max_walking_distance_meters
        # Convert meters to approximate degrees for DBSCAN
        # At equator, 1 degree ~ 111km, so 200m ~ 0.0018 degrees
        self.eps_degrees = max_walking_distance_meters / 111000.0
    
    def _calculate_distance_matrix(self, coordinates: np.ndarray) -> np.ndarray:
        """
        Calculate geodesic distance matrix between all points.
        
        Args:
            coordinates: Array of shape (n, 2) with [lat, lng] pairs
            
        Returns:
            Distance matrix in meters
        """
        n = len(coordinates)
        distances = np.zeros((n, n))
        
        for i in range(n):
            for j in range(i + 1, n):
                dist = geodesic(
                    (coordinates[i][0], coordinates[i][1]),
                    (coordinates[j][0], coordinates[j][1])
                ).meters
                distances[i, j] = dist
                distances[j, i] = dist
        
        return distances
    
    def cluster_with_dbscan(
        self, 
        employee_coordinates: List[Tuple[float, float]],
        employee_ids: List[int]
    ) -> Dict:
        """
        Cluster employees using DBSCAN algorithm.
        
        DBSCAN is ideal for this use case because:
        - It doesn't require specifying number of clusters
        - It handles irregular shaped clusters
        - It identifies outliers (employees too far from any group)
        
        Args:
            employee_coordinates: List of (lat, lng) tuples
            employee_ids: List of employee IDs corresponding to coordinates
            
        Returns:
            Dictionary with clusters, stops, and unclustered employees
        """
        if not employee_coordinates:
            return {
                "clusters": [],
                "stops": [],
                "unclustered": [],
                "total_clusters": 0
            }
        
        coordinates = np.array(employee_coordinates)
        
        # Calculate distance matrix in meters
        logger.info(f"Calculating distance matrix for {len(coordinates)} employees...")
        distance_matrix = self._calculate_distance_matrix(coordinates)
        
        # DBSCAN with precomputed distances
        # eps = max walking distance, min_samples = at least 2 people per stop
        dbscan = DBSCAN(
            eps=self.max_walking_distance,
            min_samples=2,
            metric='precomputed'
        )
        
        labels = dbscan.fit_predict(distance_matrix)
        
        # Process clustering results
        clusters = {}
        unclustered = []
        
        for idx, label in enumerate(labels):
            if label == -1:
                # Noise point - employee too far from any cluster
                unclustered.append({
                    "employee_id": employee_ids[idx],
                    "location": {
                        "lat": coordinates[idx][0],
                        "lng": coordinates[idx][1]
                    }
                })
            else:
                if label not in clusters:
                    clusters[label] = []
                clusters[label].append({
                    "employee_id": employee_ids[idx],
                    "location": {
                        "lat": coordinates[idx][0],
                        "lng": coordinates[idx][1]
                    }
                })
        
        # Calculate stop locations (centroid of each cluster)
        stops = []
        for cluster_id, members in clusters.items():
            lats = [m["location"]["lat"] for m in members]
            lngs = [m["location"]["lng"] for m in members]
            
            centroid_lat = np.mean(lats)
            centroid_lng = np.mean(lngs)
            
            # Verify all members are within walking distance of centroid
            max_dist = 0
            for member in members:
                dist = geodesic(
                    (centroid_lat, centroid_lng),
                    (member["location"]["lat"], member["location"]["lng"])
                ).meters
                max_dist = max(max_dist, dist)
            
            stops.append({
                "cluster_id": cluster_id,
                "location": {
                    "lat": centroid_lat,
                    "lng": centroid_lng
                },
                "employee_count": len(members),
                "employee_ids": [m["employee_id"] for m in members],
                "max_distance_to_centroid": max_dist
            })
        
        logger.info(f"DBSCAN created {len(stops)} clusters, {len(unclustered)} unclustered")
        
        return {
            "clusters": clusters,
            "stops": stops,
            "unclustered": unclustered,
            "total_clusters": len(stops)
        }
    
    def cluster_with_constrained_kmeans(
        self,
        employee_coordinates: List[Tuple[float, float]],
        employee_ids: List[int],
        max_cluster_size: int = 27
    ) -> Dict:
        """
        Cluster employees using K-Means with capacity constraints.
        
        This approach:
        1. First estimates number of clusters based on capacity
        2. Runs K-Means to get initial clusters
        3. Refines clusters to ensure all employees are within walking distance
        
        Args:
            employee_coordinates: List of (lat, lng) tuples
            employee_ids: List of employee IDs
            max_cluster_size: Maximum employees per cluster (vehicle capacity)
            
        Returns:
            Dictionary with clusters and stops
        """
        if not employee_coordinates:
            return {
                "clusters": [],
                "stops": [],
                "unclustered": [],
                "total_clusters": 0
            }
        
        coordinates = np.array(employee_coordinates)
        n_employees = len(coordinates)
        
        # Estimate number of clusters (at least n/max_size clusters)
        n_clusters = max(int(np.ceil(n_employees / max_cluster_size)), 2)
        
        logger.info(f"Running K-Means with {n_clusters} clusters for {n_employees} employees")
        
        # Run K-Means
        kmeans = KMeans(
            n_clusters=n_clusters,
            random_state=42,
            n_init=10,
            max_iter=300
        )
        labels = kmeans.fit_predict(coordinates)
        centroids = kmeans.cluster_centers_
        
        # Process results and validate walking distance constraint
        clusters = {}
        unclustered = []
        
        for idx, label in enumerate(labels):
            centroid = centroids[label]
            dist_to_centroid = geodesic(
                (coordinates[idx][0], coordinates[idx][1]),
                (centroid[0], centroid[1])
            ).meters
            
            if dist_to_centroid > self.max_walking_distance:
                # Employee too far from centroid, mark as unclustered
                unclustered.append({
                    "employee_id": employee_ids[idx],
                    "location": {
                        "lat": coordinates[idx][0],
                        "lng": coordinates[idx][1]
                    },
                    "distance_to_centroid": dist_to_centroid
                })
            else:
                if label not in clusters:
                    clusters[label] = []
                clusters[label].append({
                    "employee_id": employee_ids[idx],
                    "location": {
                        "lat": coordinates[idx][0],
                        "lng": coordinates[idx][1]
                    },
                    "distance_to_centroid": dist_to_centroid
                })
        
        # Create stops from valid clusters
        stops = []
        for cluster_id, members in clusters.items():
            if len(members) == 0:
                continue
                
            # Recalculate centroid for valid members only
            lats = [m["location"]["lat"] for m in members]
            lngs = [m["location"]["lng"] for m in members]
            
            stops.append({
                "cluster_id": int(cluster_id),
                "location": {
                    "lat": np.mean(lats),
                    "lng": np.mean(lngs)
                },
                "employee_count": len(members),
                "employee_ids": [m["employee_id"] for m in members],
                "max_distance_to_centroid": max(m["distance_to_centroid"] for m in members)
            })
        
        logger.info(f"K-Means created {len(stops)} valid clusters, {len(unclustered)} unclustered")
        
        return {
            "clusters": clusters,
            "stops": stops,
            "unclustered": unclustered,
            "total_clusters": len(stops)
        }
    
    def refine_clusters_for_walking_distance(
        self,
        stops: List[Dict],
        unclustered: List[Dict]
    ) -> Tuple[List[Dict], List[Dict]]:
        """
        Tries to assign unclustered employees to nearby existing stops
        or creates new mini-stops for them.
        
        Args:
            stops: List of current stops
            unclustered: List of unclustered employees
            
        Returns:
            Tuple of (updated stops, still unclustered employees)
        """
        still_unclustered = []
        
        for emp in unclustered:
            assigned = False
            emp_loc = (emp["location"]["lat"], emp["location"]["lng"])
            
            # Try to find an existing stop within walking distance
            for stop in stops:
                stop_loc = (stop["location"]["lat"], stop["location"]["lng"])
                dist = geodesic(emp_loc, stop_loc).meters
                
                if dist <= self.max_walking_distance:
                    # Assign to this stop
                    stop["employee_count"] += 1
                    stop["employee_ids"].append(emp["employee_id"])
                    stop["max_distance_to_centroid"] = max(
                        stop["max_distance_to_centroid"],
                        dist
                    )
                    assigned = True
                    break
            
            if not assigned:
                still_unclustered.append(emp)
        
        # Create individual stops for remaining unclustered employees
        # (they'll have their own pickup point)
        for idx, emp in enumerate(still_unclustered):
            stops.append({
                "cluster_id": 1000 + idx,  # High ID for individual stops
                "location": emp["location"],
                "employee_count": 1,
                "employee_ids": [emp["employee_id"]],
                "max_distance_to_centroid": 0,
                "is_individual_stop": True
            })
        
        return stops, []


def cluster_employees(
    employee_data: List[Dict],
    max_walking_distance: float = 200.0,
    method: str = "dbscan"
) -> Dict:
    """
    Main function to cluster employees into shuttle stops.
    
    Args:
        employee_data: List of dicts with 'id', 'lat', 'lng' keys
        max_walking_distance: Maximum walking distance in meters
        method: Clustering method ('dbscan' or 'kmeans')
        
    Returns:
        Clustering results with stops and assignments
    """
    service = ClusteringService(max_walking_distance)
    
    coordinates = [(emp["lat"], emp["lng"]) for emp in employee_data]
    ids = [emp["id"] for emp in employee_data]
    
    if method == "dbscan":
        result = service.cluster_with_dbscan(coordinates, ids)
    else:
        result = service.cluster_with_constrained_kmeans(coordinates, ids)
    
    # Refine to minimize unclustered
    if result["unclustered"]:
        result["stops"], result["unclustered"] = service.refine_clusters_for_walking_distance(
            result["stops"],
            result["unclustered"]
        )
    
    return result
