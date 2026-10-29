# DSH 0.2.1-rc.2 compatibility work

Status: experimental, not a release or a security sandbox. Original upstream attribution and license are retained.

## Changes under test

- Match the 0.2.1 web environment URL description, the prompt assembler's required-context filter, and the conversation append implementation.
- The prompt assembler replacement retains required contexts when runtime-context suppression is active.
- Use a static persona suffix: `{{cwd}}` is not registered in some headless profiles.
- In explicit isolated mode, restrict host discovery and patch targets to the configured laboratory, suppress global launcher modifications and DSH Doctor cleanup, and reject a different explicit DSH target.
- Create backups with exclusive copy rather than a Windows-incompatible rename over a placeholder. Abort a multi-host apply when backup reports errors.
- In isolated development mode, block the built-in destructive updater and uninstall; use the separate Git checkout for development instead.
- Isolated rules, skills and red-team writes check existing path ancestors for junctions escaping the lab; red-team skill synchronization excludes the ordinary user home. Archive skill imports are disabled in isolated mode pending safe extraction review.
- Plugin, rule, skill and red-team HTTP routes use the host connection's authentication check. Unauthenticated requests are rejected; fail closed if the host authentication service is unavailable.
- Isolated Web restarts retain the selected port and Node execution flags rather than falling back to port 3080 or losing the permission flags.

## Local verification

Use a disposable install and home, not your everyday DSH installation. Set absolute `DSH_HOME`, `DSH_BASE` (the runtime's `node_modules/@deepseek-ai`), `DSH_PURGE_LAB_ROOT`, and `DSH_PURGE_ISOLATED=1`. Set `TEMP` to an approved temporary directory, then run `npm run test:compat`.

`scripts/inspect-compat.mjs` inspects matches without writing target files. `scripts/dry-run-patches.mjs` also requires `DSH_RUNTIME_ROOT`, transforms files only in memory and runs syntax checks. These checks do not establish behavioral compatibility.

The fixture scripts under `scripts/` are for disposable, newly created target copies only. Run the apply/revert scripts with Node's permission model, restricting filesystem writes to the fixture and disallowing child processes. Never run a fixture command against a production install.

## Known limits

- `DSH_PURGE_ISOLATED=1` is an application-level guard, **not an OS sandbox**. The plugin has broad host privileges and paths outside the core patching functions require further review.
- Path checks are not atomic against junction changes; SQLite native I/O, other native code and spawned processes are not fully confined by these checks. Do not treat them as a security boundary.
- DSH's loader needs native addons; Node explicitly warns `--allow-addons` can invalidate its permission model. Do not rely on that model alone for isolation.
- A local mocked Messages endpoint can validate prompt injection and a read-tool round trip, not the behavior of a real DeepSeek model or its service rules.
- A controlled local mock was also used to exercise one PowerShell tool round trip; it does not validate arbitrary shell commands.
- Full GUI approval, normal tool permissions, upgrade recovery, and live provider authentication require separate testing before release.
- A local authenticated Web API Apply → restart → status → Revert → manual restart run was tested with a disposable copy: Apply reported 62 changes, post-restart status had 0 pending, and Revert restored 50 changed files. All 55 copied target files matched the pristine originals by SHA-256. After the manual restart, 57 items were pending again, consistent with the restored state. Five stable-install reference files also matched their pre-test hashes. This does not prove every possible filesystem path is confined.
- Unauthenticated requests to status, rules, skills, and red-team routes returned HTTP 401; authenticated rules and skills returned 200; authenticated cross-origin status returned 403. Isolated update and uninstall operations were rejected. Test results apply to the Web profile on Windows and do not establish desktop compatibility.
- After the red-team write guards in commit `6aa456e`, a fresh authenticated 3085 Web API run again applied 62 patches with zero failures, restarted with 61/63 applied and zero pending, and reverted 50 files. All 55 selected target files matched the unpatched source SHA-256, and five stable-install reference hashes remained unchanged. The authenticated red-team `bootstrap` operation succeeded before and after restart and reported the experimental home as its root; this does not constitute a full red-team workflow test.
- `dshTarget` still identifies the original supported target; do not claim general 0.2.1 support based only on these checks.
