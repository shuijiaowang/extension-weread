import { bindHoverBackground, bindPressScale, copyText, createFloatingButton } from './shared.js';

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

export function installCopyChaptersButton({ config, getNextFloatingTop }) {
    const chapterBtn = createFloatingButton({
        id: 'weread-copy-chapters',
        text: '复制章节目录',
        top: getNextFloatingTop(),
        background: '#43a047',
    });

    bindHoverBackground(chapterBtn, '#43a047', '#2e7d32', () => chapterBtn.textContent === '复制章节目录');
    bindPressScale(chapterBtn);

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
