<template>
  <div class="flex h-full min-h-0 flex-col overflow-hidden p-[24px] pt-[20px]">
    <div
      class="mb-[16px] h-[48px] flex flex-shrink-0 items-center bg-[#EAEBF0] px-[16px] shadow-[0_2px_4px_0_#0000001a]"
    >
      <!-- 环境选择器 -->
      <EnvPerspectiveSelect
        :env-list="envList"
        :label="$t('环境')"
        :model-value="currentEnvName"
        :show-default="false"
        :status-config="{
          activeText: '已启用',
          filterText: '仅显示已启用环境',
          inactiveText: '未启用',
        }"
        :status-env-names="enabledEnvNames"
        @change="handleEnvSelectChange"
      />
    </div>

    <Loading
      class="min-h-0 flex-1"
      :loading="pageLoading"
    >
      <div
        v-if="!currentEnvName && !envSelectorLoading"
        class="flex h-full items-center justify-center bg-white"
      >
        <Exception
          scene="part"
          type="empty"
        >
          <template #description>
            <div class="text-[14px] text-[#4d4f56]">{{ $t('暂无可用环境') }}</div>
          </template>
        </Exception>
      </div>

      <!-- 配置未启用 -->
      <div
        v-else-if="currentEnvName && !currentEnvBinding"
        class="flex h-full items-center justify-center bg-white"
      >
        <Exception
          class="large-exception"
          scene="part"
          type="empty"
        >
          <template #type>
            <img src="/empty.svg" />
          </template>
          <template #description>
            <div class="text-[20px] text-[#313238]">{{ $t('当前环境尚未启用文件类型配置') }}</div>
            <div class="mt-[16px] text-[14px] leading-[22px]">
              {{ $t('启用后，会在蓝鲸配置平台（BSCP）上创建文件类型的配置服务') }}
            </div>
          </template>
          <Button
            class="mt-[16px]"
            :loading="enableLoading"
            theme="primary"
            @click="handleEnableConfig"
          >
            {{ $t('启用配置') }}
          </Button>
        </Exception>
      </div>

      <div
        v-else-if="currentEnvBinding"
        class="flex h-full min-h-0 flex-col"
      >
        <div
          class="mb-[16px] flex h-[48px] px-[16px] flex-shrink-0 items-center bg-white shadow-[0_2px_4px_0_#1919290d]"
        >
          <span class="mr-[10px] text-[14px]">{{ $t('挂载配置') }}</span>
          <Popover
            v-if="mountEnabled"
            ref="disablePopoverRef"
            ext-cls="business-config-mount-popover"
            placement="bottom-start"
            theme="light"
            trigger="click"
            :width="320"
          >
            <Switcher
              theme="primary"
              :value="true"
            />
            <template #content>
              <div class="p-[12px]">
                <div class="mb-[8px] text-[16px] text-[#313238]">{{ $t('确认关闭配置文件挂载？') }}</div>
                <ul class="mb-[16px] pl-[8px] text-[12px] leading-[20px]">
                  <li>•&nbsp;{{ $t('关闭后，该配置文件将不再挂载到容器') }}</li>
                  <li>•&nbsp;{{ $t('此操作需重新部署应用后才会生效') }}</li>
                </ul>
                <div class="flex justify-end">
                  <Button
                    :loading="disableLoading"
                    size="small"
                    theme="primary"
                    @click="handleDisableMount"
                  >
                    {{ $t('确认关闭') }}
                  </Button>
                  <Button
                    class="ml-[8px]"
                    size="small"
                    @click="disablePopoverRef?.hide()"
                  >
                    {{ $t('取消') }}
                  </Button>
                </div>
              </div>
            </template>
          </Popover>
          <Popover
            v-else
            ref="enableMountPopoverRef"
            ext-cls="business-config-mount-popover"
            placement="bottom-start"
            theme="light"
            trigger="click"
            :width="mountPopoverWidth"
            @after-hidden="handleEnableMountPopoverHidden"
            @after-show="handleEnableMountPopoverShow"
          >
            <Switcher
              theme="primary"
              :value="false"
            />
            <template #content>
              <div>
                <div class="px-[16px] pt-[14px]">
                  <div class="mb-[16px] text-[14px] font-bold text-[#313238]">{{ $t('启用挂载配置') }}</div>
                  <Alert
                    class="mb-[16px]"
                    theme="info"
                    :title="$t('配置文件将以 Sidecar 方式注入，启用后需重新部署应用才生效')"
                  />
                  <Form
                    ref="mountFormRef"
                    form-type="vertical"
                    :model="mountForm"
                    :rules="mountFormRules"
                  >
                    <Form.FormItem
                      :label="$t('挂载路径')"
                      property="mountPath"
                      required
                    >
                      <Input
                        ref="mountInputRef"
                        v-model.trim="mountForm.mountPath"
                        :placeholder="$t('请输入挂载路径')"
                      />
                    </Form.FormItem>
                    <!-- Helm/Agones 应用需要填写工作负载 -->
                    <template v-if="isHelmLikeApp">
                      <div class="mb-[8px] text-[12px] text-[#63656e]">
                        {{ $t('工作负载') }}
                        <span class="text-[#ea3636]">*</span>
                      </div>
                      <div class="flex gap-[16px]">
                        <Form.FormItem
                          class="min-w-0 flex-1 !mb-0"
                          property="workloadKind"
                        >
                          <div class="flex">
                            <span class="mount-form-addon">{{ $t('应用类型') }}</span>
                            <Select
                              v-model="mountForm.workloadKind"
                              class="min-w-0 flex-1"
                              :clearable="false"
                              :placeholder="$t('请选择')"
                            >
                              <Select.Option
                                v-for="item in workloadKindOptions"
                                :id="item"
                                :key="item"
                                :name="item"
                              />
                            </Select>
                          </div>
                        </Form.FormItem>
                        <Form.FormItem
                          class="min-w-0 flex-1 !mb-0"
                          property="workloadName"
                        >
                          <div class="flex">
                            <span class="mount-form-addon">{{ $t('应用名称') }}</span>
                            <Input
                              v-model.trim="mountForm.workloadName"
                              class="min-w-0 flex-1"
                              :placeholder="$t('请输入应用名称')"
                            />
                          </div>
                        </Form.FormItem>
                      </div>
                    </template>
                  </Form>
                </div>
                <div class="mt-[16px] flex justify-end border-t border-[#eaebf0] bg-[#fafbfd] px-[16px] py-[8px]">
                  <Button
                    :loading="mountLoading"
                    size="small"
                    theme="primary"
                    @click="handleEnableMount"
                  >
                    {{ $t('确定') }}
                  </Button>
                  <Button
                    class="ml-[8px]"
                    size="small"
                    @click="enableMountPopoverRef?.hide()"
                  >
                    {{ $t('取消') }}
                  </Button>
                </div>
              </div>
            </template>
          </Popover>

          <!-- 挂载路径 -->
          <template v-if="mountEnabled">
            <span class="ml-[10px] text-[12px] text-[#979BA5]">
              {{ $t('挂载路径：{0}', [metadata?.mountPath]) }}
            </span>
            <span
              v-if="isHelmLikeApp"
              class="ml-[12px] border-l border-[#dcdee5] pl-[12px] text-[12px] text-[#979ba5]"
            >
              {{ $t('工作负载') }}：
              <span class="text-[#979BA5]">
                {{ metadata?.workloadKind || '--' }} / {{ metadata?.workloadName || '--' }}
              </span>
            </span>
            <Popover
              ref="editPopoverRef"
              ext-cls="business-config-mount-popover"
              placement="bottom-start"
              theme="light"
              trigger="click"
              :width="mountPopoverWidth"
              @after-hidden="handleEditPopoverHidden"
              @after-show="handleEditPopoverShow"
            >
              <EditLine class="ml-[8px] cursor-pointer text-[16px] text-[#3a84ff]" />
              <template #content>
                <div class="px-[16px] pt-[12px]">
                  <div class="mb-[16px] text-[14px] font-bold text-[#313238]">
                    {{ isHelmLikeApp ? $t('编辑挂载配置') : $t('编辑挂载路径') }}
                  </div>
                  <Form
                    ref="editFormRef"
                    form-type="vertical"
                    :model="editForm"
                    :rules="mountFormRules"
                  >
                    <Form.FormItem
                      :label="$t('挂载路径')"
                      property="mountPath"
                      required
                    >
                      <Input
                        ref="editInputRef"
                        v-model.trim="editForm.mountPath"
                        :placeholder="$t('请输入挂载路径')"
                      />
                    </Form.FormItem>

                    <template v-if="isHelmLikeApp">
                      <div class="mb-[8px] text-[12px] text-[#63656e]">
                        {{ $t('工作负载') }}
                        <span class="text-[#ea3636]">*</span>
                      </div>
                      <div class="flex gap-[16px]">
                        <Form.FormItem
                          class="min-w-0 flex-1 !mb-0"
                          property="workloadKind"
                        >
                          <div class="flex">
                            <span class="mount-form-addon">{{ $t('应用类型') }}</span>
                            <Select
                              v-model="editForm.workloadKind"
                              class="min-w-0 flex-1"
                              :clearable="false"
                              :placeholder="$t('请选择')"
                            >
                              <Select.Option
                                v-for="item in workloadKindOptions"
                                :id="item"
                                :key="item"
                                :name="item"
                              />
                            </Select>
                          </div>
                        </Form.FormItem>
                        <Form.FormItem
                          class="min-w-0 flex-1 !mb-0"
                          property="workloadName"
                        >
                          <div class="flex">
                            <span class="mount-form-addon">{{ $t('应用名称') }}</span>
                            <Input
                              v-model.trim="editForm.workloadName"
                              class="min-w-0 flex-1"
                              :placeholder="$t('请输入应用名称')"
                            />
                          </div>
                        </Form.FormItem>
                      </div>
                    </template>
                  </Form>
                </div>
                <div class="mt-[16px] flex justify-end border-t border-[#eaebf0] bg-[#fafbfd] px-[16px] py-[8px]">
                  <Button
                    :loading="editLoading"
                    size="small"
                    theme="primary"
                    @click="handleUpdateMountPath"
                  >
                    {{ $t('确定') }}
                  </Button>
                  <Button
                    class="ml-[8px]"
                    size="small"
                    @click="editPopoverRef?.hide()"
                  >
                    {{ $t('取消') }}
                  </Button>
                </div>
              </template>
            </Popover>
          </template>
          <span
            v-else
            class="ml-[10px] text-[12px] text-[#979ba5]"
          >
            {{ $t('未启用，配置文件不会挂载到容器') }}
          </span>
        </div>

        <iframe
          v-if="bscpIframeUrl"
          :key="bscpIframeUrl"
          class="min-h-0 w-full flex-1 border-0 bg-white"
          :src="bscpIframeUrl"
          title="BSCP"
        ></iframe>
        <div
          v-else
          class="min-h-0 w-full flex-1 bg-white"
        ></div>
      </div>
    </Loading>
  </div>
</template>

<script setup lang="ts">
  import { computed, nextTick, reactive, ref, watch } from 'vue';

  import { Alert, Button, Exception, Form, Input, Loading, Message, Popover, Select, Switcher } from 'bkui-vue';
  import { EditLine } from 'bkui-vue/lib/icon';
  import { useI18n } from 'vue-i18n';
  import { BscpcfgService, EnvService } from '~/api/modules/v1';
  import { isHelmLikeAppType } from '~/composables/app-type';
  import { useAppDetail } from '~/stores/app-detail';
  import { useDeployEnvStore } from '~/stores/deploy-env';

  import EnvPerspectiveSelect from '../app-config/env-perspective-select.vue';

  import type { EnvBindingOutput, MetadataOutput } from '~/@types/v1/bscpcfg';
  import type { EnvOutput } from '~/@types/v1/env';

  type ApiError = {
    error?: {
      message?: string;
    };
    message?: string;
    status?: number;
  };

  const { t } = useI18n();
  const appDetailStore = useAppDetail();
  const deployEnvStore = useDeployEnvStore();

  const currentEnvName = ref(deployEnvStore.currentEnv);
  const envSelectorLoading = ref(true);
  const pageLoading = ref(false);
  const enableLoading = ref(false);
  const mountLoading = ref(false);
  const editLoading = ref(false);
  const disableLoading = ref(false);
  const workloadKindOptions = ['Deployment', 'DaemonSet', 'StatefulSet', 'GameDeployment', 'GameStatefulSet'] as const;
  const envList = ref<EnvOutput[]>([]);
  const enabledEnvNames = ref<string[]>([]);
  // Metadata 是应用级共享配置；EnvBinding 只代表当前环境是否已启用文件型配置。
  const metadata = ref<MetadataOutput | null>(null);
  const currentEnvBinding = ref<EnvBindingOutput | null>(null);
  // 环境快速切换时只允许最后一次请求更新页面，避免旧环境状态回写。
  const loadRequestID = ref(0);
  const envListRequestID = ref(0);

  const mountForm = reactive(createMountForm());
  const editForm = reactive(createMountForm());
  const mountFormRef = ref();
  const editFormRef = ref();
  const mountInputRef = ref();
  const editInputRef = ref();
  const enableMountPopoverRef = ref<InstanceType<typeof Popover>>();
  const editPopoverRef = ref<InstanceType<typeof Popover>>();
  const disablePopoverRef = ref<InstanceType<typeof Popover>>();

  const isHelmLikeApp = computed(() => isHelmLikeAppType(appDetailStore.appType));
  const mountPopoverWidth = computed(() => (isHelmLikeApp.value ? 730 : 460));
  // EnvBinding 中 bscpBizID 对应 space，defaultFileAppID 对应当前环境的文件服务。
  const bscpIframeUrl = computed(() => {
    const { bscpBizID, defaultFileAppID } = currentEnvBinding.value || {};
    const bscpOrigin = import.meta.env.BK_BSCP?.replace(/\/+$/, '');
    if (!bscpOrigin || !bscpBizID || !defaultFileAppID) return '';

    return `${bscpOrigin}/space/${encodeURIComponent(bscpBizID)}/service/${encodeURIComponent(defaultFileAppID)}/config`;
  });
  const mountEnabled = computed(() => !!metadata.value?.mountPath?.trim());
  const mountFormRules = {
    mountPath: [
      {
        message: t('请输入挂载路径'),
        trigger: 'blur',
        validator: (value: string) => !!value?.trim(),
      },
    ],
    workloadKind: [
      {
        message: t('请选择应用类型'),
        trigger: 'change',
        validator: (value: string) => !!value,
      },
    ],
    workloadName: [
      {
        message: t('请输入应用名称'),
        trigger: 'blur',
        validator: (value: string) => !!value?.trim(),
      },
    ],
  };

  /** 构建 Metadata PATCH 参数；TAF/TRPC 不提交后端自动维护的工作负载字段。 */
  function buildMountMetadataParams(form: ReturnType<typeof createMountForm>) {
    return {
      appID: appDetailStore.appID,
      mountPath: form.mountPath.trim(),
      ...(isHelmLikeApp.value
        ? {
            workloadKind: form.workloadKind,
            workloadName: form.workloadName.trim(),
          }
        : {}),
    };
  }

  /** 为指定应用和环境创建 BSCP 配置绑定（幂等，409 视为已存在） */
  async function createEnvBinding(appID: string, envName: string) {
    try {
      await BscpcfgService.createBscpCfgEnvBinding(
        {
          appID,
          envName,
        },
        { interceptorErr: false, needStatus: true },
      );
    } catch (error: unknown) {
      // 创建接口返回 409 表示绑定已存在，可按幂等成功处理。
      if (getErrorStatus(error) === 409) return;
      showLoadError(error);
      throw error;
    }
  }

  /** 创建挂载表单的初始值，Helm-like 应用会额外使用工作负载字段。 */
  function createMountForm() {
    return {
      mountPath: '',
      workloadKind: '',
      workloadName: '',
    };
  }

  /** 查询应用下全部环境的配置绑定信息 */
  async function fetchEnvBindings() {
    return BscpcfgService.listBscpCfgEnvBindings(
      { appID: appDetailStore.appID },
      { interceptorErr: false, needStatus: true },
    );
  }

  /** 获取应用级元数据（404 返回 null，表示未初始化） */
  async function fetchMetadata() {
    try {
      return await BscpcfgService.getBscpCfgMetadata(
        { appID: appDetailStore.appID },
        { interceptorErr: false, needStatus: true },
      );
    } catch (error: unknown) {
      // 404 是应用尚未初始化的正常业务状态，不作为页面加载异常提示。
      if (getErrorStatus(error) === 404) return null;
      throw error;
    }
  }

  /** 从 API 错误对象中提取 HTTP 状态码 */
  function getErrorStatus(error: unknown) {
    return (error as ApiError)?.status;
  }

  /** 关闭挂载配置（删除元数据，级联清除所有环境绑定） */
  async function handleDisableMount() {
    disableLoading.value = true;
    try {
      // Metadata DELETE 会级联删除该应用下所有环境绑定，而不只是当前环境。
      await BscpcfgService.deleteBscpCfgMetadata({ appID: appDetailStore.appID });
      metadata.value = null;
      currentEnvBinding.value = null;
      enabledEnvNames.value = [];
      disablePopoverRef.value?.hide();
      Message({ message: t('挂载配置已关闭'), theme: 'success' });
    } finally {
      disableLoading.value = false;
    }
  }

  /** 编辑挂载配置弹窗关闭时：清除校验状态并重置表单。 */
  function handleEditPopoverHidden() {
    editFormRef.value?.clearValidate?.();
    resetMountForm(editForm);
  }

  /** 编辑挂载配置弹窗打开时：回填应用级 Metadata 并聚焦挂载路径输入框。 */
  function handleEditPopoverShow() {
    editForm.mountPath = metadata.value?.mountPath || '';
    editForm.workloadKind = metadata.value?.workloadKind || '';
    editForm.workloadName = metadata.value?.workloadName || '';
    nextTick(() => editInputRef.value?.focus?.());
  }

  /** 启用文件配置：按序初始化元数据 → 创建环境绑定 → 刷新页面状态 */
  async function handleEnableConfig() {
    if (!appDetailStore.appID || !currentEnvName.value || enableLoading.value) return;

    // 固定本次操作的目标，避免初始化期间切换环境后将绑定误创建到新环境。
    const targetAppID = appDetailStore.appID;
    const targetEnvName = currentEnvName.value;
    const shouldInitMetadata = !metadata.value;
    enableLoading.value = true;
    try {
      // EnvBinding 的创建依赖 Metadata：未初始化时必须严格按“初始化 → 创建绑定”执行。
      if (shouldInitMetadata) {
        const initializedMetadata = await BscpcfgService.initBscpCfgMetadata({ appID: targetAppID });
        // 页面仍停留在原应用时才回写，避免应用切换后短暂展示旧应用的 Metadata。
        if (appDetailStore.appID === targetAppID) {
          metadata.value = initializedMetadata;
        }
      }
      // 点击启用时当前环境必然未绑定；创建接口的 409 会按幂等成功处理。
      await createEnvBinding(targetAppID, targetEnvName);
      await loadCurrentState();
      Message({ message: t('启用配置成功'), theme: 'success' });
    } finally {
      enableLoading.value = false;
    }
  }

  /** 启用挂载：Helm-like 应用会同时写入挂载路径和目标工作负载。 */
  async function handleEnableMount() {
    if (!(await validateForm(mountFormRef.value))) return;

    mountLoading.value = true;
    try {
      metadata.value = await BscpcfgService.patchBscpCfgMetadata(buildMountMetadataParams(mountForm));
      enableMountPopoverRef.value?.hide();
      Message({ message: t('挂载配置已启用'), theme: 'success' });
    } finally {
      mountLoading.value = false;
    }
  }

  /** 启用挂载弹窗关闭时：清除校验状态并重置表单 */
  function handleEnableMountPopoverHidden() {
    mountFormRef.value?.clearValidate?.();
    resetMountForm(mountForm);
  }

  /** 启用挂载弹窗打开时：回填可能已有的工作负载数据并聚焦挂载路径输入框。 */
  function handleEnableMountPopoverShow() {
    mountForm.workloadKind = metadata.value?.workloadKind || '';
    mountForm.workloadName = metadata.value?.workloadName || '';
    nextTick(() => mountInputRef.value?.focus?.());
  }

  /** 切换业务配置环境并同步全局当前环境 */
  function handleEnvSelectChange(envName: string) {
    currentEnvName.value = envName;
    deployEnvStore.updateCurrentEnv(envName);
  }

  /** 更新挂载配置：Helm-like 应用会一次性提交路径、工作负载类型和名称。 */
  async function handleUpdateMountPath() {
    if (!(await validateForm(editFormRef.value))) return;

    editLoading.value = true;
    try {
      metadata.value = await BscpcfgService.patchBscpCfgMetadata(buildMountMetadataParams(editForm));
      editPopoverRef.value?.hide();
      Message({ message: t(isHelmLikeApp.value ? '挂载配置修改成功' : '挂载路径修改成功'), theme: 'success' });
    } finally {
      editLoading.value = false;
    }
  }

  /** 加载当前环境配置状态（含请求竞态保护，仅最后一次请求生效） */
  async function loadCurrentState() {
    const appID = appDetailStore.appID;
    const envName = currentEnvName.value;
    const requestID = ++loadRequestID.value;

    if (!appID || !envName) {
      metadata.value = null;
      currentEnvBinding.value = null;
      enabledEnvNames.value = [];
      pageLoading.value = false;
      return;
    }

    pageLoading.value = true;
    try {
      // API 约定先确认应用已初始化；Metadata 不存在时无需、也不应继续查询 EnvBinding。
      const metadataResult = await fetchMetadata();
      if (requestID !== loadRequestID.value) return;

      const bindings = metadataResult ? await fetchEnvBindings() : [];
      if (requestID !== loadRequestID.value) return;
      metadata.value = metadataResult;
      currentEnvBinding.value = bindings.find(item => item.envName === envName) || null;
      enabledEnvNames.value = bindings.map(item => item.envName).filter((name): name is string => !!name);
    } catch (error: unknown) {
      if (requestID !== loadRequestID.value) return;
      metadata.value = null;
      currentEnvBinding.value = null;
      enabledEnvNames.value = [];
      showLoadError(error);
    } finally {
      if (requestID === loadRequestID.value) {
        pageLoading.value = false;
      }
    }
  }

  /** 加载应用环境并初始化业务配置当前环境 */
  async function loadEnvList() {
    const appID = appDetailStore.appID;
    const requestID = ++envListRequestID.value;

    if (!appID) {
      envList.value = [];
      currentEnvName.value = '';
      envSelectorLoading.value = false;
      return;
    }

    envSelectorLoading.value = true;
    const list = await EnvService.listAppEnvs({ appID }).catch(() => []);
    if (requestID !== envListRequestID.value || appDetailStore.appID !== appID) return;

    envList.value = list;
    const preferredEnvName = currentEnvName.value || deployEnvStore.currentEnv;
    const selectedEnv = list.find(item => item.name === preferredEnvName) || list[0];
    currentEnvName.value = selectedEnv?.name || '';
    deployEnvStore.updateCurrentEnv(currentEnvName.value);
    envSelectorLoading.value = false;
  }

  /** 重置挂载表单，避免两个 Popover 之间残留输入或校验状态。 */
  function resetMountForm(form: ReturnType<typeof createMountForm>) {
    form.mountPath = '';
    form.workloadKind = '';
    form.workloadName = '';
  }

  /** 展示加载失败的错误提示信息 */
  function showLoadError(error: unknown) {
    const apiError = error as ApiError;
    Message({
      message: apiError?.error?.message || apiError?.message || t('加载业务配置失败'),
      theme: 'error',
    });
  }

  /** 通用表单校验：调用表单 validate 方法，返回是否通过 */
  async function validateForm(formRef: undefined | { validate?: () => Promise<unknown> }) {
    try {
      await formRef?.validate?.();
      return true;
    } catch {
      return false;
    }
  }

  watch(() => appDetailStore.appID, loadEnvList, { immediate: true });
  watch([() => appDetailStore.appID, currentEnvName], loadCurrentState, { immediate: true });
</script>

<style lang="postcss" scoped>
  :deep(.bk-loading-wrapper),
  :deep(.bk-loading-content) {
    height: 100%;
  }

  /* 修复 Button loading 状态下图标垂直居中 */
  :deep(.bk-button .bk-loading-wrapper) {
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .mount-form-addon {
    display: flex;
    height: 32px;
    flex-shrink: 0;
    align-items: center;
    border: 1px solid #c4c6cc;
    border-right: 0;
    background: #fafbfd;
    padding: 0 12px;
    color: #63656e;
  }
</style>

<!-- Popover 会 Teleport 到 body，需使用非 scoped 样式覆盖组件默认外层 padding。 -->
<style lang="postcss">
  .business-config-mount-popover {
    padding: 0 !important;
  }

  /* 工作负载表单项错误提示与输入框对齐 */
  .business-config-mount-popover .bk-form-item.is-error .bk-form-error {
    position: relative;
    left: 0;
    padding-left: 72px;
  }
</style>
