import { DEFAULT_DOMAIN_CONFIG, appState } from '../core/config.js';
import { buildTextData } from './capture.js';
import { normalizeRate } from './normalizeConfig.js';
import { collectCurrentPageReviewEntries, embedReviewsInText, formatSpokenReviews } from './reviews.js';
import { bindHoverBackground, bindPressScale, copyText, createFloatingButton } from './shared.js';

export function installReadAloudButton({ config, getNextFloatingTop, requestCapture }) {
    const readAloudLogs = [];
    let readAloudText = '';
    let readAloudVoiceUri = '';
    let isReadAloudSpeaking = false;
    let isReadAloudPaused = false;

    function logReadAloud(message, detail) {
        const line = detail === undefined
            ? String(message)
            : `${message} ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`;
        readAloudLogs.push(`[${new Date().toISOString()}] ${line}`);
        console.log(`[weread-read-aloud] ${line}`);
    }

    function getReadAloudLogText() {
        return readAloudLogs.join('\n');
    }

    async function saveReadAloudRate(rate) {
        config.readAloudRate = normalizeRate(rate, DEFAULT_DOMAIN_CONFIG.readAloudRate);
        const stored = await appState.domainConfigStorage.getValue();
        await appState.domainConfigStorage.setValue({ ...stored, readAloudRate: config.readAloudRate });
    }

    function getSpeechVoices() {
        return window.speechSynthesis.getVoices();
    }

    function waitSpeechVoices() {
        const voices = getSpeechVoices();
        if (voices.length > 0) return Promise.resolve(voices);

        return new Promise((resolve) => {
            window.speechSynthesis.addEventListener('voiceschanged', () => {
                resolve(getSpeechVoices());
            }, { once: true });
        });
    }

    function pickVoice(voices) {
        if (readAloudVoiceUri) {
            const selected = voices.find((voice) => voice.voiceURI === readAloudVoiceUri);
            if (selected) return selected;
            logReadAloud('未找到已选声音', readAloudVoiceUri);
        }

        const zhVoices = voices.filter((voice) => voice.lang.toLowerCase().startsWith('zh'));
        if (zhVoices.length > 0) return zhVoices[0];

        logReadAloud('无中文声音', { voiceCount: voices.length });
        return voices[0] || null;
    }

    function updateReadAloudButton(label, background) {
        readAloudBtn.textContent = label;
        readAloudBtn.style.background = background;
    }

    function setReadAloudPanelVisible(visible) {
        readAloudPanel.style.display = visible ? 'block' : 'none';
    }

    function refreshPauseButton() {
        pauseReadAloudBtn.textContent = isReadAloudPaused ? '继续' : '暂停';
    }

    function stopReadAloud() {
        window.speechSynthesis.cancel();
        isReadAloudSpeaking = false;
        isReadAloudPaused = false;
        refreshPauseButton();
        updateReadAloudButton('朗读本页', '#f57c00');
        setReadAloudPanelVisible(false);
        logReadAloud('已停止朗读');
    }

    function speakReadAloudText(text) {
        if (!text) return;

        window.speechSynthesis.cancel();
        const voices = getSpeechVoices();
        const voice = pickVoice(voices);
        const utterance = new SpeechSynthesisUtterance(text);

        utterance.rate = config.readAloudRate;
        utterance.lang = voice?.lang || 'zh-CN';
        if (voice) utterance.voice = voice;

        utterance.onstart = () => {
            isReadAloudSpeaking = true;
            isReadAloudPaused = false;
            refreshPauseButton();
            updateReadAloudButton('朗读中...', '#ef6c00');
            setReadAloudPanelVisible(true);
            logReadAloud('开始朗读', {
                rate: config.readAloudRate,
                voice: voice?.name || 'default',
                textLength: text.length,
            });
        };

        utterance.onend = () => {
            isReadAloudSpeaking = false;
            isReadAloudPaused = false;
            refreshPauseButton();
            updateReadAloudButton('朗读本页', '#f57c00');
            setReadAloudPanelVisible(false);
            logReadAloud('朗读结束');
        };

        utterance.onerror = (event) => {
            isReadAloudSpeaking = false;
            isReadAloudPaused = false;
            refreshPauseButton();
            updateReadAloudButton('朗读失败', '#e53935');
            logReadAloud('朗读错误', { error: event.error, charIndex: event.charIndex });
        };

        window.speechSynthesis.speak(utterance);
    }

    function restartReadAloudIfSpeaking() {
        if (!isReadAloudSpeaking || !readAloudText) return;
        logReadAloud('参数变更，重新朗读');
        speakReadAloudText(readAloudText);
    }

    function fillVoiceSelect(voices) {
        voiceSelect.innerHTML = '';
        const list = voices.length > 0 ? voices : [];
        if (list.length === 0) {
            const option = document.createElement('option');
            option.textContent = '无可用声音';
            voiceSelect.appendChild(option);
            logReadAloud('声音列表为空');
            return;
        }

        list.forEach((voice) => {
            const option = document.createElement('option');
            option.value = voice.voiceURI;
            option.textContent = `${voice.name} (${voice.lang})`;
            voiceSelect.appendChild(option);
        });

        const preferred = pickVoice(list);
        if (preferred) {
            voiceSelect.value = preferred.voiceURI;
            readAloudVoiceUri = preferred.voiceURI;
        }
    }

    async function prepareReadAloudText(onProgress) {
        const items = await requestCapture();
        const textData = buildTextData(items, 1);
        let text = textData.text;

        if (!text) {
            logReadAloud('本页无正文');
            return '';
        }

        if (!config.embedReviewsInReadAloud) {
            logReadAloud('准备完成(仅正文)', { textLength: text.length });
            return text;
        }

        const reviewEntries = await collectCurrentPageReviewEntries(
            items,
            textData.itemEndOffsets,
            1,
            text,
            onProgress,
            config,
        );
        text = embedReviewsInText(text, reviewEntries, new Map(), 0, [], formatSpokenReviews);
        logReadAloud('准备完成(含评论)', {
            textLength: text.length,
            reviewEntryCount: reviewEntries.length,
        });
        return text;
    }

    const readAloudPanel = document.createElement('div');
    readAloudPanel.id = 'weread-read-aloud-panel';
    Object.assign(readAloudPanel.style, {
        position: 'fixed',
        top: '12px',
        right: '140px',
        zIndex: '2147483647',
        display: 'none',
        width: '240px',
        padding: '10px 12px',
        background: '#fff8e1',
        color: '#1f2937',
        border: '1px solid #ffcc80',
        borderRadius: '8px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
        fontSize: '13px',
    });

    function createPanelRow(labelText) {
        const row = document.createElement('div');
        Object.assign(row.style, { marginBottom: '8px' });
        const label = document.createElement('div');
        label.textContent = labelText;
        Object.assign(label.style, { marginBottom: '4px', color: '#6b7280', fontSize: '12px' });
        row.appendChild(label);
        return row;
    }

    const speedRow = createPanelRow('倍速');
    const speedInput = document.createElement('input');
    speedInput.type = 'range';
    speedInput.min = '0.5';
    speedInput.max = '2';
    speedInput.step = '0.1';
    speedInput.value = String(config.readAloudRate);
    Object.assign(speedInput.style, { width: '100%' });
    const speedValue = document.createElement('span');
    speedValue.textContent = `${config.readAloudRate} 倍`;
    speedInput.addEventListener('input', () => {
        const rate = normalizeRate(Number(speedInput.value), DEFAULT_DOMAIN_CONFIG.readAloudRate);
        speedValue.textContent = `${rate} 倍`;
    });
    speedInput.addEventListener('change', async () => {
        const rate = normalizeRate(Number(speedInput.value), DEFAULT_DOMAIN_CONFIG.readAloudRate);
        speedInput.value = String(rate);
        speedValue.textContent = `${rate} 倍`;
        await saveReadAloudRate(rate);
        logReadAloud('倍速已保存', rate);
        restartReadAloudIfSpeaking();
    });
    speedRow.appendChild(speedInput);
    speedRow.appendChild(speedValue);

    const voiceRow = createPanelRow('声音');
    const voiceSelect = document.createElement('select');
    Object.assign(voiceSelect.style, {
        width: '100%',
        padding: '4px 6px',
        borderRadius: '4px',
        border: '1px solid #d1d5db',
    });
    voiceSelect.addEventListener('change', () => {
        readAloudVoiceUri = voiceSelect.value;
        logReadAloud('切换声音', voiceSelect.selectedOptions[0]?.textContent || readAloudVoiceUri);
        restartReadAloudIfSpeaking();
    });
    voiceRow.appendChild(voiceSelect);

    const controlRow = document.createElement('div');
    Object.assign(controlRow.style, { display: 'flex', gap: '6px', flexWrap: 'wrap' });

    function createPanelButton(text, background) {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = text;
        Object.assign(button.style, {
            flex: '1 1 auto',
            padding: '6px 8px',
            border: 'none',
            borderRadius: '6px',
            color: '#fff',
            background,
            cursor: 'pointer',
            fontSize: '12px',
        });
        return button;
    }

    const pauseReadAloudBtn = createPanelButton('暂停', '#fb8c00');
    pauseReadAloudBtn.addEventListener('click', () => {
        if (!isReadAloudSpeaking) {
            logReadAloud('当前未在朗读，忽略暂停');
            return;
        }
        if (isReadAloudPaused) {
            window.speechSynthesis.resume();
            isReadAloudPaused = false;
            refreshPauseButton();
            logReadAloud('继续朗读');
            return;
        }
        window.speechSynthesis.pause();
        isReadAloudPaused = true;
        refreshPauseButton();
        logReadAloud('已暂停');
    });

    const stopReadAloudBtn = createPanelButton('停止', '#e53935');
    stopReadAloudBtn.addEventListener('click', () => stopReadAloud());

    const copyLogBtn = createPanelButton('复制日志', '#546e7a');
    copyLogBtn.addEventListener('click', async () => {
        const text = getReadAloudLogText() || '[weread-read-aloud] 暂无日志';
        const ok = await copyText(text);
        logReadAloud(ok ? '日志已复制' : '日志复制失败');
    });

    controlRow.append(pauseReadAloudBtn, stopReadAloudBtn, copyLogBtn);
    readAloudPanel.append(speedRow, voiceRow, controlRow);

    const readAloudBtn = createFloatingButton({
        id: 'weread-read-aloud',
        text: '朗读本页',
        top: getNextFloatingTop(),
        background: '#f57c00',
    });

    bindHoverBackground(readAloudBtn, '#f57c00', '#ef6c00', () => readAloudBtn.textContent === '朗读本页');
    bindPressScale(readAloudBtn);

    readAloudBtn.addEventListener('click', async () => {
        if (isReadAloudSpeaking) {
            logReadAloud('正在朗读，请先停止');
            setReadAloudPanelVisible(true);
            return;
        }

        readAloudLogs.length = 0;
        logReadAloud('开始准备朗读', {
            embedReviews: config.embedReviewsInReadAloud,
            rate: config.readAloudRate,
        });

        updateReadAloudButton('准备中...', '#ef6c00');
        setReadAloudPanelVisible(true);

        const voices = await waitSpeechVoices();
        fillVoiceSelect(voices);

        const text = await prepareReadAloudText((current, total) => {
            updateReadAloudButton(`抓评论 ${current}/${total}`, '#ef6c00');
        });

        if (!text) {
            updateReadAloudButton('暂无内容', '#757575');
            setTimeout(() => {
                updateReadAloudButton('朗读本页', '#f57c00');
                setReadAloudPanelVisible(false);
            }, config.uiFeedbackInfoDelayMs);
            return;
        }

        readAloudText = text;
        speakReadAloudText(text);
    });

    document.body.appendChild(readAloudPanel);
    document.body.appendChild(readAloudBtn);
    waitSpeechVoices().then(fillVoiceSelect);
}
