// Register service worker for offline support
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/service-worker.js");
}

// Handle online/offline events, notifying the service worker

window.addEventListener("load", () => {
  const onOnlineStatusChange = () => {
    navigator.serviceWorker.controller.postMessage({
      networkStatus: navigator.onLine,
    });
  };

  window.addEventListener("online", onOnlineStatusChange);
  window.addEventListener("offline", onOnlineStatusChange);
});

// Setup handlers for opening and closing navigation
const navContainer = document.getElementById("nav-container-9cc6478e");
const toggle = document.getElementById("nav-toggle-b9b1766c");

if (navContainer !== null && toggle !== null) {
  const openClassName = "is-open";

  const hasClass = () => navContainer.classList.contains(openClassName);
  const removeClass = () => navContainer.classList.remove(openClassName);

  const closeNav = () => {
    if (hasClass()) {
      removeClass();
      toggle.setAttribute("aria-expanded", false);
    }
  };

  const handleEscape = ({ key }) => {
    if (key === "Escape") {
      closeNav();
    }
  };

  const closeOnClick = ({ target }) => {
    if (hasClass() && !navContainer.contains(target)) {
      closeNav();
    }
  };

  const resizeOpts = { once: true };

  toggle.addEventListener("click", async () => {
    navContainer.classList.toggle(openClassName);
    toggle.setAttribute("aria-expanded", hasClass());

    if (navContainer.classList.contains(openClassName)) {
      window.addEventListener("resize", closeNav, resizeOpts);
    }
  });

  document.addEventListener("keyup", handleEscape);
  document.addEventListener("click", closeOnClick);
}
