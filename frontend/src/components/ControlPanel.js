import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Divider,
  TextField,
  Button,
  Slider,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  CircularProgress,
  Alert,
  Chip,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  FormControl,
  FormControlLabel,
  InputLabel,
  Select,
  MenuItem,
  Switch,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import PeopleIcon from '@mui/icons-material/People';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import DirectionsBusIcon from '@mui/icons-material/DirectionsBus';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import StopIcon from '@mui/icons-material/Stop';
import RefreshIcon from '@mui/icons-material/Refresh';
import RouteIcon from '@mui/icons-material/Route';
import SettingsIcon from '@mui/icons-material/Settings';
import WorkIcon from '@mui/icons-material/Work';
import DirectionsWalkIcon from '@mui/icons-material/DirectionsWalk';
import TrafficIcon from '@mui/icons-material/Traffic';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import ExcelUpload from './ExcelUpload';

import ListIcon from '@mui/icons-material/List';
import BusinessIcon from '@mui/icons-material/Business';
import EditLocationIcon from '@mui/icons-material/EditLocation';
import SaveIcon from '@mui/icons-material/Save';
import HistoryIcon from '@mui/icons-material/History';
import AddIcon from '@mui/icons-material/Add';
import { api } from '../services/api';

// Route colors - same as MapView
const ROUTE_COLORS = [
  '#E53935', '#1E88E5', '#43A047', '#FB8C00', '#8E24AA',
  '#00ACC1', '#FFB300', '#5E35B1', '#F4511E', '#00897B',
  '#D81B60', '#3949AB', '#7CB342', '#6D4C41', '#546E7A'
];

function ControlPanel({
  loading,
  setLoading,
  systemStatus,
  depotLocation,
  optimizationResult,
  animationPlaying,
  employeeCount,
  selectedRouteIndex,
  onCreateSimulation,
  onPlayAnimation,
  onStopAnimation,
  onResetAnimation,
  onExcelUpload,
  onShowEmployees,
  onAddNewEmployee,
  onUpdateCenter,
  onShowSimulationHistory,
  onSelectRoute
}) {
  const [maxWalkingDistance, setMaxWalkingDistance] = useState(200);
  const [num16Seaters, setNum16Seaters] = useState(5);
  const [num27Seaters, setNum27Seaters] = useState(5);
  const [vehiclePriority, setVehiclePriority] = useState('auto');
  const [maxTravelTime, setMaxTravelTime] = useState(65);
  const [excludeTolls, setExcludeTolls] = useState(false);
  const [trafficMode, setTrafficMode] = useState('none');
  const [bufferSeats, setBufferSeats] = useState(0);
  const [routeType, setRouteType] = useState('ring');
  const [shifts, setShifts] = useState([]);
  const [selectedShiftId, setSelectedShiftId] = useState('all'); // 'all' for all employees
  const [centerAddress, setCenterAddress] = useState('');
  const [centerLat, setCenterLat] = useState('');
  const [centerLng, setCenterLng] = useState('');
  const [editingCenter, setEditingCenter] = useState(false);
  const [savingCenter, setSavingCenter] = useState(false);

  // Calculate recommended fleet
  const calculateRecommendedFleet = (totalEmployees) => {
    if (!totalEmployees || totalEmployees <= 0) return { num27: 0, num16: 0 };
    
    // Prefer larger vehicles for efficiency
    let remaining = totalEmployees;
    let num27 = Math.floor(remaining / 27);
    remaining = remaining - (num27 * 27);
    
    // If remaining can fit in a 27-seater more efficiently, use it
    if (remaining > 16) {
      num27++;
      remaining = 0;
    }
    
    let num16 = remaining > 0 ? Math.ceil(remaining / 16) : 0;
    
    return { num27, num16 };
  };

  const recommendedFleet = calculateRecommendedFleet(employeeCount);
  const totalCapacity = num16Seaters * 16 + num27Seaters * 27;
  const capacityStatus = employeeCount > 0 ? (totalCapacity >= employeeCount ? 'sufficient' : 'insufficient') : 'none';

  const applyRecommendedFleet = () => {
    setNum27Seaters(recommendedFleet.num27);
    setNum16Seaters(recommendedFleet.num16);
  };

  // Load center settings on mount
  useEffect(() => {
    loadCenterSettings();
    loadShifts();
  }, []);

  // Load shifts
  const loadShifts = async () => {
    try {
      const data = await api.getShifts();
      setShifts(data);
    } catch (error) {
      console.error('Vardiyalar yüklenemedi:', error);
    }
  };

  // Update local state when depotLocation changes
  useEffect(() => {
    if (depotLocation && !editingCenter) {
      setCenterLat(depotLocation.lat.toFixed(6));
      setCenterLng(depotLocation.lng.toFixed(6));
    }
  }, [depotLocation, editingCenter]);

  const loadCenterSettings = async () => {
    try {
      const settings = await api.getCenterSettings();
      setCenterAddress(settings.address);
      setCenterLat(settings.lat.toFixed(6));
      setCenterLng(settings.lng.toFixed(6));
      // Update parent depot location
      if (onUpdateCenter) {
        onUpdateCenter({ lat: settings.lat, lng: settings.lng }, false);
      }
    } catch (error) {
      console.error('Merkez ayarları yüklenemedi:', error);
    }
  };

  const handleSaveCenter = async () => {
    const lat = parseFloat(centerLat);
    const lng = parseFloat(centerLng);
    
    if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      alert('Geçersiz koordinat değerleri');
      return;
    }

    setSavingCenter(true);
    try {
      await api.updateCenterSettings({
        address: centerAddress,
        lat: lat,
        lng: lng
      });
      setEditingCenter(false);
      // Update parent depot location
      if (onUpdateCenter) {
        onUpdateCenter({ lat, lng }, true);
      }
    } catch (error) {
      console.error('Merkez ayarları kaydedilemedi:', error);
      alert('Merkez ayarları kaydedilemedi');
    } finally {
      setSavingCenter(false);
    }
  };

  const handleOptimizeClick = () => {
    onCreateSimulation({
      max_walking_distance: maxWalkingDistance,
      use_16_seaters: num16Seaters,
      use_27_seaters: num27Seaters,
      vehicle_priority: vehiclePriority,
      max_travel_time: maxTravelTime,
      exclude_tolls: excludeTolls,
      traffic_mode: trafficMode,
      buffer_seats: bufferSeats,
      route_type: routeType,
      shift_id: selectedShiftId === 'all' ? null : selectedShiftId
    });
  };

  // Get selected employee count for the selected shift
  const getSelectedEmployeeCount = () => {
    if (selectedShiftId === 'all') {
      return employeeCount;
    }
    const selectedShift = shifts.find(s => s.id === selectedShiftId);
    return selectedShift ? selectedShift.employee_count : 0;
  };

  const selectedEmployeeCount = getSelectedEmployeeCount();
  const selectedRecommendedFleet = calculateRecommendedFleet(selectedEmployeeCount);
  const selectedCapacityStatus = selectedEmployeeCount > 0 ? (totalCapacity >= selectedEmployeeCount ? 'sufficient' : 'insufficient') : 'none';

  return (
    <Box sx={{ p: 2, height: 'calc(100vh - 64px)', overflow: 'auto' }}>
      {systemStatus && (
        <Alert 
          severity={systemStatus.osrm_available ? 'success' : 'warning'}
          sx={{ mb: 2 }}
        >
          {systemStatus.osrm_available 
            ? 'OSRM yönlendirme motoru bağlı' 
            : 'OSRM kullanılamıyor - alternatif mesafeler kullanılıyor'}
        </Alert>
      )}

      {/* Merkez Ayarları */}
      <Accordion>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <BusinessIcon sx={{ mr: 1 }} />
          <Typography>Merkez (İşyeri)</Typography>
        </AccordionSummary>
        <AccordionDetails>
          <TextField
            fullWidth
            label="Merkez Adresi"
            value={centerAddress}
            onChange={(e) => { setCenterAddress(e.target.value); setEditingCenter(true); }}
            size="small"
            placeholder="Örn: Pendik, İstanbul"
            sx={{ mb: 2 }}
          />
          
          <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
            <TextField
              label="Enlem (Lat)"
              value={centerLat}
              onChange={(e) => { setCenterLat(e.target.value); setEditingCenter(true); }}
              size="small"
              type="number"
              inputProps={{ step: 0.000001 }}
              sx={{ flex: 1 }}
            />
            <TextField
              label="Boylam (Lng)"
              value={centerLng}
              onChange={(e) => { setCenterLng(e.target.value); setEditingCenter(true); }}
              size="small"
              type="number"
              inputProps={{ step: 0.000001 }}
              sx={{ flex: 1 }}
            />
          </Box>

          <Button
            variant="contained"
            color="primary"
            fullWidth
            startIcon={savingCenter ? <CircularProgress size={20} color="inherit" /> : <SaveIcon />}
            onClick={handleSaveCenter}
            disabled={savingCenter || !editingCenter}
          >
            {savingCenter ? 'Kaydediliyor...' : 'Merkez Ayarlarını Kaydet'}
          </Button>
        </AccordionDetails>
      </Accordion>

      {/* Personeller Bölümü */}
      <Accordion>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <PeopleIcon sx={{ mr: 1 }} />
          <Typography>Personeller</Typography>
          <Chip 
            label={employeeCount || 0} 
            size="small" 
            color="primary"
            sx={{ ml: 'auto', mr: 1 }}
          />
        </AccordionSummary>
        <AccordionDetails>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <PeopleIcon color="action" />
              <Typography variant="body2">
                Toplam <strong>{employeeCount || 0}</strong> personel kayıtlı
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button
                variant="contained"
                fullWidth
                startIcon={<ListIcon />}
                onClick={onShowEmployees}
                disabled={!employeeCount}
              >
                Listele
              </Button>
              <Button
                variant="outlined"
                fullWidth
                startIcon={<AddIcon />}
                onClick={onAddNewEmployee}
              >
                Yeni Ekle
              </Button>
            </Box>
            <Divider sx={{ my: 1 }} />
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              Excel'den Toplu Yükleme
            </Typography>
            <ExcelUpload 
              onUploadComplete={onExcelUpload}
              loading={loading}
              setLoading={setLoading}
            />
          </Box>
        </AccordionDetails>
      </Accordion>

      <Accordion defaultExpanded>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <SettingsIcon sx={{ mr: 1 }} />
          <Typography>Optimizasyon Ayarları</Typography>
        </AccordionSummary>
        <AccordionDetails sx={{ p: 1 }}>
          {/* Vardiya Seçimi */}
          <Accordion sx={{ boxShadow: 'none', '&:before': { display: 'none' } }}>
            <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ minHeight: 40, '& .MuiAccordionSummary-content': { my: 0.5 } }}>
              <WorkIcon sx={{ mr: 1, fontSize: 20 }} color="primary" />
              <Typography variant="body2" fontWeight="medium">Vardiya Seçimi</Typography>
            </AccordionSummary>
            <AccordionDetails sx={{ pt: 0 }}>
              <FormControl fullWidth size="small" sx={{ mb: 1 }}>
                <InputLabel>Vardiya</InputLabel>
                <Select
                  value={selectedShiftId}
                  label="Vardiya"
                  onChange={(e) => setSelectedShiftId(e.target.value)}
                >
                  <MenuItem value="all">
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <PeopleIcon fontSize="small" color="primary" />
                      <span>Tüm Personeller ({employeeCount || 0} kişi)</span>
                    </Box>
                  </MenuItem>
                  {shifts.map(shift => (
                    <MenuItem key={shift.id} value={shift.id}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Box
                          sx={{
                            width: 14,
                            height: 14,
                            borderRadius: '50%',
                            bgcolor: shift.color || '#1976d2',
                            flexShrink: 0
                          }}
                        />
                        <span>{shift.name} ({shift.employee_count || 0} kişi)</span>
                      </Box>
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              {selectedShiftId !== 'all' && selectedEmployeeCount === 0 && (
                <Alert severity="warning" size="small">
                  Seçili vardiyada personel bulunmuyor!
                </Alert>
              )}
            </AccordionDetails>
          </Accordion>

          {/* Yürüme Mesafesi */}
          <Accordion sx={{ boxShadow: 'none', '&:before': { display: 'none' } }}>
            <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ minHeight: 40, '& .MuiAccordionSummary-content': { my: 0.5 } }}>
              <DirectionsWalkIcon sx={{ mr: 1, fontSize: 20 }} color="primary" />
              <Typography variant="body2" fontWeight="medium">Yürüme Mesafesi</Typography>
              <Chip label={`${maxWalkingDistance}m`} size="small" sx={{ ml: 'auto', mr: 1, height: 20 }} />
            </AccordionSummary>
            <AccordionDetails sx={{ pt: 0 }}>
              <Slider
                value={maxWalkingDistance}
                onChange={(e, val) => setMaxWalkingDistance(val)}
                min={50}
                max={500}
                step={25}
                marks={[
                  { value: 100, label: '100m' },
                  { value: 200, label: '200m' },
                  { value: 300, label: '300m' },
                  { value: 400, label: '400m' },
                ]}
                valueLabelDisplay="auto"
              />
              <Typography variant="caption" color="text.secondary">
                Personellerin durağa yürüyeceği maksimum mesafe
              </Typography>
            </AccordionDetails>
          </Accordion>

          {/* Filo Yapılandırması */}
          <Accordion sx={{ boxShadow: 'none', '&:before': { display: 'none' } }}>
            <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ minHeight: 40, '& .MuiAccordionSummary-content': { my: 0.5 } }}>
              <DirectionsBusIcon sx={{ mr: 1, fontSize: 20 }} color="primary" />
              <Typography variant="body2" fontWeight="medium">Filo Yapılandırması</Typography>
              <Chip 
                label={`${num16Seaters + num27Seaters} araç`} 
                size="small" 
                color={selectedCapacityStatus === 'sufficient' ? 'success' : selectedCapacityStatus === 'insufficient' ? 'error' : 'default'}
                sx={{ ml: 'auto', mr: 1, height: 20 }} 
              />
            </AccordionSummary>
            <AccordionDetails sx={{ pt: 0 }}>
              {selectedEmployeeCount > 0 && (
                <Alert 
                  severity="info" 
                  sx={{ mb: 2, py: 0 }}
                  action={
                    <Button 
                      color="inherit" 
                      size="small" 
                      onClick={() => {
                        setNum27Seaters(selectedRecommendedFleet.num27);
                        setNum16Seaters(selectedRecommendedFleet.num16);
                      }}
                    >
                      Uygula
                    </Button>
                  }
                >
                  <Typography variant="caption">
                    <strong>{selectedEmployeeCount}</strong> kişi için önerilen:
                    {selectedRecommendedFleet.num27 > 0 && ` ${selectedRecommendedFleet.num27}×27'lik`}
                    {selectedRecommendedFleet.num27 > 0 && selectedRecommendedFleet.num16 > 0 && ' +'}
                    {selectedRecommendedFleet.num16 > 0 && ` ${selectedRecommendedFleet.num16}×16'lık`}
                  </Typography>
                </Alert>
              )}

              <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
                <TextField
                  label="16 Kişilik"
                  type="number"
                  value={num16Seaters}
                  onChange={(e) => setNum16Seaters(parseInt(e.target.value) || 0)}
                  size="small"
                  inputProps={{ min: 0, max: 20 }}
                />
                <TextField
                  label="27 Kişilik"
                  type="number"
                  value={num27Seaters}
                  onChange={(e) => setNum27Seaters(parseInt(e.target.value) || 0)}
                  size="small"
                  inputProps={{ min: 0, max: 20 }}
                />
              </Box>

              <Alert 
                severity={selectedCapacityStatus === 'sufficient' ? 'success' : selectedCapacityStatus === 'insufficient' ? 'error' : 'info'}
                sx={{ py: 0 }}
              >
                <Typography variant="caption">
                  Kapasite: <strong>{totalCapacity}</strong>
                  {selectedEmployeeCount > 0 && (
                    selectedCapacityStatus === 'sufficient' 
                      ? ` ✓ ${selectedEmployeeCount} kişi için yeterli` 
                      : ` ✗ ${selectedEmployeeCount - totalCapacity} kişi taşınamaz`
                  )}
                </Typography>
              </Alert>

              <FormControl fullWidth size="small" sx={{ mt: 2 }}>
                <InputLabel>Öncelikli Araç Tipi</InputLabel>
                <Select
                  value={vehiclePriority}
                  label="Öncelikli Araç Tipi"
                  onChange={(e) => setVehiclePriority(e.target.value)}
                >
                  <MenuItem value="auto">🚌 Otomatik (En Verimli)</MenuItem>
                  <MenuItem value="large">🚌 27 Kişilik Öncelikli</MenuItem>
                  <MenuItem value="small">🚐 16 Kişilik Öncelikli</MenuItem>
                </Select>
              </FormControl>
            </AccordionDetails>
          </Accordion>

          {/* Trafik ve Rota */}
          <Accordion sx={{ boxShadow: 'none', '&:before': { display: 'none' } }}>
            <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ minHeight: 40, '& .MuiAccordionSummary-content': { my: 0.5 } }}>
              <TrafficIcon sx={{ mr: 1, fontSize: 20 }} color="primary" />
              <Typography variant="body2" fontWeight="medium">Trafik ve Rota</Typography>
              <Chip 
                label={trafficMode === 'none' ? 'Trafiksiz' : trafficMode === 'morning' ? '×1.4' : '×1.6'} 
                size="small" 
                sx={{ ml: 'auto', mr: 1, height: 20 }} 
              />
            </AccordionSummary>
            <AccordionDetails sx={{ pt: 0 }}>
              <FormControl fullWidth size="small" sx={{ mb: 2 }}>
                <InputLabel>Trafik Modu</InputLabel>
                <Select
                  value={trafficMode}
                  label="Trafik Modu"
                  onChange={(e) => setTrafficMode(e.target.value)}
                >
                  <MenuItem value="none">🚗 Trafiksiz</MenuItem>
                  <MenuItem value="morning">🌅 Sabah 08:00 (×1.4)</MenuItem>
                  <MenuItem value="evening">🌆 Akşam 18:00 (×1.6)</MenuItem>
                </Select>
              </FormControl>

              <FormControl fullWidth size="small" sx={{ mb: 2 }}>
                <InputLabel>Rota Tipi</InputLabel>
                <Select
                  value={routeType}
                  label="Rota Tipi"
                  onChange={(e) => setRouteType(e.target.value)}
                >
                  <MenuItem value="ring">🔄 Halka (Merkez → Duraklar → Merkez)</MenuItem>
                  <MenuItem value="to_home">🏠 Evlere Bırakma (İş Çıkışı)</MenuItem>
                  <MenuItem value="to_depot">🏢 Evlerden Toplama (İş Başı)</MenuItem>
                </Select>
              </FormControl>

              <FormControlLabel
                control={
                  <Switch
                    checked={excludeTolls}
                    onChange={(e) => setExcludeTolls(e.target.checked)}
                    size="small"
                  />
                }
                label={<Typography variant="body2">Ücretli Yolları Kullanma</Typography>}
              />
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', ml: 4 }}>
                {excludeTolls 
                  ? '⚠️ Köprü ve otoyol geçişleri hariç' 
                  : '✓ Tüm yollar kullanılabilir'}
              </Typography>

              <TextField
                label="Tampon Koltuk"
                type="number"
                value={bufferSeats}
                onChange={(e) => setBufferSeats(Math.max(0, Math.min(5, parseInt(e.target.value) || 0)))}
                size="small"
                fullWidth
                sx={{ mt: 2 }}
                inputProps={{ min: 0, max: 5 }}
                helperText="Her araçta boş bırakılacak koltuk (0-5)"
              />
            </AccordionDetails>
          </Accordion>

          {/* Seyahat Süresi */}
          <Accordion sx={{ boxShadow: 'none', '&:before': { display: 'none' } }}>
            <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ minHeight: 40, '& .MuiAccordionSummary-content': { my: 0.5 } }}>
              <AccessTimeIcon sx={{ mr: 1, fontSize: 20 }} color="primary" />
              <Typography variant="body2" fontWeight="medium">Seyahat Süresi</Typography>
              <Chip label={`${maxTravelTime} dk`} size="small" sx={{ ml: 'auto', mr: 1, height: 20 }} />
            </AccordionSummary>
            <AccordionDetails sx={{ pt: 0 }}>
              <Slider
                value={maxTravelTime}
                onChange={(e, val) => setMaxTravelTime(val)}
                min={15}
                max={120}
                step={5}
                marks={[
                  { value: 30, label: '30dk' },
                  { value: 65, label: '65dk' },
                  { value: 90, label: '90dk' },
                ]}
                valueLabelDisplay="auto"
              />
              <Typography variant="caption" color="text.secondary">
                Bir rotadaki ilk yolcu ile son yolcu arası maksimum süre
              </Typography>
            </AccordionDetails>
          </Accordion>

          {/* Butonlar */}
          <Box sx={{ mt: 2, px: 1 }}>
            <Button
              variant="contained"
              color="secondary"
              fullWidth
              onClick={handleOptimizeClick}
              disabled={loading || !systemStatus?.ready || !selectedEmployeeCount || selectedCapacityStatus === 'insufficient'}
              startIcon={loading ? <CircularProgress size={20} /> : <AddIcon />}
            >
              Yeni Simülasyon
            </Button>

            <Button
              variant="outlined"
              fullWidth
              onClick={onShowSimulationHistory}
              startIcon={<ListIcon />}
              sx={{ mt: 1 }}
            >
              Simülasyon Listesi
            </Button>
          </Box>
        </AccordionDetails>
      </Accordion>

      <Accordion>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <PlayArrowIcon sx={{ mr: 1 }} />
          <Typography>Animasyon Kontrolleri</Typography>
        </AccordionSummary>
        <AccordionDetails>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            <Button
              variant="contained"
              color="primary"
              onClick={animationPlaying ? onStopAnimation : onPlayAnimation}
              startIcon={animationPlaying ? <StopIcon /> : <PlayArrowIcon />}
              disabled={!optimizationResult}
            >
              {animationPlaying ? 'Durdur' : 'Oynat'}
            </Button>
            <Button
              variant="outlined"
              onClick={onResetAnimation}
              startIcon={<RefreshIcon />}
              disabled={!optimizationResult}
            >
              Sıfırla
            </Button>
          </Box>
          <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
            Servislerin optimize edilmiş rotalarını izleyin
          </Typography>
        </AccordionDetails>
      </Accordion>
    </Box>
  );
}

export default ControlPanel;
