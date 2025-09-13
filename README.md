README skeleton

    Title: Shop Attendance

    Badges: build status (GitHub Actions), Deno Deploy

    Overview: What it does, who it’s for

    Features:

        Check‑in/out with audio recording

        Live dashboards via WebSockets

        Dynamic backend URL from Supabase config

        Local disk audio storage

    Architecture:

        Frontend: React + Vite (static) on Deno

        Backend: Node/Express on PC via ngrok

        Data: Supabase Postgres + Storage (config/api.json)

    Quick start:

        npm ci; scripts/start-dev.ps1 to auto‑start ngrok, write envs, run dev

        Visit the Deno URL or local dev URL

    Daily workflow:

        6 AM start script → 9 AM “I’m here” → 9 PM “I’m out”

    Deployment:

        Static site via GitHub Actions to static‑dist branch (served by Deno)

        VITE_CONFIG_URL set to Supabase public config JSON

    Configuration:

        .env, client/.env.local, client/.env.production keys

    Scripts:

        prod-auto.ps1, register-prod-autostart.ps1, update-supabase-config.ps1, create-desktop-shortcut.ps1

    Security & limits:

        Cookies/CORS notes, disk space, optional ngrok static domain

    License

Repo tagline variations

    “Shop attendance with audio, hybrid cloud + local PC”

    “Static React UI on Deno, local Node API via ngrok, Supabase-backed”

    “Zero‑rebuild runtime config for rotating tunnels”
