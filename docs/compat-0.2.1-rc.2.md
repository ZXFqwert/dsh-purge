# DSH 0.2.1-rc.2 compatibility work

Status: experimental, not a release or a security sandbox. Original upstream attribution and license are retained.

## Changes under test

- Match the 0.2.1 web environment URL description, the prompt assembler's required-context filter, and the conversation append implementation.
- The prompt assembler replacement retains required contexts when runtime-context suppression is active.
- Use a static persona suffix: `{{cwd}}` is not registered in some headless profiles.
- In explicit isolated mode, restrict host discovery and patch targets to the configured laboratory, suppress global launcher modifications and DSH Doctor cleanup, and reject a different explicit DSH target.
- Create backups with exclusive copy rather than a Windows-incompatible rename over a placeholder. Abort a multi-host apply when backup reports errors.

## Local verification

Use a disposable install and home, not your everyday DSH installation. Set absolute `DSH_HOME`, `DSH_BASE` (the runtime's `node_modules/@deepseek-ai`), `DSH_PURGE_LAB_ROOT`, and `DSH_PURGE_ISOLATED=1`. Set `TEMP` to an approved temporary directory, then run `npm run test:compat`.

`scripts/inspect-compat.mjs` inspects matches without writing target files. `scripts/dry-run-patches.mjs` also requires `DSH_RUNTIME_ROOT`, transforms files only in memory and runs syntax checks. These checks do not establish behavioral compatibility.

The fixture scripts under `scripts/` are for disposable, newly created target copies only. Run the apply/revert scripts with Node's permission model, restricting filesystem writes to the fixture and disallowing child processes. Never run a fixture command against a production install.

## Known limits

- `DSH_PURGE_ISOLATED=1` is an application-level guard, **not an OS sandbox**. The plugin has broad host privileges and paths outside the core patching functions require further review.
- DSH's loader needs native addons; Node explicitly warns `--allow-addons` can invalidate its permission model. Do not rely on that model alone for isolation.
- A local mocked Messages endpoint can validate prompt injection and a read-tool round trip, not the behavior of a real DeepSeek model or its service rules.
- A controlled local mock was also used to exercise one PowerShell tool round trip; it does not validate arbitrary shell commands.
- Full GUI approval, normal tool permissions, recovery after real restarts and upgrades, and live provider authentication require separate testing before release.
- `dshTarget` still identifies the original supported target; do not claim general 0.2.1 support based only on these checks.
