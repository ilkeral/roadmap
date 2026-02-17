import React, { useState, useEffect, useCallback, useRef } from 'react';
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
  Fab
} from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import DirectionsBusIcon from '@mui/icons-material/DirectionsBus';
import LogoutIcon from '@mui/icons-material/Logout';
import PersonIcon from '@mui/icons-material/Person';
import RefreshIcon from '@mui/icons-material/Refresh';
import ListAltIcon from '@mui/icons-material/ListAlt';
import SettingsIcon from '@mui/icons-material/Settings';
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
      showSnackbar(`${params.num_employees} çalışan oluşturuldu`, 'success');
      await loadSimulationData();
      await loadSystemStatus();
      setMapCenter({ lat: params.center_lat, lng: params.center_lng });
    } catch (error) {
      showSnackbar('Çalışan oluşturma başarısız: ' + error.message, 'error');
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
      `${result.imported} çalışan Excel'den aktarıldı${result.skipped > 0 ? ` (${result.skipped} mükerrer atlandı)` : ''}`,
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
      showSnackbar('Çalışan konumu güncellendi', 'success');
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
    showSnackbar('Durakları sürükleyerek taşıyabilirsiniz', 'info');
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

  const handleStopDrag = (routeIndex, stopIndex, newLocation) => {
    // Update local routes state immediately for visual feedback
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
    
    // Track the modification
    setModifiedStops(prev => ({
      ...prev,
      [stopIndex]: { stopIndex, ...newLocation }
    }));
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
            <Tooltip title="Çalışanları Yenile & Haritaya Yerleştir">
              <IconButton
                color="inherit"
                onClick={() => {
                  setSimulationHistoryOpen(false);
                  setRoutes([]);
                  setOptimizationResult(null);
                  setSelectedSimulationId(null);
                  setSelectedRouteIndex(null);
                  loadSimulationData();
                  showSnackbar('Çalışan verileri yenilendi', 'success');
                }}
                sx={{ ml: 1 }}
              >
                <RefreshIcon />
              </IconButton>
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
            employees={employees}
            routes={routes}
            depotLocation={depotLocation}
            animationPlaying={animationPlaying}
            animationProgress={animationProgress}
            onSetAnimationProgress={setAnimationProgress}
            selectedRouteIndex={selectedRouteIndex}
            focusedEmployee={focusedEmployee}
            onEmployeeLocationUpdate={handleEmployeeLocationUpdate}
            onStopDrag={handleStopDrag}
            editingRoute={editingRoute}
            simulationHistoryOpen={simulationHistoryOpen}
            mapType={mapType}
          />
        </Box>

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
          onCancelEditRoute={handleCancelEditRoute}
          onSaveRouteChanges={handleSaveRouteChanges}
          hasModifiedStops={Object.keys(modifiedStops).length > 0}
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
