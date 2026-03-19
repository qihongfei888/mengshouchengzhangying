$f='c:\Users\24729\Desktop\萌兽成长营\xintongxin\app.js'
$enc=New-Object System.Text.UTF8Encoding($true)
$bytes=[System.IO.File]::ReadAllBytes($f)
$c=$enc.GetString($bytes)

# Patch 1: add daily star toggle in bindNav
$old1="const period = tab.dataset.period;"
$new1="const period = tab.dataset.period;`r`n          var dsa=document.getElementById('dailyStarActions');if(dsa)dsa.style.display=period==='day'?'flex':'none';"
$c=$c.Replace($old1,$new1)

# Patch 2: add monopoly page route in showPage
$old2="if (pageId === 'store') this.renderStore();"
$new2="if (pageId === 'store') this.renderStore();`r`n      if (pageId === 'monopoly') { if (window.Monopoly) window.Monopoly.render(); }"
$c=$c.Replace($old2,$new2)

$newbytes=$enc.GetBytes($c)
[System.IO.File]::WriteAllBytes($f,$newbytes)
Write-Host 'Done'
