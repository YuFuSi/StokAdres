import { demoAddressRecords, demoProducts } from './demoData'
import { AddressRecordService } from '../services/addressRecordService'
import type { Product } from '../types/product'

export const products = demoProducts
export const addressRecordService = new AddressRecordService(demoAddressRecords)

export function getProductsWithAddressRecords(records = addressRecordService.list()): Product[] {
	const productsByStockCode = new Map(products.map((product) => [product.stockCode, product]))

	records.forEach((record) => {
		if (!productsByStockCode.has(record.stockCode)) {
			productsByStockCode.set(record.stockCode, {
				id: `local-${record.stockCode}`,
				stockCode: record.stockCode,
				stockName: record.stockName,
			})
		}
	})

	return [...productsByStockCode.values()]
}
