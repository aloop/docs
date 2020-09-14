// Register service worker for offline support
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/service-worker.js");
}

// Setup handlers for opening and closing navigation
const navContainer = document.querySelector("#nav-container");
const toggle = document.querySelector("#nav-toggle");

if (navContainer !== null && toggle !== null) {
  const openClassName = "is-open";

  const hasClass = () => navContainer.classList.contains(openClassName);
  const removeClass = () => navContainer.classList.remove(openClassName);

  const closeNav = () => {
    if (hasClass()) {
      removeClass();
    }
  };

  const handleEscape = ({ key }) => {
    if (key === "Escape") {
      closeNav();
    }
  };

  const closeOnClick = ({ target }) => {
    if (hasClass() && !navContainer.contains(target)) {
      removeClass();
    }
  };

  resizeOpts = { once: true };

  toggle.addEventListener("click", async () => {
    navContainer.classList.toggle(openClassName);

    if (navContainer.classList.contains(openClassName)) {
      window.addEventListener("resize", closeNav, resizeOpts);
    }
  });

  document.addEventListener("keyup", handleEscape);
  document.addEventListener("click", closeOnClick);
}
