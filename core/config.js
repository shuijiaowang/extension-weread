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
    showReadAloudButton: true, //是否显示朗读本页按钮
    embedReviewsInReadAloud: false, //朗读本页时是否嵌入评论(口语格式)
    readAloudRate: 1.0, //朗读倍速
    fullCapturePageDelayMs: 2000, //翻页后等待时间
    reviewDelayMinMs: 800, //点击划线后等待(最短)
    reviewDelayMaxMs: 1200, //点击划线后等待(最长)
    nativeCopyReadDelayMs: 100, //复制后读取等待
    reviewPanelTimeoutMs: 1500, //评论弹窗加载超时
    reviewPanelPollIntervalMs: 80, //评论弹窗检测间隔
    reviewScrollDistance: 200, //评论列表每次滚动距离(px)
    reviewScrollMaxAttempts: 15, //评论列表滚动加载最大次数
    reviewScrollDelayMs: 200, //评论滚动后等待时间
    captureRequestTimeoutMs: 1000, //页面抓取超时时间
    uiFeedbackSuccessDelayMs: 1500, //复制成功提示持续
    uiFeedbackInfoDelayMs: 1200, //操作提示持续时间
};

export const MAX_CAPTURE_HISTORY = 20;

export const appState = {
    //--------该网站独有的存储属性-------
    domainConfigStorage : storage.defineItem(`local:wereadDomainConfig`, {
        fallback: DEFAULT_DOMAIN_CONFIG //不存在则返回默认值
    }),
    captureHistoryStorage: storage.defineItem(`local:wereadCaptureHistory`, {
        fallback: [],
    }),
    domainConfig: {
        isPluginEnabled: false, //是否启用插件
        showCopyCurrentPageButton: false, //是否显示复制本页文字按钮
        showFullCaptureButton: false, //是否显示全文爬取按钮
        embedReviewsInFullCapture: DEFAULT_DOMAIN_CONFIG.embedReviewsInFullCapture,
        showChapterCopyButton: false, //是否显示复制章节目录按钮
        showCopyCommentsButton: false, //是否显示评论复制按钮
        showReadAloudButton: false,
        embedReviewsInReadAloud: DEFAULT_DOMAIN_CONFIG.embedReviewsInReadAloud,
        readAloudRate: DEFAULT_DOMAIN_CONFIG.readAloudRate,
        fullCapturePageDelayMs: DEFAULT_DOMAIN_CONFIG.fullCapturePageDelayMs,
        reviewDelayMinMs: DEFAULT_DOMAIN_CONFIG.reviewDelayMinMs,
        reviewDelayMaxMs: DEFAULT_DOMAIN_CONFIG.reviewDelayMaxMs,
        nativeCopyReadDelayMs: DEFAULT_DOMAIN_CONFIG.nativeCopyReadDelayMs,
        reviewPanelTimeoutMs: DEFAULT_DOMAIN_CONFIG.reviewPanelTimeoutMs,
        reviewPanelPollIntervalMs: DEFAULT_DOMAIN_CONFIG.reviewPanelPollIntervalMs,
        reviewScrollDistance: DEFAULT_DOMAIN_CONFIG.reviewScrollDistance,
        reviewScrollMaxAttempts: DEFAULT_DOMAIN_CONFIG.reviewScrollMaxAttempts,
        reviewScrollDelayMs: DEFAULT_DOMAIN_CONFIG.reviewScrollDelayMs,
        captureRequestTimeoutMs: DEFAULT_DOMAIN_CONFIG.captureRequestTimeoutMs,
        uiFeedbackSuccessDelayMs: DEFAULT_DOMAIN_CONFIG.uiFeedbackSuccessDelayMs,
        uiFeedbackInfoDelayMs: DEFAULT_DOMAIN_CONFIG.uiFeedbackInfoDelayMs,
    },
    saveDomainConfig:async () => {
        await appState.domainConfigStorage.setValue(appState.domainConfig)
    }
};
