"use strict";
const SCROLL_DURATION_MS = 1000;
const SCROLLSPY_OFFSET_PX = 10;
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
// Find a required element, failing loudly if the markup has changed
function qs(selector, root = document) {
    const el = root.querySelector(selector);
    if (el === null) {
        throw new Error(`resume: missing element "${selector}"`);
    }
    return el;
}
// Same curve as jQuery Easing's easeInOutExpo
function easeInOutExpo(t) {
    if (t <= 0)
        return 0;
    if (t >= 1)
        return 1;
    return t < 0.5
        ? Math.pow(2, 20 * t - 10) / 2
        : (2 - Math.pow(2, -20 * t + 10)) / 2;
}
// Smooth scrolling with easeInOutExpo; user input cancels the animation
let scrollFrame = null;
function cancelScrollAnimation() {
    if (scrollFrame !== null) {
        cancelAnimationFrame(scrollFrame);
        scrollFrame = null;
    }
}
function animateScrollTo(targetY, durationMs = SCROLL_DURATION_MS) {
    cancelScrollAnimation();
    if (reducedMotion.matches) {
        window.scrollTo(0, targetY);
        return;
    }
    const startY = window.scrollY;
    const distance = targetY - startY;
    const startTime = performance.now();
    const step = (now) => {
        const progress = Math.min((now - startTime) / durationMs, 1);
        window.scrollTo(0, startY + distance * easeInOutExpo(progress));
        scrollFrame = progress < 1 ? requestAnimationFrame(step) : null;
    };
    scrollFrame = requestAnimationFrame(step);
}
function initSmoothScroll(triggers) {
    for (const trigger of triggers) {
        trigger.addEventListener("click", (event) => {
            const hash = trigger.hash;
            if (hash.length <= 1)
                return;
            const target = document.getElementById(decodeURIComponent(hash.slice(1)));
            if (target === null)
                return;
            event.preventDefault();
            animateScrollTo(target.getBoundingClientRect().top + window.scrollY);
            history.replaceState(null, "", hash);
        });
    }
    for (const type of ["wheel", "touchstart", "keydown"]) {
        window.addEventListener(type, cancelScrollAnimation, { passive: true });
    }
}
function transitionDurationMs(el) {
    const { transitionDuration, transitionDelay } = getComputedStyle(el);
    const toMs = (value) => (parseFloat(value) || 0) * 1000;
    return toMs(transitionDuration.split(",")[0] ?? "0") + toMs(transitionDelay.split(",")[0] ?? "0");
}
function initMenu(toggler) {
    const panelId = toggler.getAttribute("aria-controls");
    if (panelId === null) {
        throw new Error("resume: navbar toggler has no aria-controls");
    }
    const panel = qs(`#${CSS.escape(panelId)}`);
    let transitioning = false;
    const isOpen = () => panel.classList.contains("show");
    const syncToggler = (open) => {
        toggler.classList.toggle("collapsed", !open);
        toggler.setAttribute("aria-expanded", String(open));
    };
    const finish = (open) => {
        let done = false;
        const complete = () => {
            if (done)
                return;
            done = true;
            panel.removeEventListener("transitionend", onEnd);
            panel.classList.remove("collapsing");
            panel.classList.add("collapse");
            panel.classList.toggle("show", open);
            panel.style.height = "";
            transitioning = false;
        };
        const onEnd = (event) => {
            if (event.target === panel)
                complete();
        };
        const duration = transitionDurationMs(panel);
        if (duration === 0) {
            complete();
            return;
        }
        panel.addEventListener("transitionend", onEnd);
        // Fallback in case transitionend never fires
        window.setTimeout(complete, duration + 50);
    };
    const setOpen = (open) => {
        if (transitioning || isOpen() === open)
            return;
        transitioning = true;
        syncToggler(open);
        if (open) {
            panel.classList.remove("collapse");
            panel.classList.add("collapsing");
            panel.style.height = "0px";
            panel.style.height = `${panel.scrollHeight}px`;
        }
        else {
            panel.style.height = `${panel.getBoundingClientRect().height}px`;
            void panel.offsetHeight; // force reflow so the height transition starts
            panel.classList.add("collapsing");
            panel.classList.remove("collapse", "show");
            panel.style.height = "";
        }
        finish(open);
    };
    syncToggler(isOpen());
    toggler.addEventListener("click", () => setOpen(!isOpen()));
    return { setOpen };
}
// Scrollspy: mark the nav link of the section currently in view as active
function initScrollSpy(navLinks) {
    const entries = [];
    for (const link of navLinks) {
        const section = document.getElementById(decodeURIComponent(link.hash.slice(1)));
        if (section !== null)
            entries.push({ section, link });
    }
    if (entries.length === 0)
        return;
    let activeLink = null;
    const setActive = (link) => {
        if (link === activeLink)
            return;
        activeLink?.classList.remove("active");
        link?.classList.add("active");
        activeLink = link;
    };
    const update = () => {
        const scrollTop = window.scrollY + SCROLLSPY_OFFSET_PX;
        const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
        if (window.scrollY >= maxScroll - 1) {
            setActive(entries[entries.length - 1]?.link ?? null);
            return;
        }
        let current = null;
        for (const { section, link } of entries) {
            if (section.getBoundingClientRect().top + window.scrollY <= scrollTop) {
                current = link;
            }
        }
        setActive(current);
    };
    let pending = false;
    const scheduleUpdate = () => {
        if (pending)
            return;
        pending = true;
        requestAnimationFrame(() => {
            pending = false;
            update();
        });
    };
    window.addEventListener("scroll", scheduleUpdate, { passive: true });
    window.addEventListener("resize", scheduleUpdate);
    update();
}
function init() {
    const sideNav = qs("#sideNav");
    const triggers = Array.from(document.querySelectorAll('a.js-scroll-trigger[href^="#"]:not([href="#"])'));
    const menu = initMenu(qs(".navbar-toggler", sideNav));
    initSmoothScroll(triggers);
    // Close the responsive menu when a scroll trigger link is clicked
    for (const trigger of triggers) {
        trigger.addEventListener("click", () => menu.setOpen(false));
    }
    initScrollSpy(Array.from(sideNav.querySelectorAll(".nav-link")));
}
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
}
else {
    init();
}
