(() => {
    const widget = document.querySelector('[data-comments-repo]');

    if (!widget) {
        return;
    }

    const status = document.querySelector('.article-comments-status');
    const isPublishedPage = window.location.protocol === 'http:' || window.location.protocol === 'https:';

    if (!isPublishedPage) {
        if (status) {
            status.hidden = false;
        }
        return;
    }

    if (status) {
        status.hidden = true;
    }

    const script = document.createElement('script');
    script.src = 'https://utteranc.es/client.js';
    script.async = true;
    script.setAttribute('repo', widget.dataset.commentsRepo || 'jasonxu-cell/my_website');
    script.setAttribute('issue-term', widget.dataset.issueTerm || 'pathname');
    script.setAttribute('label', widget.dataset.label || 'comment');
    script.setAttribute('theme', widget.dataset.theme || 'github-light');
    script.setAttribute('crossorigin', 'anonymous');

    widget.appendChild(script);
})();
