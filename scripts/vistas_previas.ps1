# Vistas previas de los archivos pesados de la fila de impresión (04/11/2026)
# ---------------------------------------------------------------------------
# Google Drive no arma la vista previa de las imágenes de más de ~50 MB (muchos DTF largos): el taller, el portal y
# Entregas no las pueden mostrar. Este programa corre cada 10 minutos en la PC del taller (la que tiene Google Drive
# sincronizado en G:) y, para cada archivo pesado de la fila (y de lo impreso en los últimos días), arma una versión
# liviana en JPG en la carpeta de Drive "vistas_previas_fila", con el nombre "<nombre del archivo> [<bytes>].jpg".
# La terminal de Google (miniaturaDrive → vistaPreviaTaller_) la usa cuando Drive no tiene la vista previa.
# - No instala nada: usa lo que ya trae Windows para leer y achicar imágenes.
# - La transparencia queda negra, igual que en las vistas previas de Drive.
# - 900 px de ancho (1600 si la imagen es apaisada). Un archivo de 65 MB tarda unos 10 segundos.
# - Lo que hace queda anotado en %USERPROFILE%\VVGrafic\vistas_previas.log
# - Nunca corre más de uno a la vez en la misma PC, y con prioridad baja para no frenar el RIP mientras imprime.
# Se instala con instalar_vistas_previas.ps1 (tarea programada de Windows, oculta).
param(
    [string]$Raiz = "G:\Mi unidad\VIVI GRAFIC",
    [string]$Destino = "",
    [int]$MinMB = 45,
    [int]$Dias = 30,
    [int]$MaxPorVuelta = 40,
    # En una segunda PC de respaldo: solo arma las que lleven más de 30 minutos sin vista previa (si la principal está
    # apagada). Así las dos no arman la misma a la vez.
    [switch]$Respaldo
)
$ErrorActionPreference = 'Continue'
# Uno solo a la vez: si ya hay otro trabajando, este se va
$candado = New-Object System.Threading.Mutex($false, "Global\VVGraficVistasPrevias")
try { $tengo = $candado.WaitOne(0) } catch [System.Threading.AbandonedMutexException] { $tengo = $true }
if (-not $tengo) { exit 0 }
# Prioridad baja: la PC del taller está imprimiendo
try { (Get-Process -Id $PID).PriorityClass = [System.Diagnostics.ProcessPriorityClass]::BelowNormal } catch { }
Add-Type -AssemblyName PresentationCore

if (-not $Destino) { $Destino = Join-Path $Raiz "vistas_previas_fila" }
$filas = @((Join-Path $Raiz "fila_impresión\dtf"), (Join-Path $Raiz "fila_impresión\sublimacion"))
$dirLog = Join-Path $env:USERPROFILE "VVGrafic"
$log = Join-Path $dirLog "vistas_previas.log"
New-Item -ItemType Directory -Force -Path $dirLog | Out-Null
function Anotar([string]$texto) {
    Add-Content -LiteralPath $log -Value ("{0:yyyy-MM-dd HH:mm:ss} {1}" -f (Get-Date), $texto) -Encoding UTF8
}

if (-not (Test-Path -LiteralPath $Raiz)) { Anotar "No está la carpeta $Raiz (¿Google Drive está abierto?)"; exit 0 }
if (-not (Test-Path -LiteralPath $Destino)) { New-Item -ItemType Directory -Path $Destino | Out-Null }

$desde = (Get-Date).AddDays(-$Dias)
$hechos = 0
$tmpDir = Join-Path $env:TEMP "vvgrafic_vistas"
New-Item -ItemType Directory -Force -Path $tmpDir | Out-Null

foreach ($fila in $filas) {
    if (-not (Test-Path -LiteralPath $fila)) { continue }
    $pesados = Get-ChildItem -LiteralPath $fila -Recurse -File -ErrorAction SilentlyContinue |
        Where-Object { $_.Extension -match '^\.(png|jpe?g|tiff?)$' -and $_.Length -ge ($MinMB * 1MB) -and $_.LastWriteTime -ge $desde } |
        Sort-Object LastWriteTime -Descending   # primero lo más nuevo (lo que está en la fila)
    foreach ($archivo in $pesados) {
        if ($hechos -ge $MaxPorVuelta) { break }
        if ($Respaldo -and $archivo.LastWriteTime -gt (Get-Date).AddMinutes(-30)) { continue }
        $salida = Join-Path $Destino ("{0} [{1}].jpg" -f $archivo.Name, $archivo.Length)
        if (Test-Path -LiteralPath $salida) { continue }
        $reloj = [Diagnostics.Stopwatch]::StartNew()
        try {
            $uri = New-Object Uri($archivo.FullName)
            $dec = [System.Windows.Media.Imaging.BitmapDecoder]::Create($uri, [System.Windows.Media.Imaging.BitmapCreateOptions]::IgnoreColorProfile, [System.Windows.Media.Imaging.BitmapCacheOption]::None)
            $ancho = $dec.Frames[0].PixelWidth
            $alto = $dec.Frames[0].PixelHeight
            $bi = New-Object System.Windows.Media.Imaging.BitmapImage
            $bi.BeginInit()
            $bi.UriSource = $uri
            $bi.CacheOption = [System.Windows.Media.Imaging.BitmapCacheOption]::OnLoad
            $bi.CreateOptions = [System.Windows.Media.Imaging.BitmapCreateOptions]::IgnoreColorProfile
            $bi.DecodePixelWidth = $(if ($ancho -ge $alto) { [Math]::Min(1600, $ancho) } else { [Math]::Min(900, $ancho) })
            $bi.EndInit()
            $enc = New-Object System.Windows.Media.Imaging.JpegBitmapEncoder
            $enc.QualityLevel = 82
            $enc.Frames.Add([System.Windows.Media.Imaging.BitmapFrame]::Create($bi))
            # Se arma afuera de Drive y se mueve terminada (así Drive no sube un archivo a medias)
            $tmp = Join-Path $tmpDir ([Guid]::NewGuid().ToString() + ".jpg")
            $fs = [IO.File]::Create($tmp)
            try { $enc.Save($fs) } finally { $fs.Close() }
            Move-Item -LiteralPath $tmp -Destination $salida -Force
            $hechos++
            Anotar ("OK {0} ({1:N0} MB, {2}x{3}) en {4:N1} s" -f $archivo.Name, ($archivo.Length / 1MB), $ancho, $alto, $reloj.Elapsed.TotalSeconds)
        } catch {
            Anotar ("ERROR {0}: {1}" -f $archivo.Name, $_.Exception.Message)
        } finally {
            $bi = $null; $dec = $null; $enc = $null
            [GC]::Collect()
        }
    }
}

# Las vistas previas de hace más de 120 días ya no hacen falta
Get-ChildItem -LiteralPath $Destino -File -Filter "*.jpg" -ErrorAction SilentlyContinue |
    Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-120) } | Remove-Item -Force -ErrorAction SilentlyContinue

if ($hechos -gt 0) { Anotar "Vuelta terminada: $hechos vista(s) previa(s) nueva(s)" }
# El registro se queda con las últimas 500 líneas
if ((Test-Path -LiteralPath $log) -and (Get-Item -LiteralPath $log).Length -gt 200KB) {
    (Get-Content -LiteralPath $log -Tail 500 -Encoding UTF8) | Set-Content -LiteralPath $log -Encoding UTF8
}
