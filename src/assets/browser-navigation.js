import { enhanceGraphs } from "./graph.js";

// Resolve URLs before moving content between pages with different directory depths.
function resolveUrls(root, base) {
  for (const element of root.querySelectorAll("[href], [src], [data-graph-src], [data-tree-src]")) {
    for (const attribute of ["href", "src", "data-graph-src", "data-tree-src"]) {
      const value = element.getAttribute(attribute);
      if (value && !value.startsWith("#")) element.setAttribute(attribute, new URL(value, base).href);
    }
  }
}

function initializeNavigation(browser) {
  const sidebar = browser.querySelector("[data-ontology-tree]");
  const termBase = new URL(browser.dataset.termBase, document.baseURI);
  const browseBase = new URL("../", termBase);
  const notice = document.querySelector("[data-term-notice]");
  const message = notice.querySelector("[data-term-notice-message]");
  const viewButton = notice.querySelector("[data-term-notice-view]");
  const openLink = notice.querySelector("[data-term-notice-open]");
  let pending;
  let restoringHistory = false;
  let scrollFrame;
  let dismissAtTop = false;

  resolveUrls(document, location.href);

  const position = () => ({ x: window.scrollX, y: window.scrollY });
  const savePosition = () => {
    if (restoringHistory) return;
    history.replaceState({ ...history.state, soBrowser: { position: position() } }, "");
  };
  savePosition();
  history.scrollRestoration = "manual";
  window.addEventListener("scroll", () => {
    cancelAnimationFrame(scrollFrame);
    scrollFrame = requestAnimationFrame(() => {
      savePosition();
      if (dismissAtTop && window.scrollY <= 2) notice.hidden = true;
      updateViewDirection();
    });
  }, { passive: true });

  function updateViewDirection() {
    const top = browser.querySelector("[data-browser-content]").getBoundingClientRect().top;
    viewButton.textContent = "Go to top " + (top < 0 ? "↑" : top > innerHeight ? "↓" : "→");
  }

  function showNotice(text, { loading = false, errorUrl } = {}) {
    dismissAtTop = !loading && !errorUrl;
    notice.hidden = dismissAtTop && window.scrollY <= 2;
    message.textContent = text;
    viewButton.hidden = loading || Boolean(errorUrl);
    openLink.hidden = !errorUrl;
    if (errorUrl) openLink.href = errorUrl;
    updateViewDirection();
  }

  notice.querySelector("[data-term-notice-dismiss]").addEventListener("click", () => {
    notice.hidden = true;
  });
  viewButton.addEventListener("click", () => {
    notice.hidden = true;
    browser.style.removeProperty("min-height");
    const content = browser.querySelector("[data-browser-content]");
    content.focus({ preventScroll: true });
    content.scrollIntoView({ block: "start", behavior: "instant" });
  });

  function isTermUrl(url) {
    if (url.origin !== termBase.origin || !url.pathname.startsWith(termBase.pathname)) return false;
    return /^SO[:_]\d{7}\/(?:index\.html)?$/i.test(decodeURIComponent(url.pathname.slice(termBase.pathname.length)));
  }

  async function readPage(url, signal) {
    for (let redirects = 0; redirects < 5; redirects++) {
      const response = await fetch(url, { signal });
      if (!response.ok) throw new Error("Term page unavailable");
      const page = new DOMParser().parseFromString(await response.text(), "text/html");
      const content = page.querySelector("[data-browser-content]");
      if (content) {
        if (!page.querySelector("[data-browser-breadcrumbs]")) throw new Error("Incomplete term page");
        resolveUrls(page, response.url);
        return { page, content, url: new URL(response.url) };
      }
      // Alternate-ID pages use a static meta refresh rather than an HTTP redirect.
      const refresh = page.querySelector('meta[http-equiv="refresh"]')?.getAttribute("content");
      const destination = refresh?.match(/^\s*0\s*;\s*url\s*=\s*(.+?)\s*$/i)?.[1];
      if (!destination) throw new Error("Not a term record");
      url = new URL(destination.replace(/^["']|["']$/g, ""), response.url);
      if (!isTermUrl(url)) throw new Error("Unknown term redirect");
    }
    throw new Error("Too many term redirects");
  }

  async function navigate(url, { push = true, restorePosition } = {}) {
    pending?.abort();
    const controller = new AbortController();
    pending = controller;
    restoringHistory = !push;
    const previous = browser.querySelector("[data-browser-content]");
    previous.setAttribute("aria-busy", "true");
    showNotice("Loading term…", { loading: true });

    try {
      const result = await readPage(url, controller.signal);
      const incoming = document.importNode(result.content, true);
      // Prepare the interactive graph off-screen so it cannot shift the live page.
      await enhanceGraphs(incoming, { signal: controller.signal });
      if (controller.signal.aborted) return;

      const targetPosition = restorePosition || position();
      if (push) savePosition();
      // Preserve enough page height when the new record is shorter than the old one.
      const browserTop = browser.getBoundingClientRect().top + window.scrollY;
      browser.style.minHeight = Math.max(0, targetPosition.y + window.innerHeight - browserTop) + "px";
      const focusWasInRecord = previous.contains(document.activeElement);
      previous.replaceWith(incoming);
      if (focusWasInRecord) incoming.focus({ preventScroll: true });
      const breadcrumbs = result.page.querySelector("[data-browser-breadcrumbs]");
      document.querySelector("[data-browser-breadcrumbs]").replaceWith(document.importNode(breadcrumbs, true));
      document.title = result.page.title;

      const id = incoming.dataset.termId || "";
      const destination = id ? new URL("./" + id + "/", termBase) : result.url;
      destination.search = result.url.search;
      if (push) history.pushState({ soBrowser: { position: targetPosition } }, "", destination);
      else history.replaceState({ ...history.state, soBrowser: { position: targetPosition } }, "", destination);
      sidebar.dispatchEvent(new CustomEvent("so:term-selected", { detail: { id } }));
      window.scrollTo({ left: targetPosition.x, top: targetPosition.y, behavior: "instant" });
      showNotice(id ? "Loaded " + incoming.dataset.termLabel + " (" + id + ")." : "Browse page loaded.");
    } catch (error) {
      if (controller.signal.aborted) return;
      showNotice("This term could not be loaded. Your current record is still available.", { errorUrl: url.href });
    } finally {
      if (pending === controller) {
        browser.querySelector("[data-browser-content]").removeAttribute("aria-busy");
        restoringHistory = false;
        pending = null;
      }
    }
  }

  browser.addEventListener("click", (event) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = event.target.closest("a[href]");
    if (!link || link.hasAttribute("download") || (link.getAttribute("target") && link.getAttribute("target") !== "_self")) return;
    const url = new URL(link.getAttribute("href"), document.baseURI);
    if (!isTermUrl(url)) return;
    event.preventDefault();
    if (url.href === location.href && !pending) {
      const content = browser.querySelector("[data-browser-content]");
      showNotice("Selected " + content.dataset.termLabel + " (" + content.dataset.termId + ").");
      return;
    }
    navigate(url);
  });

  window.addEventListener("popstate", (event) => {
    const url = new URL(location.href);
    if (event.state?.soBrowser && (isTermUrl(url) || url.pathname === browseBase.pathname || url.pathname === browseBase.pathname + "index.html")) {
      navigate(url, { push: false, restorePosition: event.state.soBrowser.position });
    } else {
      location.reload();
    }
  });
}

const browser = document.querySelector("[data-ontology-browser]");
if (browser) initializeNavigation(browser);
