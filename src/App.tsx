/* ==========================================================================
 * PayKal — routage SPA (client + administration)
 * --------------------------------------------------------------------------
 * Toutes ces routes fonctionnent en accès direct (F5 / lien partagé) grâce à
 * la règle Netlify `/* /index.html 200` (fichier public/_redirects) et au
 * repli de navigation du Service Worker.
 * ========================================================================== */

import { Suspense, lazy } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { FullScreenLoader, RedirectIfAuthenticated, RequireAuth } from './components/RequireAuth'
import { SessionProvider } from './context/SessionContext'
import { ToastProvider } from './context/ToastContext'

/* Espace public */
const Login = lazy(() => import('./pages/Login'))
const Register = lazy(() => import('./pages/Register'))

/* Espace client */
const ClientHome = lazy(() => import('./pages/ClientHome'))
const Recharge = lazy(() => import('./pages/Recharge'))
const Transactions = lazy(() => import('./pages/Transactions'))
const ClientMessages = lazy(() => import('./pages/ClientMessages'))
const Profile = lazy(() => import('./pages/Profile'))

/* Espace administration */
const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard'))
const AdminTransactions = lazy(() => import('./pages/admin/AdminTransactions'))
const AdminMessages = lazy(() => import('./pages/admin/AdminMessages'))
const AdminClients = lazy(() => import('./pages/admin/AdminClients'))

/* Outils */
const Diagnostics = lazy(() => import('./pages/Diagnostics'))
const NotFound = lazy(() => import('./pages/NotFound'))

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <SessionProvider>
          <Suspense fallback={<FullScreenLoader message="Chargement de la page…" />}>
            <Routes>
              {/* ------------------------- Public ------------------------- */}
              <Route
                path="/connexion"
                element={
                  <RedirectIfAuthenticated>
                    <Login />
                  </RedirectIfAuthenticated>
                }
              />
              <Route
                path="/login"
                element={
                  <RedirectIfAuthenticated>
                    <Login />
                  </RedirectIfAuthenticated>
                }
              />
              <Route
                path="/inscription"
                element={
                  <RedirectIfAuthenticated>
                    <Register />
                  </RedirectIfAuthenticated>
                }
              />
              <Route
                path="/register"
                element={
                  <RedirectIfAuthenticated>
                    <Register />
                  </RedirectIfAuthenticated>
                }
              />

              {/* --------------------- Espace client ---------------------- */}
              <Route
                path="/"
                element={
                  <RequireAuth role="client">
                    <ClientHome />
                  </RequireAuth>
                }
              />
              <Route
                path="/recharger"
                element={
                  <RequireAuth role="client">
                    <Recharge />
                  </RequireAuth>
                }
              />
              <Route
                path="/recharge"
                element={<Navigate to="/recharger" replace />}
              />
              <Route
                path="/transactions"
                element={
                  <RequireAuth role="client">
                    <Transactions />
                  </RequireAuth>
                }
              />
              <Route
                path="/messages"
                element={
                  <RequireAuth role="client">
                    <ClientMessages />
                  </RequireAuth>
                }
              />
              <Route
                path="/profil"
                element={
                  <RequireAuth role="client">
                    <Profile />
                  </RequireAuth>
                }
              />

              {/* ----------------- Espace administration ----------------- */}
              <Route
                path="/admin"
                element={
                  <RequireAuth role="admin">
                    <AdminDashboard />
                  </RequireAuth>
                }
              />
              <Route
                path="/admin/transactions"
                element={
                  <RequireAuth role="admin">
                    <AdminTransactions />
                  </RequireAuth>
                }
              />
              <Route
                path="/admin/messages"
                element={
                  <RequireAuth role="admin">
                    <AdminMessages />
                  </RequireAuth>
                }
              />
              <Route
                path="/admin/clients"
                element={
                  <RequireAuth role="admin">
                    <AdminClients />
                  </RequireAuth>
                }
              />

              {/* --------------------- Outils / erreurs ------------------- */}
              <Route path="/diagnostic" element={<Diagnostics />} />
              <Route path="/404" element={<NotFound />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </SessionProvider>
      </ToastProvider>
    </BrowserRouter>
  )
}
