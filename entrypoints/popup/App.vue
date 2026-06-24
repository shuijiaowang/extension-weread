<script setup>

import HelloWorld from "@/components/HelloWorld.vue";
import { ref, onMounted } from 'vue';
import { appState } from '../../core/config.js';

const showCopyButton = ref(false);

onMounted(async () => {
    const config = await appState.domainConfigStorage.getValue();
    showCopyButton.value = config.showCopyButton ?? false;
});

async function onToggleCopyButton() {
    const config = await appState.domainConfigStorage.getValue();
    config.showCopyButton = showCopyButton.value;
    await appState.domainConfigStorage.setValue(config);
}
</script>

<template>
    <HelloWorld />
    <div class="config-item">
        <label>
            <input type="checkbox" v-model="showCopyButton" @change="onToggleCopyButton" />
            复制本页文字
        </label>
    </div>
</template>

<style scoped>
.config-item {
    padding: 8px 12px;
    font-size: 14px;
}
.config-item label {
    display: flex;
    align-items: center;
    gap: 6px;
    cursor: pointer;
    user-select: none;
}
</style>
