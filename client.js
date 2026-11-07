/**
 * sidebar-recent — client half (v3).
 *
 * Shadows the shipped `sidebar.workspaces` registration (priority -1) with a
 * browser that keeps the original workspace grouping and adds a compact
 * 「最近」 section on top.
 *
 *   - 「最近」 pages in batches (8 → +20 …) and collapses back in one click
 *   - workspace groups page too (6 visible, then batches of 20)
 *   - session rows and workspace headers keep their actions: hover "…",
 *     right-click menu, pin / rename / fork / archive / copy id
 *   - a running session shows a spinning ring instead of a status dot
 *   - the footer toggle swaps between this view and the shipped list by
 *     unregistering and re-registering, so "official" really is the original
 */
window.__ModuleLoader__.load({
  id: '@local/dsh-sidebar-recent',
  factory(require) {
    'use strict';

    const React = require('react');
    const h = React.createElement;

    /* Popups are portalled into <body>: the sidebar renders inside transformed
     * / clipped ancestors, so a fixed-position menu inside it can end up under
     * other UI and stop receiving clicks. */
    let createPortal = null;
    try {
      const reactDom = require('react-dom');
      createPortal = reactDom && reactDom.createPortal ? reactDom.createPortal : null;
    } catch (error) {
      createPortal = null;
    }
    const portalize = (node) => (createPortal ? createPortal(node, document.body) : node);

    const INITIAL_RECENT = 8;
    const RECENT_BATCH = 20;
    const INITIAL_GROUP = 6;
    const GROUP_BATCH = 20;

    const KEY_RECENT_OPEN = 'dsh.sidebarRecent.recentOpen';
    const KEY_CLOSED_GROUPS = 'dsh.sidebarRecent.closedGroups';
    const KEY_MODE = 'dsh.sidebarRecent.mode';

    /**
     * Which browser owns `sidebar.workspaces`.
     *
     *   'ours'     — this plugin's registration (priority -1) is mounted
     *   'official' — the registration is disposed, so the shipped priority-0
     *                WorkspaceBrowser renders natively
     *
     * Swapping really registers and unregisters; official mode is the shipped
     * component, not a lookalike, which is what makes A/B comparison honest.
     */
    const modeStore = {
      value: 'ours',
      swap: null,
      listeners: new Set(),
    };

    function useMode() {
      const [value, setValue] = React.useState(modeStore.value);
      React.useEffect(() => {
        const listener = () => setValue(modeStore.value);
        modeStore.listeners.add(listener);
        listener();
        return () => { modeStore.listeners.delete(listener); };
      }, []);
      return value;
    }

    /* ------------------------------------------------------------------ *
     * Palette — --dsw-alias-* tokens with literal fallbacks.
     * ------------------------------------------------------------------ */
    const C = {
      label1: 'var(--dsw-alias-label-primary, inherit)',
      label2: 'var(--dsw-alias-label-secondary, inherit)',
      label3: 'var(--dsw-alias-label-tertiary, rgba(127,127,127,0.85))',
      dimmed: 'var(--dsw-alias-label-dimmed, rgba(127,127,127,0.6))',
      hover: 'var(--dsw-alias-interactive-bg-hover, rgba(127,127,127,0.10))',
      active: 'var(--dsw-alias-interactive-bg-active, rgba(127,127,127,0.16))',
      divider: 'var(--dsw-alias-border-l2, rgba(127,127,127,0.18))',
      dividerSoft: 'var(--dsw-alias-border-l3, rgba(127,127,127,0.10))',
      layer1: 'var(--dsw-alias-bg-layer-1, transparent)',
      layer2: 'var(--dsw-alias-bg-layer-2, rgba(127,127,127,0.08))',
      overlay: 'var(--dsw-alias-bg-overlay, var(--dsw-alias-bg-layer-2, #1f1f1f))',
      business: 'var(--dsw-alias-state-business-primary, #4c8dff)',
      success: 'var(--dsw-alias-state-success-primary, #3fb950)',
      warn: 'var(--dsw-alias-state-warn-primary, #d29922)',
      danger: 'var(--dsw-alias-state-error-primary, #e5534b)',
      radiusSm: 'var(--dsw-radius-sm, 6px)',
      radiusMd: 'var(--dsw-radius-md, 8px)',
      menuShadow: 'var(--dsw-shadow-lg, 0 8px 24px rgba(0,0,0,0.28))',
    };

    const ST = {
      root: {
        boxSizing: 'border-box',
        minHeight: 0,
        flex: '1 1 auto',
        display: 'flex',
        flexDirection: 'column',
        paddingRight: 'var(--dsh-sidebar-inline-padding, 10px)',
      },
      search: {
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        height: 28,
        flex: 'none',
        padding: '0 8px',
        marginBottom: 6,
        borderRadius: C.radiusMd,
        background: C.layer2,
        color: C.label3,
      },
      input: {
        flex: '1 1 auto',
        minWidth: 0,
        padding: 0,
        border: 'none',
        outline: 'none',
        background: 'transparent',
        fontFamily: 'inherit',
        fontSize: 12,
        color: C.label1,
      },
      scroll: {
        flex: '1 1 auto',
        minHeight: 0,
        overflowY: 'auto',
        overflowX: 'hidden',
        marginLeft: -4,
        paddingLeft: 4,
        paddingBottom: 16,
        scrollbarGutter: 'stable',
      },
      empty: {
        padding: '4px 8px 8px 22px',
        fontSize: 11.5,
        color: C.dimmed,
      },
    };

    /* ------------------------------------------------------------------ *
     * Locale
     * ------------------------------------------------------------------ */
    const DICTS = {
      zh: {
        recent: '最近',
        workspaces: '工作区',
        ungrouped: '未分组',
        search: '搜索会话…',
        clear: '清除',
        empty: '还没有会话',
        loading: '加载中…',
        noMatch: '没有匹配的会话',
        untitled: '未命名会话',
        newSession: '新会话',
        moreRecent: '显示更早的会话 · 还有 {n} 个',
        moreGroup: '还有 {n} 个',
        collapse: '收起',
        collapseOlder: '收起更早的会话',
        newIn: '在此工作区新建会话',
        actions: '会话操作',
        groupActions: '工作区操作',
        pin: '置顶会话',
        unpin: '取消置顶',
        rename: '重命名',
        fork: '分叉会话',
        archive: '归档会话',
        unarchive: '取消归档',
        copyId: '复制 Session ID',
        newSessionIn: '新建会话',
        renameWorkspace: '重命名工作区',
        deleteWorkspace: '删除工作区',
        copyPath: '复制工作区路径',
        renameSessionTitle: '重命名会话',
        renameWorkspaceTitle: '重命名工作区',
        ok: '确定',
        cancel: '取消',
        deleteConfirm: '将把“{name}”从工作区列表中移除。文件夹与会话记录会保留，其会话将显示在“未分组”下。',
        modeOurs: '最近',
        modeOfficial: '官方',
        switchToOfficial: '切换到官方会话列表',
        switchToOurs: '切换回「最近」视图',
        modeAria: '切换会话列表视图',
      },
      en: {
        recent: 'Recent',
        workspaces: 'Workspaces',
        ungrouped: 'Ungrouped',
        search: 'Search sessions…',
        clear: 'Clear',
        empty: 'No sessions yet',
        loading: 'Loading…',
        noMatch: 'No matching session',
        untitled: 'Untitled session',
        newSession: 'New session',
        moreRecent: 'Earlier sessions · {n} more',
        moreGroup: '{n} more',
        collapse: 'Show less',
        collapseOlder: 'Show less',
        newIn: 'New session in this workspace',
        actions: 'Session actions',
        groupActions: 'Workspace actions',
        pin: 'Pin session',
        unpin: 'Unpin session',
        rename: 'Rename',
        fork: 'Fork session',
        archive: 'Archive session',
        unarchive: 'Unarchive session',
        copyId: 'Copy session ID',
        newSessionIn: 'New session',
        renameWorkspace: 'Rename workspace',
        deleteWorkspace: 'Delete workspace',
        copyPath: 'Copy workspace path',
        renameSessionTitle: 'Rename session',
        renameWorkspaceTitle: 'Rename workspace',
        ok: 'OK',
        cancel: 'Cancel',
        deleteConfirm: 'This removes “{name}” from the workspace list. The folder and session logs will be kept. Its sessions will appear under Ungrouped.',
        modeOurs: 'Recent',
        modeOfficial: 'Official',
        switchToOfficial: 'Switch to the official session list',
        switchToOurs: 'Switch back to the Recent view',
        modeAria: 'Switch session list view',
      },
    };

    let T = (key) => (DICTS.zh[key] != null ? DICTS.zh[key] : key);

    function makeTranslate(ctx) {
      let lang = '';
      try { lang = String(ctx.locale.getLocale() || ''); } catch (e) { /* locale optional */ }
      if (!lang) { try { lang = String(navigator.language || ''); } catch (e) { /* headless */ } }
      const lower = lang.toLowerCase();
      const dict = lower.indexOf('zh') === 0 ? DICTS.zh : lower ? DICTS.en : DICTS.zh;
      return function translate(key, vars) {
        let raw = dict[key];
        if (raw == null) raw = DICTS.en[key];
        if (raw == null) raw = String(key);
        if (!vars) return raw;
        return raw.replace(/\{(\w+)\}/g, (match, name) =>
          vars[name] != null ? String(vars[name]) : match,
        );
      };
    }

    /* ------------------------------------------------------------------ *
     * Helpers
     * ------------------------------------------------------------------ */
    function basename(path) {
      const text = String(path == null ? '' : path).replace(/[\\/]+$/, '');
      const cut = Math.max(text.lastIndexOf('/'), text.lastIndexOf('\\'));
      return cut >= 0 ? text.slice(cut + 1) : text;
    }

    function timeOf(row) {
      const value = row && row.updatedAt;
      if (typeof value === 'number') return value;
      const parsed = Date.parse(value == null ? '' : String(value));
      return Number.isNaN(parsed) ? 0 : parsed;
    }

    function toSet(list) {
      const out = new Set();
      if (list && typeof list.forEach === 'function') list.forEach((id) => out.add(id));
      else if (Array.isArray(list)) for (const id of list) out.add(id);
      return out;
    }

    function readStore(key, fallback) {
      try {
        const raw = window.localStorage.getItem(key);
        if (raw == null) return fallback;
        const value = JSON.parse(raw);
        return value == null ? fallback : value;
      } catch (e) {
        return fallback;
      }
    }

    function writeStore(key, value) {
      try { window.localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* private mode */ }
    }

    function useStored(key, fallback) {
      const [value, setValue] = React.useState(() => readStore(key, fallback));
      const set = React.useCallback(
        (next) => { setValue(next); writeStore(key, next); },
        [key],
      );
      return [value, set];
    }

    function titleOf(row) {
      const raw = String((row && (row.displayTitle || row.title)) || '').trim();
      if (raw) return raw;
      return row && row.blank ? T('newSession') : T('untitled');
    }

    function initials(text) {
      const clean = String(text || '').replace(/^[\s#>*`-]+/, '');
      return Array.from(clean).slice(0, 2).join('').toUpperCase() || '?';
    }

    function copyText(text) {
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(String(text)).catch(() => {});
        }
      } catch (e) { /* clipboard unavailable */ }
    }

    /* ------------------------------------------------------------------ *
     * Icons
     * ------------------------------------------------------------------ */
    function svg(size, children, extra) {
      return h(
        'svg',
        Object.assign(
          {
            viewBox: '0 0 16 16',
            width: size,
            height: size,
            fill: 'none',
            stroke: 'currentColor',
            strokeWidth: 1.4,
            strokeLinecap: 'round',
            strokeLinejoin: 'round',
            'aria-hidden': 'true',
            style: { flex: 'none', display: 'block' },
          },
          extra || {},
        ),
        children,
      );
    }

    function Chevron(open, size) {
      return h(
        'span',
        {
          style: {
            display: 'inline-flex',
            flex: 'none',
            transform: open ? 'rotate(90deg)' : 'none',
            transition: 'transform .12s ease',
            color: 'currentColor',
            opacity: 0.9,
          },
        },
        svg(size, h('path', { key: 'p', d: 'M6 3.5 10.5 8 6 12.5' })),
      );
    }

    function ClockIcon(size) {
      return svg(size, [
        h('circle', { key: 'c', cx: 8, cy: 8, r: 5.6 }),
        h('path', { key: 'p', d: 'M8 4.8V8l2.3 1.4' }),
      ]);
    }

    function SearchIcon(size) {
      return svg(size, [
        h('circle', { key: 'c', cx: 7, cy: 7, r: 4.1 }),
        h('path', { key: 'p', d: 'M10.1 10.1 13.4 13.4' }),
      ]);
    }

    function DotsIcon(size) {
      return svg(
        size,
        [
          h('circle', { key: 'a', cx: 3.4, cy: 8, r: 1.15, fill: 'currentColor', stroke: 'none' }),
          h('circle', { key: 'b', cx: 8, cy: 8, r: 1.15, fill: 'currentColor', stroke: 'none' }),
          h('circle', { key: 'c', cx: 12.6, cy: 8, r: 1.15, fill: 'currentColor', stroke: 'none' }),
        ],
        { strokeWidth: 0 },
      );
    }

    function SwapIcon(size) {
      return svg(size, [
        h('path', { key: 'a', d: 'M2.6 6h8.6M8.8 3.4 11.6 6 8.8 8.6' }),
        h('path', { key: 'b', d: 'M13.4 10H4.8M7.2 7.4 4.4 10 7.2 12.6' }),
      ]);
    }

    /**
     * Indeterminate ring for a running session: a dim track plus a bright arc
     * spun by the `dsh-sr-spin` keyframes installed once from apply().
     */
    function RunningRing(props) {
      const size = props.size || 11;
      return h(
        'span',
        {
          className: 'dsh-sr-ring',
          'aria-hidden': 'true',
          style: {
            display: 'inline-flex',
            flex: 'none',
            width: size,
            height: size,
            alignItems: 'center',
            justifyContent: 'center',
            color: props.color || C.business,
          },
        },
        h(
          'svg',
          { viewBox: '0 0 16 16', width: size, height: size, style: { display: 'block' } },
          h('circle', {
            key: 'track',
            cx: 8,
            cy: 8,
            r: 5.8,
            fill: 'none',
            stroke: 'currentColor',
            strokeWidth: 1.9,
            opacity: 0.22,
          }),
          h('circle', {
            key: 'arc',
            cx: 8,
            cy: 8,
            r: 5.8,
            fill: 'none',
            stroke: 'currentColor',
            strokeWidth: 1.9,
            strokeLinecap: 'round',
            strokeDasharray: '10.5 26',
            transform: 'rotate(-90 8 8)',
          }),
        ),
      );
    }

    const RING_CSS = [
      '@keyframes dsh-sr-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }',
      '.dsh-sr-ring > svg { animation: dsh-sr-spin .9s linear infinite; }',
      '@media (prefers-reduced-motion: reduce) { .dsh-sr-ring > svg { animation-duration: 2.4s; } }',
      '.dsh-sr-scroll { scrollbar-width: thin; scrollbar-color: transparent transparent; }',
      '.dsh-sr-scroll.dsh-sr-scrolling { scrollbar-color: rgba(255,255,255,.34) transparent; }',
      '.dsh-sr-scroll::-webkit-scrollbar { width: 9px; height: 9px; }',
      '.dsh-sr-scroll::-webkit-scrollbar-track { background: transparent; }',
      '.dsh-sr-scroll::-webkit-scrollbar-thumb { background: transparent; border: 2px solid transparent; background-clip: content-box; border-radius: 999px; }',
      '.dsh-sr-scroll.dsh-sr-scrolling::-webkit-scrollbar-thumb { background: rgba(255,255,255,.34); border: 2px solid transparent; background-clip: content-box; border-radius: 999px; }',
    ].join('\n');

    /* ------------------------------------------------------------------ *
     * Official-mode switch — floats over the shipped workspace header so the
     * way back sits with the other header icons instead of the footer.
     * ------------------------------------------------------------------ */
    function headerIconAnchor() {
      const labels = ['工作区', 'Workspaces'];
      let label = null;
      let labelWidth = Infinity;
      for (const el of document.querySelectorAll('div,span')) {
        if (labels.indexOf((el.textContent || '').trim()) === -1) continue;
        const rect = el.getBoundingClientRect();
        if (rect.width > 0 && rect.width < labelWidth) {
          label = el;
          labelWidth = rect.width;
        }
      }
      if (!label) return null;
      let row = label;
      for (let depth = 0; depth < 4 && row.parentElement; depth += 1) {
        const rect = row.getBoundingClientRect();
        if (rect.height >= 24 && rect.height <= 48 && rect.width > 140) break;
        row = row.parentElement;
      }
      const icons = [];
      for (const el of row.querySelectorAll('*')) {
        const rect = el.getBoundingClientRect();
        if (rect.width >= 18 && rect.width <= 32 && rect.height >= 18 && rect.height <= 32) {
          icons.push(rect);
        }
      }
      if (icons.length === 0) return null;
      let left = Infinity;
      let first = icons[0];
      for (const rect of icons) {
        if (rect.x < left) left = rect.x;
        if (rect.x <= first.x) first = rect;
      }
      return {
        x: Math.round(left - 26),
        y: Math.round(first.y + (first.height - 22) / 2),
      };
    }

    function OfficialSwitchChip() {
      const mode = useMode();
      const [hover, setHover] = React.useState(false);
      const [pos, setPos] = React.useState(null);

      React.useEffect(() => {
        if (mode !== 'official') {
          setPos(null);
          return undefined;
        }
        const measure = () => {
          const next = headerIconAnchor();
          setPos((prev) => {
            if (!next) return null;
            if (prev && Math.abs(prev.x - next.x) < 1 && Math.abs(prev.y - next.y) < 1) {
              return prev;
            }
            return next;
          });
        };
        const frame = window.requestAnimationFrame(measure);
        const timers = [0, 400, 1200].map((delay) => window.setTimeout(measure, delay));
        const onReflow = () => measure();
        window.addEventListener('resize', onReflow);
        window.addEventListener('scroll', onReflow, true);
        const observer =
          typeof ResizeObserver === 'function' ? new ResizeObserver(onReflow) : null;
        if (observer) observer.observe(document.body);
        return () => {
          window.cancelAnimationFrame(frame);
          for (const timer of timers) window.clearTimeout(timer);
          window.removeEventListener('resize', onReflow);
          window.removeEventListener('scroll', onReflow, true);
          if (observer) observer.disconnect();
        };
      }, [mode]);

      if (mode !== 'official' || !pos) return null;

      return h(
        'button',
        {
          type: 'button',
          title: T('switchToOurs'),
          'aria-label': T('modeAria'),
          onClick: () => {
            if (modeStore.swap) modeStore.swap('ours');
          },
          onMouseEnter: () => setHover(true),
          onMouseLeave: () => setHover(false),
          style: {
            position: 'fixed',
            left: pos.x,
            top: pos.y,
            width: 22,
            height: 22,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 0,
            border: 'none',
            borderRadius: C.radiusSm,
            background: hover ? C.hover : 'transparent',
            color: hover ? C.label1 : C.label3,
            pointerEvents: 'auto',
            zIndex: 40,
            fontFamily: 'inherit',
            cursor: 'pointer',
            transition: 'background-color .1s, color .1s',
          },
        },
        SwapIcon(12),
      );
    }

    /* ------------------------------------------------------------------ *
     * Dropdown menu (fixed-position, so the scroll container cannot clip it)
     * ------------------------------------------------------------------ */
    function Menu(props) {
      const state = props.state;
      if (!state) return null;
      const items = state.items || [];
      const node = h(
        'div',
        {
          role: 'menu',
          'data-dsh-sidebar-recent-popup': '',
          onMouseDown: (event) => event.stopPropagation(),
          style: {
            position: 'fixed',
            left: state.x,
            top: state.y,
            zIndex: 9000,
            minWidth: 176,
            maxWidth: 260,
            padding: 4,
            boxSizing: 'border-box',
            border: '1px solid ' + C.divider,
            borderRadius: C.radiusMd,
            background: C.overlay,
            boxShadow: C.menuShadow,
            backdropFilter: 'blur(8px)',
          },
        },
        items.map((item, index) => {
          if (item.sep) {
            return h('div', {
              key: 'sep:' + index,
              style: { height: 1, margin: '4px 6px', background: C.dividerSoft },
            });
          }
          return h(
            'div',
            {
              key: item.key || 'item:' + index,
              role: 'menuitem',
              onClick: (event) => {
                event.stopPropagation();
                props.onClose();
                try { item.onSelect(); } catch (error) {
                  console.error('[sidebar-recent] menu action failed', error);
                }
              },
              onMouseEnter: (event) => { event.currentTarget.style.background = C.hover; },
              onMouseLeave: (event) => { event.currentTarget.style.background = 'transparent'; },
              style: {
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                height: 27,
                padding: '0 8px',
                borderRadius: C.radiusSm,
                fontSize: 12,
                color: item.danger ? C.danger : C.label1,
                whiteSpace: 'nowrap',
                cursor: 'pointer',
              },
            },
            h(
              'span',
              {
                style: {
                  flex: '1 1 auto',
                  minWidth: 0,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                },
              },
              item.label,
            ),
            item.hint
              ? h('span', { style: { flex: 'none', fontSize: 10.5, color: C.dimmed } }, item.hint)
              : null,
          );
        }),
      );
      return portalize(node);
    }

    /* ------------------------------------------------------------------ *
     * Inline prompt (rename)
     * ------------------------------------------------------------------ */
    function Prompt(props) {
      const state = props.state;
      const inputRef = React.useRef(null);
      React.useEffect(() => {
        if (!state) return undefined;
        const input = inputRef.current;
        if (!input) return undefined;
        input.focus();
        input.select();
        const raf = requestAnimationFrame(() => {
          if (!inputRef.current) return;
          inputRef.current.focus();
          inputRef.current.select();
        });
        return () => cancelAnimationFrame(raf);
      }, [state]);
      if (!state) return null;
      const commit = () => {
        const live = inputRef.current ? inputRef.current.value : '';
        const text = String(live || '').trim();
        if (text) props.onCommit(text);
        props.onClose();
      };
      const node = h(
        'div',
        {
          'data-dsh-sidebar-recent-popup': '',
          onMouseDown: (event) => event.stopPropagation(),
          style: {
            position: 'fixed',
            left: state.x,
            top: state.y,
            zIndex: 9001,
            width: 236,
            boxSizing: 'border-box',
            padding: 10,
            border: '1px solid ' + C.divider,
            borderRadius: C.radiusMd,
            background: C.overlay,
            boxShadow: C.menuShadow,
          },
        },
        h('div', { style: { fontSize: 11.5, color: C.label3, marginBottom: 6 } }, state.title),
        h('input', {
          ref: inputRef,
          defaultValue: state.value || '',
          onFocus: (event) => event.currentTarget.select(),
          onClick: (event) => event.currentTarget.select(),
          onKeyDown: (event) => {
            event.stopPropagation();
            if (event.key === 'Enter') { event.preventDefault(); commit(); }
            else if (event.key === 'Escape') { event.preventDefault(); props.onClose(); }
          },
          style: {
            width: '100%',
            boxSizing: 'border-box',
            height: 28,
            padding: '0 8px',
            border: '1px solid ' + C.divider,
            borderRadius: C.radiusSm,
            background: C.layer1,
            color: C.label1,
            fontFamily: 'inherit',
            fontSize: 12,
            outline: 'none',
          },
        }),
        h(
          'div',
          { style: { display: 'flex', justifyContent: 'flex-end', gap: 6, marginTop: 8 } },
          h('span', {
            role: 'button',
            onClick: props.onClose,
            style: {
              padding: '4px 9px',
              borderRadius: C.radiusSm,
              fontSize: 11.5,
              color: C.label2,
              cursor: 'pointer',
            },
          }, T('cancel')),
          h('span', {
            role: 'button',
            onClick: commit,
            style: {
              padding: '4px 9px',
              borderRadius: C.radiusSm,
              fontSize: 11.5,
              color: '#fff',
              background: C.business,
              cursor: 'pointer',
            },
          }, T('ok')),
        ),
      );
      return portalize(node);
    }

    /* ------------------------------------------------------------------ *
     * Headers, rows, pagers
     * ------------------------------------------------------------------ */
    function SectionHeader(props) {
      const [hover, setHover] = React.useState(false);
      const clickable = typeof props.onToggle === 'function';
      return h(
        'div',
        {
          role: clickable ? 'button' : undefined,
          tabIndex: clickable ? 0 : undefined,
          onClick: clickable ? props.onToggle : undefined,
          onKeyDown: clickable
            ? (event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  props.onToggle();
                }
              }
            : undefined,
          onMouseEnter: () => setHover(true),
          onMouseLeave: () => setHover(false),
          style: {
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            height: 28,
            flex: 'none',
            padding: '0 6px 0 4px',
            margin: '4px 0 2px',
            borderRadius: C.radiusSm,
            overflow: 'hidden',
            cursor: clickable ? 'pointer' : 'default',
            userSelect: 'none',
            color: C.label3,
            background: clickable && hover ? C.hover : 'transparent',
          },
        },
        clickable ? Chevron(props.open !== false, 10) : null,
        h(
          'span',
          {
            style: {
              flex: '1 1 auto',
              minWidth: 0,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              fontSize: 10.5,
              fontWeight: 700,
              letterSpacing: '0.08em',
            },
          },
          props.label,
        ),
        typeof props.count === 'number' && props.count > 0
          ? h(
              'span',
              {
                style: {
                  flex: 'none',
                  minWidth: 18,
                  padding: '0 5px',
                  height: 16,
                  lineHeight: '16px',
                  textAlign: 'center',
                  borderRadius: 8,
                  fontSize: 10,
                  fontWeight: 500,
                  letterSpacing: 0,
                  color: C.label3,
                  background: C.layer2,
                  fontVariantNumeric: 'tabular-nums',
                },
              },
              String(props.count > 99 ? '99+' : props.count),
            )
          : null,
        props.action || null,
      );
    }

    /* The view switch sits in the section header: always within reach, and it
     * no longer competes with the shipped footer actions. */
    function ModeButton() {
      const [hover, setHover] = React.useState(false);
      const mode = useMode();
      if (mode === 'official') return null;
      return h(
        'button',
        {
          type: 'button',
          title: T('switchToOfficial'),
          'aria-label': T('modeAria'),
          onClick: (event) => {
            event.preventDefault();
            event.stopPropagation();
            if (modeStore.swap) modeStore.swap('official');
          },
          onMouseEnter: () => setHover(true),
          onMouseLeave: () => setHover(false),
          style: {
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 18,
            height: 18,
            flex: 'none',
            padding: 0,
            border: 'none',
            borderRadius: C.radiusSm,
            background: hover ? C.hover : 'transparent',
            color: hover ? C.label2 : C.label3,
            fontFamily: 'inherit',
            cursor: 'pointer',
            opacity: hover ? 1 : 0.8,
            transition: 'background-color .1s, color .1s, opacity .1s',
          },
        },
        SwapIcon(12),
      );
    }

    function GroupHeader(props) {
      const [hover, setHover] = React.useState(false);
      const open = props.open !== false;
      const edge = props.dropEdge || null;
      const dragging = props.dragging === true;
      return h(
        'div',
        {
          role: 'button',
          tabIndex: 0,
          title: props.hint || props.label,
          draggable: props.draggable === true ? true : undefined,
          'data-workspace-id': props.workspaceId || undefined,
          onClick: props.onToggle,
          onContextMenu: (event) => {
            event.preventDefault();
            if (props.onMenu) props.onMenu(event);
          },
          onDragStart: (event) => {
            if (props.draggable !== true) return;
            try {
              event.dataTransfer.effectAllowed = 'move';
              event.dataTransfer.setData('text/plain', props.workspaceId || '');
            } catch (error) { /* older engines */ }
            if (props.onDragStart) props.onDragStart(event);
          },
          onDragOver: (event) => {
            if (props.onDragOver) props.onDragOver(event);
          },
          onDrop: (event) => {
            if (!props.onDrop) return;
            event.preventDefault();
            event.stopPropagation();
            props.onDrop(event);
          },
          onDragEnd: (event) => {
            if (props.onDragEnd) props.onDragEnd(event);
          },
          onKeyDown: (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              props.onToggle();
            }
          },
          onMouseEnter: () => setHover(true),
          onMouseLeave: () => setHover(false),
          style: {
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            height: 28,
            flex: 'none',
            padding: '0 6px 0 2px',
            margin: '6px 0 1px',
            borderRadius: C.radiusSm,
            overflow: 'hidden',
            cursor: 'pointer',
            userSelect: 'none',
            color: hover ? C.label1 : C.label2,
            background: hover ? C.hover : 'transparent',
            opacity: dragging ? 0.45 : 1,
            boxShadow:
              edge === 'before'
                ? 'inset 0 2px 0 ' + C.business
                : edge === 'after'
                  ? 'inset 0 -2px 0 ' + C.business
                  : undefined,
          },
        },
        h('span', {
          style: {
            width: 2,
            height: 13,
            flex: 'none',
            borderRadius: 1,
            background: C.business,
            opacity: hover ? 0.95 : 0.55,
          },
        }),
        Chevron(open, 10),
        h(
          'span',
          {
            style: {
              flex: '1 1 auto',
              minWidth: 0,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              fontSize: 12,
              fontWeight: 600,
              letterSpacing: '0.01em',
            },
          },
          props.label,
        ),
        hover && props.onMenu
          ? h(
              'span',
              {
                role: 'button',
                title: T('groupActions'),
                'aria-label': T('groupActions'),
                draggable: false,
                onDragStart: (event) => { event.preventDefault(); event.stopPropagation(); },
                onClick: (event) => {
                  event.stopPropagation();
                  props.onMenu(event);
                },
                style: {
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 20,
                  height: 20,
                  flex: 'none',
                  borderRadius: C.radiusSm,
                  color: C.label2,
                },
              },
              DotsIcon(13),
            )
          : h(
              'span',
              {
                style: {
                  flex: 'none',
                  fontSize: 10,
                  color: C.dimmed,
                  fontVariantNumeric: 'tabular-nums',
                },
              },
              String(props.count == null ? '' : props.count),
            ),
      );
    }

    function Row(props) {
      const [hover, setHover] = React.useState(false);
      const active = props.active === true;
      const edge = props.dropEdge || null;
      const dragging = props.dragging === true;
      return h(
        'div',
        {
          role: 'button',
          tabIndex: 0,
          title: props.title,
          draggable: props.draggable === true ? true : undefined,
          'data-session-id': props.sessionId || undefined,
          'data-recent': props.recent === true ? '1' : undefined,
          onClick: props.onOpen,
          onContextMenu: (event) => {
            event.preventDefault();
            if (props.onMenu) props.onMenu(event);
          },
          onDragStart: (event) => {
            if (props.draggable !== true) return;
            try {
              event.dataTransfer.effectAllowed = 'move';
              event.dataTransfer.setData('text/plain', props.sessionId || '');
            } catch (error) { /* older engines */ }
            if (props.onDragStart) props.onDragStart(event);
          },
          onDragOver: (event) => {
            if (props.onDragOver) props.onDragOver(event);
          },
          onDrop: (event) => {
            if (!props.onDrop) return;
            event.preventDefault();
            event.stopPropagation();
            props.onDrop(event);
          },
          onDragEnd: (event) => {
            if (props.onDragEnd) props.onDragEnd(event);
          },
          onKeyDown: (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              props.onOpen();
            }
          },
          onMouseEnter: () => setHover(true),
          onMouseLeave: () => setHover(false),
          style: {
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            width: '100%',
            height: 28,
            margin: 0,
            padding: '0 6px',
            border: 'none',
            boxSizing: 'border-box',
            borderRadius: C.radiusSm,
            background: active ? C.active : hover ? C.hover : 'transparent',
            color: active || hover ? C.label1 : C.label2,
            fontFamily: 'inherit',
            fontSize: 12.5,
            fontWeight: active ? 500 : 400,
            lineHeight: '20px',
            textAlign: 'left',
            cursor: 'pointer',
            userSelect: 'none',
            transition: 'background-color .1s ease, color .1s ease',
            opacity: dragging ? 0.4 : 1,
            boxShadow:
              edge === 'before'
                ? 'inset 0 2px 0 ' + C.business
                : edge === 'after'
                  ? 'inset 0 -2px 0 ' + C.business
                  : undefined,
          },
        },
        h(
          'span',
          {
            style: {
              width: 11,
              height: 11,
              flex: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
            },
          },
          props.running
            ? h(RunningRing, { color: props.tone || C.business })
            : h('span', {
                style: {
                  width: 5,
                  height: 5,
                  borderRadius: 3,
                  background: props.tone || 'transparent',
                },
              }),
        ),
        h(
          'span',
          {
            style: {
              flex: '1 1 auto',
              minWidth: 0,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            },
          },
          props.title,
        ),
        hover && props.onMenu
          ? h(
              'span',
              {
                role: 'button',
                title: T('actions'),
                'aria-label': T('actions'),
                draggable: false,
                onDragStart: (event) => { event.preventDefault(); event.stopPropagation(); },
                onClick: (event) => {
                  event.stopPropagation();
                  props.onMenu(event);
                },
                style: {
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 20,
                  height: 20,
                  flex: 'none',
                  borderRadius: C.radiusSm,
                  color: C.label2,
                },
              },
              DotsIcon(13),
            )
          : props.caption
            ? h(
                'span',
                {
                  style: {
                    flex: '0 1 auto',
                    minWidth: 0,
                    maxWidth: '46%',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    fontSize: 10.5,
                    color: C.dimmed,
                  },
                },
                props.caption,
              )
            : null,
      );
    }

    function PagerRow(props) {
      const [hover, setHover] = React.useState(false);
      return h(
        'div',
        {
          role: 'button',
          tabIndex: 0,
          onClick: props.onClick,
          onKeyDown: (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              props.onClick();
            }
          },
          onMouseEnter: () => setHover(true),
          onMouseLeave: () => setHover(false),
          style: {
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            height: 24,
            marginTop: 1,
            padding: '0 6px',
            boxSizing: 'border-box',
            borderRadius: C.radiusSm,
            fontSize: 11,
            color: hover ? C.label2 : C.dimmed,
            background: hover ? C.hover : 'transparent',
            cursor: 'pointer',
            userSelect: 'none',
          },
        },
        h('span', { style: { flex: 'none', opacity: 0.8 } }, props.icon || '\u2193'),
        h(
          'span',
          {
            style: {
              flex: '1 1 auto',
              minWidth: 0,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            },
          },
          props.label,
        ),
      );
    }

    /* ------------------------------------------------------------------ *
     * Main slot component
     * ------------------------------------------------------------------ */
    function makeMain(nav) {
      return function SidebarRecent(props) {
        const useSessions = props.useSessions;
        const useWorkspaces = props.useWorkspaces;
        const useSessionStatus = props.useSessionStatus || (() => undefined);

        const list = useSessions ? useSessions((state) => state) : undefined;
        const wsState = useWorkspaces ? useWorkspaces((state) => state) : undefined;
        const statuses = useSessionStatus((state) => state);

        const [query, setQuery] = React.useState('');
        const [recentOpen, setRecentOpen] = useStored(KEY_RECENT_OPEN, true);
        const [closedGroups, setClosedGroups] = useStored(KEY_CLOSED_GROUPS, {});
        const [recentCount, setRecentCount] = React.useState(INITIAL_RECENT);
        const [groupCount, setGroupCount] = React.useState({});
        const [menu, setMenu] = React.useState(null);
        const [prompt, setPrompt] = React.useState(null);
        const [drag, setDrag] = React.useState(null);
        const [dropAt, setDropAt] = React.useState(null);
        const dragRef = React.useRef(null);
        const applyMoveRef = React.useRef(null);
        const endDragRef = React.useRef(null);

        React.useEffect(() => {
          const onDrop = (event) => {
            const current = dragRef.current;
            if (!current) return;
            const node =
              event.target && event.target.closest
                ? event.target.closest('[data-session-id],[data-workspace-id]')
                : null;
            // The "recent" list is derived from activity time; dropping onto it
            // has no stable meaning, so only drop targets inside Workspaces react.
            const inRecent = node && node.closest && node.closest('[data-recent]');
            event.preventDefault();
            event.stopPropagation();
            const target = node && !inRecent
              ? (() => {
                  const rect = node.getBoundingClientRect();
                  return {
                    sessionId: node.getAttribute('data-session-id') || undefined,
                    workspaceId: node.getAttribute('data-workspace-id') || undefined,
                    edge: event.clientY < rect.top + rect.height / 2 ? 'before' : 'after',
                  };
                })()
              : null;
            if (applyMoveRef.current) applyMoveRef.current(current, target);
            if (endDragRef.current) endDragRef.current();
          };
          const onDragEnd = () => {
            if (endDragRef.current) endDragRef.current();
          };
          document.addEventListener('drop', onDrop, true);
          document.addEventListener('dragend', onDragEnd, true);
          return () => {
            document.removeEventListener('drop', onDrop, true);
            document.removeEventListener('dragend', onDragEnd, true);
          };
        }, []);

        React.useEffect(() => {
          if (!menu && !prompt) return undefined;
          const onPointerDown = (event) => {
            const target = event.target;
            // A click inside our own menu/prompt must reach the item, not
            // dismiss the popup before the click event can fire.
            if (target && target.closest && target.closest('[data-dsh-sidebar-recent-popup]')) {
              return;
            }
            setMenu(null);
            setPrompt(null);
          };
          const onKeyDown = (event) => {
            if (event.key === 'Escape') { setMenu(null); setPrompt(null); }
          };
          const onScroll = () => { setMenu(null); };
          window.addEventListener('pointerdown', onPointerDown, true);
          window.addEventListener('keydown', onKeyDown, true);
          window.addEventListener('scroll', onScroll, true);
          return () => {
            window.removeEventListener('pointerdown', onPointerDown, true);
            window.removeEventListener('keydown', onKeyDown, true);
            window.removeEventListener('scroll', onScroll, true);
          };
        }, [menu, prompt]);

        const byId = (list && list.byId) || {};
        const orderedIds = (list && list.ids) || [];
        const workspaces = (wsState && wsState.items) || [];
        const archived = toSet(wsState && wsState.archivedSessionIds);
        const pinned = toSet(wsState && wsState.pinnedSessionIds);

        let mainId;
        for (let i = 0; i < orderedIds.length; i += 1) {
          const row = byId[orderedIds[i]];
          if (row && ((row.retainedBy && row.retainedBy.mainView) || 0) > 0) {
            mainId = orderedIds[i];
            break;
          }
        }

        const visible = [];
        const visibleIds = new Set();
        for (let i = 0; i < orderedIds.length; i += 1) {
          const id = orderedIds[i];
          const row = byId[id];
          if (!row) continue;
          if (row.origin === 'subagent') continue;
          if (archived.has(id)) continue;
          if (row.blank === true && id !== mainId) continue;
          visible.push(row);
          visibleIds.add(id);
        }

        const workspaceOf = new Map();
        for (const workspace of workspaces) {
          const ids = workspace.sessionIds || [];
          for (const id of ids) {
            if (!workspaceOf.has(id)) workspaceOf.set(id, workspace);
          }
        }

        const workspaceLabel = (workspace) =>
          (workspace && (workspace.title || basename(workspace.path))) || '';
        const captionOf = (row) => {
          const workspace = workspaceOf.get(row.id);
          return workspace ? workspaceLabel(workspace) : '';
        };

        const needle = query.trim().toLowerCase();
        const matches = (row) => {
          if (!needle) return true;
          if (titleOf(row).toLowerCase().indexOf(needle) >= 0) return true;
          return captionOf(row).toLowerCase().indexOf(needle) >= 0;
        };

        const recency = (a, b) => timeOf(b) - timeOf(a);
        const pinnedFirst = (a, b) =>
          (pinned.has(a.id) ? 0 : 1) - (pinned.has(b.id) ? 0 : 1) || recency(a, b);

        const statusOf = (id) => {
          if (!statuses) return undefined;
          return typeof statuses.get === 'function' ? statuses.get(id) : statuses[id];
        };

        const toneOf = (id) => {
          const status = statusOf(id);
          if (!status) return undefined;
          if (status.pendingInteraction) return C.warn;
          if (status.running === true) return C.business;
          if (status.completionUnread === true) return C.success;
          return undefined;
        };

        const runningOf = (id) => {
          const status = statusOf(id);
          return status ? status.running === true : false;
        };

        /* ---- overlay anchors ---- */
        // Synthetic events are recycled, so the anchor rect is captured while
        // the event is still live and reused by later menu/prompt callbacks.
        const anchorOf = (event) => {
          const target = event && event.currentTarget;
          if (target && typeof target.getBoundingClientRect === 'function') {
            const rect = target.getBoundingClientRect();
            return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
          }
          return { left: 8, right: 198, top: 8, bottom: 8 };
        };

        const showMenu = (rect, items) => {
          const width = 200;
          const x = Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8));
          const y = Math.min(rect.bottom + 4, window.innerHeight - 8 - items.length * 28);
          setMenu({ x, y: Math.max(8, y), items });
          setPrompt(null);
        };

        const showPrompt = (rect, target) => {
          const x = Math.max(8, Math.min(rect.left, window.innerWidth - 244));
          const y = Math.min(rect.bottom + 4, window.innerHeight - 120);
          setPrompt(Object.assign({ x, y: Math.max(8, y) }, target));
          setMenu(null);
        };

        const openSessionMenu = (event, row) => {
          const rect = anchorOf(event);
          const isPinned = pinned.has(row.id);
          showMenu(rect, [
            {
              key: 'pin',
              label: isPinned ? T('unpin') : T('pin'),
              onSelect: () => (isPinned ? nav.unpin(row.id) : nav.pin(row.id)),
            },
            {
              key: 'rename',
              label: T('rename'),
              onSelect: () =>
                showPrompt(rect, {
                  kind: 'session',
                  id: row.id,
                  value: titleOf(row),
                  title: T('renameSessionTitle'),
                }),
            },
            { key: 'fork', label: T('fork'), onSelect: () => nav.fork(row.id) },
            { key: 'archive', label: T('archive'), onSelect: () => nav.archive(row.id) },
            { sep: true },
            { key: 'copy', label: T('copyId'), onSelect: () => copyText(row.id) },
          ]);
        };

        const openWorkspaceMenu = (event, group) => {
          const rect = anchorOf(event);
          showMenu(rect, [
            { key: 'new', label: T('newSessionIn'), onSelect: () => nav.newIn(group.workspaceId) },
            {
              key: 'rename',
              label: T('rename'),
              onSelect: () =>
                showPrompt(rect, {
                  kind: 'workspace',
                  id: group.workspaceId,
                  value: group.label,
                  title: T('renameWorkspaceTitle'),
                }),
            },
            { sep: true },
            {
              key: 'path',
              label: T('copyPath'),
              onSelect: () => copyText(group.hint || group.label),
            },
            {
              key: 'delete',
              label: T('deleteWorkspace'),
              danger: true,
              onSelect: () => {
                const ok = window.confirm(T('deleteConfirm', { name: group.label }));
                if (ok) nav.deleteWorkspace(group.workspaceId);
              },
            },
          ]);
        };

        const commitPrompt = (text) => {
          if (!prompt) return;
          if (prompt.kind === 'session') nav.rename(prompt.id, text);
          else if (prompt.kind === 'workspace') nav.renameWorkspace(prompt.id, text);
        };

        const recentAll = visible.filter(matches).sort(recency);
        const shownRecent = recentAll.slice(0, Math.min(recentCount, recentAll.length));
        const remainingRecent = recentAll.length - shownRecent.length;
        const recentExpanded = shownRecent.length > INITIAL_RECENT;

        const groups = [];
        const claimed = new Set();
        for (const workspace of workspaces) {
          const rows = [];
          const ids = workspace.sessionIds || [];
          for (const id of ids) {
            claimed.add(id);
            const row = byId[id];
            if (!row || !visibleIds.has(id) || !matches(row)) continue;
            rows.push(row);
          }
          if (rows.length === 0) continue;
          // Keep the Workspace's saved session order; only pins float to the top
          // (Array#sort is stable, so equal ranks stay in `sessionIds` order).
          rows.sort((a, b) => (pinned.has(a.id) ? 0 : 1) - (pinned.has(b.id) ? 0 : 1));
          groups.push({
            key: String(workspace.workspaceId),
            workspaceId: workspace.workspaceId,
            label: workspaceLabel(workspace) || T('untitled'),
            hint: workspace.path || workspaceLabel(workspace),
            rows,
          });
        }
        const ungrouped = visible
          .filter((row) => !claimed.has(row.id) && matches(row))
          .sort(pinnedFirst);
        if (ungrouped.length > 0) {
          groups.push({
            key: '__ungrouped',
            workspaceId: undefined,
            label: T('ungrouped'),
            hint: '',
            rows: ungrouped,
          });
        }

        /* ---- rail (collapsed sidebar) ---- */
        if (props.wide === false) {
          return h(
            'div',
            {
              style: {
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 6,
                paddingTop: 4,
                minHeight: 0,
                overflow: 'hidden',
                flex: '1 1 auto',
              },
            },
            h(
              'button',
              {
                type: 'button',
                title: T('recent'),
                'aria-label': T('recent'),
                onClick: () => {
                  try { props.expandSidebar(); } catch (e) { /* optional */ }
                },
                style: {
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 28,
                  height: 28,
                  flex: 'none',
                  border: 'none',
                  borderRadius: C.radiusSm,
                  background: 'transparent',
                  color: C.label2,
                  cursor: 'pointer',
                },
              },
              ClockIcon(15),
            ),
            recentAll.slice(0, 6).map((row) =>
              h(
                'button',
                {
                  key: row.id,
                  type: 'button',
                  title: titleOf(row),
                  onClick: () => nav.open(row.id),
                  style: {
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 26,
                    height: 22,
                    flex: 'none',
                    padding: 0,
                    border: 'none',
                    borderRadius: C.radiusSm,
                    background: row.id === mainId ? C.active : 'transparent',
                    color: row.id === mainId ? C.label1 : C.label3,
                    fontFamily: 'inherit',
                    fontSize: 10,
                    fontWeight: 600,
                    cursor: 'pointer',
                  },
                },
                initials(titleOf(row)),
              ),
            ),
          );
        }

        const toggleGroup = (key) => {
          const next = Object.assign({}, closedGroups);
          if (next[key]) delete next[key];
          else next[key] = true;
          setClosedGroups(next);
        };

        /* ---- drag & drop (session order inside a workspace, workspace order) ---- */
        const edgeOf = (event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          return event.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
        };
        const endDrag = () => { dragRef.current = null; setDrag(null); setDropAt(null); };
        const markDrop = (key, edge) => {
          setDropAt((current) =>
            current && current.key === key && current.edge === edge
              ? current
              : { key, edge },
          );
        };
        const sessionAnchor = (workspaceId, targetId, edge) => {
          const workspace = workspaces.find((item) => item.workspaceId === workspaceId);
          const ids = (workspace && workspace.sessionIds) || [];
          const index = ids.indexOf(targetId);
          if (index < 0) return undefined;
          return edge === 'after' ? ids[index + 1] : ids[index];
        };
        const startRowDrag = (group, row) => () => {
          if (!group.workspaceId) return;
          dragRef.current = { kind: 'session', id: row.id, workspaceId: group.workspaceId };
          setDrag(dragRef.current);
        };
        const startGroupDrag = (group) => () => {
          if (!group.workspaceId) return;
          dragRef.current = { kind: 'workspace', id: group.workspaceId, workspaceId: group.workspaceId };
          setDrag(dragRef.current);
        };
        const hoverRow = (group, row) => (event) => {
          // `dragRef` flips synchronously on dragstart, while the `drag` state
          // lags a frame; only preventDefault()-ing on the state would leave the
          // very first hovered row non-droppable (browsers then skip `drop`).
          const current = dragRef.current || drag;
          if (!current || current.kind !== 'session') return;
          if (!group.workspaceId || current.workspaceId !== group.workspaceId) return;
          if (current.id === row.id) { setDropAt(null); return; }
          event.preventDefault();
          try { event.dataTransfer.dropEffect = 'move'; } catch (error) { /* optional */ }
          markDrop('row:' + group.key + ':' + row.id, edgeOf(event));
        };
        const applyMove = (current, target) => {
          if (!current || !target) return;
          if (current.kind === 'session') {
            if (!current.workspaceId) return;
            if (target.sessionId) {
              if (target.sessionId === current.id) return;
              const owner = groups.find((item) =>
                item.rows.some((row) => row.id === target.sessionId),
              );
              const workspaceId = owner && owner.workspaceId;
              if (!workspaceId || workspaceId !== current.workspaceId) return;
              const anchor = sessionAnchor(workspaceId, target.sessionId, target.edge);
              if (anchor !== current.id) nav.moveSession(workspaceId, current.id, anchor);
              return;
            }
            if (!target.workspaceId || target.workspaceId !== current.workspaceId) return;
            const workspace = workspaces.find((item) => item.workspaceId === target.workspaceId);
            const ids = (workspace && workspace.sessionIds) || [];
            nav.moveSession(
              target.workspaceId,
              current.id,
              target.edge === 'before' ? ids[0] : undefined,
            );
            return;
          }
          if (current.kind !== 'workspace' || !target.workspaceId) return;
          if (target.workspaceId === current.id) return;
          const ids = groups.map((item) => item.workspaceId).filter(Boolean);
          const index = ids.indexOf(target.workspaceId);
          const anchor = target.edge === 'after' ? ids[index + 1] : ids[index];
          if (anchor === current.id) return;
          nav.moveWorkspace(current.id, anchor);
        };

        const dropRow = (group, row) => (event) => {
          const edge = edgeOf(event);
          const current = dragRef.current || drag;
          endDrag();
          if (!group.workspaceId) return;
          applyMove(current, { sessionId: row.id, edge });
        };
        const hoverGroup = (group) => (event) => {
          const current = dragRef.current || drag;
          if (!current) return;
          if (current.kind === 'workspace') {
            if (!group.workspaceId || current.id === group.workspaceId) return;
          } else if (!group.workspaceId || current.workspaceId !== group.workspaceId) {
            return;
          }
          event.preventDefault();
          try { event.dataTransfer.dropEffect = 'move'; } catch (error) { /* optional */ }
          markDrop('group:' + group.key, edgeOf(event));
        };
        const dropGroup = (group) => (event) => {
          const edge = edgeOf(event);
          const current = dragRef.current || drag;
          endDrag();
          if (!group.workspaceId) return;
          applyMove(current, { workspaceId: group.workspaceId, edge });
        };

        applyMoveRef.current = applyMove;
        endDragRef.current = endDrag;

        const body = [];

        /* ---- 最近 ---- */
        body.push(
          h(SectionHeader, {
            key: 'section-recent',
            label: T('recent'),
            count: recentAll.length,
            open: recentOpen,
            onToggle: () => setRecentOpen(!recentOpen),
            action: h(ModeButton, { key: 'mode-button' }),
          }),
        );

        if (recentOpen) {
          if (shownRecent.length === 0) {
            body.push(
              h(
                'div',
                { key: 'empty-recent', style: ST.empty },
                visible.length === 0
                  ? list && list.phase === 'pending'
                    ? T('loading')
                    : T('empty')
                  : T('noMatch'),
              ),
            );
          }
          for (const row of shownRecent) {
            body.push(
              h(Row, {
                key: 'recent:' + row.id,
                sessionId: row.id,
                recent: true,
                title: titleOf(row),
                caption: captionOf(row),
                active: row.id === mainId,
                pinned: pinned.has(row.id),
                tone: toneOf(row.id),
                running: runningOf(row.id),
                draggable: Boolean(workspaceOf.get(row.id)),
                dragging: Boolean(drag && drag.kind === 'session' && drag.id === row.id),
                onDragStart: startRowDrag(
                  { workspaceId: workspaceOf.get(row.id) && workspaceOf.get(row.id).workspaceId },
                  row,
                ),
                onDragEnd: endDrag,
                onOpen: () => nav.open(row.id),
                onMenu: (event) => openSessionMenu(event, row),
              }),
            );
          }
          if (remainingRecent > 0) {
            body.push(
              h(PagerRow, {
                key: 'recent-more',
                icon: '\u2193',
                label: T('moreRecent', { n: remainingRecent }),
                onClick: () =>
                  setRecentCount((count) =>
                    Math.min(count + RECENT_BATCH, recentAll.length),
                  ),
              }),
            );
          }
          if (recentExpanded) {
            body.push(
              h(PagerRow, {
                key: 'recent-less',
                icon: '\u2191',
                label: T('collapseOlder'),
                onClick: () => setRecentCount(INITIAL_RECENT),
              }),
            );
          }
        }

        /* ---- 工作区 ---- */
        body.push(
          h('div', {
            key: 'divider',
            style: {
              flex: 'none',
              height: 1,
              margin: '8px 2px 2px',
              background: C.divider,
              opacity: 0.7,
            },
          }),
        );
        body.push(
          h(SectionHeader, {
            key: 'section-workspaces',
            label: T('workspaces'),
            count: groups.length,
          }),
        );

        for (const group of groups) {
          const open = !closedGroups[group.key];
          body.push(
            h(GroupHeader, {
              key: 'group:' + group.key,
              label: group.label,
              hint: group.hint,
              count: group.rows.length,
              open,
              workspaceId: group.workspaceId,
              draggable: Boolean(group.workspaceId),
              dragging: Boolean(
                drag && drag.kind === 'workspace' && drag.id === group.workspaceId,
              ),
              dropEdge:
                dropAt && dropAt.key === 'group:' + group.key ? dropAt.edge : null,
              onDragStart: startGroupDrag(group),
              onDragOver: hoverGroup(group),
              onDrop: dropGroup(group),
              onDragEnd: endDrag,
              onToggle: () => toggleGroup(group.key),
              onMenu: group.workspaceId
                ? (event) => openWorkspaceMenu(event, group)
                : undefined,
            }),
          );
          if (!open) continue;
          const limit = Math.min(
            groupCount[group.key] || INITIAL_GROUP,
            group.rows.length,
          );
          const shownRows = group.rows.slice(0, limit);
          const remaining = group.rows.length - shownRows.length;
          body.push(
            h(
              'div',
              {
                key: 'body:' + group.key,
                'data-group-workspace-id': group.workspaceId || undefined,
                style: {
                  marginLeft: 10,
                  paddingLeft: 0,
                  borderLeft: '1px solid ' + C.dividerSoft,
                },
              },
              shownRows.map((row) =>
                h(Row, {
                  key: group.key + ':' + row.id,
                  sessionId: row.id,
                  title: titleOf(row),
                  active: row.id === mainId,
                  pinned: pinned.has(row.id),
                  tone: toneOf(row.id),
                  running: runningOf(row.id),
                  draggable: Boolean(group.workspaceId),
                  dragging: Boolean(
                    drag && drag.kind === 'session' && drag.id === row.id,
                  ),
                  dropEdge:
                    dropAt && dropAt.key === 'row:' + group.key + ':' + row.id
                      ? dropAt.edge
                      : null,
                  onDragStart: startRowDrag(group, row),
                  onDragOver: hoverRow(group, row),
                  onDrop: dropRow(group, row),
                  onDragEnd: endDrag,
                  onOpen: () => nav.open(row.id),
                  onMenu: (event) => openSessionMenu(event, row),
                }),
              ),
              remaining > 0
                ? h(PagerRow, {
                    key: 'more',
                    icon: '\u2193',
                    label: T('moreGroup', { n: remaining }),
                    onClick: () =>
                      setGroupCount((counts) =>
                        Object.assign({}, counts, { [group.key]: limit + GROUP_BATCH }),
                      ),
                  })
                : null,
              limit > INITIAL_GROUP
                ? h(PagerRow, {
                    key: 'less',
                    icon: '\u2191',
                    label: T('collapse'),
                    onClick: () =>
                      setGroupCount((counts) =>
                        Object.assign({}, counts, { [group.key]: INITIAL_GROUP }),
                      ),
                  })
                : null,
            ),
          );
        }

        return h(
          'div',
          { style: ST.root },
          visible.length > 3
            ? h(
                'div',
                { style: ST.search },
                SearchIcon(13),
                h('input', {
                  value: query,
                  placeholder: T('search'),
                  'aria-label': T('search'),
                  onChange: (event) => setQuery(event.target.value),
                  onKeyDown: (event) => {
                    if (event.key === 'Escape') { setQuery(''); return; }
                    if (event.key === 'Enter' && recentAll.length > 0) {
                      nav.open(recentAll[0].id);
                      return;
                    }
                    event.stopPropagation();
                  },
                  style: ST.input,
                }),
                query
                  ? h('span', {
                      role: 'button',
                      title: T('clear'),
                      onClick: () => setQuery(''),
                      style: {
                        flex: 'none',
                        fontSize: 14,
                        lineHeight: '14px',
                        color: C.dimmed,
                        cursor: 'pointer',
                      },
                    }, '\u00d7')
                  : null,
              )
            : null,
          h('div', {
            className: 'dsh-sr-scroll',
            style: ST.scroll,
          }, body),
          h(Menu, { state: menu, onClose: () => setMenu(null) }),
          h(Prompt, {
            state: prompt,
            onCommit: commitPrompt,
            onClose: () => setPrompt(null),
          }),
        );
      };
    }

    return {
      inject: ['slots', 'uiWorkspace', 'workspaces', 'sessions'],
      apply(ctx) {
        T = makeTranslate(ctx);

        // One-time stylesheet for the running ring (no CSS-in-JS runtime here).
        ctx.effect(() => {
          const tag = document.createElement('style');
          tag.dataset.pluginStyle = '@local/dsh-sidebar-recent';
          tag.textContent = RING_CSS;
          document.head.appendChild(tag);
          return () => { tag.remove(); };
        }, 'sidebar-recent styles');

        // Scrollbar fade: show the thumb only while the list is actually scrolling.
        ctx.effect(() => {
          const flash = (el) => {
            el.classList.add('dsh-sr-scrolling');
            if (el.__srScrollTimer) clearTimeout(el.__srScrollTimer);
            el.__srScrollTimer = setTimeout(() => {
              el.classList.remove('dsh-sr-scrolling');
              el.__srScrollTimer = null;
            }, 1000);
          };
          const listOf = (node) => {
            const el = node && node.closest ? node.closest('.dsh-sr-scroll') : null;
            if (el) return el;
            const target = node;
            return target && target.classList && target.classList.contains('dsh-sr-scroll') ? target : null;
          };
          const onScroll = (event) => {
            const el = listOf(event.target);
            if (el) flash(el);
          };
          const onWheel = (event) => {
            const el = listOf(event.target);
            if (el) flash(el);
          };
          document.addEventListener('scroll', onScroll, true);
          document.addEventListener('wheel', onWheel, { capture: true, passive: true });
          return () => {
            document.removeEventListener('scroll', onScroll, true);
            document.removeEventListener('wheel', onWheel, { capture: true, passive: true });
          };
        }, 'sidebar-recent scroll fade');

        const quiet = (label, run) => {
          try {
            const result = run();
            if (result && typeof result.catch === 'function') {
              result.catch((error) =>
                console.error('[sidebar-recent] ' + label + ' failed', error),
              );
            }
          } catch (error) {
            console.error('[sidebar-recent] ' + label + ' failed', error);
          }
        };

        const nav = {
          open(sessionId) {
            if (!sessionId) return;
            quiet('openSession', () => ctx.uiWorkspace.openSession(sessionId));
          },
          newIn(workspaceId) {
            quiet('startSession', () =>
              workspaceId
                ? ctx.uiWorkspace.startSession(workspaceId)
                : ctx.uiWorkspace.startSession(),
            );
          },
          pin(sessionId) { quiet('pinSession', () => ctx.uiWorkspace.pinSession(sessionId)); },
          unpin(sessionId) { quiet('unpinSession', () => ctx.uiWorkspace.unpinSession(sessionId)); },
          archive(sessionId) { quiet('archiveSession', () => ctx.uiWorkspace.archiveSession(sessionId)); },
          unarchive(sessionId) { quiet('unarchiveSession', () => ctx.uiWorkspace.unarchiveSession(sessionId)); },
          fork(sessionId) { quiet('forkSession', () => ctx.uiWorkspace.forkSession(sessionId)); },
          rename(sessionId, title) {
            quiet('renameSession', () =>
              ctx.sessions
                .using(sessionId, { source: 'workspaceOperation' }, (reference) =>
                  reference.binding.session.rename(title),
                )
                .then((result) => {
                  if (result && result.ok === false) {
                    throw new Error((result.error && result.error.message) || 'rename failed');
                  }
                }),
            );
          },
          renameWorkspace(workspaceId, title) {
            quiet('renameWorkspace', () => ctx.workspaces.rename(workspaceId, title));
          },
          moveSession(workspaceId, sessionId, beforeSessionId) {
            if (!workspaceId || !sessionId) return;
            quiet('moveSession', () =>
              ctx.workspaces.insertSessionBefore(
                workspaceId,
                sessionId,
                beforeSessionId || undefined,
              ),
            );
          },
          moveWorkspace(workspaceId, beforeWorkspaceId) {
            if (!workspaceId) return;
            quiet('moveWorkspace', () =>
              ctx.workspaces.insertBefore(workspaceId, beforeWorkspaceId || undefined),
            );
          },
          deleteWorkspace(workspaceId) {
            quiet('deleteWorkspace', () => ctx.workspaces.delete(workspaceId));
          },
        };

        const Main = makeMain(nav);
        let disposeMain = null;

        const mountMain = () => {
          if (disposeMain) return;
          disposeMain = ctx.slots.register(
            { name: 'sidebar.workspaces', priority: -1 },
            Main,
          );
        };

        const unmountMain = () => {
          if (!disposeMain) return;
          const dispose = disposeMain;
          disposeMain = null;
          try { dispose(); } catch (error) {
            console.error('[sidebar-recent] unmount failed', error);
          }
        };

        const notify = () => {
          for (const listener of Array.from(modeStore.listeners)) {
            try { listener(); } catch (error) { console.error(error); }
          }
        };

        modeStore.value = readStore(KEY_MODE, 'ours') === 'official' ? 'official' : 'ours';
        modeStore.swap = (next) => {
          const target = next === 'official' ? 'official' : 'ours';
          if (target === modeStore.value) return;
          if (target === 'official') unmountMain();
          else mountMain();
          modeStore.value = target;
          writeStore(KEY_MODE, target);
          notify();
        };

        // Our browser only mounts while this plugin owns the slot.
        ctx.slots.inject('sidebar.workspaces', () => {
          if (modeStore.value !== 'official') mountMain();
          return () => { unmountMain(); };
        });

        // The way back out of the official list floats over its own header row,
        // outside `sidebar.workspaces`, so it survives the swap.
        ctx.slots.inject('shell.overlay', () =>
          ctx.slots.register(
            { name: 'shell.overlay', id: 'sidebar-recent-switch' },
            OfficialSwitchChip,
          ),
        );
      },
    };
  },
});
