import { useEffect, useState } from 'react'
import { addressRecordService } from '../data/localData'
import { DuplicateActiveAddressError } from '../services/addressRecordService'
import { addProductBarcodes, DuplicateProductBarcodeError, getProductById, removeProductBarcodes, updateProduct } from '../services/productService'
import { getProductMetrics } from '../services/productListing'
import type { AddressRecord } from '../types/addressRecord'
import type { Product } from '../types/product'
import './ProductDetailPage.css'

type ProductDetailPageProps = {
  productId: string
  onBack: () => void
  onAddressSelect: (recordId: string) => void
}

export function ProductDetailPage({ productId, onBack, onAddressSelect }: ProductDetailPageProps) {
  const [product, setProduct] = useState<Product | null>(null)
  const [records, setRecords] = useState<AddressRecord[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [saveError, setSaveError] = useState('')
  const [feedback, setFeedback] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [stockCode, setStockCode] = useState('')
  const [stockName, setStockName] = useState('')
  const [isAddressFormOpen, setIsAddressFormOpen] = useState(false)
  const [editingRecordId, setEditingRecordId] = useState<string | null>(null)
  const [address, setAddress] = useState('')
  const [cartonCount, setCartonCount] = useState('')
  const [isActive, setIsActive] = useState(true)
  const [addressError, setAddressError] = useState('')
  const [isAddressSaving, setIsAddressSaving] = useState(false)
  const [barcode, setBarcode] = useState('')
  const [barcodeError, setBarcodeError] = useState('')
  const [isBarcodeSaving, setIsBarcodeSaving] = useState(false)

  const loadProduct = async () => {
    const [nextProduct, nextRecords] = await Promise.all([
      getProductById(productId),
      addressRecordService.getActiveByProductId(productId),
    ])
    if (!nextProduct) {
      setProduct(null)
      setRecords([])
      return
    }
    setProduct(nextProduct)
    setStockCode(nextProduct.stockCode)
    setStockName(nextProduct.stockName)
    setRecords(nextRecords)
  }

  useEffect(() => {
    let isMounted = true
    setIsLoading(true)
    Promise.all([getProductById(productId), addressRecordService.getActiveByProductId(productId)])
      .then(([nextProduct, nextRecords]) => {
        if (!isMounted) return
        if (!nextProduct) {
          setProduct(null)
          setRecords([])
          return
        }
        setProduct(nextProduct)
        setStockCode(nextProduct.stockCode)
        setStockName(nextProduct.stockName)
        setRecords(nextRecords)
      })
      .catch((reason: unknown) => {
        console.error(reason)
        if (isMounted) setError('Stok bilgileri yüklenirken bir sorun oluştu.')
      })
      .finally(() => { if (isMounted) setIsLoading(false) })
    return () => { isMounted = false }
  }, [productId])

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const isEditable = target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.tagName === 'SELECT'
      if (event.key === 'Escape' && !isEditable) onBack()
    }
    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [onBack])

  const metrics = product ? getProductMetrics(product, records) : null
  const activeRecords = records.filter((record) => record.isActive)
  const hasProductChanges = product !== null && (
    stockCode !== product.stockCode || stockName !== product.stockName
  )

  const saveProduct = async () => {
    if (!product || !hasProductChanges) return
    if (!stockCode.trim() || !stockName.trim()) {
      setSaveError('Stok kodu ve stok adı boş bırakılamaz.')
      return
    }
    setIsSaving(true)
    setSaveError('')
    setFeedback('')
    try {
      const updated = await updateProduct(product.id, {
        ...(stockCode !== product.stockCode ? { stockCode: stockCode.trim() } : {}),
        ...(stockName !== product.stockName ? { stockName: stockName.trim() } : {}),
      })
      setProduct(updated)
      setStockCode(updated.stockCode)
      setStockName(updated.stockName)
      setFeedback('Ürün bilgileri güncellendi.')
      await loadProduct()
    } catch (reason: unknown) {
      console.error(reason)
      setSaveError('Ürün bilgileri güncellenemedi. Lütfen tekrar deneyin.')
    } finally {
      setIsSaving(false)
    }
  }

  const addBarcode = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!product || !barcode.trim()) {
      setBarcodeError('Bir barkod girin.')
      return
    }
    setIsBarcodeSaving(true)
    setBarcodeError('')
    try {
      const updated = await addProductBarcodes(product.id, [barcode])
      setProduct(updated)
      setBarcode('')
      setFeedback('Barkod eklendi.')
    } catch (reason: unknown) {
      console.error(reason)
      setBarcodeError(reason instanceof DuplicateProductBarcodeError
        ? 'Bu barkod başka bir üründe kayıtlı.'
        : 'Barkod eklenemedi. Lütfen tekrar deneyin.')
    } finally {
      setIsBarcodeSaving(false)
    }
  }

  const deleteBarcode = async (value: string) => {
    if (!product || !window.confirm('Bu barkod silinsin mi?')) return
    setBarcodeError('')
    try {
      setProduct(await removeProductBarcodes(product.id, [value]))
      setFeedback('Barkod silindi.')
    } catch (reason: unknown) {
      console.error(reason)
      setBarcodeError('Barkod silinemedi. Lütfen tekrar deneyin.')
    }
  }

  const openNewAddressForm = () => {
    setEditingRecordId(null)
    setAddress('')
    setCartonCount('')
    setIsActive(true)
    setAddressError('')
    setIsAddressFormOpen(true)
  }

  const openEditAddressForm = (record: AddressRecord) => {
    setEditingRecordId(record.id)
    setAddress(record.address)
    setCartonCount(String(record.cartonCount))
    setIsActive(record.isActive)
    setAddressError('')
    setIsAddressFormOpen(true)
  }

  const closeAddressForm = () => {
    setIsAddressFormOpen(false)
    setEditingRecordId(null)
    setAddressError('')
  }

  const saveAddress = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!product) return
    const parsedCartonCount = Number(cartonCount)
    if (!address.trim() || !Number.isInteger(parsedCartonCount) || parsedCartonCount < 1) {
      setAddressError('Adres ve 1 veya daha fazla koli adedi girin.')
      return
    }
    setIsAddressSaving(true)
    setAddressError('')
    try {
      if (editingRecordId) {
        await addressRecordService.update(editingRecordId, { address: address.trim(), cartonCount: parsedCartonCount, isActive })
      } else {
        await addressRecordService.create({
          productId: product.id,
          stockCode: product.stockCode,
          stockName: product.stockName,
          address: address.trim(),
          cartonCount: parsedCartonCount,
          isActive,
        })
      }
      await loadProduct()
      closeAddressForm()
    } catch (reason: unknown) {
      console.error(reason)
      setAddressError(reason instanceof DuplicateActiveAddressError
        ? 'Bu ürün ve adres için zaten aktif bir kayıt bulunuyor.'
        : 'Adres kaydı kaydedilemedi. Lütfen tekrar deneyin.')
    } finally {
      setIsAddressSaving(false)
    }
  }

  const deleteAddress = async (record: AddressRecord) => {
    if (!window.confirm('Bu adres kaydı silinsin mi?')) return
    try {
      await addressRecordService.delete(record.id)
      await loadProduct()
    } catch (reason: unknown) {
      console.error(reason)
      setAddressError('Adres kaydı silinemedi. Lütfen tekrar deneyin.')
    }
  }

  if (isLoading) return <main className="product-detail-page"><p className="product-detail-state" role="status">Stok bilgileri yükleniyor...</p></main>
  if (error) return <main className="product-detail-page"><p className="product-detail-state product-detail-state--error" role="alert">{error}</p></main>
  if (!product) return <main className="product-detail-page"><button className="back-link" type="button" onClick={onBack}>← Stoklara Dön</button><p className="product-detail-state">Stok bulunamadı.</p></main>

  return (
    <main className="product-detail-page">
      <button className="back-link" type="button" onClick={onBack}>← Stoklara Dön</button>
      <header className="product-detail-header">
        <div><p className="intro__eyebrow">STOK DETAYI</p><h1>{product.stockName}</h1><p className="product-detail-header__code">{product.stockCode}</p></div>
        <span className="address-status address-status--active">Aktif ürün</span>
      </header>

      <section className="product-detail-metrics" aria-label="Ürün özet metrikleri">
        <div><span>Adres sayısı</span><strong>{metrics?.activeAddressCount ?? 0}</strong></div>
        <div><span>Toplam koli</span><strong>{metrics?.totalCartons ?? 0}</strong></div>
        <div><span>Ürün durumu</span><strong>{product.isActive === false ? 'Pasif' : 'Aktif'}</strong></div>
      </section>

      <div className="product-detail-grid">
        <section className="product-info-panel" aria-labelledby="product-info-title">
          <div className="product-detail-section-heading"><div><span className="selected-product__label">Ürün bilgileri</span><h2 id="product-info-title">Product</h2></div><span className="product-detail-save-state">{feedback}</span></div>
          <div className="product-info-form">
            <label>Stok Kodu<input value={stockCode} onChange={(event) => { setStockCode(event.target.value); setFeedback('') }} /></label>
            <label>Stok Adı<input value={stockName} onChange={(event) => { setStockName(event.target.value); setFeedback('') }} /></label>
            <div className="product-barcode-block"><span className="field-label">Barkodlar</span>{product.barcodes.length === 0 ? <p className="product-detail-empty product-detail-empty--compact">Barkod bulunamadı.</p> : <ul className="product-barcode-list">{product.barcodes.map((value) => <li key={value}><span>{value}</span><button type="button" onClick={() => deleteBarcode(value)} aria-label={`${value} barkodunu sil`}>Sil</button></li>)}</ul>}<form className="product-barcode-form" onSubmit={addBarcode}><input value={barcode} onChange={(event) => setBarcode(event.target.value)} placeholder="Yeni barkod" aria-label="Yeni barkod" /><button className="button button--secondary" type="submit" disabled={isBarcodeSaving}>{isBarcodeSaving ? 'Ekleniyor...' : 'Barkod Ekle'}</button></form>{barcodeError && <p className="form-error" role="alert">{barcodeError}</p>}</div>
            <div className="product-readonly-dates"><span>Oluşturulma<strong>{formatDate(product.createdAt)}</strong></span><span>Güncellenme<strong>{formatDate(product.updatedAt)}</strong></span></div>
            {saveError && <p className="form-error" role="alert">{saveError}</p>}
            <button className="button button--primary" type="button" onClick={saveProduct} disabled={!hasProductChanges || isSaving}>{isSaving ? 'Kaydediliyor...' : 'Değişiklikleri Kaydet'}</button>
          </div>
        </section>

        <section className="product-addresses-panel" aria-labelledby="product-addresses-title">
          <div className="product-detail-section-heading"><div><span className="selected-product__label">Konum kayıtları</span><h2 id="product-addresses-title">Adresler</h2></div><button className="button button--primary" type="button" onClick={openNewAddressForm}>+ Adres Ekle</button></div>
          {records.length === 0 && <p className="product-detail-empty">Adres bulunamadı.</p>}
          {records.length > 0 && <div className="product-address-list">{records.map((record) => <div className="product-address-row" key={record.id} role="button" tabIndex={0} onClick={() => onAddressSelect(record.id)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') onAddressSelect(record.id) }}><div><small>Adres</small><strong>{record.address}</strong></div><div><small>Koli</small><strong>{record.cartonCount}</strong></div><div><small>Durum</small><span className="address-status address-status--active">Aktif</span></div><div><small>Güncellenme</small><strong>{formatDate(record.updatedAt)}</strong></div><div className="product-address-actions"><button type="button" onClick={(event) => { event.stopPropagation(); openEditAddressForm(record) }}>Düzenle</button><button type="button" onClick={(event) => { event.stopPropagation(); deleteAddress(record) }}>Sil</button></div></div>)}</div>}
          {isAddressFormOpen && <AddressForm address={address} setAddress={setAddress} cartonCount={cartonCount} setCartonCount={setCartonCount} isActive={isActive} setIsActive={setIsActive} isEditing={Boolean(editingRecordId)} isSaving={isAddressSaving} error={addressError} onSubmit={saveAddress} onCancel={closeAddressForm} />}
        </section>
      </div>
    </main>
  )
}

type AddressFormProps = {
  address: string
  setAddress: (value: string) => void
  cartonCount: string
  setCartonCount: (value: string) => void
  isActive: boolean
  setIsActive: (value: boolean) => void
  isEditing: boolean
  isSaving: boolean
  error: string
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void
  onCancel: () => void
}

function AddressForm(props: AddressFormProps) {
  return <form className="product-address-form" onSubmit={props.onSubmit}><span className="selected-product__label">{props.isEditing ? 'Adres kaydını düzenle' : 'Yeni adres kaydı'}</span><label>Adres<input value={props.address} onChange={(event) => props.setAddress(event.target.value)} placeholder="Örn. A1-1" /></label><label>Koli adedi<input type="number" min="1" step="1" value={props.cartonCount} onChange={(event) => props.setCartonCount(event.target.value)} placeholder="Örn. 15" /></label><label className="product-active-toggle"><input type="checkbox" checked={props.isActive} onChange={(event) => props.setIsActive(event.target.checked)} /> Aktif kayıt</label>{props.error && <p className="form-error" role="alert">{props.error}</p>}<div className="record-actions"><button className="button button--primary" type="submit" disabled={props.isSaving}>{props.isSaving ? 'Kaydediliyor...' : 'Kaydet'}</button><button className="button button--secondary" type="button" onClick={props.onCancel}>Vazgeç</button></div></form>
}

function formatDate(value: string | undefined): string {
  return value ? new Intl.DateTimeFormat('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value)) : '-'
}
