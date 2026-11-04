# Instala en esta PC el armado de vistas previas de los archivos pesados (ver vistas_previas.ps1).
# - Copia el programa a %LOCALAPPDATA%\VVGrafic (así no depende de la carpeta del repositorio).
# - Crea la tarea programada "VV Grafic - Vistas previas de la fila": al iniciar sesión y cada 10 minutos, oculta (sin ventanas).
# - Corre una vez enseguida.
# Para sacarla: Unregister-ScheduledTask -TaskName "VV Grafic - Vistas previas de la fila" -Confirm:$false
$ErrorActionPreference = 'Stop'
$dir = Join-Path $env:LOCALAPPDATA "VVGrafic"
New-Item -ItemType Directory -Force -Path $dir | Out-Null
$programa = Join-Path $dir "vistas_previas.ps1"
Copy-Item -LiteralPath (Join-Path $PSScriptRoot "vistas_previas.ps1") -Destination $programa -Force

# Un lanzador .vbs para que PowerShell corra sin abrir ninguna ventana
$vbs = Join-Path $dir "vistas_previas.vbs"
$linea = 'CreateObject("WScript.Shell").Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -File ""' + $programa + '""", 0, False'
Set-Content -LiteralPath $vbs -Value $linea -Encoding Unicode

$nombre = "VV Grafic - Vistas previas de la fila"
$accion = New-ScheduledTaskAction -Execute "wscript.exe" -Argument ('"' + $vbs + '"')
$cada10 = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 10) -RepetitionDuration (New-TimeSpan -Days 3650)
$alEntrar = New-ScheduledTaskTrigger -AtLogOn -User "$env:USERDOMAIN\$env:USERNAME"
$ajustes = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Hours 1) -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
$quien = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName $nombre -Action $accion -Trigger @($cada10, $alEntrar) -Settings $ajustes -Principal $quien `
    -Description "Arma versiones livianas de los archivos pesados de la fila de impresión para que se vean en el taller, el portal y Entregas (V&V Grafic)." -Force | Out-Null

Start-Process -FilePath "wscript.exe" -ArgumentList ('"' + $vbs + '"')
"Listo: la tarea '$nombre' quedó instalada y ya empezó la primera vuelta. El registro está en $(Join-Path $dir 'vistas_previas.log')."
