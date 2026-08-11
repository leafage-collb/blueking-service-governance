<!--
 - TencentBlueKing is pleased to support the open source community by making
 - 蓝鲸智云 - 服务治理 (BlueKing Service Governance) available.
 - Copyright (C) Tencent. All rights reserved.
 - Licensed under the MIT License (the "License"); you may not use this file except
 - in compliance with the License. You may obtain a copy of the License at
 -
 -  http://opensource.org/licenses/MIT
 -
 - Unless required by applicable law or agreed to in writing, software distributed under
 - the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND,
 - either express or implied. See the License for the specific language governing permissions and
 - limitations under the License.
 -
 - We undertake not to change the open source license (MIT license) applicable
 - to the current version of the project delivered to anyone in the future.
-->

<template>
  <Dialog
    v-model:is-show="isShow"
    :width="700"
  >
    <template #header>
      <span class="text-[20px] text-[#313238]">{{ $t('部署预检发现 1 类问题') }}</span>
    </template>

    <div class="rounded-[2px] border border-[#F9D090] bg-[#FDF4E8] px-[12px]">
      <div
        class="flex cursor-pointer items-center justify-between py-[8px]"
        @click="collapsed = !collapsed"
      >
        <div class="flex items-center">
          <i class="bkms-icon bkms-icon-triangle-warning text-[12px] text-[#F59500]" />
          <span class="mx-[8px] text-base font-bold text-[#F59500]">{{ $t('环境变量未定义') }}</span>
          <span class="rounded-[2px] bg-[#FCE5C0] px-[8px] py-[2px] text-[12px] text-[#E38B02]">
            <i18n-t keypath="{0} 个变量">
              <span>{{ undefinedVars.length }}</span>
            </i18n-t>
          </span>
        </div>
        <AngleDown
          class="text-[22px] text-[#979BA5] transition-transform duration-200"
          :class="{ 'rotate-180': !collapsed }"
        />
      </div>

      <div
        v-show="!collapsed"
        class="border-t border-[#F9D090] py-[8px]"
      >
        <p class="text-[12px] leading-[20px] text-[#4D4F56]">
          {{ $t('以下环境变量在当前配置中被引用，但在目标部署环境中未定义，部署后将被渲染为空值，') }}
          <span class="font-bold">{{ $t('可能导致服务异常！') }}</span>
        </p>
        <p class="mb-[8px] text-[12px] leading-[20px] text-[#4D4F56]">
          {{ $t('建议前往') }}
          <span
            class="cursor-pointer text-[#3A84FF]"
            @click="handleGoConfig"
          >
            「{{ $t('应用配置 / 环境变量') }}」
          </span>
          {{ $t('补充配置后再部署，避免服务注册异常或配置错误。') }}
        </p>

        <Table
          class="env-var-precheck-table"
          :data="undefinedVars"
        >
          <TableColumn
            field="key"
            :label="$t('变量名称')"
            :min-width="180"
            show-overflow-tooltip
          >
            <template #default="{ row }">
              {{ row.key || '--' }}
            </template>
          </TableColumn>
          <TableColumn
            :label="$t('引用来源')"
            :min-width="360"
          >
            <template #default="{ row }">
              <div
                v-for="(source, index) in row.sources || []"
                :key="`${source.type}-${source.name}-${index}`"
                class="flex items-center gap-[8px] py-[3px]"
              >
                <Tag
                  class="shrink-0"
                  :class="sourceTypeMap[source.type || '']?.className || sourceTypeFallback.className"
                  size="small"
                >
                  {{ $t(sourceTypeMap[source.type || '']?.label || source.type || '--') }}
                </Tag>
                <span class="break-all text-[#4D4F56]">{{ source.name || '--' }}</span>
              </div>
              <span v-if="!row.sources?.length">--</span>
            </template>
          </TableColumn>
        </Table>
      </div>
    </div>

    <template #footer>
      <div class="flex justify-end">
        <Button
          class="mr-[8px]"
          :disabled="actionLocked"
          @click="handleCancel"
        >
          {{ $t('取消') }}
        </Button>
        <Button
          :disabled="actionLocked"
          theme="primary"
          @click="handleContinue"
        >
          {{ $t('继续部署') }}
        </Button>
      </div>
    </template>
  </Dialog>
</template>

<script setup lang="ts">
  import { ref, watch } from 'vue';

  import { Table, TableColumn } from '@blueking/table';
  import { Button, Dialog, Tag } from 'bkui-vue';
  import { AngleDown } from 'bkui-vue/lib/icon';
  import { useRoute, useRouter } from 'vue-router';

  import type { UndefinedEnvVarOutput } from '~/@types/v1/deploy';

  defineProps<{
    actionLocked?: boolean;
    undefinedVars: UndefinedEnvVarOutput[];
  }>();

  const emit = defineEmits<{
    cancel: [];
    continue: [];
  }>();

  const isShow = defineModel<boolean>('isShow', { default: false });
  const route = useRoute();
  const router = useRouter();
  const collapsed = ref(false);

  const sourceTypeMap: Record<string, { className: string; label: string }> = {
    appConfigFile: { className: 'source-tag-app-config', label: '框架配置文件' },
    component: { className: 'source-tag-component', label: '组件配置' },
    polaris: { className: 'source-tag-polaris', label: '北极星' },
  };
  const sourceTypeFallback = { className: 'source-tag-app-config' };

  function handleCancel() {
    emit('cancel');
  }

  function handleContinue() {
    emit('continue');
  }

  function handleGoConfig() {
    emit('cancel');
    const resolved = router.resolve({
      name: 'detail',
      params: {
        ...route.params,
        menuName: 'appConfig',
      },
      query: {
        ...route.query,
        activeTab: 'env-variable',
      },
    });
    window.open(resolved.href, '_blank');
  }

  watch(isShow, value => {
    if (value) {
      collapsed.value = false;
    }
  });
</script>

<style scoped lang="postcss">
  :deep(.bk-dialog-content) {
    max-height: calc(80vh - 135px);
    overflow-y: auto;
  }

  :deep(.bk-dialog-footer) {
    border-top-color: #eaebf0;
  }

  :deep(.env-var-precheck-table) {
    --vxe-ui-table-border-color: #dcdee5;
  }

  :deep(.env-var-precheck-table [class~='vxe-header--column']) {
    background-color: #fafbfd;
  }

  :deep(.source-tag-app-config) {
    color: #63656e;
    background-color: #f0f1f5;
    border-color: #f0f1f5;
  }

  :deep(.source-tag-component) {
    color: #299e56;
    background-color: #e4faf0;
    border-color: #e4faf0;
  }

  :deep(.source-tag-polaris) {
    color: #3a84ff;
    background-color: #e1ecff;
    border-color: #e1ecff;
  }
</style>
