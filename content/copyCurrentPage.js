import { buildText } from './capture.js';
import { bindHoverBackground, bindPressScale, copyText, createFloatingButton, setButtonState } from './shared.js';

export function installCopyCurrentPageButton({ config, getNextFloatingTop, requestCapture }) {
    const copyBtn = createFloatingButton({
        id: 'weread-copy-current-page',
        text: '复制本页文字',
        top: getNextFloatingTop(),
        background: '#1e88e5',
    });

    bindHoverBackground(copyBtn, '#1e88e5', '#1565c0', () => copyBtn.textContent === '复制本页文字');
    bindPressScale(copyBtn);

    copyBtn.addEventListener('click', async () => {
        setButtonState(copyBtn, '读取中...', '#1565c0');

        const items = await requestCapture();
        const text = buildText(items);

        if (!text) {
            setButtonState(copyBtn, '暂无内容', '#757575', config.uiFeedbackInfoDelayMs);
            return;
        }

        const ok = await copyText(text);
        setButtonState(copyBtn, ok ? '已复制' : '复制失败', ok ? '#43a047' : '#e53935', config.uiFeedbackSuccessDelayMs);
    });

    document.body.appendChild(copyBtn);
}
