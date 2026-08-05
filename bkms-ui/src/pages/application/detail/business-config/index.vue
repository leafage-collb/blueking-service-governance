<template>
  <div class="flex flex-col h-full overflow-hidden">
    <TabHeader
      v-model:active-tab="activeTab"
      :tabs="tabList"
      :title="$t('业务配置')"
    />

    <div class="flex-1 overflow-hidden bg-[#f5f7fa]">
      <component :is="currentComponent" />
    </div>
  </div>
</template>

<script setup lang="ts">
  import type { Component } from 'vue';
  import { computed, onMounted } from 'vue';

  import { useI18n } from 'vue-i18n';
  import { useRoute, useRouter } from 'vue-router';
  import TabHeader from '~/components/tab-header.vue';

  import FileConfig from './file-config.vue';

  import type { TabItem } from '~/components/tab-header.vue';

  interface TabConfig extends TabItem {
    component: Component;
  }

  const { t } = useI18n();
  const route = useRoute();
  const router = useRouter();

  const tabList: TabConfig[] = [{ label: t('文件型'), name: 'file-config', component: FileConfig }];

  const activeTab = computed({
    get: () => {
      const tabFromQuery = route.query.activeTab as string;
      return tabFromQuery && tabList.some(tab => tab.name === tabFromQuery) ? tabFromQuery : tabList[0].name;
    },
    set: (value: string) => {
      router.replace({
        query: {
          ...route.query,
          activeTab: value,
        },
      });
    },
  });

  const currentComponent = computed(() => tabList.find(item => item.name === activeTab.value)?.component || FileConfig);

  onMounted(() => {
    if (!route.query.activeTab) {
      router.replace({
        query: {
          ...route.query,
          activeTab: tabList[0].name,
        },
      });
    }
  });
</script>
