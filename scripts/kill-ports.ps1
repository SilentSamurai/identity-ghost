param([int[]]$Ports = @(9001, 4200))
foreach ($port in $Ports) {
    $pids = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue |
        Select-Object -ExpandProperty OwningProcess -Unique |
        Where-Object { $_ -ne 0 }
    if ($pids) {
        foreach ($p in $pids) {
            taskkill /F /PID $p
        }
    } else {
        Write-Host "Nothing on port $port"
    }
}
