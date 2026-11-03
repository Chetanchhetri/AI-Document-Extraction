import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as Accordion from '@radix-ui/react-accordion'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import * as Tabs from '@radix-ui/react-tabs'
import {
  Activity, AlertCircle, AlertTriangle, Archive, ArrowDownUp, ArrowLeft, ArrowRight,
  ArrowUpRight, BadgeCheck, Bell, BookOpen, Boxes, Building2, Check, CheckCheck,
  CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, ChevronsUpDown, CircleHelp,
  Clock3, CloudUpload, Code2, Command, Download, Eye, EyeOff, FileCheck2, FileClock,
  FileImage, FileSpreadsheet, FileText, Filter, Fingerprint, Gauge, Globe2, HardDrive,
  History, House, KeyRound, Layers3, LayoutDashboard, LifeBuoy, ListFilter, Loader2,
  LockKeyhole, LogOut, Menu, MoreHorizontal, Move, Network, Package, PanelLeftClose,
  PanelLeftOpen, Pencil, Plus, RefreshCw, RotateCcw, Search, Server, Settings2,
  Shield, ShieldAlert, ShieldCheck, SlidersHorizontal, Sparkles, Split, Sun, Moon, Table2,
  Trash2, Truck, Upload, UserCog, UserPlus, Users, WandSparkles, X, ZoomIn, ZoomOut,
} from 'lucide-react'
import { api, getApiBase, setApiBase, getErrorMessage } from './lib/api'
import { evaluateGatekeeper } from './lib/gatekeeper'
import {
  formatBytes, formatDate, humanize, normalizeCheck, normalizeField, normalizeShipment,
  roleLabel, statusTone, unwrapList,
} from './lib/utils'
import {
  Avatar, Badge, Button, Card, CardContent, CardHeader, CardTitle, Checkbox,
  Dialog, DialogContent, DialogDescription, DialogTitle, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger, EmptyState, Input,
  Label, Progress, SectionHeading, Select, Switch, Textarea, Tooltip, TooltipProvider,
} from './components/ui'

const DEMO_USER = { id: 'u-001', full_name: 'Alex Morgan', email: 'alex.morgan@portline.io', role: 'manager', is_active: true }
const DEMO_SHIPMENTS = [
  { id: 24811, code: 'SHP-24811', supplier: 'Shenzhen Lumina Tech Co.', created: '2026-11-03T08:42:00Z', status: 'needs_review', documents: 3 },
  { id: 24810, code: 'SHP-24810', supplier: 'Apex Industrial Components', created: '2026-11-03T07:18:00Z', status: 'processing', documents: 2 },
  { id: 24809, code: 'SHP-24809', supplier: 'Nordic Freight Systems', created: '2026-11-02T15:36:00Z', status: 'approved', documents: 3 },
  { id: 24808, code: 'SHP-24808', supplier: 'Guangzhou Optics Group', created: '2026-11-02T11:12:00Z', status: 'exported', documents: 3 },
  { id: 24807, code: 'SHP-24807', supplier: 'Meridian Auto Parts Ltd.', created: '2026-11-01T09:05:00Z', status: 'ingested', documents: 1 },
  { id: 24806, code: 'SHP-24806', supplier: 'Horizon Packaging GmbH', created: '2026-10-31T14:22:00Z', status: 'needs_review', documents: 3 },
]
const DEMO_FIELDS = [
  { id: 11, key: 'invoice_number', label: 'Invoice number', value: 'INV-2026-0934', confidence: 99, verified: true, category: 'invoice', page: 1, bbox: { x: 0.68, y: 0.12, w: 0.2, h: 0.035 } },
  { id: 12, key: 'invoice_date', label: 'Invoice date', value: '28 Oct 2026', confidence: 98, verified: true, category: 'invoice', page: 1, bbox: { x: 0.68, y: 0.17, w: 0.16, h: 0.035 } },
  { id: 13, key: 'incoterms', label: 'Incoterms', value: 'FOB Shanghai', confidence: 78, verified: false, category: 'invoice', page: 1, bbox: { x: 0.17, y: 0.36, w: 0.22, h: 0.04 } },
  { id: 14, key: 'currency', label: 'Currency', value: 'USD', confidence: 99, verified: true, category: 'invoice', page: 1, bbox: { x: 0.73, y: 0.62, w: 0.08, h: 0.03 } },
  { id: 15, key: 'total_amount', label: 'Total invoice value', value: '48,620.00', confidence: 97, verified: true, category: 'invoice', page: 1, bbox: { x: 0.67, y: 0.83, w: 0.19, h: 0.045 } },
  { id: 21, key: 'line_item_description', label: 'Product description', value: 'LED panel light 40W', confidence: 96, verified: true, category: 'line_items', page: 2, bbox: { x: 0.14, y: 0.29, w: 0.36, h: 0.045 } },
  { id: 22, key: 'hsn_code', label: 'HSN code', value: '9405.11', confidence: 81, verified: false, category: 'line_items', page: 2, bbox: { x: 0.53, y: 0.29, w: 0.15, h: 0.045 } },
  { id: 23, key: 'quantity', label: 'Quantity', value: '1,200 PCS', confidence: 99, verified: true, category: 'line_items', page: 2, bbox: { x: 0.71, y: 0.29, w: 0.13, h: 0.045 } },
  { id: 31, key: 'gross_weight', label: 'Gross weight', value: '2,840 KG', confidence: 95, verified: true, category: 'packing_list', page: 1, bbox: { x: 0.65, y: 0.52, w: 0.18, h: 0.04 } },
  { id: 32, key: 'net_weight', label: 'Net weight', value: '2,710 KG', confidence: 96, verified: true, category: 'packing_list', page: 1, bbox: { x: 0.65, y: 0.57, w: 0.18, h: 0.04 } },
  { id: 33, key: 'package_count', label: 'Package count', value: '48 cartons', confidence: 97, verified: true, category: 'packing_list', page: 1, bbox: { x: 0.65, y: 0.62, w: 0.18, h: 0.04 } },
  { id: 41, key: 'bl_number', label: 'Bill of lading no.', value: 'COSU63482910', confidence: 99, verified: true, category: 'bill_of_lading', page: 1, bbox: { x: 0.62, y: 0.16, w: 0.22, h: 0.04 } },
  { id: 42, key: 'vessel_name', label: 'Vessel name', value: 'COSCO SHIPPING STAR', confidence: 94, verified: true, category: 'bill_of_lading', page: 1, bbox: { x: 0.16, y: 0.38, w: 0.32, h: 0.04 } },
  { id: 43, key: 'gross_weight_bl', label: 'Gross weight', value: '2,795 KG', confidence: 82, verified: false, category: 'bill_of_lading', page: 1, bbox: { x: 0.64, y: 0.68, w: 0.17, h: 0.04 } },
]
const DEMO_CHECKS = [
  { id: 1, title: 'Gross weight reconciliation', message: 'Packing List: 2,840 KG · Bill of Lading: 2,795 KG · Variance: 45 KG', status: 'failed', overridden: false },
  { id: 2, title: 'Invoice arithmetic validation', message: 'Line item total matches declared invoice value (USD 48,620.00).', status: 'passed', overridden: false },
  { id: 3, title: 'Document triad completeness', message: 'Invoice, Packing List and Bill of Lading are present.', status: 'passed', overridden: false },
]
const DEMO_DOCS = [
  { id: 1, doc_type: 'invoice', file_name: 'INV-2026-0934.pdf', mime_type: 'application/pdf', file_size: 248000, page_count: 2, status: 'completed' },
  { id: 2, doc_type: 'packing_list', file_name: 'packing-list-SHP24811.pdf', mime_type: 'application/pdf', file_size: 184000, page_count: 1, status: 'completed' },
  { id: 3, doc_type: 'bill_of_lading', file_name: 'BL-COSU63482910.pdf', mime_type: 'application/pdf', file_size: 322000, page_count: 2, status: 'completed' },
]
const DEMO_USERS = [
  { id: 1, full_name: 'Alex Morgan', email: 'alex.morgan@portline.io', role: 'super_admin', is_active: true },
  { id: 2, full_name: 'Priya Sharma', email: 'priya.sharma@portline.io', role: 'manager', is_active: true },
  { id: 3, full_name: 'Daniel Kim', email: 'daniel.kim@portline.io', role: 'executive', is_active: true },
  { id: 4, full_name: 'Nina Patel', email: 'nina.patel@portline.io', role: 'executive', is_active: false },
]
const DOC_TYPES = [
  { value: 'invoice', label: 'Invoice' },
  { value: 'packing_list', label: 'Packing List' },
  { value: 'bill_of_lading', label: 'Bill of Lading' },
]
const STATUS_FILTERS = [
  { value: 'all', label: 'All' }, { value: 'ingested', label: 'Ingested' }, { value: 'processing', label: 'Processing' },
  { value: 'needs_review', label: 'Needs Review' }, { value: 'approved', label: 'Approved' }, { value: 'exported', label: 'Exported' },
]
const NAV_ITEMS = [
  { id: 'dashboard', label: 'Shipments', icon: LayoutDashboard, group: 'Operations' },
  { id: 'upload', label: 'Document intake', icon: CloudUpload, group: 'Operations' },
  { id: 'review', label: 'Review workspace', icon: Split, group: 'Operations' },
  { id: 'analytics', label: 'Audit & accuracy', icon: Activity, group: 'Management', roles: ['manager', 'super_admin'] },
]

function App() {
  const [user, setUser] = useState(null)
  const [isDemo, setIsDemo] = useState(false)
  const [authChecking, setAuthChecking] = useState(true)
  const [view, setView] = useState('dashboard')
  const [shipments, setShipments] = useState(DEMO_SHIPMENTS)
  const [selectedShipment, setSelectedShipment] = useState(DEMO_SHIPMENTS[0])
  const [globalSearch, setGlobalSearch] = useState('')
  const [collapsed, setCollapsed] = useState(false)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [toasts, setToasts] = useState([])
  const [refreshKey, setRefreshKey] = useState(0)
  const [pipelineHealthy, setPipelineHealthy] = useState(true)
  const [theme, setTheme] = useState(() => {
    try { return localStorage.getItem('portline-theme') || 'light' } catch { return 'light' }
  })

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    document.documentElement.style.colorScheme = theme
    try { localStorage.setItem('portline-theme', theme) } catch { /* storage may be unavailable */ }
  }, [theme])

  const toggleTheme = () => setTheme((current) => current === 'light' ? 'dark' : 'light')

  const notify = useCallback((title, description, type = 'success') => {
    const id = `${Date.now()}-${Math.random()}`
    setToasts((current) => [...current, { id, title, description, type }])
    window.setTimeout(() => setToasts((current) => current.filter((toast) => toast.id !== id)), 4300)
  }, [])

  const logout = useCallback(async () => {
    if (!isDemo) {
      try { await api.auth.logout() } catch { /* local session is cleared regardless */ }
    }
    sessionStorage.removeItem('portline-access-token')
    sessionStorage.removeItem('portline-refresh-token')
    setUser(null)
    setIsDemo(false)
    setView('dashboard')
  }, [isDemo])

  const startDemo = useCallback(() => {
    sessionStorage.removeItem('portline-access-token')
    sessionStorage.removeItem('portline-refresh-token')
    setUser(DEMO_USER)
    setIsDemo(true)
    setShipments(DEMO_SHIPMENTS)
    setSelectedShipment(DEMO_SHIPMENTS[0])
    setView('dashboard')
    notify('Demo workspace ready', 'Sample shipment data is active. Live API calls are disabled.', 'info')
  }, [notify])

  useEffect(() => {
    let active = true
    const token = sessionStorage.getItem('portline-access-token')
    if (!token) { setAuthChecking(false); return () => { active = false } }
    api.users.me().then((profile) => {
      if (!active) return
      setUser(profile?.user || profile?.data || profile || DEMO_USER)
      setIsDemo(false)
    }).catch(() => {
      sessionStorage.removeItem('portline-access-token')
      sessionStorage.removeItem('portline-refresh-token')
    }).finally(() => active && setAuthChecking(false))
    return () => { active = false }
  }, [])

  const loadShipments = useCallback(async () => {
    if (isDemo) { setShipments(DEMO_SHIPMENTS); return }
    try {
      const payload = await api.shipments.list()
      const rows = unwrapList(payload, ['shipments']).map(normalizeShipment)
      setShipments(rows)
    } catch (error) {
      notify('Shipment sync failed', getErrorMessage(error), 'error')
    }
  }, [isDemo, notify])

  useEffect(() => { if (user) loadShipments() }, [user, loadShipments, refreshKey])
  useEffect(() => {
    if (!user || isDemo) { setPipelineHealthy(true); return }
    let active = true
    api.health().then(() => active && setPipelineHealthy(true)).catch(() => active && setPipelineHealthy(false))
    return () => { active = false }
  }, [user, isDemo, refreshKey])

  const navigate = (next, shipment = null) => {
    if (shipment) setSelectedShipment(shipment)
    setView(next)
    setMobileNavOpen(false)
  }

  useEffect(() => {
    const returnToDashboard = () => setView('dashboard')
    window.addEventListener('portline-nav-dashboard', returnToDashboard)
    return () => window.removeEventListener('portline-nav-dashboard', returnToDashboard)
  }, [])

  const visibleNav = NAV_ITEMS.filter((item) => !item.roles || item.roles.includes(user?.role || 'executive'))
  const role = String(user?.role || 'executive').toLowerCase()
  const profileName = user?.full_name || user?.name || user?.email?.split('@')[0] || 'Operator'
  const initials = profileName.split(/\s+/).slice(0, 2).map((x) => x[0]).join('').toUpperCase()
  const pendingCount = shipments.filter((s) => s.status === 'needs_review').length

  if (authChecking) return <div className="auth-loading"><Loader2 className="animate-spin text-cyan" size={24} /><span>SECURE SESSION CHECK</span></div>
  if (!user) return <><AuthScreen theme={theme} onToggleTheme={toggleTheme} onAuthenticated={(profile) => { setUser(profile); setIsDemo(false); setView('dashboard') }} onDemo={startDemo} notify={notify} /><ToastStack toasts={toasts} setToasts={setToasts} /></>

  return (
    <TooltipProvider>
      <div className="app-shell" data-theme={theme}>
        {mobileNavOpen && <button className="mobile-scrim" aria-label="Close navigation" onClick={() => setMobileNavOpen(false)} />}
        <aside className={`sidebar ${collapsed ? 'sidebar-collapsed' : ''} ${mobileNavOpen ? 'sidebar-mobile-open' : ''}`}>
          <div className="brand-lockup">
            <div className="brand-mark"><Boxes size={20} strokeWidth={2.3} /></div>
            {!collapsed && <div className="brand-copy"><span>PORTLINE</span><small>CUSTOMS INTELLIGENCE</small></div>}
            {collapsed && <div className="brand-collapsed-line" />}
          </div>
          <div className="workspace-switcher">
            <div className="workspace-icon"><Building2 size={15} /></div>
            {!collapsed && <div className="min-w-0 flex-1"><div className="workspace-label">WORKSPACE</div><div className="workspace-name">Company A <ChevronDown size={12} /></div></div>}
          </div>
          <nav className="side-nav">
            {['Operations', 'Management'].map((group) => {
              const items = visibleNav.filter((item) => item.group === group)
              if (!items.length) return null
              return <div className="nav-group" key={group}>
                {!collapsed && <div className="nav-group-label">{group}</div>}
                {items.map(({ id, label, icon: Icon }) => <Tooltip key={id} content={label}>
                  <button onClick={() => navigate(id)} className={`nav-item ${view === id ? 'nav-item-active' : ''}`} aria-label={label}>
                    <Icon size={17} strokeWidth={1.9} />{!collapsed && <span>{label}</span>}
                    {!collapsed && id === 'dashboard' && pendingCount > 0 && <span className="nav-count">{pendingCount}</span>}
                    {view === id && <span className="nav-active-indicator" />}
                  </button>
                </Tooltip>)}
              </div>
            })}
          </nav>
          <div className="sidebar-bottom">
            <div className={`system-status ${collapsed ? 'justify-center' : ''}`}>
              <span className="status-pulse" />{!collapsed && <><span>PIPELINE</span><strong className={!isDemo && !pipelineHealthy ? 'text-red-300' : ''}>{isDemo ? 'DEMO MODE' : pipelineHealthy ? 'OPERATIONAL' : 'UNREACHABLE'}</strong></>}
            </div>
            {!collapsed && <div className="sidebar-version"><span>API v1.0</span><span>BUILD 26.11.03</span></div>}
            <Tooltip content={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
              <button className="collapse-control" onClick={() => setCollapsed(!collapsed)}>{collapsed ? <PanelLeftOpen size={17} /> : <><PanelLeftClose size={16} /><span>Collapse sidebar</span></>}</button>
            </Tooltip>
          </div>
        </aside>

        <div className="app-main">
          <header className="topbar">
            <div className="topbar-left">
              <Button variant="ghost" size="icon" className="mobile-menu-btn" onClick={() => setMobileNavOpen(true)}><Menu size={18} /></Button>
              <div className="breadcrumb"><span>PORTLINE</span><ChevronRight size={13} /><strong>{NAV_ITEMS.find((n) => n.id === view)?.label || 'Workspace'}</strong></div>
            </div>
            <div className="topbar-center">
              <div className="global-search-wrap"><Search size={15} /><input value={globalSearch} onChange={(e) => { setGlobalSearch(e.target.value); if (view !== 'dashboard') setView('dashboard') }} placeholder="Search shipment, supplier, invoice..." /><kbd>⌘ K</kbd></div>
            </div>
            <div className="topbar-right">
              <button className="theme-toggle" onClick={toggleTheme} aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`} title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}>{theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}<span>{theme === 'light' ? 'Dark' : 'Light'}</span></button>
              {isDemo ? <Badge variant="warning" className="demo-badge">DEMO MODE</Badge> : <Badge variant="success" className="live-badge"><span className="status-pulse" />LIVE API</Badge>}
              <DropdownMenu.Root>
                <DropdownMenuTrigger asChild><button className="icon-action relative" aria-label="Notifications"><Bell size={17} /><span className="notification-count">2</span></button></DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-80">
                  <div className="px-3 py-2"><div className="text-xs font-bold text-slate-100">Notifications</div><div className="text-[10px] text-slate-500">Latest workspace activity</div></div>
                  <DropdownMenuSeparator />
                  <div className="notification-item"><span className="notification-icon warning"><AlertTriangle size={13} /></span><div><b>Review required</b><p>SHP-24811 has 3 fields requiring attention.</p><small>8 min ago</small></div></div>
                  <div className="notification-item"><span className="notification-icon success"><CheckCircle2 size={13} /></span><div><b>Export completed</b><p>SHP-24808 customs filing is ready.</p><small>42 min ago</small></div></div>
                  <div className="px-3 py-2 text-center text-[10px] text-slate-600">Notification feed is a local UI preview.</div>
                </DropdownMenuContent>
              </DropdownMenu.Root>
              <div className="topbar-divider" />
              <div className="profile-summary"><Avatar initials={initials} className="h-8 w-8" /><div className="profile-text"><b>{profileName}</b><span>{roleLabel(role)}</span></div><ChevronDown size={13} className="text-slate-600" /></div>
              <DropdownMenu.Root><DropdownMenuTrigger asChild><button className="profile-more" aria-label="Profile menu"><MoreHorizontal size={17} /></button></DropdownMenuTrigger><DropdownMenuContent align="end"><div className="px-3 py-2"><p className="text-xs font-semibold text-slate-100">{profileName}</p><p className="mt-0.5 text-[10px] text-slate-500">{user.email}</p></div><DropdownMenuSeparator /><DropdownMenuItem onSelect={() => navigate('dashboard')}><House size={13} /> Workspace home</DropdownMenuItem><DropdownMenuItem onSelect={() => logout()} className="text-red-300"><LogOut size={13} /> Sign out</DropdownMenuItem></DropdownMenuContent></DropdownMenu.Root>
            </div>
          </header>

          <main className="page-content">
            {view === 'dashboard' && <DashboardView shipments={shipments} isDemo={isDemo} search={globalSearch} setSearch={setGlobalSearch} onSelect={(s) => navigate('review', s)} onUpload={(s) => navigate('upload', s)} onCreate={async (data) => {
              if (isDemo) {
                const created = normalizeShipment({ ...data, id: Date.now(), created_at: new Date().toISOString(), status: 'ingested' })
                setShipments((current) => [created, ...current]); setSelectedShipment(created); notify('Shipment created', `${created.code} is ready for document ingestion.`); navigate('upload', created); return
              }
              try { const result = await api.shipments.create(data); const created = normalizeShipment(result?.shipment || result?.data?.shipment || result?.data || result || data); setShipments((current) => [created, ...current]); setSelectedShipment(created); notify('Shipment created', `${created.code} has been added.`); navigate('upload', created) }
              catch (error) { notify('Shipment creation failed', getErrorMessage(error), 'error') }
            }} onRefresh={() => setRefreshKey((key) => key + 1)} onDelete={async (s) => {
              if (isDemo) { setShipments((current) => current.filter((x) => x.id !== s.id)); notify('Shipment removed', `${s.code} removed from the demo workspace.`); return }
              try { await api.shipments.delete(s.id); setShipments((current) => current.filter((x) => String(x.id) !== String(s.id))); notify('Shipment deleted', `${s.code} was deleted.`) }
              catch (error) { notify('Delete failed', getErrorMessage(error), 'error') }
            }} />}
            {view === 'upload' && <UploadView shipment={selectedShipment} shipments={shipments} isDemo={isDemo} onShipmentChange={setSelectedShipment} onReview={() => navigate('review', selectedShipment)} notify={notify} />}
            {view === 'review' && <ReviewView shipment={selectedShipment} isDemo={isDemo} user={user} notify={notify} onShipmentChange={setSelectedShipment} shipments={shipments} onExported={(format = 'xlsx') => { setShipments((rows) => rows.map((s) => String(s.id) === String(selectedShipment?.id) ? { ...s, status: 'exported' } : s)); notify(format === 'csv' ? 'Demo export preview downloaded' : 'Shipment exported', format === 'csv' ? `${selectedShipment?.code} CSV preview downloaded. Live API mode streams the backend .xlsx file.` : `${selectedShipment?.code} customs filing downloaded.`) }} />}
            {view === 'hsn' && <HsnView isDemo={isDemo} notify={notify} />}
            {view === 'users' && <UsersView isDemo={isDemo} user={user} notify={notify} />}
            {view === 'analytics' && <AnalyticsView isDemo={isDemo} notify={notify} />}
          </main>
          <footer className="app-footer"><span>PORTLINE INTELLIGENCE PLATFORM</span><span>SECURE DOCUMENT PIPELINE <i /> {isDemo ? 'DEMO DATASET' : 'CONNECTED API'}</span></footer>
        </div>
      </div>
      <ToastStack toasts={toasts} setToasts={setToasts} />
    </TooltipProvider>
  )
}

function ToastStack({ toasts, setToasts }) {
  return <div className="toast-stack">{toasts.map((toast) => <div className={`toast toast-${toast.type}`} key={toast.id}><div className="toast-icon">{toast.type === 'error' ? <AlertCircle size={16} /> : toast.type === 'warning' ? <AlertTriangle size={16} /> : <CheckCircle2 size={16} />}</div><div><b>{toast.title}</b><p>{toast.description}</p></div><button onClick={() => setToasts((rows) => rows.filter((x) => x.id !== toast.id))}><X size={14} /></button></div>)}</div>
}

function AuthScreen({ onAuthenticated, onDemo, notify, theme, onToggleTheme }) {
  const [mode, setMode] = useState('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [endpointOpen, setEndpointOpen] = useState(false)
  const [endpoint, setEndpoint] = useState(getApiBase())
  const [otpOpen, setOtpOpen] = useState(false)
  const [otp, setOtp] = useState('')
  const [otpCountdown, setOtpCountdown] = useState(30)
  const otpRefs = useRef([])

  useEffect(() => {
    if (!otpOpen || otpCountdown <= 0) return
    const timer = window.setInterval(() => setOtpCountdown((n) => Math.max(0, n - 1)), 1000)
    return () => window.clearInterval(timer)
  }, [otpOpen, otpCountdown])

  const handleLogin = async (event) => {
    event.preventDefault()
    setLoading(true)
    setApiBase(endpoint.trim())
    try {
      const payload = await api.auth.login({ email, password })
      if (!payload?.access_token) throw new Error('Login response did not include an access_token.')
      sessionStorage.setItem('portline-access-token', payload.access_token)
      if (payload.refresh_token) sessionStorage.setItem('portline-refresh-token', payload.refresh_token)
      let profile = payload.user || payload.profile || null
      try { const me = await api.users.me(); profile = me?.user || me?.data || me || profile } catch { /* use login response profile */ }
      onAuthenticated(profile || { email, full_name: email.split('@')[0], role: 'executive' })
    } catch (error) {
      notify('Sign in failed', getErrorMessage(error), 'error')
    } finally { setLoading(false) }
  }

  const handleSignup = async (event) => {
    event.preventDefault()
    setLoading(true)
    setApiBase(endpoint.trim())
    try {
      await api.auth.signup({ email, password, full_name: fullName })
      setOtp(''); setOtpCountdown(30); setOtpOpen(true)
      notify('Verification code sent', `Check ${email} for the 6-digit OTP.`, 'success')
    } catch (error) { notify('Account creation failed', getErrorMessage(error), 'error') }
    finally { setLoading(false) }
  }

  const handleVerify = async (event) => {
    event.preventDefault()
    if (otp.length !== 6) { notify('OTP incomplete', 'Enter all 6 digits to continue.', 'warning'); return }
    setLoading(true)
    try {
      await api.auth.verifyOtp({ email, otp })
      setOtpOpen(false); setMode('login'); setPassword('')
      notify('Email verified', 'Your account is active. Sign in to continue.')
    } catch (error) { notify('Verification failed', getErrorMessage(error), 'error') }
    finally { setLoading(false) }
  }

  return <div className="auth-page">
    <div className="auth-grid-overlay" />
    <div className="auth-topline"><div className="brand-lockup"><div className="brand-mark"><Boxes size={20} /></div><div className="brand-copy"><span>PORTLINE</span><small>CUSTOMS INTELLIGENCE</small></div></div><div className="auth-topline-actions"><button className="theme-toggle" onClick={onToggleTheme} aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}><>{theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}<span>{theme === 'light' ? 'Dark mode' : 'Light mode'}</span></></button><div className="auth-secure"><ShieldCheck size={14} /> ENTERPRISE SECURE ACCESS</div></div></div>
    <div className="auth-content">
      <div className="auth-aside">
        <Badge variant="info">DOCUMENT INTELLIGENCE PLATFORM</Badge>
        <h1>Move freight.<br /><em>Not paperwork.</em></h1>
        <p>One operational surface for customs documentation, AI extraction, human verification and export gatekeeping.</p>
        <div className="auth-feature-list">
          <div><span className="feature-icon"><Network size={16} /></span><div><b>Connected document intelligence</b><small>Invoice · Packing List · Bill of Lading</small></div></div>
          <div><span className="feature-icon"><ShieldCheck size={16} /></span><div><b>Compliance-first gatekeeping</b><small>Confidence checks and auditable overrides</small></div></div>
          <div><span className="feature-icon"><Gauge size={16} /></span><div><b>Operational clarity at scale</b><small>From document intake to customs filing</small></div></div>
        </div>
        <div className="auth-micro-grid"><span>01 / INGEST</span><span>02 / EXTRACT</span><span>03 / VERIFY</span><span>04 / EXPORT</span></div>
      </div>
      <div className="auth-card-wrap">
        <Card className="auth-card">
          <div className="auth-card-top"><div className="auth-card-symbol"><LockKeyhole size={18} /></div><span className="auth-card-label">{mode === 'login' ? 'IDENTITY GATEWAY' : 'NEW OPERATOR ACCESS'}</span><span className="auth-connection"><i /> SECURE</span></div>
          <h2>{mode === 'login' ? 'Welcome back' : 'Create your account'}</h2>
          <p className="auth-card-sub">{mode === 'login' ? 'Sign in to access your customs operations workspace.' : 'Register your operator identity to begin.'}</p>
          <form onSubmit={mode === 'login' ? handleLogin : handleSignup} className="auth-form">
            {mode === 'signup' && <div><Label>Full name</Label><Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="e.g. Jordan Lee" required autoComplete="name" /></div>}
            <div><Label>Work email address</Label><div className="input-with-icon"><span><Globe2 size={15} /></span><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.com" required autoComplete="email" /></div></div>
            <div><Label>Password</Label><div className="input-with-action"><Input type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Enter your password" required minLength={8} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} /><button type="button" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? <EyeOff size={15} /> : <Eye size={15} />}</button></div></div>
            <div className="auth-form-meta"><span><Shield size={12} /> Argon2id protected credentials</span>{mode === 'login' && <button type="button" onClick={() => notify('Password reset', 'Password reset is not included in the current API contract.', 'warning')}>Forgot password?</button>}</div>
            <Button type="submit" size="lg" className="w-full" disabled={loading}>{loading ? <Loader2 className="animate-spin" size={16} /> : <>{mode === 'login' ? 'Sign in to workspace' : 'Create secure account'} <ArrowRight size={15} /></>}</Button>
          </form>
          <div className="auth-switch">{mode === 'login' ? <>New to Portline? <button onClick={() => setMode('signup')}>Create an account</button></> : <>Already have access? <button onClick={() => setMode('login')}>Sign in instead</button></>}</div>
          <div className="auth-divider"><span />OR<span /></div>
          <Button variant="outline" className="w-full" onClick={onDemo}><Sparkles size={15} /> Explore demo workspace</Button>
          <div className="api-endpoint-toggle"><button onClick={() => setEndpointOpen(!endpointOpen)}><Server size={12} /> API connection settings <ChevronDown size={12} className={endpointOpen ? 'rotate-180' : ''} /></button>{endpointOpen && <div className="api-endpoint-edit"><Label>FastAPI base URL</Label><Input value={endpoint} onChange={(e) => setEndpoint(e.target.value)} placeholder="http://localhost:8000" /><small>Matches the provided Postman collection default.</small></div>}</div>
        </Card>
        <div className="auth-footnote"><span>© 2026 PORTLINE SYSTEMS</span><span>ACCESS CONTROLLED <i /> ENCRYPTED SESSION</span></div>
      </div>
    </div>
    <Dialog open={otpOpen} onOpenChange={setOtpOpen}>
      <DialogContent className="max-w-md">
        <div className="modal-icon"><KeyRound size={19} /></div><DialogTitle className="mt-4 text-lg font-bold text-white">Verify your email</DialogTitle><DialogDescription className="mt-1 text-xs leading-relaxed text-slate-500">Enter the 6-digit verification code sent to <b className="text-slate-300">{email}</b>.</DialogDescription>
        <form onSubmit={handleVerify} className="mt-6">
          <div className="otp-grid">{Array.from({ length: 6 }).map((_, index) => <input key={index} ref={(el) => { otpRefs.current[index] = el }} inputMode="numeric" maxLength={1} value={otp[index] || ''} onChange={(e) => { const digit = e.target.value.replace(/\D/g, '').slice(-1); const next = otp.split(''); next[index] = digit; setOtp(next.join('').slice(0, 6)); if (digit && index < 5) otpRefs.current[index + 1]?.focus() }} onKeyDown={(e) => { if (e.key === 'Backspace' && !otp[index] && index > 0) otpRefs.current[index - 1]?.focus() }} onPaste={(e) => { const digits = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6); if (digits) { setOtp(digits); otpRefs.current[Math.min(digits.length, 5)]?.focus() } }} />)}</div>
          <div className="mt-4 flex items-center justify-between text-[11px]"><span className="text-slate-500">Didn't receive a code?</span>{otpCountdown > 0 ? <span className="font-mono text-slate-400">Resend in 00:{String(otpCountdown).padStart(2, '0')}</span> : <button type="button" className="text-amber-300" onClick={() => notify('Resend unavailable', 'The provided API collection does not define an OTP resend endpoint. Trigger signup again or contact your administrator.', 'warning')}>Resend code</button>}</div>
          <Button type="submit" className="mt-6 w-full" size="lg" disabled={loading}>{loading ? <Loader2 size={15} className="animate-spin" /> : <>Verify email <ArrowRight size={15} /></>}</Button>
        </form>
        <p className="mt-4 text-center text-[10px] text-slate-600">Verification codes expire according to the backend OTP policy.</p>
      </DialogContent>
    </Dialog>
  </div>
}

function DashboardView({ shipments, isDemo, search, setSearch, onSelect, onUpload, onCreate, onDelete, onRefresh }) {
  const [filter, setFilter] = useState('all')
  const [sort, setSort] = useState('newest')
  const [createOpen, setCreateOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [detailTarget, setDetailTarget] = useState(null)
  const [detailData, setDetailData] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [form, setForm] = useState({ shipment_code: '', supplier_name: '' })
  const [creating, setCreating] = useState(false)

  const filtered = useMemo(() => shipments.filter((s) => (filter === 'all' || s.status === filter) && `${s.code} ${s.supplier} ${s.id}`.toLowerCase().includes(search.toLowerCase())).sort((a, b) => sort === 'oldest' ? new Date(a.created) - new Date(b.created) : new Date(b.created) - new Date(a.created)), [shipments, filter, search, sort])
  const metrics = [
    { label: 'Total shipments', value: shipments.length, icon: Package, tone: 'cyan', sub: '+12.8% vs last week' },
    { label: 'Pending review', value: shipments.filter((s) => s.status === 'needs_review').length, icon: AlertTriangle, tone: 'amber', sub: 'Requires operator action' },
    { label: 'Approved', value: shipments.filter((s) => s.status === 'approved').length, icon: BadgeCheck, tone: 'green', sub: 'Ready for export' },
    { label: 'Exported', value: shipments.filter((s) => s.status === 'exported').length, icon: FileSpreadsheet, tone: 'blue', sub: 'Customs filings generated' },
  ]
  const submitCreate = async (e) => { e.preventDefault(); setCreating(true); await onCreate(form); setCreating(false); setCreateOpen(false); setForm({ shipment_code: '', supplier_name: '' }) }
  const showDetails = async (s) => { setDetailTarget(s); setDetailData(s.raw || s); setDetailOpen(true); if (!isDemo) { setDetailLoading(true); try { setDetailData(await api.shipments.get(s.id)) } catch (error) { setDetailData(s.raw || s) } finally { setDetailLoading(false) } } }
  const [detailOpen, setDetailOpen] = useState(false)

  return <div className="page-enter">
    <SectionHeading eyebrow="COMMAND CENTER / 01" title="Shipments dashboard" description="Operational overview · Customs document pipeline" action={<><Button variant="outline" onClick={onRefresh}><RefreshCw size={14} /> Refresh</Button><Button onClick={() => setCreateOpen(true)}><Plus size={15} /> New shipment</Button></>} />
    <div className="metric-grid">{metrics.map(({ label, value, icon: Icon, tone, sub }, i) => <Card key={label} className={`metric-card metric-${tone}`}><CardContent className="pt-4"><div className="flex items-start justify-between"><span className="metric-label">{label}</span><span className="metric-icon"><Icon size={17} /></span></div><div className="mt-3 flex items-end gap-2"><strong className="metric-value">{String(value).padStart(2, '0')}</strong><span className="metric-index">/ 0{i + 1}</span></div><div className="metric-sub"><span className="metric-line" />{sub}</div></CardContent></Card>)}</div>
    <Card className="shipment-panel mt-5">
      <div className="panel-heading"><div><div className="panel-eyebrow"><span className="live-pip" /> SHIPMENT REGISTRY / API SNAPSHOT</div><h2>Shipment registry <span>{filtered.length.toString().padStart(2, '0')} records</span></h2></div><div className="panel-tools"><div className="table-search"><Search size={14} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Filter shipments..." /><kbd>/</kbd></div><div className="sort-control"><ArrowDownUp size={13} /><select value={sort} onChange={(e) => setSort(e.target.value)}><option value="newest">Newest first</option><option value="oldest">Oldest first</option></select></div></div></div>
      <div className="status-tabs">{STATUS_FILTERS.map((item) => <button key={item.value} className={filter === item.value ? 'status-tab-active' : ''} onClick={() => setFilter(item.value)}>{item.label}<span>{item.value === 'all' ? shipments.length : shipments.filter((s) => s.status === item.value).length}</span></button>)}</div>
      <div className="table-scroll"><table className="data-table"><thead><tr><th>Shipment reference</th><th>Supplier / Consignee</th><th>Date created</th><th>Documents</th><th>Processing state</th><th className="text-right">Actions</th></tr></thead><tbody>
        {filtered.map((shipment) => <tr key={shipment.id} className="shipment-row"><td><button className="shipment-code" onClick={() => onSelect(shipment)}><span className="shipment-code-mark">↗</span>{shipment.code}</button><div className="table-id">DB ID: {shipment.id}</div></td><td><div className="supplier-cell"><span className="supplier-avatar">{shipment.supplier.slice(0, 1).toUpperCase()}</span><div><b>{shipment.supplier}</b><small>Origin: Supplier record</small></div></div></td><td><span className="mono-value">{formatDate(shipment.created)}</span><small className="table-subline">{new Date(shipment.created).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</small></td><td><div className="doc-count"><FileText size={14} /><span>{shipment.documents?.length || shipment.document_count || shipment.documentCount || 0} / 3</span></div><div className="doc-mini-track"><i style={{ width: `${Math.min(100, ((shipment.documents?.length || shipment.document_count || shipment.documentCount || 0) / 3) * 100)}%` }} /></div></td><td><Badge variant={statusTone(shipment.status)} dot>{humanize(shipment.status)}</Badge></td><td><div className="row-actions"><Button size="sm" variant="outline" onClick={() => onSelect(shipment)}>Review <ArrowUpRight size={12} /></Button><DropdownMenu.Root><DropdownMenuTrigger asChild><Button variant="ghost" size="icon"><MoreHorizontal size={17} /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onSelect={() => showDetails(shipment)}><Eye size={13} /> View details</DropdownMenuItem><DropdownMenuItem onSelect={() => onUpload(shipment)}><CloudUpload size={13} /> Upload documents</DropdownMenuItem><DropdownMenuItem onSelect={() => onSelect(shipment)}><Split size={13} /> Launch review</DropdownMenuItem><DropdownMenuSeparator /><DropdownMenuItem className="text-red-300" onSelect={() => setDeleteTarget(shipment)}><Trash2 size={13} /> Delete shipment</DropdownMenuItem></DropdownMenuContent></DropdownMenu.Root></div></td></tr>)}
        {!filtered.length && <tr><td colSpan="6"><EmptyState icon={Search} title="No shipments found" description="Try a different search term or status filter." /></td></tr>}
      </tbody></table></div>
      <div className="table-footer"><span>DISPLAYING <b>{filtered.length}</b> OF <b>{shipments.length}</b> SHIPMENTS</span><span>DATA REFRESH <b>ON DEMAND</b></span></div>
    </Card>
    <div className="bottom-info-grid"><div className="info-strip"><span className="info-strip-icon"><ShieldCheck size={16} /></span><div><b>Export integrity is enforced</b><p>Low-confidence fields and unresolved cross-checks prevent customs filing export.</p></div><ArrowRight size={15} /></div><div className="info-strip"><span className="info-strip-icon violet"><Sparkles size={16} /></span><div><b>AI extraction pipeline</b><p>Document triad processing powered by the configured Gemma extraction service.</p></div><ArrowRight size={15} /></div></div>

    <Dialog open={createOpen} onOpenChange={setCreateOpen}><DialogContent>
      <div className="modal-icon"><Package size={19} /></div><DialogTitle className="mt-4 text-lg font-bold text-white">Create new shipment</DialogTitle><DialogDescription className="mt-1 text-xs text-slate-500">Register the shipment container before ingesting its document triad.</DialogDescription>
      <form onSubmit={submitCreate} className="mt-5 space-y-4"><div><Label>Shipment code</Label><Input value={form.shipment_code} onChange={(e) => setForm({ ...form, shipment_code: e.target.value.toUpperCase() })} placeholder="SHP-24812" required /></div><div><Label>Supplier / Vendor name</Label><Input value={form.supplier_name} onChange={(e) => setForm({ ...form, supplier_name: e.target.value })} placeholder="Company name and origin" required /></div><div className="rounded-lg border border-slate-800 bg-slate-950/50 p-3 text-[11px] leading-relaxed text-slate-500"><ShieldCheck size={13} className="mr-1 inline text-cyan" /> A shipment container is created first. Invoice, packing list and bill of lading can be uploaded in the next step.</div><Button type="submit" className="w-full" disabled={creating}>{creating ? <Loader2 size={15} className="animate-spin" /> : <>Create & upload documents <ArrowRight size={14} /></>}</Button></form>
    </DialogContent></Dialog>
    <Dialog open={detailOpen} onOpenChange={setDetailOpen}><DialogContent><div className="modal-icon"><Package size={18} /></div><DialogTitle className="mt-4 text-lg font-bold text-white">Shipment details</DialogTitle><DialogDescription className="mt-1 text-xs text-slate-500">Shipment record returned by the detail endpoint.</DialogDescription>{detailLoading ? <div className="py-10 text-center text-xs text-slate-500"><Loader2 size={18} className="mx-auto mb-2 animate-spin text-cyan" />Loading shipment record...</div> : <div className="detail-grid mt-5">{Object.entries(detailData || {}).filter(([key, value]) => typeof value !== 'object' && value !== null).slice(0, 12).map(([key, value]) => <div key={key}><small>{humanize(key)}</small><b>{String(value)}</b></div>)}</div>}<div className="mt-5 flex justify-end gap-2"><Button variant="outline" onClick={() => setDetailOpen(false)}>Close</Button><Button onClick={() => { setDetailOpen(false); onSelect(normalizeShipment(detailData || detailTarget)) }}><Split size={13} /> Open review workspace</Button></div></DialogContent></Dialog>
    <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}><DialogContent className="max-w-sm"><div className="modal-icon danger"><Trash2 size={18} /></div><DialogTitle className="mt-4 text-lg font-bold text-white">Delete shipment?</DialogTitle><DialogDescription className="mt-1 text-xs leading-relaxed text-slate-500">This permanently removes <b className="text-slate-300">{deleteTarget?.code}</b> and its linked documents and fields. This action cannot be undone.</DialogDescription><div className="mt-6 flex justify-end gap-2"><Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button><Button variant="danger" onClick={() => { onDelete(deleteTarget); setDeleteTarget(null) }}><Trash2 size={14} /> Delete shipment</Button></div></DialogContent></Dialog>
  </div>
}

function UploadView({ shipment, shipments, isDemo, onShipmentChange, onReview, notify }) {
  const [docs, setDocs] = useState([])
  const [queue, setQueue] = useState([])
  const [dragging, setDragging] = useState(false)
  const [loadingDocs, setLoadingDocs] = useState(false)
  const fileInput = useRef(null)
  const activeShipment = shipment || shipments[0]

  const loadDocs = useCallback(async () => {
    if (!activeShipment) return
    if (isDemo) { setDocs(String(activeShipment.id) === '24811' ? DEMO_DOCS : []); return }
    setLoadingDocs(true)
    try { setDocs(unwrapList(await api.shipments.documents(activeShipment.id), ['documents'])) }
    catch (error) { notify('Document list unavailable', getErrorMessage(error), 'error') }
    finally { setLoadingDocs(false) }
  }, [activeShipment?.id, isDemo, notify])
  useEffect(() => { loadDocs() }, [loadDocs])

  const addFiles = (files) => {
    const accepted = Array.from(files || []).filter((file) => {
      const validType = file.type === 'application/pdf' || file.type.startsWith('image/')
      const validSize = file.size <= 25 * 1024 * 1024
      if (!validType) notify('Unsupported file type', `${file.name} is not a PDF or image.`, 'warning')
      else if (!validSize) notify('File exceeds 25 MB', `${file.name} is too large for document ingestion.`, 'warning')
      return validType && validSize
    })
    setQueue((current) => [...current, ...accepted.map((file) => ({ id: `${file.name}-${file.lastModified}-${Math.random()}`, file, docType: 'invoice', replace: false, progress: 0, status: 'queued', error: '' }))])
  }
  const updateQueueItem = (id, patch) => setQueue((rows) => rows.map((row) => row.id === id ? { ...row, ...patch } : row))

  const uploadAll = async () => {
    if (!activeShipment || !queue.some((item) => item.status === 'queued' || item.status === 'failed')) return
    for (const item of queue.filter((row) => row.status === 'queued' || row.status === 'failed')) {
      updateQueueItem(item.id, { status: 'uploading', progress: 0, error: '' })
      try {
        if (isDemo) {
          for (const progress of [18, 42, 68, 89, 100]) {
            await new Promise((resolve) => window.setTimeout(resolve, 105))
            updateQueueItem(item.id, { progress })
          }
          setDocs((current) => [...current.filter((doc) => doc.doc_type !== item.docType), { id: Date.now(), doc_type: item.docType, file_name: item.file.name, mime_type: item.file.type, file_size: item.file.size, page_count: item.file.type === 'application/pdf' ? 2 : 1, status: 'completed' }])
        } else {
          await api.shipments.upload(activeShipment.id, item.docType, item.file, (progress) => updateQueueItem(item.id, { progress }))
        }
        updateQueueItem(item.id, { status: 'completed', progress: 100 })
      } catch (error) {
        updateQueueItem(item.id, { status: 'failed', error: getErrorMessage(error) })
        notify('Upload failed', `${item.file.name}: ${getErrorMessage(error)}`, 'error')
      }
    }
    if (!isDemo) await loadDocs()
    notify('Upload queue processed', 'Document ingestion requests have finished.')
  }

  const allTriadTypes = ['invoice', 'packing_list', 'bill_of_lading']
  const uploadedTypes = docs.map((doc) => String(doc.doc_type ?? doc.document_type ?? '').toLowerCase())
  const formatDoc = (type) => DOC_TYPES.find((x) => x.value === type)?.label || humanize(type)

  return <div className="page-enter">
    <SectionHeading eyebrow="DOCUMENT INGESTION / 02" title="Document upload center" description="Ingest the customs document triad · PDF and image files up to 25 MB" action={<Button variant="outline" onClick={onReview}><Split size={14} /> Open review workspace <ArrowUpRight size={13} /></Button>} />
    <div className="upload-context"><div className="upload-context-icon"><Package size={17} /></div><div className="min-w-0 flex-1"><span>ACTIVE SHIPMENT</span><div className="upload-context-code">{activeShipment?.code || 'No shipment selected'} <Badge variant={statusTone(activeShipment?.status)}>{humanize(activeShipment?.status || 'unassigned')}</Badge></div><small>{activeShipment?.supplier || 'Create a shipment from the dashboard before uploading documents.'}</small></div><div className="upload-context-select"><Label>Change shipment</Label><Select value={String(activeShipment?.id || '')} onValueChange={(value) => onShipmentChange(shipments.find((s) => String(s.id) === value))} options={shipments.map((s) => ({ value: String(s.id), label: `${s.code} · ${s.supplier}` }))} placeholder="Select shipment" /></div></div>
    <div className="triad-progress-grid">{allTriadTypes.map((type, index) => { const uploaded = uploadedTypes.includes(type); return <div className={`triad-slot ${uploaded ? 'triad-slot-done' : ''}`} key={type}><div className="triad-slot-top"><span className="triad-index">0{index + 1}</span><span className={`triad-slot-icon ${uploaded ? 'done' : ''}`}>{uploaded ? <Check size={15} /> : <FileText size={15} />}</span></div><b>{formatDoc(type)}</b><small>{uploaded ? 'Document received' : 'Awaiting upload'}</small><div className="triad-slot-bar"><i style={{ width: uploaded ? '100%' : '0%' }} /></div></div> })}</div>
    <div className="upload-layout">
      <Card className="upload-drop-card"><CardHeader><div><CardTitle>Drop documents to ingest</CardTitle><p className="mt-1 text-[11px] text-slate-500">Select one or more files, then assign the document type to each file.</p></div><Badge variant="info">MAX 25 MB / FILE</Badge></CardHeader><CardContent>
        <div className={`dropzone ${dragging ? 'dropzone-active' : ''}`} onDragOver={(e) => { e.preventDefault(); setDragging(true) }} onDragLeave={() => setDragging(false)} onDrop={(e) => { e.preventDefault(); setDragging(false); addFiles(e.dataTransfer.files) }} onClick={() => fileInput.current?.click()} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && fileInput.current?.click()}><input ref={fileInput} type="file" hidden multiple accept="application/pdf,image/*" onChange={(e) => { addFiles(e.target.files); e.target.value = '' }} /><div className="dropzone-icon"><CloudUpload size={23} /></div><b>Drag & drop files here</b><span>or <em>browse from device</em></span><small>PDF · PNG · JPG · JPEG · WEBP</small></div>
        <div className="upload-rules"><span><CheckCircle2 size={13} /> MIME byte validation</span><span><CheckCircle2 size={13} /> File sanitization</span><span><CheckCircle2 size={13} /> Background OCR processing</span></div>
      </CardContent></Card>
      <Card className="upload-side-card"><CardHeader><div><CardTitle>Document triad checklist</CardTitle><p className="mt-1 text-[11px] text-slate-500">Three source documents drive the review gate.</p></div><Layers3 size={16} className="text-slate-500" /></CardHeader><CardContent><div className="triad-check-list">{DOC_TYPES.map(({ value, label }) => { const doc = docs.find((d) => String(d.doc_type ?? d.document_type).toLowerCase() === value); return <div key={value} className="triad-check-row"><span className={`triad-check ${doc ? 'checked' : ''}`}>{doc ? <Check size={12} /> : <span />}</span><div><b>{label}</b><small>{doc ? doc.file_name || 'Uploaded document' : 'Not uploaded yet'}</small></div><Badge variant={doc ? 'success' : 'neutral'}>{doc ? 'Received' : 'Missing'}</Badge></div> })}</div><div className="mt-4 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-[10px] leading-relaxed text-amber-200/80"><AlertTriangle size={13} className="mr-1 inline" /> The API contract accepts <code>doc_type</code> and <code>file</code> only. The replace toggle below is a user intent indicator; server-side overwrite behavior must be confirmed in the backend.</div></CardContent></Card>
    </div>
    <Card className="queue-card mt-5"><div className="panel-heading"><div><div className="panel-eyebrow">INGESTION QUEUE</div><h2>Selected files <span>{queue.length.toString().padStart(2, '0')} queued</span></h2></div><div className="flex items-center gap-2"><Button size="sm" variant="outline" onClick={() => setQueue([])} disabled={!queue.length || queue.some((q) => q.status === 'uploading')}>Clear queue</Button><Button size="sm" onClick={uploadAll} disabled={!queue.length || !activeShipment || queue.every((q) => q.status === 'completed') || queue.some((q) => q.status === 'uploading')}><Upload size={13} /> Upload queued files</Button></div></div>
      {queue.length ? <div className="queue-list">{queue.map((item) => <div className="queue-item" key={item.id}><span className="queue-file-icon">{item.file.type === 'application/pdf' ? <FileText size={17} /> : <FileImage size={17} />}</span><div className="queue-file-meta"><b>{item.file.name}</b><small>{formatBytes(item.file.size)} · {item.file.type || 'Unknown MIME'}</small><div className="queue-progress-row"><Progress value={item.progress} /><span>{item.status === 'completed' ? 'Complete' : item.status === 'failed' ? 'Failed' : item.status === 'uploading' ? `${item.progress}%` : 'Queued'}</span></div>{item.error && <small className="text-red-300">{item.error}</small>}</div><div className="queue-settings"><Select value={item.docType} onValueChange={(value) => updateQueueItem(item.id, { docType: value })} options={DOC_TYPES} className="w-36" disabled={item.status === 'uploading' || item.status === 'completed'} /><div className="queue-replace"><Switch checked={item.replace} onCheckedChange={(checked) => updateQueueItem(item.id, { replace: checked })} disabled={item.status === 'uploading' || item.status === 'completed'} /><span>Replace existing</span></div></div><Badge variant={item.status === 'completed' ? 'success' : item.status === 'failed' ? 'danger' : item.status === 'uploading' ? 'info' : 'neutral'}>{humanize(item.status)}</Badge><button className="queue-remove" aria-label="Remove file" disabled={item.status === 'uploading' || item.status === 'completed'} onClick={() => setQueue((rows) => rows.filter((q) => q.id !== item.id))}><X size={15} /></button></div>)}</div> : <EmptyState icon={FileText} title="Your upload queue is empty" description="Drop a document or browse your device to begin ingestion." />}
    </Card>
    <Card className="uploaded-docs-card mt-5"><div className="panel-heading"><div><div className="panel-eyebrow">SOURCE DOCUMENTS</div><h2>Uploaded documents <span>{docs.length.toString().padStart(2, '0')} files</span></h2></div>{loadingDocs && <Loader2 size={15} className="animate-spin text-cyan" />}</div><div className="uploaded-doc-list">{docs.length ? docs.map((doc, index) => <div className="uploaded-doc-row" key={doc.id ?? index}><span className="doc-file-icon"><FileText size={16} /></span><div className="min-w-0 flex-1"><b>{doc.file_name ?? doc.filename ?? `Document ${index + 1}`}</b><small>{formatDoc(String(doc.doc_type ?? doc.document_type ?? '').toLowerCase())} · {formatBytes(doc.file_size ?? doc.size ?? 0)} · {doc.page_count ?? doc.pages ?? '—'} pages</small></div><Badge variant={statusTone(doc.status || 'completed')}>{humanize(doc.status || 'uploaded')}</Badge></div>) : <div className="px-4"><EmptyState icon={Archive} title="No documents uploaded" description="Uploaded files for this shipment will appear here." /></div>}</div></Card>
  </div>
}

function ReviewView({ shipment, isDemo, user, notify, onShipmentChange, shipments, onExported }) {
  const [fields, setFields] = useState(DEMO_FIELDS)
  const [checks, setChecks] = useState(DEMO_CHECKS)
  const [docs, setDocs] = useState(DEMO_DOCS)
  const [reviewLoading, setReviewLoading] = useState(false)
  const [activeCategory, setActiveCategory] = useState('invoice')
  const [selectedField, setSelectedField] = useState(13)
  const [editingField, setEditingField] = useState(null)
  const [editValue, setEditValue] = useState('')
  const [savingField, setSavingField] = useState(null)
  const [verifyAllLoading, setVerifyAllLoading] = useState(false)
  const [overrideTarget, setOverrideTarget] = useState(null)
  const [overrideReason, setOverrideReason] = useState('')
  const [overrideLoading, setOverrideLoading] = useState(false)
  const [gateOpen, setGateOpen] = useState(false)
  const [activeDoc, setActiveDoc] = useState(null)
  const [documentUrl, setDocumentUrl] = useState('')
  const [documentLoading, setDocumentLoading] = useState(false)
  const [zoom, setZoom] = useState(100)
  const [rotation, setRotation] = useState(0)
  const [page, setPage] = useState(1)
  const docFrameRef = useRef(null)
  const panRef = useRef(null)
  const [panMode, setPanMode] = useState(false)

  const loadReview = useCallback(async () => {
    if (!shipment) return
    if (isDemo) {
      setFields(DEMO_FIELDS); setChecks(DEMO_CHECKS); setDocs(String(shipment.id) === '24811' ? DEMO_DOCS : []); setSelectedField(13); setActiveCategory('invoice'); setActiveDoc(null);
      return
    }
    setReviewLoading(true)
    try {
      const [payload, docPayload] = await Promise.all([api.shipments.review(shipment.id), api.shipments.documents(shipment.id).catch(() => null)])
      const rawFields = payload?.fields ?? payload?.extracted_fields ?? payload?.data?.fields ?? []
      let normalizedFields = []
      if (Array.isArray(rawFields)) normalizedFields = rawFields.map(normalizeField)
      else if (rawFields && typeof rawFields === 'object') normalizedFields = Object.entries(rawFields).flatMap(([category, rows]) => (Array.isArray(rows) ? rows : []).map((row) => normalizeField({ ...row, category })))
      if (normalizedFields.length) setFields(normalizedFields)
      else setFields([])
      const rawChecks = payload?.cross_checks ?? payload?.checks ?? payload?.discrepancies ?? payload?.data?.cross_checks ?? []
      setChecks(Array.isArray(rawChecks) ? rawChecks.map(normalizeCheck) : [])
      const returnedDocs = unwrapList(docPayload, ['documents'])
      setDocs(returnedDocs); setActiveDoc(null)
      const firstField = normalizedFields[0]
      if (firstField) { setSelectedField(firstField.id); setActiveCategory(firstField.category) }
    } catch (error) { notify('Review data unavailable', getErrorMessage(error), 'error') }
    finally { setReviewLoading(false) }
  }, [shipment?.id, isDemo, notify])
  useEffect(() => { loadReview() }, [loadReview])

  useEffect(() => {
    let objectUrl = ''
    const loadFile = async () => {
      if (!activeDoc || isDemo || !activeDoc.id) { setDocumentUrl(''); return }
      setDocumentLoading(true)
      try {
        const result = await api.shipments.documentFile(activeDoc.id)
        objectUrl = URL.createObjectURL(result.blob)
        setDocumentUrl(objectUrl)
      } catch (error) { notify('Document preview unavailable', getErrorMessage(error), 'error'); setDocumentUrl('') }
      finally { setDocumentLoading(false) }
    }
    loadFile()
    return () => { if (objectUrl) URL.revokeObjectURL(objectUrl) }
  }, [activeDoc?.id, isDemo, notify])

  useEffect(() => {
    if (docs.length && !activeDoc) setActiveDoc(docs.find((d) => String(d.doc_type ?? d.document_type).toLowerCase() === activeCategory) || docs[0])
  }, [docs, activeDoc, activeCategory])

  const categoryFields = useMemo(() => fields.filter((field) => {
    const cat = String(field.category || 'invoice').toLowerCase()
    if (activeCategory === 'invoice') return cat.includes('invoice')
    if (activeCategory === 'line_items') return cat.includes('line') || cat.includes('item')
    if (activeCategory === 'packing_list') return cat.includes('packing')
    return cat.includes('bill') || cat.includes('lading') || cat === 'bol'
  }), [fields, activeCategory])
  const gatekeeper = useMemo(() => evaluateGatekeeper({ fields, checks, documents: docs }), [fields, checks, docs])
  const lowConfidence = gatekeeper.lowConfidenceFields
  const unresolvedChecks = gatekeeper.unresolvedChecks
  const blockers = gatekeeper.blockers
  const gateReady = gatekeeper.canExport
  const selected = fields.find((f) => String(f.id) === String(selectedField))
  const selectedDoc = activeDoc || docs.find((d) => String(d.doc_type ?? d.document_type).toLowerCase() === (selected?.category || activeCategory)) || docs[0]

  const saveField = async (field, value, verified = field.verified) => {
    setSavingField(field.id)
    try {
      if (!isDemo) await api.shipments.updateField(shipment.id, field.id, { field_value: value, is_human_verified: verified })
      setFields((rows) => rows.map((row) => String(row.id) === String(field.id) ? { ...row, value, verified } : row))
      setEditingField(null)
      notify('Field updated', `${field.label} has been saved${verified ? ' and verified' : ''}.`)
    } catch (error) { notify('Field update failed', getErrorMessage(error), 'error') }
    finally { setSavingField(null) }
  }

  const toggleVerified = async (field, checked) => {
    await saveField(field, field.value, checked)
  }

  const verifyAll = async () => {
    setVerifyAllLoading(true)
    try {
      const pending = fields.filter((field) => !field.verified)
      if (!isDemo) {
        for (const field of pending) await api.shipments.updateField(shipment.id, field.id, { field_value: field.value, is_human_verified: true })
      }
      setFields((rows) => rows.map((field) => ({ ...field, verified: true })))
      notify('Verification complete', `${pending.length} fields marked as human verified.`)
    } catch (error) { notify('Bulk verification stopped', getErrorMessage(error), 'error'); await loadReview() }
    finally { setVerifyAllLoading(false) }
  }

  const submitOverride = async (event) => {
    event.preventDefault()
    if (!overrideReason.trim()) return
    setOverrideLoading(true)
    try {
      if (!isDemo) await api.shipments.overrideCheck(shipment.id, overrideTarget.id, overrideReason.trim())
      setChecks((rows) => rows.map((check) => String(check.id) === String(overrideTarget.id) ? { ...check, overridden: true, status: 'overridden' } : check))
      notify('Cross-check overridden', 'The manager justification has been added to the audit trail.')
      setOverrideTarget(null); setOverrideReason('')
    } catch (error) { notify('Override rejected', getErrorMessage(error), 'error') }
    finally { setOverrideLoading(false) }
  }

  const exportExcel = async () => {
    if (!gateReady) { setGateOpen(true); return }
    try {
      if (isDemo) {
        const content = 'Shipment, Supplier, Status\n' + `${shipment.code},${shipment.supplier},Ready for export\n`
        const blob = new Blob([content], { type: 'text/csv;charset=utf-8' })
        const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `${shipment.code}-customs-preview.csv`; a.click(); URL.revokeObjectURL(url)
        onExported('csv')
      } else {
        const result = await api.shipments.export(shipment.id)
        const url = URL.createObjectURL(result.blob); const a = document.createElement('a'); a.href = url; a.download = `${shipment.code}-customs-filing.xlsx`; a.click(); URL.revokeObjectURL(url)
        onExported('xlsx')
      }
    } catch (error) { notify('Export blocked by backend', getErrorMessage(error), 'error') }
  }

  const categoryTabs = [
    { id: 'invoice', label: 'Invoice', icon: FileText }, { id: 'line_items', label: 'Line items', icon: Table2 },
    { id: 'packing_list', label: 'Packing list', icon: Boxes }, { id: 'bill_of_lading', label: 'Bill of lading', icon: Truck },
  ]
  const startPan = (event) => {
    if (!panMode || !docFrameRef.current) return
    panRef.current = { x: event.clientX, y: event.clientY, left: docFrameRef.current.scrollLeft, top: docFrameRef.current.scrollTop }
    event.currentTarget.setPointerCapture?.(event.pointerId)
    event.preventDefault()
  }
  const movePan = (event) => {
    if (!panRef.current || !docFrameRef.current) return
    docFrameRef.current.scrollLeft = panRef.current.left - (event.clientX - panRef.current.x)
    docFrameRef.current.scrollTop = panRef.current.top - (event.clientY - panRef.current.y)
  }
  const stopPan = () => { panRef.current = null }
  const getBboxStyle = (bbox) => {
    if (!bbox) return null
    const normalize = (n) => n <= 1 ? n * 100 : n <= 1000 ? n / 10 : n / 25
    return { left: `${normalize(bbox.x)}%`, top: `${normalize(bbox.y)}%`, width: `${Math.max(2, normalize(bbox.w))}%`, height: `${Math.max(2, normalize(bbox.h))}%` }
  }
  const managerAllowed = ['manager', 'super_admin'].includes(String(user?.role).toLowerCase())
  const isPdf = String(selectedDoc?.mime_type ?? selectedDoc?.content_type ?? selectedDoc?.file_type ?? 'application/pdf').includes('pdf') || String(selectedDoc?.file_name ?? '').toLowerCase().endsWith('.pdf')

  return <div className="page-enter review-page">
    <div className="review-context-bar"><div className="review-context-main"><button className="back-to-dashboard" onClick={() => window.dispatchEvent(new CustomEvent('portline-nav-dashboard'))}><ArrowLeft size={14} /></button><div><div className="review-context-eyebrow">REVIEW WORKSPACE / ACTIVE SHIPMENT</div><h1>{shipment?.code || 'No shipment selected'} <span>·</span> {shipment?.supplier || 'Select a shipment'}</h1></div></div><div className="review-context-actions"><Badge variant={gateReady ? 'success' : 'danger'} dot>{gateReady ? 'Ready for export' : 'Export blocked'}</Badge><Button size="sm" variant="outline" onClick={verifyAll} disabled={!fields.length || verifyAllLoading}>{verifyAllLoading ? <Loader2 size={13} className="animate-spin" /> : <CheckCheck size={13} />} Verify all fields</Button><Button size="sm" onClick={exportExcel} disabled={!gateReady}><Download size={13} /> Export Excel</Button><Button size="sm" variant="ghost" onClick={() => setGateOpen(true)}><ShieldAlert size={14} /> Gatekeeper</Button></div></div>
    {!shipment && <Card className="mt-5"><CardContent><EmptyState icon={Package} title="Select a shipment to review" description="Choose a shipment from the dashboard to load its extraction results." action={<Button onClick={() => window.dispatchEvent(new CustomEvent('portline-nav-dashboard'))}>Go to dashboard</Button>} /></CardContent></Card>}
    {shipment && <>
      <div className="review-metrics-strip"><div><span>EXTRACTED FIELDS</span><b>{fields.length.toString().padStart(2, '0')}</b><small>{fields.filter((f) => f.verified).length} verified</small></div><div><span>LOW CONFIDENCE</span><b className={lowConfidence.length ? 'text-amber-300' : ''}>{lowConfidence.length.toString().padStart(2, '0')}</b><small>Below 85% threshold</small></div><div><span>CROSS-CHECKS</span><b>{checks.length.toString().padStart(2, '0')}</b><small>{checks.filter((c) => c.status === 'passed' || c.overridden).length} passed / resolved</small></div><div><span>DOCUMENT TRIAD</span><b>{docs.length}/3</b><small>Source documents</small></div><div className="review-metrics-progress"><div className="flex justify-between"><span>HUMAN VERIFICATION</span><b>{fields.length ? Math.round((fields.filter((f) => f.verified).length / fields.length) * 100) : 0}%</b></div><Progress value={fields.length ? fields.filter((f) => f.verified).length / fields.length * 100 : 0} /></div></div>
      <div className="review-workspace-grid">
        <Card className="document-viewer-card"><div className="viewer-toolbar"><div className="viewer-toolbar-title"><FileText size={15} /><span>DOCUMENT SOURCE</span></div><div className="viewer-toolbar-controls"><button onClick={() => setZoom((z) => Math.max(60, z - 10))} title="Zoom out"><ZoomOut size={14} /></button><span>{zoom}%</span><button onClick={() => setZoom((z) => Math.min(160, z + 10))} title="Zoom in"><ZoomIn size={14} /></button><i /><button onClick={() => setRotation((r) => (r + 90) % 360)} title="Rotate"><RotateCcw size={14} /></button><button className={panMode ? 'viewer-pan-active' : ''} onClick={() => setPanMode((current) => !current)} title={panMode ? 'Disable pan mode' : 'Enable pan mode'}><Move size={13} /></button><button onClick={() => { setZoom(100); setRotation(0); setPanMode(false) }} title="Reset view"><RefreshCw size={13} /></button></div></div>
          <div className="viewer-doc-select"><Select value={String(selectedDoc?.id ?? '')} onValueChange={(id) => setActiveDoc(docs.find((doc) => String(doc.id) === id))} options={docs.map((doc) => ({ value: String(doc.id), label: `${humanize(doc.doc_type ?? doc.document_type ?? 'document')} · ${doc.file_name ?? doc.filename ?? `Doc ${doc.id}`}` }))} placeholder="Choose source document" /><div className="page-control"><button onClick={() => setPage((p) => Math.max(1, p - 1))}><ChevronLeft size={13} /></button><span>PAGE <b>{page}</b> / {selectedDoc?.page_count ?? selectedDoc?.pages ?? 1}</span><button onClick={() => setPage((p) => Math.min(Number(selectedDoc?.page_count ?? selectedDoc?.pages ?? 1), p + 1))}><ChevronRight size={13} /></button></div></div>
          <div className="document-canvas" ref={docFrameRef}><div className="document-transform" style={{ transform: `scale(${zoom / 100}) rotate(${rotation}deg)` }}>
            {documentLoading ? <div className="viewer-placeholder"><Loader2 className="animate-spin text-cyan" size={24} /><span>LOADING DOCUMENT STREAM</span></div> : documentUrl ? (isPdf ? <iframe title="Source document" src={`${documentUrl}#page=${page}&toolbar=0&navpanes=0`} className="actual-document-frame" /> : <img src={documentUrl} alt="Uploaded source document" className="actual-document-image" />) : isDemo ? <DemoDocumentPreview type={String(selectedDoc?.doc_type ?? 'invoice')} /> : <div className="viewer-placeholder"><FileText size={30} /><span>DOCUMENT PREVIEW UNAVAILABLE</span><small>Choose an uploaded document to load its source file.</small></div>}
            {selected?.bbox && <div className="bbox-highlight" style={getBboxStyle(selected.bbox)}><span>{selected.label}</span></div>}
          </div>{panMode && <div className="pan-surface" onPointerDown={startPan} onPointerMove={movePan} onPointerUp={stopPan} onPointerCancel={stopPan} />}</div>
          <div className="viewer-footer"><span><span className="bbox-legend" /> SELECTED FIELD REGION</span><span>{selected ? `SOURCE PAGE ${selected.page || 1}` : 'NO FIELD SELECTED'}</span></div>
        </Card>
        <Card className="extraction-panel"><div className="extraction-panel-header"><div><div className="panel-eyebrow">AI EXTRACTION / HUMAN IN THE LOOP</div><h2>Extracted data <span>{fields.length} fields</span></h2></div><Button size="icon" variant="ghost" onClick={loadReview}><RefreshCw size={14} /></Button></div>
          <Tabs.Root value={activeCategory} onValueChange={(value) => { setActiveCategory(value); const doc = docs.find((d) => String(d.doc_type ?? d.document_type).toLowerCase() === value); if (doc) setActiveDoc(doc); const nextField = fields.find((f) => value === 'line_items' ? f.category.includes('line') || f.category.includes('item') : value === 'bill_of_lading' ? f.category.includes('bill') || f.category.includes('lading') : f.category.includes(value)); if (nextField) setSelectedField(nextField.id); setPage(1) }}>
            <Tabs.List className="category-tabs">{categoryTabs.map(({ id, label, icon: Icon }) => <Tabs.Trigger key={id} value={id} className="category-tab"><Icon size={13} /><span>{label}</span><small>{fields.filter((f) => id === 'line_items' ? f.category.includes('line') || f.category.includes('item') : f.category.includes(id === 'bill_of_lading' ? 'bill' : id)).length}</small></Tabs.Trigger>)}</Tabs.List>
            {reviewLoading ? <div className="py-20 text-center text-xs text-slate-500"><Loader2 size={18} className="mx-auto mb-3 animate-spin text-cyan" />Loading extraction payload...</div> : <Tabs.Content value={activeCategory} className="fields-scroll"><div className="fields-category-caption"><span>{humanize(activeCategory)} DATA POINTS</span><span><i className="legend-dot legend-green" /> Verified <i className="legend-dot legend-amber" /> Needs review</span></div>
              {categoryFields.length ? <div className="field-list">{categoryFields.map((field) => <div key={field.id} className={`field-card ${field.confidence < 85 ? 'field-low-confidence' : ''} ${String(selectedField) === String(field.id) ? 'field-selected' : ''}`} onClick={() => { setSelectedField(field.id); if (field.page) setPage(field.page) }}>
                <div className="field-card-top"><span className="field-label">{field.label}</span><Badge variant={field.confidence >= 95 ? 'success' : field.confidence >= 85 ? 'info' : 'warning'}>{Math.round(field.confidence)}% confidence</Badge></div>
                <div className="field-value-row">{editingField === field.id ? <div className="field-edit-wrap"><Input autoFocus value={editValue} onChange={(e) => setEditValue(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') saveField(field, editValue); if (e.key === 'Escape') setEditingField(null) }} /><Button size="sm" onClick={() => saveField(field, editValue)} disabled={savingField === field.id}>{savingField === field.id ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} Save</Button><Button variant="ghost" size="icon" onClick={() => setEditingField(null)}><X size={13} /></Button></div> : <><span className="field-value">{String(field.value || '—')}</span><button className="field-edit-btn" title="Edit field" onClick={(e) => { e.stopPropagation(); setEditingField(field.id); setEditValue(String(field.value ?? '')) }}><Pencil size={12} /></button></>}</div>
                <div className="field-card-bottom"><div className="field-confidence-track"><i style={{ width: `${Math.min(100, Math.max(0, field.confidence))}%` }} /></div><label className={`verified-toggle ${field.verified ? 'is-verified' : ''}`} onClick={(e) => e.stopPropagation()}><Checkbox checked={field.verified} onCheckedChange={(checked) => toggleVerified(field, checked)} /><span>{field.verified ? 'Human verified' : 'Verify field'}</span></label></div>
              </div>)}</div> : <EmptyState icon={FileText} title="No extracted fields" description="The review response did not contain fields for this category. Confirm the backend payload schema or upload and process the document." />}
            </Tabs.Content>}
          </Tabs.Root>
          <div className="cross-check-section"><div className="cross-check-title"><div><div className="panel-eyebrow">VALIDATION ENGINE</div><b>Cross-check results</b></div><Badge variant={unresolvedChecks.length ? 'danger' : 'success'}>{unresolvedChecks.length ? `${unresolvedChecks.length} blockers` : 'All clear'}</Badge></div>
            {checks.length ? checks.map((check) => <div className={`check-row ${check.status === 'passed' || check.overridden ? 'check-passed' : 'check-failed'}`} key={check.id}><span className="check-row-icon">{check.status === 'passed' || check.overridden ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}</span><div className="check-row-text"><b>{check.title}</b><p>{check.message}</p>{check.overridden && <small>Manager override recorded</small>}</div>{check.status !== 'passed' && !check.overridden ? managerAllowed ? <Button size="sm" variant="outline" onClick={() => { setOverrideTarget(check); setOverrideReason('') }}>Override</Button> : <Badge variant="danger">Blocked</Badge> : <Badge variant="success">{check.overridden ? 'Overridden' : 'Passed'}</Badge>}</div>) : <div className="py-5 text-center text-xs text-slate-500">No cross-check results were returned.</div>}
          </div>
        </Card>
      </div>
    </>}

    <Dialog open={!!overrideTarget} onOpenChange={(open) => !open && setOverrideTarget(null)}><DialogContent><div className="modal-icon danger"><ShieldAlert size={19} /></div><DialogTitle className="mt-4 text-lg font-bold text-white">Manager override</DialogTitle><DialogDescription className="mt-1 text-xs leading-relaxed text-slate-500">Override <b className="text-slate-200">{overrideTarget?.title}</b>. Your justification is mandatory and will be written to the immutable audit trail.</DialogDescription><form onSubmit={submitOverride} className="mt-5"><Label>Override justification</Label><Textarea value={overrideReason} onChange={(e) => setOverrideReason(e.target.value)} placeholder="Explain the evidence reviewed and why this discrepancy is acceptable..." required minLength={12} /><div className="mt-2 text-[10px] text-slate-600">Minimum 12 characters. This action is restricted to Manager and Super Admin roles.</div><div className="mt-5 flex justify-end gap-2"><Button variant="outline" onClick={() => setOverrideTarget(null)}>Cancel</Button><Button type="submit" disabled={!overrideReason.trim() || overrideReason.trim().length < 12 || overrideLoading}>{overrideLoading ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />} Confirm override</Button></div></form></DialogContent></Dialog>

    <Dialog open={gateOpen} onOpenChange={setGateOpen}><DialogContent className="max-w-xl"><div className={`gatekeeper-modal-head ${gateReady ? 'gate-ready' : 'gate-blocked'}`}><span>{gateReady ? <ShieldCheck size={21} /> : <ShieldAlert size={21} />}</span><div><DialogTitle className="text-base font-bold text-white">Customs export gatekeeper</DialogTitle><DialogDescription className="mt-1 text-xs text-slate-400">{gateReady ? 'All configured checks are clear. Export is unlocked.' : 'Export is locked until every blocking condition is resolved.'}</DialogDescription></div><Badge variant={gateReady ? 'success' : 'danger'}>{gateReady ? 'READY' : 'BLOCKED'}</Badge></div><div className="gatekeeper-list">{blockers.length ? blockers.map((reason, index) => <div className="gatekeeper-reason" key={index}><AlertCircle size={14} /><span>{reason}</span></div>) : <div className="gatekeeper-reason gatekeeper-clear"><CheckCircle2 size={14} /><span>All low-confidence fields have been verified and all cross-checks are resolved.</span></div>}</div><div className="gatekeeper-foot"><div><small>SHIPMENT</small><b>{shipment?.code}</b></div><div><small>FIELDS VERIFIED</small><b>{fields.filter((f) => f.verified).length} / {fields.length}</b></div><div><small>OPEN CHECKS</small><b>{unresolvedChecks.length}</b></div></div><Button className="mt-4 w-full" disabled={!gateReady} onClick={exportExcel}><Download size={14} /> Download customs filing Excel</Button><p className="mt-3 text-center text-[10px] text-slate-600">Backend export remains authoritative and may return HTTP 422 if validation state changes.</p></DialogContent></Dialog>
  </div>
}

function DemoDocumentPreview({ type }) {
  if (type === 'packing_list') return <div className="demo-document"><div className="demo-doc-head"><div><b>PACKING LIST</b><small>EXPORT DOCUMENT / PL-2026-0934</small></div><span>ORIGINAL</span></div><div className="demo-doc-company">SHENZHEN LUMINA TECH CO., LTD.<small>Building 7, Bao'an Industrial Zone, Shenzhen, China</small></div><div className="demo-doc-grid"><span>SHIPMENT REF <b>SHP-24811</b></span><span>DATE <b>28 OCT 2026</b></span><span>PACKAGES <b>48 CARTONS</b></span><span>DESTINATION <b>KOLKATA, INDIA</b></span></div><div className="demo-doc-table"><div>DESCRIPTION <span>QTY</span><span>NET WT.</span><span>GROSS WT.</span></div><div>LED PANEL LIGHT 40W <span>1,200</span><span>2,710 KG</span><span>2,840 KG</span></div><div>WOODEN PALLETS <span>48</span><span>—</span><span>INCLUDED</span></div></div><div className="demo-doc-signature">AUTHORIZED SIGNATURE <span>____________________</span></div></div>
  if (type === 'bill_of_lading') return <div className="demo-document"><div className="demo-doc-head"><div><b>BILL OF LADING</b><small>OCEAN TRANSPORT / ORIGINAL</small></div><span>NON-NEGOTIABLE</span></div><div className="demo-doc-number">COSU63482910</div><div className="demo-doc-grid"><span>SHIPPER <b>SHENZHEN LUMINA TECH CO.</b></span><span>CONSIGNEE <b>PORTLINE IMPORTS PVT LTD.</b></span><span>VESSEL <b>COSCO SHIPPING STAR</b></span><span>PORT OF LOADING <b>SHANGHAI, CN</b></span><span>PORT OF DISCHARGE <b>KOLKATA, IN</b></span><span>CONTAINER <b>CSNU 782391-0</b></span></div><div className="demo-doc-table"><div>MARKS & NUMBERS <span>PACKAGES</span><span>DESCRIPTION</span></div><div>SHP-24811 <span>48 CTNS</span><span>LED PANEL LIGHTS</span></div></div><div className="demo-doc-weight">GROSS WEIGHT <b>2,795 KG</b></div><div className="demo-doc-signature">CARRIER SIGNATURE <span>____________________</span></div></div>
  return <div className="demo-document"><div className="demo-doc-head"><div><b>COMMERCIAL INVOICE</b><small>INVOICE / EXPORT DECLARATION COPY</small></div><span>ORIGINAL</span></div><div className="demo-doc-company">SHENZHEN LUMINA TECH CO., LTD.<small>88 Guangming Avenue, Shenzhen, Guangdong, China</small></div><div className="demo-doc-grid"><span>INVOICE NO. <b>INV-2026-0934</b></span><span>DATE <b>28 OCT 2026</b></span><span>BUYER <b>PORTLINE IMPORTS PVT LTD.</b></span><span>INCOTERMS <b>FOB SHANGHAI</b></span></div><div className="demo-doc-table"><div>DESCRIPTION <span>HSN</span><span>QTY</span><span>UNIT PRICE</span></div><div>LED PANEL LIGHT 40W <span>9405.11</span><span>1,200</span><span>USD 40.52</span></div></div><div className="demo-doc-total">TOTAL INVOICE VALUE <b>USD 48,620.00</b></div><div className="demo-doc-terms">COUNTRY OF ORIGIN: CHINA<br />PAYMENT: 30 DAYS FROM BILL OF LADING DATE<br />GOODS DESCRIBED ABOVE ARE OF CHINESE ORIGIN.</div><div className="demo-doc-signature">AUTHORIZED SIGNATURE <span>____________________</span></div></div>
}

function HsnView({ isDemo, notify }) {
  const [description, setDescription] = useState('LED panel light 40W ceiling fixture')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const [selectedResult, setSelectedResult] = useState(null)
  const demoResults = [
    { code: '9405.11.00', description: 'Chandeliers and other electric ceiling or wall lighting fittings, designed for use solely with LED light sources', duty: '20%', probability: 96.8, source: 'Verified historical match' },
    { code: '9405.42.00', description: 'Other electric lamps and lighting fittings, designed for use solely with LED light sources', duty: '20%', probability: 91.4, source: 'Semantic description match' },
    { code: '8539.52.00', description: 'Light-emitting diode (LED) lamps', duty: '20%', probability: 74.2, source: 'Related product category' },
  ]
  const search = async (event) => {
    event.preventDefault()
    if (!description.trim()) return
    setLoading(true); setSearched(true); setSelectedResult(null)
    try {
      if (isDemo) {
        await new Promise((resolve) => window.setTimeout(resolve, 700))
        setResults(demoResults)
      } else {
        const payload = await api.hsn.suggest(description.trim())
        const rows = unwrapList(payload, ['suggestions', 'matches', 'results', 'hsn_codes'])
        const normalized = rows.map((row) => {
          const probability = Number(row.match_probability ?? row.probability ?? row.score ?? row.similarity ?? 0)
          return {
            code: row.hsn_code ?? row.code ?? row.hsn ?? '—',
            description: row.description ?? row.official_description ?? row.title ?? 'No description returned',
            duty: row.duty_rate ?? row.duty_percentage ?? row.duty ?? '—',
            probability: probability <= 1 ? probability * 100 : probability,
            source: row.source ?? 'EmbeddingGemma 2 semantic match',
            raw: row,
          }
        })
        setResults(normalized)
        if (!normalized.length) notify('No HSN matches returned', 'The API response did not include a suggestions array. Inspect the backend response schema.', 'warning')
      }
    } catch (error) { setResults([]); notify('HSN lookup failed', getErrorMessage(error), 'error') }
    finally { setLoading(false) }
  }

  return <div className="page-enter">
    <SectionHeading eyebrow="SEMANTIC CLASSIFICATION / 03" title="AI HSN assistant" description="Retrieve semantically similar tariff classifications from the verified HSN reference corpus." action={<Badge variant="info"><Sparkles size={11} /> EMBEDDINGGEMMA 2</Badge>} />
    <div className="hsn-hero"><div className="hsn-hero-copy"><div className="hsn-orbit"><div className="hsn-orbit-core"><WandSparkles size={27} /></div><i /><i /><i /></div><div><div className="panel-eyebrow">VECTOR-POWERED CLASSIFICATION</div><h2>Describe the goods.<br /><em>Find the right code.</em></h2><p>Generate ranked HSN suggestions using semantic similarity against previously verified customs records.</p><div className="hsn-hero-tags"><span><Network size={12} /> VECTOR SEARCH</span><span><ShieldCheck size={12} /> VERIFIED RECORDS</span><span><Activity size={12} /> COSINE SIMILARITY</span></div></div></div>
      <form className="hsn-search-card" onSubmit={search}><Label>PRODUCT / COMMODITY DESCRIPTION</Label><div className="hsn-search-input"><Search size={17} /><Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Describe the item, material, use and specification..." /><Button type="submit" disabled={loading || !description.trim()}>{loading ? <Loader2 size={14} className="animate-spin" /> : <>Find HSN codes <ArrowRight size={14} /></>}</Button></div><div className="hsn-examples"><span>TRY EXAMPLES</span>{['LED panel light 40W', 'Stainless steel fasteners', 'Polypropylene woven sacks'].map((sample) => <button type="button" key={sample} onClick={() => setDescription(sample)}>{sample}</button>)}</div><div className="hsn-search-note"><Shield size={12} /> AI suggestions are decision support only. Confirm final classification against the applicable tariff schedule.</div></form>
    </div>
    <div className="hsn-results-heading"><div><span className="panel-eyebrow">CLASSIFICATION OUTPUT</span><h2>Ranked suggestions <span>{results.length ? `${results.length} matches` : 'Awaiting query'}</span></h2></div>{searched && !loading && <Badge variant={results.length ? 'success' : 'neutral'}>{results.length ? 'RESULTS READY' : 'NO RESULTS'}</Badge>}</div>
    {loading ? <Card className="hsn-loading"><CardContent><div className="hsn-loading-orb"><Loader2 size={24} className="animate-spin" /></div><b>Matching product semantics</b><p>Comparing description embeddings against verified HSN records...</p><div className="hsn-loading-bars"><i /><i /><i /></div></CardContent></Card> : results.length ? <div className="hsn-results-grid">{results.map((result, index) => <Card className={`hsn-result-card ${selectedResult?.code === result.code ? 'hsn-result-selected' : ''}`} key={`${result.code}-${index}`} onClick={() => setSelectedResult(result)}><div className="hsn-rank">0{index + 1}<span>{index === 0 ? 'TOP MATCH' : `RANK ${index + 1}`}</span></div><div className="hsn-result-code">{result.code}</div><p>{result.description}</p><div className="hsn-result-stats"><div><span>DUTY RATE</span><b>{result.duty}</b></div><div><span>AI MATCH</span><b className={result.probability >= 90 ? 'text-emerald-300' : result.probability >= 80 ? 'text-cyan' : 'text-amber-300'}>{Number(result.probability).toFixed(1)}%</b></div></div><div className="hsn-result-track"><i style={{ width: `${Math.min(100, Math.max(0, result.probability))}%` }} /></div><div className="hsn-result-foot"><span><Sparkles size={11} /> {result.source}</span><button onClick={(e) => { e.stopPropagation(); navigator.clipboard?.writeText(result.code); notify('HSN code copied', result.code) }} title="Copy HSN code"><Code2 size={13} /> Copy</button></div></Card>)}</div> : <Card><CardContent><EmptyState icon={WandSparkles} title={searched ? 'No classification returned' : 'Start with a product description'} description={searched ? 'Try a more specific product description or inspect the API response to confirm its result schema.' : 'Enter a commodity description above to receive ranked HSN code suggestions.'} /></CardContent></Card>}
    {selectedResult && <div className="hsn-selection-note"><CheckCircle2 size={14} /><span><b>{selectedResult.code}</b> selected for comparison. Confirm the classification and current duty applicability with your customs compliance team before filing.</span><button onClick={() => setSelectedResult(null)}><X size={14} /></button></div>}
    <div className="hsn-disclaimer"><AlertCircle size={14} /><p><b>Classification responsibility:</b> AI match probability indicates semantic similarity, not legal certainty. Duty rates can depend on country, exemptions, effective date and product specifications; the provided API collection does not define an official tariff source.</p></div>
  </div>
}

function UsersView({ isDemo, user, notify }) {
  const [users, setUsers] = useState(DEMO_USERS)
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [form, setForm] = useState({ full_name: '', email: '', password: '', role: 'executive' })
  const [saving, setSaving] = useState(false)
  const [updatingId, setUpdatingId] = useState(null)

  const loadUsers = useCallback(async () => {
    if (isDemo) { setUsers(DEMO_USERS); return }
    setLoading(true)
    try { setUsers(unwrapList(await api.users.list(), ['users']).map((item, index) => ({ ...item, id: item.id ?? item.user_id ?? index }))) }
    catch (error) { notify('User directory unavailable', getErrorMessage(error), 'error') }
    finally { setLoading(false) }
  }, [isDemo, notify])
  useEffect(() => { loadUsers() }, [loadUsers])

  const updateUser = async (id, patch) => {
    setUpdatingId(id)
    try {
      if (!isDemo) await api.users.update(id, patch)
      setUsers((rows) => rows.map((row) => String(row.id) === String(id) ? { ...row, ...patch } : row))
      notify('User permissions updated', 'The user record has been updated.')
    } catch (error) { notify('User update failed', getErrorMessage(error), 'error'); await loadUsers() }
    finally { setUpdatingId(null) }
  }

  const createUser = async (event) => {
    event.preventDefault(); setSaving(true)
    try {
      const body = { ...form, is_verified: true, is_active: true }
      if (isDemo) setUsers((rows) => [...rows, { id: Date.now(), ...body }])
      else { const response = await api.users.create(body); setUsers((rows) => [...rows, response?.user || response || { ...body, id: Date.now() }]) }
      notify('User provisioned', `${form.full_name} has been added to the workspace.`)
      setCreateOpen(false); setForm({ full_name: '', email: '', password: '', role: 'executive' })
    } catch (error) { notify('User creation failed', getErrorMessage(error), 'error') }
    finally { setSaving(false) }
  }
  const filtered = users.filter((u) => `${u.full_name ?? u.name} ${u.email} ${u.role}`.toLowerCase().includes(search.toLowerCase()))

  return <div className="page-enter">
    <SectionHeading eyebrow="ACCESS CONTROL / 04" title="User management" description="Manage workspace identities, role-based permissions and active operator access." action={<><Button variant="outline" onClick={loadUsers}><RefreshCw size={13} /> Refresh</Button><Button onClick={() => setCreateOpen(true)}><UserPlus size={14} /> Provision user</Button></>} />
    <div className="admin-summary-grid"><div className="admin-summary-card"><span>REGISTERED USERS</span><b>{users.length.toString().padStart(2, '0')}</b><small>Workspace identities</small></div><div className="admin-summary-card"><span>ACTIVE OPERATORS</span><b>{users.filter((u) => u.is_active).length.toString().padStart(2, '0')}</b><small>Can access the platform</small></div><div className="admin-summary-card"><span>MANAGERS / ADMINS</span><b>{users.filter((u) => ['manager', 'super_admin'].includes(String(u.role).toLowerCase())).length.toString().padStart(2, '0')}</b><small>Elevated permission scope</small></div><div className="admin-summary-card"><span>YOUR ROLE</span><b className="admin-role-value">{roleLabel(user?.role)}</b><small>Current session authority</small></div></div>
    <Card className="users-card"><div className="panel-heading"><div><div className="panel-eyebrow">IDENTITY DIRECTORY / RBAC</div><h2>Workspace users <span>{filtered.length} identities</span></h2></div><div className="table-search"><Search size={14} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search users..." /></div></div><div className="table-scroll"><table className="data-table users-table"><thead><tr><th>Operator</th><th>Assigned role</th><th>Access status</th><th>Last activity</th><th className="text-right">Control</th></tr></thead><tbody>{filtered.map((u) => <tr key={u.id}><td><div className="supplier-cell"><Avatar initials={(u.full_name ?? u.name ?? u.email).split(/\s+/).slice(0, 2).map((x) => x[0]).join('').toUpperCase()} className="h-8 w-8" /><div><b>{u.full_name ?? u.name ?? 'Operator'}</b><small>{u.email}</small></div></div></td><td><div className="role-select-wrap"><Select value={String(u.role || 'executive').toLowerCase()} onValueChange={(value) => updateUser(u.id, { role: value })} disabled={updatingId === u.id || String(u.id) === String(user?.id)} options={[{ value: 'executive', label: 'Executive' }, { value: 'manager', label: 'Manager' }, { value: 'super_admin', label: 'Super Admin' }]} className="w-36" />{String(u.id) === String(user?.id) && <span className="text-[9px] text-slate-600">CURRENT SESSION</span>}</div></td><td><div className="flex items-center gap-2"><span className={`active-dot ${u.is_active ? 'on' : 'off'}`} /><Badge variant={u.is_active ? 'success' : 'neutral'}>{u.is_active ? 'Active' : 'Inactive'}</Badge></div></td><td><span className="text-xs text-slate-500">{u.last_login_at ? formatDate(u.last_login_at) : '—'}</span></td><td><div className="flex items-center justify-end gap-2"><span className="text-[10px] text-slate-500">{u.is_active ? 'Enabled' : 'Disabled'}</span><Switch checked={Boolean(u.is_active)} onCheckedChange={(checked) => updateUser(u.id, { is_active: checked })} disabled={updatingId === u.id || String(u.id) === String(user?.id)} /></div></td></tr>)}{!filtered.length && <tr><td colSpan="5"><EmptyState icon={Users} title="No matching users" description="Try another name, email address or role." /></td></tr>}</tbody></table></div><div className="table-footer"><span>ROLE CHANGES REQUIRE SUPER ADMIN PRIVILEGES</span><span>USER IDENTITY API <b>/api/v1/users</b></span></div></Card>
    <div className="permission-grid"><div className="permission-card"><span className="permission-symbol"><UserCog size={16} /></span><div><b>Executive</b><p>Upload documents, review extracted data and verify fields within assigned shipments.</p></div><Badge>STANDARD</Badge></div><div className="permission-card"><span className="permission-symbol manager"><ShieldCheck size={16} /></span><div><b>Manager</b><p>Executive capabilities plus manager-level cross-check override permissions and audit visibility.</p></div><Badge variant="warning">ELEVATED</Badge></div><div className="permission-card"><span className="permission-symbol admin"><Fingerprint size={16} /></span><div><b>Super Admin</b><p>Full user provisioning, role management and workspace administration.</p></div><Badge variant="danger">PRIVILEGED</Badge></div></div>
    <Dialog open={createOpen} onOpenChange={setCreateOpen}><DialogContent><div className="modal-icon"><UserPlus size={19} /></div><DialogTitle className="mt-4 text-lg font-bold text-white">Provision operator</DialogTitle><DialogDescription className="mt-1 text-xs text-slate-500">Create a pre-verified user account. This action is restricted to Super Admins.</DialogDescription><form onSubmit={createUser} className="mt-5 space-y-3"><div><Label>Full name</Label><Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} required /></div><div><Label>Work email</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required /></div><div><Label>Temporary password</Label><Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} minLength={8} required /></div><div><Label>Initial role</Label><Select value={form.role} onValueChange={(value) => setForm({ ...form, role: value })} options={[{ value: 'executive', label: 'Executive' }, { value: 'manager', label: 'Manager' }, { value: 'super_admin', label: 'Super Admin' }]} /></div><div className="rounded-lg border border-slate-800 bg-slate-950/50 p-3 text-[10px] text-slate-500">The API collection provisions new users with <code>is_verified: true</code> and <code>is_active: true</code>.</div><Button className="w-full" type="submit" disabled={saving}>{saving ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />} Create user</Button></form></DialogContent></Dialog>
  </div>
}

function normalizePercent(value) { const number = Number(value); return Number.isFinite(number) ? (number <= 1 ? number * 100 : number) : 0 }

function AnalyticsView({ isDemo, notify }) {
  const [accuracy, setAccuracy] = useState(null)
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(false)
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const demoAccuracy = {
    overall_accuracy: 96.4,
    field_accuracy: [
      { field: 'Invoice number', accuracy: 99.8 }, { field: 'Invoice total', accuracy: 98.9 }, { field: 'Commodity description', accuracy: 97.2 }, { field: 'Gross weight', accuracy: 94.1 }, { field: 'Incoterms', accuracy: 91.6 }, { field: 'HSN code', accuracy: 89.4 },
    ],
    supplier_errors: [
      { supplier: 'Shenzhen Lumina Tech', errors: 4 }, { supplier: 'Apex Industrial', errors: 3 }, { supplier: 'Meridian Auto Parts', errors: 2 }, { supplier: 'Nordic Freight Systems', errors: 1 },
    ],
  }
  const demoLogs = [
    { id: 1, action: 'FIELD_EDITED', user_name: 'Priya Sharma', entity: 'SHP-24811 · Incoterms', previous_value: 'CIF Shanghai', new_value: 'FOB Shanghai', created_at: '2026-11-03T09:48:00Z' },
    { id: 2, action: 'FIELD_VERIFIED', user_name: 'Daniel Kim', entity: 'SHP-24811 · Invoice number', previous_value: '—', new_value: 'INV-2026-0934', created_at: '2026-11-03T09:42:00Z' },
    { id: 3, action: 'CHECK_OVERRIDDEN', user_name: 'Priya Sharma', entity: 'SHP-24806 · Gross weight reconciliation', previous_value: 'FAILED', new_value: 'OVERRIDDEN', created_at: '2026-11-02T17:22:00Z' },
    { id: 4, action: 'DOCUMENT_UPLOADED', user_name: 'Nina Patel', entity: 'SHP-24810 · Invoice', previous_value: '—', new_value: 'invoice-24810.pdf', created_at: '2026-11-02T15:16:00Z' },
    { id: 5, action: 'CUSTOMS_EXPORT', user_name: 'Alex Morgan', entity: 'SHP-24808', previous_value: 'APPROVED', new_value: 'EXPORTED', created_at: '2026-11-02T11:09:00Z' },
  ]
  const load = useCallback(async () => {
    if (isDemo) { setAccuracy(demoAccuracy); setLogs(demoLogs); return }
    setLoading(true)
    const [accuracyResult, auditResult] = await Promise.allSettled([api.analytics.accuracy(), api.analytics.auditLogs()])
    if (accuracyResult.status === 'fulfilled') setAccuracy(accuracyResult.value)
    else notify('Accuracy analytics unavailable', getErrorMessage(accuracyResult.reason), 'error')
    if (auditResult.status === 'fulfilled') setLogs(unwrapList(auditResult.value, ['logs', 'audit_logs', 'events']))
    else notify('Audit log unavailable', getErrorMessage(auditResult.reason), 'error')
    setLoading(false)
  }, [isDemo, notify])
  useEffect(() => { load() }, [load])

  const rawFields = accuracy?.field_accuracy ?? accuracy?.field_accuracies ?? accuracy?.fields ?? accuracy?.data?.field_accuracy ?? []
  const fieldStats = Array.isArray(rawFields) ? rawFields.map((row) => ({ field: row.field_name ?? row.field ?? row.name ?? 'Unknown field', accuracy: normalizePercent(row.accuracy ?? row.accuracy_percentage ?? row.score ?? 0) })) : Object.entries(rawFields || {}).map(([field, value]) => ({ field: humanize(field), accuracy: normalizePercent(value?.accuracy ?? value) }))
  const supplierRaw = accuracy?.supplier_errors ?? accuracy?.supplier_error_rates ?? accuracy?.suppliers ?? accuracy?.data?.supplier_errors ?? []
  const supplierStats = Array.isArray(supplierRaw) ? supplierRaw.map((row) => ({ supplier: row.supplier_name ?? row.supplier ?? row.name ?? 'Unknown supplier', errors: Number(row.error_count ?? row.errors ?? row.discrepancies ?? 0) })) : []
  const overallRaw = Number(accuracy?.overall_accuracy ?? accuracy?.average_accuracy ?? accuracy?.accuracy ?? 96.4)
  const overall = overallRaw <= 1 ? overallRaw * 100 : overallRaw
  const normalizedLogs = logs.map((log, index) => ({ ...log, id: log.id ?? log.log_id ?? index, action: log.action ?? log.event_type ?? log.event ?? 'SYSTEM_EVENT', user_name: log.user_name ?? log.full_name ?? log.actor ?? log.user_id ?? 'System', entity: log.entity ?? log.target ?? log.resource ?? log.shipment_code ?? '—', previous_value: log.previous_value ?? log.old_value ?? '—', new_value: log.new_value ?? log.current_value ?? '—', created_at: log.created_at ?? log.timestamp ?? log.event_time })).sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
  const filteredLogs = normalizedLogs.filter((log) => (filter === 'all' || String(log.action).toLowerCase().includes(filter)) && `${log.action} ${log.user_name} ${log.entity}`.toLowerCase().includes(search.toLowerCase()))
  const maxErrors = Math.max(1, ...supplierStats.map((x) => x.errors))

  return <div className="page-enter">
    <SectionHeading eyebrow="OBSERVABILITY / 05" title="Analytics & audit" description="Extraction quality, supplier discrepancy trends and immutable operator activity." action={<Button variant="outline" onClick={load}><RefreshCw size={13} /> Refresh metrics</Button>} />
    <div className="analytics-kpis"><Card className="analytics-kpi-primary"><CardContent><div className="analytics-kpi-head"><span>OVERALL EXTRACTION ACCURACY</span><Activity size={15} /></div><div className="analytics-score">{Number.isFinite(overall) ? `${overall.toFixed(1)}%` : '—'}</div><div className="analytics-score-track"><i style={{ width: `${Math.min(100, Math.max(0, overall))}%` }} /></div><small>Aggregated field-level extraction performance</small></CardContent></Card><Card><CardContent><div className="analytics-kpi-head"><span>FIELD METRICS</span><FileCheck2 size={15} /></div><div className="analytics-kpi-value">{fieldStats.length.toString().padStart(2, '0')}</div><small>Tracked field dimensions</small></CardContent></Card><Card><CardContent><div className="analytics-kpi-head"><span>SUPPLIER GROUPS</span><Building2 size={15} /></div><div className="analytics-kpi-value">{supplierStats.length.toString().padStart(2, '0')}</div><small>Supplier-level quality signals</small></CardContent></Card><Card><CardContent><div className="analytics-kpi-head"><span>AUDIT EVENTS</span><History size={15} /></div><div className="analytics-kpi-value">{normalizedLogs.length.toString().padStart(2, '0')}</div><small>Returned event records</small></CardContent></Card></div>
    <div className="analytics-chart-grid"><Card><CardHeader><div><CardTitle>Field extraction accuracy</CardTitle><p className="mt-1 text-[10px] text-slate-500">Accuracy by extracted field · higher is better</p></div><Badge variant="info">FIELD LEVEL</Badge></CardHeader><CardContent><div className="field-chart">{fieldStats.length ? fieldStats.map((row, index) => <div className="field-chart-row" key={`${row.field}-${index}`}><span>{row.field}</span><div className="field-chart-track"><i style={{ width: `${Math.min(100, Math.max(0, row.accuracy))}%` }} /></div><b>{row.accuracy.toFixed(1)}%</b></div>) : <EmptyState icon={Activity} title="No field metrics returned" description="The analytics endpoint returned no recognizable field_accuracy collection." />}</div></CardContent></Card><Card><CardHeader><div><CardTitle>Supplier discrepancy volume</CardTitle><p className="mt-1 text-[10px] text-slate-500">Historical errors grouped by supplier</p></div><Badge variant="warning">SUPPLIER QUALITY</Badge></CardHeader><CardContent><div className="supplier-chart">{supplierStats.length ? supplierStats.map((row, index) => <div className="supplier-chart-row" key={`${row.supplier}-${index}`}><div className="flex items-center justify-between"><span>{row.supplier}</span><b>{row.errors}</b></div><div className="supplier-chart-track"><i style={{ width: `${row.errors / maxErrors * 100}%` }} /></div></div>) : <EmptyState icon={Building2} title="No supplier metrics returned" description="The analytics endpoint returned no recognizable supplier error collection." />}</div></CardContent></Card></div>
    <Card className="audit-card"><div className="panel-heading"><div><div className="panel-eyebrow">IMMUTABLE EVENT STREAM</div><h2>Audit log timeline <span>{filteredLogs.length} events</span></h2></div><div className="audit-tools"><div className="table-search"><Search size={13} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search audit events..." /></div><Select value={filter} onValueChange={setFilter} options={[{ value: 'all', label: 'All events' }, { value: 'field', label: 'Field changes' }, { value: 'override', label: 'Overrides' }, { value: 'export', label: 'Exports' }, { value: 'document', label: 'Documents' }]} className="w-36" /></div></div><div className="audit-timeline">{filteredLogs.length ? filteredLogs.map((log) => <div className="audit-event" key={log.id}><div className={`audit-event-marker ${String(log.action).toLowerCase().includes('override') ? 'marker-amber' : String(log.action).toLowerCase().includes('export') ? 'marker-green' : ''}`}><Activity size={13} /></div><div className="audit-event-main"><div className="audit-event-top"><div><Badge variant={String(log.action).toLowerCase().includes('override') ? 'warning' : String(log.action).toLowerCase().includes('export') ? 'success' : 'info'}>{humanize(log.action)}</Badge><span className="audit-event-user">by <b>{log.user_name}</b></span></div><time>{log.created_at ? new Date(log.created_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'}</time></div><p className="audit-entity">{log.entity}</p><div className="audit-diff"><span className="diff-old"><small>PREVIOUS</small><b>{String(log.previous_value)}</b></span><ArrowRight size={13} /><span className="diff-new"><small>NEW VALUE</small><b>{String(log.new_value)}</b></span></div></div></div>) : <EmptyState icon={History} title="No audit events found" description="Try another filter or search term. Audit data is supplied by the backend log endpoint." />}</div><div className="table-footer"><span>IMMUTABLE AUDIT TRAIL · PREVIOUS VALUE → NEW VALUE</span><span>API <b>/api/v1/analytics/audit-logs</b></span></div></Card>
  </div>
}

export default App
