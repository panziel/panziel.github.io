/* ============================================================================
 * kramer.js —— Read 讲义统一运行时（母版）
 *
 * 全套讲义共用的唯一脚本。每套讲义根目录下有一份 assets/kramer.js 的拷贝，所有
 * 页面在 </body> 前用普通 <script src> 引入它（在引入 toc.js 之后）：
 *
 *     <script src="{data-root}toc.js"></script>
 *     <script src="{data-root}assets/kramer.js"></script>
 *
 * 改行为只改这一个文件，全套讲义一次生效——不必逐个 HTML 修改。
 *
 * 职责：侧栏目录与书名、篇内上一篇/下一篇/返回上级导航（均由 toc.js 自动生成）、
 * 桌面收起与移动抽屉、单文件锚点导航、KaTeX、Mermaid 串行渲染、打印展开与 data-ready。
 *
 * 为什么不是 ES module：读者以 file:// 双击打开页面，<script type="module">
 * 会被浏览器的 CORS 策略拦截（本地模块导入受限）。因此本文件与 toc.js 一样用传统
 * <script src> + 全局变量的写法；连 Mermaid 也改用 UMD 全局版（window.mermaid），
 * 由本文件动态注入 CDN <script> 后初始化，全程不使用 import。
 *
 * 依赖：
 *   - window.TOC_DATA           由同目录 toc.js 提供（全书目录数据，唯一事实来源）
 *   - <body data-current data-root>  当前篇路径与回到根目录的相对前缀
 *   - KaTeX（katex.min.js / auto-render.min.js） 由页面在 <head> 引 CDN
 *   - Mermaid（UMD）             由本文件按需从 CDN 注入
 * ========================================================================== */
(function () {
  "use strict";

  var body = document.body;
  var root = body.dataset.root || "";      // 根目录篇为 ""，章目录篇为 "../"
  var current = body.dataset.current || ""; // 须与 toc.js 里该篇 href 逐字一致

  /* ------------------------------------------------------------------ *
   * 1. 全书目录侧边栏
   *    用 TOC_DATA 渲染：章标题即大章总结链接、章可收起、高亮并展开当前篇所在章。
   *    - 无章分组（总论/术语表）：{ chapter:null, items:[{title, href}] } → 平铺
   *    - 章分组：{ chapter, href(大章总结), items:[{title, href}(分节精讲)] } → 可折叠
   * ------------------------------------------------------------------ */
  function renderToc() {
    var nav = document.getElementById("toc");
    if (!nav) return;

    // 单文件模式（核心速览 All-in-One）：侧栏里是手写的页内锚点，不读 TOC_DATA
    if (body.dataset.mode !== "single") (window.TOC_DATA || []).forEach(function (group) {
      if (!group.chapter) {                                   // 无章分组：平铺，不可折叠
        var flat = document.createElement("div");
        flat.className = "toc-flat";
        group.items.forEach(function (it) {
          var a = document.createElement("a");
          a.href = root + it.href;
          a.textContent = it.title;
          if (it.href === current) a.classList.add("current");
          flat.appendChild(a);
        });
        nav.appendChild(flat);
        return;
      }

      // 章分组渲染成 <details><summary>章标题(链接)</summary> 各节 </details>
      var det = document.createElement("details");
      det.className = "toc-chapter";
      var sum = document.createElement("summary");
      var link = document.createElement("a");
      link.className = "chapter-link";
      link.href = root + group.href;         // 点章标题进大章总结
      link.textContent = group.chapter;
      // 点链接只跳转、不触发 <summary> 的展开切换
      link.addEventListener("click", function (e) { e.stopPropagation(); });
      sum.appendChild(link);
      det.appendChild(sum);

      var box = document.createElement("div");
      box.className = "toc-sections";
      group.items.forEach(function (it) {
        var a = document.createElement("a");
        a.href = root + it.href;
        a.textContent = it.title;
        if (it.href === current) a.classList.add("current");
        box.appendChild(a);
      });
      det.appendChild(box);

      // 当前篇属于本章（是本章大章总结、或本章某一节）则默认展开并高亮章标题
      var inChapter = group.href === current ||
        group.items.some(function (it) { return it.href === current; });
      if (inChapter) {
        det.open = true;
        if (group.href === current) sum.classList.add("current");
      }
      nav.appendChild(det);
    });

    // 移动端抽屉：汉堡开合 + 点遮罩关闭
    var toggle = document.getElementById("toc-toggle");
    var backdrop = document.getElementById("toc-backdrop");
    function closeDrawer() { body.classList.remove("toc-open"); }
    if (toggle) toggle.addEventListener("click", function () { body.classList.toggle("toc-open"); });
    if (backdrop) backdrop.addEventListener("click", closeDrawer);

    // 桌面端整体收起/展开侧栏，状态存 localStorage，跨篇与刷新后保持一致
    var collapse = document.getElementById("toc-collapse");
    var expand = document.getElementById("toc-expand");
    try { if (localStorage.getItem("tocCollapsed") === "1") body.classList.add("toc-collapsed"); } catch (e) {}
    function setCollapsed(on) {
      body.classList.toggle("toc-collapsed", on);
      try { localStorage.setItem("tocCollapsed", on ? "1" : "0"); } catch (e) {}
    }
    if (collapse) collapse.addEventListener("click", function () { setCollapsed(true); });
    if (expand) expand.addEventListener("click", function () { setCollapsed(false); });

    var cur = nav.querySelector(".current");
    if (cur) cur.scrollIntoView({ block: "center" });

    if (body.dataset.mode === "single") initAnchorNav(nav, closeDrawer);
  }

  /* ------------------------------------------------------------------ *
   * 1b. 单文件锚点导航（data-mode="single"）
   *     侧栏内 <a href="#cN"> 手写；滚动时高亮当前所在 section，点锚点后关闭移动端抽屉。
   * ------------------------------------------------------------------ */
  function initAnchorNav(nav, closeDrawer) {
    var links = [].slice.call(nav.querySelectorAll('a[href^="#"]'));
    var pairs = links.map(function (a) {
      return { a: a, sec: document.getElementById(a.getAttribute("href").slice(1)) };
    }).filter(function (p) { return p.sec; });
    links.forEach(function (a) { a.addEventListener("click", closeDrawer); });
    function onScroll() {
      var active = pairs[0];
      pairs.forEach(function (p) { if (p.sec.getBoundingClientRect().top <= 80) active = p; });
      pairs.forEach(function (p) { p.a.classList.toggle("current", p === active); });
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  }

  /* ------------------------------------------------------------------ *
   * 1c. 侧栏书名：取 toc.js 的 TOC_BOOK 填进 .toc-title（页面里留空）。
   *     单文件模式不引 toc.js，页面里手写的书名保留不动。
   * ------------------------------------------------------------------ */
  function renderTitle() {
    var t = document.querySelector("#toc .toc-title");
    if (t && !t.textContent.trim() && window.TOC_BOOK) t.textContent = window.TOC_BOOK + " · 全书目录";
  }

  /* ------------------------------------------------------------------ *
   * 1d. 篇内顺序导航 nav.pager：按 TOC_DATA 的阅读顺序自动生成，页面里只留空的
   *     <nav class="pager"></nav>。新增篇目后，相邻篇的「上一篇/下一篇」自动更新。
   *     阅读顺序 = 各分组依次展开：无章分组的 items；章分组先章 href（大章总结）再 items。
   *     返回上级：分节 → 本章大章总结；大章总结与其他根目录篇 → 总论；总论本身无上级。
   * ------------------------------------------------------------------ */
  function renderPager() {
    var pager = document.querySelector("nav.pager");
    if (!pager || pager.children.length || body.dataset.mode === "single") return;
    var seq = [], home = null;                // seq: [{title, href, parent}]
    (window.TOC_DATA || []).forEach(function (g) {
      if (!g.chapter) {
        g.items.forEach(function (it) {
          if (!home) home = it;               // 第一个无章条目即总论
          seq.push({ title: it.title, href: it.href, parent: it === home ? null : home });
        });
      } else {
        var ch = { title: g.chapter, href: g.href };
        seq.push({ title: g.chapter, href: g.href, parent: home });
        g.items.forEach(function (it) { seq.push({ title: it.title, href: it.href, parent: ch }); });
      }
    });
    var i = -1;
    seq.forEach(function (p, k) { if (p.href === current) i = k; });
    if (i < 0) return;                        // 本篇未登记进 toc.js：不生成（check.py 会报错）
    function link(p, text, dis) {
      var a = document.createElement("a");
      if (p) { a.href = root + p.href; a.textContent = text + p.title; }
      else { a.className = "disabled"; a.textContent = dis; }
      pager.appendChild(a);
    }
    var cur = seq[i];
    link(seq[i - 1], "← 上一篇：", "← 已是第一篇");
    link(cur.parent, "↑ 返回上级：", "↑ 已是顶层");
    link(seq[i + 1], "下一篇：", "已是最后一篇");
    var last = pager.lastChild;
    if (!last.classList.contains("disabled")) last.textContent += " →";
  }

  /* ------------------------------------------------------------------ *
   * 2. Mermaid（UMD 全局版，串行渲染）
   *    动态注入 CDN 的 mermaid.min.js（非 module），加载后关掉自动渲染、逐张
   *    await mermaid.render 串行画。串行是硬要求：同页多图并发渲染时各图内部
   *    自动生成的元素 ID 会互相干扰、布局错位、图文重叠糊成一团。逐张渲染规避之。
   * ------------------------------------------------------------------ */
  function renderMermaid(done) {
    var blocks = [].slice.call(document.querySelectorAll("pre.mermaid"));
    if (!blocks.length) return done();

    var s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/mermaid@11.17.2/dist/mermaid.min.js";
    s.onload = function () {
      if (!window.mermaid) return done();
      // 默认间距下宽图会被等比缩到正文宽度，字号随之变小；收紧间距让缩放比例更接近 1
      window.mermaid.initialize({ startOnLoad: false, theme: "neutral",
        flowchart: { nodeSpacing: 28, rankSpacing: 36, diagramPadding: 6 } });
      (function drawAll() {
        var i = 0;
        function next() {
          if (i >= blocks.length) return done();
          var el = blocks[i];
          var id = "mmd-" + i;
          i++;
          try {
            var ret = window.mermaid.render(id, el.textContent.trim());
            // mermaid@11 的 render 返回 Promise<{svg}>
            Promise.resolve(ret).then(function (out) {
              el.innerHTML = out && out.svg ? out.svg : out;
              next();
            }).catch(function (err) {
              el.innerHTML = "<pre style='color:#b00'>图渲染失败：" + err.message + "</pre>";
              next();
            });
          } catch (err) {
            el.innerHTML = "<pre style='color:#b00'>图渲染失败：" + err.message + "</pre>";
            next();
          }
        }
        next();
      })();
    };
    s.onerror = function () {
      blocks.forEach(function (el) {
        el.innerHTML = "<pre style='color:#b00'>Mermaid 加载失败（需要联网加载 CDN）</pre>";
      });
      done();
    };
    document.head.appendChild(s);
  }

  /* ------------------------------------------------------------------ *
   * 3. KaTeX 公式渲染
   *    扫描正文里的 $...$（行内）与 $$...$$、\[...\]（块级）分隔符就地渲染。
   *    KaTeX 的 katex.min.js / auto-render.min.js 由页面在 <head> 以 defer 引入，
   *    此处在 DOMContentLoaded 后调用 renderMathInElement 时已就绪。
   * ------------------------------------------------------------------ */
  function renderKatex() {
    if (!window.renderMathInElement) return;
    if (window.__katexRendered) return;
    window.__katexRendered = true;
    window.renderMathInElement(document.body, {
      delimiters: [
        { left: "$$", right: "$$", display: true },
        { left: "\\[", right: "\\]", display: true },
        { left: "$", right: "$", display: false },
        { left: "\\(", right: "\\)", display: false },
      ],
      ignoredTags: ["annotation", "math", "script", "noscript", "style", "textarea", "pre", "code", "option"],
      ignoredClasses: ["katex", "katex-mathml", "katex-html"],
      throwOnError: false,   // 单条公式语法错误只就地标红，不中断整页其余公式
    });
  }

  /* ------------------------------------------------------------------ *
   * 4. 打印支持
   *    - URL 带 ?print（整书 PDF 构建用）或用户按 Ctrl/Cmd+P 时，展开全部 <details>，
   *      避免自测题、常见疑问的答案在 PDF 里被折叠丢失。打印样式在 kramer.css 的 @media print。
   *    - Mermaid 与 KaTeX 全部渲染完成后设 <body data-ready="1">，供构建脚本等待。
   * ------------------------------------------------------------------ */
  function openAllDetails() {
    [].forEach.call(document.querySelectorAll("details"), function (d) { d.open = true; });
  }
  window.addEventListener("beforeprint", openAllDetails);

  /* ------------------------------------------------------------------ *
   * 启动
   * ------------------------------------------------------------------ */
  function init() {
    renderToc();
    renderTitle();
    renderPager();
    if (/[?&]print\b/.test(location.search)) openAllDetails();
    // KaTeX 由 <head> 里的 defer 脚本加载；本文件在 body 末尾同步执行，可能早于它们，
    // 故等 DOMContentLoaded（defer 脚本此时已执行完）再渲染公式。
    function afterDom() {
      renderKatex();
      renderMermaid(function () { body.dataset.ready = "1"; });
    }
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", afterDom);
    else afterDom();
  }
  init();
})();
