param(
  [int]$MaxLongEdge = 2560,
  [int]$JpegQuality = 85
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$projectRoot = Split-Path -Parent $PSScriptRoot
$photoRoot = Join-Path $projectRoot "assets\Photography"
$outputRoot = Join-Path $photoRoot "2k"
$jpegCodec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() |
  Where-Object MimeType -eq "image/jpeg" |
  Select-Object -First 1

if (-not $jpegCodec) {
  throw "The Windows JPEG encoder is unavailable."
}

$encoderParameters = [System.Drawing.Imaging.EncoderParameters]::new(1)
$encoderParameters.Param[0] = [System.Drawing.Imaging.EncoderParameter]::new(
  [System.Drawing.Imaging.Encoder]::Quality,
  [long]$JpegQuality
)

try {
  Get-ChildItem -LiteralPath $photoRoot -Directory |
    Where-Object Name -Match '^\d{4}$' |
    Sort-Object Name |
    ForEach-Object {
      $yearOutput = Join-Path $outputRoot $_.Name
      New-Item -ItemType Directory -Path $yearOutput -Force | Out-Null

      Get-ChildItem -LiteralPath $_.FullName -File |
        Where-Object Extension -Match '^\.(jpe?g)$' |
        Sort-Object Name |
        ForEach-Object {
          $outputName = "{0}.jpg" -f $_.BaseName
          $outputPath = Join-Path $yearOutput $outputName
          $source = [System.Drawing.Image]::FromFile($_.FullName)

          try {
            if ($source.PropertyIdList -contains 274) {
              $orientation = $source.GetPropertyItem(274).Value[0]
              switch ($orientation) {
                3 { $source.RotateFlip([System.Drawing.RotateFlipType]::Rotate180FlipNone) }
                6 { $source.RotateFlip([System.Drawing.RotateFlipType]::Rotate90FlipNone) }
                8 { $source.RotateFlip([System.Drawing.RotateFlipType]::Rotate270FlipNone) }
              }
            }

            [double]$longEdge = [Math]::Max($source.Width, $source.Height)
            [double]$scale = [Math]::Min(1.0, ([double]$MaxLongEdge / $longEdge))
            $targetWidth = [Math]::Max(1, [Math]::Round($source.Width * $scale))
            $targetHeight = [Math]::Max(1, [Math]::Round($source.Height * $scale))
            $bitmap = [System.Drawing.Bitmap]::new($targetWidth, $targetHeight)

            try {
              $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
              try {
                $graphics.Clear([System.Drawing.Color]::White)
                $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
                $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
                $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
                $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
                $graphics.DrawImage($source, 0, 0, $targetWidth, $targetHeight)
              }
              finally {
                $graphics.Dispose()
              }

              $bitmap.Save($outputPath, $jpegCodec, $encoderParameters)
              Write-Output ("Created {0} ({1}x{2})" -f $outputPath.Substring($projectRoot.Length + 1), $targetWidth, $targetHeight)
            }
            finally {
              $bitmap.Dispose()
            }
          }
          finally {
            $source.Dispose()
          }
        }
    }
}
finally {
  $encoderParameters.Dispose()
}
