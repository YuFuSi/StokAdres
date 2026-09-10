# build/icon.png -> build/icon.ico
#
# NEDEN GEREKLI
# electron-builder uygulama ikonunu (exe) PNG'den kendisi uretebiliyor, ama
# NSIS kurulum sihirbazinin ikonlari (installerIcon / uninstallerIcon /
# installerHeaderIcon) gercek bir .ico dosyasi istiyor. PNG verildiginde
# derleme "Error while loading icon ...: invalid icon file" ile durur.
#
# NEDEN BMP (DIB) GIRDILERI, PNG DEGIL
# ICO icine PNG gomulebilir (Vista+), ama NSIS'in ikon okuyucusu eski ve
# kucuk boyutlarda PNG girdileriyle sorun cikarabiliyor. Klasik 32-bit BGRA
# DIB girdileri her yerde calisiyor.
#
# CALISTIRMA (yalnizca ikon degistiginde gerekir; cikti commit'lenir):
#   powershell -ExecutionPolicy Bypass -File scripts/generate-icon.ps1

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$root   = Split-Path -Parent $PSScriptRoot
$source = Join-Path $root 'build\icon.png'
$target = Join-Path $root 'build\icon.ico'

if (-not (Test-Path $source)) { throw "Kaynak bulunamadi: $source" }

# Windows'un kullandigi standart ikon boyutlari.
$sizes = @(16, 24, 32, 48, 64, 128, 256)

$original = [System.Drawing.Image]::FromFile($source)
try {
  $entries = @()
  foreach ($size in $sizes) {
    $bmp = New-Object System.Drawing.Bitmap $size, $size, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $gfx = [System.Drawing.Graphics]::FromImage($bmp)
    try {
      $gfx.InterpolationMode  = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
      $gfx.PixelOffsetMode    = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
      $gfx.SmoothingMode      = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
      $gfx.Clear([System.Drawing.Color]::Transparent)
      $gfx.DrawImage($original, 0, 0, $size, $size)
    } finally { $gfx.Dispose() }

    # 32-bit BGRA, alttan yukari (DIB duzeni) + AND maskesi.
    $pixels = New-Object 'System.Collections.Generic.List[byte]'
    for ($y = $size - 1; $y -ge 0; $y--) {
      for ($x = 0; $x -lt $size; $x++) {
        $p = $bmp.GetPixel($x, $y)
        $pixels.Add($p.B); $pixels.Add($p.G); $pixels.Add($p.R); $pixels.Add($p.A)
      }
    }
    # AND maskesi 32-bit ikonlarda kullanilmiyor ama satirlari 4 bayta hizali
    # olacak sekilde yine de yazilmali.
    $maskRowBytes = [math]::Ceiling($size / 32.0) * 4
    $mask = New-Object byte[] ($maskRowBytes * $size)

    # BITMAPINFOHEADER: yukseklik XOR+AND icin iki katina yazilir.
    $header = New-Object 'System.Collections.Generic.List[byte]'
    $header.AddRange([BitConverter]::GetBytes([int]40))        # biSize
    $header.AddRange([BitConverter]::GetBytes([int]$size))     # biWidth
    $header.AddRange([BitConverter]::GetBytes([int]($size*2))) # biHeight
    $header.AddRange([BitConverter]::GetBytes([int16]1))       # biPlanes
    $header.AddRange([BitConverter]::GetBytes([int16]32))      # biBitCount
    $header.AddRange([BitConverter]::GetBytes([int]0))         # biCompression
    $header.AddRange([BitConverter]::GetBytes([int]($pixels.Count + $mask.Length)))
    $header.AddRange([BitConverter]::GetBytes([int]0))         # biXPelsPerMeter
    $header.AddRange([BitConverter]::GetBytes([int]0))         # biYPelsPerMeter
    $header.AddRange([BitConverter]::GetBytes([int]0))         # biClrUsed
    $header.AddRange([BitConverter]::GetBytes([int]0))         # biClrImportant

    $data = New-Object 'System.Collections.Generic.List[byte]'
    $data.AddRange($header); $data.AddRange($pixels); $data.AddRange($mask)
    $entries += [pscustomobject]@{ Size = $size; Data = $data.ToArray() }
    $bmp.Dispose()
  }

  # ICONDIR + ICONDIRENTRY[] + veri
  $out = New-Object 'System.Collections.Generic.List[byte]'
  $out.AddRange([BitConverter]::GetBytes([int16]0))                 # reserved
  $out.AddRange([BitConverter]::GetBytes([int16]1))                 # type = ikon
  $out.AddRange([BitConverter]::GetBytes([int16]$entries.Count))

  $offset = 6 + (16 * $entries.Count)
  foreach ($e in $entries) {
    # 256 piksel 0 olarak yazilir (alan tek bayt).
    $dim = if ($e.Size -ge 256) { 0 } else { $e.Size }
    $out.Add([byte]$dim); $out.Add([byte]$dim)
    $out.Add([byte]0); $out.Add([byte]0)                            # renk sayisi, reserved
    $out.AddRange([BitConverter]::GetBytes([int16]1))               # planes
    $out.AddRange([BitConverter]::GetBytes([int16]32))              # bit sayisi
    $out.AddRange([BitConverter]::GetBytes([int]$e.Data.Length))
    $out.AddRange([BitConverter]::GetBytes([int]$offset))
    $offset += $e.Data.Length
  }
  foreach ($e in $entries) { $out.AddRange($e.Data) }

  [System.IO.File]::WriteAllBytes($target, $out.ToArray())
  Write-Output ("Olusturuldu: {0} ({1} boyut, {2} KB)" -f $target, $entries.Count, [int]($out.Count / 1024))
} finally { $original.Dispose() }
