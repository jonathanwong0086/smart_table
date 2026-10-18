import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { shareApiService } from "@/services/api/shareApiService";
import { t } from "@/i18n";
import { useAuthStore } from "./authStore";

export interface BaseMember {
  id: string;
  base_id: string;
  user_id: string;
  role: "owner" | "admin" | "editor" | "commenter" | "viewer";
  invited_by: string | null | undefined;
  joined_at: string;
  user?: {
    id: string;
    name: string;
    avatar?: string;
    email?: string;
  };
}

export const useMemberStore = defineStore("member", () => {
  const members = ref<BaseMember[]>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);

  const currentBaseOwnerId = ref<string | null>(null);

  // 数据表分享受限模式：非 Base 成员通过表分享链接访问时的临时角色
  const shareRole = ref<string | null>(null);
  const shareRestricted = ref(false);

  const currentUserRole = computed(() => {
    const authStore = useAuthStore();
    const currentUserId = authStore.user?.id;
    if (!currentUserId) return null;

    if (currentBaseOwnerId.value === currentUserId) {
      return "owner";
    }

    const member = members.value.find((m) => m.user_id === currentUserId);
    // 成员列表查不到（受限用户）时回退到表分享角色
    return member?.role || shareRole.value || null;
  });

  const canEdit = computed(() => {
    const role = currentUserRole.value;
    return role === "owner" || role === "admin" || role === "editor";
  });

  const canView = computed(() => {
    const role = currentUserRole.value;
    return ["owner", "admin", "editor", "commenter", "viewer"].includes(role || "");
  });

  const canManage = computed(() => {
    const role = currentUserRole.value;
    return role === "owner" || role === "admin";
  });

  const isOwner = computed(() => {
    return currentUserRole.value === "owner";
  });

  // 数据表分享受限模式（非 Base 成员、仅通过表分享链接访问）
  const isTableShareRestricted = computed(() => shareRestricted.value);

  function setShareRole(role: string | null) {
    shareRole.value = role;
    shareRestricted.value = role !== null;
  }

  function setCurrentBaseOwner(ownerId: string | null) {
    currentBaseOwnerId.value = ownerId;
  }

  async function fetchMembers(baseId: string) {
    loading.value = true;
    error.value = null;
    try {
      const data = await shareApiService.getMembers(baseId);
      members.value = data as any;
      return data;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : t('common.member.fetchListFailed');
      error.value = msg;
      console.error("[memberStore] fetchMembers failed:", e);
      throw e;
    } finally {
      loading.value = false;
    }
  }

  async function addMember(baseId: string, email: string, role: string) {
    loading.value = true;
    try {
      const data = await shareApiService.addMember(baseId, email, role);
      members.value.push(data as any);
      return data;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : t('common.member.addFailed');
      error.value = msg;
      console.error("[memberStore] addMember failed:", e);
      throw e;
    } finally {
      loading.value = false;
    }
  }

  async function batchAddMembers(
    baseId: string,
    membersData: Array<{ email: string; role: string }>
  ) {
    loading.value = true;
    try {
      const result = await shareApiService.batchAddMembers(baseId, membersData);
      result.successful.forEach((member) => {
        members.value.push(member as any);
      });
      return result;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : t('common.member.batchAddFailed');
      error.value = msg;
      console.error("[memberStore] batchAddMembers failed:", e);
      throw e;
    } finally {
      loading.value = false;
    }
  }

  async function updateMemberRole(baseId: string, userId: string, role: string) {
    loading.value = true;
    try {
      const data = await shareApiService.updateMemberRole(baseId, userId, role);
      const idx = members.value.findIndex((m) => m.user_id === userId);
      if (idx !== -1) {
        members.value[idx] = data as any;
      }
      return data;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : t('common.member.updateRoleFailed');
      error.value = msg;
      console.error("[memberStore] updateMemberRole failed:", e);
      throw e;
    } finally {
      loading.value = false;
    }
  }

  async function removeMember(baseId: string, userId: string) {
    loading.value = true;
    try {
      await shareApiService.removeMember(baseId, userId);
      members.value = members.value.filter((m) => m.user_id !== userId);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : t('common.member.removeFailed');
      error.value = msg;
      console.error("[memberStore] removeMember failed:", e);
      throw e;
    } finally {
      loading.value = false;
    }
  }

  async function transferOwnership(
    baseId: string,
    targetUserId: string,
    formerOwnerRole: string | null
  ) {
    loading.value = true;
    try {
      await shareApiService.transferOwnership(baseId, targetUserId, formerOwnerRole);
      // 同步所有者判定
      currentBaseOwnerId.value = targetUserId;

      if (formerOwnerRole !== null) {
        // 保留角色：当前用户仍是成员，刷新成员列表反映新的角色关系；
        // 刷新失败不应误判为转移失败
        try {
          await fetchMembers(baseId);
        } catch (refreshErr) {
          console.error("[memberStore] transferOwnership: refresh members failed:", refreshErr);
        }
      }
      // formerOwnerRole === null（不保留协作权限）：当前用户已失去成员身份，
      // 成员列表接口会返回 403，跳过刷新
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : t('common.member.transferFailed');
      error.value = msg;
      console.error("[memberStore] transferOwnership failed:", e);
      throw e;
    } finally {
      loading.value = false;
    }
  }

  function clearMembers() {
    members.value = [];
    currentBaseOwnerId.value = null;
    shareRole.value = null;
    shareRestricted.value = false;
  }

  function clearError() {
    error.value = null;
  }

  function $reset() {
    members.value = [];
    loading.value = false;
    error.value = null;
    currentBaseOwnerId.value = null;
    shareRole.value = null;
    shareRestricted.value = false;
  }

  return {
    members,
    loading,
    error,
    currentUserRole,
    canEdit,
    canView,
    canManage,
    isOwner,
    shareRole,
    shareRestricted,
    isTableShareRestricted,
    setShareRole,
    setCurrentBaseOwner,
    fetchMembers,
    addMember,
    batchAddMembers,
    updateMemberRole,
    removeMember,
    transferOwnership,
    clearMembers,
    clearError,
    $reset,
  };
});
