import React, { useState, useEffect } from 'react';
import { ChakraProvider, extendTheme, Box, Flex } from '@chakra-ui/react';
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
  useLocation
} from 'react-router-dom';
import axios from 'axios';

import SidebarComponent from './Sidebar';
import Login from './Login';
import Dashboard from './Dashboard';
import ReceptionistDashboard from './ReceptionistDashboard';
import DoctorSchedulePage from "./DoctorSchedulePage";
import AdminDashboard from './AdminDashboard';
import MedicalCounterDashboard from './MedicalCounterDashboard';
import DoctorsDashboard from './DoctorsDashboard';
import AddMedicine from './AddMedicine';
import InventoryList from './InventoryList';
import LabTest from './LabTest';
import AllPatients from './AllPatients';

const theme = extendTheme({
  fonts: {
    heading: `'Inter', sans-serif`,
    body: `'Inter', sans-serif`,
  },
  colors: {
    brand: {
      50: '#e3f2ff',
      100: '#b3daff',
      200: '#81c0ff',
      300: '#4ea6ff',
      400: '#1b8cff',
      500: '#006fe6',
      600: '#0053b4',
      700: '#003782',
      800: '#001c51',
      900: '#000221',
    },
  },
});

// This component is rendered within the Router so that useLocation works.
function AppContent({ isLoggedIn, username, role, handleLogout, onLogin }) {
  const location = useLocation();
  // Hide the sidebar if the user is not logged in or if the current route is "/login"
  const hideSidebar = !isLoggedIn || location.pathname === '/login';

  return (
    <Flex minH="100vh" w="100%" bg="gray.50">
      {/* Render the sidebar only if the user is logged in, not on /login, and not when role is 'admin' (admin dashboard includes its own sidebar) */}
      {!hideSidebar && role !== 'admin' && role !== 'receptionist' && (
        <SidebarComponent
          isLoggedIn={isLoggedIn}
          username={username}
          role={role}
          onLogout={handleLogout}
        />
      )}

      <Box flex="1" overflow="auto">
        <Routes>
          <Route
            path="/login"
            element={
              !isLoggedIn ? (
                <Login onLogin={onLogin} />
              ) : (
                <Navigate to="/dashboard" />
              )
            }
          />
          <Route
            path="/dashboard"
            element={
              isLoggedIn ? <Dashboard role={role} /> : <Navigate to="/login" />
            }
          />
          <Route
            path="/receptionist"
            element={
              isLoggedIn && role === 'receptionist' ? (
                <ReceptionistDashboard />
              ) : (
                <Navigate to="/login" />
              )
            }
          />
          <Route path="/" element={<ReceptionistDashboard />} />
          <Route path="/schedule" element={<DoctorSchedulePage />} />
          <Route
            path="/doctor"
            element={
              isLoggedIn && role === 'doctor' ? (
                <DoctorsDashboard />
              ) : (
                <Navigate to="/login" />
              )
            }
          />
          <Route
            path="/doctor/all-patients"
            element={
              isLoggedIn && role === 'doctor' ? (
                <AllPatients />
              ) : (
                <Navigate to="/login" />
              )
            }
          />
          {/* Admin uses its own full-screen layout (with its built-in sidebar) */}
          <Route
            path="/admin/*"
            element={
              isLoggedIn && role === 'admin' ? (
                <AdminDashboard username={username} onLogout={handleLogout} />
              ) : (
                <Navigate to="/login" />
              )
            }
          />
          <Route
            path="/medical_counter"
            element={
              isLoggedIn && role === 'medical_store' ? (
                <MedicalCounterDashboard />
              ) : (
                <Navigate to="/login" />
              )
            }
          />
          <Route
            path="/lab"
            element={
              isLoggedIn && role === 'lab_staff' ? (
                <LabTest />
              ) : (
                <Navigate to="/login" />
              )
            }
          />
          <Route
            path="/add-medicine"
            element={
              isLoggedIn && role === 'medical_store' ? (
                <AddMedicine />
              ) : (
                <Navigate to="/dashboard" />
              )
            }
          />
          <Route
            path="/inventory"
            element={
              isLoggedIn && role === 'medical_store' ? (
                <InventoryList />
              ) : (
                <Navigate to="/dashboard" />
              )
            }
          />
          {/* Catch-all route */}
          <Route
            path="*"
            element={<Navigate to={isLoggedIn ? '/dashboard' : '/login'} />}
          />
        </Routes>
      </Box>
    </Flex>
  );
}

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [username, setUsername] = useState('');
  const [role, setRole] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('token');
    const user = localStorage.getItem('username');
    const userRole = localStorage.getItem('role');
    const session = localStorage.getItem('session_id');

    if (token && user && userRole && session) {
      setIsLoggedIn(true);
      setUsername(user);
      setRole(userRole);
      setSessionId(session);
    }
    setLoading(false);
  }, []);

  // Called from Login.js when login is successful.
  const handleLogin = (user, userRole, session) => {
    setIsLoggedIn(true);
    setUsername(user);
    setRole(userRole);
    setSessionId(session);
  };

  const handleLogout = async () => {
    try {
      const token = localStorage.getItem('token');
      const session_id = localStorage.getItem('session_id');
      if (!token || !session_id) return;

      await axios.post(
        'http://localhost:5000/logout',
        { session_id },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      localStorage.clear();
      setIsLoggedIn(false);
      setUsername('');
      setRole('');
      setSessionId('');
    } catch (err) {
      console.error('Logout failed:', err);
    }
  };

  if (loading) {
    return <div>Loading...</div>;
  }

  return (
    <ChakraProvider theme={theme}>
      <Router>
        <AppContent
          isLoggedIn={isLoggedIn}
          username={username}
          role={role}
          handleLogout={handleLogout}
          onLogin={handleLogin}
        />
      </Router>
    </ChakraProvider>
  );
}

export default App;
