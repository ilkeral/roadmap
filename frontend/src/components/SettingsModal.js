import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Box,
  Typography,
  Divider,
  IconButton,
  Alert,
  CircularProgress,
  InputAdornment,
  Tooltip,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import SettingsIcon from '@mui/icons-material/Settings';
import MapIcon from '@mui/icons-material/Map';
import KeyIcon from '@mui/icons-material/Key';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import DirectionsWalkIcon from '@mui/icons-material/DirectionsWalk';
import SaveIcon from '@mui/icons-material/Save';
import { api } from '../services/api';

// Map type options
const MAP_TYPES = [
  { value: 'street', label: 'Sokak Haritası', description: 'OpenStreetMap standart görünümü', icon: '🗺️' },
  { value: 'satellite', label: 'Uydu Görünümü', description: 'Esri uydu görüntüleri', icon: '🛰️' },
  { value: 'terrain', label: 'Arazi Haritası', description: 'Topoğrafik görünüm', icon: '⛰️' },
  { value: 'dark', label: 'Karanlık Mod', description: 'Gece görünümü', icon: '🌙' },
  { value: 'voyager', label: 'CartoDB Voyager', description: 'Modern temiz görünüm', icon: '✨' },
  { value: 'humanitarian', label: 'Humanitarian', description: 'İnsani yardım haritası (HOT)', icon: '❤️' },
  { value: 'toner', label: 'Toner', description: 'Siyah-beyaz minimalist', icon: '⬛' },
  { value: 'watercolor', label: 'Watercolor', description: 'Suluboya sanat görünümü', icon: '🎨' },
];

function SettingsModal({ open, onClose, onSettingsChange }) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  
  const [googleApiKey, setGoogleApiKey] = useState('');
  const [orsApiKey, setOrsApiKey] = useState('');
  const [mapType, setMapType] = useState('street');
  const [showApiKey, setShowApiKey] = useState(false);
  const [showOrsApiKey, setShowOrsApiKey] = useState(false);

  // Load settings on open
  useEffect(() => {
    if (open) {
      loadSettings();
    }
  }, [open]);

  const loadSettings = async () => {
    setLoading(true);
    setError(null);
    try {
      const settings = await api.getGeneralSettings();
      setGoogleApiKey(settings.google_maps_api_key || '');
      setOrsApiKey(settings.ors_api_key || '');
      setMapType(settings.map_type || 'street');
    } catch (err) {
      console.error('Ayarlar yüklenemedi:', err);
      setError('Ayarlar yüklenemedi');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      await api.updateGeneralSettings({
        google_maps_api_key: googleApiKey,
        ors_api_key: orsApiKey,
        map_type: mapType
      });
      setSuccess(true);
      
      // Notify parent about settings change
      if (onSettingsChange) {
        onSettingsChange({ googleApiKey, mapType });
      }
      
      // Close after short delay
      setTimeout(() => {
        onClose();
        setSuccess(false);
      }, 1000);
    } catch (err) {
      console.error('Ayarlar kaydedilemedi:', err);
      setError('Ayarlar kaydedilemedi');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: { borderRadius: 2 }
      }}
    >
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, pr: 6 }}>
        <SettingsIcon color="primary" />
        <Typography variant="h6">Genel Ayarlar</Typography>
        <IconButton
          onClick={onClose}
          sx={{ position: 'absolute', right: 8, top: 8 }}
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      
      <DialogContent dividers>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
            <CircularProgress />
          </Box>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {error && (
              <Alert severity="error" onClose={() => setError(null)}>
                {error}
              </Alert>
            )}
            
            {success && (
              <Alert severity="success">
                Ayarlar başarıyla kaydedildi!
              </Alert>
            )}
            
            {/* Google Maps API Section */}
            <Box>
              <Typography variant="subtitle1" fontWeight="medium" sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                <KeyIcon color="action" />
                Google Maps API
              </Typography>
              <TextField
                fullWidth
                label="Google Maps API Anahtarı"
                value={googleApiKey}
                onChange={(e) => setGoogleApiKey(e.target.value)}
                type={showApiKey ? 'text' : 'password'}
                placeholder="API anahtarınızı girin..."
                helperText="Google Traffic bilgisi almak için gerekli (isteğe bağlı)"
                InputProps={{
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        onClick={() => setShowApiKey(!showApiKey)}
                        edge="end"
                      >
                        {showApiKey ? <VisibilityOffIcon /> : <VisibilityIcon />}
                      </IconButton>
                    </InputAdornment>
                  ),
                }}
              />
              <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                💡 API anahtarı almak için: 
                <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener noreferrer" style={{ marginLeft: 4 }}>
                  Google Cloud Console
                </a>
              </Typography>
            </Box>
            
            <Divider />
            
            {/* OpenRouteService API Section */}
            <Box>
              <Typography variant="subtitle1" fontWeight="medium" sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                <DirectionsWalkIcon color="action" />
                OpenRouteService API (Yaya Rotası)
              </Typography>
              <TextField
                fullWidth
                label="ORS API Anahtarı"
                value={orsApiKey}
                onChange={(e) => setOrsApiKey(e.target.value)}
                type={showOrsApiKey ? 'text' : 'password'}
                placeholder="API anahtarınızı girin..."
                helperText="Yaya yürüme rotalarını hesaplamak için gerekli"
                InputProps={{
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        onClick={() => setShowOrsApiKey(!showOrsApiKey)}
                        edge="end"
                      >
                        {showOrsApiKey ? <VisibilityOffIcon /> : <VisibilityIcon />}
                      </IconButton>
                    </InputAdornment>
                  ),
                }}
              />
              <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                💡 Ücretsiz API anahtarı almak için: 
                <a href="https://openrouteservice.org/dev/#/signup" target="_blank" rel="noopener noreferrer" style={{ marginLeft: 4 }}>
                  OpenRouteService
                </a>
                {' '}(Günlük 2000 istek ücretsiz)
              </Typography>
            </Box>
            
            <Divider />
            
            {/* Map Display Section */}
            <Box>
              <Typography variant="subtitle1" fontWeight="medium" sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                <MapIcon color="action" />
                Harita Görünümü
              </Typography>
              <FormControl fullWidth>
                <InputLabel>Harita Tipi</InputLabel>
                <Select
                  value={mapType}
                  label="Harita Tipi"
                  onChange={(e) => setMapType(e.target.value)}
                >
                  {MAP_TYPES.map((type) => (
                    <MenuItem key={type.value} value={type.value}>
                      <Box>
                        <Typography variant="body1">{type.label}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          {type.description}
                        </Typography>
                      </Box>
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              
              {/* Preview Cards */}
              <Box sx={{ display: 'flex', gap: 1, mt: 2, flexWrap: 'wrap' }}>
                {MAP_TYPES.map((type) => (
                  <Tooltip key={type.value} title={type.label}>
                    <Box
                      onClick={() => setMapType(type.value)}
                      sx={{
                        width: 50,
                        height: 40,
                        borderRadius: 1,
                        border: mapType === type.value ? '2px solid' : '1px solid',
                        borderColor: mapType === type.value ? 'primary.main' : 'divider',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        bgcolor: type.value === 'dark' ? '#1a1a2e' : 
                                type.value === 'toner' ? '#f0f0f0' :
                                type.value === 'satellite' ? '#2d4a3e' :
                                type.value === 'terrain' ? '#e8dcc4' :
                                type.value === 'watercolor' ? '#f5e6d3' :
                                type.value === 'humanitarian' ? '#fff5f5' :
                                type.value === 'voyager' ? '#fafafa' : '#f5f5f5',
                        color: type.value === 'dark' ? 'white' : 'inherit',
                        fontSize: 16,
                        fontWeight: mapType === type.value ? 'bold' : 'normal',
                        transition: 'all 0.2s',
                        '&:hover': {
                          transform: 'scale(1.05)',
                          boxShadow: 2
                        }
                      }}
                    >
                      {type.icon}
                    </Box>
                  </Tooltip>
                ))}
              </Box>
            </Box>
          </Box>
        )}
      </DialogContent>
      
      <DialogActions sx={{ p: 2 }}>
        <Button onClick={onClose} disabled={saving}>
          İptal
        </Button>
        <Button
          variant="contained"
          onClick={handleSave}
          disabled={loading || saving}
          startIcon={saving ? <CircularProgress size={20} /> : <SaveIcon />}
        >
          {saving ? 'Kaydediliyor...' : 'Kaydet'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default SettingsModal;
