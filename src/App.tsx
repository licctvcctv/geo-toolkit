/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { DataProvider } from './context/DataContext';
import Navbar from './components/Navbar';
import ProtectedRoute from './components/ProtectedRoute';

import Home from './pages/Home';
import Thermometer from './pages/Thermometer';
import BiotiteThermometer from './pages/BiotiteThermometer';
import MineralIdentification from './pages/MineralIdentification';
import Visualization from './pages/Visualization';
import Login from './pages/Login';
import Register from './pages/Register';

export default function App() {
  return (
    <AuthProvider>
      <DataProvider>
      <Router>
        <div className="min-h-screen bg-slate-50 font-sans text-slate-900">
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            
            <Route element={
              <>
                <Navbar />
                <ProtectedRoute />
              </>
            }>
              <Route path="/" element={<Home />} />
              <Route path="/thermometer" element={<Thermometer />} />
              <Route path="/biotite-thermometer" element={<BiotiteThermometer />} />
              <Route path="/identification" element={<MineralIdentification />} />
              <Route path="/visualization" element={<Visualization />} />
            </Route>
          </Routes>
        </div>
      </Router>
      </DataProvider>
    </AuthProvider>
  );
}
