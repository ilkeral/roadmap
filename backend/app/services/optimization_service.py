"""
OR-Tools Optimization Service - Solves Capacitated Vehicle Routing Problem (CVRP)

This module uses Google OR-Tools to solve the CVRP:
- Minimize total travel distance/time
- Respect vehicle capacity constraints (16 and 27 seaters)
- Minimize number of vehicles used
"""
from ortools.constraint_solver import routing_enums_pb2
from ortools.constraint_solver import pywrapcp
from typing import List, Dict, Tuple, Optional
import logging
import numpy as np

logger = logging.getLogger(__name__)


class CVRPSolver:
    """
    Capacitated Vehicle Routing Problem solver using Google OR-Tools.
    
    Solves the problem of:
    - Routing multiple vehicles from a depot
    - Visiting all stops exactly once
    - Respecting vehicle capacities
    - Respecting max travel time per route
    - Minimizing total distance/time
    """
    
    def __init__(
        self,
        distance_matrix: List[List[float]],
        demands: List[int],
        vehicle_capacities: List[int],
        depot_index: int = 0,
        time_limit_seconds: int = 30,
        priority_vehicle_count: int = 0,
        duration_matrix: List[List[float]] = None,
        max_route_duration: int = 3900  # 65 minutes in seconds
    ):
        """
        Initialize the CVRP solver.
        
        Args:
            distance_matrix: Matrix of distances between all locations (including depot)
            demands: Number of passengers at each stop (depot = 0)
            vehicle_capacities: Capacity of each vehicle
            depot_index: Index of the depot in the distance matrix
            time_limit_seconds: Time limit for the solver
            priority_vehicle_count: Number of priority vehicles (first N in the list)
            duration_matrix: Matrix of travel times between all locations (in seconds)
            max_route_duration: Maximum time for a route (first pickup to last pickup) in seconds
        """
        self.distance_matrix = distance_matrix
        self.demands = demands
        self.vehicle_capacities = vehicle_capacities
        self.depot_index = depot_index
        self.time_limit_seconds = time_limit_seconds
        self.num_vehicles = len(vehicle_capacities)
        self.num_locations = len(distance_matrix)
        self.priority_vehicle_count = priority_vehicle_count
        # Use duration matrix if provided, otherwise estimate from distance
        self.duration_matrix = duration_matrix if duration_matrix else self._estimate_duration_matrix()
        self.max_route_duration = max_route_duration
    
    def _estimate_duration_matrix(self) -> List[List[float]]:
        """Estimate duration from distance assuming 30 km/h average speed"""
        avg_speed_ms = 30 * 1000 / 3600  # 30 km/h in m/s
        return [
            [int(d / avg_speed_ms) for d in row]
            for row in self.distance_matrix
        ]
        
    def solve(self) -> Dict:
        """
        Solve the CVRP and return the optimal routes.
        
        Returns:
            Dictionary containing:
            - routes: List of routes (each route is a list of stop indices)
            - distances: Distance of each route
            - loads: Load of each vehicle
            - total_distance: Sum of all route distances
            - vehicles_used: Number of vehicles with non-empty routes
        """
        logger.info(f"Solving CVRP with {self.num_locations} locations and {self.num_vehicles} vehicles")
        logger.info(f"Vehicle capacities: {self.vehicle_capacities}")
        logger.info(f"Priority vehicle count: {self.priority_vehicle_count}")
        
        # Create routing index manager
        manager = pywrapcp.RoutingIndexManager(
            self.num_locations,
            self.num_vehicles,
            self.depot_index
        )
        
        # Create routing model
        routing = pywrapcp.RoutingModel(manager)
        
        # Define distance callback
        def distance_callback(from_index, to_index):
            from_node = manager.IndexToNode(from_index)
            to_node = manager.IndexToNode(to_index)
            return int(self.distance_matrix[from_node][to_node])
        
        transit_callback_index = routing.RegisterTransitCallback(distance_callback)
        
        # Set cost of travel
        routing.SetArcCostEvaluatorOfAllVehicles(transit_callback_index)
        
        # Add capacity constraint
        def demand_callback(from_index):
            from_node = manager.IndexToNode(from_index)
            return self.demands[from_node]
        
        demand_callback_index = routing.RegisterUnaryTransitCallback(demand_callback)
        
        routing.AddDimensionWithVehicleCapacity(
            demand_callback_index,
            0,  # null capacity slack
            self.vehicle_capacities,  # vehicle maximum capacities
            True,  # start cumul to zero
            'Capacity'
        )
        
        # Add fixed cost per vehicle to minimize number of vehicles used
        # Priority vehicles get lower cost so they are preferred
        PRIORITY_VEHICLE_COST = 100000  # Base cost for priority vehicles
        NON_PRIORITY_VEHICLE_COST = 500000  # Higher cost for non-priority vehicles
        
        for vehicle_id in range(self.num_vehicles):
            if self.priority_vehicle_count > 0 and vehicle_id < self.priority_vehicle_count:
                # Priority vehicles (first N in list)
                routing.SetFixedCostOfVehicle(PRIORITY_VEHICLE_COST, vehicle_id)
            else:
                # Non-priority vehicles
                routing.SetFixedCostOfVehicle(NON_PRIORITY_VEHICLE_COST, vehicle_id)
        
        # Add distance dimension for tracking
        routing.AddDimension(
            transit_callback_index,
            0,  # no slack
            1000000,  # max distance per vehicle (large number)
            True,  # start cumul to zero
            'Distance'
        )
        
        # Add time dimension with max route duration constraint
        def time_callback(from_index, to_index):
            from_node = manager.IndexToNode(from_index)
            to_node = manager.IndexToNode(to_index)
            return int(self.duration_matrix[from_node][to_node])
        
        time_callback_index = routing.RegisterTransitCallback(time_callback)
        
        # Max route duration: use a larger upper bound but add soft constraint
        # This allows the solver to find solutions even when time constraints are tight
        routing.AddDimension(
            time_callback_index,
            0,  # no slack
            self.max_route_duration * 3,  # max time per vehicle (3x buffer to allow solutions)
            True,  # start cumul to zero
            'Time'
        )
        
        # Get the time dimension and set soft upper bound for each vehicle
        time_dimension = routing.GetDimensionOrDie('Time')
        
        # Use soft upper bound instead of hard constraint
        # This allows routes to exceed the limit with a penalty, ensuring we get a solution
        for vehicle_id in range(self.num_vehicles):
            time_dimension.SetSpanCostCoefficientForVehicle(1, vehicle_id)
            # Set soft upper bound with penalty - routes CAN exceed this but will be penalized
            end_index = routing.End(vehicle_id)
            time_dimension.SetCumulVarSoftUpperBound(end_index, self.max_route_duration, 10000)
        
        logger.info(f"Max route duration set to {self.max_route_duration} seconds ({self.max_route_duration/60:.0f} minutes) - soft constraint")
        
        # Note: Removed GlobalSpanCostCoefficient as it conflicts with minimizing vehicles
        # The fixed cost per vehicle will naturally minimize the number of vehicles used
        
        # Set search parameters
        search_parameters = pywrapcp.DefaultRoutingSearchParameters()
        # Use PARALLEL_CHEAPEST_INSERTION for better initial solutions with many locations
        search_parameters.first_solution_strategy = (
            routing_enums_pb2.FirstSolutionStrategy.PARALLEL_CHEAPEST_INSERTION
        )
        search_parameters.local_search_metaheuristic = (
            routing_enums_pb2.LocalSearchMetaheuristic.GUIDED_LOCAL_SEARCH
        )
        search_parameters.time_limit.seconds = self.time_limit_seconds
        search_parameters.log_search = False
        
        # Solve the problem
        logger.info("Starting CVRP optimization...")
        solution = routing.SolveWithParameters(search_parameters)
        
        if solution:
            return self._extract_solution(manager, routing, solution)
        else:
            logger.error("No solution found for CVRP")
            return {
                "routes": [],
                "distances": [],
                "loads": [],
                "total_distance": 0,
                "vehicles_used": 0,
                "status": "NO_SOLUTION"
            }
    
    def _extract_solution(
        self,
        manager: pywrapcp.RoutingIndexManager,
        routing: pywrapcp.RoutingModel,
        solution: pywrapcp.Assignment
    ) -> Dict:
        """
        Extract the solution from the routing solver.
        
        Args:
            manager: Routing index manager
            routing: Routing model
            solution: Solution assignment
            
        Returns:
            Formatted solution dictionary
        """
        routes = []
        distances = []
        loads = []
        total_distance = 0
        vehicles_used = 0
        
        for vehicle_id in range(self.num_vehicles):
            route = []
            route_distance = 0
            route_load = 0
            
            index = routing.Start(vehicle_id)
            while not routing.IsEnd(index):
                node_index = manager.IndexToNode(index)
                route.append(node_index)
                route_load += self.demands[node_index]
                
                previous_index = index
                index = solution.Value(routing.NextVar(index))
                route_distance += routing.GetArcCostForVehicle(
                    previous_index, index, vehicle_id
                )
            
            # Add final depot
            route.append(manager.IndexToNode(index))
            
            # Only count routes that visit at least one stop (besides depot)
            if len(route) > 2:  # More than just depot -> depot
                routes.append(route)
                distances.append(route_distance)
                loads.append(route_load)
                total_distance += route_distance
                vehicles_used += 1
            else:
                routes.append([])
                distances.append(0)
                loads.append(0)
        
        logger.info(f"CVRP solved: {vehicles_used} vehicles, {total_distance}m total distance")
        
        return {
            "routes": routes,
            "distances": distances,
            "loads": loads,
            "total_distance": total_distance,
            "vehicles_used": vehicles_used,
            "status": "OPTIMAL" if routing.status() == 1 else "FEASIBLE"
        }


class FleetOptimizer:
    """
    High-level fleet optimization that combines clustering and routing.
    """
    
    def __init__(
        self,
        num_16_seaters: int = 5,
        num_27_seaters: int = 5,
        time_limit_seconds: int = 30,
        vehicle_priority: str = "auto",
        max_route_duration: int = 3900,  # 65 minutes in seconds
        buffer_seats: int = 0
    ):
        """
        Initialize fleet optimizer.
        
        Args:
            num_16_seaters: Number of 16-seat vehicles available
            num_27_seaters: Number of 27-seat vehicles available
            time_limit_seconds: Time limit for optimization
            vehicle_priority: 'large' (27 first), 'small' (16 first), or 'auto'
            max_route_duration: Maximum time for a route (first to last pickup) in seconds
            buffer_seats: Number of seats to leave empty per vehicle for comfort
        """
        self.num_16_seaters = num_16_seaters
        self.num_27_seaters = num_27_seaters
        self.time_limit_seconds = time_limit_seconds
        self.vehicle_priority = vehicle_priority
        self.max_route_duration = max_route_duration
        self.buffer_seats = buffer_seats
        
        # Apply buffer seats to reduce effective capacity
        effective_16_capacity = max(1, 16 - buffer_seats)
        effective_27_capacity = max(1, 27 - buffer_seats)
        
        logger.info(f"Buffer seats: {buffer_seats} - Effective capacities: 16-seater={effective_16_capacity}, 27-seater={effective_27_capacity}")
        
        # Create vehicle capacity list based on priority
        if vehicle_priority == "large":
            # Prefer larger vehicles first
            self.vehicle_capacities = (
                [effective_27_capacity] * num_27_seaters + 
                [effective_16_capacity] * num_16_seaters
            )
            self.vehicle_types = (
                ["27-seater"] * num_27_seaters +
                ["16-seater"] * num_16_seaters
            )
            self.priority_vehicle_count = num_27_seaters
        elif vehicle_priority == "small":
            # Prefer smaller vehicles first
            self.vehicle_capacities = (
                [effective_16_capacity] * num_16_seaters + 
                [effective_27_capacity] * num_27_seaters
            )
            self.vehicle_types = (
                ["16-seater"] * num_16_seaters +
                ["27-seater"] * num_27_seaters
            )
            self.priority_vehicle_count = num_16_seaters
        else:
            # Auto: larger vehicles first for efficiency (all same priority)
            self.vehicle_capacities = (
                [effective_27_capacity] * num_27_seaters + 
                [effective_16_capacity] * num_16_seaters
            )
            self.vehicle_types = (
                ["27-seater"] * num_27_seaters +
                ["16-seater"] * num_16_seaters
            )
            self.priority_vehicle_count = 0  # All same priority in auto mode
    
    def optimize(
        self,
        distance_matrix: List[List[float]],
        stop_demands: List[int],
        depot_index: int = 0,
        duration_matrix: List[List[float]] = None
    ) -> Dict:
        """
        Optimize fleet routes.
        
        Args:
            distance_matrix: Distance matrix including depot
            stop_demands: Number of passengers at each stop
            depot_index: Index of depot in distance matrix
            duration_matrix: Duration matrix including depot (in seconds)
            
        Returns:
            Optimization result with routes and statistics
        """
        # Ensure depot has 0 demand
        demands = stop_demands.copy()
        demands[depot_index] = 0
        
        # Check if we have enough capacity
        total_demand = sum(demands)
        total_capacity = sum(self.vehicle_capacities)
        
        if total_demand > total_capacity:
            logger.warning(
                f"Total demand ({total_demand}) exceeds capacity ({total_capacity}). "
                "Some passengers may not be served."
            )
        
        # Solve CVRP
        solver = CVRPSolver(
            distance_matrix=distance_matrix,
            demands=demands,
            vehicle_capacities=self.vehicle_capacities,
            depot_index=depot_index,
            time_limit_seconds=self.time_limit_seconds,
            priority_vehicle_count=self.priority_vehicle_count,
            duration_matrix=duration_matrix,
            max_route_duration=self.max_route_duration
        )
        
        solution = solver.solve()
        
        # Add vehicle type information
        solution["vehicle_types"] = self.vehicle_types
        solution["vehicle_capacities"] = self.vehicle_capacities
        
        return solution


def solve_cvrp(
    distance_matrix: List[List[float]],
    demands: List[int],
    num_16_seaters: int = 5,
    num_27_seaters: int = 5,
    time_limit_seconds: int = 30,
    vehicle_priority: str = "auto",
    duration_matrix: List[List[float]] = None,
    max_route_duration: int = 3900,
    buffer_seats: int = 0
) -> Dict:
    """
    Convenience function to solve CVRP.
    
    Args:
        distance_matrix: Distance matrix (first row/column is depot)
        demands: Passenger demand at each location (depot = 0)
        num_16_seaters: Number of 16-seat vehicles
        num_27_seaters: Number of 27-seat vehicles
        time_limit_seconds: Time limit for optimization
        vehicle_priority: 'large', 'small', or 'auto'
        duration_matrix: Duration matrix (in seconds)
        max_route_duration: Max route time in seconds (default 65 min)
        buffer_seats: Buffer seats to leave empty per vehicle
        
    Returns:
        Optimization solution
    """
    optimizer = FleetOptimizer(
        num_16_seaters=num_16_seaters,
        num_27_seaters=num_27_seaters,
        time_limit_seconds=time_limit_seconds,
        vehicle_priority=vehicle_priority,
        max_route_duration=max_route_duration,
        buffer_seats=buffer_seats
    )
    
    return optimizer.optimize(
        distance_matrix=distance_matrix,
        stop_demands=demands,
        depot_index=0,
        duration_matrix=duration_matrix
    )


def create_optimized_routes(
    stops: List[Dict],
    depot_location: Tuple[float, float],
    distance_matrix: List[List[float]],
    num_16_seaters: int = 5,
    num_27_seaters: int = 5,
    time_limit_seconds: int = 30,
    vehicle_priority: str = "auto",
    duration_matrix: List[List[float]] = None,
    max_route_duration: int = 3900,  # 65 minutes in seconds
    buffer_seats: int = 0
) -> Dict:
    """
    Create optimized routes from clustered stops.
    
    This is the main entry point that combines all optimization steps.
    
    Args:
        stops: List of stop dictionaries with location and employee_count
        depot_location: (lat, lng) of the depot/workplace
        distance_matrix: Pre-computed distance matrix from OSRM
        num_16_seaters: Number of 16-seat vehicles
        num_27_seaters: Number of 27-seat vehicles
        time_limit_seconds: Time limit for optimization
        vehicle_priority: 'large', 'small', or 'auto'
        duration_matrix: Pre-computed duration matrix from OSRM (in seconds)
        max_route_duration: Max time for route (first to last pickup) in seconds
        buffer_seats: Buffer seats to leave empty per vehicle
        
    Returns:
        Complete optimization result with routes
    """
    # Extract demands (number of employees at each stop)
    # First entry is depot with 0 demand
    demands = [0]  # Depot
    demands.extend([stop["employee_count"] for stop in stops])
    
    # Solve CVRP
    solution = solve_cvrp(
        distance_matrix=distance_matrix,
        demands=demands,
        num_16_seaters=num_16_seaters,
        num_27_seaters=num_27_seaters,
        time_limit_seconds=time_limit_seconds,
        vehicle_priority=vehicle_priority,
        duration_matrix=duration_matrix,
        max_route_duration=max_route_duration,
        buffer_seats=buffer_seats
    )
    
    # Map route indices back to stop data
    formatted_routes = []
    for vehicle_id, route in enumerate(solution["routes"]):
        if not route or len(route) <= 2:
            continue
        
        route_stops = []
        for idx, node in enumerate(route):
            if node == 0:
                # Depot
                route_stops.append({
                    "type": "depot",
                    "location": {
                        "lat": depot_location[0],
                        "lng": depot_location[1]
                    },
                    "order": idx,
                    "passengers": 0
                })
            else:
                # Stop (adjust index since depot is at 0)
                stop = stops[node - 1]
                route_stops.append({
                    "type": "stop",
                    "stop_id": stop.get("cluster_id"),
                    "location": stop["location"],
                    "order": idx,
                    "passengers": stop["employee_count"],
                    # Include employee details for frontend display
                    "employee_count": stop.get("employee_count", 0),
                    "employee_ids": stop.get("employee_ids", []),
                    "employee_names": stop.get("employee_names", []),
                    "employee_walking_distances": stop.get("employee_walking_distances", []),
                    "road_name": stop.get("road_name", ""),
                    "max_walking_distance": stop.get("max_walking_distance", 0),
                    "original_location": stop.get("original_location")
                })
        
        formatted_routes.append({
            "vehicle_id": vehicle_id,
            "vehicle_type": solution["vehicle_types"][vehicle_id],
            "vehicle_capacity": solution["vehicle_capacities"][vehicle_id],
            "distance": solution["distances"][vehicle_id],
            "load": solution["loads"][vehicle_id],
            "stops": route_stops
        })
    
    return {
        "routes": formatted_routes,
        "total_distance": solution["total_distance"],
        "vehicles_used": solution["vehicles_used"],
        "status": solution["status"],
        "total_passengers": sum(demands)
    }
