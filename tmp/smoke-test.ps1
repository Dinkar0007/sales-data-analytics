$ErrorActionPreference = 'Stop'
$body = @{ username='admin'; password='admin123' } | ConvertTo-Json
$session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$login = Invoke-RestMethod -Uri http://localhost:3001/api/login -Method Post -ContentType 'application/json' -Body $body -WebSession $session
Write-Host "LOGIN RESULT:"; $login | ConvertTo-Json -Depth 2
$datasets = Invoke-RestMethod -Uri http://localhost:3001/api/sales/datasets -WebSession $session
Write-Host "DATASETS COUNT: $($datasets.datasets.count)"
foreach($d in $datasets.datasets) {
  $id = $d.id
  Write-Host "Checking dataset id: $id (name: $($d.name) rows: $($d.row_count))"
  $sales = Invoke-RestMethod -Uri "http://localhost:3001/api/sales?dataset_id=$id&per_page=1" -WebSession $session
  if($sales.rows.count -gt 0) {
    Write-Host "Found sales in dataset $id — deleting the first one"
    $saleId = $sales.rows[0].id
    Write-Host "Deleting sale id: $saleId"
    $del = Invoke-RestMethod -Uri "http://localhost:3001/api/sales/$saleId" -Method Delete -WebSession $session
    Write-Host "Delete response:"; $del | ConvertTo-Json
    $salesAfter = Invoke-RestMethod -Uri "http://localhost:3001/api/sales?dataset_id=$id&per_page=1" -WebSession $session
    Write-Host "Sales rows after delete: $($salesAfter.rows.count)"
    break
  }
}
