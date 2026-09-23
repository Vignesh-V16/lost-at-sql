<#
  Give this machine a fixed address for the event, so the URL the lab types
  never changes.

  Run it by double-clicking "Fix IP address.bat" next to this file — that
  asks for administrator rights, which changing an address needs.

  It reads the gateway, prefix and adapter from whatever is working now, so
  it cannot be given wrong values by hand. It refuses to run if the target
  address is already answering, and it checks the internet still works
  afterwards. "Undo fixed IP.bat" puts it back to automatic.
#>
[CmdletBinding()]
param(
  [string]$Address = '192.168.0.50',
  [switch]$Revert
)

$ErrorActionPreference = 'Stop'
function Say($m) { Write-Host "  $m" }
function Good($m) { Write-Host "  [ok]   $m" -ForegroundColor Green }
function Warn($m) { Write-Host "  [note] $m" -ForegroundColor Yellow }
function Bad($m) { Write-Host "  [STOP] $m" -ForegroundColor Red }

Write-Host ''
Write-Host '================================================================'
Write-Host '  LOST AT SQL - fixed address for the event'
Write-Host '================================================================'
Write-Host ''

# The adapter that currently carries the default route: whatever is really in use.
$route = Get-NetRoute -DestinationPrefix '0.0.0.0/0' -ErrorAction SilentlyContinue |
  Sort-Object RouteMetric |
  Select-Object -First 1
if (-not $route) {
  Bad 'This machine has no network connection at all. Connect first, then run this again.'
  Read-Host 'Press Enter to close'
  exit 1
}
$alias   = (Get-NetAdapter -InterfaceIndex $route.InterfaceIndex).Name
$gateway = $route.NextHop
$current = Get-NetIPAddress -InterfaceIndex $route.InterfaceIndex -AddressFamily IPv4 | Select-Object -First 1
$prefix  = $current.PrefixLength

Say "Adapter in use : $alias"
Say "Address now    : $($current.IPAddress)/$prefix  ($((Get-NetIPInterface -InterfaceIndex $route.InterfaceIndex -AddressFamily IPv4).Dhcp))"
Say "Router         : $gateway"
Write-Host ''

if ($Revert) {
  Say 'Putting the address back to automatic...'
  Set-NetIPInterface -InterfaceIndex $route.InterfaceIndex -AddressFamily IPv4 -Dhcp Enabled
  Set-DnsClientServerAddress -InterfaceIndex $route.InterfaceIndex -ResetServerAddress
  ipconfig /renew | Out-Null
  Start-Sleep -Seconds 4
  $now = (Get-NetIPAddress -InterfaceIndex $route.InterfaceIndex -AddressFamily IPv4 | Select-Object -First 1).IPAddress
  Good "Back to automatic. This machine is now $now"
  Write-Host ''
  Read-Host 'Press Enter to close'
  exit 0
}

if ($current.IPAddress -eq $Address) {
  Good "Already fixed at $Address - nothing to do."
  Write-Host ''
  Read-Host 'Press Enter to close'
  exit 0
}

# Refuse if something else already answers there.
Say "Checking whether $Address is free..."
if (Test-Connection -ComputerName $Address -Count 2 -Quiet -ErrorAction SilentlyContinue) {
  Bad "$Address is already in use by another machine. Pick a different one:"
  Say "   powershell -File `"$PSCommandPath`" -Address 192.168.0.51"
  Write-Host ''
  Read-Host 'Press Enter to close'
  exit 1
}
Good "$Address is free"
Write-Host ''
Say 'Applying. The network will drop for a few seconds...'

try {
  Remove-NetIPAddress -InterfaceIndex $route.InterfaceIndex -AddressFamily IPv4 -Confirm:$false -ErrorAction SilentlyContinue
  Remove-NetRoute -InterfaceIndex $route.InterfaceIndex -DestinationPrefix '0.0.0.0/0' -Confirm:$false -ErrorAction SilentlyContinue
  New-NetIPAddress -InterfaceIndex $route.InterfaceIndex -IPAddress $Address -PrefixLength $prefix -DefaultGateway $gateway | Out-Null
  Set-DnsClientServerAddress -InterfaceIndex $route.InterfaceIndex -ServerAddresses $gateway, '8.8.8.8'
} catch {
  Bad "Could not apply it: $($_.Exception.Message)"
  Warn 'Putting the address back to automatic so you are not left offline...'
  Set-NetIPInterface -InterfaceIndex $route.InterfaceIndex -AddressFamily IPv4 -Dhcp Enabled -ErrorAction SilentlyContinue
  Set-DnsClientServerAddress -InterfaceIndex $route.InterfaceIndex -ResetServerAddress -ErrorAction SilentlyContinue
  ipconfig /renew | Out-Null
  Write-Host ''
  Read-Host 'Press Enter to close'
  exit 1
}

Start-Sleep -Seconds 4
Write-Host ''
Say 'Checking it worked...'
$now = (Get-NetIPAddress -InterfaceIndex $route.InterfaceIndex -AddressFamily IPv4 | Select-Object -First 1).IPAddress
if ($now -eq $Address) { Good "This machine is now $Address, and it will stay there" }
else { Warn "Expected $Address but the address is $now" }

if (Test-Connection -ComputerName $gateway -Count 2 -Quiet -ErrorAction SilentlyContinue) { Good "Router reachable at $gateway" }
else { Bad "Cannot reach the router at $gateway - run 'Undo fixed IP.bat' to go back to automatic" }

try { Resolve-DnsName -Name 'example.com' -ErrorAction Stop | Out-Null; Good 'Name lookup works' }
catch { Warn 'Name lookup failed - the lab game still works, only outside websites would not' }

Write-Host ''
Write-Host '----------------------------------------------------------------'
Write-Host "  The lab now opens:   http://$Address:5173"
Write-Host "  Or by name:          http://$($env:COMPUTERNAME.ToLower()):5173"
Write-Host '----------------------------------------------------------------'
Write-Host ''
Say 'Next: in the project folder run   npm run handout'
Say 'so the desktop shortcuts point at the new address.'
Write-Host ''
Say 'To undo at any time, double-click "Undo fixed IP.bat".'
Write-Host ''
Read-Host 'Press Enter to close'
