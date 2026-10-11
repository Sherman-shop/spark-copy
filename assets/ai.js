/* ==========================================================================
   AI Marketing Toolkit — 共享内核
   · UI 工具（toast / 复制 / 下载 / 弹窗）
   · AI 引擎：默认走内置「离线策略引擎」，可一键接入 DeepSeek / OpenAI 等
     任意 OpenAI 兼容接口，获得真实大模型输出。
   · 经典 <script> 加载，file:// 双击打开即可运行，无需服务器、无依赖。
   ========================================================================== */
(function (global) {
  "use strict";

  /* ---------------------------------------------------------------- 基础工具 */
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  const esc = (s) =>
    String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));

  /** 数字格式化：1234567 -> 1,234,567 */
  const fmt = (n, digits) => {
    if (n == null || !isFinite(n)) return "—";
    const d = digits == null ? (Math.abs(n) >= 100 ? 0 : Math.abs(n) >= 10 ? 1 : 2) : digits;
    return Number(n).toLocaleString("zh-CN", {
      minimumFractionDigits: d, maximumFractionDigits: d,
    });
  };
  /** 紧凑数字：12345 -> 1.2万 */
  const compact = (n) => {
    if (n == null || !isFinite(n)) return "—";
    const a = Math.abs(n);
    if (a >= 1e8) return (n / 1e8).toFixed(2) + "亿";
    if (a >= 1e4) return (n / 1e4).toFixed(a >= 1e6 ? 0 : 1) + "万";
    return fmt(n, 0);
  };
  const pct = (n, digits) => (n == null || !isFinite(n) ? "—" : fmt(n * 100, digits == null ? 2 : digits) + "%");
  const money = (n) => "¥" + compact(n);
  const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
  const pick = (arr, seed) =>
    arr[Math.floor((seed == null ? Math.random() : hashFloat(seed)) * arr.length) % arr.length];
  const shuffle = (arr) => {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  /** 稳定哈希 -> [0,1)，让"AI 评分"等输出可复现 */
  function hashFloat(str) {
    let h = 2166136261;
    const s = String(str);
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return ((h >>> 0) % 100000) / 100000;
  }
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  /** 本地时区的 YYYY-MM-DD（不能用 toISOString，东八区会差一天） */
  const isoLocal = (d) => {
    const x = d instanceof Date ? d : new Date(d);
    const p = (n) => String(n).padStart(2, "0");
    return `${x.getFullYear()}-${p(x.getMonth() + 1)}-${p(x.getDate())}`;
  };
  const todayISO = () => isoLocal(new Date());

  /* ---------------------------------------------------------------- Toast */
  function toast(msg, kind) {
    let host = $("#toast-host");
    if (!host) {
      host = document.createElement("div");
      host.id = "toast-host";
      document.body.appendChild(host);
    }
    const el = document.createElement("div");
    el.className = "toast " + (kind || "");
    el.innerHTML =
      '<span>' + (kind === "ok" ? "✅" : kind === "bad" ? "⚠️" : "💡") + "</span><span>" + esc(msg) + "</span>";
    host.appendChild(el);
    setTimeout(() => {
      el.style.transition = "opacity .3s, transform .3s";
      el.style.opacity = "0";
      el.style.transform = "translateY(10px)";
      setTimeout(() => el.remove(), 320);
    }, 2300);
  }

  /* ---------------------------------------------------------------- 复制/下载 */
  async function copy(text, label) {
    try {
      await navigator.clipboard.writeText(text);
      toast((label || "内容") + "已复制到剪贴板", "ok");
      return true;
    } catch (e) {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.cssText = "position:fixed;opacity:0;top:0";
      document.body.appendChild(ta);
      ta.select();
      let ok = false;
      try { ok = document.execCommand("copy"); } catch (_) {}
      ta.remove();
      toast(ok ? (label || "内容") + "已复制" : "复制失败，请手动选中", ok ? "ok" : "bad");
      return ok;
    }
  }

  function download(filename, content, mime) {
    const blob = new Blob(["\ufeff" + content], { type: (mime || "text/plain") + ";charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    toast("已导出 " + filename, "ok");
  }

  /* ---------------------------------------------------------------- CSV */
  /** 容错 CSV 解析，支持引号、逗号、换行、制表符与中文表头 */
  function parseCSV(text) {
    const t = String(text || "").trim();
    if (!t) return [];
    // 自动识别分隔符
    const head = t.split(/\r?\n/)[0];
    const counts = { ",": (head.match(/,/g) || []).length, "\t": (head.match(/\t/g) || []).length, ";": (head.match(/;/g) || []).length };
    const delim = Object.keys(counts).reduce((a, b) => (counts[a] >= counts[b] ? a : b));

    const rows = [];
    let row = [], cur = "", q = false;
    for (let i = 0; i < t.length; i++) {
      const c = t[i];
      if (q) {
        if (c === '"') { if (t[i + 1] === '"') { cur += '"'; i++; } else q = false; }
        else cur += c;
      } else if (c === '"') q = true;
      else if (c === delim) { row.push(cur.trim()); cur = ""; }
      else if (c === "\n") { row.push(cur.trim()); rows.push(row); row = []; cur = ""; }
      else if (c === "\r") { /* skip */ }
      else cur += c;
    }
    row.push(cur.trim());
    rows.push(row);
    return rows.filter((r) => r.some((v) => v !== ""));
  }

  function toCSV(rows) {
    return rows
      .map((r) =>
        r
          .map((v) => {
            const s = String(v == null ? "" : v);
            return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
          })
          .join(",")
      )
      .join("\n");
  }

  /** 在表头里按候选关键词找列号 */
  function findCol(headers, candidates) {
    const norm = headers.map((h) => String(h).toLowerCase().replace(/[\s_\-()（）]/g, ""));
    for (const cand of candidates) {
      const c = cand.toLowerCase();
      const i = norm.findIndex((h) => h === c);
      if (i >= 0) return i;
    }
    for (const cand of candidates) {
      const c = cand.toLowerCase();
      const i = norm.findIndex((h) => h.includes(c));
      if (i >= 0) return i;
    }
    return -1;
  }

  const num = (v) => {
    if (typeof v === "number") return v;
    const n = parseFloat(String(v == null ? "" : v).replace(/[,¥$%\s]/g, ""));
    return isFinite(n) ? n : 0;
  };

  /* ---------------------------------------------------------------- 弹窗 */
  function modal(html, opts) {
    opts = opts || {};
    const bd = document.createElement("div");
    bd.className = "modal-backdrop";
    bd.innerHTML = '<div class="modal">' + html + "</div>";
    const close = () => bd.remove();
    bd.addEventListener("click", (e) => { if (e.target === bd && opts.dismissible !== false) close(); });
    document.addEventListener("keydown", function onKey(e) {
      if (e.key === "Escape") { close(); document.removeEventListener("keydown", onKey); }
    });
    document.body.appendChild(bd);
    $$("[data-close]", bd).forEach((b) => b.addEventListener("click", close));
    if (opts.onMount) opts.onMount(bd, close);
    return { el: bd, close };
  }

  /* ================================================================== AI 引擎 */
  const LS_KEY = "spark-copy.llm.config.v1";

  const PRESETS = {
    deepseek: { label: "DeepSeek", baseURL: "https://api.deepseek.com/v1", model: "deepseek-chat" },
    openai:   { label: "OpenAI",   baseURL: "https://api.openai.com/v1",   model: "gpt-4o-mini" },
    moonshot: { label: "Kimi / Moonshot", baseURL: "https://api.moonshot.cn/v1", model: "moonshot-v1-8k" },
    qwen:     { label: "通义千问 DashScope", baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1", model: "qwen-plus" },
    custom:   { label: "自定义（OpenAI 兼容）", baseURL: "", model: "" },
  };

  const AI = {
    get config() {
      try { return JSON.parse(localStorage.getItem(LS_KEY) || "{}"); }
      catch (e) { return {}; }
    },
    set config(v) { localStorage.setItem(LS_KEY, JSON.stringify(v || {})); },

    /** 是否已接入真实大模型 */
    get ready() {
      const c = this.config;
      return !!(c.apiKey && c.baseURL && c.model);
    },

    /**
     * 调用 OpenAI 兼容的 chat/completions。
     * @returns {Promise<string>} 模型纯文本输出
     */
    async chat(messages, opts) {
      opts = opts || {};
      const c = this.config;
      if (!this.ready) throw new Error("NOT_CONFIGURED");
      const url = c.baseURL.replace(/\/+$/, "") + "/chat/completions";
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), opts.timeout || 60000);
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: "Bearer " + c.apiKey },
          signal: ctrl.signal,
          body: JSON.stringify({
            model: c.model,
            messages,
            temperature: opts.temperature == null ? 0.85 : opts.temperature,
            max_tokens: opts.maxTokens || 2000,
            stream: false,
          }),
        });
        if (!res.ok) {
          const t = await res.text().catch(() => "");
          throw new Error("HTTP " + res.status + " " + t.slice(0, 180));
        }
        const data = await res.json();
        return (data.choices && data.choices[0] && data.choices[0].message.content) || "";
      } finally { clearTimeout(timer); }
    },

    /** 要求模型返回 JSON，自动剥离 ```json 代码块 */
    async json(messages, opts) {
      const raw = await this.chat(messages, opts);
      const m = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
      const body = (m ? m[1] : raw).trim();
      const s = body.indexOf("{"), sa = body.indexOf("[");
      const start = sa >= 0 && (sa < s || s < 0) ? sa : s;
      const end = Math.max(body.lastIndexOf("}"), body.lastIndexOf("]"));
      return JSON.parse(start >= 0 ? body.slice(start, end + 1) : body);
    },

    /** 打开设置面板 */
    openSettings(onSaved) {
      const c = this.config;
      const provider = c.provider || "deepseek";
      const opts = Object.keys(PRESETS)
        .map((k) => `<option value="${k}" ${k === provider ? "selected" : ""}>${PRESETS[k].label}</option>`)
        .join("");

      modal(
        `<div class="row" style="margin-bottom:6px">
           <h3 style="flex:1">⚙️ 接入真实大模型（可选）</h3>
           <button class="icon-btn" data-close>✕</button>
         </div>
         <p class="small muted" style="margin-bottom:18px">
           不填也能用：所有工具内置<b style="color:var(--text)">离线策略引擎</b>，打开即出结果。
           填入 API Key 后，文案与诊断建议将改由真实大模型实时生成。
           <br><span class="tiny faint">🔒 Key 仅保存在你自己浏览器的 localStorage，不会上传到任何服务器（本项目没有后端）。</span>
         </p>

         <label class="field">
           <span class="field-label">服务商</span>
           <select id="ai-provider">${opts}</select>
         </label>
         <label class="field">
           <span class="field-label">API Base URL</span>
           <input type="text" id="ai-base" placeholder="https://api.deepseek.com/v1" value="${esc(c.baseURL || PRESETS[provider].baseURL)}">
         </label>
         <label class="field">
           <span class="field-label">模型名</span>
           <input type="text" id="ai-model" placeholder="deepseek-chat" value="${esc(c.model || PRESETS[provider].model)}">
         </label>
         <label class="field">
           <span class="field-label">API Key</span>
           <input type="password" id="ai-key" placeholder="sk-..." value="${esc(c.apiKey || "")}" autocomplete="off">
           <span class="field-hint">浏览器直连，若服务商未开放 CORS 会连接失败，此时工具自动回退离线引擎。</span>
         </label>

         <div class="row gap-8" style="margin-top:20px">
           <button class="btn btn-ghost btn-sm" id="ai-clear">清除</button>
           <span class="spacer"></span>
           <button class="btn btn-sm" id="ai-test">测试连接</button>
           <button class="btn btn-primary btn-sm" id="ai-save">保存</button>
         </div>
         <div id="ai-test-out" class="small" style="margin-top:12px"></div>`,
        {
          onMount: (bd, close) => {
            const sel = $("#ai-provider", bd);
            sel.addEventListener("change", () => {
              const p = PRESETS[sel.value];
              if (p.baseURL) $("#ai-base", bd).value = p.baseURL;
              if (p.model) $("#ai-model", bd).value = p.model;
            });
            const read = () => ({
              provider: sel.value,
              baseURL: $("#ai-base", bd).value.trim(),
              model: $("#ai-model", bd).value.trim(),
              apiKey: $("#ai-key", bd).value.trim(),
            });
            $("#ai-save", bd).addEventListener("click", () => {
              AI.config = read();
              toast(AI.ready ? "已接入真实大模型 🚀" : "已保存（当前使用离线引擎）", "ok");
              AI.renderBadge();
              if (onSaved) onSaved();
              close();
            });
            $("#ai-clear", bd).addEventListener("click", () => {
              localStorage.removeItem(LS_KEY);
              toast("已清除，回到离线引擎");
              AI.renderBadge();
              if (onSaved) onSaved();
              close();
            });
            $("#ai-test", bd).addEventListener("click", async () => {
              const out = $("#ai-test-out", bd);
              const prev = AI.config;
              AI.config = read();
              out.innerHTML = '<span class="row gap-8"><span class="spinner"></span>连接中…</span>';
              try {
                const r = await AI.chat([{ role: "user", content: "只回复两个字：成功" }], { maxTokens: 12, temperature: 0 });
                out.innerHTML = '<span class="tag tag-ok">连接成功</span> <span class="faint tiny">模型回复：' + esc(r.slice(0, 40)) + "</span>";
              } catch (e) {
                AI.config = prev;
                out.innerHTML = '<span class="tag tag-bad">连接失败</span> <span class="faint tiny">' + esc(String(e.message).slice(0, 150)) + "</span>";
              }
            });
          },
        }
      );
    },

    /** 顶栏状态徽标 */
    renderBadge() {
      $$("[data-ai-badge]").forEach((el) => {
        const on = AI.ready;
        el.innerHTML = on
          ? '<span class="tag tag-ok">● 大模型已接入</span>'
          : '<span class="tag">○ 离线引擎</span>';
      });
    },

    /**
     * 统一入口：优先真实模型，失败自动回退本地引擎。
     * @param {object} o {messages, fallback, json, onMode}
     */
    async run(o) {
      if (this.ready) {
        try {
          const r = o.json ? await this.json(o.messages, o) : await this.chat(o.messages, o);
          if (o.onMode) o.onMode("llm");
          return r;
        } catch (e) {
          if (String(e.message) !== "NOT_CONFIGURED") {
            toast("大模型调用失败，已切换离线引擎", "bad");
            console.warn("[AI] fallback:", e);
          }
        }
      }
      if (o.onMode) o.onMode("local");
      await sleep(o.thinkMs == null ? 420 : o.thinkMs); // 模拟推理节奏，避免结果闪现
      return o.fallback();
    },
  };

  /* 独立项目导航：只指向当前仓库，没有跨项目依赖 */
  function renderTopbar() {
    const host = $('#topbar');
    if (!host) return;
    host.className = 'topbar';
    host.innerHTML = `<div class="wrap topbar-inner">
      <a class="brand" href="index.html"><span class="brand-mark">✳</span>
        <span>Spark Copy<small>文案创作 · INDEPENDENT EDITION</small></span></a>
      <span class="spacer"></span>
      <span class="tiny faint hide-sm">无需账户 · 无需安装 · 离线可用</span>
      <span data-ai-badge class="hide-sm"></span>
      <button class="icon-btn" id="btn-ai-settings" title="接入大模型（可选）">⚙</button>
      </div>`;
    $('#btn-ai-settings').addEventListener('click', () => AI.openSettings(() => location.reload()));
    AI.renderBadge();
  }

  /* ---------------------------------------------------------------- 迷你图表 */
  /** 水平条形图（SVG），data: [{label, value, color?}] */
  function barChart(data, opts) {
    opts = opts || {};
    const max = Math.max(...data.map((d) => Math.abs(d.value)), 1);
    const fmtV = opts.format || ((v) => fmt(v));
    return (
      '<div class="stack gap-8">' +
      data
        .map((d) => {
          const w = clamp((Math.abs(d.value) / max) * 100, 1.5, 100);
          return `<div class="row gap-12" style="font-size:12.5px">
            <span style="width:${opts.labelWidth || 104}px;flex:none;color:var(--text-dim);overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(d.label)}">${esc(d.label)}</span>
            <span class="bar ${d.tone || ""}" style="flex:1"><i style="width:${w}%${d.color ? ";background:" + d.color : ""}"></i></span>
            <span class="mono" style="width:${opts.valueWidth || 68}px;flex:none;text-align:right;color:var(--text)">${fmtV(d.value)}</span>
          </div>`;
        })
        .join("") +
      "</div>"
    );
  }

  /** 环形进度 */
  function donut(value, opts) {
    opts = opts || {};
    const size = opts.size || 92, sw = opts.stroke || 9;
    const r = (size - sw) / 2, C = 2 * Math.PI * r;
    const v = clamp(value, 0, 1);
    const color = opts.color || "url(#dg)";
    return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" style="flex:none">
      <defs><linearGradient id="dg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#7c5cff"/><stop offset="60%" stop-color="#22d3ee"/><stop offset="100%" stop-color="#f472b6"/>
      </linearGradient></defs>
      <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="rgba(255,255,255,.1)" stroke-width="${sw}"/>
      <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${color}" stroke-width="${sw}"
        stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - v)}"
        transform="rotate(-90 ${size / 2} ${size / 2})" style="transition:stroke-dashoffset .9s cubic-bezier(.2,.8,.2,1)"/>
      <text x="50%" y="50%" text-anchor="middle" dy=".36em" fill="#eef1fb"
        font-size="${opts.fontSize || 19}" font-weight="700" font-family="var(--mono)">${opts.text != null ? opts.text : Math.round(v * 100)}</text>
    </svg>`;
  }

  /* ---------------------------------------------------------------- 导出 */
  global.UI = { $, $$, esc, fmt, compact, pct, money, clamp, pick, shuffle, hashFloat, sleep, todayISO, isoLocal,
                toast, copy, download, parseCSV, toCSV, findCol, num, modal, renderTopbar, barChart, donut };
  global.AI = AI;
})(window);
