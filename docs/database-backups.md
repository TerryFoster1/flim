# Database Backups

Flim stores production playlist, profile, and cache data in Neon PostgreSQL. Backups should be treated as private operational artifacts and must not be committed to the public app repository.

## Export Endpoint

The app exposes a protected JSON export endpoint:

```text
GET /api/admin/export
```

It requires this header:

```text
x-admin-export-secret: <ADMIN_EXPORT_SECRET>
```

The endpoint returns:

- `generated_at`
- `schema_version`
- `table_counts`
- `data.playlists`
- `data.playlist_movies`
- `data.users`
- `data.user_profiles`
- `data.tmdb_search_cache`
- `data.tmdb_movie_cache`

The export intentionally does not include `DATABASE_URL`, environment variables, session tokens, or `users.password_hash`.

## Required Environment Variable

Set this in Vercel Production and Preview environments:

```text
ADMIN_EXPORT_SECRET=
```

Use a long random value. Do not expose it in the browser and do not prefix it with `VITE_`.

## Manual Export

PowerShell example:

```powershell
$env:ADMIN_EXPORT_SECRET="paste-secret-here"
curl.exe -H "x-admin-export-secret: $env:ADMIN_EXPORT_SECRET" https://www.flim.ca/api/admin/export -o ".\flim-backup-$(Get-Date -Format yyyyMMdd-HHmmss).json"
```

Verify the saved file contains `generated_at`, `schema_version`, and reasonable `table_counts`.

## Local Storage

Store manual backup files outside the public app repository, for example:

```text
C:\Users\kathr\Documents\Flim Backups\
```

Do not commit backup JSON files to this repo.

## Private GitHub Backup Repository

If using GitHub for backup history:

1. Create a private repository.
2. Save exports locally outside the app repo.
3. Commit backup JSON only to the private backup repository.
4. Never commit `.env` files or Vercel environment variables.

## Future Automation Plan

Options:

- Vercel Cron calls `/api/admin/export` and writes to private storage.
- GitHub Actions scheduled workflow calls the endpoint with `ADMIN_EXPORT_SECRET` stored as an Actions secret.
- A local scheduled PowerShell script writes timestamped backups to a private folder.

Before automation, decide where encrypted backups live and how restore drills are tested.

## Restore Notes

The JSON export is a portability backup, not a full Postgres dump. For full disaster recovery, Neon point-in-time restore and `pg_dump`/`pg_restore` should be added to the operations runbook.
