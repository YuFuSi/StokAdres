import { AddressRecordService } from '../services/addressRecordService'
import type { AddressRecord } from '../types/addressRecord'
import type { Product } from '../types/product'

export const addressRecordService = new AddressRecordService()

export function getProductsWithAddressRecords(records: AddressRecord[], products: Product[] = []): Product[] {
	const productsByStockCode = new Map(products.map((product) => [product.stockCode, product]))

	records.forEach((record) => {
		if (!productsByStockCode.has(record.stockCode)) {
			productsByStockCode.set(record.stockCode, {
				id: record.productId || `local-${record.stockCode}`,
				stockCode: record.stockCode,
				stockName: record.stockName,
			})
		}
	})

	return [...productsByStockCode.values()]
}
