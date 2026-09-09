/* Spark Vantage — landing page behaviour
   Three small things: mobile nav, FAQ accordion, scroll reveal. */

(function () {
  "use strict";

  /* ---------- mobile nav ---------- */
  var toggle = document.querySelector(".nav-toggle");
  var nav = document.getElementById("nav");

  if (toggle && nav) {
    toggle.addEventListener("click", function () {
      var open = toggle.getAttribute("aria-expanded") === "true";
      toggle.setAttribute("aria-expanded", String(!open));
      nav.setAttribute("data-open", String(!open));
    });

    nav.addEventListener("click", function (e) {
      if (e.target.closest("a")) {
        toggle.setAttribute("aria-expanded", "false");
        nav.setAttribute("data-open", "false");
      }
    });
  }

  /* ---------- FAQ accordion ----------
     Heights are set explicitly so the open/close transition animates; the
     open item is re-measured on resize because its text can rewrap. */
  var items = Array.prototype.slice.call(document.querySelectorAll(".faq__item"));

  function setOpen(item, open) {
    var panel = item.querySelector(".faq__a");
    var btn = item.querySelector(".faq__q");
    item.setAttribute("data-open", String(open));
    btn.setAttribute("aria-expanded", String(open));
    panel.style.maxHeight = open ? panel.scrollHeight + "px" : "0px";
  }

  items.forEach(function (item) {
    var btn = item.querySelector(".faq__q");
    if (!btn) return;

    if (item.getAttribute("data-open") === "true") setOpen(item, true);

    btn.addEventListener("click", function () {
      var isOpen = item.getAttribute("data-open") === "true";
      items.forEach(function (other) { setOpen(other, false); });
      if (!isOpen) setOpen(item, true);
    });
  });

  window.addEventListener("resize", function () {
    items.forEach(function (item) {
      if (item.getAttribute("data-open") === "true") setOpen(item, true);
    });
  });

  /* ---------- scroll reveal ---------- */
  var reveals = document.querySelectorAll(".reveal");

  if (!("IntersectionObserver" in window)) {
    reveals.forEach(function (el) { el.classList.add("is-in"); });
  } else {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-in");
        io.unobserve(entry.target);
      });
    }, { rootMargin: "0px 0px -12% 0px", threshold: 0.06 });

    reveals.forEach(function (el) { io.observe(el); });
  }

  /* ---------- footer year ---------- */
  var year = document.getElementById("year");
  if (year) year.textContent = String(new Date().getFullYear());
})();
