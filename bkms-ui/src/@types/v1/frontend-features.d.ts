/* eslint-disable */
// gen-api-v1.js 自动生成，请勿手动修改
// 来源：apps/bkms-server/docs/apis/swagger.json
// 模块：frontend-features

export interface GetFrontendFeaturesRequest {
}

export interface FrontendFeaturesResponse {
  data?: FrontendFeaturesOutput;
}

export interface FrontendFeaturesOutput {
  /**
   * 当前环境支持的代码库类型及其鉴权方式
   */
  codeRepoTypes?: CodeRepoTypeOutput[];
  /**
   * 是否允许空间自建北极星接入点并按集群绑定。为 false 时前端隐藏接入点管理、集群绑定、组件安装等入口，
   * 所有集群都使用平台托管接入点
   */
  polarisWorkspaceAccessPoint?: boolean;
}

export interface CodeRepoTypeOutput {
  /**
   * 支持的鉴权方式：OAUTH（OAuth 授权）/ PASSWORD（账号、密码），第一个为默认鉴权方式
   */
  authTypes?: ("OAUTH" | "PASSWORD")[];
  /**
   * 代码库类型，如 TGit
   */
  type?: string;
}
