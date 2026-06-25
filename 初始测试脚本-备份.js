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
c.scrollTop  //当这个值不变了就是到底了。
const item = body.querySelectorAll(".reader_floatReviewsPanel_list_wrapper .reader_float_reviews_panel_item .reader_float_reviews_panel_item_top_container")[0] //所有评论，懒加载
const item_username=item.querySelector(".reader_float_reviews_panel_item_header").textContent //用户名
const item_content=item.querySelector(".reader_float_reviews_panel_item_content").textContent //评论内容

//这是加载了的
//     <div data-v-0b75434f="" data-v-8ba546d8="" class="reader_float_reviews_panel_item reader_floatReviewsPanel_list_item" data-v-1358ac80=""><div data-v-0b75434f="" class="reader_float_reviews_panel_item_top_container"><div data-v-0b75434f="" class="reader_float_reviews_panel_item_header"><div data-v-0b75434f="" class="reader_float_reviews_panel_item_header_avatar wr_avatar" size="20"><img src="https://res.weread.qq.com/wravatar/WV0004-wWGmvNUnkBxkuK_I9scCkf1/96" class="wr_avatar_img"></div><span data-v-0b75434f="" class="reader_float_reviews_panel_item_header_name">俭子</span><!----></div><div data-v-0b75434f="" class="reader_float_reviews_panel_item_content">妙法通玄，洞悉本源</div><div data-v-0b75434f="" class="reader_float_reviews_panel_item_content_divider"></div></div><div data-v-0b75434f="" class="reader_float_reviews_panel_item_bottom_container"><div data-v-0b75434f="" class="reader_float_reviews_panel_item_bottom_item" style="cursor: pointer;"><svg data-v-47b0fb1a="" data-v-0b75434f="" width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" class="reader_float_reviews_panel_item_bottom_item_icon reader_float_reviews_panel_item_bottom_item_like_icon" style="cursor: pointer;"><g data-v-47b0fb1a="" clip-path="url(#clip0_5157_1508)"><path data-v-47b0fb1a="" d="M12.0253 4.30116C14.3123 2.58587 17.5721 2.76788 19.6522 4.84804C21.7323 6.92821 21.9144 10.1881 20.1991 12.475L20.2577 12.5326L11.9999 20.7894L3.74306 12.5326L3.80165 12.475C2.08636 10.188 2.26836 6.9282 4.34853 4.84804C6.42869 2.76788 9.6885 2.58587 11.9755 4.30116L11.9999 4.27577L12.0253 4.30116ZM18.5907 5.90858C17.0596 4.37785 14.6394 4.21532 12.9257 5.50038L12.8095 5.58827L12.1161 6.28163L11.9999 6.19472L11.8847 6.28163L11.1913 5.58827L11.0751 5.50038C9.3612 4.21508 6.94019 4.37747 5.40907 5.90858C3.87796 7.4397 3.71557 9.86071 5.00087 11.5746L5.287 11.9555L11.9999 18.6684L18.7138 11.9555L18.9989 11.5746C20.2844 9.8607 20.1219 7.43976 18.5907 5.90858Z" fill="currentColor"></path></g><defs data-v-47b0fb1a=""><clipPath data-v-47b0fb1a="" id="clip0_5157_1508"><rect data-v-47b0fb1a="" width="24" height="24" fill="currentColor"></rect></clipPath></defs></svg><div data-v-0b75434f="" class="reader_float_reviews_panel_item_bottom_item_count reader_float_reviews_panel_item_bottom_item_like_count" style="display: none;">
//     0
//     </div></div><div data-v-0b75434f="" class="reader_float_reviews_panel_item_bottom_item" style="cursor: pointer;"><svg data-v-948b9996="" data-v-0b75434f="" width="22" height="22" viewBox="0 0 22 22" fill="none" xmlns="http://www.w3.org/2000/svg" class="reader_float_reviews_panel_item_bottom_item_icon reader_float_reviews_panel_item_bottom_item_comment_icon" style="cursor: pointer;"><g data-v-948b9996="" clip-path="url(#clip0_11031_30160)"><path data-v-948b9996="" fill-rule="evenodd" clip-rule="evenodd" d="M18.3334 4.125H4.58335C4.07709 4.125 3.66669 4.53541 3.66669 5.04167V14.6667C3.66669 15.1729 4.07709 15.5833 4.58335 15.5833H6.87502V18.7917L11.4584 15.5833H18.3334C18.8396 15.5833 19.25 15.1729 19.25 14.6667V5.04167C19.25 4.53541 18.8396 4.125 18.3334 4.125ZM5.0417 14.2083V5.5H17.875V14.2083H11.0249L8.25003 16.1508V14.2083H5.0417Z" fill="currentColor"></path></g><defs data-v-948b9996=""><clipPath data-v-948b9996="" id="clip0_11031_30160"><rect data-v-948b9996="" width="22" height="22" fill="currentColor"></rect></clipPath></defs></svg><div data-v-0b75434f="" class="reader_float_reviews_panel_item_bottom_item_count reader_float_reviews_panel_item_bottom_item_comment_count" style="display: none;">
//     0
//     </div></div></div></div>
//这是未加载的
// <div data-v-8ba546d8="" data-v-1358ac80="" class="reader_floatReviewsPanel_list_loading"><div data-v-8ba546d8="" data-v-1358ac80="" class="reader_floatReviewsPanel_list_loading_1"></div><div data-v-8ba546d8="" data-v-1358ac80="" class="reader_floatReviewsPanel_list_loading_2"></div><div data-v-8ba546d8="" data-v-1358ac80="" class="reader_floatReviewsPanel_list_loading_3"></div></div>





