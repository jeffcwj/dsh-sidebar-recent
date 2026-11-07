# dsh-sidebar-recent

> 简体中文 | [English](#english)

给 DSH Web UI 左侧栏加一个紧凑的「最近」分区的插件，位置在原「工作区」分组之上。

原版侧栏只按工作区分组，工作区一多，想回到五分钟前刚用过的那个会话就得一路往下翻。这个插件接管 `sidebar.workspaces` 槽位，改成两段：

1. 顶部 **最近**：跨全部工作区的最近会话，按活动时间倒序，行右侧灰字标注所属工作区；
2. 下面 **工作区**：原来的分组列表，组内顺序与官方一致（`workspace.sessionIds` 的手动顺序，置顶浮到组首）。

其余体验保持熟悉：28px 行高、分类与行的 `…` 菜单、会话置顶 / 重命名 / 分叉 / 归档 / 复制 Session ID、拖动排序，以及一键切回官方列表。

## 功能

- **最近**：最新的在最上面，折叠状态记在 `localStorage`。
- **分批展开**：默认 8 条，每点一次 +20，出现「收起更早的会话」一键回到 8 条。
- **工作区分组**：每组默认 6 条，每点一次 +20，同样可收起。
- **紧凑行高**：28px，一屏能看的条数大约是原版的两倍。
- **运行环**：正在跑的会话，左侧状态点变成旋转的小圆环，其余仍是圆点。
- **菜单**：会话行与工作区组头都有与官方一致的操作项（置顶/取消置顶、重命名、分叉、归档、复制 Session ID / 新建会话、重命名工作区、复制路径、删除工作区），菜单 `Portal` 到 `body`，不会被滚动容器裁剪。
- **拖拽排序**：会话可在所属工作区内上下重排；工作区组可整体拖动排序；落点有 2px 蓝色插入线。
- **视图切换**：「最近」标题行右侧的 `⇄`（官方视图下是悬浮在「工作区」图标簇左侧的 `⇄`）在插件视图与原版列表之间切换，原版是真正的官方组件，不是近似实现。
- **中英双语**：跟随应用语言切换。

## 安装

这是一个纯客户端插件包。用安装 bundle 的方式指向包目录：

```sh
dsh plugin install /absolute/path/to/dsh-sidebar-recent
```

或在运行中的 DSH 会话里用 `plugin_manager`，`action=install_bundle`、`target` 填包目录绝对路径。装完刷新 Web UI 即可；Host 侧没有逻辑（见 `index.js`）。

## 实现说明

- `package.json` 里 `dsh.bundle.patch` 指向 `cordis.patch.yml`，把插件插进 profile。
- `dsh.client.platform = "web"` + `./client` 导出，让 client module registry 把 `client.js` 送进浏览器模块图。
- `client.js` 是浏览器原生 JS（无构建、无 JSX）。它以 `priority: -1` 注册 `sidebar.workspaces` 槽位组件——single 槽渲染优先级最低者，因此覆盖内置注册。
- 数据来自注入的 `useSessions` / `useWorkspaces` / `useSessionStatus`；排序写回走 `ctx.workspaces.insertSessionBefore()` / `insertBefore()`，与官方 UI 调用同一套 controller。
- 切回官方视图时注销自己的注册，内置组件自然接管，零近似、无闪烁。

## 兼容性

基于 DSH `0.2.2-alpha.x` 的客户端 API 编写：

- 槽位 `sidebar.workspaces`（single，owner props `{ wide, expandSidebar }`）
- 服务 `slots`、`uiWorkspace`、`workspaces`、`sessions`
- 模块 seed 表里的 `react` / `react-dom`

其他版本若改过槽位或服务名，插件会软失败（缺服务时只打日志、不渲染），不会让整个侧栏白屏。

## 开发

```sh
node --check client.js   # 只做语法检查，无需打包
```

改完 `client.js` 刷新页面即可，模块注册表按内容 hash 自动换 `rev`；控制台里 `[sidebar-recent]` 前缀的日志来自插件自身。

## 许可

MIT

---

## English

A DSH Web UI plugin that adds a compact **Recently** section to the top of the left sidebar, above the normal workspace groups.

The stock sidebar only groups sessions by workspace. With many workspaces you end up scrolling a lot just to get back to the session you were using five minutes ago. This plugin replaces the `sidebar.workspaces` slot with a view that shows:

1. a **Recently** list — most recent sessions across all workspaces, with the owning workspace as a caption;
2. the usual **Workspaces** groups underneath, with the same per-workspace ordering the official list uses.

Everything else stays familiar: 28px rows, inline workspace menu, session rows with pin / rename / fork / archive / copy-id, drag to reorder, and a switch back to the stock view.

### Features

- **Recently** section: newest activity first, collapsed/expanded state remembered.
- **Paged history**: 8 sessions by default, then +20 per click, with a one-click collapse back to 8.
- **Workspace groups**: 6 sessions per group, then +20 per click, same collapse.
- **Compact rows**: 28px, so a screenful shows roughly twice what the stock list shows.
- **Status ring**: a running session shows a small spinning ring instead of a dot.
- **Menus**: session rows and workspace headers have the same actions as the stock UI (pin/unpin, rename, fork, archive, copy session id / new session, rename workspace, copy path, delete workspace).
- **Drag and drop**: reorder sessions inside a workspace, reorder workspace groups.
- **View switch**: the `⇄` button in the *Recently* header (or a floating `⇄` next to the workspace controls while the stock view is active) toggles between this view and the unmodified stock list.
- **Localized**: Chinese and English dictionaries, following the app locale.

### Install

This is a client-side DSH plugin bundle. Install it like any other bundle, pointing at the package directory:

```sh
dsh plugin install /absolute/path/to/dsh-sidebar-recent
```

or, from inside a running DSH session, use the `plugin_manager` tool with `action=install_bundle` and the absolute path as `target`.

Then refresh the Web UI. The plugin registers itself when the client boots; there is no host-side work to do (see `index.js`).

### How it works

- `package.json` declares `dsh.bundle.patch` → `cordis.patch.yml`, which inserts the plugin into the profile.
- `dsh.client.platform = "web"` plus the `./client` export tells the client module registry to serve `client.js` to the browser bundle graph.
- `client.js` is plain browser JavaScript (no build step, no JSX). It registers a component for the `sidebar.workspaces` slot at `priority: -1`, which shadows the built-in registration (single slots render the lowest priority).
- Sessions are read from the injected `useSessions` / `useWorkspaces` / `useSessionStatus` hooks; the order written back goes through `ctx.workspaces.insertSessionBefore()` / `insertBefore()`, the same controller the official UI calls.
- Switching back to the stock view disposes the override registration, so the built-in component takes over again — no flicker, no approximations.

### Compatibility

Written against DSH `0.2.2-alpha.x` client APIs:

- slot `sidebar.workspaces` (single, owner props `{ wide, expandSidebar }`)
- services `slots`, `uiWorkspace`, `workspaces`, `sessions`
- `react` / `react-dom` from the client module seed table

Other versions may rename slots or services; the plugin fails soft (it logs and renders nothing) if a service is missing.

### Development

```sh
node --check client.js   # syntax check, no bundler required
```

Edit `client.js`, reload the page, and check the browser console — the module registry serves the file as-is and busts its `rev` on change.

### License

MIT
