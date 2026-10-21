# logs-2026

Robot log storage for FRC team 3467, 2026 season. The team log viewer at
https://whs-frc-3467.github.io/log-viewer/ fetches files from this repo at runtime
(via raw.githubusercontent.com). No Git LFS is used.

## Adding logs

1. Put AdvantageKit `.wpilog` files in `logs/<Event>/<MatchType>/`, for example
   `logs/NE-DCMP/Quals/akit_26-04-30_23-06-23_hopper_q62.wpilog`.
2. Commit and push with git or GitHub Desktop.
3. A GitHub Action gzips the files and updates `index.json` within a minute or two.
   The site shows new logs a few minutes after that (raw.githubusercontent.com caches for about 5 minutes).

Notes:
- The GitHub web uploader is limited to 25 MB per file, so most logs need git or GitHub Desktop.
- Files must be under 100 MB to push. For bigger logs, gzip first (`gzip -9 file.wpilog`, or run
  `node scripts/index.mjs` locally, which converts in place) and push the `.gz`.
- Do not commit `.hoot` or `.revlog` files. The viewer cannot open them, and they are gitignored.
- Deleting a log removes it from the site, but it stays in git history. Avoid committing junk.

## Folder names

- Event: `NE-DCMP`, `W5-Worcester`, etc.
- Match type: `Practice`, `Quals`, `Elims`, `Finals`, `Other`.

## Housekeeping

One repo per season (next year: `logs-2027`). Keep each repo under about 5 GB.
