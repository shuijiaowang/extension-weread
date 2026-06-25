import {
    chooseAnchorItem,
    estimateCharWidth,
    findCanvasForViewportRect,
    findCanvasIdForElement,
    getLinePreview,
    isItemInLocalRect,
    logDiag,
    snippetAround,
    summarizeCaptureItem,
    viewportRectToCanvasLocal,
} from './capture.js';
import { copyText, isInteractableElement, isVisibleElement, sleep, summarizeRect } from './shared.js';

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

async function getOriginalTextByNativeCopy(nativeCopyButton, config) {
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

async function loadAllReviewItems(panel, config) {
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

function getActiveReviewPanel() {
    const panels = Array.from(document.querySelectorAll('.float_panel_position_wrapper'))
        .filter((panel) => (
            isVisibleElement(panel)
            && panel.querySelector('.review_section_toolbar_item_copy')
            && panel.querySelector('.reader_floatReviewsPanel_list_wrapper')
        ));

    return panels.at(-1) || null;
}

async function waitForReviewPanel(config, timeoutMs) {
    const timeout = timeoutMs ?? config.reviewPanelTimeoutMs;
    const start = Date.now();

    while (Date.now() - start < timeout) {
        const panel = getActiveReviewPanel();
        if (panel) return panel;
        await sleep(config.reviewPanelPollIntervalMs);
    }

    return null;
}

async function waitForReviewPanelClosed(config, timeoutMs) {
    const timeout = timeoutMs ?? config.reviewPanelTimeoutMs;
    const start = Date.now();

    while (Date.now() - start < timeout) {
        if (!getActiveReviewPanel()) return true;
        await sleep(config.reviewPanelPollIntervalMs);
    }

    return false;
}

async function closeReviewPanel(panel, config) {
    const closeBtn = panel?.querySelector('.reader_float_panel_header_closeBtn');
    if (!closeBtn) {
        console.warn('[weread] 未找到评论弹窗关闭按钮');
        return false;
    }

    closeBtn.click();
    return waitForReviewPanelClosed(config);
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

export function formatSpokenReviews(reviews, includeUsername = true) {
    const parts = reviews.map((review) => {
        const content = review.content || '';
        if (!includeUsername) return content;
        const username = review.username || '匿名';
        return `${username}说，${content}`;
    });
    return `评论，${parts.join('；')}`;
}

export function formatEmbeddedReviews(reviews, includeUsername = true) {
    const content = reviews
        .map((review, index) => {
            const prefix = reviews.length > 1 ? `${index + 1}. ` : '';
            const reviewContent = review.content || '';
            if (!includeUsername) return `${prefix}${reviewContent}`;
            const username = review.username || '匿名';
            return `${prefix}${username}：${reviewContent}`;
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

function removeEmbeddedReviews(text, reviews, reviewFormatter = formatEmbeddedReviews) {
    const embeddedText = reviewFormatter(reviews);
    const index = text.indexOf(embeddedText);
    if (index < 0) return text;

    return `${text.slice(0, index)}${text.slice(index + embeddedText.length)}`;
}

export function embedReviewsInText(text, reviewEntries, reviewDedupState, pageIndex, capturedPages, reviewFormatter = formatEmbeddedReviews) {
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
                const beforeRemove = snippetAround(capturedPages[previous.pageIndex], capturedPages[previous.pageIndex].indexOf(reviewFormatter(previous.reviews)));
                capturedPages[previous.pageIndex] = removeEmbeddedReviews(
                    capturedPages[previous.pageIndex],
                    previous.reviews,
                    reviewFormatter,
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
            text: reviewFormatter(entry.reviews),
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

function getReviewDelay(config) {
    return config.reviewDelayMs;
}

export async function collectCurrentPageReviewEntries(pageItems, itemEndOffsets, pageNumber, pageText, onProgress, config) {
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
            await closeReviewPanel(existingPanel, config);
            await sleep(getReviewDelay(config));
        }

        clickReviewTrigger(clickTarget);

        const panel = await waitForReviewPanel(config);
        if (!panel) {
            logDiag({
                phase: 'collectReviews.panelMissing',
                pageNumber,
                itemIndex: index + 1,
                insertDebug,
            });
            continue;
        }

        await sleep(getReviewDelay(config));

        await loadAllReviewItems(panel, config);
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

        const closed = await closeReviewPanel(panel, config);
        if (!closed) {
            console.warn('[weread] 评论弹窗关闭失败', index + 1);
        }

        await sleep(getReviewDelay(config));
    }

    return entries;
}

async function copyReviews(panel, button, nativeCopyButton, config) {
    setToolbarButtonText(button, '加载中...');
    button.style.pointerEvents = 'none';

    const originalText = await getOriginalTextByNativeCopy(nativeCopyButton, config);
    await loadAllReviewItems(panel, config);

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

export function installCopyCommentsButton(config) {
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

            await copyReviews(panel, button, nativeCopyButton, config);
        });

        nativeCopyButton.insertAdjacentElement('afterend', button);
    });
}
