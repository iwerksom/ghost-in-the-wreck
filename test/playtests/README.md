# Archived playtest scripts

Raw output from the adversarial playtest squad — nine agents, each on a narrow
mission (new-player, voice doors, hostile input, resource economy, full run,
mobile, persistence, model quality, performance). Between them they filed 19
findings, three of them major: empty door hints (the trailing-space
tokenization bug), a dead finale button on replay, and weak Okafor
separability. All fixed and re-verified before release.

Kept for the record, not as maintained tooling. **These scripts still contain
absolute paths from the machine they were written on** (`/home/claude/...`) and
will not run as-is; fix the paths the way `test/smoke.js` does (resolve from
`__dirname`) if you want to reuse one.

The maintained harness is `test/playtest_workflow.js` one directory up.
