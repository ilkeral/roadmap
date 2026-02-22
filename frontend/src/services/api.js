import axios from 'axios';

// Use relative URL when accessed via nginx reverse proxy
const API_BASE_URL = process.env.REACT_APP_API_URL || '';

const client = axios.create({
  baseURL: API_BASE_URL,
  timeout: 120000, // 2 minutes for optimization
  headers: {
    'Content-Type': 'application/json',
  },
});

export const api = {
  // Health check
  async healthCheck() {
    const response = await client.get('/health');
    return response.data;
  },

  // System status
  async getSystemStatus() {
    const response = await client.get('/api/optimization/status');
    return response.data;
  },

  // Employees
  async getEmployees(skip = 0, limit = 100) {
    const response = await client.get('/api/employees/', {
      params: { skip, limit }
    });
    return response.data;
  },

  async getEmployeeCount() {
    const response = await client.get('/api/employees/count');
    return response.data;
  },

  async generateEmployees(params) {
    const response = await client.post('/api/employees/generate', params);
    return response.data;
  },

  async deleteAllEmployees() {
    const response = await client.delete('/api/employees/');
    return response.data;
  },

  async createEmployee(name, lat, lng, address = null, photoUrl = null) {
    const response = await client.post('/api/employees/', {
      name,
      home_location: { lat, lng },
      address,
      photo_url: photoUrl
    });
    return response.data;
  },

  async uploadEmployeePhoto(employeeId, file) {
    const formData = new FormData();
    formData.append('file', file);
    
    const response = await client.post(`/api/employees/${employeeId}/photo`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },

  async deleteEmployee(employeeId) {
    const response = await client.delete(`/api/employees/${employeeId}`);
    return response.data;
  },

  async updateEmployeeCoordinates(employeeId, lat, lng) {
    const response = await client.put(`/api/employees/${employeeId}/coordinates`, null, {
      params: { lat, lng }
    });
    return response.data;
  },

  async geocodeAddress(address) {
    const response = await client.post('/api/employees/geocode-address', null, {
      params: { address }
    });
    return response.data;
  },

  async geocodeEmployeeAddress(employeeId, address) {
    const response = await client.put(`/api/employees/${employeeId}/geocode`, null, {
      params: { address }
    });
    return response.data;
  },

  async uploadEmployeesExcel(file) {
    const formData = new FormData();
    formData.append('file', file);
    
    const response = await client.post('/api/employees/upload-excel', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      timeout: 300000, // 5 minutes for large files with geocoding
    });
    return response.data;
  },

  async getExcelTemplate() {
    const response = await client.get('/api/employees/template');
    return response.data;
  },

  // Stops
  async getStops(skip = 0, limit = 100) {
    const response = await client.get('/api/stops/', {
      params: { skip, limit }
    });
    return response.data;
  },

  async deleteAllStops() {
    const response = await client.delete('/api/stops/');
    return response.data;
  },

  // Optimization
  async runOptimization(params) {
    const response = await client.post('/api/optimization/run', params);
    return response.data;
  },

  async getOptimizationResults() {
    const response = await client.get('/api/optimization/results');
    return response.data;
  },

  async getOptimizationResult(id) {
    const response = await client.get(`/api/optimization/results/${id}`);
    return response.data;
  },

  async getVehicles() {
    const response = await client.get('/api/optimization/vehicles');
    return response.data;
  },

  // Routes
  async getRoutes() {
    const response = await client.get('/api/routes/');
    return response.data;
  },

  async calculateRoute(stopIds) {
    const response = await client.post('/api/routes/calculate', stopIds);
    return response.data;
  },

  // Simulation
  async getSimulationData() {
    const response = await client.get('/api/simulation/data');
    return response.data;
  },

  async getMapBounds() {
    const response = await client.get('/api/simulation/bounds');
    return response.data;
  },

  async getRouteColors() {
    const response = await client.get('/api/simulation/colors');
    return response.data;
  },

  async getAnimationFrames(routeData, frameCount = 100) {
    const response = await client.get('/api/simulation/animation-frames', {
      params: {
        route_data: JSON.stringify(routeData),
        frame_count: frameCount
      }
    });
    return response.data;
  },

  // Settings - Center/Depot
  async getCenterSettings() {
    const response = await client.get('/api/settings/center');
    return response.data;
  },

  async updateCenterSettings(settings) {
    const response = await client.put('/api/settings/center', settings);
    return response.data;
  },

  // General Settings
  async getGeneralSettings() {
    const response = await client.get('/api/settings/general');
    return response.data;
  },

  async updateGeneralSettings(settings) {
    const response = await client.put('/api/settings/general', settings);
    return response.data;
  },

  // Simulations
  async createSimulation(params) {
    const response = await client.post('/api/simulations/', params);
    return response.data;
  },

  async getSimulations(skip = 0, limit = 50) {
    const response = await client.get('/api/simulations/', {
      params: { skip, limit }
    });
    return response.data;
  },

  async getSimulation(id) {
    const response = await client.get(`/api/simulations/${id}`);
    return response.data;
  },

  async deleteSimulation(id) {
    const response = await client.delete(`/api/simulations/${id}`);
    return response.data;
  },

  async updateRouteStops(simulationId, routeId, stops) {
    const response = await client.put(`/api/simulations/${simulationId}/routes/${routeId}`, {
      stops: stops.map((s, index) => ({
        stop_index: s.stopIndex !== undefined ? s.stopIndex : index,
        lat: s.lat,
        lng: s.lng
      }))
    });
    return response.data;
  },

  async previewRouteUpdate(simulationId, routeId, stops) {
    const response = await client.post(`/api/simulations/${simulationId}/routes/${routeId}/preview`, {
      stops: stops.map((s, index) => ({
        stop_index: s.stopIndex !== undefined ? s.stopIndex : index,
        lat: s.lat,
        lng: s.lng
      }))
    });
    return response.data;
  },

  async previewRouteReorder(simulationId, routeId, firstStopIndex) {
    const response = await client.post(`/api/simulations/${simulationId}/routes/${routeId}/reorder/preview`, {
      first_stop_index: firstStopIndex
    });
    return response.data;
  },

  async previewAddEmployee(simulationId, routeId, employeeId) {
    const response = await client.post(
      `/api/simulations/${simulationId}/routes/${routeId}/add-employee/preview`,
      { employee_id: employeeId }
    );
    return response.data;
  },

  async addEmployeeToRoute(simulationId, routeId, employeeId) {
    const response = await client.post(
      `/api/simulations/${simulationId}/routes/${routeId}/add-employee`,
      { employee_id: employeeId }
    );
    return response.data;
  },

  async previewRemoveEmployee(simulationId, routeId, employeeId) {
    const response = await client.post(
      `/api/simulations/${simulationId}/routes/${routeId}/remove-employee/preview`,
      { employee_id: employeeId }
    );
    return response.data;
  },

  async removeEmployeeFromRoute(simulationId, routeId, employeeId) {
    const response = await client.post(
      `/api/simulations/${simulationId}/routes/${routeId}/remove-employee`,
      { employee_id: employeeId }
    );
    return response.data;
  },

  async reorderRouteStops(simulationId, routeId, firstStopIndex) {
    const response = await client.post(`/api/simulations/${simulationId}/routes/${routeId}/reorder`, {
      first_stop_index: firstStopIndex
    });
    return response.data;
  },

  async reoptimizeRoute(simulationId, routeId) {
    const response = await client.post(`/api/simulations/${simulationId}/routes/${routeId}/reoptimize`);
    return response.data;
  },

  async measureDistance(points) {
    const response = await client.post('/api/routes/measure', {
      points: points.map(p => ({ lat: p.lat, lng: p.lng }))
    });
    return response.data;
  },

  // Shifts (Vardiyalar)
  async getShifts() {
    const response = await client.get('/api/shifts/');
    return response.data;
  },

  async createShift(name, color = '#1976d2', startTime = null, endTime = null) {
    const response = await client.post('/api/shifts/', {
      name,
      color,
      start_time: startTime,
      end_time: endTime
    });
    return response.data;
  },

  async updateShift(shiftId, data) {
    const response = await client.put(`/api/shifts/${shiftId}`, data);
    return response.data;
  },

  async deleteShift(shiftId) {
    const response = await client.delete(`/api/shifts/${shiftId}`);
    return response.data;
  },

  async updateEmployeeShift(employeeId, shiftId) {
    const response = await client.put(`/api/employees/${employeeId}/shift`, null, {
      params: { shift_id: shiftId }
    });
    return response.data;
  },

  async assignEmployeesToShift(shiftId, employeeIds) {
    const response = await client.put(`/api/shifts/${shiftId}/assign-employees`, employeeIds);
    return response.data;
  }
};

export default api;
