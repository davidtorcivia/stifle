import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { api } from '../api/client';

export function Layout() {
    const navigate = useNavigate();

    const handleLogout = () => {
        api.logout();
        navigate('/login');
    };

    return (
        <div className="app-container">
            <aside className="sidebar">
                <div className="sidebar-header">
                    <h1>
                        <span>◆</span> Stifle Admin
                    </h1>
                </div>
                <nav className="sidebar-nav">
                    <NavLink to="/" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} end>
                        <span className="icon">▣</span>
                        Dashboard
                    </NavLink>
                    <NavLink to="/users" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                        <span className="icon">◉</span>
                        Users
                    </NavLink>
                    <NavLink to="/groups" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                        <span className="icon">◫</span>
                        Groups
                    </NavLink>
                    <NavLink to="/invites" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                        <span className="icon">✉</span>
                        Invites
                    </NavLink>
                    <NavLink to="/waitlist" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                        <span className="icon">☷</span>
                        Waitlist
                    </NavLink>
                    <NavLink to="/settings" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                        <span className="icon">⚙</span>
                        Settings
                    </NavLink>
                    <NavLink to="/backups" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                        <span className="icon">⬡</span>
                        Backups
                    </NavLink>
                    <NavLink to="/audit-log" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                        <span className="icon">☰</span>
                        Audit Log
                    </NavLink>
                    <button onClick={handleLogout} className="nav-link" style={{ border: 'none', background: 'none', width: '100%', textAlign: 'left', marginTop: 'auto' }}>
                        <span className="icon">⏻</span>
                        Logout
                    </button>
                </nav>
            </aside>
            <main className="main-content">
                <Outlet />
            </main>
        </div>
    );
}
