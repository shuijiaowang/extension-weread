// ========== 微信读书文字捕获器（翻页输出版） ==========
const captured = new Map(); // key: 坐标+文字，去重
const order = []; // 按 fillText 调用顺序存储

function buildText(items) {
    if (items.length === 0) return '';
    let text = '';
    let lastY = items[0].y;
    for (const item of items) {
        if (item.y !== lastY) {
            text += '\n';
            lastY = item.y;
        }
        text += item.text;
    }
    return text;
}

function printAndClear() {
    if (order.length === 0) return;
    console.log(buildText(order));
    captured.clear();
    order.length = 0;
}

function bindPagerButtons() {
    const prevBtn = document.querySelector('.renderTarget_pager_button');
    const nextBtn = document.querySelector('.renderTarget_pager_button_right');
    [prevBtn, nextBtn].forEach(btn => {
        if (btn && !btn.dataset.wereadBound) {
            btn.dataset.wereadBound = '1';
            btn.addEventListener('click', printAndClear);
        }
    });
}

bindPagerButtons();
new MutationObserver(bindPagerButtons).observe(document.body, { childList: true, subtree: true });

const originalGetContext = HTMLCanvasElement.prototype.getContext;

HTMLCanvasElement.prototype.getContext = function(type, ...args) {
    const ctx = originalGetContext.call(this, type, ...args);
    if (type === '2d') {
        const originalFillText = ctx.fillText;
        ctx.fillText = function(text, x, y, ...params) {
            const key = `${Math.round(x)},${Math.round(y)}|${text}`;
            if (!captured.has(key)) {
                const item = { text, x: Math.round(x), y: Math.round(y) };
                captured.set(key, item);
                order.push(item);
            }
            return originalFillText.call(this, text, x, y, ...params);
        };
    }
    return ctx;
};

console.log('🚀 捕获器已启动，翻页时会按顺序输出当前页文字（含换行）');
