<#
  Looks up the UI Automation element at a given screen point and prints
  its name/type as compact JSON. Used by src/services/accessibilityService.js
  to auto-title captured steps (e.g. `Click "Save"`) on Windows.

  Always exits 0: on any failure it just prints `{}` so the Node side can
  fall back to a generic step title without treating this as a hard error.
#>
param(
  [Parameter(Mandatory = $true)][double]$X,
  [Parameter(Mandatory = $true)][double]$Y
)

try {
  Add-Type -AssemblyName UIAutomationClient
  Add-Type -AssemblyName UIAutomationTypes
  Add-Type -AssemblyName WindowsBase

  $point = New-Object System.Windows.Point($X, $Y)
  $element = [System.Windows.Automation.AutomationElement]::FromPoint($point)

  if ($null -eq $element) {
    Write-Output '{}'
    exit 0
  }

  $name = $null
  $controlType = $null
  $className = $null
  $automationId = $null

  try { $name = $element.Current.Name } catch {}
  try { $controlType = $element.Current.ControlType.ProgrammaticName } catch {}
  try { $className = $element.Current.ClassName } catch {}
  try { $automationId = $element.Current.AutomationId } catch {}

  $result = [PSCustomObject]@{
    name          = $name
    controlType   = $controlType
    className     = $className
    automationId  = $automationId
  }

  $result | ConvertTo-Json -Compress
} catch {
  Write-Output '{}'
  exit 0
}
