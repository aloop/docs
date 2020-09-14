// Register service worker for offline support
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/service-worker.js");
}

// Setup handler for opening navigation
const navContainer = document.querySelector("#nav-container");
const toggle = document.querySelector("#nav-toggle");

if (navContainer !== null && toggle !== null) {
  toggle.addEventListener("click", () => {
    navContainer.classList.toggle("is-open");
  });

  document.addEventListener("keyup", ({ key }) => {
    if (key === "Escape") {
      navContainer.classList.remove("is-open");
    }
  });

  document.addEventListener("click", ({ target }) => {
    if (
      navContainer.classList.contains("is-open") &&
      !navContainer.contains(target)
    ) {
      navContainer.classList.remove("is-open");
    }
  });
}
