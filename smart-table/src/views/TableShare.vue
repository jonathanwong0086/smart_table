<template>
  <div class="table-share-page">
    <div v-loading="loading" class="share-content">
      <!-- 加载分享信息 -->
      <div v-if="!error && shareData" class="share-success">
        <div class="share-header">
          <div class="table-icon">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              width="40"
              height="40">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <path d="M3 9h18M3 15h18M9 3v18M15 3v18" />
            </svg>
          </div>
          <h1 class="table-name">{{ shareData.table.name }}</h1>
          <div class="permission-badge">
            <el-tag :type="permissionTagType" size="large">
              <el-icon><Lock /></el-icon>
              {{ permissionText }}
            </el-tag>
          </div>
        </div>

        <div class="share-actions">
          <el-button
            type="primary"
            size="large"
            :loading="joining"
            @click="enterTable">
            <el-icon><ArrowRight /></el-icon>
            {{ joining ? t("view.share.tableShare.landing.entering") : t("view.share.tableShare.landing.enterButton") }}
          </el-button>
        </div>

        <div class="share-info">
          <el-alert
            :title="permissionAlert"
            :type="permissionAlertType"
            :closable="false"
            show-icon />

          <div class="info-list">
            <div class="info-item">
              <span class="info-label">{{ t("view.share.tableShare.landing.tableLabel") }}</span>
              <span class="info-value">{{ shareData.table.name }}</span>
            </div>
            <div class="info-item">
              <span class="info-label">{{ t("view.share.tableShare.landing.baseLabel") }}</span>
              <span class="info-value">
                <span
                  class="base-dot"
                  :style="{ backgroundColor: shareData.base.color || '#6366f1' }" />
                {{ shareData.base.name }}
              </span>
            </div>
            <div class="info-item">
              <span class="info-label">{{ t("view.share.tableShare.landing.viewsLabel") }}</span>
              <span class="info-value">
                <template v-if="shareData.view_scope === 'all'">
                  {{ t("view.share.tableShare.landing.viewsAll", { count: shareData.views.length }) }}
                </template>
                <template v-else>
                  {{ t("view.share.tableShare.landing.viewsSpecified", { count: shareData.views.length }) }}
                  <span v-if="shareData.views.length > 0" class="view-names">
                    {{ shareData.views.map((v) => v.name).join("、") }}
                  </span>
                </template>
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- 错误状态 -->
      <div v-else-if="error" class="share-error">
        <el-icon :size="64" color="#f56c6c"><WarningFilled /></el-icon>
        <h2>{{ t("view.share.tableShare.landing.invalid") }}</h2>
        <p class="error-message">{{ errorMessage }}</p>
        <el-button type="primary" @click="goHome">
          {{ t("view.share.tableShare.landing.backHome") }}
        </el-button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import { ElMessage } from "element-plus";
import { ArrowRight, Lock, WarningFilled } from "@element-plus/icons-vue";
import { useTableShareStore } from "@/stores/tableShareStore";
import { useAuthStore } from "@/stores/authStore";
import type { TableShareAccessInfo, TableShareJoinResult } from "@/services/api/shareApiService";

const route = useRoute();
const router = useRouter();
const { t } = useI18n();

const tableShareStore = useTableShareStore();
const authStore = useAuthStore();

const loading = ref(true);
const error = ref(false);
const errorMessage = ref("");
const joining = ref(false);
const shareData = ref<TableShareAccessInfo | null>(null);

const token = computed(() => {
  return route.params.token as string;
});

const permission = computed(() => shareData.value?.permission || "viewer");

const permissionText = computed(() => {
  if (permission.value === "editor") return t("view.share.tableShare.permissionEditor");
  if (permission.value === "commenter") return t("view.share.tableShare.permissionCommenter");
  return t("view.share.tableShare.permissionViewer");
});

const permissionTagType = computed(() => {
  if (permission.value === "editor") return "warning";
  if (permission.value === "commenter") return "primary";
  return "info";
});

const permissionAlert = computed(() => {
  if (permission.value === "editor") return t("view.share.tableShare.landing.editorAlert");
  if (permission.value === "commenter") return t("view.share.tableShare.landing.commenterAlert");
  return t("view.share.tableShare.landing.viewerAlert");
});

const permissionAlertType = computed(() => {
  if (permission.value === "viewer") return "info";
  return "success";
});

// 加载分享信息
async function loadShareInfo() {
  loading.value = true;
  error.value = false;

  try {
    const data = await tableShareStore.accessShare(token.value);
    shareData.value = data;
    document.title = `${data.table.name} - ${t("view.share.tableShare.landing.pageTitle")}`;
  } catch (err: any) {
    error.value = true;
    errorMessage.value = err?.message || t("view.share.tableShare.landing.invalid");
    console.error("加载数据表分享信息失败:", err);
  } finally {
    loading.value = false;
  }
}

// 进入表格
async function enterTable() {
  if (!shareData.value) return;

  // 未登录：先尝试从本地 token 恢复会话（公开路由不经过守卫的 checkAuth，
  // 刷新/新标签打开时 isAuthenticated 内存态为 false，但 localStorage 可能仍有有效 token）
  if (!authStore.isAuthenticated) {
    const restored = await authStore.checkAuth().catch(() => false);
    if (!restored) {
      ElMessage.warning(t("view.share.tableShare.landing.needLogin"));
      router.push({
        path: "/login",
        query: { redirect: route.fullPath },
      });
      return;
    }
  }

  joining.value = true;
  try {
    const result: TableShareJoinResult = await tableShareStore.joinShare(token.value);

    // 已是 Base 成员时 join 响应不含 base_id/table_id，回退使用公开访问接口的数据
    const targetBaseId = result.base_id || shareData.value?.base.id;
    const targetTableId = result.table_id || shareData.value?.table.id;

    // 将分享信息存储到 localStorage，供 Base 页面识别受限模式
    if (targetBaseId) {
      localStorage.setItem(
        `table_share_permission_${targetBaseId}`,
        JSON.stringify({
          share_token: token.value,
          table_id: targetTableId,
          base_id: targetBaseId,
        })
      );
      await router.push(`/base/${targetBaseId}`);
    } else {
      ElMessage.error(t("view.share.tableShare.landing.invalid"));
    }
  } catch (err: any) {
    error.value = true;
    errorMessage.value = err?.message || t("view.share.tableShare.landing.invalid");
    console.error("加入数据表分享失败:", err);
  } finally {
    joining.value = false;
  }
}

// 返回首页
function goHome() {
  router.push("/");
}

onMounted(() => {
  if (token.value) {
    loadShareInfo();
  } else {
    error.value = true;
    errorMessage.value = t("view.share.tableShare.landing.invalid");
    loading.value = false;
  }
});
</script>

<style lang="scss" scoped>
.table-share-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  padding: 20px;
}

.share-content {
  width: 100%;
  max-width: 600px;
  background: white;
  border-radius: 16px;
  padding: 40px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
}

.share-success {
  text-align: center;

  .share-header {
    margin-bottom: 32px;

    .table-icon {
      width: 80px;
      height: 80px;
      border-radius: 16px;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 24px;
      background: #eef2ff;
      color: #6366f1;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
    }

    .table-name {
      font-size: 28px;
      font-weight: 700;
      color: #1f2937;
      margin: 0 0 16px;
      word-break: break-all;
    }

    .permission-badge {
      display: inline-block;

      .el-tag {
        display: inline-flex;
        align-items: center;
        gap: 4px;
      }
    }
  }

  .share-actions {
    margin-bottom: 24px;
  }

  .share-info {
    text-align: left;

    .info-list {
      margin-top: 16px;

      .info-item {
        display: flex;
        align-items: baseline;
        gap: 12px;
        padding: 10px 0;
        border-bottom: 1px solid #f3f4f6;
        font-size: 14px;

        &:last-child {
          border-bottom: none;
        }

        .info-label {
          flex-shrink: 0;
          width: 96px;
          color: #9ca3af;
        }

        .info-value {
          color: #1f2937;
          word-break: break-all;

          .base-dot {
            display: inline-block;
            width: 10px;
            height: 10px;
            border-radius: 3px;
            margin-right: 6px;
            vertical-align: baseline;
          }

          .view-names {
            display: block;
            margin-top: 4px;
            font-size: 13px;
            color: #6b7280;
          }
        }
      }
    }
  }
}

.share-error {
  text-align: center;
  padding: 40px 20px;

  h2 {
    margin: 24px 0 12px;
    font-size: 24px;
    font-weight: 600;
    color: #1f2937;
  }

  .error-message {
    margin: 0 0 32px;
    font-size: 14px;
    color: #6b7280;
  }
}
</style>
