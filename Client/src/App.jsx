import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity, Archive, ArrowLeft, ArrowRight, Bike, Box, CalendarClock, Check, ChevronDown,
  CircleHelp, Download, FileText, Filter, Hammer, Heart, Home, Laptop, LayoutDashboard,
  Menu, MoreHorizontal, PackageCheck, Plus, Printer, Search, Settings2, ShieldCheck,
  Sparkles, Tag, Trash2, TrendingUp, WashingMachine, Wrench, X, Zap
} from 'lucide-react';
import { api, jsonBody } from './api.js';

const categories = ['Technology', 'Appliances', 'Transport', 'Home', 'Other'];
const categoryIcons = { Technology: Laptop, Appliances: WashingMachine, Transport: Bike, Home, Other: Box };
const categoryColors = { Technology: 'violet', Appliances: 'blue', Transport: 'amber', Home: 'green', Other: 'slate' };
const today = () => new Date().toISOString().slice(0, 10);
const money = (value) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number(value || 0));
const displayDate = (value) => value ? new Date(`${value}T12:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Not set';
const dateOffset = (value) => value ? Math.ceil((new Date(`${value}T00:00:00`).getTime() - new Date(`${today()}T00:00:00`).getTime()) / 86400000) : null;
const warrantyState = (value) => { const n = dateOffset(value); return n === null ? 'unknown' : n < 0 ? 'expired' : n <= 30 ? 'soon' : 'covered'; };
const statusCopy = { expired: 'Expired', soon: 'Expiring soon', covered: 'Under warranty', unknown: 'Warranty not added' };
const statusTone = { expired: 'red', soon: 'amber', covered: 'green', unknown: 'slate' };

function ItemIcon({ category, size = 19 }) {
  const Icon = categoryIcons[category] || Box;
  return <Icon size={size} strokeWidth={1.7} />;
}
function shortDate(value) { return value ? new Date(`${value}T12:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '—'; }
function dueLabel(value) {
  const n = dateOffset(value);
  if (n === null) return 'No date set';
  if (n < 0) return `${Math.abs(n)} days overdue`;
  if (n === 0) return 'Due today';
  if (n === 1) return 'Due tomorrow';
  return `In ${n} days`;
}
function makeCsv(rows) {
  return rows.map(row => row.map(value => `"${String(value ?? '').replaceAll('"', '""')}"`).join(',')).join('\r\n');
}

export default function App() {
  const [page, setPage] = useState('overview');
  const [assets, setAssets] = useState([]);
  const [logs, setLogs] = useState([]);
  const [dbStatus, setDbStatus] = useState('checking');
  const [dbName, setDbName] = useState('keepwise');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All categories');
  const [assetFilter, setAssetFilter] = useState('All items');
  const [modal, setModal] = useState(null);
  const [selectedAsset, setSelectedAsset] = useState(null);
  const [toast, setToast] = useState('');
  const [mobileNav, setMobileNav] = useState(false);

  const loadRecords = useCallback(async (showLoader = true) => {
    if (showLoader) setLoading(true);
    try {
      const [items, serviceLogs] = await Promise.all([api('/api/assets'), api('/api/service-logs')]);
      setAssets(items); setLogs(serviceLogs); setError('');
    } catch (e) { setError(e.message); }
    finally { if (showLoader) setLoading(false); }
  }, []);

  const checkHealth = useCallback(async () => {
    try {
      const health = await api('/api/health');
      setDbStatus(health.database || 'disconnected'); setDbName(health.databaseName || 'keepwise');
    } catch { setDbStatus('offline'); }
  }, []);

  useEffect(() => { loadRecords(); checkHealth(); const id = window.setInterval(checkHealth, 6000); return () => window.clearInterval(id); }, [loadRecords, checkHealth]);
  useEffect(() => { if (dbStatus === 'connected') loadRecords(false); }, [dbStatus, loadRecords]);

  const filteredAssets = useMemo(() => assets.filter(asset => {
    const q = search.trim().toLowerCase();
    return (!q || `${asset.name} ${asset.brand} ${asset.model} ${asset.category}`.toLowerCase().includes(q))
      && (categoryFilter === 'All categories' || asset.category === categoryFilter)
      && (assetFilter === 'All items' || asset.status === assetFilter);
  }), [assets, search, categoryFilter, assetFilter]);

  const upcoming = useMemo(() => assets.flatMap(asset => {
    const tasks = [];
    const warrantyDays = dateOffset(asset.warrantyEnd);
    const serviceDays = dateOffset(asset.nextServiceDate);
    if (asset.status === 'Archived') return tasks;
    if (warrantyDays !== null && warrantyDays <= 30) tasks.push({ kind: 'warranty', asset, date: asset.warrantyEnd, days: warrantyDays, title: warrantyDays < 0 ? 'Warranty expired' : 'Warranty ending' });
    if (serviceDays !== null && serviceDays <= 30) tasks.push({ kind: 'service', asset, date: asset.nextServiceDate, days: serviceDays, title: serviceDays < 0 ? 'Service overdue' : 'Service due' });
    return tasks;
  }).sort((a, b) => a.days - b.days), [assets]);

  const stats = useMemo(() => ({
    total: assets.filter(x => x.status !== 'Archived').length,
    warranties: assets.filter(x => x.status !== 'Archived' && ['soon', 'expired'].includes(warrantyState(x.warrantyEnd))).length,
    serviceDue: assets.filter(x => x.status !== 'Archived' && (() => { const d = dateOffset(x.nextServiceDate); return d !== null && d <= 30; })()).length,
    totalSpend: logs.reduce((sum, log) => sum + Number(log.cost || 0), 0)
  }), [assets, logs]);

  const notify = (message) => { setToast(message); window.setTimeout(() => setToast(''), 2600); };
  const go = (next) => { setPage(next); setMobileNav(false); setSearch(''); setCategoryFilter('All categories'); setAssetFilter('All items'); };

  async function saveAsset(event) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    const body = Object.fromEntries(form.entries()); body.purchasePrice = Number(body.purchasePrice || 0);
    try {
      if (modal?.asset) await api(`/api/assets/${modal.asset._id}`, { method: 'PATCH', body: jsonBody(body) });
      else await api('/api/assets', { method: 'POST', body: jsonBody(body) });
      setModal(null); await loadRecords(false); notify(modal?.asset ? 'Item details updated.' : 'Item added to your collection.');
    } catch (e) { setError(e.message); }
  }

  async function saveService(event) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    const body = Object.fromEntries(form.entries()); body.cost = Number(body.cost || 0);
    try {
      if (modal?.log) await api(`/api/service-logs/${modal.log._id}`, { method: 'PATCH', body: jsonBody(body) });
      else await api('/api/service-logs', { method: 'POST', body: jsonBody(body) });
      setModal(null); await loadRecords(false); notify(modal?.log ? 'Service record updated.' : 'Service visit added to your timeline.');
    } catch (e) { setError(e.message); }
  }

  async function deleteAsset(asset) {
    if (!window.confirm(`Delete ${asset.name} and its service history?`)) return;
    try { await api(`/api/assets/${asset._id}`, { method: 'DELETE' }); setSelectedAsset(null); await loadRecords(false); notify('Item and its service history deleted.'); }
    catch (e) { setError(e.message); }
  }
  async function deleteLog(log) {
    if (!window.confirm(`Delete the service record “${log.title}”?`)) return;
    try { await api(`/api/service-logs/${log._id}`, { method: 'DELETE' }); await loadRecords(false); notify('Service record deleted.'); }
    catch (e) { setError(e.message); }
  }
  async function archiveAsset(asset) {
    try { await api(`/api/assets/${asset._id}`, { method: 'PATCH', body: jsonBody({ status: asset.status === 'Archived' ? 'Active' : 'Archived' }) }); setSelectedAsset(null); await loadRecords(false); notify(asset.status === 'Archived' ? 'Item restored.' : 'Item archived.'); }
    catch (e) { setError(e.message); }
  }
  function exportAssets() {
    const rows = [['Name', 'Category', 'Brand', 'Model', 'Purchase date', 'Warranty end', 'Purchase price', 'Next service', 'Status'], ...assets.map(a => [a.name, a.category, a.brand, a.model, a.purchaseDate, a.warrantyEnd, a.purchasePrice, a.nextServiceDate, a.status])];
    const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([makeCsv(rows)], { type: 'text/csv;charset=utf-8' })); link.download = 'keepwise-inventory.csv'; link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 1000); notify('Inventory exported as CSV.');
  }
  function openService(asset = null, log = null) { setModal({ type: 'service', asset: asset || assets.find(a => a._id === log?.assetId), log }); }

  const pageTitles = { overview: 'Overview', assets: 'My items', service: 'Service history', settings: 'Settings' };
  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileNav ? 'sidebar-open' : ''}`}>
        <div className="brand-row"><div className="brand-mark"><PackageCheck size={19} /></div><span className="brand-word">keepwise</span><span className="brand-dot">.</span></div>
        <div className="workspace-label">YOUR HOUSEHOLD</div>
        <nav className="side-nav" aria-label="Main navigation">
          <NavButton icon={LayoutDashboard} label="Overview" active={page === 'overview'} onClick={() => go('overview')} />
          <NavButton icon={Box} label="My items" count={stats.total} active={page === 'assets'} onClick={() => go('assets')} />
          <NavButton icon={Wrench} label="Service history" active={page === 'service'} onClick={() => go('service')} />
        </nav>
        <div className="sidebar-bottom">
          <div className="side-tip"><div className="tip-icon"><Sparkles size={15} /></div><strong>A little care goes a long way</strong><p>Keep receipts, service notes, and important dates in one place.</p><button onClick={() => go('assets')}>Explore your items <ArrowRight size={13} /></button></div>
          <NavButton icon={Settings2} label="Settings" active={page === 'settings'} onClick={() => go('settings')} />
          <div className="profile-row"><div className="profile-avatar">K</div><div><strong>My household</strong><span>Personal space</span></div><button className="icon-only" aria-label="Account options"><MoreHorizontal size={18} /></button></div>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <button className="mobile-menu" onClick={() => setMobileNav(v => !v)} aria-label="Toggle menu"><Menu size={19} /></button>
          <div className="breadcrumbs"><span>Keepwise</span><span className="crumb-slash">/</span><strong>{pageTitles[page]}</strong></div>
          <div className="topbar-actions">
            <div className={`db-pill ${dbStatus === 'connected' ? 'db-good' : ''}`}><i />{dbStatus === 'connected' ? 'MongoDB connected' : dbStatus === 'offline' ? 'API offline' : 'Connecting database'}</div>
            <button className="top-icon" title="Help" onClick={() => setModal({ type: 'help' })}><CircleHelp size={17} /></button>
            <div className="top-avatar">K</div>
          </div>
        </header>

        {error && <div className="error-banner"><span><Zap size={15} /> {error}</span><button onClick={() => { setError(''); loadRecords(); checkHealth(); }}>Try again <ArrowRight size={13} /></button><button aria-label="Dismiss" className="error-close" onClick={() => setError('')}><X size={15} /></button></div>}

        {page === 'overview' && <Overview assets={assets} logs={logs} upcoming={upcoming} stats={stats} loading={loading} onAdd={() => setModal({ type: 'asset' })} onOpen={setSelectedAsset} onPage={go} onAddService={openService} />}
        {page === 'assets' && <AssetsPage assets={filteredAssets} search={search} setSearch={setSearch} categoryFilter={categoryFilter} setCategoryFilter={setCategoryFilter} assetFilter={assetFilter} setAssetFilter={setAssetFilter} onAdd={() => setModal({ type: 'asset' })} onOpen={setSelectedAsset} onExport={exportAssets} />}
        {page === 'service' && <ServicePage logs={logs} assets={assets} onAdd={() => openService()} onEdit={(log) => openService(null, log)} onDelete={deleteLog} />}
        {page === 'settings' && <SettingsPage dbName={dbName} onExport={exportAssets} onSeed={async () => { try { await api('/api/demo/seed', { method: 'POST' }); await loadRecords(false); notify('Sample items loaded.'); } catch (e) { setError(e.message); } }} />}

        <footer className="app-footer"><span>Keepwise <span className="footer-dot">·</span> Care for what you own.</span><span><ShieldCheck size={13} /> Your household data stays in your MongoDB</span></footer>
      </main>

      {selectedAsset && <AssetDrawer asset={assets.find(a => a._id === selectedAsset._id) || selectedAsset} logs={logs.filter(log => log.assetId === selectedAsset._id)} onClose={() => setSelectedAsset(null)} onEdit={() => { setModal({ type: 'asset', asset: selectedAsset }); setSelectedAsset(null); }} onDelete={() => deleteAsset(selectedAsset)} onArchive={() => archiveAsset(selectedAsset)} onAddService={() => openService(selectedAsset)} onEditLog={(log) => { setSelectedAsset(null); openService(null, log); }} />}
      {modal && <Modal modal={modal} assets={assets} onClose={() => setModal(null)} onSaveAsset={saveAsset} onSaveService={saveService} onSeed={async () => { try { await api('/api/demo/seed', { method: 'POST' }); await loadRecords(false); setModal(null); notify('Sample items loaded.'); } catch (e) { setError(e.message); } }} />}
      <div className={`toast ${toast ? 'toast-show' : ''}`} role="status">{toast}</div>
    </div>
  );
}

function NavButton({ icon: Icon, label, count, active, onClick }) {
  return <button className={`nav-button ${active ? 'nav-active' : ''}`} onClick={onClick}><Icon size={17} strokeWidth={1.8} /><span>{label}</span>{count != null && <b className="nav-count">{count}</b>}</button>;
}

function PageHeading({ eyebrow, title, description, action, children }) {
  return <div className="page-heading"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{description}</p></div>{action || children}</div>;
}

function Overview({ assets, logs, upcoming, stats, loading, onAdd, onOpen, onPage, onAddService }) {
  const activeItems = assets.filter(a => a.status !== 'Archived');
  const recentLogs = logs.slice().sort((a, b) => b.serviceDate.localeCompare(a.serviceDate)).slice(0, 4);
  return <section className="page-content">
    <PageHeading eyebrow="YOUR HOME, LOOKING AFTER ITSELF" title="Care for the things you own." description="Warranties, maintenance, and repair history—together in one calm place." action={<button className="btn btn-primary" onClick={onAdd}><Plus size={16} /> Add an item</button>} />
    <div className="overview-hero"><div className="hero-copy"><div className="hero-kicker"><span className="hero-spark"><Sparkles size={14} /></span> A CLEARER PICTURE OF WHAT YOU OWN</div><h2>Good things last longer<br />when you keep an eye on them.</h2><p>Keep important dates close, so a small reminder can save a bigger repair later.</p><button className="hero-link" onClick={() => onPage('assets')}>View your collection <ArrowRight size={14} /></button></div><div className="hero-art" aria-hidden="true"><div className="art-ring ring-one"/><div className="art-ring ring-two"/><div className="art-card art-card-back"><div className="art-dot-row"><i/><i/><i/></div><div className="art-line short"/><div className="art-line"/><div className="art-progress"><span/></div></div><div className="art-card art-card-front"><div className="art-product"><Laptop size={26}/></div><div className="art-front-lines"><i/><i/><i/></div><span className="art-check"><Check size={15}/></span></div><div className="art-badge"><ShieldCheck size={15}/><span>in good hands</span></div></div><div className="hero-wave"/></div>

    <div className="metric-grid">
      <Metric icon={Box} label="ITEMS TRACKED" value={stats.total} tone="green" foot="Across your household" />
      <Metric icon={ShieldCheck} label="WARRANTY WATCH" value={stats.warranties} tone="violet" foot={stats.warranties ? 'Expired or ending within 30 days' : 'Nothing expiring soon'} />
      <Metric icon={CalendarClock} label="SERVICE TO PLAN" value={stats.serviceDue} tone="amber" foot={stats.serviceDue ? 'Due soon or overdue' : 'All service dates look clear'} />
      <Metric icon={TrendingUp} label="CARE SPEND" value={money(stats.totalSpend)} tone="blue" foot="Recorded repair & service costs" />
    </div>

    <div className="dashboard-grid">
      <section className="surface items-surface"><div className="section-head"><div><h2>Your collection</h2><p>A few things in your household</p></div><button className="inline-link" onClick={() => onPage('assets')}>All items <ArrowRight size={14}/></button></div>
        {loading ? <LoadingRows/> : activeItems.length ? <div className="asset-grid">{activeItems.slice(0, 4).map(asset => <AssetCard key={asset._id} asset={asset} onClick={() => onOpen(asset)} />)}</div> : <EmptyState icon={PackageCheck} title="Start with one important item" message="Add a phone, appliance, bike, or anything you want to look after." action="Add your first item" onAction={onAdd} />}
      </section>
      <section className="surface upcoming-surface"><div className="section-head"><div><h2>Dates to keep an eye on</h2><p>Warranty & service coming up</p></div><span className="count-bubble">{upcoming.length}</span></div>
        {upcoming.length ? <div className="upcoming-list">{upcoming.slice(0, 5).map((row) => <button className="upcoming-row" key={`${row.asset._id}-${row.kind}`} onClick={() => onOpen(row.asset)}><span className={`upcoming-icon ${row.kind === 'warranty' ? 'warranty-icon' : 'service-icon'}`}>{row.kind === 'warranty' ? <ShieldCheck size={16}/> : <Wrench size={16}/>}</span><span className="upcoming-info"><strong>{row.title}</strong><small>{row.asset.name} <i>·</i> {displayDate(row.date)}</small></span><span className={`days-label ${row.days < 0 ? 'days-overdue' : row.days <= 14 ? 'days-soon' : ''}`}>{dueLabel(row.date)}</span><ArrowRight className="row-arrow" size={14}/></button>)}</div> : <EmptyState icon={Check} title="You're all up to date" message="No warranties or service dates need attention right now." />}
        <button className="soft-action" onClick={() => onPage('assets')}>Review all dates <ArrowRight size={14}/></button>
      </section>
    </div>

    <div className="bottom-grid">
      <section className="surface service-surface"><div className="section-head"><div><h2>Recent care</h2><p>Your latest repairs and service visits</p></div><button className="inline-link" onClick={() => onPage('service')}>Full history <ArrowRight size={14}/></button></div>
        {recentLogs.length ? <div className="recent-list">{recentLogs.map(log => <div className="recent-row" key={log._id}><span className="recent-icon"><Hammer size={15}/></span><span className="recent-main"><strong>{log.title}</strong><small>{log.assetName} <i>·</i> {displayDate(log.serviceDate)}</small></span><span className="recent-cost">{Number(log.cost) ? money(log.cost) : 'No charge'}</span></div>)}</div> : <EmptyState icon={Wrench} title="No service records yet" message="Log a repair or routine service to build a useful history." action="Add service record" onAction={() => onAddService()} />}
      </section>
      <section className="care-note"><div className="care-note-icon"><Heart size={18}/></div><div className="care-note-label">SMALL THINGS ADD UP</div><h3>Know what you have.<br/>Know when it needs care.</h3><p>A clear repair history makes it easier to explain a problem, compare costs, and plan what comes next.</p><button onClick={() => onPage('service')}>Explore service history <ArrowRight size={14}/></button><div className="care-deco">✳</div></section>
    </div>
  </section>;
}

function Metric({ icon: Icon, label, value, tone, foot }) {
  return <article className="metric-card"><div className="metric-top"><span className={`metric-icon ${tone}`}><Icon size={16} strokeWidth={1.8}/></span><span className="metric-label">{label}</span><button className="metric-more" aria-label={`${label} info`} title={foot}><MoreHorizontal size={17}/></button></div><strong className={`metric-value ${typeof value === 'string' && value.length > 8 ? 'metric-small' : ''}`}>{value}</strong><span className="metric-foot">{foot}</span></article>;
}

function LoadingRows() { return <div className="loading-grid"><div/><div/><div/></div>; }
function EmptyState({ icon: Icon, title, message, action, onAction }) {
  return <div className="empty-state"><span className="empty-icon"><Icon size={19}/></span><strong>{title}</strong><p>{message}</p>{action && <button className="inline-link" onClick={onAction}>{action} <ArrowRight size={14}/></button>}</div>;
}

function AssetCard({ asset, onClick }) {
  const state = warrantyState(asset.warrantyEnd);
  return <button className="asset-card" onClick={onClick}><div className="asset-card-top"><span className={`asset-symbol ${categoryColors[asset.category] || 'slate'}`}><ItemIcon category={asset.category} size={20}/></span><span className={`mini-status ${statusTone[state]}`}><i/>{statusCopy[state]}</span></div><strong className="asset-card-name">{asset.name}</strong><span className="asset-card-meta">{[asset.brand, asset.model].filter(Boolean).join(' · ') || asset.category}</span><div className="asset-card-bottom"><span><ShieldCheck size={13}/>{state === 'unknown' ? 'Add warranty date' : state === 'expired' ? 'Warranty ended' : `Warranty ${shortDate(asset.warrantyEnd)}`}</span><ArrowRight size={14}/></div></button>;
}

function AssetsPage({ assets, search, setSearch, categoryFilter, setCategoryFilter, assetFilter, setAssetFilter, onAdd, onOpen, onExport }) {
  return <section className="page-content"><PageHeading eyebrow="YOUR HOUSEHOLD INVENTORY" title="My items" description="The useful details, dates, and history for things you own." action={<div className="heading-actions"><button className="btn btn-secondary" onClick={onExport}><Download size={15}/> Export</button><button className="btn btn-primary" onClick={onAdd}><Plus size={16}/> Add an item</button></div>} />
    <div className="surface inventory-surface"><div className="inventory-toolbar"><label className="search-field"><Search size={16}/><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name, brand, or model"/></label><label className="filter-select"><Filter size={14}/><select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}><option>All categories</option>{categories.map(c => <option key={c}>{c}</option>)}</select><ChevronDown size={14}/></label><label className="filter-select"><select value={assetFilter} onChange={e => setAssetFilter(e.target.value)}><option>All items</option><option>Active</option><option>Archived</option></select><ChevronDown size={14}/></label></div>
      {assets.length ? <div className="inventory-grid">{assets.map(asset => <AssetCard key={asset._id} asset={asset} onClick={() => onOpen(asset)} />)}</div> : <EmptyState icon={Box} title="No items match that search" message="Try a different name or category, or add a new item." action="Add an item" onAction={onAdd} />}
      <div className="inventory-foot"><span>Showing {assets.length} item{assets.length === 1 ? '' : 's'}</span><span>Details are saved to your Keepwise database</span></div>
    </div>
  </section>;
}

function ServicePage({ logs, assets, onAdd, onEdit, onDelete }) {
  const assetMap = new Map(assets.map(a => [a._id, a]));
  const sorted = logs.slice().sort((a,b) => b.serviceDate.localeCompare(a.serviceDate));
  return <section className="page-content"><PageHeading eyebrow="REPAIRS & MAINTENANCE" title="Service history" description="Every repair, routine check, and cost—easy to find later." action={<button className="btn btn-primary" onClick={onAdd}><Plus size={16}/> Log a service visit</button>} />
    <div className="service-summary-row"><div className="service-summary"><span className="summary-icon green"><Activity size={16}/></span><div><small>RECORDS LOGGED</small><strong>{logs.length}</strong></div></div><div className="service-summary"><span className="summary-icon blue"><TrendingUp size={16}/></span><div><small>TOTAL CARE SPEND</small><strong>{money(logs.reduce((n,log)=>n+Number(log.cost||0),0))}</strong></div></div><div className="service-summary"><span className="summary-icon amber"><CalendarClock size={16}/></span><div><small>ITEMS WITH SERVICE PLANNED</small><strong>{assets.filter(a=>a.nextServiceDate).length}</strong></div></div></div>
    <section className="surface timeline-surface"><div className="section-head"><div><h2>Care timeline</h2><p>Your items, looked after over time</p></div><span className="count-bubble">{logs.length}</span></div>
      {sorted.length ? <div className="timeline-list">{sorted.map(log => <article className="timeline-entry" key={log._id}><div className="timeline-rail"><span className="timeline-dot"><Wrench size={13}/></span><i/></div><div className="timeline-card"><div className="timeline-card-top"><div><span className="timeline-date">{displayDate(log.serviceDate)}</span><h3>{log.title}</h3><p className="timeline-asset"><ItemIcon category={assetMap.get(log.assetId)?.category} size={13}/>{log.assetName || assetMap.get(log.assetId)?.name || 'Household item'}</p></div><div className="timeline-actions"><span className="timeline-cost">{Number(log.cost) ? money(log.cost) : 'No charge'}</span><button className="icon-only" onClick={() => onEdit(log)} title="Edit record"><Settings2 size={15}/></button><button className="icon-only danger-hover" onClick={() => onDelete(log)} title="Delete record"><Trash2 size={15}/></button></div></div>{log.notes && <p className="timeline-notes">{log.notes}</p>}<div className="timeline-meta">{log.provider && <span><Wrench size={12}/>{log.provider}</span>}{log.nextServiceDate && <span><CalendarClock size={12}/>Next check {displayDate(log.nextServiceDate)}</span>}</div></div></article>)}</div> : <EmptyState icon={Wrench} title="Your service timeline starts here" message="Add the first repair or maintenance visit to keep useful details in one place." action="Log a service visit" onAction={onAdd} />}
    </section>
  </section>;
}

function SettingsPage({ dbName, onExport, onSeed }) {
  return <section className="page-content"><PageHeading eyebrow="YOUR KEEPWISE SPACE" title="Settings" description="Manage your local demo data and see where it is stored." />
    <div className="settings-layout"><section className="surface settings-card"><div className="settings-heading"><div className="settings-symbol"><DatabaseSymbol/></div><div><h2>MongoDB connection</h2><p>Keepwise saves item and service records in your connected database.</p></div><span className="settings-live"><i/> LIVE STATUS</span></div><div className="settings-detail"><span>Database name</span><code>{dbName}</code></div><div className="settings-detail"><span>Collections</span><code>assets · serviceLogs</code></div><div className="settings-help"><CircleHelp size={15}/><p>Connect MongoDB Compass to the same URI in <code>server/.env</code> to inspect these collections as you use the app.</p></div></section>
      <section className="surface settings-card"><div className="settings-heading"><div className="settings-symbol warm"><FileText size={17}/></div><div><h2>Your data, your copy</h2><p>Export an inventory snapshot or load safe demo records.</p></div></div><div className="settings-actions"><button className="btn btn-secondary" onClick={onExport}><Download size={15}/> Export inventory CSV</button><button className="btn btn-secondary" onClick={onSeed}><Sparkles size={15}/> Load sample records</button></div><p className="settings-caption">Sample data is only added when the inventory is empty, so existing records are kept safe.</p></section></div>
    <div className="privacy-note"><ShieldCheck size={16}/><div><strong>Built for a single-household demo</strong><p>Keepwise is a course project prototype. Don’t store passwords, payment details, or highly sensitive documents in this demo database.</p></div></div>
  </section>;
}
function DatabaseSymbol() { return <span className="database-symbol">▤</span>; }

function AssetDrawer({ asset, logs, onClose, onEdit, onDelete, onArchive, onAddService, onEditLog }) {
  const state = warrantyState(asset.warrantyEnd);
  const sorted = logs.slice().sort((a,b) => b.serviceDate.localeCompare(a.serviceDate));
  return <div className="drawer-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}><aside className="asset-drawer" aria-label={`${asset.name} details`}><div className="drawer-top"><button className="back-button" onClick={onClose}><ArrowLeft size={15}/> Back to items</button><button className="icon-only" onClick={onClose} aria-label="Close"><X size={18}/></button></div><div className="drawer-product"><span className={`asset-symbol large ${categoryColors[asset.category] || 'slate'}`}><ItemIcon category={asset.category} size={26}/></span><span className="drawer-category">{asset.category}</span><h2>{asset.name}</h2><p>{[asset.brand, asset.model].filter(Boolean).join(' · ') || 'Add brand and model details'}</p><span className={`mini-status ${statusTone[state]}`}><i/>{statusCopy[state]}</span></div><div className="drawer-actions"><button className="btn btn-primary" onClick={onAddService}><Plus size={15}/> Log service</button><button className="btn btn-secondary" onClick={onEdit}><Settings2 size={15}/> Edit item</button><button className="icon-button" onClick={onDelete} title="Delete item"><Trash2 size={15}/></button></div><div className="drawer-section"><div className="drawer-section-title"><h3>Key dates</h3><span>KEEP AN EYE ON THESE</span></div><div className="detail-date-grid"><DateTile icon={Tag} label="Purchased" date={asset.purchaseDate}/><DateTile icon={ShieldCheck} label="Warranty ends" date={asset.warrantyEnd} tone={statusTone[state]} /><DateTile icon={CalendarClock} label="Next service" date={asset.nextServiceDate} tone={dateOffset(asset.nextServiceDate) !== null && dateOffset(asset.nextServiceDate) <= 30 ? 'amber' : ''}/><DateTile icon={Box} label="Purchase price" date={asset.purchasePrice ? money(asset.purchasePrice) : 'Not added'}/></div></div><div className="drawer-section"><div className="drawer-section-title"><h3>Service timeline</h3><span>{logs.length} RECORD{logs.length === 1 ? '' : 'S'}</span></div>{sorted.length ? <div className="drawer-log-list">{sorted.map(log=><div className="drawer-log" key={log._id}><span className="drawer-log-dot"/><div><strong>{log.title}</strong><small>{displayDate(log.serviceDate)}{Number(log.cost) ? ` · ${money(log.cost)}` : ''}</small>{log.notes && <p>{log.notes}</p>}</div><button className="icon-only" onClick={() => onEditLog(log)} title="Edit service record"><Settings2 size={14}/></button></div>)}</div>:<p className="drawer-empty">No service visits recorded for this item yet.</p>}</div>{asset.notes && <div className="drawer-section"><div className="drawer-section-title"><h3>Notes</h3></div><p className="drawer-notes">{asset.notes}</p></div>}<div className="drawer-bottom"><button className="archive-button" onClick={onArchive}><Archive size={14}/>{asset.status === 'Archived' ? 'Restore this item' : 'Archive this item'}</button><button className="print-button" onClick={() => window.print()}><Printer size={14}/>Print service brief</button></div></aside></div>;
}
function DateTile({ icon: Icon, label, date, tone = '' }) { return <div className="date-tile"><span className={`date-tile-icon ${tone}`}><Icon size={14}/></span><small>{label}</small><strong>{typeof date === 'string' && date.match(/^\d{4}-\d{2}-\d{2}$/) ? displayDate(date) : date || 'Not set'}</strong></div>; }

function Modal({ modal, assets, onClose, onSaveAsset, onSaveService, onSeed }) {
  useEffect(() => { const handler = e => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', handler); return () => window.removeEventListener('keydown', handler); }, [onClose]);
  if (modal.type === 'asset') return <Dialog onClose={onClose} title={modal.asset ? 'Edit item details' : 'Add an item'} subtitle={modal.asset ? 'Update the useful details and dates for this item.' : 'Start a useful record with the details you’ll want later.'} icon={Box}>
    <form className="form-grid" onSubmit={onSaveAsset}><div className="form-two"><Field label="Item name" required><input name="name" required maxLength="80" placeholder="e.g. Coffee machine" defaultValue={modal.asset?.name || ''}/></Field><Field label="Category" required><select name="category" required defaultValue={modal.asset?.category || 'Technology'}>{categories.map(c=><option key={c}>{c}</option>)}</select></Field></div><div className="form-two"><Field label="Brand"><input name="brand" maxLength="50" placeholder="e.g. Apple" defaultValue={modal.asset?.brand || ''}/></Field><Field label="Model"><input name="model" maxLength="70" placeholder="Model name or number" defaultValue={modal.asset?.model || ''}/></Field></div><div className="form-two"><Field label="Purchase date"><input name="purchaseDate" type="date" defaultValue={modal.asset?.purchaseDate || ''}/></Field><Field label="Warranty end date"><input name="warrantyEnd" type="date" defaultValue={modal.asset?.warrantyEnd || ''}/></Field></div><div className="form-two"><Field label="Purchase price"><div className="money-input"><span>₹</span><input name="purchasePrice" type="number" min="0" step="1" placeholder="0" defaultValue={modal.asset?.purchasePrice || ''}/></div></Field><Field label="Next service date"><input name="nextServiceDate" type="date" defaultValue={modal.asset?.nextServiceDate || ''}/></Field></div><Field label="Notes"><textarea name="notes" maxLength="500" rows="3" placeholder="Anything useful to remember about this item" defaultValue={modal.asset?.notes || ''}/></Field><div className="form-actions"><button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button><button type="submit" className="btn btn-primary"><Check size={15}/>{modal.asset ? 'Save changes' : 'Add to Keepwise'}</button></div><p className="form-footnote"><ShieldCheck size={13}/> Item details are saved to your connected MongoDB database.</p></form>
  </Dialog>;
  if (modal.type === 'service') return <Dialog onClose={onClose} title={modal.log ? 'Edit service record' : 'Log a service visit'} subtitle="Keep the repair details and cost together with your item." icon={Wrench}>
    <form className="form-grid" onSubmit={onSaveService}><Field label="Item" required><select name="assetId" required defaultValue={modal.log?.assetId || modal.asset?._id || ''} disabled={Boolean(modal.log || modal.asset)}>{assets.filter(a=>a.status!=='Archived').map(a=><option key={a._id} value={a._id}>{a.name}</option>)}</select>{(modal.log?.assetId || modal.asset?._id) && <input type="hidden" name="assetId" value={modal.log?.assetId || modal.asset?._id} />}{assets.filter(a=>a.status!=='Archived').length===0 && <small className="field-help">Add an item first to record a service visit.</small>}</Field><Field label="Service or repair title" required><input name="title" required maxLength="100" placeholder="e.g. Replaced battery" defaultValue={modal.log?.title || ''}/></Field><div className="form-two"><Field label="Service date" required><input name="serviceDate" type="date" required defaultValue={modal.log?.serviceDate || today()}/></Field><Field label="Cost"><div className="money-input"><span>₹</span><input name="cost" type="number" min="0" step="1" placeholder="0" defaultValue={modal.log?.cost ?? ''}/></div></Field></div><div className="form-two"><Field label="Service provider"><input name="provider" maxLength="80" placeholder="Shop or technician" defaultValue={modal.log?.provider || ''}/></Field><Field label="Next service date"><input name="nextServiceDate" type="date" defaultValue={modal.log?.nextServiceDate || ''}/></Field></div><Field label="What was done? (optional)"><textarea name="notes" maxLength="500" rows="3" placeholder="Parts replaced, issue checked, or any follow-up" defaultValue={modal.log?.notes || ''}/></Field><div className="form-actions"><button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button><button type="submit" className="btn btn-primary"><Check size={15}/>{modal.log ? 'Save record' : 'Add service record'}</button></div></form>
  </Dialog>;
  if (modal.type === 'help') return <Dialog onClose={onClose} title="A little help" subtitle="Keepwise works best when each item has a few key dates." icon={CircleHelp}><div className="help-content"><div><strong>Warranty end date</strong><p>Add the date shown on your warranty card or invoice. Keepwise flags dates that are expired or within 30 days.</p></div><div><strong>Next service</strong><p>Add a date directly to an item, or include a next service date when you log a repair.</p></div><div><strong>Service brief</strong><p>Open an item and choose Print service brief to prepare a simple, printable record.</p></div><button className="btn btn-primary full-button" onClick={onClose}>Got it</button></div></Dialog>;
  if (modal.type === 'seed') return <Dialog onClose={onClose} title="Load sample records?" subtitle="Sample items appear in your own Keepwise database so you can explore the app." icon={Sparkles}><div className="help-content"><p>Sample data is only added if your collection is empty. Existing items are never overwritten.</p><div className="form-actions"><button className="btn btn-secondary" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={onSeed}><Sparkles size={15}/>Load samples</button></div></div></Dialog>;
  return null;
}
function Dialog({ children, onClose, title, subtitle, icon: Icon }) { return <div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}><section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div className="modal-top"><div className="modal-icon"><Icon size={18}/></div><button className="icon-only" onClick={onClose} aria-label="Close"><X size={18}/></button></div><h2 id="modal-title">{title}</h2><p className="modal-subtitle">{subtitle}</p>{children}</section></div>; }
function Field({ label, required = false, children }) { return <label className="form-field"><span>{label}{required && <b> *</b>}</span>{children}</label>; }
