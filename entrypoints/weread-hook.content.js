export default defineContentScript({
    matches: ['https://weread.qq.com/web/reader/*'],
    runAt: 'document_start',
    world: 'MAIN',

    main() {
        if (window.__WEREAD_CANVAS_CAPTURE__) return;

        const state = {
            captured: new Map(),
            order: [],
            nextCanvasId: 1,
            canvasIds: new WeakMap(),
        };

        window.__WEREAD_CANVAS_CAPTURE__ = state;

        function getCanvasId(canvas) {
            if (!canvas) return 0;
            let id = state.canvasIds.get(canvas);
            if (!id) {
                id = state.nextCanvasId++;
                state.canvasIds.set(canvas, id);
            }
            return id;
        }

        function normalizeText(text) {
            return String(text ?? '');
        }

        function captureText(ctx, text, x, y) {
            const value = normalizeText(text);
            if (!value) return;

            const canvas = ctx.canvas;
            const canvasId = getCanvasId(canvas);
            const rx = Math.round(Number(x) || 0);
            const ry = Math.round(Number(y) || 0);
            const rect = canvas?.getBoundingClientRect?.();
            const pageX = Math.round((rect?.left || 0) + rx);
            const pageY = Math.round((rect?.top || 0) + ry);
            const key = `${canvasId}|${rx},${ry}|${value}`;

            if (state.captured.has(key)) return;

            const item = {
                text: value,
                x: rx,
                y: ry,
                pageX,
                pageY,
                canvasId,
                index: state.order.length,
            };
            state.captured.set(key, item);
            state.order.push(item);
        }

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

        function snapshot() {
            return state.order.map((item) => ({ ...item }));
        }

        function clearCapture() {
            state.captured.clear();
            state.order.length = 0;
        }

        function printAndClear() {
            const items = snapshot();
            if (items.length > 0) {
                console.log(buildText(items));
            }
            clearCapture();
        }

        const originalFillText = CanvasRenderingContext2D.prototype.fillText;
        CanvasRenderingContext2D.prototype.fillText = function (text, x, y, ...params) {
            captureText(this, text, x, y);
            return originalFillText.call(this, text, x, y, ...params);
        };

        window.addEventListener('message', (event) => {
            if (event.source !== window) return;

            const message = event.data;
            if (message?.source !== 'weread-extension' || message.type !== 'request-capture') return;

            if (message.cmd === 'get') {
                window.postMessage({
                    source: 'weread-page',
                    type: 'capture-result',
                    requestId: message.requestId,
                    items: snapshot(),
                }, '*');
            } else if (message.cmd === 'clear') {
                clearCapture();
                window.postMessage({
                    source: 'weread-page',
                    type: 'capture-result',
                    requestId: message.requestId,
                    items: [],
                }, '*');
            }
        });

        document.addEventListener('pointerdown', (event) => {
            if (event.target?.closest?.('.renderTarget_pager_button, .renderTarget_pager_button_right')) {
                printAndClear();
            }
        }, true);

        document.addEventListener('keydown', (event) => {
            if (['ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown'].includes(event.key)) {
                printAndClear();
            }
        }, true);

        console.log('[weread] canvas 捕获器已启动，翻页时会输出上一页文字');
    },
});
