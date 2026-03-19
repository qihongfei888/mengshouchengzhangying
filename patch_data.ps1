$f='c:\Users\24729\Desktop\萌兽成长营\xintongxin\data.js'
$enc=New-Object System.Text.UTF8Encoding($true)
$bytes=[System.IO.File]::ReadAllBytes($f)
$c=$enc.GetString($bytes)

# Find the start of cat entry and end of sloth entry (closing ];)
$start=$c.IndexOf("  {`r`n    id: 'cat'")
if($start -lt 0){$start=$c.IndexOf("  {`n    id: 'cat'")}
Write-Host ('cat start='+$start)

$end=$c.IndexOf("`r`n];",$start)
if($end -lt 0){$end=$c.IndexOf("`n];",$start)}
Write-Host ('array end='+$end)
