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
  <ScrollLayout content-class="w-full relative">
    <!-- 表单 -->
    <ParamConfig
      v-if="step === 2"
      ref="formRef"
      :form="appConfig"
      :inert="submitting"
    />
    <!-- 创建结果 -->
    <Result
      v-else-if="step === 3"
      :app-type="appType"
      :data="resultData"
      @recreate="handleRecreate"
    />
    <!-- 操作按钮栏 -->
    <template #footer="{ hasScroll }">
      <div
        v-if="step !== 3"
        :class="[
          'flex justify-center py-[10px] transition z-10',
          hasScroll ? 'bg-[#fff] border-t-1px border-t-solid border-t-[#DCDEE5]' : '',
        ]"
      >
        <!-- 第二步创建成功后, 就已经成功了, 第三步就是修改values操作 -->
        <Button
          v-if="step < 3"
          class="mr-[10px]"
          :disabled="submitting"
          @click="preStep"
          >{{ $t('上一步') }}</Button
        >
        <Button
          v-if="step === 2"
          class="mr-[10px]"
          :loading="submitting"
          theme="primary"
          @click="createApp"
        >
          {{ $t('创建') }}
        </Button>
        <Button
          class="mr-[10px]"
          :disabled="submitting"
          @click="cancel"
          >{{ $t('取消') }}</Button
        >
      </div>
    </template>
  </ScrollLayout>
</template>
<script lang="ts" setup>
  import { computed, onBeforeUnmount, onMounted, ref } from 'vue';

  import { Button } from 'bkui-vue';
  import { useRoute, useRouter } from 'vue-router';
  import { ApiServerService } from '~/api/modules/bkmsserver';
  import { useAgonesFromRoute } from '~/composables/use-agones';
  import { useFocusOnErrorField } from '~/composables/use-focus-on-error-field';
  import { clearGitPasswords } from '~/composables/use-git-repository-credentials';
  import { useAppDetail } from '~/stores/app-detail';
  import { useUserStore } from '~/stores/user';

  import Result from '../../result.vue';
  import ParamConfig from './param-config.vue';

  import type { IResultData } from '../../result.vue';
  import type { CreateAppRequest } from '~/@types/v1/app';

  const props = defineProps({
    step: { type: Number, default: 2 },
  });

  const emits = defineEmits(['next', 'pre', 'cancel', 'update-step']);

  const route = useRoute(); // 获取路由信息

  const { userInfo } = useUserStore();

  const appDetailStore = useAppDetail();

  // 使用 Agones Hook 获取应用类型
  const { appType } = useAgonesFromRoute();

  const space = computed<string>(() => route.params.space as string);
  // 表单数据
  const appConfig = ref<CreateAppRequest>({
    buildConfig: {
      imageBuildConfig: {
        password: '',
        name: '',
        username: '',
      },
      sourceType: 'imageRegistry',
    },
    displayName: '',
    managers: [userInfo?.user_id],
    name: '',
    type: appType.value,
    id: '',
  } as unknown as CreateAppRequest);

  // 底部按钮操作
  // 下一步
  const { focusOnErrorField } = useFocusOnErrorField();
  const formRef = ref<InstanceType<typeof ParamConfig> | null>(null);
  let disposed = false;

  function clearGitDrafts() {
    clearGitPasswords(
      () => formRef.value?.clearGitDrafts(),
      appConfig.value.buildConfig.repoBuildConfig,
      appConfig.value.helmSpec?.helmSource.gitRepoConfig,
    );
  }

  onBeforeUnmount(() => {
    disposed = true;
    clearGitDrafts();
  });
  const router = useRouter();
  // 上一步
  const preStep = async () => {
    emits('pre');
    if (props.step === 2) {
      router.back();
    }
  };
  // 取消
  const cancel = async () => {
    if (props.step >= 3) {
      router.push({ name: 'app' });
    } else {
      emits('update-step', 1);
      router.back();
    }
  };

  // 创建应用
  const resultData = ref<IResultData>({
    status: 'CREATING',
    name: '',
    msg: '',
  });
  const submitting = ref(false);

  async function createApp() {
    if (submitting.value || disposed || props.step !== 2) return;
    submitting.value = true;
    try {
      const validate = await formRef.value?.validate().catch(() => false);
      if (disposed || props.step !== 2) return;
      if (!validate) {
        focusOnErrorField();
        return;
      }
      if (formRef.value) {
        appConfig.value = formRef.value.getValue();
      }

      await ApiServerService.CreateApp(
        {
          ...appConfig.value,
          workspaceID: space.value,
        },
        { interceptorErr: false, needRes: true },
      )
        .then(() => {
          if (disposed) return false;
          clearGitDrafts();
          resultData.value.status = 'SUCCESS';
          resultData.value.name = appConfig.value.name;
          resultData.value.msg = '';
          // 更新应用名称
          appDetailStore.updateAppName(appConfig.value.name);
          return true;
        })
        .catch(err => {
          if (disposed) return false;
          resultData.value.status = 'FAILED';
          resultData.value.name = appConfig.value.name;
          resultData.value.msg = err?.message || err?.error?.message || '';
          return false;
        })
        .finally(() => {
          if (!disposed) emits('update-step', 3);
        });
    } finally {
      submitting.value = false;
    }
  }
  function handleRecreate() {
    emits('update-step', 2);
    resultData.value = {
      status: 'CREATING',
      name: '',
      msg: '',
    };
    formRef.value?.getAppIDAutoSuffix?.();
  }

  onMounted(() => {
    if (props.step === 1) {
      emits('next');
    }
  });
</script>
