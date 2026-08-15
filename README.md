

<div align="center">
  
# ⚡ ZEUS PANEL

[![Version](https://img.shields.io/badge/Version-v1.11.4-blue.svg?style=for-the-badge&logo=cloudflare)](https://github.com/zeus-panel/ZEUS-PANEL)
[![Platform](https://img.shields.io/badge/Platform-Railway-0B0D0E.svg?style=for-the-badge&logo=railway&logoColor=white)](https://railway.com/)
[![License](https://img.shields.io/badge/License-Proprietary%20(Non--Commercial)-red.svg?style=for-the-badge)](https://github.com/zeus-panel/ZEUS-PANEL/blob/main/LICENSE)
[![Telegram](https://img.shields.io/badge/Community-PANEL__ZEUS-2CA5E0.svg?style=for-the-badge&logo=telegram)](https://t.me/PANEL_ZEUS)
</div>

> [!IMPORTANT]
> This branch is the Railway-native ZEUS port. It runs as a persistent Node.js service with PostgreSQL and does not require Cloudflare Workers, D1, Wrangler, or a Cloudflare account. See [README-RAILWAY.md](README-RAILWAY.md) for complete deployment and migration instructions.

<img  src="https://raw.githubusercontent.com/panel-zeus/Z-E-U-S/refs/heads/main/photos/dark.png"  width="100%"  alt="Zeus Panel Dark Mode"  style="border-radius: 12px; margin-bottom: 15px;">

  
<img  src="https://raw.githubusercontent.com/panel-zeus/Z-E-U-S/refs/heads/main/photos/add.png"  width="100%"  alt="Zeus Panel Dark Mode"  style="border-radius: 12px; margin-bottom: 15px;">

  

<table  width="100%">

<tr>

<td width="50%" valign="middle" align="center">

<img  src="https://raw.githubusercontent.com/panel-zeus/Z-E-U-S/refs/heads/main/photos/bot.png"  width="100%"  alt="Zeus Panel Status"  style="border-radius: 12px;">

</td>

<td width="50%" valign="middle" align="center">

<img  src="https://raw.githubusercontent.com/panel-zeus/Z-E-U-S/refs/heads/main/photos/status.png"  width="100%"  alt="Zeus Panel Dark Mode"  style="border-radius: 12px;">

</td>

</tr>

</table>


[⚡️ Key Features](#️-features) • [🚀 Deployment Guide](#-quick-deployment-guide) • [🔎 IP Scanner](#-clean-ip-scanner) • [🛡️ SOCKS5 Proxy](#️-build-your-own-socks5-proxy-zeus-relay) • [❤️ Donate](#-donate--support) • [⚖️ License & Copyright](#license-copyright) • [Credits](#credits-section)

</div>

---

# ⚡️ Features
🌍 Multi-Location Routing: Seamlessly assign up to five distinct proxies or geographic locations simultaneously to individual users, providing diversified connection pathways.

⚡️ Smart Buffering Engine: Advanced dynamic data transfer management implemented to significantly boost overall connection speed and stability.

👥 Advanced User Management: Enforce strict limits based on traffic volume (GB), time expiration (Days), total requests, and concurrent devices, featuring highly accurate tracking for CGNAT and mobile network environments.

♻️ Automated Quota Resets: Scheduled auto-reset capabilities for volume and request counters based on specified timeframes.

🛠 Bulk Operations: Comprehensive multi-select tools for batch user editing, deletion, and quota resets.

🛡 Anti-Filtering Mechanisms: Built-in TLS Fragment support and custom ClientHello Fingerprint simulators to bypass DPI.

📱 Modern UI: A responsive, mobile-friendly interface built with Tailwind CSS, featuring full AMOLED Dark Mode.

🛑 Smart Content Blocker: Integrated DNS-over-HTTPS (DoH) engine to actively intercept and block NSFW content and advertisements.

🌐 Dynamic IP Rotation: Automated rotation of clean Cloudflare edge IPs at custom, user-defined intervals.

🔀 Automated Proxy Fallback: Intelligent auto-replacement of failing upstream user proxies with healthy nodes dynamically fetched from dedicated VIP proxy repositories.

📊 Live Quota Monitoring: Real-time tracking of Cloudflare Worker requests to proactively prevent account bans or suspensions.

🔗 Self-Service Portals: Auto-generation of robust, case-insensitive Subscription Links, QR codes, and dedicated real-time status pages for every user.

🔄 OTA Core Updates: Automated edge deployment system updating the panel directly without database or data loss.

🗄 Complete Backup System: Full JSON export and import utility covering the entire database, server configuration state, and advanced user proxy preferences.

🚀 One-Click Deployment: Complete provisioning of the panel, subdomain, and D1 database directly via the Telegram Bot.

🤖 Multi-Account Bot Management: Simultaneously manage multiple Cloudflare accounts, execute panel updates, and recover passwords using the Telegram Bot.

🔌 Comprehensive Port Support: Native support for all Cloudflare TLS and non-TLS ports, including configurations for custom network ports.

🚆 Railway Native: Persistent Node.js WebSocket/TCP service, PostgreSQL persistence, independent schedulers, health checks, and graceful deployment shutdown.

---

# 🚀 Quick Deployment Guide

<div align="center">

<a href="https://railway.com/new" target="_blank">
<img src="https://img.shields.io/badge/Railway-Deploy-0B0D0E?style=for-the-badge&logo=railway&logoColor=white" alt="Deploy on Railway" height="40">
</a>

<div align="center">
Push this repository to GitHub, create a Railway project, add PostgreSQL, connect the repository, and configure <code>DATABASE_URL</code> plus <code>SESSION_SECRET</code>. Generate a public domain and open <code>/panel</code> to create the initial password.
</div>

<br>

Full instructions: <strong><a href="README-RAILWAY.md">Railway Deployment Guide</a></strong>

</div>

<br>

## 🤖 Legacy Cloudflare Bot Deployment (Optional)

The steps below are retained for users of the original Worker edition. They are not required by the Railway version.

1. 🌐 Access the **[ZEUS Telegram Bot](https://t.me/ZEUS_PANEL_BOT)** and click `Start`.
2. 👤 From the main menu, click on **"➕ Register Cloudflare Account"**.
3. 🔗 Click the inline button **"🔑 Get Cloudflare Token"** to be redirected to your Cloudflare account.
4. 🟦 Scroll to the bottom of the Cloudflare page, click the blue `Continue to summary` button, and then click `Create Token`.
5. 🔑 Copy the generated token and **send it directly in the bot chat**.
6. ⚡️ Once the token is verified, return to the main menu, click **"🚀 Build New Panel"**, and select your account. Your D1 database and panel will be automatically deployed.

---

> [!CAUTION]
> **CRITICAL SECURITY NOTE:** Ensure you securely save the initial administrative password you set during your first login to the panel. Do not lose it!

---


# 🛡️ Build Your Own SOCKS5 Proxy (Zeus Relay)

A dedicated bash script is provided to instantly deploy a private, secure SOCKS5 proxy on any Linux VPS (Ubuntu, Debian, CentOS, Rocky Linux). This is highly recommended for users who wish to create VIP residential proxies to route traffic through clean, dedicated IPs.

To install, update, or remove the Dante SOCKS5 proxy, execute the following command on your Linux server with root privileges:

```bash
bash <(curl -Ls https://raw.githubusercontent.com/panel-zeus/Z-E-U-S/main/zeus-relay.sh | sed 's/\r$//')
```

The script features an interactive menu, automatic port configuration, random secure credential generation (username/password), and native IPv4/IPv6 integration.

---

# 🔎 Clean IP Scanner

ZEUS Panel features a highly optimized, multi-threaded local IP scanner. You can quickly find the fastest and most stable clean Cloudflare IPs directly from your device using the methods below:

### 📱 Mobile Users (Pydroid 3 - Android)
1. Install **[Pydroid 3](https://play.google.com/store/apps/details?id=ru.iiec.pydroid3)** from the Google Play Store.
2. Open the app, navigate to the **Terminal** from the side menu, and execute the following command:

```bash
python -c "import urllib.request; req = urllib.request.Request('https://raw.githubusercontent.com/panel-zeus/Z-E-U-S/refs/heads/main/zeus-scanner.txt', headers={'User-Agent': 'Mozilla/5.0'}); exec(urllib.request.urlopen(req).read().decode('utf-8').split('---PYTH' + 'ON---')[1].split('---POWERSHELL---')[0].strip())"

```

3. Once the server initializes, open `http://127.0.0.1:8000` in your web browser.

### 💻 Windows Users (CMD / PowerShell)

Open **Command Prompt (CMD)** in Windows, paste the following command, and hit Enter. The high-speed scanner interface will automatically compile and launch:

```cmd
powershell -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 -bor [Net.SecurityProtocolType]::Tls13; $wc = New-Object System.Net.WebClient; $wc.Encoding = [System.Text.Encoding]::UTF8; $text = ($wc.DownloadString('https://raw.githubusercontent.com/panel-zeus/Z-E-U-S/refs/heads/main/zeus-scanner.txt') -split '---POWERSHELL---')[1].Trim(); [IO.File]::WriteAllText('zeus-scanner.ps1', $text, [System.Text.Encoding]::UTF8); .\zeus-scanner.ps1"

```

---


# 💰 Donate & Support

<p align="center">Built with ❤️</p>

<p align="center"><a href="https://donatonion.ir-netlify.workers.dev"><b>https://donatonion.ir-netlify.workers.dev</b></a></p>

<p align="center">Thank you for your support in keeping this open-source project alive and actively developed! 🙏</p>

---

## Star History

<a href="https://www.star-history.com/?repos=panel-zeus%2FZ-E-U-S&type=date&legend=bottom-right">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/chart?repos=panel-zeus/Z-E-U-S&type=date&theme=dark&legend=bottom-right&sealed_token=r3Lb_3aKfu0utexFy3xJoisRGRSGS4OCoQg3ZS5TM1QCTppem2RU8sLiVsD6UQ38Ah92MwuZU_PjyQTFM5yY3rAw14WEjtonC70muFBH4RbXxBDGIy5iIw" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/chart?repos=panel-zeus/Z-E-U-S&type=date&legend=bottom-right&sealed_token=r3Lb_3aKfu0utexFy3xJoisRGRSGS4OCoQg3ZS5TM1QCTppem2RU8sLiVsD6UQ38Ah92MwuZU_PjyQTFM5yY3rAw14WEjtonC70muFBH4RbXxBDGIy5iIw" />
   <img alt="Star History Chart" src="https://api.star-history.com/chart?repos=panel-zeus/Z-E-U-S&type=date&legend=bottom-right&sealed_token=r3Lb_3aKfu0utexFy3xJoisRGRSGS4OCoQg3ZS5TM1QCTppem2RU8sLiVsD6UQ38Ah92MwuZU_PjyQTFM5yY3rAw14WEjtonC70muFBH4RbXxBDGIy5iIw" />
 </picture>
</a>

---

## <a id="license-copyright"></a>⚖️ License & Copyright

**Copyright (c) 2026 ZEUS PANEL Contributors. All Rights Reserved.**

This software is provided for **personal, non-commercial use only**. By downloading or using this software, you agree to the following strict conditions:

1. 🚫 **No Resale or Monetization:** You may not sell, rent, or lease this software, nor use it to provide commercial services (e.g., selling panel access or configurations).
2. 🚫 **No Modifications or Derivatives:** You are strictly prohibited from modifying, adapting, translating, or creating derivative works based on this source code.
3. 🚫 **No Redistribution:** You may not host, publish, or redistribute this software on any other repository, platform, or service without explicit written permission.

The source code is published solely for transparency and personal deployment. For the full legal terms, please read the [LICENSE](LICENSE) file included in this repository.

---

## <a id="credits-section"></a>Credits
This panel was originally conceptualized and authored by Arad and Morgan. The current version represents an extended, highly optimized, and heavily refactored iteration of that core logic.

* **Original Authors:** The baseline concept and initial framework belong to [AG-Morgan](https://github.com/AG-Morgan) and [aradava](https://github.com/aradava).
* **Current Maintainer:** The system upgrades, advanced network capabilities, UI redesign, and automated deployment infrastructure have been developed and maintained by [PANEL_ZEUS](https://t.me/PANEL_ZEUS).

### Special Thanks

<!-- Attribution notice: Keep the usernames and platform names below exactly as written during future refactoring. -->

Special Thanks to:  
@Rayan_Crafter — YouTube  
@Inetiran — Telegram

<div dir="rtl">

با تشکر ویژه از:  
@Rayan_Crafter در یوتیوب  
و @Inetiran در تلگرام

</div>
