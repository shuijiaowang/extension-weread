import { appState, MAX_CAPTURE_HISTORY } from '../core/config.js';
import { beginFullCaptureDiag, buildTextData, flushFullCaptureDiag } from './capture.js';
import { normalizeConfig } from './normalizeConfig.js';
import { collectCurrentPageReviewEntries, embedReviewsInText } from './reviews.js';
import {
    bindHoverBackground,
    bindPressScale,
    buildCaptureFileName,
    copyText,
    createFloatingButton,
    downloadTextFile,
    getBookTitle,
    sleep,
} from './shared.js';

async function saveCaptureHistory(record) {
    const history = await appState.captureHistoryStorage.getValue();
    const nextHistory = [record, ...history].slice(0, MAX_CAPTURE_HISTORY);
    await appState.captureHistoryStorage.setValue(nextHistory);
}

export function installFullCaptureButtons({ config, getNextFloatingTop, requestCapture }) {
    let isFullCaptureRunning = false;
    let stopAfterCurrentPage = false;
    let fullCapturePages = [];
    let fullCaptureText = '';
    let fullCaptureReviewCount = 0;
    let fullCaptureFileName = '';

    const stopFullCaptureBtn = createFloatingButton({
        id: 'weread-stop-full-capture',
        text: '直接结束',
        top: getNextFloatingTop(),
        background: '#e53935',
        display: 'none',
    });
    const fullCaptureBtn = createFloatingButton({
        id: 'weread-full-capture',
        text: '开始全文爬取',
        top: getNextFloatingTop(),
        background: '#8e24aa',
    });
    const copyFullBtn = createFloatingButton({
        id: 'weread-copy-full-capture',
        text: '复制全文',
        top: getNextFloatingTop(),
        background: '#f57c00',
        display: 'none',
    });
    const downloadFullBtn = createFloatingButton({
        id: 'weread-download-full-capture',
        text: '下载全文TXT',
        top: getNextFloatingTop(),
        background: '#00897b',
        display: 'none',
    });

    bindHoverBackground(stopFullCaptureBtn, '#e53935', '#c62828', () => stopFullCaptureBtn.style.display !== 'none');
    bindHoverBackground(fullCaptureBtn, '#8e24aa', '#6a1b9a', () => !isFullCaptureRunning);
    bindHoverBackground(copyFullBtn, '#f57c00', '#ef6c00', () => copyFullBtn.textContent.startsWith('复制全文'));
    bindHoverBackground(downloadFullBtn, '#00897b', '#00695c', () => downloadFullBtn.textContent === '下载全文TXT');
    [stopFullCaptureBtn, fullCaptureBtn, copyFullBtn, downloadFullBtn].forEach(bindPressScale);

    stopFullCaptureBtn.addEventListener('click', () => {
        if (!isFullCaptureRunning) return;
        stopAfterCurrentPage = true;
        stopFullCaptureBtn.textContent = '本页结束后停止';
        stopFullCaptureBtn.style.background = '#b71c1c';
        stopFullCaptureBtn.style.cursor = 'default';
    });

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
                    config,
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
            const delay = config.fullCapturePageDelayMs;
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
