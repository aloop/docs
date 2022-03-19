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

  document.addEventListener('keyup', handleEscape);
  document.addEventListener('click', closeOnClick);
}

// Create and enable elements to easily copy code blocks

// Make sure we have the Clipboard API available
if ("clipboard" in navigator) {
  const codeBlocks = document.querySelectorAll('div.highlight');

  // Create our template element to clone for each code block
  const copyButtonTemplate = document.createElement('button');
  copyButtonTemplate.classList.add('c-Copy');
  copyButtonTemplate.setAttribute('title', 'Copy code to clipboard');
  copyButtonTemplate.innerText = 'copy';

  for (const codeBlock of codeBlocks) {

    const copyButton = copyButtonTemplate.cloneNode(true);

    const timeoutFn = () => {
      copyButton.disabled = false;
      copyButton.innerText = 'copy';
    };

    copyButton.addEventListener('click', async ev => {
      // This selector is a bit fragile
      const code = codeBlock.querySelector('.chroma > code');

      if (code) {
        try {
          // Copy the code to the clipboard
          await navigator.clipboard.writeText(code.innerText);

          // Temporarily disable the copy button and indicate that the copy was successful
          copyButton.disabled = true;
          copyButton.innerText = 'copied!';

          // Revert text and re-enable button after a few seconds
          setTimeout(timeoutFn, 1500);
        } catch (e) {
          console.error('Failed to copy code block.');
        }
      }
    });

    // Insert the copy button in such a way that it is the first child
    codeBlock.insertBefore(copyButton, codeBlock.firstChild);
    codeBlock.classList.add('has-copy-button');
  }
}
