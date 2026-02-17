import React, { useState } from 'react';
import {
  Box,
  Card,
  CardContent,
  TextField,
  Button,
  Typography,
  Alert,
  InputAdornment,
  IconButton,
  CircularProgress
} from '@mui/material';
import DirectionsBusIcon from '@mui/icons-material/DirectionsBus';
import PersonIcon from '@mui/icons-material/Person';
import LockIcon from '@mui/icons-material/Lock';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';

function LoginPage({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Demo kullanıcılar
  const validUsers = [
    { username: 'admin', password: 'admin123', role: 'admin' },
    { username: 'user', password: 'user123', role: 'user' },
    { username: 'demo', password: 'demo', role: 'user' }
  ];

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 800));

    const user = validUsers.find(
      u => u.username === username && u.password === password
    );

    if (user) {
      // Başarılı giriş
      const userData = {
        username: user.username,
        role: user.role,
        loginTime: new Date().toISOString()
      };
      localStorage.setItem('shuttleUser', JSON.stringify(userData));
      onLogin(userData);
    } else {
      setError('Geçersiz kullanıcı adı veya şifre');
    }

    setLoading(false);
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #1976d2 0%, #1565c0 50%, #0d47a1 100%)',
        padding: 2
      }}
    >
      <Card 
        sx={{ 
          maxWidth: 420, 
          width: '100%',
          borderRadius: 3,
          boxShadow: '0 8px 32px rgba(0,0,0,0.2)'
        }}
      >
        <CardContent sx={{ p: 4 }}>
          {/* Logo ve Başlık */}
          <Box sx={{ textAlign: 'center', mb: 4 }}>
            <Box
              sx={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 80,
                height: 80,
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #1976d2 0%, #1565c0 100%)',
                mb: 2,
                boxShadow: '0 4px 14px rgba(25, 118, 210, 0.4)'
              }}
            >
              <DirectionsBusIcon sx={{ fontSize: 40, color: 'white' }} />
            </Box>
            <Typography variant="h5" component="h1" fontWeight="bold" gutterBottom>
              Servis Rota Optimizasyonu
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Personel servis yönetim sistemi
            </Typography>
          </Box>

          {/* Hata Mesajı */}
          {error && (
            <Alert severity="error" sx={{ mb: 3 }}>
              {error}
            </Alert>
          )}

          {/* Login Form */}
          <form onSubmit={handleSubmit}>
            <TextField
              fullWidth
              label="Kullanıcı Adı"
              variant="outlined"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              margin="normal"
              required
              autoComplete="username"
              autoFocus
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <PersonIcon color="action" />
                  </InputAdornment>
                ),
              }}
            />

            <TextField
              fullWidth
              label="Şifre"
              type={showPassword ? 'text' : 'password'}
              variant="outlined"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              margin="normal"
              required
              autoComplete="current-password"
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <LockIcon color="action" />
                  </InputAdornment>
                ),
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      onClick={() => setShowPassword(!showPassword)}
                      edge="end"
                    >
                      {showPassword ? <VisibilityOffIcon /> : <VisibilityIcon />}
                    </IconButton>
                  </InputAdornment>
                ),
              }}
            />

            <Button
              type="submit"
              fullWidth
              variant="contained"
              size="large"
              disabled={loading || !username || !password}
              sx={{ 
                mt: 3, 
                mb: 2,
                py: 1.5,
                borderRadius: 2,
                textTransform: 'none',
                fontSize: '1rem',
                fontWeight: 'bold'
              }}
            >
              {loading ? (
                <CircularProgress size={24} color="inherit" />
              ) : (
                'Giriş Yap'
              )}
            </Button>
          </form>

          {/* Demo Bilgileri */}
          <Box 
            sx={{ 
              mt: 3, 
              p: 2, 
              backgroundColor: '#f5f5f5', 
              borderRadius: 2,
              border: '1px dashed #ccc'
            }}
          >
            <Typography variant="caption" color="text.secondary" display="block" gutterBottom>
              Demo Kullanıcılar:
            </Typography>
            <Typography variant="caption" color="text.secondary" component="div">
              • admin / admin123 (Yönetici)
            </Typography>
            <Typography variant="caption" color="text.secondary" component="div">
              • user / user123 (Kullanıcı)
            </Typography>
            <Typography variant="caption" color="text.secondary" component="div">
              • demo / demo (Demo)
            </Typography>
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
}

export default LoginPage;
