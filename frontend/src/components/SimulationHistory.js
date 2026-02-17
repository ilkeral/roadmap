import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  ListItemSecondaryAction,
  Divider,
  Chip,
  Collapse,
  CircularProgress,
  Paper,
  Tooltip,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  Button,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import DeleteIcon from '@mui/icons-material/Delete';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import DirectionsBusIcon from '@mui/icons-material/DirectionsBus';
import RouteIcon from '@mui/icons-material/Route';
import PeopleIcon from '@mui/icons-material/People';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import GroupIcon from '@mui/icons-material/Group';
import EditIcon from '@mui/icons-material/Edit';
import SaveIcon from '@mui/icons-material/Save';
import CancelIcon from '@mui/icons-material/Cancel';
import WorkIcon from '@mui/icons-material/Work';
import { api } from '../services/api';

// Route colors for visualization
const ROUTE_COLORS = [
  '#e41a1c', '#377eb8', '#4daf4a', '#984ea3', '#ff7f00',
  '#ffff33', '#a65628', '#f781bf', '#999999', '#66c2a5',
  '#fc8d62', '#8da0cb', '#e78ac3', '#a6d854', '#ffd92f'
];

function SimulationHistory({ 
  open, 
  onClose, 
  onSelectSimulation, 
  selectedSimulationId, 
  onSelectRoute, 
  selectedRouteIndex, 
  refreshKey,
  editingRoute,
  onStartEditRoute,
  onCancelEditRoute,
  onSaveRouteChanges,
  hasModifiedStops
}) {
  const [simulations, setSimulations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const [simulationDetails, setSimulationDetails] = useState({});
  const [loadingDetails, setLoadingDetails] = useState({});
  const [employeeDialog, setEmployeeDialog] = useState({ open: false, route: null, employees: [] });

  useEffect(() => {
    if (open) {
      loadSimulations();
    }
  }, [open, refreshKey]);

  const loadSimulations = async () => {
    setLoading(true);
    try {
      const data = await api.getSimulations();
      setSimulations(data);
    } catch (error) {
      console.error('Simülasyonlar yüklenemedi:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleExpand = async (simId) => {
    if (expandedId === simId) {
      setExpandedId(null);
      return;
    }

    setExpandedId(simId);

    // Load details if not already loaded
    if (!simulationDetails[simId]) {
      setLoadingDetails(prev => ({ ...prev, [simId]: true }));
      try {
        const details = await api.getSimulation(simId);
        setSimulationDetails(prev => ({ ...prev, [simId]: details }));
        // Auto-select simulation when expanded to show routes on map
        onSelectSimulation(details);
      } catch (error) {
        console.error('Simülasyon detayı yüklenemedi:', error);
      } finally {
        setLoadingDetails(prev => ({ ...prev, [simId]: false }));
      }
    } else {
      // If details already loaded, auto-select when expanded
      onSelectSimulation(simulationDetails[simId]);
    }
  };

  const handleSelect = async (simulation) => {
    // Clear route selection when selecting a new simulation
    if (onSelectRoute) onSelectRoute(null);
    
    // Always load fresh data from API to ensure routes are available
    try {
      const details = await api.getSimulation(simulation.id);
      setSimulationDetails(prev => ({ ...prev, [simulation.id]: details }));
      onSelectSimulation(details);
    } catch (error) {
      console.error('Simülasyon yüklenemedi:', error);
      // Fallback to cached data if available
      if (simulationDetails[simulation.id]) {
        onSelectSimulation(simulationDetails[simulation.id]);
      }
    }
  };

  const handleRouteClick = (e, routeIndex) => {
    e.stopPropagation();
    // Toggle route selection
    if (selectedRouteIndex === routeIndex) {
      onSelectRoute(null); // Deselect if clicking same route
    } else {
      onSelectRoute(routeIndex);
    }
  };

  const handleShowEmployees = (e, route, routeIndex) => {
    e.stopPropagation();
    // Collect all employees from all stops in this route
    const employees = [];
    if (route.stops) {
      route.stops.forEach((stop, stopIndex) => {
        if (stop.employee_names) {
          stop.employee_names.forEach(name => {
            employees.push({
              name,
              stopName: stop.road_name || stop.name || `Durak ${stopIndex + 1}`,
              stopIndex: stopIndex + 1
            });
          });
        }
      });
    }
    setEmployeeDialog({
      open: true,
      route: { ...route, index: routeIndex },
      employees
    });
  };

  const handleCloseEmployeeDialog = () => {
    setEmployeeDialog({ open: false, route: null, employees: [] });
  };

  const handleDelete = async (e, simId) => {
    e.stopPropagation();
    if (!window.confirm('Bu simülasyonu silmek istediğinize emin misiniz?')) {
      return;
    }

    try {
      await api.deleteSimulation(simId);
      setSimulations(prev => prev.filter(s => s.id !== simId));
      if (selectedSimulationId === simId) {
        onSelectSimulation(null);
      }
    } catch (error) {
      console.error('Simülasyon silinemedi:', error);
    }
  };

  const formatDate = (isoString) => {
    const date = new Date(isoString);
    return date.toLocaleDateString('tr-TR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatDistance = (meters) => {
    if (meters >= 1000) {
      return `${(meters / 1000).toFixed(1)} km`;
    }
    return `${Math.round(meters)} m`;
  };

  const formatDuration = (seconds) => {
    if (!seconds) return '-';
    const minutes = Math.round(seconds / 60);
    if (minutes >= 60) {
      const hours = Math.floor(minutes / 60);
      const mins = minutes % 60;
      return `${hours}s ${mins}dk`;
    }
    return `${minutes} dk`;
  };

  const formatTrafficMode = (mode) => {
    switch(mode) {
      case 'morning': return 'Sabah (×1.4)';
      case 'evening': return 'Akşam (×1.6)';
      default: return 'Trafiksiz';
    }
  };

  const formatVehiclePriority = (priority) => {
    switch(priority) {
      case 'large': return '27\'lik öncelikli';
      case 'small': return '16\'lık öncelikli';
      default: return 'Otomatik';
    }
  };

  if (!open) return null;

  return (
    <Paper
      elevation={4}
      sx={{
        position: 'fixed',
        right: 0,
        top: 64,
        width: 380,
        height: 'calc(100vh - 64px)',
        zIndex: 1200,
        display: 'flex',
        flexDirection: 'column',
        borderRadius: 0,
        borderLeft: '1px solid',
        borderColor: 'divider',
      }}
    >
      {/* Header */}
      <Box
        sx={{
          p: 2,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid',
          borderColor: 'divider',
          bgcolor: 'primary.main',
          color: 'white',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <RouteIcon />
          <Typography variant="h6">Simülasyon Listesi</Typography>
        </Box>
        <IconButton size="small" onClick={onClose} sx={{ color: 'white' }}>
          <CloseIcon />
        </IconButton>
      </Box>

      {/* Content */}
      <Box sx={{ flex: 1, overflow: 'auto' }}>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
            <CircularProgress />
          </Box>
        ) : simulations.length === 0 ? (
          <Alert severity="info" sx={{ m: 2 }}>
            Henüz simülasyon oluşturulmamış. Sol panelden "Yeni Simülasyon" butonuna tıklayın.
          </Alert>
        ) : (
          <List disablePadding>
            {simulations.map((sim, index) => (
              <Box key={sim.id}>
                <ListItem
                  disablePadding
                  sx={{
                    bgcolor: selectedSimulationId === sim.id ? 'action.selected' : 'inherit',
                  }}
                >
                  <ListItemButton
                    onClick={() => handleSelect(sim)}
                    sx={{ pr: 10 }}
                  >
                    <ListItemText
                      primary={
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                          <Typography variant="subtitle2" noWrap sx={{ maxWidth: 180 }}>
                            {sim.name}
                          </Typography>
                          <Chip
                            size="small"
                            icon={<DirectionsBusIcon sx={{ fontSize: 14 }} />}
                            label={sim.total_vehicles}
                            color="primary"
                            variant="outlined"
                            sx={{ height: 22 }}
                          />
                          {sim.shift_name && (
                            <Chip
                              size="small"
                              icon={<WorkIcon sx={{ fontSize: 14 }} />}
                              label={sim.shift_name}
                              color={sim.shift_id ? 'secondary' : 'default'}
                              variant="outlined"
                              sx={{ height: 22 }}
                            />
                          )}
                        </Box>
                      }
                      secondary={
                        <Box sx={{ mt: 0.5 }}>
                          <Typography variant="caption" color="text.secondary" component="div">
                            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                              <span>{formatDistance(sim.total_distance)}</span>
                              <span>{formatDuration(sim.total_duration)}</span>
                              <span>{sim.total_passengers} yolcu</span>
                            </Box>
                          </Typography>
                          {/* Criteria info */}
                          <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 0.5 }}>
                            <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
                              <span>🚗 {formatTrafficMode(sim.traffic_mode)}</span>
                              {sim.max_travel_time && (
                                <span>⏱ {sim.max_travel_time}dk</span>
                              )}
                              {sim.max_walking_distance && (
                                <span>🚶 {sim.max_walking_distance}m</span>
                              )}
                              {sim.buffer_seats > 0 && (
                                <span>💺 +{sim.buffer_seats}</span>
                              )}
                            </Box>
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {formatDate(sim.created_at)}
                          </Typography>
                        </Box>
                      }
                    />
                    <ListItemSecondaryAction>
                      <IconButton
                        size="small"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleExpand(sim.id);
                        }}
                      >
                        {expandedId === sim.id ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                      </IconButton>
                      <Tooltip title="Sil">
                        <IconButton
                          size="small"
                          onClick={(e) => handleDelete(e, sim.id)}
                          color="error"
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </ListItemSecondaryAction>
                  </ListItemButton>
                </ListItem>

                {/* Expanded Route Details */}
                <Collapse in={expandedId === sim.id}>
                  <Box sx={{ bgcolor: 'grey.50', p: 1 }}>
                    {loadingDetails[sim.id] ? (
                      <Box sx={{ display: 'flex', justifyContent: 'center', p: 2 }}>
                        <CircularProgress size={24} />
                      </Box>
                    ) : simulationDetails[sim.id] ? (
                      <List dense disablePadding>
                        <ListItem
                          sx={{
                            py: 0.5,
                            bgcolor: selectedRouteIndex === null ? 'primary.light' : 'white',
                            mb: 0.5,
                            borderRadius: 1,
                            cursor: 'pointer',
                            '&:hover': { bgcolor: 'grey.100' }
                          }}
                          onClick={(e) => { e.stopPropagation(); onSelectRoute(null); }}
                        >
                          <ListItemText
                            primary={
                              <Typography variant="body2" fontWeight="medium">
                                Tüm Rotaları Göster
                              </Typography>
                            }
                          />
                        </ListItem>
                        {simulationDetails[sim.id].routes.map((route, routeIndex) => (
                          <ListItem
                            key={route.id}
                            onClick={(e) => handleRouteClick(e, routeIndex)}
                            sx={{
                              py: 0.5,
                              bgcolor: selectedRouteIndex === routeIndex ? 'action.selected' : 'white',
                              mb: 0.5,
                              borderRadius: 1,
                              borderLeft: 4,
                              borderLeftColor: ROUTE_COLORS[routeIndex % ROUTE_COLORS.length],
                              cursor: 'pointer',
                              '&:hover': { bgcolor: 'grey.100' }
                            }}
                          >
                            <ListItemText
                              primary={
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                  <DirectionsBusIcon
                                    sx={{
                                      fontSize: 16,
                                      color: ROUTE_COLORS[routeIndex % ROUTE_COLORS.length]
                                    }}
                                  />
                                  <Typography variant="body2">
                                    Araç {route.vehicle_id + 1} ({route.vehicle_type})
                                  </Typography>
                                </Box>
                              }
                              secondary={
                                <Box sx={{ display: 'flex', gap: 2, mt: 0.5 }}>
                                  <Chip
                                    size="small"
                                    icon={<PeopleIcon sx={{ fontSize: 12 }} />}
                                    label={`${route.passengers}/${route.capacity}`}
                                    sx={{ height: 20, fontSize: 11 }}
                                  />
                                  <Chip
                                    size="small"
                                    icon={<RouteIcon sx={{ fontSize: 12 }} />}
                                    label={formatDistance(route.distance)}
                                    sx={{ height: 20, fontSize: 11 }}
                                  />
                                  <Chip
                                    size="small"
                                    icon={<AccessTimeIcon sx={{ fontSize: 12 }} />}
                                    label={formatDuration(route.duration)}
                                    sx={{ height: 20, fontSize: 11 }}
                                  />
                                </Box>
                              }
                            />
                            <Box sx={{ display: 'flex', alignItems: 'center' }}>
                              <Tooltip title="Çalışan Listesi">
                                <IconButton
                                  size="small"
                                  onClick={(e) => handleShowEmployees(e, route, routeIndex)}
                                >
                                  <GroupIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                              {editingRoute === routeIndex ? (
                                <>
                                  <Tooltip title="Kaydet">
                                    <IconButton
                                      size="small"
                                      color="success"
                                      onClick={(e) => { e.stopPropagation(); onSaveRouteChanges(routeIndex); }}
                                      disabled={!hasModifiedStops}
                                    >
                                      <SaveIcon fontSize="small" />
                                    </IconButton>
                                  </Tooltip>
                                  <Tooltip title="İptal">
                                    <IconButton
                                      size="small"
                                      color="error"
                                      onClick={(e) => { e.stopPropagation(); onCancelEditRoute(); }}
                                    >
                                      <CancelIcon fontSize="small" />
                                    </IconButton>
                                  </Tooltip>
                                </>
                              ) : (
                                <Tooltip title="Durakları Düzenle">
                                  <IconButton
                                    size="small"
                                    onClick={(e) => { e.stopPropagation(); onStartEditRoute(routeIndex); }}
                                  >
                                    <EditIcon fontSize="small" />
                                  </IconButton>
                                </Tooltip>
                              )}
                            </Box>
                          </ListItem>
                        ))}
                      </List>
                    ) : null}
                  </Box>
                </Collapse>

                {index < simulations.length - 1 && <Divider />}
              </Box>
            ))}
          </List>
        )}
      </Box>

      {/* Employee List Dialog */}
      <Dialog
        open={employeeDialog.open}
        onClose={handleCloseEmployeeDialog}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <DirectionsBusIcon 
            sx={{ 
              color: employeeDialog.route 
                ? ROUTE_COLORS[employeeDialog.route.index % ROUTE_COLORS.length] 
                : 'primary.main' 
            }} 
          />
          {employeeDialog.route && `Araç ${employeeDialog.route.vehicle_id + 1} - Çalışan Listesi`}
          <IconButton
            onClick={handleCloseEmployeeDialog}
            sx={{ position: 'absolute', right: 8, top: 8 }}
          >
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers>
          {employeeDialog.employees.length === 0 ? (
            <Alert severity="info">Bu rotada çalışan bulunamadı.</Alert>
          ) : (
            <List dense>
              {employeeDialog.employees.map((emp, idx) => (
                <ListItem key={idx} sx={{ py: 0.5 }}>
                  <ListItemText
                    primary={emp.name}
                    secondary={`Durak ${emp.stopIndex}: ${emp.stopName}`}
                  />
                </ListItem>
              ))}
            </List>
          )}
          <Box sx={{ mt: 2, textAlign: 'center' }}>
            <Chip 
              label={`Toplam: ${employeeDialog.employees.length} çalışan`} 
              color="primary" 
              variant="outlined"
            />
          </Box>
        </DialogContent>
      </Dialog>
    </Paper>
  );
}

export default SimulationHistory;
