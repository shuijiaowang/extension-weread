// core/config.js
export const APP_CONFIG = {
    // 快捷键配置
    KEYBOARD: {},
    // UI配置
    UI: {}
};
// ... (保留 DEFAULT_DOMAIN_CONFIG) ...
export const DEFAULT_DOMAIN_CONFIG = {
    pluginEnabled: false,
    showCopyCurrentPageButton: true, //是否显示复制本页文字按钮
    showFullCaptureButton: true, //是否显示全文爬取按钮
    embedReviewsInFullCapture: false, //全文爬取时是否嵌入评论
    showChapterCopyButton: true, //是否显示复制章节目录按钮
    showCopyCommentsButton: true, //是否显示评论复制按钮
    fullCapturePageDelayMs: 1500, //全文爬取翻页等待时间
};
export const appState = {
    //--------该网站独有的存储属性-------
    domainConfigStorage : storage.defineItem(`local:wereadDomainConfig`, {
        fallback: DEFAULT_DOMAIN_CONFIG //不存在则返回默认值
    }),
    domainConfig: {
        isPluginEnabled: false, //是否启用插件
        showCopyCurrentPageButton: false, //是否显示复制本页文字按钮
        showFullCaptureButton: false, //是否显示全文爬取按钮
        embedReviewsInFullCapture: DEFAULT_DOMAIN_CONFIG.embedReviewsInFullCapture,
        showChapterCopyButton: false, //是否显示复制章节目录按钮
        showCopyCommentsButton: false, //是否显示评论复制按钮
        fullCapturePageDelayMs: DEFAULT_DOMAIN_CONFIG.fullCapturePageDelayMs,
    },
    saveDomainConfig:async () => {
        await appState.domainConfigStorage.setValue(appState.domainConfig)
    }
};
