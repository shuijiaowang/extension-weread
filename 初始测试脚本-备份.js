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



//UI补充，这个一次性注入即可，不会被重新渲染丢失。
// <div data-v-b93757e6="" class="review_section_toolbar_item review_section_toolbar_item_copy" style="cursor: pointer;"><div data-v-b93757e6="" class="review_section_toolbar_item_icon" style="cursor: pointer;"></div><div data-v-b93757e6="" class="review_section_toolbar_item_text" style="cursor: pointer;">复制</div></div>
// 复制一份插入它的后面做它的兄弟，命名为`复制评论`,点击执行`滚动+复制`,复制导出为txt即可。

const t=document.querySelector(".wr_underline_wrapper").parentElement.parentElement.parentElement.querySelectorAll(":scope > div")
t[0].querySelector(".wr_underline_wrapper").click() //点击触发评论
t[1].querySelector(".wr_underline_wrapper").click() //点击触发评论

t[0].querySelectorAll(".wr_underline_wrapper")[-1].click() //因为微信读书的一句话换行多处，最后一处的坐标才算是对的。
const body = document.querySelector(".float_panel_position_wrapper") //评论弹窗
const h=body.querySelector(".reader_float_panel_header_wrapper .review_section_toolbar_items_wrapper") //复制、划线、写想法、AI问书
const copybutton=h.querySelector(".review_section_toolbar_item_copy") //.click()，点击复制，这个复制是文章画线的句子，这个需要用来获取原文内容
const closeBtn = body.querySelector(".reader_float_panel_header_closeBtn") //.click()
const c=body.querySelector(".reader_float_panel_content_wrapper") //评论区主体
c.scrollBy(0,200) //滚动加载，重复15次，延迟150ms+-50ms随机，先滚动，后爬取内容。
const item = body.querySelectorAll(".reader_floatReviewsPanel_list_wrapper .reader_float_reviews_panel_item .reader_float_reviews_panel_item_top_container")[0] //所有评论，懒加载
const item_username=item.querySelector(".reader_float_reviews_panel_item_header").textContent //用户名
const item_content=item.querySelector(".reader_float_reviews_panel_item_content").textContent //评论内容





