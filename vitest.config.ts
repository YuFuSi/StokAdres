import { defineConfig } from 'vitest/config'

// Kasitli olarak dar bir test kurulumu: yalnizca saf fonksiyonlar test ediliyor.
// DB mock'u, React test kutuphanesi veya E2E yok. Amac genel bir test kulturu
// kurmak degil; ice aktarma ve CABA eslestirme mantigini canli veriye yazmadan
// dogrulayabilmek. Bu mantik yanlis oldugunda depo verisi bozulur, bu yuzden
// ucuz bir guvenlik agi degerinde.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
})
