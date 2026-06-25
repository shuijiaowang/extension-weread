<script setup>
import { reactive, ref, onMounted } from 'vue';
import { appState, DEFAULT_DOMAIN_CONFIG } from '../../core/config.js';

const config = reactive({ ...DEFAULT_DOMAIN_CONFIG });
const isReady = ref(false);
const saveTip = ref('');
const showDelaySettings = ref(false);
const captureHistory = ref([]);
let saveTipTimer = null;

const DELAY_FIELDS = [
    { key: 'fullCapturePageDelayMs', label: '翻页后等待时间', step: 100, unit: '毫秒' },
    { key: 'reviewDelayMinMs', label: '点击划线后等待(最短)', step: 10, unit: '毫秒' },
    { key: 'reviewDelayMaxMs', label: '点击划线后等待(最长)', step: 10, unit: '毫秒' },
    { key: 'nativeCopyReadDelayMs', label: '复制后读取等待', step: 10, unit: '毫秒' },
    { key: 'reviewPanelTimeoutMs', label: '评论弹窗加载超时', step: 100, unit: '毫秒' },
    { key: 'reviewPanelPollIntervalMs', label: '评论弹窗检测间隔', step: 10, unit: '毫秒' },
    { key: 'reviewScrollDistance', label: '评论每次滚动距离', step: 50, unit: '像素' },
    { key: 'reviewScrollMaxAttempts', label: '评论滚动加载最大次数', step: 1, unit: '次' },
    { key: 'reviewScrollDelayMs', label: '评论滚动后等待时间', step: 50, unit: '毫秒' },
    { key: 'captureRequestTimeoutMs', label: '页面抓取超时时间', step: 100, unit: '毫秒' },
    { key: 'uiFeedbackSuccessDelayMs', label: '复制成功提示持续', step: 100, unit: '毫秒' },
    { key: 'uiFeedbackInfoDelayMs', label: '操作提示持续时间', step: 100, unit: '毫秒' },
];

function normalizeConfig(value = {}) {
    const result = { ...DEFAULT_DOMAIN_CONFIG, ...value };
    for (const field of DELAY_FIELDS) {
        result[field.key] = normalizeDelay(value[field.key], DEFAULT_DOMAIN_CONFIG[field.key]);
    }
    return result;
}

function normalizeDelay(value, fallback) {
    const delay = Number(value);
    if (!Number.isFinite(delay)) return fallback;

    return Math.max(0, Math.round(delay));
}

onMounted(async () => {
    Object.assign(config, normalizeConfig(await appState.domainConfigStorage.getValue()));
    captureHistory.value = await appState.captureHistoryStorage.getValue();
    isReady.value = true;
});

async function saveConfig() {
    for (const field of DELAY_FIELDS) {
        config[field.key] = normalizeDelay(config[field.key], DEFAULT_DOMAIN_CONFIG[field.key]);
    }
    await appState.domainConfigStorage.setValue({ ...config });

    saveTip.value = '已保存';
    clearTimeout(saveTipTimer);
    saveTipTimer = setTimeout(() => {
        saveTip.value = '';
    }, 1200);
}

function formatDateTime(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '未知时间';
    return date.toLocaleString('zh-CN', { hour12: false });
}

function getHistorySummary(record) {
    if (record.embedReviews) {
        return `${record.pageCount || 0} 页 / ${record.reviewCount || 0} 条评论`;
    }
    return `${record.pageCount || 0} 页`;
}

function getPreviewText(text) {
    return String(text ?? '').slice(0, 120).trim();
}

function downloadHistoryRecord(record) {
    const blob = new Blob([record.text || ''], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = record.fileName || `${record.title || 'weread'}.txt`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function copyHistoryRecord(record) {
    await navigator.clipboard.writeText(record.text || '');
}

async function clearHistory() {
    await appState.captureHistoryStorage.setValue([]);
    captureHistory.value = [];
}
</script>

<template>
    <div class="popup-panel">
        <header class="popup-header">
            <div>
                <h1>微信读书复制助手</h1>
                <p>选择要在阅读页显示的功能按钮</p>
            </div>
            <span v-if="saveTip" class="save-tip">{{ saveTip }}</span>
        </header>

        <div v-if="isReady" class="config-card">
            <label class="config-item">
                <input type="checkbox" v-model="config.showCopyCurrentPageButton" @change="saveConfig" />
                <span>启用复制本页文字</span>
            </label>

            <label class="config-item">
                <input type="checkbox" v-model="config.showFullCaptureButton" @change="saveConfig" />
                <span>启用全文爬取</span>
            </label>

            <label class="config-item config-sub-item">
                <input
                    type="checkbox"
                    v-model="config.embedReviewsInFullCapture"
                    :disabled="!config.showFullCaptureButton"
                    @change="saveConfig"
                />
                <span>全文爬取 &gt; 是否嵌入评论</span>
            </label>

            <label class="config-item">
                <input type="checkbox" v-model="config.showChapterCopyButton" @change="saveConfig" />
                <span>启用复制章节目录</span>
            </label>

            <label class="config-item">
                <input type="checkbox" v-model="config.showCopyCommentsButton" @change="saveConfig" />
                <span>启用评论复制</span>
            </label>

            <div class="delay-config">
                <div class="delay-config-header">
                    <label for="delay-toggle" class="delay-toggle-label">
                        <span>延迟时间配置</span>
                    </label>
                    <button id="delay-toggle" class="delay-toggle-btn" @click="showDelaySettings = !showDelaySettings">
                        {{ showDelaySettings ? '收起' : '展开' }}
                    </button>
                </div>
                <div v-show="showDelaySettings" class="delay-fields">
                    <div v-for="field in DELAY_FIELDS" :key="field.key" class="delay-field">
                        <label :for="field.key">{{ field.label }}</label>
                        <div class="delay-input">
                            <input
                                :id="field.key"
                                type="number"
                                min="0"
                                :step="field.step"
                                v-model.number="config[field.key]"
                                @change="saveConfig"
                            />
                            <span>{{ field.unit }}</span>
                        </div>
                    </div>
                </div>
            </div>

            <section class="history-card">
                <div class="history-header">
                    <div>
                        <strong>历史爬取记录</strong>
                        <p>保存最近全文爬取结果，可直接下载 txt</p>
                    </div>
                    <button
                        class="history-clear-btn"
                        :disabled="captureHistory.length === 0"
                        @click="clearHistory"
                    >
                        清空
                    </button>
                </div>

                <div v-if="captureHistory.length === 0" class="history-empty">
                    暂无历史记录，请先在阅读页执行全文爬取。
                </div>

                <div v-else class="history-list">
                    <details v-for="record in captureHistory" :key="record.id" class="history-item">
                        <summary class="history-summary">
                            <div class="history-main">
                                <strong>{{ record.title || '未命名书籍' }}</strong>
                                <span>{{ getHistorySummary(record) }}</span>
                            </div>
                            <time>{{ formatDateTime(record.createdAt) }}</time>
                        </summary>

                        <p class="history-preview">{{ getPreviewText(record.text) || '无内容预览' }}</p>

                        <div class="history-actions">
                            <button class="history-action-btn" @click="downloadHistoryRecord(record)">下载 TXT</button>
                            <button class="history-action-btn secondary" @click="copyHistoryRecord(record)">复制内容</button>
                        </div>
                    </details>
                </div>
            </section>
        </div>

        <div v-else class="loading">加载配置中...</div>
    </div>
</template>

<style scoped>
.popup-panel {
    width: 320px;
    box-sizing: border-box;
    padding: 16px;
    color: #1f2937;
    background: #ffffff;
}

.popup-header {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 14px;
}

.popup-header h1 {
    margin: 0;
    font-size: 18px;
    line-height: 1.3;
}

.popup-header p {
    margin: 4px 0 0;
    color: #6b7280;
    font-size: 12px;
}

.save-tip {
    flex: 0 0 auto;
    align-self: flex-start;
    padding: 2px 8px;
    color: #15803d;
    background: #dcfce7;
    border-radius: 999px;
    font-size: 12px;
}

.config-card {
    display: grid;
    gap: 10px;
}

.config-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 12px;
    background: #f8fafc;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    font-size: 14px;
    cursor: pointer;
    user-select: none;
}

.config-item input {
    width: 16px;
    height: 16px;
}

.config-sub-item {
    margin-left: 18px;
    background: #ffffff;
}

.config-sub-item:has(input:disabled) {
    color: #9ca3af;
    cursor: not-allowed;
}

.delay-config {
    padding: 12px;
    background: #f8fafc;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    text-align: left;
}

.delay-config-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
}

.delay-toggle-label span {
    font-size: 14px;
    font-weight: 500;
}

.delay-toggle-btn {
    padding: 2px 10px;
    font-size: 12px;
    color: #6b7280;
    background: #e5e7eb;
    border: none;
    border-radius: 4px;
    cursor: pointer;
}

.delay-toggle-btn:hover {
    background: #d1d5db;
}

.delay-fields {
    display: grid;
    gap: 8px;
    margin-top: 10px;
}

.delay-field {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
}

.delay-field label {
    font-size: 13px;
    color: #374151;
    flex-shrink: 0;
}

.delay-input {
    display: flex;
    align-items: center;
    gap: 8px;
}

.delay-input input {
    width: 120px;
    box-sizing: border-box;
    padding: 6px 8px;
    color: #111827;
    background: #ffffff;
    border: 1px solid #d1d5db;
    border-radius: 6px;
}

.delay-input span,
.loading {
    color: #6b7280;
    font-size: 12px;
}

.history-card {
    padding: 12px;
    background: #f8fafc;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
}

.history-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 8px;
    margin-bottom: 10px;
}

.history-header p {
    margin: 4px 0 0;
    color: #6b7280;
    font-size: 12px;
}

.history-clear-btn,
.history-action-btn {
    border: none;
    border-radius: 6px;
    cursor: pointer;
}

.history-clear-btn {
    padding: 6px 10px;
    color: #374151;
    background: #e5e7eb;
    font-size: 12px;
}

.history-clear-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
}

.history-empty {
    color: #6b7280;
    font-size: 12px;
}

.history-list {
    display: grid;
    gap: 8px;
}

.history-item {
    padding: 10px;
    background: #fff;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
}

.history-summary {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    cursor: pointer;
    list-style: none;
}

.history-summary::-webkit-details-marker {
    display: none;
}

.history-main {
    display: grid;
    gap: 4px;
}

.history-main strong {
    font-size: 13px;
}

.history-main span,
.history-summary time,
.history-preview {
    color: #6b7280;
    font-size: 12px;
}

.history-preview {
    margin: 10px 0 0;
    line-height: 1.5;
    white-space: pre-wrap;
    word-break: break-word;
}

.history-actions {
    display: flex;
    gap: 8px;
    margin-top: 10px;
}

.history-action-btn {
    padding: 6px 10px;
    color: #fff;
    background: #2563eb;
    font-size: 12px;
}

.history-action-btn.secondary {
    color: #374151;
    background: #e5e7eb;
}
</style>
