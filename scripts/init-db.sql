-- Enable PostGIS extension
CREATE EXTENSION IF NOT EXISTS postgis;

-- Employees table with spatial coordinates
CREATE TABLE IF NOT EXISTS employees (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    home_location GEOMETRY(POINT, 4326) NOT NULL,
    assigned_stop_id INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Shuttle stops table
CREATE TABLE IF NOT EXISTS shuttle_stops (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100),
    location GEOMETRY(POINT, 4326) NOT NULL,
    cluster_id INTEGER,
    employee_count INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Vehicles/Shuttles table
CREATE TABLE IF NOT EXISTS vehicles (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) NOT NULL,
    capacity INTEGER NOT NULL,
    vehicle_type VARCHAR(20) NOT NULL, -- '16-seater' or '27-seater'
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Routes table
CREATE TABLE IF NOT EXISTS routes (
    id SERIAL PRIMARY KEY,
    vehicle_id INTEGER REFERENCES vehicles(id),
    route_order INTEGER[],
    total_distance FLOAT,
    total_duration FLOAT,
    polyline_geometry GEOMETRY(LINESTRING, 4326),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Route stops junction table (for route details)
CREATE TABLE IF NOT EXISTS route_stops (
    id SERIAL PRIMARY KEY,
    route_id INTEGER REFERENCES routes(id) ON DELETE CASCADE,
    stop_id INTEGER REFERENCES shuttle_stops(id),
    stop_order INTEGER NOT NULL,
    arrival_time FLOAT,
    passengers_pickup INTEGER DEFAULT 0
);

-- Optimization results table
CREATE TABLE IF NOT EXISTS optimization_results (
    id SERIAL PRIMARY KEY,
    total_vehicles_used INTEGER,
    total_distance FLOAT,
    total_duration FLOAT,
    parameters JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create spatial indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_employees_location ON employees USING GIST(home_location);
CREATE INDEX IF NOT EXISTS idx_stops_location ON shuttle_stops USING GIST(location);
CREATE INDEX IF NOT EXISTS idx_routes_polyline ON routes USING GIST(polyline_geometry);

-- Insert default vehicle fleet
INSERT INTO vehicles (name, capacity, vehicle_type) VALUES
    ('Shuttle-16-A', 16, '16-seater'),
    ('Shuttle-16-B', 16, '16-seater'),
    ('Shuttle-16-C', 16, '16-seater'),
    ('Shuttle-16-D', 16, '16-seater'),
    ('Shuttle-16-E', 16, '16-seater'),
    ('Shuttle-27-A', 27, '27-seater'),
    ('Shuttle-27-B', 27, '27-seater'),
    ('Shuttle-27-C', 27, '27-seater'),
    ('Shuttle-27-D', 27, '27-seater'),
    ('Shuttle-27-E', 27, '27-seater');

-- Function to check if employee is within walking distance of a stop
CREATE OR REPLACE FUNCTION is_within_walking_distance(
    employee_location GEOMETRY,
    stop_location GEOMETRY,
    max_distance_meters FLOAT DEFAULT 200
) RETURNS BOOLEAN AS $$
BEGIN
    RETURN ST_DWithin(
        employee_location::geography,
        stop_location::geography,
        max_distance_meters
    );
END;
$$ LANGUAGE plpgsql;

-- Function to find nearest stop within walking distance
CREATE OR REPLACE FUNCTION find_nearest_stop(
    emp_location GEOMETRY,
    max_distance_meters FLOAT DEFAULT 200
) RETURNS INTEGER AS $$
DECLARE
    nearest_stop_id INTEGER;
BEGIN
    SELECT id INTO nearest_stop_id
    FROM shuttle_stops
    WHERE ST_DWithin(
        emp_location::geography,
        location::geography,
        max_distance_meters
    )
    ORDER BY ST_Distance(emp_location::geography, location::geography)
    LIMIT 1;
    
    RETURN nearest_stop_id;
END;
$$ LANGUAGE plpgsql;

-- Function to get employees within radius of a point
CREATE OR REPLACE FUNCTION get_employees_within_radius(
    center_point GEOMETRY,
    radius_meters FLOAT
) RETURNS TABLE(
    employee_id INTEGER,
    employee_name VARCHAR,
    distance_meters FLOAT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        e.id,
        e.name,
        ST_Distance(e.home_location::geography, center_point::geography)::FLOAT
    FROM employees e
    WHERE ST_DWithin(
        e.home_location::geography,
        center_point::geography,
        radius_meters
    )
    ORDER BY ST_Distance(e.home_location::geography, center_point::geography);
END;
$$ LANGUAGE plpgsql;
