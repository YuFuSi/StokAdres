import type { ReactNode } from 'react'

export type AppPage = 'dashboard' | 'stocks' | 'addresses' | 'conflicts' | 'audit' | 'import' | 'export' | 'settings'

type AppLayoutProps = {
  children: ReactNode
  activePage: AppPage
  onNavigate: (page: AppPage) => void
}

const navigationGroups = [
  { label: 'Genel', items: [{ id: 'dashboard', label: 'Dashboard', icon: '⌂' }] },
  { label: 'Yönetim', items: [{ id: 'stocks', label: 'Stoklar', icon: '▦' }, { id: 'addresses', label: 'Adresler', icon: '⌖' }, { id: 'conflicts', label: 'Çakışmalar', icon: '!' }] },
  { label: 'Veri', items: [{ id: 'import', label: 'İçeri Aktar', icon: '↓' }, { id: 'export', label: 'Dışa Aktar', icon: '↑' }] },
  { label: 'Sistem', items: [{ id: 'audit', label: 'İşlem Geçmişi', icon: '◷' }, { id: 'settings', label: 'Ayarlar', icon: '⚙' }] },
] as const

export function AppLayout({ children, activePage, onNavigate }: AppLayoutProps) {
  return (
    <div className="app-shell">
      <aside className="app-sidebar">
        <div className="sidebar-brand">
          <span className="brand__mark">SA</span>
          <span className="brand__name">StokAdres</span>
        </div>
        <nav className="sidebar-nav" aria-label="Ana navigasyon">
          {navigationGroups.map((group) => (
            <div className="sidebar-group" key={group.label}>
              <span className="sidebar-group__label">{group.label}</span>
              {group.items.map((item) => (
                <button
                  className={`sidebar-link ${activePage === item.id ? 'sidebar-link--active' : ''}`}
                  key={item.id}
                  type="button"
                  onClick={() => onNavigate(item.id)}
                  aria-current={activePage === item.id ? 'page' : undefined}
                >
                  <span className="sidebar-link__icon" aria-hidden="true">{item.icon}</span>
                  <span>{item.label}</span>
                </button>
              ))}
            </div>
          ))}
        </nav>
        <div className="sidebar-footer"><span className="status-dot" /> Supabase bağlantısı</div>
      </aside>
      <div className="app-shell__main">{children}</div>
    </div>
  )
}
