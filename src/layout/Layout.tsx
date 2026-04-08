import { NavLink, useLocation } from 'react-router-dom';
import { NAV_ITEMS, getPageTitle } from '../lib/pages';

export const Layout = ({ children }: { children: React.ReactNode }) => {
  const location = useLocation();
  const title = getPageTitle(location.pathname);

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="sidebar__brand">
          <h1 className="sidebar__title">Управление финансовым состоянием компании</h1>
          <p className="sidebar__subtitle">Управляй финансами легко</p>
        </div>
        <nav className="nav" aria-label="Навигация">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.key}
              to={item.path}
              className={({ isActive }) => `nav__link${isActive ? ' is-active' : ''}`}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>

      <div className="shell">
        <header className="topbar">
          <h2 className="topbar__title">{title}</h2>
        </header>
        <main className="main">
          <section className="content-card">{children}</section>
        </main>
      </div>
    </div>
  );
};
