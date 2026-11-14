# MoneyFlow

Family income & expense tracker — works like a mobile app on phones and like a dashboard on laptops. Bangla / English.

## Run it on your laptop

Requirements: .NET 9 SDK, Node.js 20+, SQL Server (Express/Developer is fine).

Easiest: double-click `start.cmd` in the project folder. It builds the UI the first time, starts the server and opens the browser. Close the window to stop.

Manual steps:

```bash
cd frontend
npm install
npm run build:api
cd ../backend
dotnet run --project MoneyFlow.Api
```

Open http://localhost:5080. The database (`MoneyFlow`) is created automatically on first start, and the first screen asks you to create the admin account.

### Use it from a phone on the same Wi-Fi

1. Find the laptop's IP: `ipconfig` → IPv4 Address (e.g. `192.168.0.105`).
2. Allow port 5080 through Windows Firewall once (admin PowerShell):
   `New-NetFirewallRule -DisplayName "MoneyFlow" -Direction Inbound -Protocol TCP -LocalPort 5080 -Action Allow -Profile Private`
3. On the phone open `http://192.168.0.105:5080` and use **Add to Home Screen**.

## Use a different database

Edit `backend/MoneyFlow.Api/appsettings.json`:

```json
"ConnectionStrings": {
  "MoneyFlowDb": "Server=YOUR_SERVER;Database=MoneyFlow;User Id=...;Password=...;TrustServerCertificate=True;"
}
```

or set the environment variable `ConnectionStrings__MoneyFlowDb` (keeps passwords out of git).

## Development

- API: `dotnet run --project backend/MoneyFlow.Api` (port 5080)
- UI with live reload: `cd frontend && npm start` → http://localhost:4200 (calls the API through a proxy)

## License

GPL-3.0
