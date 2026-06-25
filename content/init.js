import { appState } from '../core/config.js';
import { createCaptureRequester } from './capture.js';
import { installCopyChaptersButton } from './copyChapters.js';
import { installCopyCurrentPageButton } from './copyCurrentPage.js';
import { installFullCaptureButtons } from './fullCapture.js';
import { installReadAloudButton } from './readAloud.js';
import { installCopyCommentsButton } from './reviews.js';
import { normalizeConfig } from './normalizeConfig.js';

function createFloatingTopGetter() {
    let floatingButtonIndex = 0;

    return function getNextFloatingTop() {
        const top = 12 + floatingButtonIndex * 40;
        floatingButtonIndex += 1;
        return `${top}px`;
    };
}

function removeInjectedButtons() {
    document.getElementById('weread-copy-current-page')?.remove();
    document.getElementById('weread-full-capture')?.remove();
    document.getElementById('weread-copy-full-capture')?.remove();
    document.getElementById('weread-download-full-capture')?.remove();
    document.getElementById('weread-stop-full-capture')?.remove();
    document.getElementById('weread-copy-chapters')?.remove();
    document.getElementById('weread-read-aloud')?.remove();
    document.getElementById('weread-read-aloud-panel')?.remove();
    document.querySelectorAll('.weread-copy-comments-toolbar-item').forEach((button) => button.remove());
}

function hasEnabledFeature(config) {
    return (
        config.showCopyCurrentPageButton
        || config.showFullCaptureButton
        || config.showChapterCopyButton
        || config.showCopyCommentsButton
        || config.showReadAloudButton
    );
}

export async function initWereadContent() {
    console.log('[weread] 复制按钮初始化');

    const config = normalizeConfig(await appState.domainConfigStorage.getValue());
    const requestCapture = createCaptureRequester(config);
    const getNextFloatingTop = createFloatingTopGetter();
    const installContext = { config, requestCapture, getNextFloatingTop };

    removeInjectedButtons();

    if (!hasEnabledFeature(config)) {
        console.log('[weread] 所有功能按钮均未启用，跳过');
        return;
    }

    if (config.showCopyCommentsButton) {
        installCopyCommentsButton(config);
        new MutationObserver(() => installCopyCommentsButton(config))
            .observe(document.body, { childList: true, subtree: true });
    }

    if (config.showCopyCurrentPageButton) {
        installCopyCurrentPageButton(installContext);
    }

    if (config.showFullCaptureButton) {
        installFullCaptureButtons(installContext);
    }

    if (config.showChapterCopyButton) {
        installCopyChaptersButton(installContext);
    }

    if (config.showReadAloudButton) {
        installReadAloudButton(installContext);
    }
}
