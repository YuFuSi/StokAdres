import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Boxes, ChevronLeft, ClipboardList, FileWarning, History, Home, Import, MapPin, PackageSearch, Search, Settings, Upload, X } from 'lucide-react'
import { addressRecordService } from '../data/localData'
import { listProducts } from '../services/productService'
import { searchProducts } from '../services/productSearch'
import type { AddressRecord } from '../types/addressRecord'
import type { Product } from '../types/product'

export type AppPage = 'dashboard' | 'stocks' | 'addresses' | 'find' | 'caba' | 'conflicts' | 'audit' | 'import' | 'export' | 'settings'
type AppLayoutProps = { children: ReactNode; activePage: AppPage; onNavigate: (page: AppPage) => void; onProductSelect: (productId: string) => void }
type NavItem = { id: AppPage; label: string; icon: typeof Home }

// Palette tek seferde bu kadar stok gösterir. 1655 ürünün tamamını listelemek
// paleti kullanılamaz hale getirirdi; daraltmak için kullanıcı yazmaya devam eder.
const MAX_STOCK_RESULTS = 7

const navigationGroups: { label: string; items: NavItem[] }[] = [
  { label: 'Operasyon', items: [{ id: 'dashboard', label: 'Genel Bakış', icon: Home }, { id: 'stocks', label: 'Stoklar', icon: Boxes }, { id: 'addresses', label: 'Adresler', icon: MapPin }, { id: 'find', label: 'Adres Bul', icon: PackageSearch }, { id: 'caba', label: 'CABA Listesi', icon: ClipboardList }] },
  { label: 'Veri', items: [{ id: 'import', label: 'İçe Aktar', icon: Import }, { id: 'export', label: 'Dışa Aktar', icon: Upload }] },
  { label: 'Sistem', items: [{ id: 'conflicts', label: 'Çakışmalar', icon: FileWarning }, { id: 'audit', label: 'İşlem Geçmişi', icon: History }, { id: 'settings', label: 'Ayarlar', icon: Settings }] },
]
const commandItems: Array<{ label: string; page: AppPage; hint: string }> = [{ label: 'Stok ara', page: 'stocks', hint: 'Stok listesine git' }, { label: 'Adres ara', page: 'find', hint: 'Hızlı operasyon araması' }, { label: 'CABA listesi', page: 'caba', hint: 'Fiş yapıştır, adresleri bul' }, { label: 'Stok ekle', page: 'stocks', hint: 'Stoklar ekranını aç' }, { label: 'Excel içe aktar', page: 'import', hint: 'Veri içe aktarma' }, { label: 'Dışa aktar', page: 'export', hint: 'Veri dışa aktarma' }, { label: 'Ayarlar', page: 'settings', hint: 'Uygulama tercihleri' }]

export function AppLayout({ children, activePage, onNavigate, onProductSelect }: AppLayoutProps) {
  const [isCommandOpen, setIsCommandOpen] = useState(false); const [query, setQuery] = useState(''); const [collapsed, setCollapsed] = useState(false)
  const [products, setProducts] = useState<Product[]>([])
  const [records, setRecords] = useState<AddressRecord[]>([])
  const [isSearchDataLoaded, setIsSearchDataLoaded] = useState(false)
  const [isSearchDataLoading, setIsSearchDataLoading] = useState(false)
  const [searchDataError, setSearchDataError] = useState('')
  const activeLabel = navigationGroups.flatMap((group) => group.items).find((item) => item.id === activePage)?.label ?? 'StokAdres'
  const visibleCommands = useMemo(() => commandItems.filter((item) => item.label.toLocaleLowerCase('tr-TR').includes(query.toLocaleLowerCase('tr-TR'))), [query])

  // Arama verisi yalnızca palet ilk kez açıldığında çekilir; uygulama açılışını
  // yavaşlatmaz. Sonraki açılışlarda eldeki veri anında gösterilir ve arka planda
  // tazelenir (stale-while-revalidate): böylece her tuş vuruşunda değil, palet
  // başına en fazla bir Supabase sorgusu yapılır.
  useEffect(() => {
    if (!isCommandOpen) return
    let isMounted = true
    setIsSearchDataLoading(true)
    Promise.all([listProducts(), addressRecordService.list()])
      .then(([nextProducts, nextRecords]) => {
        if (!isMounted) return
        setProducts(nextProducts)
        setRecords(nextRecords)
        setIsSearchDataLoaded(true)
        setSearchDataError('')
      })
      .catch((reason: unknown) => {
        console.error(reason)
        if (isMounted) setSearchDataError('Stok verisi yüklenemedi.')
      })
      .finally(() => { if (isMounted) setIsSearchDataLoading(false) })
    return () => { isMounted = false }
  }, [isCommandOpen])

  // Mevcut arama motoru yeniden kullanılıyor: stok kodu, stok adı, barkod ve
  // adres üzerinden Türkçe duyarlı skorlama zaten productSearch içinde.
  // Sorgu boşken searchProducts tüm ürünleri döndürdüğü için burada kısa devre
  // yapılıyor — palet açılışında 1655 satır basılmamalı.
  const trimmedQuery = query.trim()
  const stockResults = useMemo(
    () => (trimmedQuery ? searchProducts(products, trimmedQuery, records).slice(0, MAX_STOCK_RESULTS) : []),
    [trimmedQuery, products, records],
  )
  const activeAddressesFor = (product: Product) => records.filter((record) => record.isActive && record.productId === product.id)

  const navigate = (page: AppPage) => { onNavigate(page); setIsCommandOpen(false); setQuery('') }
  const runCommand = (item: typeof commandItems[number]) => {
    navigate(item.page)
    if (item.label === 'Stok ekle') window.setTimeout(() => window.dispatchEvent(new Event('stokadres:create-product')), 0)
  }
  const openProduct = (productId: string) => { setIsCommandOpen(false); setQuery(''); onProductSelect(productId) }

  useEffect(() => { const handleKey = (event: KeyboardEvent) => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); setIsCommandOpen(true) } if (event.key === 'Escape') setIsCommandOpen(false) }; window.addEventListener('keydown', handleKey); return () => window.removeEventListener('keydown', handleKey) }, [])

  const hasQuery = trimmedQuery.length > 0
  const hasNoResults = hasQuery && stockResults.length === 0 && visibleCommands.length === 0 && isSearchDataLoaded && !searchDataError

  return <div className={`app-shell ${collapsed ? 'app-shell--collapsed' : ''}`}><aside className="app-sidebar"><div className="sidebar-brand"><span className="brand__mark">SA</span><span className="sidebar-brand__words"><span className="brand__name">StokAdres</span><small className="brand__context">Depo Yönetimi</small></span><button className="sidebar-collapse" type="button" onClick={() => setCollapsed((value) => !value)} title={collapsed ? 'Menüyü genişlet' : 'Menüyü daralt'}><ChevronLeft size={16}/></button></div><nav className="sidebar-nav" aria-label="Ana navigasyon">{navigationGroups.map((group) => <div className="sidebar-group" key={group.label}><span className="sidebar-group__label">{group.label}</span>{group.items.map((item) => { const Icon = item.icon; return <button title={collapsed ? item.label : undefined} className={`sidebar-link ${activePage === item.id ? 'sidebar-link--active' : ''}`} key={item.id} type="button" onClick={() => navigate(item.id)} aria-current={activePage === item.id ? 'page' : undefined}><Icon size={16} strokeWidth={1.75} /><span>{item.label}</span></button> })}</div>)}</nav><div className="sidebar-footer"><span className="status-dot" /><span><strong>Sistem çevrimiçi</strong><small>Supabase bağlantısı aktif</small></span></div></aside><div className="app-shell__main"><header className="application-bar"><div><span className="application-bar__eyebrow">StokAdres / Operasyon</span><strong>{activeLabel}</strong></div><button className="command-trigger" type="button" onClick={() => setIsCommandOpen(true)}><Search size={15} /><span>Stok, barkod veya adres ara</span><kbd>Ctrl K</kbd></button></header>{children}</div>{isCommandOpen && <div className="command-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setIsCommandOpen(false) }}><section className="command-palette" role="dialog" aria-modal="true" aria-label="Hızlı komutlar"><div className="command-palette__input"><Search size={18} /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key !== 'Enter') return; event.preventDefault(); if (stockResults[0]) openProduct(stockResults[0].id); else if (visibleCommands[0]) runCommand(visibleCommands[0]) }} placeholder="Stok kodu, stok adı, barkod veya adres ara..." /><button type="button" onClick={() => setIsCommandOpen(false)} aria-label="Komut paletini kapat"><X size={17} /></button></div><div className="command-palette__list">

    {hasQuery && stockResults.length > 0 && <>
      <p className="command-palette__group">Stoklar</p>
      {stockResults.map((product) => { const addresses = activeAddressesFor(product); return <button type="button" key={product.id} onClick={() => openProduct(product.id)}><span><strong>{product.stockCode}</strong><small>{product.stockName}</small></span><span className="command-palette__address">{addresses.length ? addresses.map((record) => record.address).join(', ') : 'Adres yok'}</span></button> })}
    </>}

    {visibleCommands.length > 0 && <>
      {hasQuery && stockResults.length > 0 && <p className="command-palette__group">Komutlar</p>}
      {visibleCommands.map((item) => <button type="button" key={item.label} onClick={() => runCommand(item)}><span><strong>{item.label}</strong><small>{item.hint}</small></span><span>↵</span></button>)}
    </>}

    {hasQuery && isSearchDataLoading && !isSearchDataLoaded && <p className="command-palette__state" role="status">Stoklar yükleniyor...</p>}
    {searchDataError && <p className="command-palette__state command-palette__state--error" role="alert">{searchDataError}</p>}
    {hasNoResults && <p className="command-palette__state" role="status">Aramanızla eşleşen stok bulunamadı.</p>}
    {!hasQuery && <p className="command-palette__state command-palette__state--hint">Stok kodu, stok adı, barkod veya adres yazarak arayın.</p>}

  </div></section></div>}</div>
}
