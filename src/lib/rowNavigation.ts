import type { KeyboardEvent } from 'react'

/**
 * Tıklanabilir bir tablo satırını klavyeyle de kullanılabilir yapar:
 * Tab ile satıra gelinir, ↑/↓ komşu satıra geçer, Enter (veya Boşluk) açar.
 *
 * Eskiden satırlar yalnızca `<tr onClick>` idi; fareye dokunmadan liste
 * gezilemiyordu. Satırın içindeki `.row-open` butonu `tabIndex={-1}` kalıyor:
 * odak durağı satırın kendisi, her satıra ikinci bir durak eklemek Tab
 * gezinmesini iki kat uzatırdı.
 *
 * Kullanım: `<tr onClick={open} {...rowNavigationProps(open)}>`
 */
export function rowNavigationProps(onOpen: () => void) {
  return {
    tabIndex: 0,
    onKeyDown: (event: KeyboardEvent<HTMLTableRowElement>) => {
      // Satırın içindeki bir buton/input'tan gelen tuşlara karışma.
      if (event.target !== event.currentTarget) return
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        onOpen()
        return
      }
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault()
        const sibling = event.key === 'ArrowDown'
          ? event.currentTarget.nextElementSibling
          : event.currentTarget.previousElementSibling
        if (sibling instanceof HTMLElement) sibling.focus()
      }
    },
  }
}
