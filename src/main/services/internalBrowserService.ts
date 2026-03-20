/**
 * 内部浏览器服务：使用 Electron BrowserWindow 实现
 * 与 OpenClaw browser 的 navigate/snapshot/screenshot/act 参数约定一致，供 REST /browser/* 使用
 * 是否显示窗口由配置 showBrowserWindow 控制（设置页可开关）
 */
import { app, BrowserWindow } from 'electron'
import * as path from 'path'
import * as fs from 'fs'
import log from '../logger'
import { configManager } from '../configManager'

const TARGET_ID_INTERNAL = 'internal'

/** 当窗口曾被关闭并重建、当前为空白页时，在响应中附带此提示，引导 AI 先 navigate 再操作 */
export const BROWSER_CONTEXT_RECREATED_MESSAGE =
  '浏览器窗口曾被关闭已重新创建，当前为空白页。请先通过 browser_navigate 或「打开网页」加载目标网址后再继续操作。'

let browserWindow: BrowserWindow | null = null

function shouldShowBrowserWindow(): boolean {
  return configManager.getShowBrowserWindow()
}

function isBlankPage(url: string): boolean {
  const u = (url || '').trim().toLowerCase()
  return !u || u === 'about:blank' || u.startsWith('about:blank')
}

function blankPageHint(webContents: Electron.WebContents): { browserContextRecreated?: boolean; message?: string } {
  if (!webContents || webContents.isDestroyed()) return {}
  if (!isBlankPage(webContents.getURL())) return {}
  return { browserContextRecreated: true, message: BROWSER_CONTEXT_RECREATED_MESSAGE }
}

function getOrCreateWindow(): BrowserWindow {
  if (browserWindow && !browserWindow.isDestroyed()) {
    return browserWindow
  }
  const show = shouldShowBrowserWindow()
  browserWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    show,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true
    }
  })
  browserWindow.on('closed', () => {
    browserWindow = null
  })
  // 将「新标签/新窗口」打开重定向到当前窗口，避免 AI 只操作旧页面而看不到新内容（与 OpenClaw 多 tab 不同，这里采用单窗口同页替换）
  browserWindow.webContents.setWindowOpenHandler(details => {
    const url = details.url || ''
    if (url && browserWindow && !browserWindow.isDestroyed()) {
      browserWindow.loadURL(url, { userAgent: undefined }).catch(() => {})
    }
    return { action: 'deny' }
  })
  return browserWindow
}

export interface NavigateResult {
  ok: boolean
  targetId: string
}

export async function internalBrowserNavigate(url: string, _targetId?: string): Promise<NavigateResult> {
  const win = getOrCreateWindow()
  if (shouldShowBrowserWindow() && !win.isVisible()) {
    win.show()
  }
  await win.loadURL(url, { userAgent: undefined })
  return { ok: true, targetId: TARGET_ID_INTERNAL }
}

/** 简单快照：返回页面文本与简化结构，与 OpenClaw snapshot 响应结构兼容 */
export async function internalBrowserSnapshot(options?: {
  targetId?: string
  format?: 'aria' | 'ai'
  maxChars?: number
}): Promise<{ snapshot?: string; refs?: Record<string, unknown>; full?: string }> {
  const win = getOrCreateWindow()
  if (shouldShowBrowserWindow() && !win.isVisible()) {
    win.show()
  }
  const wc = win.webContents
  const maxChars = options?.maxChars ?? 50000

  const result = await wc.executeJavaScript(`
    (function() {
      function getRoleAndName(el) {
        var role = (el.getAttribute && el.getAttribute('role')) || (el.tagName && el.tagName.toLowerCase());
        var name = (el.getAttribute && (el.getAttribute('aria-label') || el.getAttribute('title'))) || (el.innerText && el.innerText.trim().slice(0, 80));
        return { role: role || 'unknown', name: name || '' };
      }
      function walk(root, depth, refs, prefix) {
        if (depth > 10) return '';
        var out = [];
        var children = root.children || [];
        for (var i = 0; i < children.length; i++) {
          var el = children[i];
          var rn = getRoleAndName(el);
          var ref = prefix + (i + 1);
          refs[ref] = { role: rn.role, name: rn.name };
          try { el.setAttribute('data-aria-ref', ref); } catch (e) {}
          var line = ref + ' ' + rn.role + (rn.name ? ' "' + rn.name.replace(/"/g, '') + '"' : '');
          out.push(line);
          var sub = walk(el, depth + 1, refs, ref + '.');
          if (sub) out.push(sub);
        }
        return out.join('\\n');
      }
      var refs = {};
      var body = document.body;
      if (!body) return { snapshot: '', refs: refs };
      var text = walk(body, 0, refs, 'e');
      var fullText = (body.innerText || body.textContent || '').trim();
      return {
        snapshot: text.slice(0, ${maxChars}),
        full: fullText.slice(0, ${maxChars}),
        refs: refs
      };
    })();
  `).catch(err => {
    log.warn('[InternalBrowser] snapshot executeJavaScript failed:', err)
    return { snapshot: '', refs: {}, full: '' }
  })

  const format = options?.format ?? 'ai'
  const snapshot = format === 'ai' ? (result.full || result.snapshot || '') : (result.snapshot || '')
  return {
    snapshot: snapshot.slice(0, maxChars),
    refs: result.refs || {},
    full: result.full ? result.full.slice(0, maxChars) : undefined,
    ...blankPageHint(wc)
  }
}

export interface ScreenshotResult {
  ok: boolean
  path?: string
  targetId: string
  imageBase64?: string
  mimeType?: string
  browserContextRecreated?: boolean
  message?: string
}

export async function internalBrowserScreenshot(options?: {
  targetId?: string
  fullPage?: boolean
  ref?: string
  element?: string
  type?: 'png' | 'jpeg'
}): Promise<ScreenshotResult> {
  const win = getOrCreateWindow()
  if (shouldShowBrowserWindow() && !win.isVisible()) {
    win.show()
  }
  const wc = win.webContents
  const imageType = options?.type === 'jpeg' ? 'jpeg' : 'png'

  let nativeImage: Electron.NativeImage
  if (options?.ref || options?.element) {
    const selector = options.element || (options.ref ? `[data-aria-ref="${options.ref}"]` : null)
    if (!selector) {
      nativeImage = await wc.capturePage()
    } else {
      const rect = await wc.executeJavaScript(`
        (function() {
          var el = document.querySelector('${selector.replace(/'/g, "\\'")}');
          if (!el) return null;
          var r = el.getBoundingClientRect();
          return { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) };
        })();
      `).catch(() => null)
      if (rect && rect.width > 0 && rect.height > 0) {
        nativeImage = await wc.capturePage({ x: rect.x, y: rect.y, width: rect.width, height: rect.height })
      } else {
        nativeImage = await wc.capturePage()
      }
    }
  } else {
    nativeImage = await wc.capturePage()
  }

  const image = imageType === 'jpeg' ? nativeImage.toJPEG(85) : nativeImage.toPNG()
  const ext = imageType === 'jpeg' ? '.jpg' : '.png'
  const mimeType = imageType === 'jpeg' ? 'image/jpeg' : 'image/png'
  const dir = path.join(app.getPath('temp'), 'electron-screenshot-browser')
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  const filePath = path.join(dir, `browser-${Date.now()}${ext}`)
  fs.writeFileSync(filePath, image)

  return {
    ok: true,
    targetId: TARGET_ID_INTERNAL,
    path: filePath,
    imageBase64: image.toString('base64'),
    mimeType,
    ...blankPageHint(wc)
  }
}

/** 常用按键的 keyCode，供仍依赖 keyCode 的页面识别 */
function getKeyCode(key: string): number {
  const k = String(key).toLowerCase()
  const map: Record<string, number> = {
    enter: 13,
    tab: 9,
    escape: 27,
    backspace: 8,
    space: 32,
    arrowleft: 37,
    arrowup: 38,
    arrowright: 39,
    arrowdown: 40,
    pageup: 33,
    pagedown: 34,
    end: 35,
    home: 36
  }
  return map[k] ?? -1
}

export interface ActResult {
  ok: boolean
  targetId: string
  /** 当为 true 时表示窗口曾被关闭已重建，当前为空白页，应引导先 navigate */
  browserContextRecreated?: boolean
  message?: string
}

export async function internalBrowserAct(params: {
  kind: string
  targetId?: string
  ref?: string
  text?: string
  key?: string
  value?: string
  button?: string
  doubleClick?: boolean
  modifiers?: string[]
  submit?: boolean
  slowly?: boolean
  timeoutMs?: number
  delayMs?: number
}): Promise<ActResult> {
  const win = getOrCreateWindow()
  if (shouldShowBrowserWindow() && !win.isVisible()) {
    win.show()
  }
  const wc = win.webContents
  const kind = String(params.kind || '').toLowerCase()

  if (kind === 'click' && params.ref) {
    await wc.executeJavaScript(`
      (function() {
        var el = document.querySelector('[data-aria-ref="${(params.ref || '').replace(/"/g, '\\"')}"]') || document.elementFromPoint(window.innerWidth/2, window.innerHeight/2);
        if (!el) return;
        var clickable = el;
        if (el.tagName && el.tagName.toLowerCase() !== 'a') {
          var inner = el.querySelector && el.querySelector('a[href]');
          if (inner) clickable = inner;
        }
        clickable.focus();
        clickable.click();
      })();
    `).catch(() => {})
    return { ok: true, targetId: TARGET_ID_INTERNAL, ...blankPageHint(wc) }
  }

  if (kind === 'type' && params.ref != null && params.text != null) {
    await wc.executeJavaScript(`
      (function() {
        var el = document.querySelector('[data-aria-ref="${(params.ref || '').replace(/"/g, '\\"')}"]');
        if (el) {
          el.focus();
          el.value = ${JSON.stringify(params.text)};
          el.dispatchEvent(new Event('input', { bubbles: true }));
        }
      })();
    `).catch(() => {})
    if (params.submit) {
      await wc.executeJavaScript(`
        (function() {
          var el = document.activeElement;
          if (el && el.form) el.form.submit();
        })();
      `).catch(() => {})
    }
    return { ok: true, targetId: TARGET_ID_INTERNAL, ...blankPageHint(wc) }
  }

  if (kind === 'fill' && params.ref != null && params.value != null) {
    await wc.executeJavaScript(`
      (function() {
        var el = document.querySelector('[data-aria-ref="${(params.ref || '').replace(/"/g, '\\"')}"]');
        if (el) {
          el.focus();
          el.value = ${JSON.stringify(params.value)};
          el.dispatchEvent(new Event('input', { bubbles: true }));
        }
      })();
    `).catch(() => {})
    return { ok: true, targetId: TARGET_ID_INTERNAL, ...blankPageHint(wc) }
  }

  if (kind === 'press' && params.key) {
    const key = params.key
    const keyCode = getKeyCode(key)
    const ref = params.ref != null ? String(params.ref).replace(/\\/g, '\\\\').replace(/"/g, '\\"') : ''
    const elExpr = ref
      ? `document.querySelector('[data-aria-ref="${ref}"]') || document.body`
      : 'document.activeElement || document.body'
    const keyLower = key.toLowerCase()
    await wc.executeJavaScript(`
      (function() {
        var el = ${elExpr};
        if (el && el.focus) el.focus();
        var opts = { key: ${JSON.stringify(key)}, code: ${JSON.stringify(key)}, bubbles: true };
        if (${keyCode} >= 0) { opts.keyCode = ${keyCode}; opts.which = ${keyCode}; }
        var ev = function(type) { return new KeyboardEvent(type, opts); };
        el.dispatchEvent(ev('keydown'));
        el.dispatchEvent(ev('keypress'));
        el.dispatchEvent(ev('keyup'));
        var k = ${JSON.stringify(keyLower)};
        if (k === 'pagedown') window.scrollBy(0, window.innerHeight || 400);
        else if (k === 'pageup') window.scrollBy(0, -(window.innerHeight || 400));
        else if (k === 'home') window.scrollTo(0, 0);
        else if (k === 'end') window.scrollTo(0, document.documentElement.scrollHeight || 1e9);
        else if (k === 'arrowdown') window.scrollBy(0, 80);
        else if (k === 'arrowup') window.scrollBy(0, -80);
      })();
    `).catch(() => {})
    return { ok: true, targetId: TARGET_ID_INTERNAL, ...blankPageHint(wc) }
  }

  if (kind === 'hover' && params.ref) {
    await wc.executeJavaScript(`
      (function() {
        var el = document.querySelector('[data-aria-ref="${(params.ref || '').replace(/"/g, '\\"')}"]');
        if (el) {
          var r = el.getBoundingClientRect();
          var x = r.left + r.width/2;
          var y = r.top + r.height/2;
          var ev = new MouseEvent('mouseover', { bubbles: true, clientX: x, clientY: y });
          el.dispatchEvent(ev);
        }
      })();
    `).catch(() => {})
    return { ok: true, targetId: TARGET_ID_INTERNAL, ...blankPageHint(wc) }
  }

  if (kind === 'scroll') {
    const dir = (params.value || 'down').toLowerCase()
    const sign = dir === 'up' ? -1 : 1
    await wc.executeJavaScript(`
      (function() {
        var step = ${sign} * (window.innerHeight || 400);
        function isScrollable(el) {
          if (!el || el === document.body || el === document.documentElement) return false;
          var style = window.getComputedStyle(el);
          var ox = style.overflowX, oy = style.overflowY;
          var canScroll = (el.scrollHeight > el.clientHeight) && (oy === 'auto' || oy === 'scroll' || oy === 'overlay');
          return !!canScroll;
        }
        function findScrollable(from) {
          var el = from;
          while (el) {
            if (isScrollable(el)) return el;
            el = el.parentElement;
          }
          return null;
        }
        var center = document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2);
        var container = center ? findScrollable(center) : null;
        if (container) {
          container.scrollTop = container.scrollTop + step;
        } else {
          window.scrollBy(0, step);
        }
      })();
    `).catch(() => {})
    return { ok: true, targetId: TARGET_ID_INTERNAL, ...blankPageHint(wc) }
  }

  log.warn('[InternalBrowser] act kind not implemented:', kind)
  return { ok: true, targetId: TARGET_ID_INTERNAL, ...blankPageHint(wc) }
}

export function getInternalBrowserTargetId(): string {
  return TARGET_ID_INTERNAL
}
