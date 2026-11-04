# Instala en esta PC el armado de vistas previas de los archivos pesados (ver vistas_previas.ps1).
# - Busca en qué letra está Google Drive ("Mi unidad\VIVI GRAFIC").
# - Copia el programa a %USERPROFILE%\VVGrafic (así no depende de la carpeta del repositorio). No en AppData: las apps
#   empaquetadas (como la de Claude) guardan AppData en una copia privada que Windows no ve desde afuera.
# - Crea la tarea programada "VV Grafic - Vistas previas de la fila": al iniciar sesión y cada 10 minutos, oculta (sin ventanas).
# - Corre una vez enseguida.
# -Respaldo: para la segunda PC (solo arma lo que la principal no armó en 30 minutos).
# Para sacarla: Unregister-ScheduledTask -TaskName "VV Grafic - Vistas previas de la fila" -Confirm:$false
param([switch]$Respaldo)
$ErrorActionPreference = 'Stop'

# Dónde está Google Drive en esta PC
$raiz = $null
foreach ($letra in [IO.DriveInfo]::GetDrives() | ForEach-Object { $_.Name }) {
    foreach ($unidad in @("Mi unidad", "My Drive")) {
        $p = Join-Path $letra "$unidad\VIVI GRAFIC"
        if (Test-Path -LiteralPath $p) { $raiz = $p; break }
    }
    if ($raiz) { break }
}
if (-not $raiz) { throw "No encontré la carpeta 'Mi unidad\VIVI GRAFIC'. Abrí Google Drive para escritorio con la cuenta del taller y probá de nuevo." }

$dir = Join-Path $env:USERPROFILE "VVGrafic"
New-Item -ItemType Directory -Force -Path $dir | Out-Null
$programa = Join-Path $dir "vistas_previas.ps1"
Copy-Item -LiteralPath (Join-Path $PSScriptRoot "vistas_previas.ps1") -Destination $programa -Force

# Un lanzador .vbs para que PowerShell corra sin abrir ninguna ventana
$args2 = '-NoProfile -ExecutionPolicy Bypass -File ""' + $programa + '"" -Raiz ""' + $raiz + '""' + $(if ($Respaldo) { ' -Respaldo' } else { '' })
$vbs = Join-Path $dir "vistas_previas.vbs"
Set-Content -LiteralPath $vbs -Value ('CreateObject("WScript.Shell").Run "powershell.exe ' + $args2 + '", 0, False') -Encoding Unicode

$nombre = "VV Grafic - Vistas previas de la fila"
$accion = New-ScheduledTaskAction -Execute "wscript.exe" -Argument ('"' + $vbs + '"')
$cada10 = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 10) -RepetitionDuration (New-TimeSpan -Days 3650)
$alEntrar = New-ScheduledTaskTrigger -AtLogOn -User "$env:USERDOMAIN\$env:USERNAME"
$ajustes = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Hours 1) -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
$quien = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName $nombre -Action $accion -Trigger @($cada10, $alEntrar) -Settings $ajustes -Principal $quien `
    -Description "Arma versiones livianas de los archivos pesados de la fila de impresión para que se vean en el taller, el portal y Entregas (V&V Grafic)." -Force | Out-Null

Start-Process -FilePath "wscript.exe" -ArgumentList ('"' + $vbs + '"')
"Listo$(if ($Respaldo) { ' (PC de respaldo)' }): la tarea '$nombre' quedó instalada con Drive en $raiz y ya empezó la primera vuelta."
"El registro está en $(Join-Path $dir 'vistas_previas.log')."
