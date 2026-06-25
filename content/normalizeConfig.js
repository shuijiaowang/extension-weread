import { DEFAULT_DOMAIN_CONFIG } from '../core/config.js';

export function normalizeDelay(value, fallback) {
    const delay = Number(value);
    return Number.isFinite(delay) ? Math.max(0, Math.round(delay)) : fallback;
}

export function normalizeRate(value, fallback) {
    const rate = Number(value);
    if (!Number.isFinite(rate)) return fallback;
    return Math.min(10, Math.max(0.1, Math.round(rate * 10) / 10));
}

export function normalizeConfig(value = {}) {
    const defaults = DEFAULT_DOMAIN_CONFIG;
    return {
        ...defaults,
        ...value,
        fullCapturePageDelayMs: normalizeDelay(value.fullCapturePageDelayMs, defaults.fullCapturePageDelayMs),
        reviewDelayMinMs: normalizeDelay(value.reviewDelayMinMs, defaults.reviewDelayMinMs),
        reviewDelayMaxMs: normalizeDelay(value.reviewDelayMaxMs, defaults.reviewDelayMaxMs),
        nativeCopyReadDelayMs: normalizeDelay(value.nativeCopyReadDelayMs, defaults.nativeCopyReadDelayMs),
        reviewPanelTimeoutMs: normalizeDelay(value.reviewPanelTimeoutMs, defaults.reviewPanelTimeoutMs),
        reviewPanelPollIntervalMs: normalizeDelay(value.reviewPanelPollIntervalMs, defaults.reviewPanelPollIntervalMs),
        reviewScrollDistance: normalizeDelay(value.reviewScrollDistance, defaults.reviewScrollDistance),
        reviewScrollMaxAttempts: normalizeDelay(value.reviewScrollMaxAttempts, defaults.reviewScrollMaxAttempts),
        reviewScrollDelayMs: normalizeDelay(value.reviewScrollDelayMs, defaults.reviewScrollDelayMs),
        captureRequestTimeoutMs: normalizeDelay(value.captureRequestTimeoutMs, defaults.captureRequestTimeoutMs),
        uiFeedbackSuccessDelayMs: normalizeDelay(value.uiFeedbackSuccessDelayMs, defaults.uiFeedbackSuccessDelayMs),
        uiFeedbackInfoDelayMs: normalizeDelay(value.uiFeedbackInfoDelayMs, defaults.uiFeedbackInfoDelayMs),
        readAloudRate: normalizeRate(value.readAloudRate, defaults.readAloudRate),
    };
}
