import React, { useState, useRef } from 'react';
import {
  Box,
  Button,
  Typography,
  Alert,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Chip,
  Divider,
  LinearProgress
} from '@mui/material';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import WarningIcon from '@mui/icons-material/Warning';
import DescriptionIcon from '@mui/icons-material/Description';
import InfoIcon from '@mui/icons-material/Info';

function ExcelUpload({ onUploadComplete, loading, setLoading }) {
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef(null);

  const handleFileSelect = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    // Validate file type
    const fileName = file.name.toLowerCase();
    if (!fileName.endsWith('.xlsx') && !fileName.endsWith('.xls') && !fileName.endsWith('.csv')) {
      setError('Sadece Excel (.xlsx, .xls) veya CSV (.csv) dosyaları kabul edilir');
      return;
    }

    setError(null);
    setResult(null);
    setUploading(true);
    setUploadProgress(10);
    setLoading(true);

    try {
      // Import api dynamically to avoid circular imports
      const { api } = await import('../services/api');
      
      // Simulate progress while geocoding (actual progress is unknown)
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => {
          if (prev < 90) return prev + 5;
          return prev;
        });
      }, 2000);

      const response = await api.uploadEmployeesExcel(file);
      
      clearInterval(progressInterval);
      setUploadProgress(100);
      setResult(response);
      setDialogOpen(true);
      
      if (response.imported > 0 && onUploadComplete) {
        onUploadComplete(response);
      }
    } catch (err) {
      setError(err.response?.data?.detail || err.message || 'Yükleme hatası');
    } finally {
      setUploading(false);
      setLoading(false);
      setUploadProgress(0);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleButtonClick = () => {
    fileInputRef.current?.click();
  };

  const handleCloseDialog = () => {
    setDialogOpen(false);
  };

  return (
    <Box sx={{ mt: 2 }}>
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        onChange={handleFileSelect}
        style={{ display: 'none' }}
      />
      
      <Button
        variant="outlined"
        fullWidth
        onClick={handleButtonClick}
        disabled={loading || uploading}
        startIcon={uploading ? <CircularProgress size={20} /> : <CloudUploadIcon />}
        sx={{ mb: 1 }}
      >
        {uploading ? 'Yükleniyor...' : 'Excel/CSV Dosyası Yükle'}
      </Button>

      {uploading && (
        <Box sx={{ width: '100%', mb: 1 }}>
          <LinearProgress variant="determinate" value={uploadProgress} />
          <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
            Adresler koordinatlara çevriliyor... Bu işlem biraz zaman alabilir.
          </Typography>
        </Box>
      )}

      {error && (
        <Alert severity="error" sx={{ mb: 1 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <Box sx={{ 
        p: 1.5, 
        backgroundColor: '#f5f5f5', 
        borderRadius: 1, 
        border: '1px dashed #ccc' 
      }}>
        <Typography variant="caption" color="text.secondary" display="block">
          <InfoIcon sx={{ fontSize: 14, verticalAlign: 'middle', mr: 0.5 }} />
          Excel dosyasında <strong>isim</strong> ve <strong>adres</strong> sütunları olmalıdır.
        </Typography>
        <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
          Adresler otomatik olarak koordinatlara çevrilir.
        </Typography>
      </Box>

      {/* Results Dialog */}
      <Dialog open={dialogOpen} onClose={handleCloseDialog} maxWidth="sm" fullWidth>
        <DialogTitle>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <DescriptionIcon color="primary" />
            Excel Yükleme Sonucu
          </Box>
        </DialogTitle>
        <DialogContent>
          {result && (
            <>
              {/* Summary Chips */}
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
                <Chip
                  icon={<CheckCircleIcon />}
                  label={`${result.imported} Eklendi`}
                  color="success"
                  variant="outlined"
                />
                {result.skipped > 0 && (
                  <Chip
                    icon={<WarningIcon />}
                    label={`${result.skipped} Mükerrer`}
                    color="warning"
                    variant="outlined"
                  />
                )}
                {result.geocode_failed > 0 && (
                  <Chip
                    icon={<ErrorIcon />}
                    label={`${result.geocode_failed} Konum Bulunamadı`}
                    color="error"
                    variant="outlined"
                  />
                )}
              </Box>

              <Typography variant="body2" gutterBottom>
                Toplam işlenen: <strong>{result.total_processed}</strong> kayıt
              </Typography>

              {/* Geocode failures */}
              {result.geocode_failed_details?.length > 0 && (
                <>
                  <Divider sx={{ my: 2 }} />
                  <Typography variant="subtitle2" color="error" gutterBottom>
                    Koordinatı Bulunamayan Adresler:
                  </Typography>
                  <List dense>
                    {result.geocode_failed_details.slice(0, 5).map((item, index) => (
                      <ListItem key={index}>
                        <ListItemIcon>
                          <ErrorIcon color="error" fontSize="small" />
                        </ListItemIcon>
                        <ListItemText
                          primary={item.name}
                          secondary={item.address}
                        />
                      </ListItem>
                    ))}
                  </List>
                  {result.geocode_failed_details.length > 5 && (
                    <Typography variant="caption" color="text.secondary">
                      ... ve {result.geocode_failed_details.length - 5} kayıt daha
                    </Typography>
                  )}
                </>
              )}

              {/* Success message */}
              {result.imported > 0 && (
                <Alert severity="success" sx={{ mt: 2 }}>
                  {result.imported} çalışan başarıyla eklendi!
                </Alert>
              )}
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog} variant="contained">
            Tamam
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default ExcelUpload;
