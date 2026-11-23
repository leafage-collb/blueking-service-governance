/*
 * TencentBlueKing is pleased to support the open source community by making
 * 蓝鲸智云 - 服务治理 (BlueKing Service Governance) available.
 * Copyright (C) Tencent. All rights reserved.
 * Licensed under the MIT License (the "License"); you may not use this file except
 * in compliance with the License. You may obtain a copy of the License at
 *
 *  http://opensource.org/licenses/MIT
 *
 * Unless required by applicable law or agreed to in writing, software distributed under
 * the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND,
 * either express or implied. See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * We undertake not to change the open source license (MIT license) applicable
 * to the current version of the project delivered to anyone in the future.
 */

import { type Locator, expect } from '@playwright/test';

/** 创建和编辑页面共用的 Git 凭证表单。 */
export default class GitRepositoryForm {
  constructor(readonly root: Locator) {}

  /** 点击「连通测试」。 */
  async check() {
    await this.root.getByTestId('git-repo-check').click();
  }

  /** 断言凭据必填校验：三条错误文案，且输入框红框、无聚焦阴影。 */
  async expectEmptyCredentialErrors() {
    await expect(this.root.locator('.git-field-error')).toHaveText([
      '请输入代码仓库地址',
      '请输入仓库账号',
      '请输入仓库密码',
    ]);
    for (const field of ['url', 'username', 'password'] as const) {
      const frame = this.input(field).locator(
        'xpath=ancestor::*[contains(concat(" ",normalize-space(@class)," ")," bk-input ")][1]',
      );
      await expect(frame).toHaveCSS('border-color', '#ea3636');
      await this.input(field).click();
      await expect(frame).toHaveCSS('border-color', '#ea3636');
      await expect(frame).toHaveCSS('box-shadow', 'none');
    }
  }

  /** 断言凭证分组样式与排版；传入默认分支字段时校验其与分组左对齐（创建页），否则与表单等宽（编辑页）。 */
  async expectLayout(defaultBranchField?: Locator) {
    const panel = this.root.getByTestId('git-repo-credentials');
    await expect(panel).toHaveCSS('background-color', '#f5f7fa');
    await expect(panel).toHaveCSS('border-radius', '2px');
    await expect(this.input('url')).toHaveAttribute(
      'placeholder',
      '请输入 HTTPS 仓库地址，如 https://git.example.com/group/app.git',
    );
    const panelBox = await panel.boundingBox();
    const urlBox = await this.input('url').boundingBox();
    const usernameBox = await this.input('username').boundingBox();
    const passwordBox = await this.root.getByTestId('git-repo-password').boundingBox();
    if (!panelBox || !urlBox || !usernameBox || !passwordBox) throw new Error('Git 凭证分组应可见');
    // 三个输入框左对齐且纵向依次排列，并与分组左边缘保持内边距
    expect(Math.abs(urlBox.x - usernameBox.x)).toBeLessThan(2);
    expect(Math.abs(urlBox.x - passwordBox.x)).toBeLessThan(2);
    expect(urlBox.y + urlBox.height).toBeLessThan(usernameBox.y);
    expect(usernameBox.y + usernameBox.height).toBeLessThan(passwordBox.y);
    expect(urlBox.x - panelBox.x).toBeGreaterThanOrEqual(15);
    const hint = this.root.getByText('用于拉取私有仓库，保存后不再显示。修改账号时需要重新填写密码', { exact: true });
    await expect(hint).toHaveCSS('font-size', '12px');
    await expect(hint).toHaveCSS('line-height', '20px');
    await expect(hint).toHaveCSS('color', '#979ba5');
    const hintBox = await hint.boundingBox();
    const checkBox = await this.root.getByTestId('git-repo-check').boundingBox();
    if (!hintBox || !checkBox) throw new Error('密码说明及连通测试按钮应可见');
    // 密码说明位于密码框下方，测试按钮位于说明下方
    expect(hintBox.y).toBeGreaterThanOrEqual(passwordBox.y + passwordBox.height);
    expect(checkBox.y).toBeGreaterThanOrEqual(hintBox.y + hintBox.height);
    if (defaultBranchField) {
      const branchBox = await defaultBranchField.boundingBox();
      if (!branchBox) throw new Error('默认分支字段应可见');
      expect(Math.abs(panelBox.x - branchBox.x)).toBeLessThan(2);
    } else {
      const formBox = await this.root
        .locator('xpath=ancestor::*[contains(concat(" ",normalize-space(@class)," ")," bk-form ")][1]')
        .boundingBox();
      if (!formBox) throw new Error('编辑表单应可见');
      expect(Math.abs(panelBox.x - formBox.x)).toBeLessThan(2);
      expect(Math.abs(panelBox.width - formBox.width)).toBeLessThan(2);
    }
    const result = this.root.getByTestId('git-repo-result');
    if (await result.isVisible()) {
      // 测试结果位于按钮下方，且在分组内与 URL 输入框同宽
      const buttonBox = await this.root.getByTestId('git-repo-check').boundingBox();
      const resultBox = await result.boundingBox();
      if (!buttonBox || !resultBox) throw new Error('连通测试按钮及结果应可见');
      expect(resultBox.y).toBeGreaterThanOrEqual(buttonBox.y + buttonBox.height);
      expect(resultBox.x).toBeGreaterThanOrEqual(panelBox.x);
      expect(resultBox.x + resultBox.width).toBeLessThanOrEqual(panelBox.x + panelBox.width);
      expect(resultBox.y + resultBox.height).toBeLessThanOrEqual(panelBox.y + panelBox.height);
      expect(Math.abs(resultBox.x - urlBox.x)).toBeLessThan(2);
      expect(Math.abs(resultBox.width - urlBox.width)).toBeLessThan(3);
    }
  }

  /** 断言修改密码后的提示态：淡黄底 + 橙色边框，并显示「密码已修改，保存后生效」。 */
  async expectModifiedPasswordAppearance() {
    const input = this.root.locator('.credential-password-modified');
    await expect(input).toHaveCSS('background-color', '#fff8e6');
    await expect(input).toHaveCSS('border-color', '#ff9c01');
    await expect(input).toHaveCSS('box-shadow', 'none');
    await expect(this.input('password')).toHaveCSS('background-color', '#fff8e6');
    await expect(this.root.getByText('密码已修改，保存后生效')).toHaveCSS('color', '#ff9c01');
    await expect(this.root.getByText('密码已修改，保存后生效')).toHaveCSS('line-height', '20px');
  }

  /** 断言连通测试结果文案。 */
  async expectResult(message: RegExp | string) {
    await expect(this.root.getByTestId('git-repo-result')).toContainText(message);
  }

  /** 断言连通测试成功样式，并高亮展示仓库地址。 */
  async expectSuccessAppearance(repoURL: string) {
    const result = this.root.getByTestId('git-repo-result');
    await expect(result).toHaveClass(/bk-alert-success/);
    await expect(result).toHaveCSS('background-color', '#f2fff4');
    await expect(result).toHaveCSS('border-color', '#94f5a4');
    await expect(result).toHaveCSS('border-width', '1px');
    await expect(result).toHaveCSS('color', '#63656e');
    await expect(result.locator('.bk-alert-icon-info')).toBeVisible();
    await expect(result.locator('strong')).toHaveText(repoURL);
    await expect(result.locator('strong')).toHaveCSS('font-weight', '700');
  }

  /** 按需填写凭证字段；密码输入框默认隐藏，需先点击「修改」。 */
  async fill(values: { password?: string; repoURL?: string; username?: string }) {
    if (values.repoURL !== undefined) await this.input('url').fill(values.repoURL);
    if (values.username !== undefined) await this.input('username').fill(values.username);
    if (values.password !== undefined) {
      if (!(await this.input('password').isVisible())) {
        await this.root.getByTestId('git-repo-password').click();
      }
      await this.input('password').fill(values.password);
    }
  }

  /** 定位字段输入框，兼容外层为容器或直接为 input 两种结构。 */
  input(field: 'password' | 'url' | 'username') {
    return this.root.locator(`[data-testid="git-repo-${field}"] input, input[data-testid="git-repo-${field}"]`).first();
  }

  /** 撤销密码修改，恢复为保存时的密码。 */
  async restorePassword() {
    await this.root.getByTestId('git-repo-restore').click();
  }
}
