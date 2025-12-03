(function() {
    const params = new URLSearchParams(window.location.search);
    const blockedUrl = params.get('url');
    const urlElement = document.getElementById('blockedUrl');
    const faviconElement = document.getElementById('siteFavicon');

    if (!blockedUrl) {
        urlElement.textContent = 'Unknown URL';
        faviconElement.style.display = 'none';
        return;
    }

    const decodedUrl = decodeURIComponent(blockedUrl);
    urlElement.textContent = decodedUrl;

    try {
        const url = new URL(decodedUrl);
        const domain = url.hostname;

        faviconElement.src = `https://www.google.com/s2/favicons?sz=64&domain=${domain}`;
        faviconElement.alt = `${domain} icon`;

        faviconElement.onerror = function() {
            this.src = `https://www.google.com/s2/favicons?domain=${domain}`;
            this.onerror = () => this.style.display = 'none';
        };
    } catch {
        faviconElement.style.display = 'none';
    }
})();
