export function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function copyText(text) {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch (error) {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        Object.assign(textarea.style, {
            position: 'fixed',
            top: '0',
            left: '0',
            opacity: '0',
            pointerEvents: 'none',
        });
        document.body.appendChild(textarea);
        textarea.select();
        const ok = document.execCommand('copy');
        textarea.remove();
        return ok;
    }
}

export function downloadTextFile(filename, text) {
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
}

export function sanitizeFileName(name) {
    return String(name ?? 'weread')
        .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 80) || 'weread';
}

export function getBookTitle() {
    const title = [
        '.readerTopBar_title_link',
        '.readerCatalog_bookInfo_title_txt',
        '.readerTopBar_title',
    ]
        .map((selector) => document.querySelector(selector)?.textContent?.trim())
        .find(Boolean);

    if (title) return title;

    return document.title
        .replace(/\s*[-|_].*$/, '')
        .trim() || '微信读书';
}

export function formatTimestamp(date = new Date()) {
    const pad = (value) => String(value).padStart(2, '0');
    return [
        date.getFullYear(),
        pad(date.getMonth() + 1),
        pad(date.getDate()),
    ].join('') + '-' + [
        pad(date.getHours()),
        pad(date.getMinutes()),
        pad(date.getSeconds()),
    ].join('');
}

export function buildCaptureFileName(title) {
    return `${sanitizeFileName(title)}-${formatTimestamp()}.txt`;
}

export function createFloatingButton({ id, text, top, background, display = 'block' }) {
    const button = document.createElement('div');
    button.id = id;
    button.textContent = text;
    Object.assign(button.style, {
        position: 'fixed',
        top,
        right: '12px',
        zIndex: '2147483647',
        padding: '8px 16px',
        background,
        color: '#fff',
        fontSize: '14px',
        fontWeight: 'bold',
        borderRadius: '6px',
        cursor: 'pointer',
        boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
        userSelect: 'none',
        transition: 'background 0.2s, transform 0.1s',
        display,
    });
    return button;
}

export function bindPressScale(button) {
    button.addEventListener('mousedown', () => {
        button.style.transform = 'scale(0.95)';
    });
    button.addEventListener('mouseup', () => {
        button.style.transform = 'scale(1)';
    });
}

export function bindHoverBackground(button, normal, hover, canHover = () => true) {
    button.addEventListener('mouseenter', () => {
        if (canHover()) button.style.background = hover;
    });
    button.addEventListener('mouseleave', () => {
        if (canHover()) button.style.background = normal;
    });
}

export function setButtonState(button, text, background, delay = 0, resetText = '复制本页文字', resetBackground = '#1e88e5') {
    button.textContent = text;
    button.style.background = background;

    if (delay > 0) {
        setTimeout(() => {
            button.textContent = resetText;
            button.style.background = resetBackground;
        }, delay);
    }
}

export function summarizeRect(rect) {
    if (!rect) return null;
    return {
        left: Math.round(rect.left),
        top: Math.round(rect.top),
        right: Math.round(rect.right),
        bottom: Math.round(rect.bottom),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
    };
}

export function isVisibleElement(element) {
    if (!element) return false;

    const style = window.getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;

    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
}

export function isInteractableElement(element) {
    if (!element?.isConnected) return false;

    const style = window.getComputedStyle(element);
    return style.display !== 'none' && style.visibility !== 'hidden';
}
