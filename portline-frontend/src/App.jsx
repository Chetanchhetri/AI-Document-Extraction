import { useEffect, useState } from 'react';
import { Navigate, NavLink, Outlet, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { Activity, ArrowLeftRight, Boxes, CloudUpload, LogOut, Moon, ScanSearch, Sparkles, Sun, Users as UsersIcon } from 'lucide-react';
import { api } from './api.js';
import { useAuth } from './auth.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Intake from './pages/Intake.jsx';
import Review from './pages/Review.jsx';
import Audit from './pages/Audit.jsx';
import UsersPage from './pages/Users.jsx';
import NewSection from './pages/NewSection.jsx';
import CompareWorkspace from './pages/CompareWorkspace.jsx';

export const useTheme = () => {
  const [t, setT] = useState(document.documentElement.dataset.theme);
  const toggle = () => { const n = t === 'dark' ? 'light' : 'dark'; document.documentElement.dataset.theme = n; localStorage.setItem('theme', n); setT(n); };
  return [t, toggle];
};

export const Brand = () => <div className="brand"><span className="logo">P</span><div><b>PORTLINE</b><small>Customs intelligence</small></div></div>;

const CRUMB = {
  '/': 'Shipments',
  '/intake': 'Document intake',
  '/review': 'Review workspace',
  '/copilot': 'AI Copilot',
  '/compare': 'Compare & Analyze',
  '/audit': 'Audit & accuracy',
  '/users': 'Team access'
};

function Shell() {
  const { user, ready, logout, isAdmin, isManager } = useAuth();
  const [theme, toggle] = useTheme(); 
  const [live, setLive] = useState(null);
  const nav = useNavigate(); 
  const loc = useLocation();

  useEffect(() => { 
    const ping = () => api.health().then(() => setLive(true)).catch(() => setLive(false)); 
    ping(); 
    const i = setInterval(ping, 30000); 
    return () => clearInterval(i); 
  }, []);

  if (!ready) return <div className="boot">Loading workspace…</div>;
  if (!user) return <Navigate to="/login" replace />;

  const links = [
    ['/', 'Shipments', Boxes],
    ['/intake', 'Document intake', CloudUpload],
    ['/review', 'Review workspace', ScanSearch],
    ['/copilot', 'AI Copilot', Sparkles],
    ['/compare', 'Compare & Analyze', ArrowLeftRight],
    ...(isManager ? [['/audit', 'Audit & accuracy', Activity]] : []),
    ...(isAdmin ? [['/users', 'Team access', UsersIcon]] : [])
  ];

  const base = '/' + loc.pathname.split('/')[1];

  return (
    <div className="shell">
      <aside>
        <Brand />
        <nav aria-label="Primary">
          <small className="navh">Operations</small>
          {links.map(([to, name, Icon]) => (
            <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => (isActive ? 'on' : '')}>
              <Icon size={16} />{name}
            </NavLink>
          ))}
        </nav>
        <div className={'live ' + (live === false ? 'down' : '')}>
          <i />{live === null ? 'Checking API…' : live ? 'API operational' : 'API unreachable'}
        </div>
      </aside>
      <div className="main">
        <header className="top">
          <span className="crumb">Portline <i>/</i> <b>{CRUMB[base] ?? ''}</b></span>
          <input className="search" placeholder="Search shipment or supplier, press Enter" onKeyDown={(e) => e.key === 'Enter' && nav('/?q=' + encodeURIComponent(e.target.value))} aria-label="Search shipments" />
          <button className="ghost" onClick={toggle}>
            {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
            {theme === 'dark' ? 'Light' : 'Dark'}
          </button>
          <div className="who">
            <span className="avatar">{(user.full_name || user.email)[0].toUpperCase()}</span>
            <div><b>{user.full_name || user.email}</b><small>{user.role?.replace('_', ' ')}</small></div>
          </div>
          <button className="icon" onClick={async () => { await logout(); nav('/login'); }} title="Sign out" aria-label="Sign out">
            <LogOut size={16} />
          </button>
        </header>
        <main key={loc.pathname}><Outlet /></main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<Shell />}>
        <Route index element={<Dashboard />} />
        <Route path="intake" element={<Intake />} />
        <Route path="review" element={<Review />} />
        <Route path="review/:id" element={<Review />} />
        <Route path="copilot" element={<NewSection />} />
        <Route path="compare" element={<CompareWorkspace />} />
        <Route path="audit" element={<Audit />} />
        <Route path="users" element={<UsersPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}