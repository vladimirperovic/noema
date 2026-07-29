/* Redirect / Alias to noema-header-footer.js */
(() => {
  if (window._noemaHeaderFooterLoaded) return;
  const script = document.createElement("script");
  script.src = "/noema-header-footer.js";
  document.head.appendChild(script);
})();
