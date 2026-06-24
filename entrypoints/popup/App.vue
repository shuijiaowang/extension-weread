<script setup>
import { reactive, ref, onMounted } from 'vue';
import { appState, DEFAULT_DOMAIN_CONFIG } from '../../core/config.js';

const config = reactive({ ...DEFAULT_DOMAIN_CONFIG });
const isReady = ref(false);
const saveTip = ref('');
let saveTipTimer = null;

function normalizeConfig(value = {}) {
    return {
        ...DEFAULT_DOMAIN_CONFIG,
        ...value,
        fullCapturePageDelayMs: normalizeDelay(value.fullCapturePageDelayMs),
    };
}

function normalizeDelay(value) {
    const delay = Number(value);
    if (!Number.isFinite(delay)) return DEFAULT_DOMAIN_CONFIG.fullCapturePageDelayMs;

    return Math.max(0, Math.round(delay));
}

onMounted(async () => {
    Object.assign(config, normalizeConfig(await appState.domainConfigStorage.getValue()));
    isReady.value = true;
});

async function saveConfig() {
    config.fullCapturePageDelayMs = normalizeDelay(config.fullCapturePageDelayMs);
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
                <label for="full-capture-delay">全文爬取翻页时间</label>
                <div class="delay-input">
                    <input
                        id="full-capture-delay"
                        type="number"
                        min="0"
                        step="100"
                        v-model.number="config.fullCapturePageDelayMs"
                        @change="saveConfig"
                    />
                    <span>毫秒</span>
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

.delay-config label {
    display: block;
    margin-bottom: 8px;
    font-size: 14px;
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
