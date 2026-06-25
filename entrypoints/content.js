import { appState, DEFAULT_DOMAIN_CONFIG, MAX_CAPTURE_HISTORY } from '../core/config.js';

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
                reviewScrollDelayMs: normalizeDelay(value.reviewScrollDelayMs, defaults.reviewScrollDelayMs),
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
            document.getElementById('weread-download-full-capture')?.remove();
            document.getElementById('weread-stop-full-capture')?.remove();
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

        let fullCaptureDiagLines = null;

        function beginFullCaptureDiag() {
            fullCaptureDiagLines = [];
        }

        function logDiag(entry) {
            fullCaptureDiagLines?.push(entry);
        }

        async function flushFullCaptureDiag() {
            if (!fullCaptureDiagLines?.length) return;

            const text = JSON.stringify(fullCaptureDiagLines, null, 2);
            console.log(`\n========== WEREAD 全文爬取诊断日志 ==========\n${text}\n========== 结束（已复制到剪贴板） ==========`);
            await copyText(text);
            fullCaptureDiagLines = null;
        }

        function snippetAround(text, index, radius = 48) {
            if (!text || index < 0) return '';
            const start = Math.max(0, index - radius);
            const end = Math.min(text.length, index + radius);
            return `${start > 0 ? '…' : ''}${text.slice(start, end)}${end < text.length ? '…' : ''}`;
        }

        function summarizeCaptureItem(item) {
            if (!item) return null;
            return {
                index: item.index,
                text: item.text,
                x: item.x,
                y: item.y,
                pageX: item.pageX,
                pageY: item.pageY,
                canvasId: item.canvasId,
            };
        }

        function summarizeRect(rect) {
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

        function previewLineItems(lineItems, maxLen = 80) {
            const text = lineItems.map((item) => item.text).join('');
            return text.length > maxLen ? `${text.slice(0, maxLen)}…` : text;
        }

        function getLinePreview(items, itemEndOffsets, index) {
            if (!items?.length || index < 0) return '';
            const target = items.find((item) => itemEndOffsets.get(item.index) === index)
                || items.find((item) => (itemEndOffsets.get(item.index) ?? -1) >= index);
            if (!target) return '';

            const lineKey = getLineKey(target);
            const lineText = items
                .filter((item) => getLineKey(item) === lineKey)
                .sort((a, b) => a.x - b.x)
                .map((item) => item.text)
                .join('');
            return lineText.length > 100 ? `${lineText.slice(0, 100)}…` : lineText;
        }

        const CAPTURE_TEST_LINE = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ`~1!2@3#4$5%6^7&8*9(0)-_=+[{]}|;:\',<.>/?';
        const MIN_COLUMN_ITEM_COUNT = 10;

        function getReaderCanvases() {
            return Array.from(document.querySelectorAll('canvas'))
                .filter((canvas) => {
                    const rect = canvas.getBoundingClientRect();
                    return rect.width > 80 && rect.height > 80;
                })
                .sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left);
        }

        function resolveCanvasIdMap(pageItems) {
            const canvases = getReaderCanvases();
            const canvasIds = [...new Set(pageItems.map((item) => item.canvasId ?? 0))]
                .filter((id) => pageItems.filter((item) => item.canvasId === id).length >= MIN_COLUMN_ITEM_COUNT);

            const idToCanvas = new Map();
            const usedCanvases = new Set();

            canvasIds.forEach((canvasId) => {
                const idItems = pageItems.filter((item) => item.canvasId === canvasId);
                let bestCanvas = null;
                let bestScore = 0;

                canvases.forEach((canvas) => {
                    if (usedCanvases.has(canvas)) return;

                    const width = canvas.width || canvas.getBoundingClientRect().width;
                    const height = canvas.height || canvas.getBoundingClientRect().height;
                    const inBounds = idItems.filter((item) => (
                        item.x >= -8
                        && item.x <= width + 8
                        && item.y >= -8
                        && item.y <= height + 8
                    )).length;

                    if (inBounds > bestScore) {
                        bestScore = inBounds;
                        bestCanvas = canvas;
                    }
                });

                if (bestCanvas && bestScore > idItems.length * 0.5) {
                    idToCanvas.set(canvasId, bestCanvas);
                    usedCanvases.add(bestCanvas);
                }
            });

            return idToCanvas;
        }

        function findCanvasIdForElement(canvasEl, pageItems) {
            const idToCanvas = resolveCanvasIdMap(pageItems);
            for (const [canvasId, canvas] of idToCanvas.entries()) {
                if (canvas === canvasEl) return canvasId;
            }
            return null;
        }

        function viewportRectToCanvasLocal(rect, canvasEl) {
            const canvasRect = canvasEl.getBoundingClientRect();
            return {
                left: rect.left - canvasRect.left,
                top: rect.top - canvasRect.top,
                right: rect.right - canvasRect.left,
                bottom: rect.bottom - canvasRect.top,
                width: rect.width,
                height: rect.height,
            };
        }

        function isItemInLocalRect(item, localRect) {
            return (
                item.x >= localRect.left - 4
                && item.x <= localRect.right + 4
                && item.y >= localRect.top - 12
                && item.y <= localRect.bottom + 12
            );
        }

        function estimateCharWidth(lineItems) {
            if (!lineItems || lineItems.length < 2) return 24;

            const gaps = [];
            for (let i = 1; i < lineItems.length; i++) {
                const gap = lineItems[i].x - lineItems[i - 1].x;
                if (gap > 0) gaps.push(gap);
            }
            if (!gaps.length) return 24;

            gaps.sort((a, b) => a - b);
            return gaps[Math.floor(gaps.length / 2)];
        }

        function chooseAnchorItem(matchedItems, localRect) {
            if (!matchedItems.length) return null;

            const sorted = [...matchedItems].sort((a, b) => a.y - b.y || a.x - b.x);
            const last = sorted.at(-1);
            const lineItems = sorted.filter((item) => item.y === last.y);
            const charWidth = estimateCharWidth(lineItems);
            const anchorRight = localRect.right - charWidth / 2;

            let chosen = lineItems[0];
            for (const item of lineItems) {
                if (item.x <= anchorRight) chosen = item;
                else break;
            }

            return chosen;
        }

        function findCanvasForViewportRect(rect) {
            const centerX = (rect.left + rect.right) / 2;
            const centerY = (rect.top + rect.bottom) / 2;

            return getReaderCanvases().find((canvas) => {
                const canvasRect = canvas.getBoundingClientRect();
                return (
                    centerX >= canvasRect.left
                    && centerX <= canvasRect.right
                    && centerY >= canvasRect.top
                    && centerY <= canvasRect.bottom
                );
            }) || null;
        }

        function getLineKey(item) {
            return `${item.canvasId ?? 0}|${item.y}`;
        }

        function isTestLine(lineItems) {
            return lineItems.map((item) => item.text).join('').trim() === CAPTURE_TEST_LINE;
        }

        function groupItemsIntoLines(items) {
            const lineMap = new Map();

            items.forEach((item) => {
                const key = getLineKey(item);
                if (!lineMap.has(key)) lineMap.set(key, []);
                lineMap.get(key).push(item);
            });

            return Array.from(lineMap.values())
                .filter((lineItems) => !isTestLine(lineItems))
                .map((lineItems) => lineItems.sort((a, b) => a.x - b.x));
        }

        function sortLinesByReadingOrder(lines) {
            return lines.sort((a, b) => {
                const firstA = a[0];
                const firstB = b[0];
                const yDiff = firstA.y - firstB.y;
                if (yDiff !== 0) return yDiff;

                return firstA.x - firstB.x;
            });
        }

        function getColumnItemGroups(items) {
            const idToCanvas = resolveCanvasIdMap(items);

            return [...idToCanvas.entries()]
                .map(([canvasId, canvas]) => ({
                    canvasId,
                    canvas,
                    items: items.filter((item) => item.canvasId === canvasId),
                }))
                .sort((a, b) => a.canvas.getBoundingClientRect().left - b.canvas.getBoundingClientRect().left)
                .map((group) => group.items);
        }

        function appendLinesToText(text, lines, itemEndOffsets) {
            let result = text;
            let lastY = null;

            lines.forEach((lineItems) => {
                const lineY = lineItems[0].y;
                if (lastY !== null && lineY !== lastY) {
                    result += '\n';
                }
                lastY = lineY;

                lineItems.forEach((item) => {
                    result += item.text;
                    itemEndOffsets.set(item.index, result.length);
                });
            });

            return result;
        }

        function buildTextData(items, pageNumber = null) {
            if (!Array.isArray(items) || items.length === 0) {
                return { text: '', itemEndOffsets: new Map() };
            }

            const idToCanvas = resolveCanvasIdMap(items);
            const columns = getColumnItemGroups(items);
            const itemEndOffsets = new Map();
            let text = '';

            const columnDebug = columns.map((columnItems, columnIndex) => {
                const lines = sortLinesByReadingOrder(groupItemsIntoLines(columnItems));
                if (columnIndex > 0) text += '\n\n';
                const beforeLength = text.length;
                text = appendLinesToText(text, lines, itemEndOffsets);
                const canvasId = columnItems[0]?.canvasId ?? 0;
                const canvasEl = idToCanvas.get(canvasId);
                const canvasRect = canvasEl?.getBoundingClientRect();

                return {
                    columnIndex,
                    canvasId,
                    itemCount: columnItems.length,
                    lineCount: lines.length,
                    canvasViewport: canvasRect ? summarizeRect(canvasRect) : null,
                    localXRange: [
                        Math.min(...columnItems.map((item) => item.x)),
                        Math.max(...columnItems.map((item) => item.x)),
                    ],
                    localYRange: [
                        Math.min(...columnItems.map((item) => item.y)),
                        Math.max(...columnItems.map((item) => item.y)),
                    ],
                    textOffsetStart: beforeLength,
                    textOffsetEnd: text.length,
                    firstLine: previewLineItems(lines[0] || []),
                    lastLine: previewLineItems(lines.at(-1) || []),
                };
            });

            logDiag({
                phase: 'buildTextData',
                pageNumber,
                rawItemCount: items.length,
                columnCount: columns.length,
                textLength: text.length,
                columns: columnDebug,
                textHead: text.slice(0, 120),
                textTail: text.slice(-120),
            });

            return { text, itemEndOffsets };
        }

        function buildText(items) {
            return buildTextData(items).text;
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

        function downloadTextFile(filename, text) {
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

        function sanitizeFileName(name) {
            return String(name ?? 'weread')
                .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
                .replace(/\s+/g, ' ')
                .trim()
                .slice(0, 80) || 'weread';
        }

        function getBookTitle() {
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

        function formatTimestamp(date = new Date()) {
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

        function buildCaptureFileName(title) {
            return `${sanitizeFileName(title)}-${formatTimestamp()}.txt`;
        }

        async function saveCaptureHistory(record) {
            const history = await appState.captureHistoryStorage.getValue();
            const nextHistory = [record, ...history].slice(0, MAX_CAPTURE_HISTORY);
            await appState.captureHistoryStorage.setValue(nextHistory);
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
                const previousValue = normalizeReviewText(await navigator.clipboard.readText());
                nativeCopyButton.click();
                const timeout = Math.max(config.nativeCopyReadDelayMs, 600);
                const start = Date.now();

                while (Date.now() - start < timeout) {
                    await sleep(Math.min(config.nativeCopyReadDelayMs || 80, 120));
                    const value = normalizeReviewText(await navigator.clipboard.readText());
                    if (value && value !== previousValue) return value;
                }

                console.warn('[weread] 复制划线原文超时或未更新');
                return '';
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
                await sleep(config.reviewScrollDelayMs);

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
                .map(getLastReviewTrigger)
                .filter(Boolean);
        }

        function getLastReviewTrigger(container) {
            return Array.from(container?.querySelectorAll('.wr_underline_wrapper') || [])
                .filter(isInteractableElement)
                .at(-1) || null;
        }

        function getTriggerLastRect(trigger) {
            return Array.from(trigger?.getClientRects?.() || [])
                .filter((rect) => rect.width > 0 && rect.height > 0)
                .at(-1) || null;
        }

        function getReviewInsertInfo(trigger, pageItems, itemEndOffsets, pageText) {
            const viewportRect = getTriggerLastRect(trigger);
            if (!viewportRect || !Array.isArray(pageItems) || pageItems.length === 0) {
                return {
                    insertIndex: -1,
                    debug: {
                        viewportRect: summarizeRect(viewportRect),
                        matchedCount: 0,
                        reason: !viewportRect ? '无 trigger rect' : 'pageItems 为空',
                    },
                };
            }

            const canvasEl = findCanvasForViewportRect(viewportRect);
            const canvasId = canvasEl ? findCanvasIdForElement(canvasEl, pageItems) : null;
            const localRect = canvasEl ? viewportRectToCanvasLocal(viewportRect, canvasEl) : null;

            const matchedItems = canvasId && localRect
                ? pageItems
                    .filter((item) => item.canvasId === canvasId && isItemInLocalRect(item, localRect))
                    .sort((a, b) => a.y - b.y || a.x - b.x)
                : [];
            const rawLastItem = matchedItems.at(-1);
            const chosenItem = chooseAnchorItem(matchedItems, localRect);
            const insertIndex = chosenItem ? itemEndOffsets.get(chosenItem.index) ?? -1 : -1;

            return {
                insertIndex,
                debug: {
                    viewportRect: summarizeRect(viewportRect),
                    canvasViewport: canvasEl ? summarizeRect(canvasEl.getBoundingClientRect()) : null,
                    localRect: localRect ? summarizeRect(localRect) : null,
                    canvasId,
                    triggerText: normalizeReviewText(trigger?.textContent),
                    wrapperCount: trigger?.parentElement
                        ? trigger.parentElement.querySelectorAll('.wr_underline_wrapper').length
                        : 0,
                    matchedCount: matchedItems.length,
                    matchedItems: matchedItems.map(summarizeCaptureItem),
                    rawLastItem: summarizeCaptureItem(rawLastItem),
                    chosenItem: summarizeCaptureItem(chosenItem),
                    anchorRight: localRect
                        ? Math.round(localRect.right - estimateCharWidth(
                            matchedItems.filter((item) => item.y === rawLastItem?.y),
                        ) / 2)
                        : null,
                    anchorAdjusted: Boolean(rawLastItem && chosenItem && rawLastItem.index !== chosenItem.index),
                    insertIndex,
                    linePreview: getLinePreview(pageItems, itemEndOffsets, insertIndex),
                    contextAtInsert: snippetAround(pageText, insertIndex),
                    reason: insertIndex < 0
                        ? (!canvasEl
                            ? '未找到对应 canvas'
                            : !canvasId
                                ? '未匹配 canvasId'
                                : matchedItems.length === 0
                                    ? 'canvas 本地坐标未命中'
                                    : '命中字无 offset')
                        : '',
                },
            };
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

        function getReviewDuplicateKey(reviews) {
            return JSON.stringify(reviews.map((review) => ({
                username: review.username || '',
                content: review.content || '',
            })));
        }

        function removeEmbeddedReviews(text, reviews) {
            const embeddedText = formatEmbeddedReviews(reviews);
            const index = text.indexOf(embeddedText);
            if (index < 0) return text;

            return `${text.slice(0, index)}${text.slice(index + embeddedText.length)}`;
        }

        function embedReviewsInText(text, reviewEntries, reviewDedupState, pageIndex, capturedPages) {
            const insertions = [];

            reviewEntries.forEach((entry, entryIndex) => {
                if (entry.insertIndex < 0) {
                    logDiag({
                        phase: 'embedReview.skip',
                        pageIndex,
                        entryIndex,
                        reason: 'insertIndex < 0',
                        debug: entry.debug,
                        reviewCount: entry.reviews.length,
                    });
                    return;
                }

                const duplicateKey = getReviewDuplicateKey(entry.reviews);
                const previous = reviewDedupState.get(duplicateKey);
                let dedupAction = 'new';

                if (previous) {
                    if (previous.pageIndex === pageIndex) {
                        const previousIndex = insertions.findIndex((insertion) => insertion.duplicateKey === duplicateKey);
                        if (previousIndex >= 0) insertions.splice(previousIndex, 1);
                        dedupAction = 'replace-same-page-pending';
                    } else if (capturedPages[previous.pageIndex]) {
                        const beforeRemove = snippetAround(capturedPages[previous.pageIndex], capturedPages[previous.pageIndex].indexOf(formatEmbeddedReviews(previous.reviews)));
                        capturedPages[previous.pageIndex] = removeEmbeddedReviews(
                            capturedPages[previous.pageIndex],
                            previous.reviews,
                        );
                        dedupAction = 'remove-from-previous-page';
                        logDiag({
                            phase: 'embedReview.dedup.removePrevious',
                            pageIndex,
                            previousPageIndex: previous.pageIndex,
                            entryIndex,
                            reviewCount: entry.reviews.length,
                            firstReview: entry.reviews[0]?.username,
                            beforeRemove,
                            previousPageTail: capturedPages[previous.pageIndex].slice(-120),
                        });
                    }
                }

                insertions.push({
                    index: entry.insertIndex,
                    text: formatEmbeddedReviews(entry.reviews),
                    duplicateKey,
                });
                reviewDedupState.set(duplicateKey, {
                    pageIndex,
                    reviews: entry.reviews,
                });

                logDiag({
                    phase: 'embedReview.insert',
                    pageIndex,
                    entryIndex,
                    insertIndex: entry.insertIndex,
                    dedupAction,
                    previousPageIndex: previous?.pageIndex ?? null,
                    reviewCount: entry.reviews.length,
                    firstReview: entry.reviews[0]?.username,
                    firstReviewContent: entry.reviews[0]?.content?.slice(0, 80),
                    debug: entry.debug,
                    contextAtInsert: snippetAround(text, entry.insertIndex),
                });
            });

            const result = insertions
                .sort((a, b) => b.index - a.index)
                .reduce((currentText, insertion) => (
                    `${currentText.slice(0, insertion.index)}${insertion.text}${currentText.slice(insertion.index)}`
                ), text);

            logDiag({
                phase: 'embedReview.pageDone',
                pageIndex,
                insertionCount: insertions.length,
                textLengthBefore: text.length,
                textLengthAfter: result.length,
            });

            return result;
        }

        async function collectCurrentPageReviewEntries(pageItems, itemEndOffsets, pageNumber, pageText, onProgress) {
            const containers = getCurrentPageReviewContainers();
            const triggers = getCurrentPageReviewTriggers();
            const entries = [];

            logDiag({
                phase: 'collectReviews.start',
                pageNumber,
                containers: containers.length,
                triggers: triggers.length,
                pageItemCount: pageItems.length,
                pageTextLength: pageText.length,
            });
            if (triggers.length === 0) return entries;

            for (let index = 0; index < containers.length; index += 1) {
                const clickTarget = getLastReviewTrigger(containers[index]);
                if (!clickTarget) continue;

                onProgress?.(index + 1, containers.length);

                const insertInfo = getReviewInsertInfo(clickTarget, pageItems, itemEndOffsets, pageText);
                const { insertIndex, debug: insertDebug } = insertInfo;

                const existingPanel = getActiveReviewPanel();
                if (existingPanel) {
                    await closeReviewPanel(existingPanel);
                    await sleep(getRandomReviewDelay());
                }

                clickReviewTrigger(clickTarget);

                const panel = await waitForReviewPanel();
                if (!panel) {
                    logDiag({
                        phase: 'collectReviews.panelMissing',
                        pageNumber,
                        itemIndex: index + 1,
                        insertDebug,
                    });
                    continue;
                }

                await sleep(getRandomReviewDelay());

                await loadAllReviewItems(panel);
                const reviews = collectReviewItems(panel);

                logDiag({
                    phase: 'collectReviews.item',
                    pageNumber,
                    itemIndex: index + 1,
                    total: containers.length,
                    insertIndex,
                    reviewCount: reviews.length,
                    firstReview: reviews[0]?.username,
                    firstReviewContent: reviews[0]?.content?.slice(0, 80),
                    insertDebug,
                });

                if (insertIndex >= 0 && reviews.length > 0) {
                    entries.push({ insertIndex, reviews, debug: insertDebug });
                } else {
                    logDiag({
                        phase: 'collectReviews.skip',
                        pageNumber,
                        itemIndex: index + 1,
                        reason: insertIndex < 0 ? '没有坐标插入点' : '评论为空',
                        insertIndex,
                        reviewCount: reviews.length,
                        insertDebug,
                    });
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
        let stopAfterCurrentPage = false;
        let fullCapturePages = [];
        let fullCaptureText = '';
        let fullCaptureReviewCount = 0;
        let fullCaptureFileName = '';

        document.getElementById('weread-full-capture')?.remove();
        document.getElementById('weread-copy-full-capture')?.remove();
        document.getElementById('weread-download-full-capture')?.remove();
        document.getElementById('weread-stop-full-capture')?.remove();

        const stopFullCaptureBtn = document.createElement('div');
        stopFullCaptureBtn.id = 'weread-stop-full-capture';
        stopFullCaptureBtn.textContent = '直接结束';
        Object.assign(stopFullCaptureBtn.style, {
            position: 'fixed',
            top: getNextFloatingTop(),
            right: '12px',
            zIndex: '2147483647',
            padding: '8px 16px',
            background: '#e53935',
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

        stopFullCaptureBtn.addEventListener('mouseenter', () => {
            if (stopFullCaptureBtn.style.display !== 'none') stopFullCaptureBtn.style.background = '#c62828';
        });
        stopFullCaptureBtn.addEventListener('mouseleave', () => {
            if (stopFullCaptureBtn.style.display !== 'none') stopFullCaptureBtn.style.background = '#e53935';
        });
        stopFullCaptureBtn.addEventListener('mousedown', () => stopFullCaptureBtn.style.transform = 'scale(0.95)');
        stopFullCaptureBtn.addEventListener('mouseup', () => stopFullCaptureBtn.style.transform = 'scale(1)');
        stopFullCaptureBtn.addEventListener('click', () => {
            if (!isFullCaptureRunning) return;
            stopAfterCurrentPage = true;
            stopFullCaptureBtn.textContent = '本页结束后停止';
            stopFullCaptureBtn.style.background = '#b71c1c';
            stopFullCaptureBtn.style.cursor = 'default';
        });

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

        const downloadFullBtn = document.createElement('div');
        downloadFullBtn.id = 'weread-download-full-capture';
        downloadFullBtn.textContent = '下载全文TXT';
        Object.assign(downloadFullBtn.style, {
            position: 'fixed',
            top: getNextFloatingTop(),
            right: '12px',
            zIndex: '2147483647',
            padding: '8px 16px',
            background: '#00897b',
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
            stopAfterCurrentPage = false;
            fullCapturePages = [];
            fullCaptureText = '';
            fullCaptureReviewCount = 0;
            fullCaptureFileName = '';
            const reviewDedupState = new Map();
            if (config.embedReviewsInFullCapture) beginFullCaptureDiag();
            copyFullBtn.style.display = 'none';
            downloadFullBtn.style.display = 'none';
            stopFullCaptureBtn.textContent = '直接结束';
            stopFullCaptureBtn.style.background = '#e53935';
            stopFullCaptureBtn.style.cursor = 'pointer';
            stopFullCaptureBtn.style.display = 'block';
            fullCaptureBtn.style.background = '#6a1b9a';

            while (true) {
                fullCaptureBtn.textContent = `读取第 ${fullCapturePages.length + 1} 页...`;

                const items = await requestCapture();
                const pageNumber = fullCapturePages.length + 1;
                const textData = buildTextData(items, pageNumber);
                let text = textData.text;
                await requestCapture('clear');

                if (text && config.embedReviewsInFullCapture) {
                    const pageIndex = fullCapturePages.length;
                    const reviewEntries = await collectCurrentPageReviewEntries(
                        items,
                        textData.itemEndOffsets,
                        pageNumber,
                        text,
                        (current, total) => {
                            fullCaptureBtn.textContent = `读取第 ${pageNumber} 页评论 ${current}/${total}...`;
                        },
                    );

                    text = embedReviewsInText(text, reviewEntries, reviewDedupState, pageIndex, fullCapturePages);
                    fullCaptureReviewCount = Array.from(reviewDedupState.values())
                        .reduce((total, entry) => total + entry.reviews.length, 0);
                    await requestCapture('clear');
                }

                if (text) {
                    fullCapturePages.push(text);
                }

                if (stopAfterCurrentPage) break;

                const nextBtn = document.querySelector('.renderTarget_pager_button_right');
                if (!nextBtn || nextBtn.parentElement?.style.display === 'none') break;

                nextBtn.click();
                const delay = getPageDelay();
                fullCaptureBtn.textContent = `等待翻页 ${Math.round(delay / 100) / 10}s...`;
                await sleep(delay);
                if (stopAfterCurrentPage) break;
            }

            isFullCaptureRunning = false;
            stopFullCaptureBtn.style.display = 'none';
            fullCaptureText = fullCapturePages.join('\n\n');
            await flushFullCaptureDiag();

            if (!fullCaptureText) {
                fullCaptureBtn.textContent = '未抓到内容';
                fullCaptureBtn.style.background = '#757575';
                setTimeout(() => {
                    fullCaptureBtn.textContent = '开始全文爬取';
                    fullCaptureBtn.style.background = '#8e24aa';
                }, config.uiFeedbackInfoDelayMs);
                return;
            }

            const bookTitle = getBookTitle();
            fullCaptureFileName = buildCaptureFileName(bookTitle);
            await saveCaptureHistory({
                id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
                title: bookTitle,
                fileName: fullCaptureFileName,
                text: fullCaptureText,
                pageCount: fullCapturePages.length,
                reviewCount: fullCaptureReviewCount,
                embedReviews: config.embedReviewsInFullCapture,
                createdAt: new Date().toISOString(),
                url: window.location.href,
            });

            fullCaptureBtn.textContent = config.embedReviewsInFullCapture
                ? `爬取完成(${fullCapturePages.length}页/${fullCaptureReviewCount}条评论)`
                : `爬取完成(${fullCapturePages.length}页)`;
            fullCaptureBtn.style.background = '#43a047';
            copyFullBtn.textContent = config.embedReviewsInFullCapture
                ? `复制全文(${fullCapturePages.length}页/${fullCaptureReviewCount}条评论)`
                : `复制全文(${fullCapturePages.length}页)`;
            copyFullBtn.style.display = 'block';
            downloadFullBtn.textContent = '下载全文TXT';
            downloadFullBtn.style.display = 'block';
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

        downloadFullBtn.addEventListener('mouseenter', () => {
            if (downloadFullBtn.textContent === '下载全文TXT') downloadFullBtn.style.background = '#00695c';
        });
        downloadFullBtn.addEventListener('mouseleave', () => {
            if (downloadFullBtn.textContent === '下载全文TXT') downloadFullBtn.style.background = '#00897b';
        });
        downloadFullBtn.addEventListener('mousedown', () => downloadFullBtn.style.transform = 'scale(0.95)');
        downloadFullBtn.addEventListener('mouseup', () => downloadFullBtn.style.transform = 'scale(1)');
        downloadFullBtn.addEventListener('click', () => {
            if (!fullCaptureText) return;

            downloadFullBtn.textContent = '下载中...';
            downloadFullBtn.style.background = '#00695c';
            const ok = downloadTextFile(fullCaptureFileName || buildCaptureFileName(getBookTitle()), fullCaptureText);
            downloadFullBtn.textContent = ok ? '已下载TXT' : '下载失败';
            downloadFullBtn.style.background = ok ? '#43a047' : '#e53935';
            setTimeout(() => {
                downloadFullBtn.textContent = '下载全文TXT';
                downloadFullBtn.style.background = '#00897b';
            }, config.uiFeedbackSuccessDelayMs);
        });

        document.body.appendChild(fullCaptureBtn);
        document.body.appendChild(stopFullCaptureBtn);
        document.body.appendChild(copyFullBtn);
        document.body.appendChild(downloadFullBtn);
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
