import { appState, MAX_CAPTURE_HISTORY } from '../core/config.js';
import { beginFullCaptureDiag, buildTextData, flushFullCaptureDiag } from './capture.js';
import {
    dedupeCapturePages,
    formatCaptureRecordText,
    getCaptureReviewCount,
    hasCaptureReviews,
} from './captureExport.js';
import { normalizeConfig } from './normalizeConfig.js';
import { collectCurrentPageReviewEntries } from './reviews.js';
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

function buildCaptureSummary(pageCount, reviewCount) {
    return reviewCount > 0
        ? `${pageCount}页/${reviewCount}条评论`
        : `${pageCount}页`;
}

function createModalCheckbox(labelText, checked, disabled = false) {
    const label = document.createElement('label');
    Object.assign(label.style, {
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        fontSize: '14px',
        color: disabled ? '#9ca3af' : '#374151',
        cursor: disabled ? 'not-allowed' : 'pointer',
    });

    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = checked;
    input.disabled = disabled;
    input.style.accentColor = '#2563eb';

    const text = document.createElement('span');
    text.textContent = labelText;

    label.appendChild(input);
    label.appendChild(text);
    return { label, input };
}

function promptCaptureExportOptions(record, defaultIncludeReviewUsername) {
    return new Promise((resolve) => {
        const hasReviews = hasCaptureReviews(record);
        const overlay = document.createElement('div');
        Object.assign(overlay.style, {
            position: 'fixed',
            inset: '0',
            zIndex: '2147483647',
            background: 'rgba(15, 23, 42, 0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
        });

        const dialog = document.createElement('div');
        Object.assign(dialog.style, {
            width: 'min(360px, 100%)',
            background: '#fff',
            borderRadius: '12px',
            boxShadow: '0 24px 64px rgba(15, 23, 42, 0.24)',
            padding: '16px',
            color: '#111827',
            fontFamily: 'system-ui, sans-serif',
        });

        const title = document.createElement('h3');
        title.textContent = '导出选项';
        Object.assign(title.style, {
            margin: '0 0 6px',
            fontSize: '16px',
        });

        const hint = document.createElement('p');
        hint.textContent = hasReviews
            ? '评论数据已保存在本次抓取结果里，确认前可决定是否导出。'
            : '本次抓取未包含评论数据，将只导出正文。';
        Object.assign(hint.style, {
            margin: '0 0 14px',
            fontSize: '12px',
            lineHeight: '1.5',
            color: '#6b7280',
        });

        const fields = document.createElement('div');
        Object.assign(fields.style, {
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
        });

        const includeReviewsField = createModalCheckbox('导出内嵌评论', hasReviews, !hasReviews);
        const includeUsernameField = createModalCheckbox('展示用户名', defaultIncludeReviewUsername, !hasReviews);

        const maxLengthRow = document.createElement('label');
        Object.assign(maxLengthRow.style, {
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            fontSize: '14px',
            color: '#374151',
        });
        const maxLengthText = document.createElement('span');
        maxLengthText.textContent = '评论最多字数';
        const maxLengthControl = document.createElement('div');
        Object.assign(maxLengthControl.style, {
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
        });
        const maxLengthInput = document.createElement('input');
        maxLengthInput.type = 'number';
        maxLengthInput.min = '0';
        maxLengthInput.step = '1';
        maxLengthInput.value = '0';
        Object.assign(maxLengthInput.style, {
            width: '72px',
            padding: '6px 8px',
            border: '1px solid #d1d5db',
            borderRadius: '8px',
            textAlign: 'right',
            fontSize: '13px',
        });
        const maxLengthUnit = document.createElement('span');
        maxLengthUnit.textContent = '0=不限';
        maxLengthUnit.style.fontSize = '11px';
        maxLengthUnit.style.color = '#9ca3af';
        maxLengthControl.appendChild(maxLengthInput);
        maxLengthControl.appendChild(maxLengthUnit);
        maxLengthRow.appendChild(maxLengthText);
        maxLengthRow.appendChild(maxLengthControl);

        fields.appendChild(includeReviewsField.label);
        fields.appendChild(includeUsernameField.label);
        fields.appendChild(maxLengthRow);

        const actions = document.createElement('div');
        Object.assign(actions.style, {
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '8px',
            marginTop: '16px',
        });

        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = '取消';
        Object.assign(cancelBtn.style, {
            padding: '7px 12px',
            border: 'none',
            borderRadius: '8px',
            background: '#f3f4f6',
            color: '#374151',
            cursor: 'pointer',
        });

        const confirmBtn = document.createElement('button');
        confirmBtn.textContent = '确认';
        Object.assign(confirmBtn.style, {
            padding: '7px 12px',
            border: 'none',
            borderRadius: '8px',
            background: '#2563eb',
            color: '#fff',
            cursor: 'pointer',
        });

        function updateReviewFields() {
            const enabled = hasReviews && includeReviewsField.input.checked;
            includeUsernameField.input.disabled = !enabled;
            includeUsernameField.label.style.color = enabled ? '#374151' : '#9ca3af';
            includeUsernameField.label.style.cursor = enabled ? 'pointer' : 'not-allowed';
            maxLengthInput.disabled = !enabled;
            maxLengthRow.style.color = enabled ? '#374151' : '#9ca3af';
            maxLengthInput.style.background = enabled ? '#fff' : '#f3f4f6';
            maxLengthInput.style.color = enabled ? '#111827' : '#9ca3af';
        }

        function cleanup(result) {
            overlay.remove();
            document.removeEventListener('keydown', onKeydown);
            resolve(result);
        }

        function onKeydown(event) {
            if (event.key === 'Escape') cleanup(null);
        }

        includeReviewsField.input.addEventListener('change', updateReviewFields);
        cancelBtn.addEventListener('click', () => cleanup(null));
        confirmBtn.addEventListener('click', () => cleanup({
            includeReviews: hasReviews && includeReviewsField.input.checked,
            includeReviewUsername: includeUsernameField.input.checked,
            reviewMaxLength: Number(maxLengthInput.value) || 0,
        }));
        overlay.addEventListener('click', (event) => {
            if (event.target === overlay) cleanup(null);
        });

        actions.appendChild(cancelBtn);
        actions.appendChild(confirmBtn);
        dialog.appendChild(title);
        dialog.appendChild(hint);
        dialog.appendChild(fields);
        dialog.appendChild(actions);
        overlay.appendChild(dialog);
        document.body.appendChild(overlay);
        document.addEventListener('keydown', onKeydown);

        updateReviewFields();
    });
}

export function installFullCaptureButtons({ config, getNextFloatingTop, requestCapture }) {
    let isFullCaptureRunning = false;
    let stopAfterCurrentPage = false;
    let fullCapturePages = [];
    let fullCaptureRecord = null;
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
        fullCaptureRecord = null;
        fullCaptureText = '';
        fullCaptureReviewCount = 0;
        fullCaptureFileName = '';
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
            const text = textData.text;
            await requestCapture('clear');

            const pageRecord = {
                pageNumber,
                text,
                reviewEntries: [],
            };

            if (text && config.embedReviewsInFullCapture) {
                pageRecord.reviewEntries = await collectCurrentPageReviewEntries(
                    items,
                    textData.itemEndOffsets,
                    pageNumber,
                    text,
                    (current, total) => {
                        fullCaptureBtn.textContent = `读取第 ${pageNumber} 页评论 ${current}/${total}...`;
                    },
                    config,
                );
                await requestCapture('clear');
            }

            if (text) {
                fullCapturePages.push(pageRecord);
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
        const structuredPages = dedupeCapturePages(fullCapturePages);
        fullCaptureReviewCount = getCaptureReviewCount({ pages: structuredPages });
        fullCaptureRecord = {
            id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
            title: getBookTitle(),
            fileName: '',
            pages: structuredPages,
            pageCount: structuredPages.length,
            reviewCount: fullCaptureReviewCount,
            embedReviews: config.embedReviewsInFullCapture,
            createdAt: new Date().toISOString(),
            url: window.location.href,
        };
        fullCaptureText = formatCaptureRecordText(fullCaptureRecord, {
            includeReviews: config.embedReviewsInFullCapture,
            includeReviewUsername: config.includeReviewUsername,
        });
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

        fullCaptureFileName = buildCaptureFileName(fullCaptureRecord.title);
        fullCaptureRecord.fileName = fullCaptureFileName;
        fullCaptureRecord.text = fullCaptureText;
        await saveCaptureHistory(fullCaptureRecord);

        const summary = buildCaptureSummary(fullCaptureRecord.pageCount, fullCaptureReviewCount);
        fullCaptureBtn.textContent = `爬取完成(${summary})`;
        fullCaptureBtn.style.background = '#43a047';
        copyFullBtn.textContent = `复制全文(${summary})`;
        copyFullBtn.style.display = 'block';
        downloadFullBtn.textContent = '下载全文TXT';
        downloadFullBtn.style.display = 'block';
    });

    copyFullBtn.addEventListener('click', async () => {
        if (!fullCaptureRecord) return;

        const exportOptions = await promptCaptureExportOptions(fullCaptureRecord, config.includeReviewUsername);
        if (!exportOptions) return;

        copyFullBtn.textContent = '复制中...';
        copyFullBtn.style.background = '#ef6c00';
        const exportText = formatCaptureRecordText(fullCaptureRecord, exportOptions);
        const ok = await copyText(exportText);
        copyFullBtn.textContent = ok ? '已复制全文' : '复制失败';
        copyFullBtn.style.background = ok ? '#43a047' : '#e53935';
        setTimeout(() => {
            copyFullBtn.textContent = `复制全文(${buildCaptureSummary(fullCaptureRecord.pageCount, fullCaptureReviewCount)})`;
            copyFullBtn.style.background = '#f57c00';
        }, config.uiFeedbackSuccessDelayMs);
    });

    downloadFullBtn.addEventListener('click', async () => {
        if (!fullCaptureRecord) return;

        const exportOptions = await promptCaptureExportOptions(fullCaptureRecord, config.includeReviewUsername);
        if (!exportOptions) return;

        downloadFullBtn.textContent = '下载中...';
        downloadFullBtn.style.background = '#00695c';
        const exportText = formatCaptureRecordText(fullCaptureRecord, exportOptions);
        const ok = downloadTextFile(
            fullCaptureFileName || buildCaptureFileName(getBookTitle()),
            exportText,
        );
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
