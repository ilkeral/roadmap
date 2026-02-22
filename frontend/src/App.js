import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  ThemeProvider,
  createTheme,
  CssBaseline,
  Box,
  AppBar,
  Toolbar,
  Typography,
  Drawer,
  IconButton,
  Snackbar,
  Alert,
  Button,
  Chip,
  Avatar,
  Backdrop,
  CircularProgress,
  Fab,
  Switch,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions
} from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import DirectionsBusIcon from '@mui/icons-material/DirectionsBus';
import LogoutIcon from '@mui/icons-material/Logout';
import PersonIcon from '@mui/icons-material/Person';
import RefreshIcon from '@mui/icons-material/Refresh';
import ListAltIcon from '@mui/icons-material/ListAlt';
import SettingsIcon from '@mui/icons-material/Settings';
import DirectionsWalkIcon from '@mui/icons-material/DirectionsWalk';
import Tooltip from '@mui/material/Tooltip';

import MapView from './components/MapView';
import ControlPanel from './components/ControlPanel';
import StatsPanel from './components/StatsPanel';
import LoginPage from './components/LoginPage';
import EmployeeList from './components/EmployeeList';
import SimulationHistory from './components/SimulationHistory';
import SettingsModal from './components/SettingsModal';
import { api } from './services/api';

const theme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#1976d2',
    },
    secondary: {
      main: '#ff5722',
    },
  },
});

const DRAWER_WIDTH = 380;
const EMPLOYEE_LIST_WIDTH = 360;

function App() {
  // Auth State
  const [user, setUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);

  // State
  const [drawerOpen, setDrawerOpen] = useState(true);
  const [employeeListOpen, setEmployeeListOpen] = useState(false);
  const [openAddEmployeeDialog, setOpenAddEmployeeDialog] = useState(false);
  const [simulationHistoryOpen, setSimulationHistoryOpen] = useState(false);
  const [simulationHistoryRefreshKey, setSimulationHistoryRefreshKey] = useState(0);
  const [selectedSimulationId, setSelectedSimulationId] = useState(null);
  const [selectedRouteIndex, setSelectedRouteIndex] = useState(null);
  const [editingRoute, setEditingRoute] = useState(null);
  const [modifiedStops, setModifiedStops] = useState({});
  const [stopDragDialog, setStopDragDialog] = useState(false);
  const [stopDragPreview, setStopDragPreview] = useState(null);
  const [pendingStopDrag, setPendingStopDrag] = useState(null);
  const [reorderDialog, setReorderDialog] = useState(false);
  const [reorderPreview, setReorderPreview] = useState(null);
  const [pendingReorder, setPendingReorder] = useState(null);
  const [removeEmployeeDialog, setRemoveEmployeeDialog] = useState(false);
  const [removeEmployeePreview, setRemoveEmployeePreview] = useState(null);
  const [pendingRemoveEmployee, setPendingRemoveEmployee] = useState(null);
  const [addEmployeeDialog, setAddEmployeeDialog] = useState(false);
  const [addEmployeePreview, setAddEmployeePreview] = useState(null);
  const [pendingAddEmployee, setPendingAddEmployee] = useState(null);
  const [loading, setLoading] = useState(false);
  const [simulationTime, setSimulationTime] = useState(0);
  const timerRef = useRef(null);
  const [employees, setEmployees] = useState([]);
  const [stops, setStops] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [depotLocation, setDepotLocation] = useState({ lat: 41.0082, lng: 28.9784 });
  const [mapCenter, setMapCenter] = useState({ lat: 41.0082, lng: 28.9784 });
  const [systemStatus, setSystemStatus] = useState(null);
  const [optimizationResult, setOptimizationResult] = useState(null);
  const [animationPlaying, setAnimationPlaying] = useState(false);
  const [animationProgress, setAnimationProgress] = useState(0);
  const [focusedEmployee, setFocusedEmployee] = useState(null);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'info' });
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [mapType, setMapType] = useState('street');
  const [showWalkingRadius, setShowWalkingRadius] = useState(true);

  // Daire seçim durumları
  const [circleSelectDialog, setCircleSelectDialog] = useState(false);
  const [circleSelectionData, setCircleSelectionData] = useState(null);
  const [currentSimParams, setCurrentSimParams] = useState(null);
  const [routeColors, setRouteColors] = useState({});

  const handleRouteColorChange = (routeIndex, color) => {
    setRouteColors(prev => ({ ...prev, [routeIndex]: color }));
  };

  // Simülasyon seçiliyse yalnızca o simülasyondaki personelleri haritada göster
  const mapEmployees = useMemo(() => {
    if (routes.length === 0) return employees;
    const employeeIdsInRoutes = new Set();
    routes.forEach(route => {
      (route.stops || []).forEach(stop => {
        (stop.employee_ids || []).forEach(id => employeeIdsInRoutes.add(id));
      });
    });
    if (employeeIdsInRoutes.size === 0) return employees;
    return employees.filter(emp => employeeIdsInRoutes.has(emp.id));
  }, [employees, routes]);

  // Check existing login on mount
  useEffect(() => {
    const savedUser = localStorage.getItem('shuttleUser');
    if (savedUser) {
      try {
        setUser(JSON.parse(savedUser));
      } catch (e) {
        localStorage.removeItem('shuttleUser');
      }
    }
    setAuthChecked(true);
  }, []);

  // Timer for simulation progress
  useEffect(() => {
    if (loading) {
      setSimulationTime(0);
      timerRef.current = setInterval(() => {
        setSimulationTime(prev => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [loading]);

  // Load initial data
  useEffect(() => {
    loadSystemStatus();
    loadSimulationData();
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const settings = await api.getGeneralSettings();
      if (settings.map_type) {
        setMapType(settings.map_type);
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  };

  const loadSystemStatus = async () => {
    try {
      const status = await api.getSystemStatus();
      setSystemStatus(status);
    } catch (error) {
      console.error('Failed to load system status:', error);
    }
  };

  const loadSimulationData = async () => {
    try {
      const data = await api.getSimulationData();
      setEmployees(data.employees || []);
      setStops(data.stops || []);
      
      if (data.employees?.length > 0) {
        // Calculate center from employees
        const lats = data.employees.map(e => e.location.lat);
        const lngs = data.employees.map(e => e.location.lng);
        const center = {
          lat: lats.reduce((a, b) => a + b, 0) / lats.length,
          lng: lngs.reduce((a, b) => a + b, 0) / lngs.length
        };
        setMapCenter(center);
      }
    } catch (error) {
      console.error('Failed to load simulation data:', error);
    }
  };

  const handleGenerateEmployees = async (params) => {
    setLoading(true);
    try {
      await api.generateEmployees(params);
      showSnackbar(`${params.num_employees} personel oluşturuldu`, 'success');
      await loadSimulationData();
      await loadSystemStatus();
      setMapCenter({ lat: params.center_lat, lng: params.center_lng });
    } catch (error) {
      showSnackbar('Personel oluşturma başarısız: ' + error.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleRunOptimization = async (params) => {
    setLoading(true);
    try {
      const result = await api.createSimulation({
        ...params,
        depot_location: depotLocation
      });
      
      // Simülasyon oluşturuldu, detayları al
      const details = await api.getSimulation(result.id);
      
      setOptimizationResult(details);
      setRoutes(details.routes || []);
      setStops([]);
      setSelectedSimulationId(result.id);
      
      showSnackbar(
        `Simülasyon oluşturuldu: ${result.total_vehicles} araç, ${(result.total_distance / 1000).toFixed(1)} km`,
        'success'
      );
      
      // Refresh simulation history
      setSimulationHistoryRefreshKey(prev => prev + 1);
      
      await loadSimulationData();
    } catch (error) {
      showSnackbar('Simülasyon oluşturulamadı: ' + error.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handlePlayAnimation = () => {
    if (routes.length === 0) {
      showSnackbar('Animasyon için rota yok. Önce optimizasyonu çalıştırın.', 'warning');
      return;
    }
    setAnimationPlaying(true);
    setAnimationProgress(0);
  };

  const handleStopAnimation = () => {
    setAnimationPlaying(false);
  };

  const handleResetAnimation = () => {
    setAnimationPlaying(false);
    setAnimationProgress(0);
  };

  const handleUpdateCenter = (location, showMessage = true) => {
    setDepotLocation(location);
    if (showMessage) {
      showSnackbar(`Merkez konumu güncellendi: ${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}`, 'success');
    }
  };

  const handleExcelUpload = async (result) => {
    showSnackbar(
      `${result.imported} personel Excel'den aktarıldı${result.skipped > 0 ? ` (${result.skipped} mükerrer atlandı)` : ''}`,
      'success'
    );
    await loadSimulationData();
    await loadSystemStatus();
  };

  const handleEmployeeClick = useCallback((employee) => {
    if (employee?.location) {
      setFocusedEmployee(employee);
      showSnackbar(`${employee.name} konumuna gidiliyor`, 'info');
    }
  }, []);

  const handleEmployeeLocationUpdate = async (employeeId, location) => {
    try {
      await api.updateEmployeeCoordinates(employeeId, location.lat, location.lng);
      setEmployees(prev => prev.map(emp => 
        emp.id === employeeId 
          ? { ...emp, location: { lat: location.lat, lng: location.lng }, home_location: { lat: location.lat, lng: location.lng } }
          : emp
      ));
      showSnackbar('Personel konumu güncellendi', 'success');
    } catch (error) {
      console.error('Error updating employee location:', error);
      showSnackbar('Konum güncellenirken hata oluştu', 'error');
    }
  };

  const handleShowEmployees = () => {
    setOpenAddEmployeeDialog(false);
    setEmployeeListOpen(true);
    setDrawerOpen(false);
  };

  const handleAddNewEmployee = () => {
    setOpenAddEmployeeDialog(true);
    setEmployeeListOpen(true);
    setDrawerOpen(false);
  };

  const handleCloseEmployeeList = () => {
    setEmployeeListOpen(false);
    setOpenAddEmployeeDialog(false);
    setDrawerOpen(true);
  };

  const handleShowSimulationHistory = () => {
    setSimulationHistoryOpen(true);
  };

  const handleCloseSimulationHistory = () => {
    setSimulationHistoryOpen(false);
  };

  const handleSelectSimulation = (simulation) => {
    if (!simulation) {
      setOptimizationResult(null);
      setRoutes([]);
      setSelectedSimulationId(null);
      setSelectedRouteIndex(null);
      return;
    }
    
    setOptimizationResult(simulation);
    setRoutes(simulation.routes || []);
    setSelectedSimulationId(simulation.id);
    setSelectedRouteIndex(null);
    setDepotLocation({ lat: simulation.depot_lat, lng: simulation.depot_lng });
    showSnackbar(`"${simulation.name}" simülasyonu yüklendi`, 'info');
  };

  const handleSelectRoute = (routeIndex) => {
    setSelectedRouteIndex(routeIndex);
    // Clear editing mode when changing route
    if (editingRoute !== null && editingRoute !== routeIndex) {
      setEditingRoute(null);
      setModifiedStops({});
    }
  };

  const handleStartEditRoute = (routeIndex) => {
    setEditingRoute(routeIndex);
    setSelectedRouteIndex(routeIndex);
    setModifiedStops({});
  };

  const handleReoptimizeRoute = async (simulationId, routeId, routeIndex) => {
    try {
      const result = await api.reoptimizeRoute(simulationId, routeId);
      if (result.success) {
        // Simülasyonu yeniden yükle
        const details = await api.getSimulation(simulationId);
        setRoutes(details.routes || []);
        setOptimizationResult(details);
        setSimulationHistoryRefreshKey(prev => prev + 1);

        const distDiff = ((result.new_distance - result.old_distance) / 1000).toFixed(1);
        const durDiff = ((result.new_duration - result.old_duration) / 60).toFixed(0);
        const sign = (v) => v > 0 ? '+' : '';
        showSnackbar(
          `Rota yeniden optimize edildi: ${sign(distDiff)}${distDiff} km, ${sign(durDiff)}${durDiff} dk`,
          'success'
        );
      }
    } catch (error) {
      console.error('Rota yeniden optimizasyon hatası:', error);
      showSnackbar(
        error.response?.data?.detail || 'Rota yeniden optimize edilemedi',
        'error'
      );
    }
  };

  // Daire seçim tamamlandığında - dialog göster
  const handleCircleSelect = (selectionData) => {
    setCircleSelectionData(selectionData);
    setCircleSelectDialog(true);
  };

  // Daire seçiminden simülasyon başlat
  const handleConfirmCircleSimulation = async () => {
    if (!circleSelectionData) return;
    setCircleSelectDialog(false);

    const params = {
      ...currentSimParams,
      depot_location: depotLocation,
      employee_ids: circleSelectionData.employeeIds,
      name: `Alan Seçimi (${circleSelectionData.employees.length} personel, ${(circleSelectionData.radius / 1000).toFixed(1)}km)`
    };

    setLoading(true);
    try {
      const result = await api.createSimulation(params);
      const details = await api.getSimulation(result.id);

      setOptimizationResult(details);
      setRoutes(details.routes || []);
      setStops([]);
      setSelectedSimulationId(result.id);
      setCircleSelectionData(null);

      showSnackbar(
        `Alan simülasyonu oluşturuldu: ${result.total_vehicles} araç, ${(result.total_distance / 1000).toFixed(1)} km`,
        'success'
      );
      setSimulationHistoryRefreshKey(prev => prev + 1);
      await loadSimulationData();
    } catch (error) {
      showSnackbar('Simülasyon oluşturulamadı: ' + (error.response?.data?.detail || error.message), 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleCancelEditRoute = () => {
    setEditingRoute(null);
    setModifiedStops({});
    // Reload to restore original positions
    if (selectedSimulationId) {
      api.getSimulation(selectedSimulationId).then(details => {
        setRoutes(details.routes || []);
      });
    }
  };

  const handleStopDrag = async (routeIndex, stopIndex, newLocation) => {
    const route = routes[routeIndex];
    if (!route || !selectedSimulationId) return;
    
    // Store original location
    const originalLocation = route.stops[stopIndex]?.location;
    if (!originalLocation) return;
    
    // Update visual immediately
    setRoutes(prev => {
      const updated = [...prev];
      if (updated[routeIndex] && updated[routeIndex].stops) {
        updated[routeIndex] = {
          ...updated[routeIndex],
          stops: updated[routeIndex].stops.map((stop, idx) => 
            idx === stopIndex 
              ? { ...stop, location: newLocation }
              : stop
          )
        };
      }
      return updated;
    });
    
    // Store pending drag info
    setPendingStopDrag({
      routeIndex,
      stopIndex,
      newLocation,
      originalLocation,
      routeId: route.id
    });
    
    // Call preview API
    try {
      const preview = await api.previewRouteUpdate(selectedSimulationId, route.id, [
        { stopIndex, lat: newLocation.lat, lng: newLocation.lng }
      ]);
      setStopDragPreview(preview);
      setStopDragDialog(true);
    } catch (error) {
      console.error('Preview error:', error);
      // Revert on error
      setRoutes(prev => {
        const updated = [...prev];
        if (updated[routeIndex] && updated[routeIndex].stops) {
          updated[routeIndex] = {
            ...updated[routeIndex],
            stops: updated[routeIndex].stops.map((stop, idx) => 
              idx === stopIndex 
                ? { ...stop, location: originalLocation }
                : stop
            )
          };
        }
        return updated;
      });
      showSnackbar('Önizleme alınamadı', 'error');
    }
  };

  const handleConfirmStopDrag = async () => {
    if (!pendingStopDrag || !selectedSimulationId) return;
    
    const { routeIndex, stopIndex, newLocation, routeId } = pendingStopDrag;
    
    setStopDragDialog(false);
    setLoading(true);
    
    try {
      const result = await api.updateRouteStops(selectedSimulationId, routeId, [
        { stopIndex, lat: newLocation.lat, lng: newLocation.lng }
      ]);
      
      // Update local state with new route data
      setRoutes(prev => {
        const updated = [...prev];
        updated[routeIndex] = {
          ...updated[routeIndex],
          distance: result.distance,
          duration: result.duration,
          polyline: result.polyline,
          stops: result.stops
        };
        return updated;
      });
      
      setSimulationHistoryRefreshKey(prev => prev + 1);
      showSnackbar(`Rota güncellendi: ${(result.distance/1000).toFixed(1)}km, ${Math.round(result.duration/60)}dk`, 'success');
    } catch (error) {
      console.error('Route update error:', error);
      // Revert on error
      const { originalLocation } = pendingStopDrag;
      setRoutes(prev => {
        const updated = [...prev];
        if (updated[routeIndex] && updated[routeIndex].stops) {
          updated[routeIndex] = {
            ...updated[routeIndex],
            stops: updated[routeIndex].stops.map((stop, idx) => 
              idx === stopIndex 
                ? { ...stop, location: originalLocation }
                : stop
            )
          };
        }
        return updated;
      });
      showSnackbar('Rota güncellenirken hata oluştu', 'error');
    } finally {
      setLoading(false);
      setPendingStopDrag(null);
      setStopDragPreview(null);
    }
  };

  const handleCancelStopDrag = () => {
    if (pendingStopDrag) {
      const { routeIndex, stopIndex, originalLocation } = pendingStopDrag;
      // Revert to original location
      setRoutes(prev => {
        const updated = [...prev];
        if (updated[routeIndex] && updated[routeIndex].stops) {
          updated[routeIndex] = {
            ...updated[routeIndex],
            stops: updated[routeIndex].stops.map((stop, idx) => 
              idx === stopIndex 
                ? { ...stop, location: originalLocation }
                : stop
            )
          };
        }
        return updated;
      });
    }
    setStopDragDialog(false);
    setPendingStopDrag(null);
    setStopDragPreview(null);
  };

  // Set first stop handlers
  const handleSetFirstStop = async (routeIndex, stopIndex, route) => {
    if (!selectedSimulationId || !route) return;
    
    // Store pending reorder info
    setPendingReorder({
      routeIndex,
      stopIndex,
      routeId: route.id,
      stopName: route.stops?.[stopIndex]?.road_name || `Durak ${stopIndex + 1}`
    });
    
    // Call preview API
    try {
      const preview = await api.previewRouteReorder(selectedSimulationId, route.id, stopIndex);
      setReorderPreview(preview);
      setReorderDialog(true);
    } catch (error) {
      console.error('Reorder preview error:', error);
      showSnackbar('Önizleme alınamadı', 'error');
      setPendingReorder(null);
    }
  };

  const handleConfirmReorder = async () => {
    if (!pendingReorder || !selectedSimulationId) return;
    
    const { routeIndex, stopIndex, routeId } = pendingReorder;
    
    setReorderDialog(false);
    setLoading(true);
    
    try {
      const result = await api.reorderRouteStops(selectedSimulationId, routeId, stopIndex);
      
      // Update local state with new route data
      setRoutes(prev => {
        const updated = [...prev];
        updated[routeIndex] = {
          ...updated[routeIndex],
          distance: result.distance,
          duration: result.duration,
          polyline: result.polyline,
          stops: result.stops
        };
        return updated;
      });
      
      setSimulationHistoryRefreshKey(prev => prev + 1);
      showSnackbar(`Rota yeniden sıralandı: ${(result.distance/1000).toFixed(1)}km, ${Math.round(result.duration/60)}dk`, 'success');
    } catch (error) {
      console.error('Route reorder error:', error);
      showSnackbar('Rota yeniden sıralanamadı', 'error');
    } finally {
      setLoading(false);
      setPendingReorder(null);
      setReorderPreview(null);
    }
  };

  const handleCancelReorder = () => {
    setReorderDialog(false);
    setPendingReorder(null);
    setReorderPreview(null);
  };

  const handleRemoveEmployeeFromRoute = async (routeIndex, routeId, employeeId) => {
    if (!selectedSimulationId || routeId == null) return;

    setPendingRemoveEmployee({ routeIndex, routeId, employeeId });

    try {
      const preview = await api.previewRemoveEmployee(selectedSimulationId, routeId, employeeId);
      setRemoveEmployeePreview(preview);
      setRemoveEmployeeDialog(true);
    } catch (error) {
      console.error('Remove employee preview error:', error);
      showSnackbar('Önizleme alınamadı: ' + (error.response?.data?.detail || error.message), 'error');
      setPendingRemoveEmployee(null);
    }
  };

  const handleConfirmRemoveEmployee = async () => {
    if (!pendingRemoveEmployee || !selectedSimulationId) return;

    const { routeIndex, routeId, employeeId } = pendingRemoveEmployee;
    setRemoveEmployeeDialog(false);
    setLoading(true);

    try {
      const result = await api.removeEmployeeFromRoute(selectedSimulationId, routeId, employeeId);

      setRoutes(prev => {
        const updated = [...prev];
        updated[routeIndex] = {
          ...updated[routeIndex],
          distance: result.distance,
          duration: result.duration,
          polyline: result.polyline,
          stops: result.stops,
          passengers: result.passengers
        };
        return updated;
      });

      setSimulationHistoryRefreshKey(prev => prev + 1);
      showSnackbar(
        `"${result.employee_name}" rotadan kaldırıldı: ${(result.distance/1000).toFixed(1)}km, ${Math.round(result.duration/60)}dk`,
        'success'
      );
    } catch (error) {
      console.error('Remove employee error:', error);
      showSnackbar('Personel kaldırılırken hata oluştu: ' + (error.response?.data?.detail || error.message), 'error');
    } finally {
      setLoading(false);
      setPendingRemoveEmployee(null);
      setRemoveEmployeePreview(null);
    }
  };

  const handleCancelRemoveEmployee = () => {
    setRemoveEmployeeDialog(false);
    setPendingRemoveEmployee(null);
    setRemoveEmployeePreview(null);
  };

  const handleAddEmployeeToRoute = async (routeIndex, routeId, employeeId) => {
    if (!selectedSimulationId || routeId == null) return;

    setPendingAddEmployee({ routeIndex, routeId, employeeId });

    try {
      const preview = await api.previewAddEmployee(selectedSimulationId, routeId, employeeId);
      setAddEmployeePreview(preview);
      setAddEmployeeDialog(true);
    } catch (error) {
      console.error('Add employee preview error:', error);
      showSnackbar('Önizleme alınamadı: ' + (error.response?.data?.detail || error.message), 'error');
      setPendingAddEmployee(null);
    }
  };

  const handleConfirmAddEmployee = async () => {
    if (!pendingAddEmployee || !selectedSimulationId) return;

    const { routeIndex, routeId, employeeId } = pendingAddEmployee;
    setAddEmployeeDialog(false);
    setLoading(true);

    try {
      const result = await api.addEmployeeToRoute(selectedSimulationId, routeId, employeeId);

      setRoutes(prev => {
        const updated = [...prev];
        updated[routeIndex] = {
          ...updated[routeIndex],
          distance: result.distance,
          duration: result.duration,
          polyline: result.polyline,
          stops: result.stops,
          passengers: result.passengers
        };
        return updated;
      });

      setSimulationHistoryRefreshKey(prev => prev + 1);
      showSnackbar(
        `"${result.employee_name}" rotaya eklendi: ${(result.distance/1000).toFixed(1)}km, ${Math.round(result.duration/60)}dk`,
        'success'
      );
    } catch (error) {
      console.error('Add employee error:', error);
      showSnackbar('Personel eklenirken hata oluştu: ' + (error.response?.data?.detail || error.message), 'error');
    } finally {
      setLoading(false);
      setPendingAddEmployee(null);
      setAddEmployeePreview(null);
    }
  };

  const handleCancelAddEmployee = () => {
    setAddEmployeeDialog(false);
    setPendingAddEmployee(null);
    setAddEmployeePreview(null);
  };

  const handleSaveRouteChanges = async (routeIndex) => {
    if (!selectedSimulationId || Object.keys(modifiedStops).length === 0) {
      showSnackbar('Değişiklik yapılmadı', 'warning');
      return;
    }

    const route = routes[routeIndex];
    if (!route) return;

    setLoading(true);
    try {
      const stopsToUpdate = Object.values(modifiedStops);
      const result = await api.updateRouteStops(selectedSimulationId, route.id, stopsToUpdate);
      
      // Update local state with new route data
      setRoutes(prev => {
        const updated = [...prev];
        updated[routeIndex] = {
          ...updated[routeIndex],
          distance: result.distance,
          duration: result.duration,
          polyline: result.polyline,
          stops: result.stops
        };
        return updated;
      });
      
      setEditingRoute(null);
      setModifiedStops({});
      setSimulationHistoryRefreshKey(prev => prev + 1);
      showSnackbar(`Rota güncellendi: ${(result.distance/1000).toFixed(1)}km, ${Math.round(result.duration/60)}dk`, 'success');
    } catch (error) {
      console.error('Route update error:', error);
      showSnackbar('Rota güncellenirken hata oluştu', 'error');
    } finally {
      setLoading(false);
    }
  };

  const showSnackbar = (message, severity = 'info') => {
    setSnackbar({ open: true, message, severity });
  };

  const handleCloseSnackbar = () => {
    setSnackbar({ ...snackbar, open: false });
  };

  const handleLogin = (userData) => {
    setUser(userData);
    showSnackbar(`Hoş geldiniz, ${userData.username}!`, 'success');
  };

  const handleLogout = () => {
    setUser(null);
    localStorage.removeItem('shuttleUser');
    showSnackbar('Çıkış yapıldı', 'info');
  };

  // Show loading while checking auth
  if (!authChecked) {
    return (
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <Box sx={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center' }}>
          <Typography>Yükleniyor...</Typography>
        </Box>
      </ThemeProvider>
    );
  }

  // Show login page if not authenticated
  if (!user) {
    return (
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <LoginPage onLogin={handleLogin} />
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box sx={{ display: 'flex', height: '100vh' }}>
        {/* App Bar */}
        <AppBar 
          position="fixed" 
          sx={{ zIndex: (theme) => theme.zIndex.drawer + 1 }}
        >
          <Toolbar>
            <IconButton
              color="inherit"
              onClick={() => setDrawerOpen(!drawerOpen)}
              edge="start"
              sx={{ mr: 2 }}
            >
              <MenuIcon />
            </IconButton>
            <DirectionsBusIcon sx={{ mr: 1 }} />
            <Typography variant="h6" noWrap component="div" sx={{ flexGrow: 1 }}>
              Servis Rota Optimizasyonu
            </Typography>
            <StatsPanel 
              employees={employees.length}
              stops={stops.length}
              routes={routes.length}
              systemStatus={systemStatus}
            />
            <Tooltip title="Personelleri Yenile & Haritaya Yerleştir">
              <IconButton
                color="inherit"
                onClick={() => {
                  setSimulationHistoryOpen(false);
                  setRoutes([]);
                  setOptimizationResult(null);
                  setSelectedSimulationId(null);
                  setSelectedRouteIndex(null);
                  loadSimulationData();
                  showSnackbar('Personel verileri yenilendi', 'success');
                }}
                sx={{ ml: 1 }}
              >
                <RefreshIcon />
              </IconButton>
            </Tooltip>
            <Tooltip title={showWalkingRadius ? 'Yürüme Mesafesini Gizle' : 'Yürüme Mesafesini Göster'}>
              <Box sx={{ display: 'flex', alignItems: 'center', ml: 1, color: 'white' }}>
                <DirectionsWalkIcon fontSize="small" />
                <Switch
                  checked={showWalkingRadius}
                  onChange={(e) => setShowWalkingRadius(e.target.checked)}
                  size="small"
                  sx={{ 
                    '& .MuiSwitch-switchBase.Mui-checked': { color: 'white' },
                    '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { backgroundColor: 'rgba(255,255,255,0.5)' }
                  }}
                />
              </Box>
            </Tooltip>
            <Tooltip title="Ayarlar">
              <IconButton
                color="inherit"
                onClick={() => setSettingsModalOpen(true)}
                sx={{ ml: 1 }}
              >
                <SettingsIcon />
              </IconButton>
            </Tooltip>
            <Chip
              avatar={<Avatar><PersonIcon /></Avatar>}
              label={user.username}
              variant="outlined"
              sx={{ ml: 2, color: 'white', borderColor: 'rgba(255,255,255,0.5)' }}
            />
            <Button
              color="inherit"
              onClick={handleLogout}
              startIcon={<LogoutIcon />}
              sx={{ ml: 1 }}
            >
              Çıkış
            </Button>
          </Toolbar>
        </AppBar>

        {/* Control Panel Drawer */}
        <Drawer
          variant="persistent"
          anchor="left"
          open={drawerOpen}
          sx={{
            '& .MuiDrawer-paper': {
              width: DRAWER_WIDTH,
              boxSizing: 'border-box',
            },
          }}
        >
          <Toolbar />
          <ControlPanel
            loading={loading}
            setLoading={setLoading}
            systemStatus={systemStatus}
            depotLocation={depotLocation}
            optimizationResult={optimizationResult}
            animationPlaying={animationPlaying}
            employeeCount={employees.length}
            selectedRouteIndex={selectedRouteIndex}
            onCreateSimulation={handleRunOptimization}
            onPlayAnimation={handlePlayAnimation}
            onStopAnimation={handleStopAnimation}
            onResetAnimation={handleResetAnimation}
            onExcelUpload={handleExcelUpload}
            onShowEmployees={handleShowEmployees}
            onAddNewEmployee={handleAddNewEmployee}
            onUpdateCenter={handleUpdateCenter}
            onShowSimulationHistory={handleShowSimulationHistory}
            onSelectRoute={handleSelectRoute}
            onParamsChange={setCurrentSimParams}
          />
        </Drawer>

        {/* Employee List Drawer */}
        <Drawer
          variant="persistent"
          anchor="left"
          open={employeeListOpen}
          sx={{
            '& .MuiDrawer-paper': {
              width: EMPLOYEE_LIST_WIDTH,
              boxSizing: 'border-box',
              left: drawerOpen ? DRAWER_WIDTH : 0,
              transition: 'left 0.3s',
            },
          }}
        >
          <Toolbar />
          <EmployeeList
            employees={employees}
            onEmployeeClick={handleEmployeeClick}
            onClose={handleCloseEmployeeList}
            openAddDialog={openAddEmployeeDialog}
            onAddDialogOpened={() => setOpenAddEmployeeDialog(false)}
            onEmployeeUpdate={(updatedEmployee) => {
              setEmployees(prev => prev.map(emp => 
                emp.id === updatedEmployee.id 
                  ? { 
                      ...emp, 
                      location: updatedEmployee.home_location, 
                      home_location: updatedEmployee.home_location, 
                      address: updatedEmployee.address, 
                      photo_url: updatedEmployee.photo_url,
                      shift_id: updatedEmployee.shift_id,
                      shift_name: updatedEmployee.shift_name,
                      shift_color: updatedEmployee.shift_color
                    }
                  : emp
              ));
            }}
            onEmployeeDelete={(deletedId) => {
              setEmployees(prev => prev.filter(emp => emp.id !== deletedId));
            }}
            onEmployeeAdd={(newEmployee) => {
              setEmployees(prev => [...prev, {
                ...newEmployee,
                location: newEmployee.home_location,
                photo_url: newEmployee.photo_url,
                shift_id: newEmployee.shift_id,
                shift_name: newEmployee.shift_name,
                shift_color: newEmployee.shift_color
              }]);
            }}
            loading={loading}
          />
        </Drawer>

        {/* Map View */}
        <Box
          component="main"
          sx={{
            flexGrow: 1,
            width: '100%',
          }}
        >
          <Toolbar />
          <MapView
            center={mapCenter}
            employees={mapEmployees}
            routes={routes}
            depotLocation={depotLocation}
            animationPlaying={animationPlaying}
            animationProgress={animationProgress}
            onSetAnimationProgress={setAnimationProgress}
            selectedRouteIndex={selectedRouteIndex}
            focusedEmployee={focusedEmployee}
            onEmployeeLocationUpdate={handleEmployeeLocationUpdate}
            onStopDrag={handleStopDrag}
            onSetFirstStop={handleSetFirstStop}
            onRemoveEmployeeFromRoute={handleRemoveEmployeeFromRoute}
            onAddEmployeeToRoute={handleAddEmployeeToRoute}
            editingRoute={editingRoute}
            simulationHistoryOpen={simulationHistoryOpen}
            mapType={mapType}
            showWalkingRadius={showWalkingRadius}
            onCircleSelect={handleCircleSelect}
            routeColors={routeColors}
            onRouteColorChange={handleRouteColorChange}
          />
        </Box>

        {/* Editing Mode Bottom Bar */}
        {editingRoute !== null && (
          <Box
            sx={{
              position: 'fixed',
              bottom: 0,
              left: 0,
              right: 0,
              bgcolor: 'primary.main',
              color: 'white',
              py: 1.5,
              px: 3,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-start',
              gap: 3,
              zIndex: 1200,
              boxShadow: '0 -2px 10px rgba(0,0,0,0.2)'
            }}
          >
            <Button
              variant="contained"
              color="inherit"
              onClick={handleCancelEditRoute}
              sx={{ 
                color: 'primary.main', 
                bgcolor: 'white',
                '&:hover': { bgcolor: 'grey.100' }
              }}
            >
              Moddan Çık
            </Button>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <Typography variant="body1" fontWeight="medium">
                ✏️ Düzenleme Modu Aktif - Rota {(routes[editingRoute]?.vehicle_id || 0) + 1}
              </Typography>
              <Typography variant="body2" sx={{ opacity: 0.85 }}>
                | Yapılabilecekler: Durakları sürükle, İlk alınacak personeli değiştir
              </Typography>
            </Box>
          </Box>
        )}

        {/* Floating Button to Open Simulation List */}
        <Tooltip title="Simülasyon Listesi" placement="left">
          <Fab
            color="primary"
            onClick={handleShowSimulationHistory}
            sx={{
              position: 'fixed',
              right: 20,
              top: '50%',
              transform: 'translateY(-50%)',
              zIndex: 1000
            }}
          >
            <ListAltIcon />
          </Fab>
        </Tooltip>

        {/* Simulation History Panel */}
        <SimulationHistory
          open={simulationHistoryOpen}
          onClose={handleCloseSimulationHistory}
          onSelectSimulation={handleSelectSimulation}
          selectedSimulationId={selectedSimulationId}
          onSelectRoute={handleSelectRoute}
          selectedRouteIndex={selectedRouteIndex}
          refreshKey={simulationHistoryRefreshKey}
          editingRoute={editingRoute}
          onStartEditRoute={handleStartEditRoute}
          showWalkingRadius={showWalkingRadius}
          onReoptimizeRoute={handleReoptimizeRoute}
          routeColors={routeColors}
        />

        {/* Simulation Progress Overlay */}
        <Backdrop
          sx={{ 
            color: '#fff', 
            zIndex: (theme) => theme.zIndex.drawer + 1,
            flexDirection: 'column',
            gap: 3
          }}
          open={loading}
        >
          <CircularProgress color="inherit" size={80} thickness={4} />
          <Box sx={{ textAlign: 'center' }}>
            <Typography variant="h5" sx={{ mb: 1 }}>
              Simülasyon Hesaplanıyor...
            </Typography>
            <Typography variant="h3" sx={{ fontWeight: 'bold' }}>
              {simulationTime} sn
            </Typography>
            <Typography variant="body2" sx={{ mt: 1, opacity: 0.7 }}>
              Duraklar oluşturuluyor, rotalar optimize ediliyor...
            </Typography>
          </Box>
        </Backdrop>

        {/* Settings Modal */}
        <SettingsModal
          open={settingsModalOpen}
          onClose={() => setSettingsModalOpen(false)}
          onSettingsChange={(newSettings) => {
            if (newSettings.mapType) {
              setMapType(newSettings.mapType);
            }
          }}
        />

        {/* Stop Drag Confirmation Dialog */}
        <Dialog
          open={stopDragDialog}
          onClose={handleCancelStopDrag}
          maxWidth="xs"
          fullWidth
        >
          <DialogTitle sx={{ pb: 1 }}>
            📍 Durak Taşıma Onayı
          </DialogTitle>
          <DialogContent>
            {stopDragPreview && (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', bgcolor: 'grey.100', p: 1.5, borderRadius: 1 }}>
                  <Typography variant="body2" color="text.secondary">Mesafe</Typography>
                  <Box sx={{ textAlign: 'right' }}>
                    <Typography variant="body1" sx={{ textDecoration: 'line-through', color: 'text.secondary', fontSize: 12 }}>
                      {(stopDragPreview.old_distance / 1000).toFixed(2)} km
                    </Typography>
                    <Typography variant="body1" fontWeight="bold" color={stopDragPreview.distance_diff > 0 ? 'error.main' : 'success.main'}>
                      {(stopDragPreview.new_distance / 1000).toFixed(2)} km
                      <Typography component="span" variant="caption" sx={{ ml: 0.5 }}>
                        ({stopDragPreview.distance_diff > 0 ? '+' : ''}{(stopDragPreview.distance_diff / 1000).toFixed(2)} km)
                      </Typography>
                    </Typography>
                  </Box>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', bgcolor: 'grey.100', p: 1.5, borderRadius: 1 }}>
                  <Typography variant="body2" color="text.secondary">Süre</Typography>
                  <Box sx={{ textAlign: 'right' }}>
                    <Typography variant="body1" sx={{ textDecoration: 'line-through', color: 'text.secondary', fontSize: 12 }}>
                      {Math.round(stopDragPreview.old_duration / 60)} dk
                    </Typography>
                    <Typography variant="body1" fontWeight="bold" color={stopDragPreview.duration_diff > 0 ? 'error.main' : 'success.main'}>
                      {Math.round(stopDragPreview.new_duration / 60)} dk
                      <Typography component="span" variant="caption" sx={{ ml: 0.5 }}>
                        ({stopDragPreview.duration_diff > 0 ? '+' : ''}{Math.round(stopDragPreview.duration_diff / 60)} dk)
                      </Typography>
                    </Typography>
                  </Box>
                </Box>
              </Box>
            )}
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2 }}>
            <Button onClick={handleCancelStopDrag} color="inherit">
              İptal
            </Button>
            <Button onClick={handleConfirmStopDrag} variant="contained" color="primary">
              Uygula
            </Button>
          </DialogActions>
        </Dialog>

        {/* Add Employee to Route Confirmation Dialog */}
        <Dialog
          open={addEmployeeDialog}
          onClose={handleCancelAddEmployee}
          maxWidth="xs"
          fullWidth
        >
          <DialogTitle sx={{ pb: 1 }}>
            ➕ Personeli Rotaya Ekle
          </DialogTitle>
          <DialogContent>
            {addEmployeePreview && (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <Box sx={{ p: 1.5, bgcolor: 'success.light', borderRadius: 1, color: 'white' }}>
                  <Typography variant="body2" fontWeight="bold">
                    {addEmployeePreview.employee_name}
                  </Typography>
                  <Typography variant="caption">
                    Bu personel rotaya eklenecek
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', bgcolor: 'grey.100', p: 1.5, borderRadius: 1 }}>
                  <Typography variant="body2" color="text.secondary">Mesafe</Typography>
                  <Box sx={{ textAlign: 'right' }}>
                    <Typography variant="body1" sx={{ textDecoration: 'line-through', color: 'text.secondary', fontSize: 12 }}>
                      {(addEmployeePreview.old_distance / 1000).toFixed(2)} km
                    </Typography>
                    <Typography variant="body1" fontWeight="bold" color={addEmployeePreview.distance_diff > 0 ? 'error.main' : 'success.main'}>
                      {(addEmployeePreview.new_distance / 1000).toFixed(2)} km
                      <Typography component="span" variant="caption" sx={{ ml: 0.5 }}>
                        ({addEmployeePreview.distance_diff > 0 ? '+' : ''}{(addEmployeePreview.distance_diff / 1000).toFixed(2)} km)
                      </Typography>
                    </Typography>
                  </Box>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', bgcolor: 'grey.100', p: 1.5, borderRadius: 1 }}>
                  <Typography variant="body2" color="text.secondary">Süre</Typography>
                  <Box sx={{ textAlign: 'right' }}>
                    <Typography variant="body1" sx={{ textDecoration: 'line-through', color: 'text.secondary', fontSize: 12 }}>
                      {Math.round(addEmployeePreview.old_duration / 60)} dk
                    </Typography>
                    <Typography variant="body1" fontWeight="bold" color={addEmployeePreview.duration_diff > 0 ? 'error.main' : 'success.main'}>
                      {Math.round(addEmployeePreview.new_duration / 60)} dk
                      <Typography component="span" variant="caption" sx={{ ml: 0.5 }}>
                        ({addEmployeePreview.duration_diff > 0 ? '+' : ''}{Math.round(addEmployeePreview.duration_diff / 60)} dk)
                      </Typography>
                    </Typography>
                  </Box>
                </Box>
              </Box>
            )}
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2 }}>
            <Button onClick={handleCancelAddEmployee} color="inherit">
              İptal
            </Button>
            <Button onClick={handleConfirmAddEmployee} variant="contained" color="success">
              Rotaya Ekle
            </Button>
          </DialogActions>
        </Dialog>

        {/* Remove Employee Confirmation Dialog */}
        <Dialog
          open={removeEmployeeDialog}
          onClose={handleCancelRemoveEmployee}
          maxWidth="xs"
          fullWidth
        >
          <DialogTitle sx={{ pb: 1 }}>
            👤 Personeli Rotadan Kaldır
          </DialogTitle>
          <DialogContent>
            {removeEmployeePreview && (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <Box sx={{ p: 1.5, bgcolor: 'error.light', borderRadius: 1, color: 'white' }}>
                  <Typography variant="body2" fontWeight="bold">
                    {removeEmployeePreview.employee_name}
                  </Typography>
                  <Typography variant="caption">
                    Bu personel rotadan kaldırılacak
                    {removeEmployeePreview.stops_remaining === 0 ? ' (rota boş kalacak)' : ''}
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', bgcolor: 'grey.100', p: 1.5, borderRadius: 1 }}>
                  <Typography variant="body2" color="text.secondary">Mesafe</Typography>
                  <Box sx={{ textAlign: 'right' }}>
                    <Typography variant="body1" sx={{ textDecoration: 'line-through', color: 'text.secondary', fontSize: 12 }}>
                      {(removeEmployeePreview.old_distance / 1000).toFixed(2)} km
                    </Typography>
                    <Typography variant="body1" fontWeight="bold" color={removeEmployeePreview.distance_diff > 0 ? 'error.main' : 'success.main'}>
                      {(removeEmployeePreview.new_distance / 1000).toFixed(2)} km
                      <Typography component="span" variant="caption" sx={{ ml: 0.5 }}>
                        ({removeEmployeePreview.distance_diff > 0 ? '+' : ''}{(removeEmployeePreview.distance_diff / 1000).toFixed(2)} km)
                      </Typography>
                    </Typography>
                  </Box>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', bgcolor: 'grey.100', p: 1.5, borderRadius: 1 }}>
                  <Typography variant="body2" color="text.secondary">Süre</Typography>
                  <Box sx={{ textAlign: 'right' }}>
                    <Typography variant="body1" sx={{ textDecoration: 'line-through', color: 'text.secondary', fontSize: 12 }}>
                      {Math.round(removeEmployeePreview.old_duration / 60)} dk
                    </Typography>
                    <Typography variant="body1" fontWeight="bold" color={removeEmployeePreview.duration_diff > 0 ? 'error.main' : 'success.main'}>
                      {Math.round(removeEmployeePreview.new_duration / 60)} dk
                      <Typography component="span" variant="caption" sx={{ ml: 0.5 }}>
                        ({removeEmployeePreview.duration_diff > 0 ? '+' : ''}{Math.round(removeEmployeePreview.duration_diff / 60)} dk)
                      </Typography>
                    </Typography>
                  </Box>
                </Box>
              </Box>
            )}
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2 }}>
            <Button onClick={handleCancelRemoveEmployee} color="inherit">
              İptal
            </Button>
            <Button onClick={handleConfirmRemoveEmployee} variant="contained" color="error">
              Rotadan Kaldır
            </Button>
          </DialogActions>
        </Dialog>

        {/* Reorder Route Confirmation Dialog */}
        <Dialog
          open={reorderDialog}
          onClose={handleCancelReorder}
          maxWidth="xs"
          fullWidth
        >
          <DialogTitle sx={{ pb: 1 }}>
            🚩 İlk Alınacak Personel
          </DialogTitle>
          <DialogContent>
            {reorderPreview && (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <Box sx={{ p: 1.5, bgcolor: 'primary.light', borderRadius: 1, color: 'white' }}>
                  <Typography variant="body2" fontWeight="bold">
                    {pendingReorder?.stopName || `Durak ${(pendingReorder?.stopIndex || 0) + 1}`}
                  </Typography>
                  <Typography variant="caption">
                    Bu durak rotanın ilk durağı olacak
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', bgcolor: 'grey.100', p: 1.5, borderRadius: 1 }}>
                  <Typography variant="body2" color="text.secondary">Mesafe</Typography>
                  <Box sx={{ textAlign: 'right' }}>
                    <Typography variant="body1" sx={{ textDecoration: 'line-through', color: 'text.secondary', fontSize: 12 }}>
                      {(reorderPreview.old_distance / 1000).toFixed(2)} km
                    </Typography>
                    <Typography variant="body1" fontWeight="bold" color={reorderPreview.distance_diff > 0 ? 'error.main' : 'success.main'}>
                      {(reorderPreview.new_distance / 1000).toFixed(2)} km
                      <Typography component="span" variant="caption" sx={{ ml: 0.5 }}>
                        ({reorderPreview.distance_diff > 0 ? '+' : ''}{(reorderPreview.distance_diff / 1000).toFixed(2)} km)
                      </Typography>
                    </Typography>
                  </Box>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', bgcolor: 'grey.100', p: 1.5, borderRadius: 1 }}>
                  <Typography variant="body2" color="text.secondary">Süre</Typography>
                  <Box sx={{ textAlign: 'right' }}>
                    <Typography variant="body1" sx={{ textDecoration: 'line-through', color: 'text.secondary', fontSize: 12 }}>
                      {Math.round(reorderPreview.old_duration / 60)} dk
                    </Typography>
                    <Typography variant="body1" fontWeight="bold" color={reorderPreview.duration_diff > 0 ? 'error.main' : 'success.main'}>
                      {Math.round(reorderPreview.new_duration / 60)} dk
                      <Typography component="span" variant="caption" sx={{ ml: 0.5 }}>
                        ({reorderPreview.duration_diff > 0 ? '+' : ''}{Math.round(reorderPreview.duration_diff / 60)} dk)
                      </Typography>
                    </Typography>
                  </Box>
                </Box>
              </Box>
            )}
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2 }}>
            <Button onClick={handleCancelReorder} color="inherit">
              İptal
            </Button>
            <Button onClick={handleConfirmReorder} variant="contained" color="primary">
              Uygula
            </Button>
          </DialogActions>
        </Dialog>

        {/* Daire seçimi onay dialog */}
        <Dialog
          open={circleSelectDialog}
          onClose={() => { setCircleSelectDialog(false); setCircleSelectionData(null); }}
          maxWidth="sm"
          fullWidth
        >
          <DialogTitle sx={{ pb: 1 }}>
            <Typography variant="h6" fontWeight="bold">
              Alan Seçimi - Simülasyon Oluştur
            </Typography>
          </DialogTitle>
          <DialogContent>
            {circleSelectionData && (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, mt: 1 }}>
                <Box sx={{ bgcolor: 'primary.50', border: '1px solid', borderColor: 'primary.200', borderRadius: 1, p: 1.5 }}>
                  <Typography variant="subtitle2" color="primary.main" gutterBottom>Seçim Bilgileri</Typography>
                  <Typography variant="body2">Seçilen personel sayısı: <strong>{circleSelectionData.employees.length}</strong></Typography>
                  <Typography variant="body2">Daire yarıçapı: <strong>{circleSelectionData.radius >= 1000 ? (circleSelectionData.radius / 1000).toFixed(1) + ' km' : Math.round(circleSelectionData.radius) + ' m'}</strong></Typography>
                </Box>
                {currentSimParams && (
                  <Box sx={{ bgcolor: 'grey.50', border: '1px solid', borderColor: 'grey.300', borderRadius: 1, p: 1.5 }}>
                    <Typography variant="subtitle2" color="text.secondary" gutterBottom>Simülasyon Parametreleri</Typography>
                    <Typography variant="body2">Maks. yürüme mesafesi: <strong>{currentSimParams.max_walking_distance || '-'} m</strong></Typography>
                    <Typography variant="body2">16 koltuk: <strong>{currentSimParams.use_16_seaters ?? '-'}</strong>, 27 koltuk: <strong>{currentSimParams.use_27_seaters ?? '-'}</strong></Typography>
                    <Typography variant="body2">Maks. seyahat süresi: <strong>{currentSimParams.max_travel_time || '-'} dk</strong></Typography>
                    <Typography variant="body2">Trafik: <strong>{currentSimParams.traffic_mode === 'historical' ? 'Geçmiş' : 'Gerçek zamanlı'}</strong></Typography>
                  </Box>
                )}
                {circleSelectionData.employees.length === 0 && (
                  <Alert severity="warning">Seçilen alanda personel bulunamadı.</Alert>
                )}
              </Box>
            )}
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2 }}>
            <Button onClick={() => { setCircleSelectDialog(false); setCircleSelectionData(null); }} color="inherit">
              İptal
            </Button>
            <Button
              onClick={handleConfirmCircleSimulation}
              variant="contained"
              color="primary"
              disabled={!circleSelectionData || circleSelectionData.employees.length === 0}
            >
              Simülasyonu Başlat
            </Button>
          </DialogActions>
        </Dialog>

        {/* Snackbar for notifications */}
        <Snackbar
          open={snackbar.open}
          autoHideDuration={6000}
          onClose={handleCloseSnackbar}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        >
          <Alert 
            onClose={handleCloseSnackbar} 
            severity={snackbar.severity}
            sx={{ width: '100%' }}
          >
            {snackbar.message}
          </Alert>
        </Snackbar>
      </Box>
    </ThemeProvider>
  );
}

export default App;
