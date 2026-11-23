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
  <div
    ref="rootRef"
    class="git-repository-form"
    :class="`layout-${layout}`"
    data-testid="git-repository-form"
  >
    <div
      v-if="featuresLoading"
      class="text-[#979ba5] text-[12px]"
    >
      {{ $t('正在加载代码仓库配置') }}
    </div>
    <div
      v-else-if="featuresError"
      class="text-[#ea3636] text-[12px]"
    >
      {{ $t('代码仓库配置加载失败') }}
      <Button
        text
        theme="primary"
        @click="controller.retryFeatures"
        >{{ $t('重试') }}</Button
      >
    </div>
    <div
      v-else-if="showPassword"
      class="git-credentials-panel p-[16px] mb-[20px] bg-[#f5f7fa] rounded-[2px]"
      data-testid="git-repo-credentials"
      :style="layout === 'horizontal' ? { marginLeft: `${labelWidth}px` } : undefined"
    >
      <div
        class="mb-[24px]"
        :class="{ 'is-error': fieldErrors.repoURL }"
      >
        <label class="required block mb-[6px] text-[14px] leading-[20px] text-[#63656e]">{{ $t('代码库') }}</label>
        <div class="flex-1 min-w-0">
          <Input
            ref="urlRef"
            v-model.trim="formConfig.repoURL"
            data-testid="git-repo-url"
            :placeholder="$t('请输入 HTTPS 仓库地址，如 https://git.example.com/group/app.git')"
          />
          <div
            v-if="fieldErrors.repoURL"
            class="git-field-error mt-[4px] text-[12px] text-[#ea3636]"
          >
            {{ fieldErrors.repoURL }}
          </div>
        </div>
      </div>
      <div
        class="mb-[24px]"
        :class="{ 'is-error': fieldErrors.username }"
      >
        <label class="required block mb-[6px] text-[14px] leading-[20px] text-[#63656e]">{{ $t('仓库账号') }}</label>
        <div class="flex-1 min-w-0">
          <Input
            v-model.trim="formConfig.username"
            data-testid="git-repo-username"
            :placeholder="$t('请输入仓库账号')"
          />
          <div
            v-if="fieldErrors.username"
            class="git-field-error mt-[4px] text-[12px] text-[#ea3636]"
          >
            {{ fieldErrors.username }}
          </div>
        </div>
      </div>
      <div
        class="git-repository-password mb-[8px]"
        :class="{ 'is-error': fieldErrors.password }"
      >
        <label
          class="block mb-[6px] text-[14px] leading-[20px] text-[#63656e]"
          :class="{ required: !hasSavedCredential }"
          >{{ $t('仓库密码') }}</label
        >
        <div class="flex-1 min-w-0">
          <PasswordInput
            v-model="formConfig.password"
            v-model:modified="passwordModified"
            credential-mode
            data-testid="git-repo-password"
            :has-credential="hasSavedCredential"
            :is-edit-mode="isEditMode"
          />
          <div class="git-repository-hint mt-[4px] text-[12px] leading-[20px] text-[#979ba5]">
            {{ $t('用于拉取私有仓库，保存后不再显示。修改账号时需要重新填写密码') }}
          </div>
          <div
            v-if="isEditMode && !!formConfig.password"
            class="git-repository-hint mt-[4px] text-[12px] leading-[20px] text-[#ff9c01]"
          >
            {{ $t('密码已修改，保存后生效') }}
          </div>
          <div
            v-if="fieldErrors.password"
            class="git-field-error mt-[4px] text-[12px] text-[#ea3636]"
          >
            {{ fieldErrors.password }}
          </div>
        </div>
      </div>
      <Button
        data-testid="git-repo-check"
        :disabled="isEditMode && hasSavedCredential && !formConfig.password"
        :loading="status === 'checking'"
        text
        theme="primary"
        @click="controller.testConnectivity"
      >
        {{ $t('连通测试') }}
      </Button>
      <Alert
        v-if="message"
        class="mt-[8px]"
        data-testid="git-repo-result"
        :theme="status === 'success' ? 'success' : 'danger'"
      >
        <template #title>
          <span v-if="status === 'success'">
            {{ $t('连接成功') }}，
            <i18n-t
              keypath="已成功连接到代码仓库 {0}"
              tag="span"
            >
              <strong>{{ formConfig.repoURL }}</strong>
            </i18n-t>
          </span>
          <span v-else>{{ message }}</span>
        </template>
      </Alert>
    </div>
    <FormItem
      v-else
      :label="$t('代码库')"
      :label-width="labelWidth"
      required
    >
      <GitSelector
        v-model="formConfig.repoURL"
        :workspace="workspace"
        @change="handleProjectChange"
        @init="handleProjectInit"
      />
      <div
        v-if="fieldErrors.repoURL"
        class="git-field-error mt-[4px] text-[12px] text-[#ea3636]"
      >
        {{ fieldErrors.repoURL }}
      </div>
    </FormItem>
  </div>
</template>

<script setup lang="ts">
  import { computed, ref } from 'vue';

  import { Alert, Button, Form, Input } from 'bkui-vue';
  import GitSelector from '~/components/git-selector.vue';
  import PasswordInput from '~/components/password-input.vue';
  import { useGitRepositoryCredentials } from '~/composables/use-git-repository-credentials';

  import type { BkCIOAuthGitProjectOutput } from '~/@types/v1/bkintegrations-bkci';
  import type { GitRepositoryConfig, GitRepositoryController } from '~/composables/use-git-repository-credentials';

  const props = withDefaults(
    defineProps<{
      baseline?: GitRepositoryConfig;
      config: GitRepositoryConfig;
      controller?: GitRepositoryController;
      isEditMode?: boolean;
      labelWidth?: number;
      layout?: 'horizontal' | 'vertical';
      workspace: string;
    }>(),
    { isEditMode: false, layout: 'vertical', labelWidth: 120, baseline: undefined, controller: undefined },
  );
  const emit = defineEmits<{ change: [project: BkCIOAuthGitProjectOutput] }>();
  // Like the surrounding form components, edit the caller-owned reactive form object.
  const formConfig = computed(() => props.config);
  const controller =
    props.controller ??
    useGitRepositoryCredentials({
      getConfig: () => props.config,
      workspace: () => props.workspace,
      isEditMode: props.isEditMode,
      getBaseline: () => props.baseline,
    });
  const {
    showPassword,
    hasSavedCredential,
    passwordModified,
    fieldErrors,
    status,
    message,
    featuresLoading,
    featuresError,
  } = controller;
  const rootRef = ref<HTMLElement>();
  const urlRef = ref<InstanceType<typeof Input>>();
  const FormItem = Form.FormItem;

  async function ensureReady() {
    const ready = await controller.ensureReady();
    if (!ready) focus();
    return ready;
  }
  function focus() {
    rootRef.value?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
    urlRef.value?.focus();
  }
  function handleProjectChange(project: BkCIOAuthGitProjectOutput) {
    handleProjectInit(project);
    emit('change', project);
  }
  function handleProjectInit(project: BkCIOAuthGitProjectOutput) {
    formConfig.value.repoAlias = project.alias;
  }
  defineExpose({ ensureReady, invalidate: controller.invalidate, focus });
</script>

<style lang="postcss" scoped>
  /* 错误态描红需穿透 bkui 输入框内部结构，官方未暴露可用的状态类 */
  .is-error :deep(.bk-input) {
    border-color: #ea3636;
    box-shadow: none;
  }

  /* 必填标记跟随 required 类名动态出现，伪元素内容无法用 uno 表达 */
  label.required::after {
    margin-left: 4px;
    color: #ea3636;
    content: '*';
  }
</style>
