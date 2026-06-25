import { copyText, summarizeRect } from './shared.js';

const CAPTURE_TEST_LINE = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ`~1!2@3#4$5%6^7&8*9(0)-_=+[{]}|;:\',<.>/?';
const MIN_COLUMN_ITEM_COUNT = 10;

let fullCaptureDiagLines = null;

export function beginFullCaptureDiag() {
    fullCaptureDiagLines = [];
}

export function logDiag(entry) {
    fullCaptureDiagLines?.push(entry);
}

export async function flushFullCaptureDiag() {
    if (!fullCaptureDiagLines?.length) return;

    const text = JSON.stringify(fullCaptureDiagLines, null, 2);
    console.log(`\n========== WEREAD 全文爬取诊断日志 ==========\n${text}\n========== 结束（已复制到剪贴板） ==========`);
    await copyText(text);
    fullCaptureDiagLines = null;
}

export function snippetAround(text, index, radius = 48) {
    if (!text || index < 0) return '';
    const start = Math.max(0, index - radius);
    const end = Math.min(text.length, index + radius);
    return `${start > 0 ? '…' : ''}${text.slice(start, end)}${end < text.length ? '…' : ''}`;
}

export function summarizeCaptureItem(item) {
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

function previewLineItems(lineItems, maxLen = 80) {
    const text = lineItems.map((item) => item.text).join('');
    return text.length > maxLen ? `${text.slice(0, maxLen)}…` : text;
}

export function getLinePreview(items, itemEndOffsets, index) {
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

export function getReaderCanvases() {
    return Array.from(document.querySelectorAll('canvas'))
        .filter((canvas) => {
            const rect = canvas.getBoundingClientRect();
            return rect.width > 80 && rect.height > 80;
        })
        .sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left);
}

export function resolveCanvasIdMap(pageItems) {
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

export function findCanvasIdForElement(canvasEl, pageItems) {
    const idToCanvas = resolveCanvasIdMap(pageItems);
    for (const [canvasId, canvas] of idToCanvas.entries()) {
        if (canvas === canvasEl) return canvasId;
    }
    return null;
}

export function viewportRectToCanvasLocal(rect, canvasEl) {
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

export function isItemInLocalRect(item, localRect) {
    return (
        item.x >= localRect.left - 4
        && item.x <= localRect.right + 4
        && item.y >= localRect.top - 12
        && item.y <= localRect.bottom + 12
    );
}

export function estimateCharWidth(lineItems) {
    if (!lineItems || lineItems.length < 2) return 24;

    const gaps = [];
    for (let i = 1; i < lineItems.length; i += 1) {
        const gap = lineItems[i].x - lineItems[i - 1].x;
        if (gap > 0) gaps.push(gap);
    }
    if (!gaps.length) return 24;

    gaps.sort((a, b) => a - b);
    return gaps[Math.floor(gaps.length / 2)];
}

export function chooseAnchorItem(matchedItems, localRect) {
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

export function findCanvasForViewportRect(rect) {
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

export function buildTextData(items, pageNumber = null) {
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

export function buildText(items) {
    return buildTextData(items).text;
}

export function createCaptureRequester(config) {
    return function requestCapture(cmd = 'get') {
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
    };
}
