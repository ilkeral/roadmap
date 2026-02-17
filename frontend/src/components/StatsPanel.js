import React from 'react';
import { Box, Chip, Tooltip } from '@mui/material';
import PeopleIcon from '@mui/icons-material/People';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import RouteIcon from '@mui/icons-material/Route';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';

function StatsPanel({ employees, stops, routes, systemStatus }) {
  return (
    <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
      <Tooltip title="Personeller">
        <Chip
          icon={<PeopleIcon />}
          label={employees}
          size="small"
          color="primary"
          variant="outlined"
          sx={{ color: 'white', borderColor: 'rgba(255,255,255,0.5)' }}
        />
      </Tooltip>
      
      <Tooltip title="Rotalar">
        <Chip
          icon={<RouteIcon />}
          label={routes}
          size="small"
          variant="outlined"
          sx={{ color: 'white', borderColor: 'rgba(255,255,255,0.5)' }}
        />
      </Tooltip>

      {systemStatus && (
        <Tooltip title={systemStatus.osrm_available ? 'OSRM Bağlı' : 'OSRM Kullanılamıyor'}>
          {systemStatus.osrm_available ? (
            <CheckCircleIcon sx={{ color: '#4caf50' }} />
          ) : (
            <ErrorIcon sx={{ color: '#ff9800' }} />
          )}
        </Tooltip>
      )}
    </Box>
  );
}

export default StatsPanel;
