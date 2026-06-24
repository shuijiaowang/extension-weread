import { appState } from '../core/config.js';

export default defineContentScript({
    matches: ['https://weread.qq.com/web/reader/*'],
    runAt: 'document_idle',

    async main() {
        console.log('[weread] 复制按钮初始化');

        // 读取配置，判断是否显示按钮
        const config = await appState.domainConfigStorage.getValue();
        if (!config.showCopyButton) {
            console.log('[weread] 复制按钮未启用，跳过');
            document.getElementById('weread-copy-current-page')?.remove();
            return;
        }

        function buildText(items) {
            if (items.length === 0) return '';

            let text = '';
            let lastY = items[0].y;

            for (const item of items) {
                if (item.y !== lastY) {
                    text += '\n';
                    lastY = item.y;
                }
                text += item.text;
            }

            return text;
        }

        function requestCapture(cmd = 'get') {
            return new Promise((resolve) => {
                const requestId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
                let timerId;

                function finish(items) {
                    clearTimeout(timerId);
                    window.removeEventListener('message', onMessage);
                    resolve(Array.isArray(items) ? items : []);
                }

                function onMessage(event) {
                    if (event.source !== window) return;

                    const message = event.data;
                    if (
                        message?.source === 'weread-page'
                        && message.type === 'capture-result'
                        && message.requestId === requestId
                    ) {
                        finish(message.items);
                    }
                }

                window.addEventListener('message', onMessage);
                window.postMessage({
                    source: 'weread-extension',
                    type: 'request-capture',
                    cmd,
                    requestId,
                }, '*');

                timerId = setTimeout(() => finish([]), 1000);
            });
        }

        async function copyText(text) {
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

        function setButtonState(button, text, background, delay = 0) {
            button.textContent = text;
            button.style.background = background;

            if (delay > 0) {
                setTimeout(() => {
                    button.textContent = '复制本页文字';
                    button.style.background = '#1e88e5';
                }, delay);
            }
        }

        document.getElementById('weread-copy-current-page')?.remove();

        const copyBtn = document.createElement('div');
        copyBtn.id = 'weread-copy-current-page';
        copyBtn.textContent = '复制本页文字';
        Object.assign(copyBtn.style, {
            position: 'fixed',
            top: '12px',
            right: '12px',
            zIndex: '2147483647',
            padding: '8px 16px',
            background: '#1e88e5',
            color: '#fff',
            fontSize: '14px',
            fontWeight: 'bold',
            borderRadius: '6px',
            cursor: 'pointer',
            boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
            userSelect: 'none',
            transition: 'background 0.2s, transform 0.1s',
        });

        copyBtn.addEventListener('mouseenter', () => {
            if (copyBtn.textContent === '复制本页文字') copyBtn.style.background = '#1565c0';
        });
        copyBtn.addEventListener('mouseleave', () => {
            if (copyBtn.textContent === '复制本页文字') copyBtn.style.background = '#1e88e5';
        });
        copyBtn.addEventListener('mousedown', () => copyBtn.style.transform = 'scale(0.95)');
        copyBtn.addEventListener('mouseup', () => copyBtn.style.transform = 'scale(1)');
        copyBtn.addEventListener('click', async () => {
            setButtonState(copyBtn, '读取中...', '#1565c0');

            const items = await requestCapture();
            const text = buildText(items);

            if (!text) {
                setButtonState(copyBtn, '暂无内容', '#757575', 1200);
                return;
            }

            const ok = await copyText(text);
            setButtonState(copyBtn, ok ? '已复制' : '复制失败', ok ? '#43a047' : '#e53935', 1500);
        });

        document.body.appendChild(copyBtn);
    },
});
