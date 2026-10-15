<template>
  <el-dialog
    v-model="dialogVisible"
    :title="t('view.member.memberManagement')"
    width="800px"
    :close-on-click-modal="false"
    class="member-management-dialog">
    <div v-loading="loading" class="member-content">
      <!-- 成员列表 -->
      <div class="member-list">
        <div
          v-for="member in members"
          :key="member.user_id"
          class="member-item"
          :class="{ 'is-owner': member.role === 'owner' }">
          <div class="member-info">
            <div class="member-avatar">
              <el-avatar :size="40" :src="member.user?.avatar">
                {{ member.user?.name?.charAt(0) || "U" }}
              </el-avatar>
            </div>
            <div class="member-details">
              <div class="member-name">
                {{ member.user?.name || t('view.member.unknownUser') }}
                <el-tag
                  v-if="member.role === 'owner'"
                  type="warning"
                  size="small"
                  >{{ t('view.member.owner') }}</el-tag
                >
              </div>
              <div class="member-email">{{ member.user?.email || "" }}</div>
            </div>
          </div>
          <div class="member-actions">
            <el-select
              v-if="member.role !== 'owner'"
              v-model="member.role"
              size="small"
              :disabled="!canManageMembers"
              @change="handleRoleChange(member)">
              <el-option :label="t('view.member.roleAdmin')" value="admin" />
              <el-option :label="t('view.member.roleEditor')" value="editor" />
              <el-option :label="t('view.member.roleCommenter')" value="commenter" />
              <el-option :label="t('view.member.roleViewer')" value="viewer" />
            </el-select>
            <el-tag v-else type="warning" size="small">{{ t('view.member.owner') }}</el-tag>

            <el-button
              v-if="member.role === 'owner' && isCurrentUserOwner"
              type="primary"
              size="small"
              text
              @click="openTransferDialog">
              {{ t('view.member.transferOwnership') }}
            </el-button>

            <el-button
              v-if="member.role !== 'owner' && canManageMembers"
              type="danger"
              size="small"
              text
              @click="handleRemoveMember(member)">
              {{ t('view.member.removeMember') }}
            </el-button>
          </div>
        </div>
      </div>

      <!-- 添加成员按钮 -->
      <div v-if="canManageMembers" class="add-member-section">
        <el-button type="primary" @click="showAddMemberDialog = true">
          <el-icon><Plus /></el-icon>
          {{ t('view.member.addMember') }}
        </el-button>
      </div>
    </div>

    <template #footer>
      <el-button @click="closeDialog">{{ t('view.close') }}</el-button>
    </template>
  </el-dialog>

  <!-- 添加成员对话框 -->
  <el-dialog
    v-model="showAddMemberDialog"
    :title="t('view.member.addMemberTitle')"
    width="600px"
    :close-on-click-modal="false">
    <el-tabs v-model="activeTab">
      <el-tab-pane :label="t('view.member.singleAdd')" name="single">
        <el-form
          ref="addMemberFormRef"
          :model="addMemberForm"
          :rules="addMemberFormRules"
          label-width="130px">
          <el-form-item :label="t('view.member.userLabel')" prop="member">
            <MemberSelect
              v-model="addMemberForm.member"
              :return-object="true"
              :placeholder="t('view.member.searchUserPlaceholder')" />
          </el-form-item>
          <el-form-item :label="t('view.member.role')" prop="role">
            <el-select v-model="addMemberForm.role" :placeholder="t('view.member.selectRole')">
              <el-option :label="t('view.member.roleAdmin')" value="admin" />
              <el-option :label="t('view.member.roleEditor')" value="editor" />
              <el-option :label="t('view.member.roleCommenter')" value="commenter" />
              <el-option :label="t('view.member.roleViewer')" value="viewer" />
            </el-select>
          </el-form-item>
        </el-form>
      </el-tab-pane>

      <el-tab-pane :label="t('view.member.batchAdd')" name="batch">
        <el-alert
          :title="t('view.member.batchAddTitle')"
          :description="getLiteral('view.member.batchAddDesc')"
          type="info"
          :closable="false"
          show-icon />
        <el-input
          v-model="batchEmails"
          type="textarea"
          :rows="10"
          :placeholder="getLiteral('view.member.batchEmailsPlaceholder')" />
      </el-tab-pane>
    </el-tabs>

    <template #footer>
      <el-button @click="showAddMemberDialog = false">{{ t('view.cancel') }}</el-button>
      <el-button type="primary" :loading="adding" @click="handleAddMember">
        {{ t('view.member.addMember') }}
      </el-button>
    </template>
  </el-dialog>

  <!-- 转移所有权对话框 -->
  <el-dialog
    v-model="showTransferDialog"
    :title="t('view.member.transferTitle')"
    width="480px"
    append-to-body
    :close-on-click-modal="false">
    <div class="transfer-form">
      <div class="transfer-field">
        <div class="transfer-label">{{ t('view.member.transferTo') }}</div>
        <MemberSelect
          v-model="transferForm.target"
          :return-object="true"
          :placeholder="t('view.member.transferSearchPlaceholder')" />
      </div>

      <div class="transfer-field">
        <div class="transfer-label">{{ t('view.member.transferAfter') }}</div>
        <el-radio-group v-model="transferForm.mode" class="transfer-radio-group">
          <div class="transfer-option">
            <el-radio value="keep">
              <span class="transfer-keep-line">
                {{ t('view.member.transferKeepMyRole') }}
                <el-select
                  v-model="transferForm.keepRole"
                  size="small"
                  class="transfer-role-select"
                  :disabled="transferForm.mode !== 'keep'">
                  <el-option :label="t('view.member.roleAdmin')" value="admin" />
                  <el-option :label="t('view.member.roleEditor')" value="editor" />
                  <el-option :label="t('view.member.roleCommenter')" value="commenter" />
                  <el-option :label="t('view.member.roleViewer')" value="viewer" />
                </el-select>
                {{ t('view.member.transferRoleSuffix') }}
              </span>
            </el-radio>
          </div>
          <div class="transfer-option">
            <el-radio value="remove">{{ t('view.member.transferRemoveMyAccess') }}</el-radio>
          </div>
        </el-radio-group>
      </div>

      <div class="transfer-field">
        <div class="transfer-label">{{ t('view.member.transferBaseName') }}</div>
        <div class="transfer-base-name">{{ currentBaseName }}</div>
      </div>
    </div>

    <template #footer>
      <el-button @click="showTransferDialog = false">{{ t('view.cancel') }}</el-button>
      <el-button
        type="primary"
        :loading="transferring"
        :disabled="transferForm.target.length === 0"
        @click="handleTransferOwnership">
        {{ t('view.member.transferConfirm') }}
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch } from "vue";
import { useI18n } from "vue-i18n";
import { getLiteral } from "@/i18n";
import { ElMessage, ElMessageBox } from "element-plus";
import { Plus } from "@element-plus/icons-vue";
import type { FormInstance, FormRules } from "element-plus";
import { useMemberStore, type BaseMember } from "@/stores/memberStore";
import { useAuthStore } from "@/stores/authStore";
import { useBaseStore } from "@/stores/baseStore";
import MemberSelect, { type Member } from "@/components/common/MemberSelect.vue";

const { t } = useI18n();

const props = defineProps<{
  baseId: string;
  visible: boolean;
}>();

const emit = defineEmits<{
  (e: "update:visible", value: boolean): void;
  (e: "member-changed"): void;
}>();

const memberStore = useMemberStore();
const authStore = useAuthStore();
const baseStore = useBaseStore();

const dialogVisible = computed({
  get: () => props.visible,
  set: (value) => emit("update:visible", value),
});

const loading = ref(false);
const adding = ref(false);
const showAddMemberDialog = ref(false);
const activeTab = ref("single");
const batchEmails = ref("");
const canManageMembers = ref(true); // TODO: 实现权限检查

const members = ref<BaseMember[]>([]);

const addMemberFormRef = ref<FormInstance>();
const addMemberForm = reactive({
  // MemberSelect（returnObject 单选）返回 0/1 个 Member 对象的数组
  member: [] as Member[],
  role: "editor",
});

// 转移所有权状态
const showTransferDialog = ref(false);
const transferring = ref(false);
const transferForm = reactive({
  // MemberSelect（returnObject 单选）返回 0/1 个 Member 对象的数组
  target: [] as Member[],
  // keep: 保留我的协作权限；remove: 不保留
  mode: "keep" as "keep" | "remove",
  keepRole: "admin",
});

const isCurrentUserOwner = computed(() => memberStore.isOwner);
const currentBaseName = computed(() => baseStore.currentBase?.name || "");

const addMemberFormRules: FormRules = {
  member: [
    {
      required: true,
      validator: (_rule, _value, callback) => {
        if (addMemberForm.member.length > 0) {
          callback();
        } else {
          callback(new Error(t("view.member.selectUserRequired")));
        }
      },
      trigger: "change",
    },
  ],
  role: [{ required: true, message: t('view.member.selectRole'), trigger: "change" }],
};

// 监听对话框打开，加载成员列表
watch(
  () => props.visible,
  async (newVal) => {
    if (newVal && props.baseId) {
      await loadMembers();
    }
  },
);

// 加载成员列表
async function loadMembers() {
  loading.value = true;
  try {
    const data = await memberStore.fetchMembers(props.baseId);
    members.value = data as any;
    console.log("加载成员列表成功:", members.value);
  } catch (error) {
    console.error("加载成员列表失败:", error);
    ElMessage.error(t('view.member.loadMembersFailed'));
  } finally {
    loading.value = false;
  }
}

// 处理角色变更
async function handleRoleChange(member: BaseMember) {
  try {
    await memberStore.updateMemberRole(props.baseId, member.user_id, member.role);
    ElMessage.success(t('view.member.memberRoleUpdated'));
    emit("member-changed");
  } catch (error) {
    console.error("更新成员角色失败:", error);
    ElMessage.error(t('view.member.updateMemberRoleFailed'));
    // 恢复原角色
    await loadMembers();
  }
}

// 处理移除成员
async function handleRemoveMember(member: BaseMember) {
  try {
    await ElMessageBox.confirm(
      t('view.member.removeMemberConfirm', { name: member.user?.name || t('view.member.unknownUser') }),
      t('view.member.removeMemberTitle'),
      {
        confirmButtonText: t('view.confirm'),
        cancelButtonText: t('view.cancel'),
        type: "warning",
      },
    );

    await memberStore.removeMember(props.baseId, member.user_id);
    ElMessage.success(t('view.member.memberRemoved'));
    await loadMembers();
    emit("member-changed");
  } catch (error) {
    if (error !== "cancel") {
      console.error("移除成员失败:", error);
      ElMessage.error(t('view.member.removeMemberFailed'));
    }
  }
}

// 打开转移所有权对话框
function openTransferDialog() {
  transferForm.target = [];
  transferForm.mode = "keep";
  transferForm.keepRole = "admin";
  showTransferDialog.value = true;
}

// 处理转移所有权
async function handleTransferOwnership() {
  const target = transferForm.target[0];
  if (!target) return;

  // 不能转移给自己
  if (authStore.user?.id === target.id) {
    ElMessage.warning(t("view.member.transferToSelfForbidden"));
    return;
  }

  transferring.value = true;
  try {
    await memberStore.transferOwnership(
      props.baseId,
      target.id,
      transferForm.mode === "keep" ? transferForm.keepRole : null,
    );
    ElMessage.success(t("view.member.transferSuccess"));
    showTransferDialog.value = false;

    // 同步 baseStore 缓存的所有者信息
    if (baseStore.currentBase?.id === props.baseId) {
      baseStore.currentBase.owner_id = target.id;
    }
    emit("member-changed");

    if (transferForm.mode === "remove") {
      // 不保留协作权限：当前用户已失去该 Base 的成员身份，
      // 无法再查看成员列表（接口会 403），直接关闭成员管理弹窗
      memberStore.clearMembers();
      dialogVisible.value = false;
    }
    // 保留角色场景：memberStore.transferOwnership 内部已刷新成员列表
  } catch (error) {
    console.error("转移所有权失败:", error);
    ElMessage.error(t("view.member.transferFailed"));
  } finally {
    transferring.value = false;
  }
}

// 处理添加成员
async function handleAddMember() {
  if (activeTab.value === "batch") {
    // 批量添加
    await handleBatchAdd();
  } else {
    // 单个添加
    await handleSingleAdd();
  }
}

// 单个添加
async function handleSingleAdd() {
  if (!addMemberFormRef.value) return;

  try {
    await addMemberFormRef.value.validate();
    adding.value = true;

    const selected = addMemberForm.member[0];
    if (!selected) return;

    // 已是成员 / 所有者时后端会拒绝，这里提前校验给出友好提示
    if (members.value.some((m) => m.user_id === selected.id)) {
      ElMessage.warning(t("view.member.userAlreadyMember"));
      return;
    }

    await memberStore.addMember(
      props.baseId,
      selected.email,
      addMemberForm.role,
    );
    ElMessage.success(t('view.member.addMemberSuccess'));
    showAddMemberDialog.value = false;
    await loadMembers();
    emit("member-changed");

    // 重置表单
    addMemberForm.member = [];
    addMemberForm.role = "editor";
  } catch (error) {
    if (error !== "cancel") {
      console.error("添加成员失败:", error);
      ElMessage.error(t('view.member.addMemberFailed'));
    }
  } finally {
    adding.value = false;
  }
}

// 批量添加
async function handleBatchAdd() {
  if (!batchEmails.value.trim()) {
    ElMessage.warning(t('view.member.enterMemberEmails'));
    return;
  }

  try {
    adding.value = true;

    // 解析邮箱列表
    const lines = batchEmails.value.split("\n").filter((line) => line.trim());
    const members = lines.map((line) => {
      const parts = line.trim().split(/\s+/);
      const email = parts[0];
      const role = parts[1] || "editor";
      return { email, role };
    });

    if (members.length === 0) {
      ElMessage.warning(t('view.member.noValidEmail'));
      return;
    }

    const result = await memberStore.batchAddMembers(props.baseId, members);

    if (result.success_count > 0) {
      ElMessage.success(
        t('view.member.batchAddDone', { success: result.success_count, failed: result.failed_count }),
      );

      if (result.failed_count > 0) {
        // 显示失败详情
        const failedDetails = result.failed
          .map((f) => `${f.email}: ${f.error}`)
          .join("\n");
        ElMessage.warning(`${t('view.member.batchAddFailedDetail')}\n${failedDetails}`);
      }

      showAddMemberDialog.value = false;
      await loadMembers();
      emit("member-changed");
      batchEmails.value = "";
    } else {
      ElMessage.error(t('view.member.batchAddFailed'));
    }
  } catch (error) {
    if (error !== "cancel") {
      console.error("批量添加失败:", error);
      ElMessage.error(t('view.member.batchAddFailed'));
    }
  } finally {
    adding.value = false;
  }
}

function closeDialog() {
  dialogVisible.value = false;
}
</script>

<style lang="scss" scoped>
.member-management-dialog {
  .member-content {
    min-height: 300px;
  }

  .member-list {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .member-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 16px;
    background: #f9fafb;
    border-radius: 8px;
    transition: all 0.3s ease;

    &:hover {
      background: #f3f4f6;
    }

    &.is-owner {
      background: #fffbeb;
      border: 1px solid #fcd34d;
    }

    .member-info {
      display: flex;
      align-items: center;
      gap: 12px;
      flex: 1;

      .member-avatar {
        flex-shrink: 0;
      }

      .member-details {
        flex: 1;
        min-width: 0;

        .member-name {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 14px;
          font-weight: 600;
          color: #1f2937;
          margin-bottom: 4px;
        }

        .member-email {
          font-size: 12px;
          color: #6b7280;
        }
      }
    }

    .member-actions {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-shrink: 0;
      width: 160px;
    }
  }

  .add-member-section {
    margin-top: 24px;
    padding-top: 24px;
    border-top: 1px solid #e5e7eb;
    text-align: right;
  }
}

.transfer-form {
  display: flex;
  flex-direction: column;
  gap: 20px;

  .transfer-field {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .transfer-label {
    font-size: 14px;
    font-weight: 600;
    color: #1f2937;
  }

  .transfer-radio-group {
    display: flex;
    flex-direction: column;
    gap: 10px;
    align-items: stretch;

    .transfer-option {
      display: flex;
      align-items: center;

      .el-radio {
        height: auto;
        margin-right: 0;
      }
    }
  }

  .transfer-keep-line {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    white-space: nowrap;
  }

  .transfer-role-select {
    width: 110px;
  }

  .transfer-base-name {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    background: #f3f4f6;
    border-radius: 6px;
    font-size: 14px;
    color: #374151;
    width: fit-content;
  }
}
</style>
