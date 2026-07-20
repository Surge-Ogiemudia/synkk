import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Login from '@/screens/Login';
import DashboardLayout from '@/screens/DashboardLayout';
import PsxWebTab from '@/screens/tabs/PsxWebTab';
import PosTab from '@/screens/tabs/PosTab';
import EmrTab from '@/screens/tabs/EmrTab';
import DispensaryTab from '@/screens/tabs/DispensaryTab';
import StaffTab from '@/screens/tabs/StaffTab';
import OrdersAndLeadsTab from '@/screens/tabs/OrdersAndLeadsTab';
import SourceTab from '@/screens/tabs/SourceTab';
import { auth } from '@/lib/auth';

function RequireSession({ children }: { children: React.ReactElement }) {
  if (!auth.hasSession()) {
    return <Navigate to="/" replace />;
  }
  return children;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route
          path="/dashboard"
          element={
            <RequireSession>
              <DashboardLayout />
            </RequireSession>
          }
        >
          <Route index element={<PsxWebTab />} />
          <Route path="pos" element={<PosTab />} />
          <Route path="emr" element={<EmrTab />} />
          <Route path="dispensary" element={<DispensaryTab />} />
          <Route path="staff" element={<StaffTab />} />
          <Route path="orders" element={<OrdersAndLeadsTab />} />
          <Route path="source" element={<SourceTab />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
