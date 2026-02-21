import React, { useEffect, useState, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, Circle, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { Box, Button, Alert, IconButton, Tooltip, Paper, Typography } from '@mui/material';
import EditLocationIcon from '@mui/icons-material/EditLocation';
import StraightenIcon from '@mui/icons-material/Straighten';
import DeleteIcon from '@mui/icons-material/Delete';
import { api } from '../services/api';

// Custom icons
const createIcon = (color, size = 25) => {
  return L.divIcon({
    className: 'custom-marker',
    html: `<div style="
      background-color: ${color};
      width: ${size}px;
      height: ${size}px;
      border-radius: 50%;
      border: 3px solid white;
      box-shadow: 0 2px 5px rgba(0,0,0,0.3);
    "></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
};

const depotIcon = createIcon('#4CAF50', 35);
const employeeIcon = createIcon('#2196F3', 16);
const stopIcon = createIcon('#FF5722', 20);

// Create stop icon with route color
const createStopIcon = (color) => {
  return L.divIcon({
    className: 'stop-marker',
    html: `<div style="
      background-color: ${color};
      width: 18px;
      height: 18px;
      border-radius: 50%;
      border: 3px solid white;
      box-shadow: 0 3px 6px rgba(0,0,0,0.4);
      cursor: pointer;
    "></div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });
};

const busIcon = L.divIcon({
  className: 'bus-marker',
  html: `<div style="
    background-color: #1976d2;
    width: 30px;
    height: 30px;
    border-radius: 5px;
    border: 2px solid white;
    box-shadow: 0 2px 5px rgba(0,0,0,0.3);
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    font-size: 16px;
  ">🚌</div>`,
  iconSize: [30, 30],
  iconAnchor: [15, 15],
});

// Route colors - more distinct colors
const ROUTE_COLORS = [
  '#e41a1c', '#377eb8', '#4daf4a', '#984ea3', '#ff7f00',
  '#00CED1', '#DC143C', '#32CD32', '#FF1493', '#1E90FF',
  '#FFD700', '#8B4513', '#00FF7F', '#9400D3', '#FF6347'
];

// Map center updater component
function MapCenterUpdater({ center }) {
  const map = useMap();
  useEffect(() => {
    if (center) {
      map.setView([center.lat, center.lng], map.getZoom());
    }
  }, [center, map]);
  return null;
}

// Fly to focused employee with zoom
function FlyToEmployee({ employee }) {
  const map = useMap();
  useEffect(() => {
    if (employee?.location) {
      map.flyTo([employee.location.lat, employee.location.lng], 17, {
        duration: 1
      });
    }
  }, [employee, map]);
  return null;
}

// Fit map bounds to show all employees
function FitBoundsToEmployees({ employees }) {
  const map = useMap();
  const prevEmployeeCount = useRef(0);
  
  useEffect(() => {
    // Fit bounds when employees change (count changes or first load)
    if (employees && employees.length > 0) {
      // Only fit if employee count changed (new data loaded)
      if (prevEmployeeCount.current !== employees.length) {
        const bounds = employees.map(emp => [emp.location.lat, emp.location.lng]);
        if (bounds.length > 0) {
          map.fitBounds(bounds, { padding: [50, 50] });
        }
        prevEmployeeCount.current = employees.length;
      }
    }
  }, [employees, map]);
  return null;
}

// Animation controller component
function AnimationController({ 
  routes, 
  playing, 
  progress, 
  onProgressChange 
}) {
  const [vehiclePositions, setVehiclePositions] = useState([]);
  const animationRef = useRef(null);

  useEffect(() => {
    if (!playing || routes.length === 0) {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      return;
    }

    let startTime = null;
    const duration = 30000; // 30 seconds for full animation

    const animate = (timestamp) => {
      if (!startTime) startTime = timestamp;
      const elapsed = timestamp - startTime;
      const newProgress = Math.min(elapsed / duration, 1);
      
      onProgressChange(newProgress);

      // Calculate vehicle positions
      const positions = routes.map((route, index) => {
        const polyline = route.polyline || [];
        if (polyline.length < 2) return null;

        const pointIndex = Math.floor(newProgress * (polyline.length - 1));
        const localProgress = (newProgress * (polyline.length - 1)) - pointIndex;

        let position;
        if (pointIndex < polyline.length - 1) {
          const p1 = polyline[pointIndex];
          const p2 = polyline[pointIndex + 1];
          position = {
            lat: p1.lat + (p2.lat - p1.lat) * localProgress,
            lng: p1.lng + (p2.lng - p1.lng) * localProgress
          };
        } else {
          position = polyline[polyline.length - 1];
        }

        return {
          id: route.vehicle_id,
          position,
          color: ROUTE_COLORS[index % ROUTE_COLORS.length]
        };
      }).filter(Boolean);

      setVehiclePositions(positions);

      if (newProgress < 1) {
        animationRef.current = requestAnimationFrame(animate);
      }
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [playing, routes, onProgressChange]);

  return (
    <>
      {vehiclePositions.map((vehicle) => (
        <Marker
          key={`vehicle-${vehicle.id}`}
          position={[vehicle.position.lat, vehicle.position.lng]}
          icon={busIcon}
        >
          <Popup>Araç {vehicle.id}</Popup>
        </Marker>
      ))}
    </>
  );
}

// Map click handler for editing employee location and measuring
function MapClickHandler({ editingEmployee, measureMode, onMapClick, onMeasureClick }) {
  useMapEvents({
    click: (e) => {
      if (measureMode) {
        onMeasureClick(e.latlng);
      } else if (editingEmployee) {
        onMapClick(e.latlng);
      }
    },
  });
  return null;
}

// Create measure point icon
const createMeasureIcon = (index) => {
  return L.divIcon({
    className: 'measure-marker',
    html: `<div style="
      background-color: #9C27B0;
      width: 24px;
      height: 24px;
      border-radius: 50%;
      border: 3px solid white;
      box-shadow: 0 2px 5px rgba(0,0,0,0.3);
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      font-size: 12px;
      font-weight: bold;
    ">${index + 1}</div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });
};

function MapView({
  center,
  employees,
  routes,
  depotLocation,
  animationPlaying,
  animationProgress,
  onSetAnimationProgress,
  selectedRouteIndex,
  focusedEmployee,
  onEmployeeLocationUpdate,
  onStopDrag,
  onSetFirstStop,
  editingRoute,
  simulationHistoryOpen,
  mapType = 'street',
  showWalkingRadius = true
}) {
  const [showEmployees, setShowEmployees] = useState(true);
  const [editingEmployee, setEditingEmployee] = useState(null);
  const [pendingLocation, setPendingLocation] = useState(null);
  
  // Measure mode states
  const [measureMode, setMeasureMode] = useState(false);
  const [measurePoints, setMeasurePoints] = useState([]);
  const [measureResult, setMeasureResult] = useState(null);
  const [measurePolyline, setMeasurePolyline] = useState([]);
  const [walkingPolyline, setWalkingPolyline] = useState([]);
  const [measureLoading, setMeasureLoading] = useState(false);

  // Handle map click when editing
  const handleMapClick = (latlng) => {
    if (editingEmployee) {
      setPendingLocation({ lat: latlng.lat, lng: latlng.lng });
    }
  };

  // Handle measure point click
  const handleMeasureClick = async (latlng) => {
    const newPoints = [...measurePoints, { lat: latlng.lat, lng: latlng.lng }];
    setMeasurePoints(newPoints);
    
    if (newPoints.length >= 2) {
      setMeasureLoading(true);
      try {
        const result = await api.measureDistance(newPoints);
        setMeasureResult({
          distance: result.distance,
          duration: result.duration,
          walkingDistance: result.walking_distance,
          walkingDuration: result.walking_duration
        });
        setMeasurePolyline(result.polyline || []);
        setWalkingPolyline(result.walking_polyline || []);
      } catch (error) {
        console.error('Measure error:', error);
      } finally {
        setMeasureLoading(false);
      }
    }
  };

  // Toggle measure mode
  const handleToggleMeasure = () => {
    if (measureMode) {
      // Clear measure data when exiting
      setMeasurePoints([]);
      setMeasureResult(null);
      setMeasurePolyline([]);
      setWalkingPolyline([]);
    }
    setMeasureMode(!measureMode);
  };

  // Clear measure points
  const handleClearMeasure = () => {
    setMeasurePoints([]);
    setMeasureResult(null);
    setMeasurePolyline([]);
    setWalkingPolyline([]);
  };

  // Handle stop drag
  const handleStopDragEnd = (routeIndex, stopIndex, event) => {
    const { lat, lng } = event.target.getLatLng();
    if (onStopDrag) {
      onStopDrag(routeIndex, stopIndex, { lat, lng });
    }
  };

  // Confirm location change
  const handleConfirmLocation = async () => {
    if (editingEmployee && pendingLocation && onEmployeeLocationUpdate) {
      await onEmployeeLocationUpdate(editingEmployee.id, pendingLocation);
      setEditingEmployee(null);
      setPendingLocation(null);
    }
  };

  // Cancel editing
  const handleCancelEdit = () => {
    setEditingEmployee(null);
    setPendingLocation(null);
  };

  // Toggle employee visibility based on count
  useEffect(() => {
    setShowEmployees(employees.length <= 500);
  }, [employees.length]);

  // Find which route and stop an employee belongs to
  const getEmployeeRouteInfo = (employeeId) => {
    for (let routeIndex = 0; routeIndex < routes.length; routeIndex++) {
      const route = routes[routeIndex];
      if (!route.stops) continue;
      for (let stopIndex = 0; stopIndex < route.stops.length; stopIndex++) {
        const stop = route.stops[stopIndex];
        if (stop.employee_ids && stop.employee_ids.includes(employeeId)) {
          return { routeIndex, stopIndex, route, stop };
        }
      }
    }
    return null;
  };

  // Map tile configurations
  const getTileLayer = () => {
    switch (mapType) {
      case 'satellite':
        return {
          url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
          attribution: 'Tiles &copy; Esri'
        };
      case 'terrain':
        return {
          url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
          attribution: 'Map data: &copy; OpenStreetMap contributors, SRTM | Map style: &copy; OpenTopoMap'
        };
      case 'dark':
        return {
          url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
          attribution: '&copy; OpenStreetMap contributors &copy; CARTO'
        };
      case 'voyager':
        return {
          url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
          attribution: '&copy; OpenStreetMap contributors &copy; CARTO'
        };
      case 'humanitarian':
        return {
          url: 'https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png',
          attribution: '&copy; OpenStreetMap contributors, Tiles style by Humanitarian OpenStreetMap Team'
        };
      case 'toner':
        return {
          url: 'https://stamen-tiles-{s}.a.ssl.fastly.net/toner/{z}/{x}/{y}{r}.png',
          attribution: 'Map tiles by Stamen Design, under CC BY 3.0. Data by OpenStreetMap'
        };
      case 'watercolor':
        return {
          url: 'https://stamen-tiles-{s}.a.ssl.fastly.net/watercolor/{z}/{x}/{y}.jpg',
          attribution: 'Map tiles by Stamen Design, under CC BY 3.0. Data by OpenStreetMap'
        };
      default: // street
        return {
          url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        };
    }
  };

  const tileConfig = getTileLayer();

  return (
    <Box sx={{ height: 'calc(100vh - 64px)', width: '100%', position: 'relative' }}>
      <MapContainer
        center={[center.lat, center.lng]}
        zoom={13}
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer
          key={mapType}
          attribution={tileConfig.attribution}
          url={tileConfig.url}
        />
        
        <MapClickHandler 
          editingEmployee={editingEmployee} 
          measureMode={measureMode}
          onMapClick={handleMapClick} 
          onMeasureClick={handleMeasureClick}
        />
        <FitBoundsToEmployees employees={employees} />
        <FlyToEmployee employee={focusedEmployee} />

        {/* Measure Points and Polyline */}
        {measureMode && measurePoints.map((point, index) => (
          <Marker
            key={`measure-${index}`}
            position={[point.lat, point.lng]}
            icon={createMeasureIcon(index)}
          >
            <Popup>
              <strong>Nokta {index + 1}</strong><br />
              {point.lat.toFixed(5)}, {point.lng.toFixed(5)}
            </Popup>
          </Marker>
        ))}
        
        {/* Araç rotası - mavi */}
        {measureMode && measurePolyline.length > 1 && (
          <Polyline
            positions={measurePolyline.map(p => [p.lat, p.lng])}
            pathOptions={{
              color: '#1976d2',
              weight: 5,
              opacity: 0.9
            }}
          />
        )}
        
        {/* Yaya rotası - turuncu kesikli */}
        {measureMode && walkingPolyline.length > 1 && (
          <Polyline
            positions={walkingPolyline.map(p => [p.lat, p.lng])}
            pathOptions={{
              color: '#ff9800',
              weight: 4,
              opacity: 0.8,
              dashArray: '8, 8'
            }}
          />
        )}

        {/* Merkez Marker */}
        <Marker 
          position={[depotLocation.lat, depotLocation.lng]} 
          icon={depotIcon}
        >
          <Popup>
            <strong>Merkez (İşyeri)</strong><br />
            Konumu değiştirmek için haritada sağ tıklayın
          </Popup>
        </Marker>

        {/* Employee Markers */}
        {showEmployees && employees.map((employee) => (
          <Marker
            key={`emp-${employee.id}`}
            position={[employee.location.lat, employee.location.lng]}
            icon={editingEmployee?.id === employee.id ? createIcon('#FF9800', 20) : employeeIcon}
          >
            <Popup>
              <div style={{ minWidth: 200, maxWidth: 220, textAlign: 'center', padding: '4px 0' }}>
                <div style={{ width: '100%', marginBottom: 10, display: 'flex', justifyContent: 'center' }}>
                  {employee.photo_url ? (
                    <img
                      src={employee.photo_url}
                      alt={employee.name}
                      style={{ width: 70, height: 70, borderRadius: '50%', objectFit: 'cover', border: '3px solid #1976d2', display: 'block' }}
                    />
                  ) : (
                    <div style={{ width: 70, height: 70, borderRadius: '50%', background: '#e3f2fd', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '3px solid #1976d2' }}>
                      <svg width="36" height="36" viewBox="0 0 24 24" fill="#1976d2"><path d="M12 12c2.7 0 5-2.3 5-5s-2.3-5-5-5-5 2.3-5 5 2.3 5 5 5zm0 2c-3.3 0-10 1.7-10 5v3h20v-3c0-3.3-6.7-5-10-5z"/></svg>
                    </div>
                  )}
                </div>
                <div style={{ fontWeight: 'bold', color: '#1976d2', fontSize: 14, marginBottom: 6, textAlign: 'center', width: '100%' }}>{employee.name}</div>
                {employee.address && <div style={{ fontSize: 11, color: '#666', marginBottom: 6, lineHeight: 1.3, textAlign: 'center', width: '100%' }}>{employee.address}</div>}
                <div style={{ fontSize: 11, color: '#888', marginBottom: 10, textAlign: 'center', width: '100%' }}>
                  {employee.location.lat.toFixed(5)}, {employee.location.lng.toFixed(5)}
                </div>
                {routes.length === 0 && onEmployeeLocationUpdate && (
                  <div style={{ display: 'flex', justifyContent: 'center', width: '100%' }}>
                    <Button
                      size="small"
                      variant="outlined"
                      startIcon={<EditLocationIcon />}
                      onClick={() => setEditingEmployee(employee)}
                      sx={{ fontSize: '11px', py: 0.5 }}
                    >
                      Konumu Düzenle
                    </Button>
                  </div>
                )}
                {(() => {
                  const routeInfo = getEmployeeRouteInfo(employee.id);
                  if (routeInfo && editingRoute === routeInfo.routeIndex && routeInfo.stopIndex > 0) {
                    return (
                      <button
                        onClick={() => onSetFirstStop && onSetFirstStop(routeInfo.routeIndex, routeInfo.stopIndex, routeInfo.route)}
                        style={{
                          width: '100%',
                          marginTop: '10px',
                          padding: '8px 12px',
                          backgroundColor: '#1976d2',
                          color: 'white',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontSize: '12px',
                          fontWeight: 500
                        }}
                      >
                        🚩 İlk Alınacak Personel Yap
                      </button>
                    );
                  }
                  return null;
                })()}
              </div>
            </Popup>
          </Marker>
        ))}

        {/* Pending Location Marker (when editing) */}
        {pendingLocation && (
          <Marker
            position={[pendingLocation.lat, pendingLocation.lng]}
            icon={createIcon('#4CAF50', 22)}
          >
            <Popup>
              <strong>Yeni Konum</strong><br />
              {pendingLocation.lat.toFixed(5)}, {pendingLocation.lng.toFixed(5)}
            </Popup>
          </Marker>
        )}

        {/* Route Polylines */}
        {routes.map((route, index) => {
          const polyline = route.polyline || [];
          if (polyline.length < 2) return null;

          // Support both {lat, lng} objects and [lat, lng] arrays
          const positions = polyline.map(p => 
            Array.isArray(p) ? [p[0], p[1]] : [p.lat, p.lng]
          );
          const color = ROUTE_COLORS[index % ROUTE_COLORS.length];
          
          // Determine if this route is selected or if no route is selected
          const isSelected = selectedRouteIndex === null || selectedRouteIndex === undefined || selectedRouteIndex === index;
          const opacity = isSelected ? 0.9 : 0.15;
          const weight = isSelected ? (selectedRouteIndex === index ? 6 : 4) : 2;

          return (
            <Polyline
              key={`route-${route.vehicle_id}`}
              positions={positions}
              pathOptions={{
                color: color,
                weight: weight,
                opacity: opacity
              }}
            >
              <Popup>
                <strong>Rota {route.vehicle_id + 1}</strong><br />
                Araç: {route.vehicle_type}<br />
                Mesafe: {(route.distance / 1000).toFixed(2)} km<br />
                Doluluk: {route.passengers || route.load || 0} / {route.capacity || route.vehicle_capacity || '?'}
              </Popup>
            </Polyline>
          );
        })}

        {/* Walking Radius Circles */}
        {showWalkingRadius && routes.map((route, routeIndex) => {
          const stops = route.stops || [];
          const color = ROUTE_COLORS[routeIndex % ROUTE_COLORS.length];
          const isSelected = selectedRouteIndex === null || selectedRouteIndex === undefined || selectedRouteIndex === routeIndex;
          
          if (!isSelected) return null;
          
          return stops.map((stop, stopIndex) => {
            const location = stop.location;
            if (!location) return null;
            
            const maxWalk = stop.max_walking_distance || 200;
            
            return (
              <Circle
                key={`walking-radius-${routeIndex}-${stopIndex}`}
                center={[location.lat, location.lng]}
                radius={maxWalk}
                pathOptions={{
                  color: color,
                  fillColor: color,
                  fillOpacity: 0.1,
                  weight: 1,
                  dashArray: '5, 5'
                }}
              />
            );
          });
        })}

        {/* Stop Markers - Red dots where vehicle picks up passengers */}
        {routes.map((route, routeIndex) => {
          const stops = route.stops || [];
          const color = ROUTE_COLORS[routeIndex % ROUTE_COLORS.length];
          const isSelected = selectedRouteIndex === null || selectedRouteIndex === undefined || selectedRouteIndex === routeIndex;
          const isEditing = editingRoute === routeIndex;
          
          if (!isSelected) return null;
          
          return stops.map((stop, stopIndex) => {
            const location = stop.location;
            if (!location) return null;
            
            const employeeCount = stop.employee_count || stop.employee_ids?.length || 0;
            const employeeNames = stop.employee_names || [];
            const walkingDistances = stop.employee_walking_distances || [];
            const roadName = stop.road_name || '';
            const maxWalk = stop.max_walking_distance || 0;
            
            return (
              <Marker
                key={`stop-${routeIndex}-${stopIndex}`}
                position={[location.lat, location.lng]}
                icon={createStopIcon(color)}
                draggable={isEditing}
                eventHandlers={isEditing ? {
                  dragend: (e) => handleStopDragEnd(routeIndex, stopIndex, e)
                } : {}}
              >
                <Popup>
                  <div style={{ minWidth: '180px' }}>
                    <div style={{ textAlign: 'center', marginBottom: '8px' }}>
                      <strong style={{ color: color, fontSize: '14px' }}>Durak {stopIndex + 1}</strong>
                      {roadName && <span style={{ color: '#666', display: 'block', fontSize: '12px' }}>{roadName}</span>}
                    </div>
                    <div style={{ textAlign: 'center', color: '#888', fontSize: '11px', marginBottom: '8px' }}>
                      Rota {route.vehicle_id + 1} • {route.vehicle_type}
                    </div>
                    {isEditing && <div style={{ color: '#ff9800', fontSize: '11px', textAlign: 'center' }}>(Sürüklenebilir)</div>}
                    <hr style={{ margin: '8px 0', borderColor: '#eee' }} />
                    <strong>{employeeCount} Personel:</strong>
                    <ul style={{ margin: '4px 0', paddingLeft: '16px', maxHeight: '150px', overflowY: 'auto', listStyleType: 'none' }}>
                      {employeeNames.length > 0 ? (
                        employeeNames.map((name, i) => {
                          const walkInfo = walkingDistances.find(w => w.employee_id === stop.employee_ids?.[i]);
                          return (
                            <li key={i} style={{ fontSize: '12px' }}>
                              {name}
                              {showWalkingRadius && walkInfo && (
                                <span style={{ color: '#888', marginLeft: '4px' }}>
                                  ({walkInfo.walking_distance}m)
                                </span>
                              )}
                            </li>
                          );
                        })
                      ) : stop.employee_ids?.length > 0 ? (
                        stop.employee_ids.map((id, i) => {
                          const walkInfo = walkingDistances.find(w => w.employee_id === id);
                          return (
                            <li key={i} style={{ fontSize: '12px' }}>
                              Personel #{id}
                              {showWalkingRadius && walkInfo && (
                                <span style={{ color: '#888', marginLeft: '4px' }}>
                                  ({walkInfo.walking_distance}m)
                                </span>
                              )}
                            </li>
                          );
                        })
                      ) : (
                        <li style={{ fontSize: '12px', color: '#888' }}>{employeeCount} kişi</li>
                      )}
                    </ul>
                    {showWalkingRadius && maxWalk > 0 && (
                      <div style={{ fontSize: '11px', color: '#666', marginTop: '4px' }}>
                        Max yürüme: {maxWalk}m
                      </div>
                    )}
                  </div>
                </Popup>
              </Marker>
            );
          });
        })}

        {/* Animation */}
        <AnimationController
          routes={routes}
          playing={animationPlaying}
          progress={animationProgress}
          onProgressChange={onSetAnimationProgress}
        />

      </MapContainer>

      {/* Editing Mode Alert */}
      {editingEmployee && (
        <Box
          sx={{
            position: 'absolute',
            top: 20,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 1001,
            minWidth: 350
          }}
        >
          <Alert 
            severity="info"
            action={
              <Box sx={{ display: 'flex', gap: 1 }}>
                {pendingLocation && (
                  <Button color="success" size="small" onClick={handleConfirmLocation}>
                    Onayla
                  </Button>
                )}
                <Button color="inherit" size="small" onClick={handleCancelEdit}>
                  İptal
                </Button>
              </Box>
            }
          >
            <strong>{editingEmployee.name}</strong> için haritadan yeni konum seçin
            {pendingLocation && (
              <div style={{ fontSize: '11px', marginTop: '4px' }}>
                Seçilen: {pendingLocation.lat.toFixed(5)}, {pendingLocation.lng.toFixed(5)}
              </div>
            )}
          </Alert>
        </Box>
      )}

      {/* Measure Tool */}
      <Paper
        elevation={3}
        sx={{
          position: 'absolute',
          top: 20,
          right: simulationHistoryOpen ? 400 : 20,
          transition: 'right 0.3s',
          zIndex: 1000,
          p: 1
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Tooltip title={measureMode ? "Ölçümü Kapat" : "Mesafe Ölç"}>
            <IconButton 
              onClick={handleToggleMeasure}
              color={measureMode ? "secondary" : "default"}
              sx={{ 
                bgcolor: measureMode ? 'secondary.light' : 'transparent',
                '&:hover': { bgcolor: measureMode ? 'secondary.main' : 'grey.200' }
              }}
            >
              <StraightenIcon />
            </IconButton>
          </Tooltip>
          {measureMode && measurePoints.length > 0 && (
            <Tooltip title="Temizle">
              <IconButton onClick={handleClearMeasure} size="small" color="error">
                <DeleteIcon />
              </IconButton>
            </Tooltip>
          )}
        </Box>
        
        {measureMode && (
          <Box sx={{ mt: 1, p: 1, bgcolor: 'grey.100', borderRadius: 1, minWidth: 180 }}>
            <Typography variant="caption" color="text.secondary" display="block">
              Haritaya tıklayarak nokta ekleyin
            </Typography>
            {measurePoints.length > 0 && (
              <Typography variant="body2" sx={{ mt: 0.5 }}>
                {measurePoints.length} nokta seçildi
              </Typography>
            )}
            {measureLoading && (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                Hesaplanıyor...
              </Typography>
            )}
            {measureResult && !measureLoading && (
              <Box sx={{ mt: 1, p: 1, bgcolor: 'white', borderRadius: 1 }}>
                <Box sx={{ display: 'flex', gap: 1 }}>
                  {/* Araç */}
                  <Box sx={{ flex: 1, textAlign: 'center', p: 1, bgcolor: '#e3f2fd', borderRadius: 1, border: '2px solid #1976d2' }}>
                    <Typography variant="caption" fontWeight="bold" color="primary.main" display="block">
                      🚗 Araç
                    </Typography>
                    <Typography variant="body2" fontWeight="bold" color="primary.main">
                      {(measureResult.distance / 1000).toFixed(2)} km
                    </Typography>
                    <Typography variant="caption" color="text.secondary" display="block">
                      ({Math.round(measureResult.distance)} m)
                    </Typography>
                    <Typography variant="body1" fontWeight="bold" sx={{ mt: 0.5 }}>
                      ⏱️ {(measureResult.duration / 60).toFixed(1)} dk
                    </Typography>
                  </Box>
                  {/* Yaya */}
                  <Box sx={{ flex: 1, textAlign: 'center', p: 1, bgcolor: '#fff3e0', borderRadius: 1, border: '2px dashed #ff9800' }}>
                    <Typography variant="caption" fontWeight="bold" color="warning.main" display="block">
                      🚶 Yaya
                    </Typography>
                    <Typography variant="body2" fontWeight="bold" color="warning.main">
                      {((measureResult.walkingDistance || measureResult.distance) / 1000).toFixed(2)} km
                    </Typography>
                    <Typography variant="caption" color="text.secondary" display="block">
                      ({Math.round(measureResult.walkingDistance || measureResult.distance)} m)
                    </Typography>
                    <Typography variant="body1" fontWeight="bold" sx={{ mt: 0.5 }}>
                      ⏱️ {((measureResult.walkingDuration || measureResult.distance / 83.33 * 60) / 60).toFixed(1)} dk
                    </Typography>
                  </Box>
                </Box>
              </Box>
            )}
          </Box>
        )}
      </Paper>

      {/* Legend */}
      <Box
        sx={{
          position: 'absolute',
          bottom: 20,
          right: 20,
          backgroundColor: 'white',
          padding: 2,
          borderRadius: 1,
          boxShadow: 2,
          zIndex: 1000
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
          <Box sx={{ width: 20, height: 20, borderRadius: '50%', backgroundColor: '#4CAF50', mr: 1 }} />
          <span>Merkez</span>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
          <Box sx={{ width: 16, height: 16, borderRadius: '50%', backgroundColor: '#FF5722', mr: 1 }} />
          <span>Duraklar</span>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center' }}>
          <Box sx={{ width: 12, height: 12, borderRadius: '50%', backgroundColor: '#2196F3', mr: 1 }} />
          <span>Personeller</span>
        </Box>
      </Box>
    </Box>
  );
}

export default MapView;
