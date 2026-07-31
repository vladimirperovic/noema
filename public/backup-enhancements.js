(() => {
  "use strict";
  if (!location.pathname.replace(/\.html$/, "").startsWith("/backup")) return;
  function apply() {
    const archive = document.querySelector('a[href="/api/backup/download"]');
    if (archive) {
      archive.setAttribute("download", "noema_full_backup.noema");
      const label = archive.querySelector("#zipBtnText") || archive.querySelector("span:last-child");
      if (label) label.textContent = "DOWNLOAD ENCRYPTED ARCHIVE";
    }
    document.querySelectorAll(".task-title").forEach((title) => {
      if (title.textContent.trim() === "Download Archive") title.textContent = "Download Backups";
    });
    document.querySelectorAll(".task-body div").forEach((element) => {
      if (element.textContent.includes("Download complete archive as ZIP")) {
        element.textContent = "Download a password-encrypted .noema disaster-recovery archive or a portable metadata JSON backup.";
      }
    });
    const upload = document.querySelector('input[type="file"]');
    if (upload) upload.accept = ".json,application/json";
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", apply, { once: true }); else apply();
})();
