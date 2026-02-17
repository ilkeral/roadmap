import React, { useState, useEffect } from 'react';
import {
  Box,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  ListItemSecondaryAction,
  IconButton,
  Typography,
  TextField,
  InputAdornment,
  Divider,
  Chip,
  Paper,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  CircularProgress,
  Alert,
  Grid,
  Avatar,
  Badge,
  Collapse,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Menu
} from '@mui/material';
import PersonIcon from '@mui/icons-material/Person';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import SearchIcon from '@mui/icons-material/Search';
import CloseIcon from '@mui/icons-material/Close';
import MyLocationIcon from '@mui/icons-material/MyLocation';
import EditLocationIcon from '@mui/icons-material/EditLocation';
import RefreshIcon from '@mui/icons-material/Refresh';
import SaveIcon from '@mui/icons-material/Save';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import PhotoCameraIcon from '@mui/icons-material/PhotoCamera';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import WorkIcon from '@mui/icons-material/Work';
import EditIcon from '@mui/icons-material/Edit';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import api from '../services/api';

function EmployeeList({ employees, onEmployeeClick, onClose, openAddDialog, onAddDialogOpened, onEmployeeUpdate, onEmployeeDelete, onEmployeeAdd, loading, onRefresh }) {
  const [searchTerm, setSearchTerm] = useState('');
  
  // Shift state
  const [shifts, setShifts] = useState([]);
  const [expandedShifts, setExpandedShifts] = useState({});
  const [shiftDialogOpen, setShiftDialogOpen] = useState(false);
  const [shiftDialogMode, setShiftDialogMode] = useState('add');
  const [editingShift, setEditingShift] = useState(null);
  const [shiftName, setShiftName] = useState('');
  const [shiftColor, setShiftColor] = useState('#1976d2');
  const [shiftMenuAnchor, setShiftMenuAnchor] = useState(null);
  const [selectedShiftForMenu, setSelectedShiftForMenu] = useState(null);
  
  // Unified employee dialog state
  const [employeeDialogOpen, setEmployeeDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState('edit'); // 'edit' or 'add'
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [editName, setEditName] = useState('');
  const [editLat, setEditLat] = useState('');
  const [editLng, setEditLng] = useState('');
  const [geocodeAddress, setGeocodeAddress] = useState('');
  const [geocodeLoading, setGeocodeLoading] = useState(false);
  const [selectedShiftId, setSelectedShiftId] = useState(null);
  
  // Photo state
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [currentPhotoUrl, setCurrentPhotoUrl] = useState(null);

  // Load shifts on mount
  useEffect(() => {
    loadShifts();
  }, []);

  const loadShifts = async () => {
    try {
      const data = await api.getShifts();
      setShifts(data);
      // Initialize expanded state for all shifts
      const expanded = {};
      data.forEach(s => { expanded[s.id] = true; });
      expanded['unassigned'] = true;
      setExpandedShifts(expanded);
    } catch (err) {
      console.error('Failed to load shifts:', err);
    }
  };

  // Open add dialog when openAddDialog prop is true
  useEffect(() => {
    if (openAddDialog) {
      handleOpenAddDialog();
      if (onAddDialogOpened) {
        onAddDialogOpened();
      }
    }
  }, [openAddDialog]);
  const [saveLoading, setSaveLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  
  // Delete dialog state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [employeeToDelete, setEmployeeToDelete] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  
  // Drag and drop state
  const [draggedEmployee, setDraggedEmployee] = useState(null);
  const [dragOverShift, setDragOverShift] = useState(null);

  const filteredEmployees = employees.filter(emp => 
    emp.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    emp.address?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Group employees by shift
  const groupedEmployees = {};
  shifts.forEach(shift => {
    groupedEmployees[shift.id] = filteredEmployees.filter(emp => emp.shift_id === shift.id);
  });
  groupedEmployees['unassigned'] = filteredEmployees.filter(emp => !emp.shift_id);

  const toggleShiftExpand = (shiftId) => {
    setExpandedShifts(prev => ({ ...prev, [shiftId]: !prev[shiftId] }));
  };

  // Drag and drop handlers
  const handleDragStart = (e, employee) => {
    setDraggedEmployee(employee);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', employee.id);
  };

  const handleDragEnd = () => {
    setDraggedEmployee(null);
    setDragOverShift(null);
  };

  const handleDragOver = (e, shiftId) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverShift(shiftId);
  };

  const handleDragLeave = () => {
    setDragOverShift(null);
  };

  const handleDrop = async (e, shiftId) => {
    e.preventDefault();
    setDragOverShift(null);
    
    if (!draggedEmployee) return;
    
    // Don't do anything if dropping on same shift
    const currentShiftId = draggedEmployee.shift_id || 'unassigned';
    if (currentShiftId === shiftId) {
      setDraggedEmployee(null);
      return;
    }
    
    try {
      const newShiftId = shiftId === 'unassigned' ? null : shiftId;
      const updatedEmployee = await api.updateEmployeeShift(draggedEmployee.id, newShiftId);
      
      if (onEmployeeUpdate) {
        onEmployeeUpdate(updatedEmployee);
      }
    } catch (err) {
      console.error('Failed to update employee shift:', err);
    }
    
    setDraggedEmployee(null);
  };

  // Shift handlers
  const handleOpenShiftDialog = (mode, shift = null) => {
    setShiftDialogMode(mode);
    setEditingShift(shift);
    setShiftName(shift?.name || '');
    setShiftColor(shift?.color || '#1976d2');
    setShiftDialogOpen(true);
  };

  const handleSaveShift = async () => {
    if (!shiftName.trim()) return;
    
    try {
      if (shiftDialogMode === 'add') {
        await api.createShift(shiftName.trim(), shiftColor);
      } else {
        await api.updateShift(editingShift.id, { name: shiftName.trim(), color: shiftColor });
      }
      await loadShifts();
      if (onRefresh) onRefresh();
      setShiftDialogOpen(false);
    } catch (err) {
      console.error('Save shift error:', err);
    }
  };

  const handleDeleteShift = async (shiftId) => {
    try {
      await api.deleteShift(shiftId);
      await loadShifts();
      if (onRefresh) onRefresh();
      setShiftMenuAnchor(null);
    } catch (err) {
      console.error('Delete shift error:', err);
    }
  };

  const handleShiftMenuClick = (e, shift) => {
    e.stopPropagation();
    setSelectedShiftForMenu(shift);
    setShiftMenuAnchor(e.currentTarget);
  };

  const handleEmployeeClick = (employee) => {
    if (onEmployeeClick) {
      onEmployeeClick(employee);
    }
  };

  const handlePhotoChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setPhotoFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setPhotoPreview(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleRemovePhoto = () => {
    setPhotoFile(null);
    setPhotoPreview(null);
  };

  const handleEditClick = (e, employee) => {
    e.stopPropagation();
    setDialogMode('edit');
    setSelectedEmployee(employee);
    setEditName(employee.name || '');
    setEditLat(employee.location?.lat?.toString() || employee.home_location?.lat?.toString() || '');
    setEditLng(employee.location?.lng?.toString() || employee.home_location?.lng?.toString() || '');
    setGeocodeAddress(employee.address || '');
    setPhotoFile(null);
    setPhotoPreview(null);
    setCurrentPhotoUrl(employee.photo_url || null);
    setSelectedShiftId(employee.shift_id || null);
    setError('');
    setSuccess('');
    setEmployeeDialogOpen(true);
  };

  const handleOpenAddDialog = () => {
    setDialogMode('add');
    setSelectedEmployee(null);
    setEditName('');
    setEditLat('');
    setEditLng('');
    setGeocodeAddress('');
    setPhotoFile(null);
    setPhotoPreview(null);
    setCurrentPhotoUrl(null);
    setSelectedShiftId(null);
    setError('');
    setSuccess('');
    setEmployeeDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setEmployeeDialogOpen(false);
    setSelectedEmployee(null);
    setPhotoFile(null);
    setPhotoPreview(null);
    setCurrentPhotoUrl(null);
    setError('');
    setSuccess('');
  };

  const handleGeocode = async () => {
    if (!geocodeAddress.trim()) {
      setError('Lütfen bir adres girin');
      return;
    }

    setGeocodeLoading(true);
    setError('');
    setSuccess('');

    try {
      const result = await api.geocodeAddress(geocodeAddress);
      setEditLat(result.lat.toString());
      setEditLng(result.lng.toString());
      setSuccess(`Koordinatlar hesaplandı: ${result.lat.toFixed(6)}, ${result.lng.toFixed(6)}`);
    } catch (err) {
      setError(err.response?.data?.detail || 'Adres için koordinat bulunamadı');
    } finally {
      setGeocodeLoading(false);
    }
  };

  const handleSaveEmployee = async () => {
    // Validation for add mode
    if (dialogMode === 'add' && !editName.trim()) {
      setError('Personel adı gereklidir');
      return;
    }

    const lat = parseFloat(editLat);
    const lng = parseFloat(editLng);

    if (isNaN(lat) || isNaN(lng)) {
      setError('Geçerli koordinatlar girin');
      return;
    }

    if (lat < -90 || lat > 90) {
      setError('Enlem -90 ile 90 arasında olmalıdır');
      return;
    }

    if (lng < -180 || lng > 180) {
      setError('Boylam -180 ile 180 arasında olmalıdır');
      return;
    }

    setSaveLoading(true);
    setError('');

    try {
      let employee;
      if (dialogMode === 'edit') {
        // Update existing employee
        employee = await api.updateEmployeeCoordinates(selectedEmployee.id, lat, lng);
        
        // Upload photo if selected
        if (photoFile) {
          employee = await api.uploadEmployeePhoto(selectedEmployee.id, photoFile);
        }
        
        // Update shift if changed
        if (selectedShiftId !== selectedEmployee.shift_id) {
          employee = await api.updateEmployeeShift(selectedEmployee.id, selectedShiftId);
        }
        
        setSuccess('Personel güncellendi');
        
        if (onEmployeeUpdate) {
          onEmployeeUpdate(employee);
        }
      } else {
        // Add new employee
        employee = await api.createEmployee(editName.trim(), lat, lng, geocodeAddress.trim() || null);
        
        // Upload photo if selected
        if (photoFile && employee.id) {
          employee = await api.uploadEmployeePhoto(employee.id, photoFile);
        }
        
        // Update shift if selected
        if (selectedShiftId && employee.id) {
          employee = await api.updateEmployeeShift(employee.id, selectedShiftId);
        }
        
        setSuccess('Personel eklendi');
        
        if (onEmployeeAdd) {
          onEmployeeAdd(employee);
        }
      }
      
      setTimeout(() => {
        handleCloseDialog();
      }, 1000);
    } catch (err) {
      setError(err.response?.data?.detail || (dialogMode === 'edit' ? 'Personel güncellenemedi' : 'Personel eklenemedi'));
    } finally {
      setSaveLoading(false);
    }
  };

  // Delete handlers
  const handleDeleteClick = (e, employee) => {
    e.stopPropagation();
    setEmployeeToDelete(employee);
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!employeeToDelete) return;
    
    setDeleteLoading(true);
    try {
      await api.deleteEmployee(employeeToDelete.id);
      if (onEmployeeDelete) {
        onEmployeeDelete(employeeToDelete.id);
      }
      setDeleteDialogOpen(false);
      setEmployeeToDelete(null);
    } catch (err) {
      console.error('Delete error:', err);
    } finally {
      setDeleteLoading(false);
    }
  };

  // Helper function to render employee item
  const renderEmployeeItem = (employee, index, isLast) => (
    <React.Fragment key={employee.id || index}>
      <ListItem 
        button
        draggable
        onDragStart={(e) => handleDragStart(e, employee)}
        onDragEnd={handleDragEnd}
        onClick={() => handleEmployeeClick(employee)}
        sx={{ 
          py: 1, 
          pl: 2,
          opacity: draggedEmployee?.id === employee.id ? 0.5 : 1,
          cursor: 'grab',
          '&:active': { cursor: 'grabbing' }
        }}
      >
        <DragIndicatorIcon sx={{ fontSize: 18, color: 'grey.400', mr: 0.5, cursor: 'grab' }} />
        <ListItemIcon sx={{ minWidth: 36 }}>
          {employee.photo_url ? (
            <Avatar
              src={employee.photo_url}
              sx={{ width: 32, height: 32, fontSize: 16 }}
            >
              {employee.name ? employee.name.charAt(0).toUpperCase() : '?'}
            </Avatar>
          ) : (
            <Avatar sx={{ width: 32, height: 32, fontSize: 16, bgcolor: 'primary.main', color: 'white' }}>
              <PersonIcon fontSize="small" />
            </Avatar>
          )}
        </ListItemIcon>
        <ListItemText
          primary={
            <Typography variant="body2" fontWeight="medium" noWrap>
              {employee.name}
            </Typography>
          }
          secondary={
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.3 }}>
              <LocationOnIcon sx={{ fontSize: 10, color: 'grey.400' }} />
              <Typography 
                color="text.secondary" 
                noWrap
                sx={{ maxWidth: 140, fontSize: '0.65rem' }}
              >
                {(employee.location?.lat || employee.home_location?.lat)?.toFixed(5)}, {(employee.location?.lng || employee.home_location?.lng)?.toFixed(5)}
              </Typography>
            </Box>
          }
        />
        <ListItemSecondaryAction>
          <Tooltip title="Düzenle">
            <IconButton 
              edge="end" 
              size="small"
              onClick={(e) => handleEditClick(e, employee)}
              sx={{ mr: 0.5 }}
            >
              <EditIcon fontSize="small" color="action" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Konuma git">
            <IconButton 
              edge="end" 
              size="small"
              onClick={(e) => {
                e.stopPropagation();
                handleEmployeeClick(employee);
              }}
              sx={{ mr: 0.5 }}
            >
              <MyLocationIcon fontSize="small" color="primary" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Sil">
            <IconButton 
              edge="end" 
              size="small"
              onClick={(e) => handleDeleteClick(e, employee)}
            >
              <DeleteIcon fontSize="small" color="error" />
            </IconButton>
          </Tooltip>
        </ListItemSecondaryAction>
      </ListItem>
      {!isLast && <Divider variant="inset" component="li" />}
    </React.Fragment>
  );

  return (
    <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <Paper 
        elevation={0} 
        sx={{ 
          p: 2, 
          backgroundColor: 'primary.main', 
          color: 'white',
          borderRadius: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <PersonIcon />
          <Typography variant="subtitle1" fontWeight="bold">
            Personeller
          </Typography>
          <Chip 
            label={employees.length} 
            size="small" 
            sx={{ 
              backgroundColor: 'rgba(255,255,255,0.2)', 
              color: 'white',
              fontWeight: 'bold'
            }} 
          />
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <Tooltip title="Yeni Vardiya Ekle">
            <IconButton size="small" sx={{ color: 'white' }} onClick={() => handleOpenShiftDialog('add')}>
              <WorkIcon />
            </IconButton>
          </Tooltip>
          <Tooltip title="Yeni Personel Ekle">
            <IconButton size="small" sx={{ color: 'white' }} onClick={handleOpenAddDialog}>
              <AddIcon />
            </IconButton>
          </Tooltip>
          <IconButton size="small" sx={{ color: 'white' }} onClick={onClose}>
            <CloseIcon />
          </IconButton>
        </Box>
      </Paper>

      {/* Search */}
      <Box sx={{ p: 1.5, backgroundColor: '#f5f5f5' }}>
        <TextField
          fullWidth
          size="small"
          placeholder="Personel ara..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" color="action" />
              </InputAdornment>
            ),
          }}
          sx={{ backgroundColor: 'white', borderRadius: 1 }}
        />
      </Box>

      {/* Employee Count */}
      {searchTerm && (
        <Box sx={{ px: 2, py: 0.5, backgroundColor: '#e3f2fd' }}>
          <Typography variant="caption" color="primary">
            {filteredEmployees.length} sonuç bulundu
          </Typography>
        </Box>
      )}

      <Divider />

      {/* Employee List grouped by Shift */}
      <List 
        sx={{ 
          flexGrow: 1, 
          overflow: 'auto',
          maxHeight: 'calc(100vh - 180px)',
          '& .MuiListItem-root:hover': {
            backgroundColor: '#e3f2fd'
          }
        }}
        dense
      >
        {filteredEmployees.length === 0 ? (
          <Box sx={{ p: 3, textAlign: 'center' }}>
            <PersonIcon sx={{ fontSize: 48, color: 'grey.300', mb: 1 }} />
            <Typography variant="body2" color="text.secondary">
              {employees.length === 0 
                ? 'Henüz personel yok. Excel dosyası yükleyin.'
                : 'Arama kriterine uygun personel bulunamadı.'
              }
            </Typography>
          </Box>
        ) : (
          <>
            {/* Shift groups */}
            {shifts.map((shift) => {
              const shiftEmployees = groupedEmployees[shift.id] || [];
              if (shiftEmployees.length === 0 && searchTerm) return null;
              
              const isDragOver = dragOverShift === shift.id;
              
              return (
                <React.Fragment key={shift.id}>
                  <ListItem 
                    button 
                    onClick={() => toggleShiftExpand(shift.id)}
                    onDragOver={(e) => handleDragOver(e, shift.id)}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, shift.id)}
                    sx={{ 
                      backgroundColor: isDragOver ? shift.color + '40' : shift.color + '15',
                      borderLeft: `4px solid ${shift.color}`,
                      border: isDragOver ? `2px dashed ${shift.color}` : 'none',
                      borderLeftWidth: '4px',
                      transition: 'all 0.2s ease',
                      '&:hover': { backgroundColor: shift.color + '25' }
                    }}
                  >
                    <ListItemIcon sx={{ minWidth: 36 }}>
                      {expandedShifts[shift.id] ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                    </ListItemIcon>
                    <ListItemText 
                      primary={
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Typography variant="subtitle2" fontWeight="bold">
                            {shift.name}
                          </Typography>
                          <Chip 
                            label={shiftEmployees.length} 
                            size="small" 
                            sx={{ 
                              height: 20, 
                              fontSize: 11,
                              backgroundColor: shift.color,
                              color: 'white'
                            }} 
                          />
                        </Box>
                      }
                    />
                    <IconButton 
                      size="small" 
                      onClick={(e) => handleShiftMenuClick(e, shift)}
                    >
                      <MoreVertIcon fontSize="small" />
                    </IconButton>
                  </ListItem>
                  <Collapse in={expandedShifts[shift.id]} timeout="auto" unmountOnExit>
                    <List component="div" disablePadding dense>
                      {shiftEmployees.map((emp, idx) => 
                        renderEmployeeItem(emp, idx, idx === shiftEmployees.length - 1)
                      )}
                      {shiftEmployees.length === 0 && (
                        <ListItem sx={{ pl: 4 }}>
                          <Typography variant="caption" color="text.secondary">
                            Bu vardiyada personel yok
                          </Typography>
                        </ListItem>
                      )}
                    </List>
                  </Collapse>
                </React.Fragment>
              );
            })}

            {/* Unassigned employees */}
            <React.Fragment>
              <ListItem 
                button 
                onClick={() => toggleShiftExpand('unassigned')}
                onDragOver={(e) => handleDragOver(e, 'unassigned')}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, 'unassigned')}
                sx={{ 
                  backgroundColor: dragOverShift === 'unassigned' ? '#e0e0e0' : '#f5f5f5',
                  borderLeft: '4px solid #9e9e9e',
                  border: dragOverShift === 'unassigned' ? '2px dashed #9e9e9e' : 'none',
                  borderLeftWidth: '4px',
                  transition: 'all 0.2s ease',
                  '&:hover': { backgroundColor: '#eeeeee' }
                }}
              >
                <ListItemIcon sx={{ minWidth: 36 }}>
                  {expandedShifts['unassigned'] ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                </ListItemIcon>
                <ListItemText 
                  primary={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Typography variant="subtitle2" fontWeight="bold" color="text.secondary">
                        Vardiya Atanmamış
                      </Typography>
                      <Chip 
                        label={groupedEmployees['unassigned']?.length || 0} 
                        size="small" 
                        sx={{ 
                          height: 20, 
                          fontSize: 11,
                          backgroundColor: '#9e9e9e',
                          color: 'white'
                        }} 
                      />
                    </Box>
                  }
                />
              </ListItem>
              <Collapse in={expandedShifts['unassigned']} timeout="auto" unmountOnExit>
                <List component="div" disablePadding dense>
                  {groupedEmployees['unassigned']?.length > 0 ? (
                    groupedEmployees['unassigned'].map((emp, idx) => 
                      renderEmployeeItem(emp, idx, idx === groupedEmployees['unassigned'].length - 1)
                    )
                  ) : (
                    <ListItem sx={{ pl: 4 }}>
                      <Typography variant="caption" color="text.secondary">
                        Tüm personeller vardiyalara atanmış
                      </Typography>
                    </ListItem>
                  )}
                </List>
              </Collapse>
            </React.Fragment>
          </>
        )}
      </List>

      {/* Shift Menu */}
      <Menu
        anchorEl={shiftMenuAnchor}
        open={Boolean(shiftMenuAnchor)}
        onClose={() => setShiftMenuAnchor(null)}
      >
        <MenuItem onClick={() => {
          handleOpenShiftDialog('edit', selectedShiftForMenu);
          setShiftMenuAnchor(null);
        }}>
          <EditIcon fontSize="small" sx={{ mr: 1 }} />
          Düzenle
        </MenuItem>
        {selectedShiftForMenu?.name !== 'Genel' && (
          <MenuItem onClick={() => handleDeleteShift(selectedShiftForMenu?.id)}>
            <DeleteIcon fontSize="small" sx={{ mr: 1 }} color="error" />
            Sil
          </MenuItem>
        )}
      </Menu>

      {/* Shift Dialog */}
      <Dialog
        open={shiftDialogOpen}
        onClose={() => setShiftDialogOpen(false)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle sx={{ backgroundColor: 'secondary.main', color: 'white' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <WorkIcon />
            {shiftDialogMode === 'add' ? 'Yeni Vardiya' : 'Vardiyayı Düzenle'}
          </Box>
        </DialogTitle>
        <DialogContent sx={{ pt: 3 }}>
          <TextField
            fullWidth
            label="Vardiya Adı"
            value={shiftName}
            onChange={(e) => setShiftName(e.target.value)}
            sx={{ mb: 2 }}
          />
          <Box sx={{ mb: 2 }}>
            <Typography variant="subtitle2" gutterBottom>Renk</Typography>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              {['#1976d2', '#e41a1c', '#4daf4a', '#ff7f00', '#984ea3', '#00CED1', '#FF1493', '#FFD700'].map(color => (
                <Box
                  key={color}
                  onClick={() => setShiftColor(color)}
                  sx={{
                    width: 32,
                    height: 32,
                    borderRadius: '50%',
                    backgroundColor: color,
                    cursor: 'pointer',
                    border: shiftColor === color ? '3px solid #333' : '2px solid transparent',
                    '&:hover': { transform: 'scale(1.1)' }
                  }}
                />
              ))}
            </Box>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShiftDialogOpen(false)}>İptal</Button>
          <Button variant="contained" onClick={handleSaveShift} disabled={!shiftName.trim()}>
            {shiftDialogMode === 'add' ? 'Ekle' : 'Kaydet'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Employee Dialog (Edit/Add) */}
      <Dialog 
        open={employeeDialogOpen} 
        onClose={handleCloseDialog}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ backgroundColor: dialogMode === 'add' ? 'success.main' : 'primary.main', color: 'white' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {dialogMode === 'add' ? <PersonAddIcon /> : <EditLocationIcon />}
            {dialogMode === 'add' ? 'Yeni Personel' : 'Personeli Güncelle'}
          </Box>
        </DialogTitle>
        <DialogContent sx={{ pt: 3 }}>
          <Box>
            {error && (
              <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>
            )}
            {success && (
              <Alert severity="success" sx={{ mb: 2 }}>{success}</Alert>
            )}

            {/* Name field - editable for add, display for edit */}
            {dialogMode === 'add' ? (
              <TextField
                fullWidth
                label="Personel Adı *"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                sx={{ mb: 3 }}
                placeholder="Örn: Ahmet Yılmaz"
              />
            ) : (
              <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
                {selectedEmployee?.name}
              </Typography>
            )}

            {/* Photo Upload Section */}
            <Paper variant="outlined" sx={{ p: 2, mb: 3, backgroundColor: '#fafafa' }}>
              <Typography variant="subtitle2" gutterBottom color="primary">
                Fotoğraf
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <Badge
                  overlap="circular"
                  anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
                  badgeContent={
                    <IconButton
                      component="label"
                      size="small"
                      sx={{
                        backgroundColor: 'primary.main',
                        color: 'white',
                        '&:hover': { backgroundColor: 'primary.dark' },
                        width: 28,
                        height: 28
                      }}
                    >
                      <PhotoCameraIcon sx={{ fontSize: 16 }} />
                      <input
                        type="file"
                        hidden
                        accept="image/*"
                        onChange={handlePhotoChange}
                      />
                    </IconButton>
                  }
                >
                  <Avatar
                    src={photoPreview || currentPhotoUrl}
                    sx={{ width: 80, height: 80, fontSize: 32 }}
                  >
                    {editName ? editName.charAt(0).toUpperCase() : (selectedEmployee?.name?.charAt(0).toUpperCase() || 'K')}
                  </Avatar>
                </Badge>
                <Box>
                  {(photoPreview || currentPhotoUrl) && (
                    <Button
                      size="small"
                      color="error"
                      onClick={handleRemovePhoto}
                      startIcon={<DeleteIcon />}
                    >
                      Kaldır
                    </Button>
                  )}
                  <Typography variant="caption" color="text.secondary" display="block">
                    JPG, PNG veya GIF (maks. 5MB)
                  </Typography>
                </Box>
              </Box>
            </Paper>

            {/* Geocode Section */}
            <Paper variant="outlined" sx={{ p: 2, mb: 3, backgroundColor: '#f5f5f5' }}>
              <Typography variant="subtitle2" gutterBottom color="primary">
                Adresten Koordinat Hesapla
              </Typography>
              <Box sx={{ display: 'flex', gap: 1 }}>
                <TextField
                  fullWidth
                  size="small"
                  placeholder="Adres girin (örn: Kadıköy, İstanbul)"
                  value={geocodeAddress}
                  onChange={(e) => setGeocodeAddress(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleGeocode()}
                />
                <Button
                  variant="contained"
                  onClick={handleGeocode}
                  disabled={geocodeLoading}
                  startIcon={geocodeLoading ? <CircularProgress size={16} /> : <RefreshIcon />}
                  sx={{ minWidth: 100 }}
                >
                  Hesapla
                </Button>
              </Box>
            </Paper>

            {/* Manual Coordinates Section */}
            <Typography variant="subtitle2" gutterBottom color="primary">
              Manuel Koordinat Girişi
            </Typography>
            <Grid container spacing={2}>
              <Grid item xs={6}>
                <TextField
                  fullWidth
                  label="Enlem (Latitude)"
                  value={editLat}
                  onChange={(e) => setEditLat(e.target.value)}
                  type="number"
                  inputProps={{ step: 'any' }}
                  helperText="Örn: 41.0082"
                />
              </Grid>
              <Grid item xs={6}>
                <TextField
                  fullWidth
                  label="Boylam (Longitude)"
                  value={editLng}
                  onChange={(e) => setEditLng(e.target.value)}
                  type="number"
                  inputProps={{ step: 'any' }}
                  helperText="Örn: 28.9784"
                />
              </Grid>
            </Grid>

            {/* Shift Selection */}
            <FormControl fullWidth sx={{ mt: 3 }}>
              <InputLabel>Vardiya</InputLabel>
              <Select
                value={selectedShiftId || ''}
                label="Vardiya"
                onChange={(e) => setSelectedShiftId(e.target.value || null)}
              >
                <MenuItem value="">
                  <em>Vardiya Yok</em>
                </MenuItem>
                {shifts.map(shift => (
                  <MenuItem key={shift.id} value={shift.id}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Box sx={{ width: 12, height: 12, borderRadius: '50%', backgroundColor: shift.color }} />
                      {shift.name}
                    </Box>
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <Alert severity="info" sx={{ mt: 2 }}>
              Google Maps'ten koordinat almak için: Haritaya sağ tıklayın ve "Ne var burada?" / koordinatları seçin.
            </Alert>
          </Box>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={handleCloseDialog} color="inherit">
            İptal
          </Button>
          <Button
            variant="contained"
            color={dialogMode === 'add' ? 'success' : 'primary'}
            onClick={handleSaveEmployee}
            disabled={saveLoading || !editLat || !editLng || (dialogMode === 'add' && !editName.trim())}
            startIcon={saveLoading ? <CircularProgress size={16} /> : <SaveIcon />}
          >
            {dialogMode === 'add' ? 'Ekle' : 'Kaydet'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle sx={{ backgroundColor: 'error.main', color: 'white' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <DeleteIcon />
                        Personeli Sil
          </Box>
        </DialogTitle>
        <DialogContent sx={{ pt: 3 }}>
          <Typography>
            <strong>{employeeToDelete?.name}</strong> adlı personeli silmek istediğinize emin misiniz?
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            Bu işlem geri alınamaz.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setDeleteDialogOpen(false)} color="inherit">
            İptal
          </Button>
          <Button
            variant="contained"
            color="error"
            onClick={handleConfirmDelete}
            disabled={deleteLoading}
            startIcon={deleteLoading ? <CircularProgress size={16} /> : <DeleteIcon />}
          >
            Sil
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default EmployeeList;
