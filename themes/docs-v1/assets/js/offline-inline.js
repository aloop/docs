window.addEventListener("load", () => {
  window.addEventListener("online", () => {
    if (window.location.pathname !== "/offline.html") {
      window.location.reload();
    }
  });
});
