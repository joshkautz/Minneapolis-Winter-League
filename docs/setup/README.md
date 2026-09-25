# Setup and Development

Index for setup, local development and deployment documentation.

## Documents

- **[Development Setup](./DEVELOPMENT_SETUP.md)** — prerequisites, install,
  first run, daily commands, troubleshooting. Start here.
- **[Environment Variables](./ENVIRONMENT_VARIABLES.md)** — Vite env files per
  mode and Functions secrets.
- **[Emulator Data](./EMULATOR_DATA_README.md)** — how local data is generated,
  stored and reset.

## The 60-second version

```bash
nvm use        # Node 22
npm ci         # installs root + both workspaces
npm run seed   # generate local data, no Firebase login needed
npm run dev    # emulators + Functions watch + Vite
```

App at <http://localhost:5173>, Emulator UI at <http://localhost:4000>.

Before opening a pull request:

```bash
npm run verify   # format, lint, typecheck, all four test suites, build
```

## Deployment

Merging to `main` deploys Hosting and Functions via GitHub Actions. Pull
requests get a Hosting preview channel, posted as a PR comment. The preview
runs against production data — there is no staging project — so try anything
that writes against the emulators instead.

Firestore rules and indexes deploy from CI as well, gated on the rules test
suite. To deploy them out of band:

```bash
firebase deploy --only firestore
```

## Related

- [Project Structure](../PROJECT_STRUCTURE.md)
- [Security Guidelines](../SECURITY.md)
- [App overview](../app/README.md)
- Historical migration notes: [`../historical/`](../historical/)
