import { DEFAULT_DOMAIN_CONFIG } from '../core/config.js';

export function normalizeDelay(value, fallback) {
    const delay = Number(value);
    return Number.isFinite(delay) ? Math.max(0, Math.round(delay)) : fallback;
}

export function normalizeRate(value, fallback) {
    const rate = Number(value);
    if (!Number.isFinite(rate)) return fallback;
    return Math.min(3, Math.max(0.25, Math.round(rate * 100) / 100));
}

function resolveReviewDelayMs(value, defaults) {
    if (value.reviewDelayMs != null) {
        return normalizeDelay(value.reviewDelayMs, defaults.reviewDelayMs);
    }
    if (value.reviewDelayMinMs != null || value.reviewDelayMaxMs != null) {
        const min = normalizeDelay(value.reviewDelayMinMs, defaults.reviewDelayMs);
        const max = normalizeDelay(value.reviewDelayMaxMs, defaults.reviewDelayMs);
        return normalizeDelay(Math.round((min + max) / 2), defaults.reviewDelayMs);
    }
    return defaults.reviewDelayMs;
}

export function normalizeConfig(value = {}) {
    const defaults = DEFAULT_DOMAIN_CONFIG;
    const {
        reviewDelayMinMs: _min,
        reviewDelayMaxMs: _max,
        ...rest
    } = value;

    return {
        ...defaults,
        ...rest,
        fullCapturePageDelayMs: normalizeDelay(value.fullCapturePageDelayMs, defaults.fullCapturePageDelayMs),
        reviewDelayMs: resolveReviewDelayMs(value, defaults),
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
