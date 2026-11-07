# dsh-sidebar-recent

A DSH Web UI plugin that adds a compact **Recently** section to the top of the left sidebar, above the normal workspace groups.

The stock sidebar only groups sessions by workspace. With many workspaces you end up scrolling a lot just to get back to the session you were using five minutes ago. This plugin replaces the `sidebar.workspaces` slot with a view that shows:

1. a **Recently** list — most recent sessions across all workspaces, with the owning workspace as a caption;
2. the usual **Workspaces** groups underneath, with the same per-workspace ordering the official list uses.

Everything else stays familiar: 28px rows, inline workspace menu, session rows with pin / rename / fork / archive / copy-id, drag to reorder, and a switch back to the stock view.

## Features

- **Recently** section: newest activity first, collapsed/expanded state remembered.
- **Paged history**: 8 sessions by default, then +20 per click, with a one-click collapse back to 8.
- **Workspace groups**: 6 sessions per group, then +20 per click, same collapse.
- **Compact rows**: 28px, so a screenful shows roughly twice what the stock list shows.
- **Status ring**: a running session shows a small spinning ring instead of a dot.
- **Menus**: session rows and workspace headers have the same actions as the stock UI (pin/unpin, rename, fork, archive, copy session id / new session, rename workspace, copy path, delete workspace).
- **Drag and drop**: reorder sessions inside a workspace, reorder workspace groups.
- **View switch**: the `⇄` button in the *Recently* header (or a floating `⇄` next to the workspace controls while the stock view is active) toggles between this view and the unmodified stock list.
- **Localized**: Chinese and English dictionaries, following the app locale.

## Install

This is a client-side DSH plugin bundle. Install it like any other bundle, pointing at the package directory:

```sh
dsh plugin install /absolute/path/to/dsh-sidebar-recent
```

or, from inside a running DSH session, use the `plugin_manager` tool with `action=install_bundle` and the absolute path as `target`.

Then refresh the Web UI. The plugin registers itself when the client boots; there is no host-side work to do (see `index.js`).

## How it works

- `package.json` declares `dsh.bundle.patch` → `cordis.patch.yml`, which inserts the plugin into the profile.
- `dsh.client.platform = "web"` plus the `./client` export tells the client module registry to serve `client.js` to the browser bundle graph.
- `client.js` is plain browser JavaScript (no build step, no JSX). It registers a component for the `sidebar.workspaces` slot at `priority: -1`, which shadows the built-in registration (single slots render the lowest priority).
- Sessions are read from the injected `useSessions` / `useWorkspaces` / `useSessionStatus` hooks; the order written back goes through `ctx.workspaces.insertSessionBefore()` / `insertBefore()`, the same controller the official UI calls.
- Switching back to the stock view disposes the override registration, so the built-in component takes over again — no flicker, no approximations.

## Compatibility

Written against DSH `0.2.2-alpha.x` client APIs:

- slot `sidebar.workspaces` (single, owner props `{ wide, expandSidebar }`)
- services `slots`, `uiWorkspace`, `workspaces`, `sessions`
- `react` / `react-dom` from the client module seed table

Other versions may rename slots or services; the plugin fails soft (it logs and renders nothing) if a service is missing.

## Development

```sh
node --check client.js   # syntax check, no bundler required
```

Edit `client.js`, reload the page, and check the browser console — the module registry serves the file as-is and busts its `rev` on change.

## License

MIT
