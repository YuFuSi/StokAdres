import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Boxes, ChevronLeft, ClipboardList, History, Home, Import, MapPin, PackageSearch, Search, Settings, Upload, X } from 'lucide-react'
import { checkConnection, CONNECTION_CHECK_INTERVAL_MS, offlineReason, PAUSED_PROJECT_HINT, type ConnectionState } from '../services/connectionStatus'
import { queryProducts, type ProductListItem } from '../services/productService'
import { findActiveAddresses, type AddressLite } from '../services/productLookup'

export type AppPage = 'dashboard' | 'stocks' | 'addresses' | 'find' | 'caba' | 'audit' | 'import' | 'export' | 'settings'
type AppLayoutProps = { children: ReactNode; activePage: AppPage; onNavigate: (page: AppPage) => void; onProductSelect: (productId: string) => void }
type NavItem = { id: AppPage; label: string; icon: typeof Home }

// Palet tek seferde bu kadar stok gösterir; daraltmak için kullanıcı yazmaya
// devam eder.
const MAX_STOCK_RESULTS = 7
const PALETTE_DEBOUNCE_MS = 250

/** Sonuçlar hangi sorguya ait: Enter'a basıldığında eski bir sorgunun ilk
 *  sonucunu açmamak için sorguyla birlikte tutuluyor. */
type PaletteResults = { query: string; items: ProductListItem[]; addresses: Map<string, AddressLite[]> }
const EMPTY_RESULTS: PaletteResults = { query: '', items: [], addresses: new Map() }

const navigationGroups: { label: string; items: NavItem[] }[] = [
  { label: 'Operasyon', items: [{ id: 'dashboard', label: 'Genel Bakış', icon: Home }, { id: 'stocks', label: 'Stoklar', icon: Boxes }, { id: 'addresses', label: 'Adresler', icon: MapPin }, { id: 'find', label: 'Adres Bul', icon: PackageSearch }, { id: 'caba', label: 'CABA Listesi', icon: ClipboardList }] },
  { label: 'Veri', items: [{ id: 'import', label: 'İçe Aktar', icon: Import }, { id: 'export', label: 'Dışa Aktar', icon: Upload }] },
  { label: 'Sistem', items: [{ id: 'audit', label: 'İşlem Geçmişi', icon: History }, { id: 'settings', label: 'Ayarlar', icon: Settings }] },
]
const commandItems: Array<{ label: string; page: AppPage; hint: string }> = [{ label: 'Stok ara', page: 'stocks', hint: 'Stok listesine git' }, { label: 'Adres ara', page: 'find', hint: 'Hızlı operasyon araması' }, { label: 'CABA listesi', page: 'caba', hint: 'Fiş yapıştır, adresleri bul' }, { label: 'Stok ekle', page: 'stocks', hint: 'Stoklar ekranını aç' }, { label: 'Excel içe aktar', page: 'import', hint: 'Veri içe aktarma' }, { label: 'Dışa aktar', page: 'export', hint: 'Veri dışa aktarma' }, { label: 'Ayarlar', page: 'settings', hint: 'Uygulama tercihleri' }]

const CONNECTION_LABEL: Record<ConnectionState, { title: string; detail: string }> = {
  checking: { title: 'Bağlantı denetleniyor', detail: 'Supabase yanıtı bekleniyor' },
  online: { title: 'Sistem çevrimiçi', detail: 'Supabase bağlantısı aktif' },
  offline: { title: 'Veritabanına ulaşılamıyor', detail: 'Ayrıntı için Ayarlar' },
}
// Çevrimdışının iki farklı sebebi var ve kullanıcıyı farklı yere baktırıyor:
// internet yoksa bilgisayara, internet varken veritabanı yanıt vermiyorsa
// (ücretsiz proje durdurulmuş olabilir) Supabase'e.
const NO_INTERNET_LABEL = { title: 'İnternet yok', detail: 'Bilgisayarın bağlantısını kontrol edin' }

export function AppLayout({ children, activePage, onNavigate, onProductSelect }: AppLayoutProps) {
  const [connection, setConnection] = useState<ConnectionState>('checking')
  const [isCommandOpen, setIsCommandOpen] = useState(false); const [query, setQuery] = useState(''); const [collapsed, setCollapsed] = useState(false)
  const [results, setResults] = useState<PaletteResults>(EMPTY_RESULTS)
  const [isSearching, setIsSearching] = useState(false)
  const [searchError, setSearchError] = useState('')
  // Üst bardaki konum satırı eskiden sabit "StokAdres / Operasyon" yazıp altına
  // ayrıca sayfa adını basıyordu: grup yanlıştı (Ayarlar'da bile "Operasyon"
  // diyordu) ve sayfa adı ekranda dördüncü kez tekrarlanıyordu. Artık tek satır
  // ve grup gerçek gruptan geliyor.
  const activeEntry = navigationGroups
    .flatMap((group) => group.items.map((item) => ({ group: group.label, item })))
    .find((entry) => entry.item.id === activePage)
  const activeLabel = activeEntry?.item.label ?? 'StokAdres'
  const activeGroup = activeEntry?.group ?? 'StokAdres'
  const isNoInternet = connection === 'offline' && offlineReason() === 'no-internet'
  const connectionLabel = isNoInternet ? NO_INTERNET_LABEL : CONNECTION_LABEL[connection]
  const visibleCommands = useMemo(() => commandItems.filter((item) => item.label.toLocaleLowerCase('tr-TR').includes(query.toLocaleLowerCase('tr-TR'))), [query])

  // Gösterge bir şey iddia ediyorsa doğrulanmış olmalı: periyodik ve pencere
  // odağa döndüğünde kontrol. Uyku sonrası ilk bakışta güncel olması için
  // odak olayı da dinleniyor.
  useEffect(() => {
    let cancelled = false
    const run = () => { void checkConnection().then((ok) => { if (!cancelled) setConnection(ok ? 'online' : 'offline') }) }
    run()
    const timer = window.setInterval(run, CONNECTION_CHECK_INTERVAL_MS)
    window.addEventListener('focus', run)
    // İnternet gidip geldiğinde bir sonraki 60 sn'lik turu beklemeden denetle.
    window.addEventListener('online', run)
    window.addEventListener('offline', run)
    return () => { cancelled = true; window.clearInterval(timer); window.removeEventListener('focus', run); window.removeEventListener('online', run); window.removeEventListener('offline', run) }
  }, [])

  // Palet stok araması sunucuda (`search_products`). Eskiden palet açıldığında
  // listProducts() + tüm adres kayıtları çekiliyordu: 94.900 üründe ~95 istek /
  // ~33 MB, her Ctrl+K'da. Artık açılış hiçbir şey çekmiyor; yazınca debounce
  // sonrası 2 istek (arama + görünen en fazla 7 ürünün adresleri). Desen Adres
  // Bul ekranıyla (OperationsPage Finder) aynı.
  const trimmedQuery = query.trim()
  useEffect(() => {
    if (!trimmedQuery) {
      setResults(EMPTY_RESULTS)
      setIsSearching(false)
      setSearchError('')
      return
    }
    let cancelled = false
    setIsSearching(true)
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const { items } = await queryProducts({ query: trimmedQuery, pageSize: MAX_STOCK_RESULTS })
          if (cancelled) return
          const addresses = await findActiveAddresses(items.map((item) => item.id))
          if (cancelled) return
          setResults({ query: trimmedQuery, items, addresses })
          setSearchError('')
        } catch (reason: unknown) {
          console.error(reason)
          if (cancelled) return
          setResults({ query: trimmedQuery, items: [], addresses: new Map() })
          setSearchError('Arama yapılamadı. Bağlantınızı kontrol edin.')
        } finally {
          if (!cancelled) setIsSearching(false)
        }
      })()
    }, PALETTE_DEBOUNCE_MS)
    return () => { cancelled = true; window.clearTimeout(timer) }
  }, [trimmedQuery])

  // Yazmaya devam ederken önceki sonuçlar ekranda kalır (titremesin), ama Enter
  // yalnızca ekrandaki sorguya ait sonucu açar.
  const stockResults = results.items
  const resultsAreCurrent = results.query === trimmedQuery
  const activeAddressesFor = (product: ProductListItem) => results.addresses.get(product.id) ?? []

  const navigate = (page: AppPage) => { onNavigate(page); setIsCommandOpen(false); setQuery('') }
  const runCommand = (item: typeof commandItems[number]) => {
    navigate(item.page)
    if (item.label === 'Stok ekle') window.setTimeout(() => window.dispatchEvent(new Event('stokadres:create-product')), 0)
  }
  const openProduct = (productId: string) => { setIsCommandOpen(false); setQuery(''); onProductSelect(productId) }

  useEffect(() => { const handleKey = (event: KeyboardEvent) => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); setIsCommandOpen(true) } if (event.key === 'Escape') setIsCommandOpen(false) }; window.addEventListener('keydown', handleKey); return () => window.removeEventListener('keydown', handleKey) }, [])

  const hasQuery = trimmedQuery.length > 0
  const hasNoResults = hasQuery && resultsAreCurrent && !isSearching && stockResults.length === 0 && visibleCommands.length === 0 && !searchError

  return <div className={`app-shell ${collapsed ? 'app-shell--collapsed' : ''}`}><aside className="app-sidebar"><div className="sidebar-brand"><span className="brand__mark">SA</span><span className="sidebar-brand__words"><span className="brand__name">StokAdres</span><small className="brand__context">Depo Yönetimi</small></span><button className="sidebar-collapse" type="button" onClick={() => setCollapsed((value) => !value)} title={collapsed ? 'Menüyü genişlet' : 'Menüyü daralt'}><ChevronLeft size={16}/></button></div><nav className="sidebar-nav" aria-label="Ana navigasyon">{navigationGroups.map((group) => <div className="sidebar-group" key={group.label}><span className="sidebar-group__label">{group.label}</span>{group.items.map((item) => { const Icon = item.icon; return <button title={collapsed ? item.label : undefined} className={`sidebar-link ${activePage === item.id ? 'sidebar-link--active' : ''}`} key={item.id} type="button" onClick={() => navigate(item.id)} aria-current={activePage === item.id ? 'page' : undefined}><Icon size={16} strokeWidth={1.75} /><span>{item.label}</span></button> })}</div>)}</nav><div className="sidebar-footer" title={connection === 'offline' && !isNoInternet ? PAUSED_PROJECT_HINT : undefined}><span className={`status-dot status-dot--${connection}`} /><span><strong>{connectionLabel.title}</strong><small>{connectionLabel.detail}</small></span></div></aside><div className="app-shell__main"><header className="application-bar"><nav className="application-bar__crumb" aria-label="Konum"><span>{activeGroup}</span><i aria-hidden="true">/</i><strong>{activeLabel}</strong></nav><button className="command-trigger" type="button" onClick={() => setIsCommandOpen(true)}><Search size={15} /><span>Stok, barkod veya adres ara</span><kbd>Ctrl K</kbd></button></header>{children}</div>{isCommandOpen && <div className="command-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setIsCommandOpen(false) }}><section className="command-palette" role="dialog" aria-modal="true" aria-label="Hızlı komutlar"><div className="command-palette__input"><Search size={18} /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key !== 'Enter') return; event.preventDefault(); if (hasQuery && !resultsAreCurrent) return; if (stockResults[0]) openProduct(stockResults[0].id); else if (visibleCommands[0]) runCommand(visibleCommands[0]) }} placeholder="Stok kodu, stok adı, barkod veya adres ara..." /><button type="button" onClick={() => setIsCommandOpen(false)} aria-label="Komut paletini kapat"><X size={17} /></button></div><div className="command-palette__list">

    {hasQuery && stockResults.length > 0 && <>
      <p className="command-palette__group">Stoklar</p>
      {stockResults.map((product) => { const addresses = activeAddressesFor(product); return <button type="button" key={product.id} onClick={() => openProduct(product.id)}><span><strong>{product.stockCode}</strong><small>{product.stockName}</small></span><span className="command-palette__address">{addresses.length ? addresses.map((record) => record.address).join(', ') : 'Adres yok'}</span></button> })}
    </>}

    {visibleCommands.length > 0 && <>
      {hasQuery && stockResults.length > 0 && <p className="command-palette__group">Komutlar</p>}
      {visibleCommands.map((item) => <button type="button" key={item.label} onClick={() => runCommand(item)}><span><strong>{item.label}</strong><small>{item.hint}</small></span><span>↵</span></button>)}
    </>}

    {hasQuery && isSearching && stockResults.length === 0 && <p className="command-palette__state" role="status">Aranıyor…</p>}
    {searchError && <p className="command-palette__state command-palette__state--error" role="alert">{searchError}</p>}
    {hasNoResults && <p className="command-palette__state" role="status">Aramanızla eşleşen stok bulunamadı.</p>}
    {!hasQuery && <p className="command-palette__state command-palette__state--hint">Stok kodu, stok adı, barkod veya adres yazarak arayın.</p>}

  </div></section></div>}</div>
}
