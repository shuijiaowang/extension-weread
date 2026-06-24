import { appState, DEFAULT_DOMAIN_CONFIG } from '../core/config.js';

export default defineContentScript({
    matches: ['https://weread.qq.com/web/reader/*'],
    runAt: 'document_idle',

    async main() {
        console.log('[weread] 复制按钮初始化');

        function normalizeDelay(value, fallback) {
            const delay = Number(value);
            return Number.isFinite(delay) ? Math.max(0, Math.round(delay)) : fallback;
        }

        function normalizeConfig(value = {}) {
            const defaults = DEFAULT_DOMAIN_CONFIG;
            return {
                ...defaults,
                ...value,
                fullCapturePageDelayMs: normalizeDelay(value.fullCapturePageDelayMs, defaults.fullCapturePageDelayMs),
                reviewDelayMinMs: normalizeDelay(value.reviewDelayMinMs, defaults.reviewDelayMinMs),
                reviewDelayMaxMs: normalizeDelay(value.reviewDelayMaxMs, defaults.reviewDelayMaxMs),
                nativeCopyReadDelayMs: normalizeDelay(value.nativeCopyReadDelayMs, defaults.nativeCopyReadDelayMs),
                reviewPanelTimeoutMs: normalizeDelay(value.reviewPanelTimeoutMs, defaults.reviewPanelTimeoutMs),
                reviewPanelPollIntervalMs: normalizeDelay(value.reviewPanelPollIntervalMs, defaults.reviewPanelPollIntervalMs),
                reviewScrollDistance: normalizeDelay(value.reviewScrollDistance, defaults.reviewScrollDistance),
                reviewScrollMaxAttempts: normalizeDelay(value.reviewScrollMaxAttempts, defaults.reviewScrollMaxAttempts),
                captureRequestTimeoutMs: normalizeDelay(value.captureRequestTimeoutMs, defaults.captureRequestTimeoutMs),
                uiFeedbackSuccessDelayMs: normalizeDelay(value.uiFeedbackSuccessDelayMs, defaults.uiFeedbackSuccessDelayMs),
                uiFeedbackInfoDelayMs: normalizeDelay(value.uiFeedbackInfoDelayMs, defaults.uiFeedbackInfoDelayMs),
            };
        }

        const config = normalizeConfig(await appState.domainConfigStorage.getValue());
        let floatingButtonIndex = 0;

        function getNextFloatingTop() {
            const top = 12 + floatingButtonIndex * 40;
            floatingButtonIndex += 1;
            return `${top}px`;
        }

        function removeInjectedButtons() {
            document.getElementById('weread-copy-current-page')?.remove();
            document.getElementById('weread-full-capture')?.remove();
            document.getElementById('weread-copy-full-capture')?.remove();
            document.getElementById('weread-copy-chapters')?.remove();
            document.querySelectorAll('.weread-copy-comments-toolbar-item').forEach((button) => button.remove());
        }

        removeInjectedButtons();

        if (
            !config.showCopyCurrentPageButton
            && !config.showFullCaptureButton
            && !config.showChapterCopyButton
            && !config.showCopyCommentsButton
        ) {
            console.log('[weread] 所有功能按钮均未启用，跳过');
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

                timerId = setTimeout(() => finish([]), config.captureRequestTimeoutMs);
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

        function sleep(ms) {
            return new Promise((resolve) => setTimeout(resolve, ms));
        }

        function getPageDelay() {
            return config.fullCapturePageDelayMs;
        }

        function getRandomReviewDelay() {
            const min = config.reviewDelayMinMs;
            const max = config.reviewDelayMaxMs;
            return min + Math.floor(Math.random() * (max - min + 1));
        }

        function getButtonTextElement(button) {
            return button.querySelector('.review_section_toolbar_item_text') || button;
        }

        function setToolbarButtonText(button, text) {
            getButtonTextElement(button).textContent = text;
        }

        function copyToolbarIconStyle(sourceButton, targetButton) {
            const sourceIcon = sourceButton.querySelector('.review_section_toolbar_item_icon');
            const targetIcon = targetButton.querySelector('.review_section_toolbar_item_icon');
            if (!sourceIcon || !targetIcon) return;

            const sourceStyle = window.getComputedStyle(sourceIcon);
            [
                'backgroundImage',
                'backgroundSize',
                'backgroundPosition',
                'backgroundRepeat',
                'backgroundColor',
                'maskImage',
                'maskSize',
                'maskPosition',
                'maskRepeat',
                'webkitMaskImage',
                'webkitMaskSize',
                'webkitMaskPosition',
                'webkitMaskRepeat',
                'width',
                'height',
                'display',
            ].forEach((property) => {
                targetIcon.style[property] = sourceStyle[property];
            });
        }

        function normalizeReviewText(text) {
            return String(text ?? '').replace(/\s+/g, ' ').trim();
        }

        async function getOriginalTextByNativeCopy(nativeCopyButton) {
            if (!nativeCopyButton || !navigator.clipboard?.readText) return '';

            try {
                nativeCopyButton.click();
                await sleep(config.nativeCopyReadDelayMs);
                return normalizeReviewText(await navigator.clipboard.readText());
            } catch (error) {
                console.warn('[weread] 读取划线原文失败', error);
                return '';
            }
        }

        function collectReviewItems(panel) {
            const itemNodes = panel.querySelectorAll(
                '.reader_floatReviewsPanel_list_wrapper .reader_float_reviews_panel_item .reader_float_reviews_panel_item_top_container',
            );
            const reviews = [];
            const seen = new Set();

            itemNodes.forEach((item) => {
                const username = normalizeReviewText(
                    item.querySelector('.reader_float_reviews_panel_item_header')?.textContent,
                );
                const content = normalizeReviewText(
                    item.querySelector('.reader_float_reviews_panel_item_content')?.textContent,
                );

                if (!username && !content) return;

                const key = `${username}\n${content}`;
                if (seen.has(key)) return;

                seen.add(key);
                reviews.push({ username, content });
            });

            return reviews;
        }

        async function loadAllReviewItems(panel) {
            const content = panel.querySelector('.reader_float_panel_content_wrapper');
            if (!content) return;

            let lastScrollTop = -1;
            let lastCount = -1;
            let stableTimes = 0;

            for (let i = 0; i < config.reviewScrollMaxAttempts; i += 1) {
                content.scrollBy(0, config.reviewScrollDistance);
                await sleep(getRandomReviewDelay());

                const count = collectReviewItems(panel).length;
                if (content.scrollTop === lastScrollTop && count === lastCount) {
                    stableTimes += 1;
                } else {
                    stableTimes = 0;
                }

                if (stableTimes >= 3) break;

                lastScrollTop = content.scrollTop;
                lastCount = count;
            }
        }

        function buildReviewText(originalText, reviews) {
            const lines = [];

            if (originalText) {
                lines.push('原文：', originalText, '');
            }

            lines.push(`评论(${reviews.length})：`);
            reviews.forEach((review, index) => {
                const username = review.username || '匿名';
                const content = review.content || '';
                lines.push(`${index + 1}. ${username}：${content}`);
            });

            return lines.join('\n');
        }

        function isVisibleElement(element) {
            if (!element) return false;

            const style = window.getComputedStyle(element);
            if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;

            const rect = element.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0;
        }

        function isInteractableElement(element) {
            if (!element?.isConnected) return false;

            const style = window.getComputedStyle(element);
            return style.display !== 'none' && style.visibility !== 'hidden';
        }

        function getActiveReviewPanel() {
            const panels = Array.from(document.querySelectorAll('.float_panel_position_wrapper'))
                .filter((panel) => (
                    isVisibleElement(panel)
                    && panel.querySelector('.review_section_toolbar_item_copy')
                    && panel.querySelector('.reader_floatReviewsPanel_list_wrapper')
                ));

            return panels.at(-1) || null;
        }

        async function waitForReviewPanel(timeoutMs) {
            const timeout = timeoutMs ?? config.reviewPanelTimeoutMs;
            const start = Date.now();

            while (Date.now() - start < timeout) {
                const panel = getActiveReviewPanel();
                if (panel) return panel;
                await sleep(config.reviewPanelPollIntervalMs);
            }

            return null;
        }

        async function waitForReviewPanelClosed(timeoutMs) {
            const timeout = timeoutMs ?? config.reviewPanelTimeoutMs;
            const start = Date.now();

            while (Date.now() - start < timeout) {
                if (!getActiveReviewPanel()) return true;
                await sleep(config.reviewPanelPollIntervalMs);
            }

            return false;
        }

        async function closeReviewPanel(panel) {
            const closeBtn = panel?.querySelector('.reader_float_panel_header_closeBtn');
            if (!closeBtn) {
                console.warn('[weread] 未找到评论弹窗关闭按钮');
                return false;
            }

            closeBtn.click();
            return waitForReviewPanelClosed();
        }

        function getReviewTriggerRow(wrapper) {
            return wrapper?.parentElement?.parentElement?.parentElement || null;
        }

        function clickReviewTrigger(element) {
            if (!element) return;
            element.click();
        }

        function getCurrentPageReviewContainers() {
            const wrapper = document.querySelector('.wr_underline_wrapper');
            if (!wrapper) return [];

            const row = getReviewTriggerRow(wrapper);
            if (!row) return [];

            return Array.from(row.querySelectorAll(':scope > div'));
        }

        function getCurrentPageReviewTriggers() {
            return getCurrentPageReviewContainers()
                .map((container) => container.querySelector('.wr_underline_wrapper'))
                .filter(Boolean);
        }

        function normalizeFullCaptureMatchText(text) {
            return String(text ?? '').replace(/[\s\u200b-\u200d\ufeff]/g, '');
        }

        function buildNormalizedIndex(text) {
            let normalized = '';
            const sourceIndexes = [];

            for (let index = 0; index < text.length; index += 1) {
                const char = text[index];
                if (/[\s\u200b-\u200d\ufeff]/.test(char)) continue;

                normalized += char;
                sourceIndexes.push(index);
            }

            return { normalized, sourceIndexes };
        }

        function findReviewInsertIndex(text, originalText) {
            const needle = normalizeFullCaptureMatchText(originalText);
            if (!needle) return -1;

            const { normalized, sourceIndexes } = buildNormalizedIndex(text);
            const normalizedIndex = normalized.indexOf(needle);
            if (normalizedIndex < 0) return -1;

            const normalizedEndIndex = normalizedIndex + needle.length - 1;
            return sourceIndexes[normalizedEndIndex] + 1;
        }

        function formatEmbeddedReviews(reviews) {
            const content = reviews
                .map((review, index) => {
                    const prefix = reviews.length > 1 ? `${index + 1}. ` : '';
                    const username = review.username || '匿名';
                    return `${prefix}${username}：${review.content || ''}`;
                })
                .join('；');

            return `【评论：${content}】`;
        }

        function embedReviewsInText(text, reviewEntries) {
            const insertions = [];
            const seenInsertions = new Set();

            reviewEntries.forEach((entry) => {
                const insertIndex = findReviewInsertIndex(text, entry.originalText);
                if (insertIndex < 0) {
                    console.warn('[weread] 未匹配到评论原文', entry.originalText);
                    return;
                }

                const key = `${insertIndex}\n${JSON.stringify(entry.reviews)}`;
                if (seenInsertions.has(key)) return;

                seenInsertions.add(key);
                insertions.push({
                    index: insertIndex,
                    text: formatEmbeddedReviews(entry.reviews),
                });
            });

            return insertions
                .sort((a, b) => b.index - a.index)
                .reduce((result, insertion) => (
                    `${result.slice(0, insertion.index)}${insertion.text}${result.slice(insertion.index)}`
                ), text);
        }

        async function collectCurrentPageReviewEntries(onProgress) {
            const containers = getCurrentPageReviewContainers();
            const triggers = getCurrentPageReviewTriggers();
            const entries = [];
            const seen = new Set();

            console.log('[weread] 当前页评论容器数量', containers.length, '可点击数量', triggers.length);
            if (triggers.length === 0) return entries;

            for (let index = 0; index < containers.length; index += 1) {
                const clickTarget = containers[index].querySelector('.wr_underline_wrapper');
                if (!clickTarget) continue;

                onProgress?.(index + 1, containers.length);

                const existingPanel = getActiveReviewPanel();
                if (existingPanel) {
                    await closeReviewPanel(existingPanel);
                    await sleep(getRandomReviewDelay());
                }

                clickReviewTrigger(clickTarget);

                const panel = await waitForReviewPanel();
                if (!panel) {
                    console.warn('[weread] 评论弹窗未打开', index + 1, clickTarget);
                    continue;
                }

                await sleep(getRandomReviewDelay());

                const nativeCopyButton = panel.querySelector('.review_section_toolbar_item_copy');
                const originalText = await getOriginalTextByNativeCopy(nativeCopyButton);

                await loadAllReviewItems(panel);
                const reviews = collectReviewItems(panel);
                const key = `${normalizeFullCaptureMatchText(originalText)}\n${JSON.stringify(reviews)}`;

                if (originalText && reviews.length > 0 && !seen.has(key)) {
                    seen.add(key);
                    entries.push({ originalText, reviews });
                }

                const closed = await closeReviewPanel(panel);
                if (!closed) {
                    console.warn('[weread] 评论弹窗关闭失败', index + 1);
                }

                await sleep(getRandomReviewDelay());
            }

            return entries;
        }

        async function copyReviews(panel, button, nativeCopyButton) {
            setToolbarButtonText(button, '加载中...');
            button.style.pointerEvents = 'none';

            const originalText = await getOriginalTextByNativeCopy(nativeCopyButton);
            await loadAllReviewItems(panel);

            const reviews = collectReviewItems(panel);
            if (reviews.length === 0) {
                setToolbarButtonText(button, '暂无评论');
                setTimeout(() => setToolbarButtonText(button, '复制评论'), config.uiFeedbackInfoDelayMs);
                button.style.pointerEvents = '';
                return;
            }

            setToolbarButtonText(button, '复制中...');
            const ok = await copyText(buildReviewText(originalText, reviews));
            setToolbarButtonText(button, ok ? `已复制(${reviews.length})` : '复制失败');

            setTimeout(() => {
                setToolbarButtonText(button, '复制评论');
                button.style.pointerEvents = '';
            }, config.uiFeedbackSuccessDelayMs);
        }

        function installCopyCommentsButton() {
            const toolbars = document.querySelectorAll(
                '.float_panel_position_wrapper .reader_float_panel_header_wrapper .review_section_toolbar_items_wrapper',
            );

            toolbars.forEach((toolbar) => {
                if (toolbar.querySelector('.weread-copy-comments-toolbar-item')) return;

                const nativeCopyButton = toolbar.querySelector('.review_section_toolbar_item_copy');
                if (!nativeCopyButton) return;

                const button = nativeCopyButton.cloneNode(true);
                button.classList.remove('review_section_toolbar_item_copy');
                button.classList.add('weread-copy-comments-toolbar-item');
                button.dataset.wereadCopyCommentsBound = '1';
                button.style.cursor = 'pointer';
                copyToolbarIconStyle(nativeCopyButton, button);
                button.querySelectorAll('*').forEach((child) => {
                    child.style.cursor = 'pointer';
                });
                setToolbarButtonText(button, '复制评论');

                button.addEventListener('click', async (event) => {
                    event.preventDefault();
                    event.stopPropagation();

                    const panel = toolbar.closest('.float_panel_position_wrapper');
                    if (!panel) {
                        setToolbarButtonText(button, '未找到弹窗');
                        setTimeout(() => setToolbarButtonText(button, '复制评论'), config.uiFeedbackInfoDelayMs);
                        return;
                    }

                    await copyReviews(panel, button, nativeCopyButton);
                });

                nativeCopyButton.insertAdjacentElement('afterend', button);
            });
        }

        if (config.showCopyCommentsButton) {
            installCopyCommentsButton();
            new MutationObserver(installCopyCommentsButton).observe(document.body, { childList: true, subtree: true });
        }

        if (config.showCopyCurrentPageButton) {
        const copyBtn = document.createElement('div');
        copyBtn.id = 'weread-copy-current-page';
        copyBtn.textContent = '复制本页文字';
        Object.assign(copyBtn.style, {
            position: 'fixed',
            top: getNextFloatingTop(),
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
                setButtonState(copyBtn, '暂无内容', '#757575', config.uiFeedbackInfoDelayMs);
                return;
            }

            const ok = await copyText(text);
            setButtonState(copyBtn, ok ? '已复制' : '复制失败', ok ? '#43a047' : '#e53935', config.uiFeedbackSuccessDelayMs);
        });

        document.body.appendChild(copyBtn);
        }

        // ========== 全文爬取按钮 ==========
        if (config.showFullCaptureButton) {
        let isFullCaptureRunning = false;
        let fullCapturePages = [];
        let fullCaptureText = '';
        let fullCaptureReviewCount = 0;

        document.getElementById('weread-full-capture')?.remove();
        document.getElementById('weread-copy-full-capture')?.remove();

        const fullCaptureBtn = document.createElement('div');
        fullCaptureBtn.id = 'weread-full-capture';
        fullCaptureBtn.textContent = '开始全文爬取';
        Object.assign(fullCaptureBtn.style, {
            position: 'fixed',
            top: getNextFloatingTop(),
            right: '12px',
            zIndex: '2147483647',
            padding: '8px 16px',
            background: '#8e24aa',
            color: '#fff',
            fontSize: '14px',
            fontWeight: 'bold',
            borderRadius: '6px',
            cursor: 'pointer',
            boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
            userSelect: 'none',
            transition: 'background 0.2s, transform 0.1s',
        });

        const copyFullBtn = document.createElement('div');
        copyFullBtn.id = 'weread-copy-full-capture';
        copyFullBtn.textContent = '复制全文';
        Object.assign(copyFullBtn.style, {
            position: 'fixed',
            top: getNextFloatingTop(),
            right: '12px',
            zIndex: '2147483647',
            padding: '8px 16px',
            background: '#f57c00',
            color: '#fff',
            fontSize: '14px',
            fontWeight: 'bold',
            borderRadius: '6px',
            cursor: 'pointer',
            boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
            userSelect: 'none',
            transition: 'background 0.2s, transform 0.1s',
            display: 'none',
        });

        fullCaptureBtn.addEventListener('mouseenter', () => {
            if (!isFullCaptureRunning) fullCaptureBtn.style.background = '#6a1b9a';
        });
        fullCaptureBtn.addEventListener('mouseleave', () => {
            if (!isFullCaptureRunning) fullCaptureBtn.style.background = '#8e24aa';
        });
        fullCaptureBtn.addEventListener('mousedown', () => fullCaptureBtn.style.transform = 'scale(0.95)');
        fullCaptureBtn.addEventListener('mouseup', () => fullCaptureBtn.style.transform = 'scale(1)');
        fullCaptureBtn.addEventListener('click', async () => {
            if (isFullCaptureRunning) return;

            Object.assign(config, normalizeConfig(await appState.domainConfigStorage.getValue()));

            isFullCaptureRunning = true;
            fullCapturePages = [];
            fullCaptureText = '';
            fullCaptureReviewCount = 0;
            copyFullBtn.style.display = 'none';
            fullCaptureBtn.style.background = '#6a1b9a';

            while (true) {
                fullCaptureBtn.textContent = `读取第 ${fullCapturePages.length + 1} 页...`;

                const items = await requestCapture();
                let text = buildText(items);
                if (text && config.embedReviewsInFullCapture) {
                    const pageNumber = fullCapturePages.length + 1;
                    const reviewEntries = await collectCurrentPageReviewEntries((current, total) => {
                        fullCaptureBtn.textContent = `读取第 ${pageNumber} 页评论 ${current}/${total}...`;
                    });

                    fullCaptureReviewCount += reviewEntries.reduce((total, entry) => total + entry.reviews.length, 0);
                    text = embedReviewsInText(text, reviewEntries);
                }

                if (text) {
                    fullCapturePages.push(text);
                }

                await requestCapture('clear');

                const nextBtn = document.querySelector('.renderTarget_pager_button_right');
                if (!nextBtn || nextBtn.parentElement?.style.display === 'none') break;

                nextBtn.click();
                const delay = getPageDelay();
                fullCaptureBtn.textContent = `等待翻页 ${Math.round(delay / 100) / 10}s...`;
                await sleep(delay);
            }

            isFullCaptureRunning = false;
            fullCaptureText = fullCapturePages.join('\n\n');

            if (!fullCaptureText) {
                fullCaptureBtn.textContent = '未抓到内容';
                fullCaptureBtn.style.background = '#757575';
                setTimeout(() => {
                    fullCaptureBtn.textContent = '开始全文爬取';
                    fullCaptureBtn.style.background = '#8e24aa';
                }, config.uiFeedbackInfoDelayMs);
                return;
            }

            fullCaptureBtn.textContent = config.embedReviewsInFullCapture
                ? `爬取完成(${fullCapturePages.length}页/${fullCaptureReviewCount}条评论)`
                : `爬取完成(${fullCapturePages.length}页)`;
            fullCaptureBtn.style.background = '#43a047';
            copyFullBtn.textContent = config.embedReviewsInFullCapture
                ? `复制全文(${fullCapturePages.length}页/${fullCaptureReviewCount}条评论)`
                : `复制全文(${fullCapturePages.length}页)`;
            copyFullBtn.style.display = 'block';
        });

        copyFullBtn.addEventListener('mouseenter', () => {
            if (copyFullBtn.textContent.startsWith('复制全文')) copyFullBtn.style.background = '#ef6c00';
        });
        copyFullBtn.addEventListener('mouseleave', () => {
            if (copyFullBtn.textContent.startsWith('复制全文')) copyFullBtn.style.background = '#f57c00';
        });
        copyFullBtn.addEventListener('mousedown', () => copyFullBtn.style.transform = 'scale(0.95)');
        copyFullBtn.addEventListener('mouseup', () => copyFullBtn.style.transform = 'scale(1)');
        copyFullBtn.addEventListener('click', async () => {
            if (!fullCaptureText) return;

            copyFullBtn.textContent = '复制中...';
            copyFullBtn.style.background = '#ef6c00';
            const ok = await copyText(fullCaptureText);
            copyFullBtn.textContent = ok ? '已复制全文' : '复制失败';
            copyFullBtn.style.background = ok ? '#43a047' : '#e53935';
            setTimeout(() => {
                copyFullBtn.textContent = config.embedReviewsInFullCapture
                    ? `复制全文(${fullCapturePages.length}页/${fullCaptureReviewCount}条评论)`
                    : `复制全文(${fullCapturePages.length}页)`;
                copyFullBtn.style.background = '#f57c00';
            }, config.uiFeedbackSuccessDelayMs);
        });

        document.body.appendChild(fullCaptureBtn);
        document.body.appendChild(copyFullBtn);
        }

        // ========== 复制章节目录按钮 ==========
        if (config.showChapterCopyButton) {
        function getChapterInfo() {
            const catalogList = document.querySelector('.readerCatalog_list');
            if (!catalogList) return [];

            const items = catalogList.querySelectorAll('li.readerCatalog_list_item');
            const chapters = [];

            items.forEach((item, index) => {
                const level1El = item.querySelector('.readerCatalog_list_item_level_1 .readerCatalog_list_item_title_text');
                const level2El = item.querySelector('.readerCatalog_list_item_level_2 .readerCatalog_list_item_title_text');

                if (level1El) {
                    chapters.push({ index: index + 1, level: 1, title: level1El.textContent.trim() });
                } else if (level2El) {
                    chapters.push({ index: index + 1, level: 2, title: level2El.textContent.trim() });
                }
            });

            return chapters;
        }

        document.getElementById('weread-copy-chapters')?.remove();

        const chapterBtn = document.createElement('div');
        chapterBtn.id = 'weread-copy-chapters';
        chapterBtn.textContent = '复制章节目录';
        Object.assign(chapterBtn.style, {
            position: 'fixed',
            top: getNextFloatingTop(),
            right: '12px',
            zIndex: '2147483647',
            padding: '8px 16px',
            background: '#43a047',
            color: '#fff',
            fontSize: '14px',
            fontWeight: 'bold',
            borderRadius: '6px',
            cursor: 'pointer',
            boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
            userSelect: 'none',
            transition: 'background 0.2s, transform 0.1s',
        });

        chapterBtn.addEventListener('mouseenter', () => {
            if (chapterBtn.textContent === '复制章节目录') chapterBtn.style.background = '#2e7d32';
        });
        chapterBtn.addEventListener('mouseleave', () => {
            if (chapterBtn.textContent === '复制章节目录') chapterBtn.style.background = '#43a047';
        });
        chapterBtn.addEventListener('mousedown', () => chapterBtn.style.transform = 'scale(0.95)');
        chapterBtn.addEventListener('mouseup', () => chapterBtn.style.transform = 'scale(1)');
        chapterBtn.addEventListener('click', async () => {
            chapterBtn.textContent = '解析中...';
            chapterBtn.style.background = '#2e7d32';

            const chapters = getChapterInfo();

            if (chapters.length === 0) {
                chapterBtn.textContent = '未找到目录';
                chapterBtn.style.background = '#757575';
                setTimeout(() => {
                    chapterBtn.textContent = '复制章节目录';
                    chapterBtn.style.background = '#43a047';
                }, config.uiFeedbackInfoDelayMs);
                return;
            }

            const json = JSON.stringify(chapters, null, 2);
            const ok = await copyText(json);
            chapterBtn.textContent = ok ? `已复制(${chapters.length}章)` : '复制失败';
            chapterBtn.style.background = ok ? '#43a047' : '#e53935';
            setTimeout(() => {
                chapterBtn.textContent = '复制章节目录';
                chapterBtn.style.background = '#43a047';
            }, config.uiFeedbackSuccessDelayMs);
        });

        document.body.appendChild(chapterBtn);
        }
    },
});
