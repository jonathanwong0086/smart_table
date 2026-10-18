<template>
  <el-dialog
    v-model="dialogVisible"
    :title="t('view.share.tableShare.title')"
    width="640px"
    :close-on-click-modal="false"
    class="table-share-dialog"
    @closed="handleClosed">

    <div v-loading="loading" class="share-content">
      <!-- 引导态：未开启分享 -->
      <div v-if="!loading && !share" class="enable-guide">
        <el-icon :size="64" color="#C0C4CC"><Share /></el-icon>
        <h3>{{ t('view.share.tableShare.shareTableTitle') }}</h3>
        <el-button
          type="primary"
          size="large"
          :loading="creating"
          @click="handleEnableShare">
          {{ t('view.share.tableShare.enableShare') }}
        </el-button>
      </div>

      <!-- 已开启态 -->
      <div v-else-if="share" class="share-config">
        <!-- 分享链接 -->
        <div class="link-section">
          <div class="link-label">{{ t('view.share.tableShare.linkLabel') }}</div>
          <div class="link-row">
            <el-input :model-value="shareUrl" readonly class="link-input" />
            <el-button type="primary" plain @click="copyLink">
              {{ t('view.share.tableShare.copyLink') }}
            </el-button>
          </div>
          <div class="status-row">
            <el-switch
              v-model="isActive"
              :before-change="beforeToggleActive"
              @change="handleActiveChange" />
            <el-tag v-if="isExpiredShare" type="danger" size="small">
              {{ t('view.share.tableShare.statusExpired') }}
            </el-tag>
            <el-tag v-else-if="isActive" type="success" size="small">
              {{ t('view.share.tableShare.statusActive') }}
            </el-tag>
            <el-tag v-else type="info" size="small">
              {{ t('view.share.tableShare.statusDisabled') }}
            </el-tag>
            <span class="visit-count">
              {{ t('view.share.tableShare.visitCount', { count: share.access_count }) }}
            </span>
          </div>
        </div>

        <!-- 配置 -->
        <el-form label-width="100px" class="config-form" @submit.prevent>
          <el-form-item :label="t('view.share.tableShare.permission')">
            <div class="permission-block">
              <el-radio-group v-model="form.permission">
                <el-radio value="editor">{{ t('view.share.tableShare.permissionEditor') }}</el-radio>
                <el-radio value="commenter">{{ t('view.share.tableShare.permissionCommenter') }}</el-radio>
                <el-radio value="viewer">{{ t('view.share.tableShare.permissionViewer') }}</el-radio>
              </el-radio-group>
              <div class="permission-desc">{{ permissionDesc }}</div>
            </div>
          </el-form-item>

          <el-form-item :label="t('view.share.tableShare.viewScope')">
            <div class="view-scope-block">
              <el-radio-group v-model="form.viewScope">
                <el-radio value="all">{{ t('view.share.tableShare.allViews') }}</el-radio>
                <el-radio value="specified">{{ t('view.share.tableShare.specifiedViews') }}</el-radio>
              </el-radio-group>
              <el-select
                v-if="form.viewScope === 'specified'"
                v-model="form.viewIds"
                multiple
                filterable
                :placeholder="t('view.share.tableShare.selectViewsPlaceholder')"
                class="view-select">
                <el-option
                  v-for="view in viewStore.sortedViews"
                  :key="view.id"
                  :label="view.name"
                  :value="view.id" />
              </el-select>
            </div>
          </el-form-item>

          <el-form-item :label="t('view.share.tableShare.validity')">
            <div class="validity-block">
              <el-select v-model="form.expiresAtType">
                <el-option :label="t('view.share.tableShare.permanent')" value="permanent" />
                <el-option :label="t('view.share.tableShare.days7')" value="7days" />
                <el-option :label="t('view.share.tableShare.days30')" value="30days" />
                <el-option :label="t('view.share.tableShare.custom')" value="custom" />
              </el-select>
              <el-date-picker
                v-if="form.expiresAtType === 'custom'"
                v-model="form.customExpiresAt"
                type="datetime"
                :placeholder="t('view.share.tableShare.expireTime')"
                :disabled-date="disabledDate"
                value-format="X" />
            </div>
          </el-form-item>
        </el-form>

        <!-- 危险操作 -->
        <div class="danger-row">
          <el-button type="danger" plain @click="handleDeleteShare">
            {{ t('view.share.tableShare.delete') }}
          </el-button>
        </div>

        <!-- 已加入用户 -->
        <div class="members-section">
          <h4 class="section-title">{{ t('view.share.tableShare.joinedUsers') }}</h4>
          <div v-if="membersLoading" v-loading="true" class="members-loading" />
          <div v-else-if="members.length === 0" class="members-empty">
            {{ t('view.share.tableShare.joinedUsersEmpty') }}
          </div>
          <div v-else class="members-list">
            <div v-for="member in members" :key="member.user_id" class="member-item">
              <el-avatar :size="32" :src="member.user?.avatar || undefined">
                {{ avatarText(member) }}
              </el-avatar>
              <div class="member-info">
                <span class="member-name">{{ member.user?.name || member.user?.email || member.user_id }}</span>
                <span v-if="member.user?.email" class="member-email">{{ member.user.email }}</span>
              </div>
              <el-tag size="small" type="info">{{ permissionText }}</el-tag>
              <span class="member-joined-at">
                {{ t('view.share.tableShare.joinedAt') }} {{ formatJoinedAt(member.joined_at) }}
              </span>
              <el-button
                v-if="canRemoveMember(member)"
                class="member-remove"
                type="danger"
                link
                size="small"
                :disabled="removingUserId !== null"
                :loading="removingUserId === member.user_id"
                @click="handleRemoveMember(member)">
                {{ t('view.share.tableShare.removeMember') }}
              </el-button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <template #footer>
      <el-button @click="dialogVisible = false">{{ t('view.close') }}</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch, nextTick } from "vue";
import { useI18n } from "vue-i18n";
import { ElMessage, ElMessageBox } from "element-plus";
import { Share } from "@element-plus/icons-vue";
import { useTableShareStore } from "@/stores/tableShareStore";
import { useViewStore } from "@/stores/viewStore";
import { useAuthStore } from "@/stores/authStore";
import type { TableShare, TableShareMember } from "@/services/api/shareApiService";
import type { UpdateTableSharePayload } from "@/services/api/shareApiService";
import { formatDateTime } from "@/utils/timezone";

const { t } = useI18n();

const props = defineProps<{
  tableId: string;
  tableName?: string;
  visible: boolean;
}>();

const emit = defineEmits<{
  (e: "update:visible", value: boolean): void;
}>();

const tableShareStore = useTableShareStore();
const viewStore = useViewStore();
const authStore = useAuthStore();

const currentUserId = computed(() => authStore.user?.id || "");
const removingUserId = ref<string | null>(null);

const dialogVisible = computed({
  get: () => props.visible,
  set: (value) => emit("update:visible", value),
});

const loading = ref(false);
const creating = ref(false);
const membersLoading = ref(false);
const share = ref<TableShare | null>(null);
const members = ref<TableShareMember[]>([]);
const isActive = ref(true);

const form = reactive({
  permission: "viewer" as "editor" | "commenter" | "viewer",
  viewScope: "all" as "all" | "specified",
  viewIds: [] as string[],
  expiresAtType: "permanent" as "permanent" | "7days" | "30days" | "custom",
  customExpiresAt: null as string | number | null,
});

let hydrating = false;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

const shareUrl = computed(() => {
  if (!share.value) return "";
  return `${window.location.origin}/#/share/table/${share.value.share_token}`;
});

const isExpiredShare = computed(() => {
  if (!share.value?.expires_at) return false;
  return Date.now() > share.value.expires_at * 1000;
});

const permissionDesc = computed(() => {
  if (form.permission === "editor") return t("view.share.tableShare.permissionEditorDesc");
  if (form.permission === "commenter") return t("view.share.tableShare.permissionCommenterDesc");
  return t("view.share.tableShare.permissionViewerDesc");
});

const permissionText = computed(() => {
  if (!share.value) return "";
  if (share.value.permission === "editor") return t("view.share.tableShare.permissionEditor");
  if (share.value.permission === "commenter") return t("view.share.tableShare.permissionCommenter");
  return t("view.share.tableShare.permissionViewer");
});

// 监听对话框打开，加载分享信息
watch(
  () => props.visible,
  async (newVal) => {
    if (newVal && props.tableId) {
      await load();
    }
  }
);

// 配置变更即保存（防抖）
watch(
  form,
  () => {
    if (hydrating || !share.value || !props.visible) return;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      void saveConfig();
    }, 500);
  },
  { deep: true }
);

watch(
  () => share.value?.is_active,
  (val) => {
    isActive.value = !!val;
  }
);

async function load() {
  loading.value = true;
  try {
    // 视图选项（视图多选用）：当前表视图通常已加载，缺失时补充加载
    if (viewStore.views.length === 0) {
      try {
        await viewStore.loadViews(props.tableId);
      } catch {
        // 选项加载失败不阻塞分享配置展示
      }
    }

    const shares = await tableShareStore.fetchShares(props.tableId);
    // 一个表一条分享即可：多条时取最新
    const latest = [...shares].sort((a, b) =>
      (b.created_at || "").localeCompare(a.created_at || "")
    )[0];
    if (latest) {
      hydrate(latest);
      void loadMembers(latest.id);
    } else {
      share.value = null;
      members.value = [];
    }
  } catch (e) {
    console.error("[TableShareDialog] load failed:", e);
    ElMessage.error(t("view.share.tableShare.loadFailed"));
  } finally {
    loading.value = false;
  }
}

function hydrate(target: TableShare) {
  hydrating = true;
  share.value = target;
  isActive.value = !!target.is_active;
  form.permission = target.permission;
  form.viewScope = target.view_scope;
  form.viewIds = target.view_ids ? [...target.view_ids] : [];
  if (target.expires_at) {
    form.expiresAtType = "custom";
    form.customExpiresAt = target.expires_at;
  } else {
    form.expiresAtType = "permanent";
    form.customExpiresAt = null;
  }
  // 等待 deep watcher 跳过本次赋值
  nextTick(() => {
    hydrating = false;
  });
}

async function loadMembers(shareId: string) {
  membersLoading.value = true;
  try {
    members.value = await tableShareStore.fetchMembers(shareId);
  } catch (e) {
    console.error("[TableShareDialog] load members failed:", e);
    ElMessage.error(t("view.share.tableShare.loadFailed"));
  } finally {
    membersLoading.value = false;
  }
}

// 自身行不展示移除按钮（创建者/管理员的访问不通过表分享授予，后端亦拦截）
function canRemoveMember(member: TableShareMember) {
  return member.user_id !== currentUserId.value;
}

// 移除已加入用户：二次确认 → 调用后端移除接口 → 刷新列表
async function handleRemoveMember(member: TableShareMember) {
  const current = share.value;
  if (!current || removingUserId.value) return;

  const displayName = member.user?.name || member.user?.email || "";
  try {
    await ElMessageBox.confirm(
      t("view.share.tableShare.removeMemberConfirm", { name: displayName }),
      t("view.share.tableShare.title"),
      {
        confirmButtonText: t("view.confirm"),
        cancelButtonText: t("view.cancel"),
        type: "warning",
      }
    );
  } catch {
    return;
  }

  removingUserId.value = member.user_id;
  try {
    await tableShareStore.removeMember(current.id, member.user_id);
    members.value = members.value.filter((m) => m.user_id !== member.user_id);
    ElMessage.success(t("view.share.tableShare.removeMemberSuccess"));
  } catch (e) {
    console.error("[TableShareDialog] remove member failed:", e);
    const msg = e instanceof Error && e.message ? e.message : "";
    ElMessage.error(msg || t("view.share.tableShare.removeMemberFailed"));
    // 失败后重新拉取，保证列表与服务端一致
    void loadMembers(current.id);
  } finally {
    removingUserId.value = null;
  }
}

function resolveExpiresAt(): number | null {
  if (form.expiresAtType === "7days") {
    return Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60;
  }
  if (form.expiresAtType === "30days") {
    return Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60;
  }
  if (form.expiresAtType === "custom") {
    return form.customExpiresAt ? Number(form.customExpiresAt) : null;
  }
  return null;
}

async function saveConfig() {
  const current = share.value;
  if (!current) return;
  if (form.viewScope === "specified" && form.viewIds.length === 0) return;
  if (form.expiresAtType === "custom" && !form.customExpiresAt) return;

  const payload: UpdateTableSharePayload = {
    permission: form.permission,
    view_scope: form.viewScope,
    view_ids: form.viewScope === "specified" ? [...form.viewIds] : null,
    expires_at: resolveExpiresAt(),
  };

  try {
    const updated = await tableShareStore.updateShare(current.id, payload);
    share.value = { ...current, ...updated };
    ElMessage.success(t("view.share.tableShare.updateSuccess"));
  } catch (e) {
    console.error("[TableShareDialog] save config failed:", e);
    ElMessage.error(t("view.share.tableShare.saveFailed"));
  }
}

// 开启分享
async function handleEnableShare() {
  creating.value = true;
  try {
    const created = await tableShareStore.createShare(props.tableId, {
      permission: "viewer",
      view_scope: "all",
      view_ids: null,
      expires_at: null,
    });
    ElMessage.success(t("view.share.tableShare.enableShareSuccess"));
    hydrate(created);
    void loadMembers(created.id);
  } catch (e) {
    console.error("[TableShareDialog] create share failed:", e);
    ElMessage.error(t("view.share.tableShare.createFailed"));
  } finally {
    creating.value = false;
  }
}

// 停用前确认
function beforeToggleActive() {
  if (isActive.value) {
    return ElMessageBox.confirm(
      t("view.share.tableShare.disableShareConfirm"),
      t("view.share.tableShare.title"),
      {
        confirmButtonText: t("view.confirm"),
        cancelButtonText: t("view.cancel"),
        type: "warning",
      }
    )
      .then(() => true)
      .catch(() => false);
  }
  return true;
}

async function handleActiveChange() {
  const current = share.value;
  if (!current) return;
  try {
    const updated = await tableShareStore.updateShare(current.id, {
      is_active: isActive.value,
    });
    share.value = { ...current, ...updated };
    ElMessage.success(
      isActive.value
        ? t("view.share.tableShare.shareEnabled")
        : t("view.share.tableShare.shareDisabled")
    );
  } catch (e) {
    isActive.value = !isActive.value;
    console.error("[TableShareDialog] toggle active failed:", e);
    ElMessage.error(t("view.share.tableShare.saveFailed"));
  }
}

// 删除分享
async function handleDeleteShare() {
  const current = share.value;
  if (!current) return;
  try {
    await ElMessageBox.confirm(
      t("view.share.tableShare.deleteShareConfirm"),
      t("view.share.tableShare.title"),
      {
        confirmButtonText: t("view.confirm"),
        cancelButtonText: t("view.cancel"),
        type: "warning",
      }
    );
  } catch {
    return;
  }

  try {
    await tableShareStore.deleteShare(current.id);
    ElMessage.success(t("view.share.tableShare.deleteSuccess"));
    share.value = null;
    members.value = [];
  } catch (e) {
    console.error("[TableShareDialog] delete share failed:", e);
    ElMessage.error(t("view.share.tableShare.saveFailed"));
  }
}

// 复制链接
async function copyLink() {
  try {
    await navigator.clipboard.writeText(shareUrl.value);
    ElMessage.success(t("view.share.tableShare.copySuccess"));
  } catch {
    ElMessage.error(t("view.share.tableShare.copyFailed"));
  }
}

function disabledDate(date: Date) {
  return date.getTime() < Date.now();
}

function avatarText(member: TableShareMember) {
  const name = member.user?.name || member.user?.email || "";
  return name ? name.charAt(0).toUpperCase() : "?";
}

function formatJoinedAt(dateString: string) {
  if (!dateString) return "-";
  return formatDateTime(dateString, "YYYY-MM-DD HH:mm");
}

function handleClosed() {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
    // 关闭弹窗时 flush 未落盘的配置变更，避免静默丢失
    void saveConfig();
  }
}
</script>

<style lang="scss" scoped>
.table-share-dialog {
  .share-content {
    min-height: 240px;
  }

  .enable-guide {
    text-align: center;
    padding: 40px 20px;

    h3 {
      margin: 16px 0 24px;
      font-size: 18px;
      color: #374151;
    }
  }

  .share-config {
    .link-section {
      margin-bottom: 20px;

      .link-label {
        font-size: 13px;
        color: #6b7280;
        margin-bottom: 8px;
      }

      .link-row {
        display: flex;
        gap: 8px;

        .link-input {
          flex: 1;

          :deep(.el-input__inner) {
            font-size: 13px;
          }
        }
      }

      .status-row {
        display: flex;
        align-items: center;
        gap: 10px;
        margin-top: 12px;

        .visit-count {
          font-size: 12px;
          color: #9ca3af;
          margin-left: auto;
        }
      }
    }

    .config-form {
      .permission-block,
      .view-scope-block,
      .validity-block {
        width: 100%;
      }

      .permission-desc {
        font-size: 12px;
        color: #9ca3af;
        margin-top: 4px;
        line-height: 1.5;
      }

      .view-select,
      .validity-block .el-date-editor {
        margin-top: 8px;
        width: 100%;
      }
    }

    .danger-row {
      display: flex;
      justify-content: flex-end;
      padding-top: 8px;
      border-top: 1px solid #f3f4f6;
    }

    .members-section {
      margin-top: 20px;

      .section-title {
        font-size: 14px;
        font-weight: 600;
        color: #374151;
        margin: 0 0 12px;
      }

      .members-loading {
        height: 60px;
      }

      .members-empty {
        font-size: 13px;
        color: #9ca3af;
        text-align: center;
        padding: 20px 0;
      }

      .members-list {
        display: flex;
        flex-direction: column;
        gap: 10px;

        .member-item {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 8px 12px;
          background: #f9fafb;
          border-radius: 8px;

          .member-info {
            display: flex;
            flex-direction: column;
            flex: 1;
            min-width: 0;

            .member-name {
              font-size: 13px;
              color: #1f2937;
            }

            .member-email {
              font-size: 12px;
              color: #9ca3af;
              overflow: hidden;
              text-overflow: ellipsis;
              white-space: nowrap;
            }
          }

          .member-joined-at {
            font-size: 12px;
            color: #9ca3af;
            white-space: nowrap;
          }

          .member-remove {
            flex-shrink: 0;
          }
        }
      }
    }
  }
}
</style>
