#!/bin/bash

# Setup script for Employee Shuttle Route Optimization System
# This script downloads OSRM map data and starts all services

set -e

echo "=========================================="
echo "Shuttle Route Optimizer - Setup Script"
echo "=========================================="

# Create osrm-data directory
mkdir -p osrm-data

# Check for existing map data
if [ -f "osrm-data/map.osm.pbf" ]; then
    echo "✓ Map data already exists"
else
    echo ""
    echo "Please select a region to download:"
    echo "1) Monaco (1MB - for testing)"
    echo "2) Istanbul (50MB - recommended for demo)"
    echo "3) Turkey (500MB - full country)"
    echo "4) Skip download (I'll provide my own map.osm.pbf)"
    echo ""
    read -p "Enter choice [1-4]: " choice

    case $choice in
        1)
            echo "Downloading Monaco map data..."
            wget -O osrm-data/map.osm.pbf https://download.geofabrik.de/europe/monaco-latest.osm.pbf
            ;;
        2)
            echo "Downloading Istanbul map data..."
            echo "Note: If this fails, falling back to Turkey-latest..."
            wget -O osrm-data/map.osm.pbf https://download.geofabrik.de/europe/turkey-latest.osm.pbf || \
            wget -O osrm-data/map.osm.pbf https://download.geofabrik.de/europe/turkey-latest.osm.pbf
            ;;
        3)
            echo "Downloading Turkey map data..."
            wget -O osrm-data/map.osm.pbf https://download.geofabrik.de/europe/turkey-latest.osm.pbf
            ;;
        4)
            echo "Skipping download. Please place your map.osm.pbf file in osrm-data/"
            ;;
        *)
            echo "Invalid choice. Exiting."
            exit 1
            ;;
    esac
fi

# Verify map file exists
if [ ! -f "osrm-data/map.osm.pbf" ]; then
    echo "ERROR: osrm-data/map.osm.pbf not found!"
    echo "Please download map data manually or run this script again."
    exit 1
fi

echo ""
echo "✓ Map data ready"
echo ""

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "ERROR: Docker is not running!"
    echo "Please start Docker and run this script again."
    exit 1
fi

echo "Starting all services..."
echo "This may take several minutes on first run (OSRM data preparation)."
echo ""

# Start docker-compose
docker-compose up --build -d

echo ""
echo "=========================================="
echo "Setup complete!"
echo "=========================================="
echo ""
echo "Access the application at:"
echo "  Frontend:    http://localhost:3000"
echo "  Backend API: http://localhost:8000"
echo "  API Docs:    http://localhost:8000/docs"
echo ""
echo "To view logs:"
echo "  docker-compose logs -f"
echo ""
echo "To stop services:"
echo "  docker-compose down"
echo ""
