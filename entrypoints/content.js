import { initWereadContent } from '../content/init.js';

export default defineContentScript({
    matches: ['https://weread.qq.com/web/reader/*'],
    runAt: 'document_idle',

    async main() {
        await initWereadContent();
    },
});
