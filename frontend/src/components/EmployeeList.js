import React, { useState } from 'react';
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
  Grid
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
import api from '../services/api';

function EmployeeList({ employees, onEmployeeClick, onClose, onEmployeeUpdate, onEmployeeDelete, onEmployeeAdd, loading }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [editLat, setEditLat] = useState('');
  const [editLng, setEditLng] = useState('');
  const [geocodeAddress, setGeocodeAddress] = useState('');
  const [geocodeLoading, setGeocodeLoading] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  
  // Delete dialog state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [employeeToDelete, setEmployeeToDelete] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  
  // Add employee dialog state
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newAddress, setNewAddress] = useState('');
  const [newLat, setNewLat] = useState('');
  const [newLng, setNewLng] = useState('');
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState('');
  const [addSuccess, setAddSuccess] = useState('');

  const filteredEmployees = employees.filter(emp => 
    emp.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    emp.address?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleEmployeeClick = (employee) => {
    if (onEmployeeClick) {
      onEmployeeClick(employee);
    }
  };

  const handleEditClick = (e, employee) => {
    e.stopPropagation();
    setSelectedEmployee(employee);
    setEditLat(employee.location?.lat?.toString() || employee.home_location?.lat?.toString() || '');
    setEditLng(employee.location?.lng?.toString() || employee.home_location?.lng?.toString() || '');
    // Pre-fill address if available
    setGeocodeAddress(employee.address || '');
    setError('');
    setSuccess('');
    setEditDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setEditDialogOpen(false);
    setSelectedEmployee(null);
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

  const handleSaveCoordinates = async () => {
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
      const updated = await api.updateEmployeeCoordinates(selectedEmployee.id, lat, lng);
      setSuccess('Koordinatlar kaydedildi');
      
      // Update local state
      if (onEmployeeUpdate) {
        onEmployeeUpdate(updated);
      }
      
      setTimeout(() => {
        handleCloseDialog();
      }, 1000);
    } catch (err) {
      setError(err.response?.data?.detail || 'Koordinatlar kaydedilemedi');
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

  // Add employee handlers
  const handleOpenAddDialog = () => {
    setNewName('');
    setNewAddress('');
    setNewLat('');
    setNewLng('');
    setAddError('');
    setAddSuccess('');
    setAddDialogOpen(true);
  };

  const handleGeocodeNewAddress = async () => {
    if (!newAddress.trim()) {
      setAddError('Lütfen bir adres girin');
      return;
    }

    setAddLoading(true);
    setAddError('');
    setAddSuccess('');

    try {
      const result = await api.geocodeAddress(newAddress);
      setNewLat(result.lat.toString());
      setNewLng(result.lng.toString());
      setAddSuccess(`Koordinatlar hesaplandı: ${result.lat.toFixed(6)}, ${result.lng.toFixed(6)}`);
    } catch (err) {
      setAddError(err.response?.data?.detail || 'Adres için koordinat bulunamadı');
    } finally {
      setAddLoading(false);
    }
  };

  const handleAddEmployee = async () => {
    if (!newName.trim()) {
      setAddError('Çalışan adı gereklidir');
      return;
    }

    const lat = parseFloat(newLat);
    const lng = parseFloat(newLng);

    if (isNaN(lat) || isNaN(lng)) {
      setAddError('Geçerli koordinatlar girin');
      return;
    }

    if (lat < -90 || lat > 90) {
      setAddError('Enlem -90 ile 90 arasında olmalıdır');
      return;
    }

    if (lng < -180 || lng > 180) {
      setAddError('Boylam -180 ile 180 arasında olmalıdır');
      return;
    }

    setAddLoading(true);
    setAddError('');

    try {
      const newEmployee = await api.createEmployee(newName.trim(), lat, lng, newAddress.trim() || null);
      setAddSuccess('Çalışan eklendi');
      
      if (onEmployeeAdd) {
        onEmployeeAdd(newEmployee);
      }
      
      setTimeout(() => {
        setAddDialogOpen(false);
      }, 1000);
    } catch (err) {
      setAddError(err.response?.data?.detail || 'Çalışan eklenemedi');
    } finally {
      setAddLoading(false);
    }
  };

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
            Çalışanlar
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
          <Tooltip title="Yeni Çalışan Ekle">
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
          placeholder="Çalışan ara..."
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

      {/* Info bar */}
      <Box sx={{ px: 2, py: 0.5, backgroundColor: '#e8f5e9' }}>
        <Typography variant="caption" color="success.dark">
          Koordinat düzenlemek için sağdaki <EditLocationIcon sx={{ fontSize: 12, verticalAlign: 'middle' }} /> simgesine tıklayın
        </Typography>
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

      {/* Employee List */}
      <List 
        sx={{ 
          flexGrow: 1, 
          overflow: 'auto',
          maxHeight: 'calc(100vh - 220px)',
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
                ? 'Henüz çalışan yok. Excel dosyası yükleyin.'
                : 'Arama kriterine uygun çalışan bulunamadı.'
              }
            </Typography>
          </Box>
        ) : (
          filteredEmployees.map((employee, index) => (
            <React.Fragment key={employee.id || index}>
              <ListItem 
                button
                onClick={() => handleEmployeeClick(employee)}
                sx={{ py: 1 }}
              >
                <ListItemIcon sx={{ minWidth: 36 }}>
                  <Box
                    sx={{
                      width: 28,
                      height: 28,
                      borderRadius: '50%',
                      backgroundColor: 'primary.main',
                      color: 'white',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '0.75rem',
                      fontWeight: 'bold'
                    }}
                  >
                    {index + 1}
                  </Box>
                </ListItemIcon>
                <ListItemText
                  primary={
                    <Typography variant="body2" fontWeight="medium" noWrap>
                      {employee.name}
                    </Typography>
                  }
                  secondary={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.5 }}>
                      <LocationOnIcon sx={{ fontSize: 12, color: 'grey.500' }} />
                      <Typography 
                        variant="caption" 
                        color="text.secondary" 
                        noWrap
                        sx={{ maxWidth: 160 }}
                      >
                        {(employee.location?.lat || employee.home_location?.lat)?.toFixed(5)}, {(employee.location?.lng || employee.home_location?.lng)?.toFixed(5)}
                      </Typography>
                    </Box>
                  }
                />
                <ListItemSecondaryAction>
                  <Tooltip title="Koordinat Düzenle">
                    <IconButton 
                      edge="end" 
                      size="small"
                      onClick={(e) => handleEditClick(e, employee)}
                      sx={{ mr: 0.5 }}
                    >
                      <EditLocationIcon fontSize="small" color="warning" />
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
                  <Tooltip title="Çalışanı Sil">
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
              {index < filteredEmployees.length - 1 && <Divider variant="inset" component="li" />}
            </React.Fragment>
          ))
        )}
      </List>

      {/* Edit Dialog */}
      <Dialog 
        open={editDialogOpen} 
        onClose={handleCloseDialog}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ backgroundColor: 'primary.main', color: 'white' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <EditLocationIcon />
            Koordinat Düzenle
          </Box>
        </DialogTitle>
        <DialogContent sx={{ pt: 3 }}>
          {selectedEmployee && (
            <Box>
              <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
                {selectedEmployee.name}
              </Typography>
              
              {error && (
                <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>
              )}
              {success && (
                <Alert severity="success" sx={{ mb: 2 }}>{success}</Alert>
              )}

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

              <Alert severity="info" sx={{ mt: 2 }}>
                Google Maps'ten koordinat almak için: Haritaya sağ tıklayın ve "Ne var burada?" / koordinatları seçin.
              </Alert>
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={handleCloseDialog} color="inherit">
            İptal
          </Button>
          <Button
            variant="contained"
            onClick={handleSaveCoordinates}
            disabled={saveLoading || !editLat || !editLng}
            startIcon={saveLoading ? <CircularProgress size={16} /> : <SaveIcon />}
          >
            Kaydet
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
            Çalışanı Sil
          </Box>
        </DialogTitle>
        <DialogContent sx={{ pt: 3 }}>
          <Typography>
            <strong>{employeeToDelete?.name}</strong> adlı çalışanı silmek istediğinize emin misiniz?
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

      {/* Add Employee Dialog */}
      <Dialog
        open={addDialogOpen}
        onClose={() => setAddDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ backgroundColor: 'success.main', color: 'white' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <PersonAddIcon />
            Yeni Çalışan Ekle
          </Box>
        </DialogTitle>
        <DialogContent sx={{ pt: 3 }}>
          {addError && (
            <Alert severity="error" sx={{ mb: 2 }}>{addError}</Alert>
          )}
          {addSuccess && (
            <Alert severity="success" sx={{ mb: 2 }}>{addSuccess}</Alert>
          )}

          <TextField
            fullWidth
            label="Çalışan Adı *"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            sx={{ mb: 3 }}
            placeholder="Örn: Ahmet Yılmaz"
          />

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
                value={newAddress}
                onChange={(e) => setNewAddress(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleGeocodeNewAddress()}
              />
              <Button
                variant="contained"
                onClick={handleGeocodeNewAddress}
                disabled={addLoading}
                startIcon={addLoading ? <CircularProgress size={16} /> : <RefreshIcon />}
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
                value={newLat}
                onChange={(e) => setNewLat(e.target.value)}
                type="number"
                inputProps={{ step: 'any' }}
                helperText="Örn: 41.0082"
              />
            </Grid>
            <Grid item xs={6}>
              <TextField
                fullWidth
                label="Boylam (Longitude)"
                value={newLng}
                onChange={(e) => setNewLng(e.target.value)}
                type="number"
                inputProps={{ step: 'any' }}
                helperText="Örn: 28.9784"
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setAddDialogOpen(false)} color="inherit">
            İptal
          </Button>
          <Button
            variant="contained"
            color="success"
            onClick={handleAddEmployee}
            disabled={addLoading || !newName.trim() || !newLat || !newLng}
            startIcon={addLoading ? <CircularProgress size={16} /> : <SaveIcon />}
          >
            Ekle
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default EmployeeList;
