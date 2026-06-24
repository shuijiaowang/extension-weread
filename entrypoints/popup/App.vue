<script setup>
import { reactive, ref, onMounted } from 'vue';
import { appState, DEFAULT_DOMAIN_CONFIG } from '../../core/config.js';

const config = reactive({ ...DEFAULT_DOMAIN_CONFIG });
const isReady = ref(false);
const saveTip = ref('');
const showDelaySettings = ref(false);
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
</style>
