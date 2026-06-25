<script setup>
import { reactive, ref, computed, onMounted } from 'vue';
import { appState, DEFAULT_DOMAIN_CONFIG } from '../../core/config.js';
import { normalizeConfig } from '../../content/normalizeConfig.js';

const config = reactive({ ...DEFAULT_DOMAIN_CONFIG });
const isReady = ref(false);
const saveTip = ref('');
const showAdvancedSettings = ref(false);
const captureHistory = ref([]);
let saveTipTimer = null;

const TIMING_FIELDS_COMMON = [
    {
        key: 'fullCapturePageDelayMs',
        label: '翻页间隔',
        hint: '全文爬取每翻一页后等待，越大越慢但更稳',
        step: 100,
        unit: '毫秒',
    },
    {
        key: 'reviewDelayMs',
        label: '点击评论间隔',
        hint: '每次点击划线、打开评论弹窗后的等待',
        step: 50,
        unit: '毫秒',
    },
    {
        key: 'reviewScrollDelayMs',
        label: '评论滚动间隔',
        hint: '加载更多评论时，每次向下滚动后的等待',
        step: 50,
        unit: '毫秒',
    },
    {
        key: 'reviewScrollDistance',
        label: '评论滚动距离',
        hint: '每次向下滚动的像素，越大加载越快但越容易漏评',
        step: 50,
        unit: '像素',
    },
    {
        key: 'reviewItemLimit',
        label: '评论数量上限',
        hint: '单条划线最多抓取多少条已加载完成的评论',
        step: 1,
        unit: '条',
    },
];

const TIMING_FIELDS_ADVANCED = [
    {
        key: 'nativeCopyReadDelayMs',
        label: '剪贴板读取超时',
        hint: '复制划线原文时，等待剪贴板内容写入的最长时间',
        step: 50,
        unit: '毫秒',
    },
    { key: 'reviewPanelTimeoutMs', label: '评论弹窗加载超时', step: 100, unit: '毫秒' },
    { key: 'reviewPanelPollIntervalMs', label: '评论弹窗检测间隔', step: 10, unit: '毫秒' },
    { key: 'captureRequestTimeoutMs', label: '页面抓取超时时间', step: 100, unit: '毫秒' },
    { key: 'uiFeedbackSuccessDelayMs', label: '复制成功提示持续', step: 100, unit: '毫秒' },
    { key: 'uiFeedbackInfoDelayMs', label: '操作提示持续时间', step: 100, unit: '毫秒' },
];

const showReviewFormatOptions = computed(() => (
    config.embedReviewsInFullCapture || config.embedReviewsInReadAloud
));

onMounted(async () => {
    Object.assign(config, normalizeConfig(await appState.domainConfigStorage.getValue()));
    captureHistory.value = await appState.captureHistoryStorage.getValue();
    isReady.value = true;
});

async function saveConfig() {
    const normalized = normalizeConfig({ ...config });
    Object.assign(config, normalized);
    await appState.domainConfigStorage.setValue(normalized);

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
                <p>配置阅读页功能按钮与行为</p>
            </div>
            <span v-if="saveTip" class="save-tip">{{ saveTip }}</span>
        </header>

        <div v-if="isReady" class="popup-body">
            <!-- 基础功能 -->
            <section class="section">
                <h2 class="section-title">基础功能</h2>
                <div class="option-group">
                    <label class="option-row">
                        <input type="checkbox" v-model="config.showCopyCurrentPageButton" @change="saveConfig" />
                        <span class="option-label">复制本页文字</span>
                    </label>
                    <label class="option-row">
                        <input type="checkbox" v-model="config.showChapterCopyButton" @change="saveConfig" />
                        <span class="option-label">复制章节目录</span>
                    </label>
                    <label class="option-row">
                        <input type="checkbox" v-model="config.showCopyCommentsButton" @change="saveConfig" />
                        <span class="option-label">评论复制</span>
                    </label>
                </div>
            </section>

            <!-- 全文爬取 -->
            <section class="section">
                <h2 class="section-title">全文爬取</h2>
                <div class="option-group">
                    <label class="option-row">
                        <input type="checkbox" v-model="config.showFullCaptureButton" @change="saveConfig" />
                        <span class="option-label">启用全文爬取</span>
                    </label>
                    <div class="option-children" :class="{ 'is-disabled': !config.showFullCaptureButton }">
                        <label class="option-row sub">
                            <input
                                type="checkbox"
                                v-model="config.embedReviewsInFullCapture"
                                :disabled="!config.showFullCaptureButton"
                                @change="saveConfig"
                            />
                            <span class="option-label">嵌入评论</span>
                        </label>
                    </div>
                </div>
            </section>

            <!-- 朗读本页 -->
            <section class="section">
                <h2 class="section-title">朗读本页</h2>
                <div class="option-group">
                    <label class="option-row">
                        <input type="checkbox" v-model="config.showReadAloudButton" @change="saveConfig" />
                        <span class="option-label">启用朗读本页</span>
                    </label>
                    <div class="option-children" :class="{ 'is-disabled': !config.showReadAloudButton }">
                        <label class="option-row sub">
                            <input
                                type="checkbox"
                                v-model="config.embedReviewsInReadAloud"
                                :disabled="!config.showReadAloudButton"
                                @change="saveConfig"
                            />
                            <span class="option-label">朗读评论</span>
                        </label>
                        <div class="option-row sub field-row">
                            <span class="option-label">朗读倍速</span>
                            <div class="number-input">
                                <input
                                    id="readAloudRate"
                                    type="number"
                                    min="0.25"
                                    max="3"
                                    step="0.05"
                                    v-model.number="config.readAloudRate"
                                    :disabled="!config.showReadAloudButton"
                                    @change="saveConfig"
                                />
                                <span class="unit">倍</span>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            <!-- 评论格式（两个嵌入功能共用） -->
            <section v-if="showReviewFormatOptions" class="section">
                <h2 class="section-title">评论格式</h2>
                <div class="option-group hint-group">
                    <p class="section-hint">作用于全文爬取嵌入与朗读评论</p>
                    <label class="option-row">
                        <input type="checkbox" v-model="config.includeReviewUsername" @change="saveConfig" />
                        <span class="option-label">包含用户名</span>
                    </label>
                </div>
            </section>

            <!-- 运行节奏：常用、影响快慢 -->
            <section class="section">
                <h2 class="section-title">运行节奏</h2>
                <p class="section-hint standalone-hint">控制爬取与读评论的速度，间隔越大越慢，但更不易触发限制</p>
                <div class="option-group timing-group">
                    <div v-for="field in TIMING_FIELDS_COMMON" :key="field.key" class="timing-row">
                        <div class="timing-label-wrap">
                            <span class="option-label">{{ field.label }}</span>
                            <span v-if="field.hint" class="field-hint">{{ field.hint }}</span>
                        </div>
                        <div class="number-input">
                            <input
                                :id="field.key"
                                type="number"
                                min="0"
                                :step="field.step"
                                v-model.number="config[field.key]"
                                @change="saveConfig"
                            />
                            <span class="unit">{{ field.unit }}</span>
                        </div>
                    </div>
                </div>
            </section>

            <!-- 高级：技术参数与 UI 提示 -->
            <section class="section">
                <div class="section-header-row">
                    <div>
                        <h2 class="section-title">高级设置</h2>
                        <p class="section-hint">超时、轮询、按钮提示等底层参数，一般无需修改</p>
                    </div>
                    <button class="text-btn" @click="showAdvancedSettings = !showAdvancedSettings">
                        {{ showAdvancedSettings ? '收起' : '展开' }}
                    </button>
                </div>
                <div v-show="showAdvancedSettings" class="option-group timing-group">
                    <div v-for="field in TIMING_FIELDS_ADVANCED" :key="field.key" class="timing-row">
                        <div class="timing-label-wrap">
                            <span class="option-label">{{ field.label }}</span>
                            <span v-if="field.hint" class="field-hint">{{ field.hint }}</span>
                        </div>
                        <div class="number-input">
                            <input
                                :id="field.key"
                                type="number"
                                min="0"
                                :step="field.step"
                                v-model.number="config[field.key]"
                                @change="saveConfig"
                            />
                            <span class="unit">{{ field.unit }}</span>
                        </div>
                    </div>
                </div>
            </section>

            <!-- 历史记录 -->
            <section class="section">
                <div class="section-header-row">
                    <div>
                        <h2 class="section-title">历史爬取</h2>
                        <p class="section-hint">最近全文爬取结果，可下载 txt</p>
                    </div>
                    <button
                        class="text-btn"
                        :disabled="captureHistory.length === 0"
                        @click="clearHistory"
                    >
                        清空
                    </button>
                </div>

                <div v-if="captureHistory.length === 0" class="empty-state">
                    暂无记录，请先在阅读页执行全文爬取
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
                            <button class="btn primary" @click="downloadHistoryRecord(record)">下载 TXT</button>
                            <button class="btn" @click="copyHistoryRecord(record)">复制内容</button>
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
    width: 340px;
    box-sizing: border-box;
    padding: 16px;
    color: #1f2937;
    background: #f9fafb;
}

.popup-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 12px;
    margin-bottom: 16px;
}

.popup-header h1 {
    margin: 0;
    font-size: 17px;
    font-weight: 600;
    line-height: 1.3;
    color: #111827;
}

.popup-header p {
    margin: 4px 0 0;
    color: #6b7280;
    font-size: 12px;
}

.save-tip {
    flex-shrink: 0;
    padding: 3px 10px;
    color: #15803d;
    background: #dcfce7;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 500;
}

.popup-body {
    display: flex;
    flex-direction: column;
    gap: 14px;
}

.section-title {
    margin: 0;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: #9ca3af;
}

.section-header-row {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 8px;
    margin-bottom: 8px;
}

.section-header-row .section-title {
    margin-bottom: 0;
}

.section-hint {
    margin: 0 0 8px;
    font-size: 11px;
    color: #9ca3af;
    line-height: 1.4;
}

.standalone-hint {
    margin: 4px 0 6px;
}

.hint-group .section-hint {
    padding: 0 12px;
    margin-bottom: 4px;
}

.timing-group {
    margin-top: 0;
}

.timing-row {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 10px;
    padding: 10px 12px;
    border-bottom: 1px solid #f3f4f6;
}

.timing-row:last-child {
    border-bottom: none;
}

.timing-label-wrap {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
    flex: 1;
}

.field-hint {
    font-size: 11px;
    color: #9ca3af;
    line-height: 1.35;
}

.option-group {
    margin-top: 6px;
    background: #ffffff;
    border: 1px solid #e5e7eb;
    border-radius: 10px;
    overflow: hidden;
}

.option-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    font-size: 13px;
    cursor: pointer;
    user-select: none;
    border-bottom: 1px solid #f3f4f6;
}

.option-group > .option-row:last-child,
.option-children > .option-row:last-child {
    border-bottom: none;
}

.option-row input[type='checkbox'] {
    width: 15px;
    height: 15px;
    margin: 0;
    flex-shrink: 0;
    accent-color: #2563eb;
    cursor: pointer;
}

.option-label {
    flex: 1;
    color: #374151;
    line-height: 1.4;
}

.option-children {
    border-top: 1px solid #f3f4f6;
    background: #fafbfc;
}

.option-children.is-disabled .option-label {
    color: #9ca3af;
}

.option-row.sub {
    padding-left: 28px;
    position: relative;
}

.option-row.sub::before {
    content: '';
    position: absolute;
    left: 16px;
    top: 0;
    bottom: 0;
    width: 2px;
    background: #e5e7eb;
    border-radius: 1px;
}

.option-row:has(input:disabled) {
    cursor: not-allowed;
}

.field-row {
    cursor: default;
    justify-content: space-between;
}

.number-input {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
}

.number-input input {
    width: 72px;
    box-sizing: border-box;
    padding: 4px 8px;
    font-size: 12px;
    color: #111827;
    background: #ffffff;
    border: 1px solid #d1d5db;
    border-radius: 6px;
    text-align: right;
}

.number-input input:disabled {
    background: #f3f4f6;
    color: #9ca3af;
}

.unit {
    font-size: 11px;
    color: #9ca3af;
    min-width: 24px;
}

.text-btn {
    padding: 2px 8px;
    font-size: 11px;
    color: #2563eb;
    background: transparent;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    white-space: nowrap;
}

.text-btn:hover:not(:disabled) {
    background: #eff6ff;
}

.text-btn:disabled {
    color: #9ca3af;
    cursor: not-allowed;
}

.delay-group {
    margin-top: 0;
}

.delay-label {
    font-size: 12px;
    color: #6b7280;
    padding-right: 8px;
}

.empty-state {
    margin-top: 6px;
    padding: 16px 12px;
    font-size: 12px;
    color: #9ca3af;
    text-align: center;
    background: #ffffff;
    border: 1px dashed #e5e7eb;
    border-radius: 10px;
}

.history-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-top: 6px;
}

.history-item {
    padding: 10px 12px;
    background: #ffffff;
    border: 1px solid #e5e7eb;
    border-radius: 10px;
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
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
}

.history-main strong {
    font-size: 13px;
    color: #111827;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.history-main span,
.history-summary time {
    font-size: 11px;
    color: #9ca3af;
}

.history-preview {
    margin: 10px 0 0;
    font-size: 12px;
    color: #6b7280;
    line-height: 1.5;
    white-space: pre-wrap;
    word-break: break-word;
}

.history-actions {
    display: flex;
    gap: 8px;
    margin-top: 10px;
}

.btn {
    padding: 5px 10px;
    font-size: 11px;
    color: #374151;
    background: #f3f4f6;
    border: none;
    border-radius: 6px;
    cursor: pointer;
}

.btn:hover {
    background: #e5e7eb;
}

.btn.primary {
    color: #ffffff;
    background: #2563eb;
}

.btn.primary:hover {
    background: #1d4ed8;
}

.loading {
    padding: 24px;
    text-align: center;
    color: #9ca3af;
    font-size: 13px;
}
</style>
