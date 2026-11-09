# 域名ICP备案批量扫描（通用参数版）
# 用法:
#   pwsh -File domain-icp-scan.ps1                                  # 使用内置默认域名
#   pwsh -File domain-icp-scan.ps1 -Domains "a.com,b.com,c.com"      # 逗号分隔指定域名
#   pwsh -File domain-icp-scan.ps1 -DomainFile D:\list.txt           # 从文件读域名(每行一个)

param(
    [string]$Domains = "",
    [string]$DomainFile = ""
)

if ($DomainFile -and (Test-Path $DomainFile)) {
    $targetDomains = @(Get-Content $DomainFile | Where-Object { $_ -match '\S' } | ForEach-Object { $_.Trim() })
} elseif ($Domains) {
    $targetDomains = @($Domains -split ',' | ForEach-Object { $_.Trim() } | Where-Object { $_ })
} else {
    $targetDomains = @(
        "<目标域名>"
        "www.pizzahut.com.cn"
        "www.tacobellchina.com"
        "www.littlesheep.com"
        "www.yum.com.cn"
        "<目标域名>"
        "<目标域名>"
        "president-<目标域名>"
        "<目标域名>"
        "www.pizzahutchina.com.cn"
        "www.4008823823.com"
        "4008123123.com"
        "www.lavazza.com.cn"
        "<目标域名>"
        "www.coffiijoy.com"
        "www.chuanshengscm.com"
        "chuansheng.com.cn"
        "www.baisheng.com.cn"
        "www.kpro.com.cn"
        "<目标域名>"
    )
}

$results = @()
foreach ($d in $targetDomains) {
    $item = [PSCustomObject]@{
        域名       = $d
        备案号     = ""
        主办单位   = ""
        公安备案   = ""
        HTTP状态   = ""
        Title      = ""
        备注       = ""
    }
    $urls = @("https://$d/", "http://$d/")
    foreach ($url in $urls) {
        if ($item.备案号) { break }
        try {
            $resp = Invoke-WebRequest -Uri $url -TimeoutSec 10 -UserAgent "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" -MaximumRedirection 3 -ErrorAction Stop
            $item.HTTP状态 = [int]$resp.StatusCode
            $c = $resp.Content
            $m = [regex]::Match($c, "<title[^>]*>(.*?)</title>")
            if ($m.Success) { $item.Title = $m.Groups[1].Value.Trim() }
            $p = [regex]::Match($c, "([京津沪渝冀豫云辽黑湘皖鲁新苏浙赣鄂桂甘晋蒙陕吉闽贵粤青藏川宁琼]{1,2}ICP备\d+号(-\d+)?)")
            if ($p.Success) { $item.备案号 = $p.Value; break }
            $g = [regex]::Match($c, "(公网安备\s*\d+)")
            if ($g.Success) { $item.公安备案 = $g.Value -replace "\s+", "" }
            if (-not $item.备案号) { $item.备注 = "首页footer无备案信息" }
        }
        catch {
            if ($item.HTTP状态 -eq "") {
                $status = if ($_.Exception.Response) { [int]$_.Exception.Response.StatusCode } else { "无响应" }
                $item.HTTP状态 = $status.ToString()
                if ($status -eq "无响应") { $item.备注 = "无法连接/域名无站点" }
            }
        }
    }
    $results += $item
    Write-Host "$d → $($item.HTTP状态) | $($item.备案号)"
}
$results | Export-Csv -Path "$env:USERPROFILE\<本地路径>域名ICP备案结果.csv" -NoTypeInformation -Encoding UTF8
Write-Host "已导出 CSV" -ForegroundColor Green
