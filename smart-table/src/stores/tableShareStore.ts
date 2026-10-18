import { defineStore } from "pinia";
import { ref } from "vue";
import {
  shareApiService,
  type TableShare as TableShareType,
  type TableShareMember,
  type TableShareAccessInfo,
  type TableShareJoinResult,
  type TableShareMembership,
  type CreateTableSharePayload,
  type UpdateTableSharePayload,
} from "@/services/api/shareApiService";
import { t } from "@/i18n";

export type { TableShareType as TableShare };

export const useTableShareStore = defineStore("tableShare", () => {
  const currentTableShares = ref<TableShareType[]>([]);
  /** 当前用户通过表分享加入的数据表列表（首页/「分享给我的」数据源） */
  const sharedWithMeTables = ref<TableShareMembership[]>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);

  /** 加载「分享给我的」表分享列表 */
  async function fetchSharedWithMeTables(): Promise<TableShareMembership[]> {
    loading.value = true;
    error.value = null;
    try {
      const data = await shareApiService.getTableSharesSharedWithMe();
      sharedWithMeTables.value = data;
      return data;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : t("view.share.tableShare.loadFailed");
      error.value = msg;
      console.error("[tableShareStore] fetchSharedWithMeTables failed:", e);
      throw e;
    } finally {
      loading.value = false;
    }
  }

  async function fetchShares(tableId: string) {
    loading.value = true;
    error.value = null;
    try {
      const data = await shareApiService.getTableShares(tableId);
      currentTableShares.value = data;
      return data;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : t("view.share.tableShare.loadFailed");
      error.value = msg;
      console.error("[tableShareStore] fetchShares failed:", e);
      throw e;
    } finally {
      loading.value = false;
    }
  }

  async function createShare(tableId: string, data: CreateTableSharePayload) {
    loading.value = true;
    try {
      const created = await shareApiService.createTableShare(tableId, data);
      currentTableShares.value.unshift(created);
      return created;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : t("view.share.tableShare.createFailed");
      error.value = msg;
      console.error("[tableShareStore] createShare failed:", e);
      throw e;
    } finally {
      loading.value = false;
    }
  }

  async function updateShare(shareId: string, data: UpdateTableSharePayload) {
    loading.value = true;
    try {
      const updated = await shareApiService.updateTableShare(shareId, data);
      const idx = currentTableShares.value.findIndex((s) => s.id === shareId);
      if (idx !== -1) {
        currentTableShares.value[idx] = updated;
      }
      return updated;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : t("view.share.tableShare.saveFailed");
      error.value = msg;
      console.error("[tableShareStore] updateShare failed:", e);
      throw e;
    } finally {
      loading.value = false;
    }
  }

  async function deleteShare(shareId: string) {
    loading.value = true;
    try {
      await shareApiService.deleteTableShare(shareId);
      currentTableShares.value = currentTableShares.value.filter((s) => s.id !== shareId);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : t("view.share.tableShare.saveFailed");
      error.value = msg;
      console.error("[tableShareStore] deleteShare failed:", e);
      throw e;
    } finally {
      loading.value = false;
    }
  }

  async function fetchMembers(shareId: string): Promise<TableShareMember[]> {
    loading.value = true;
    try {
      const data = await shareApiService.getTableShareMembers(shareId);
      return data;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : t("view.share.tableShare.loadFailed");
      error.value = msg;
      console.error("[tableShareStore] fetchMembers failed:", e);
      throw e;
    } finally {
      loading.value = false;
    }
  }

  async function removeMember(shareId: string, userId: string) {
    loading.value = true;
    try {
      await shareApiService.removeTableShareMember(shareId, userId);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : t("view.share.tableShare.removeMemberFailed");
      error.value = msg;
      console.error("[tableShareStore] removeMember failed:", e);
      throw e;
    } finally {
      loading.value = false;
    }
  }

  async function accessShare(token: string): Promise<TableShareAccessInfo> {
    loading.value = true;
    error.value = null;
    try {
      const data = await shareApiService.accessTableShare(token);
      return data;
    } catch (e: unknown) {
      const msg = e instanceof Error
        ? e.message
        : t("view.share.tableShare.landing.invalid");
      error.value = msg;
      console.error("[tableShareStore] accessShare failed:", e);
      throw e;
    } finally {
      loading.value = false;
    }
  }

  async function joinShare(token: string): Promise<TableShareJoinResult> {
    loading.value = true;
    error.value = null;
    try {
      const data = await shareApiService.joinTableShare(token);
      return data;
    } catch (e: unknown) {
      const msg = e instanceof Error
        ? e.message
        : t("view.share.tableShare.landing.invalid");
      error.value = msg;
      console.error("[tableShareStore] joinShare failed:", e);
      throw e;
    } finally {
      loading.value = false;
    }
  }

  function clearShares() {
    currentTableShares.value = [];
  }

  function clearError() {
    error.value = null;
  }

  function $reset() {
    currentTableShares.value = [];
    sharedWithMeTables.value = [];
    loading.value = false;
    error.value = null;
  }

  return {
    currentTableShares,
    sharedWithMeTables,
    loading,
    error,
    fetchSharedWithMeTables,
    fetchShares,
    createShare,
    updateShare,
    deleteShare,
    fetchMembers,
    removeMember,
    accessShare,
    joinShare,
    clearShares,
    clearError,
    $reset,
  };
});
