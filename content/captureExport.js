function normalizeReviewText(value) {
    return String(value ?? '').trim();
}

function normalizeReview(review = {}) {
    return {
        username: normalizeReviewText(review.username),
        content: normalizeReviewText(review.content),
    };
}

function normalizeReviewEntry(entry = {}) {
    return {
        insertIndex: Number.isFinite(Number(entry.insertIndex)) ? Number(entry.insertIndex) : -1,
        reviews: Array.isArray(entry.reviews)
            ? entry.reviews.map(normalizeReview).filter((review) => review.username || review.content)
            : [],
    };
}

function buildLegacyPage(text) {
    return {
        pageNumber: 1,
        text: String(text ?? ''),
        reviewEntries: [],
    };
}

export function normalizeCapturePages(pages, legacyText = '') {
    if (!Array.isArray(pages) || pages.length === 0) {
        return legacyText ? [buildLegacyPage(legacyText)] : [];
    }

    return pages.map((page, index) => ({
        pageNumber: Number.isFinite(Number(page?.pageNumber)) ? Number(page.pageNumber) : index + 1,
        text: String(page?.text ?? ''),
        reviewEntries: Array.isArray(page?.reviewEntries)
            ? page.reviewEntries.map(normalizeReviewEntry).filter((entry) => entry.insertIndex >= 0 && entry.reviews.length > 0)
            : [],
    }));
}

function getReviewDuplicateKey(reviews) {
    return JSON.stringify(reviews.map((review) => ({
        username: review.username || '',
        content: review.content || '',
    })));
}

export function dedupeCapturePages(pages, legacyText = '') {
    const nextPages = normalizeCapturePages(pages, legacyText);
    const seen = new Map();

    nextPages.forEach((page, pageIndex) => {
        page.reviewEntries.forEach((entry, entryIndex) => {
            const key = getReviewDuplicateKey(entry.reviews);
            const previous = seen.get(key);
            if (previous) {
                nextPages[previous.pageIndex].reviewEntries[previous.entryIndex] = null;
            }
            seen.set(key, { pageIndex, entryIndex });
        });
    });

    nextPages.forEach((page) => {
        page.reviewEntries = page.reviewEntries.filter(Boolean);
    });

    return nextPages;
}

export function getCaptureReviewCount(record = {}) {
    return normalizeCapturePages(record.pages, record.text)
        .reduce((total, page) => total + page.reviewEntries.reduce((pageTotal, entry) => pageTotal + entry.reviews.length, 0), 0);
}

export function hasCaptureReviews(record = {}) {
    return getCaptureReviewCount(record) > 0;
}

export function createCaptureExportOptions(record = {}, overrides = {}) {
    return {
        includeReviews: hasCaptureReviews(record),
        includeReviewUsername: true,
        reviewMaxLength: 0,
        ...overrides,
    };
}

function normalizeReviewMaxLength(value) {
    const length = Number(value);
    if (!Number.isFinite(length) || length <= 0) return 0;
    return Math.floor(length);
}

function trimReviewContent(content, maxLength) {
    const normalized = normalizeReviewText(content);
    if (!maxLength || normalized.length <= maxLength) return normalized;
    return normalized.slice(0, maxLength);
}

function formatEmbeddedReviews(reviews, options) {
    const content = reviews
        .map((review, index) => {
            const prefix = reviews.length > 1 ? `${index + 1}. ` : '';
            const reviewContent = trimReviewContent(review.content, options.reviewMaxLength);
            if (!options.includeReviewUsername) return `${prefix}${reviewContent}`;
            const username = review.username || '匿名';
            return `${prefix}${username}：${reviewContent}`;
        })
        .join('；');

    return content ? `【评论：${content}】` : '';
}

function insertReviewEntries(text, reviewEntries, options) {
    return [...reviewEntries]
        .sort((a, b) => b.insertIndex - a.insertIndex)
        .reduce((currentText, entry) => {
            const reviewText = formatEmbeddedReviews(entry.reviews, options);
            if (!reviewText) return currentText;
            return `${currentText.slice(0, entry.insertIndex)}${reviewText}${currentText.slice(entry.insertIndex)}`;
        }, String(text ?? ''));
}

export function formatCaptureRecordText(record = {}, overrides = {}) {
    const options = createCaptureExportOptions(record, overrides);
    const pages = normalizeCapturePages(record.pages, record.text);

    return pages
        .map((page) => {
            if (!options.includeReviews || page.reviewEntries.length === 0) return page.text;
            return insertReviewEntries(page.text, page.reviewEntries, {
                includeReviewUsername: options.includeReviewUsername,
                reviewMaxLength: normalizeReviewMaxLength(options.reviewMaxLength),
            });
        })
        .filter(Boolean)
        .join('\n\n');
}

export function normalizeCaptureRecord(record = {}) {
    const pages = normalizeCapturePages(record.pages, record.text);
    const reviewCount = getCaptureReviewCount({ pages });

    return {
        ...record,
        pages,
        pageCount: Number.isFinite(Number(record.pageCount)) ? Number(record.pageCount) : pages.length,
        reviewCount: Number.isFinite(Number(record.reviewCount)) ? Number(record.reviewCount) : reviewCount,
    };
}
