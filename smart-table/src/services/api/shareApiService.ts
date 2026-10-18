import { apiClient } from '@/api/client';
import type { BaseMember, BaseShare, Base } from '@/api/types';

// ===== 数据表分享（Table Share）类型 =====

export interface TableShare {
  id: string;
  table_id: string;
  share_token: string;
  created_by: string;
  permission: 'editor' | 'commenter' | 'viewer';
  view_scope: 'all' | 'specified';
  view_ids: string[] | null;
  expires_at: number | null; // Unix 秒
  access_count: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  last_accessed_at: string | null;
}

export interface TableShareMember {
  user_id: string;
  joined_at: string;
  user: { id: string; name: string; avatar?: string; email?: string };
}

export interface TableShareAccessInfo {
  table: { id: string; name: string };
  base: { id: string; name: string; color?: string; icon?: string };
  permission: 'editor' | 'commenter' | 'viewer';
  view_scope: 'all' | 'specified';
  views: Array<{ id: string; name: string; type: string }>;
}

export interface TableShareJoinResult {
  restricted: boolean;
  /** 受限用户为 editor|commenter|viewer；Base 成员为其成员角色(owner/admin/...) */
  role: string;
  table_id?: string;
  base_id?: string;
  view_scope?: 'all' | 'specified';
  view_ids?: string[] | null;
}

/** 「分享给我的」表分享列表项（当前用户通过表分享加入的数据表） */
export interface TableShareMembership {
  share_id: string;
  share_token: string;
  permission: 'editor' | 'commenter' | 'viewer';
  view_scope: 'all' | 'specified';
  /** view_scope=specified 时的可见视图数量，all 时为 null */
  view_count: number | null;
  joined_at: string | null;
  table: { id: string; name: string; description?: string; updated_at?: string };
  base: { id: string; name: string; color?: string; icon?: string };
}

export interface CreateTableSharePayload {
  permission: 'editor' | 'commenter' | 'viewer';
  view_scope: 'all' | 'specified';
  view_ids?: string[] | null;
  expires_at?: number | null;
}

export type UpdateTableSharePayload = Partial<{
  permission: 'editor' | 'commenter' | 'viewer';
  view_scope: 'all' | 'specified';
  view_ids: string[] | null;
  is_active: boolean;
  expires_at: number | null;
}>;

export const shareApiService = {
  async getMembers(baseId: string): Promise<BaseMember[]> {
    const data = await apiClient.get<BaseMember[]>(`/bases/${baseId}/members`);
    return (data as unknown as BaseMember[]) || [];
  },

  async addMember(baseId: string, email: string, role: string): Promise<BaseMember> {
    const data = await apiClient.post<BaseMember>(`/bases/${baseId}/members`, { email, role });
    return (data as unknown as BaseMember) || {};
  },

  async batchAddMembers(
    baseId: string,
    members: Array<{ email: string; role: string }>
  ): Promise<{
    success_count: number;
    failed_count: number;
    successful: BaseMember[];
    failed: Array<{ index: number; email: string; error: string }>;
  }> {
    const data = await apiClient.post<{
      success_count: number;
      failed_count: number;
      successful: BaseMember[];
      failed: Array<{ index: number; email: string; error: string }>;
    }>(`/bases/${baseId}/members/batch`, { members });
    return (data as unknown as typeof data) || {};
  },

  async updateMemberRole(baseId: string, userId: string, role: string): Promise<BaseMember> {
    const data = await apiClient.put<BaseMember>(`/bases/${baseId}/members/${userId}`, { role });
    return (data as unknown as BaseMember) || {};
  },

  async removeMember(baseId: string, userId: string): Promise<void> {
    await apiClient.delete(`/bases/${baseId}/members/${userId}`);
  },

  async transferOwnership(
    baseId: string,
    targetUserId: string,
    formerOwnerRole: string | null
  ): Promise<Base> {
    const data = await apiClient.post<Base>(`/bases/${baseId}/transfer-ownership`, {
      user_id: targetUserId,
      former_owner_role: formerOwnerRole
    });
    return (data as unknown as Base) || {};
  },

  async getShares(baseId: string): Promise<BaseShare[]> {
    const data = await apiClient.get<BaseShare[]>(`/bases/${baseId}/shares`);
    return (data as unknown as BaseShare[]) || [];
  },

  async createShare(
    baseId: string,
    permission: 'view' | 'edit',
    expiresAt?: number
  ): Promise<BaseShare> {
    const data = await apiClient.post<BaseShare>(`/bases/${baseId}/shares`, {
      permission,
      expires_at: expiresAt
    });
    return (data as unknown as BaseShare) || {};
  },

  async deleteShare(shareId: string): Promise<void> {
    await apiClient.delete(`/shares/${shareId}`);
  },

  async updateShare(
    shareId: string,
    updateData: {
      is_active?: boolean;
      permission?: 'view' | 'edit';
      expires_at?: number;
    }
  ): Promise<BaseShare> {
    const data = await apiClient.put<BaseShare>(`/shares/${shareId}`, updateData);
    return (data as unknown as BaseShare) || {};
  },

  async getSharedWithMe(): Promise<Base[]> {
    const data = await apiClient.get<Base[]>('/bases/shared-with-me');
    return (data as unknown as Base[]) || [];
  },

  async getSharedByMe(): Promise<BaseShare[]> {
    const data = await apiClient.get<BaseShare[]>('/bases/shared-by-me');
    return (data as unknown as BaseShare[]) || [];
  },

  async accessShare(shareToken: string): Promise<{
    base: Base;
    permission: 'view' | 'edit';
    share_token: string;
  }> {
    const data = await apiClient.get<{
      base: Base;
      permission: 'view' | 'edit';
      share_token: string;
    }>(`/share/${shareToken}`);
    return (data as unknown as typeof data) || {};
  },

  // ===== 数据表分享（Table Share） =====

  async createTableShare(
    tableId: string,
    data: CreateTableSharePayload
  ): Promise<TableShare> {
    const created = await apiClient.post<TableShare>(`/tables/${tableId}/shares`, data);
    return (created as unknown as TableShare) || {};
  },

  async getTableShares(tableId: string): Promise<TableShare[]> {
    const data = await apiClient.get<TableShare[]>(`/tables/${tableId}/shares`);
    return (data as unknown as TableShare[]) || [];
  },

  async updateTableShare(
    shareId: string,
    data: UpdateTableSharePayload
  ): Promise<TableShare> {
    const updated = await apiClient.put<TableShare>(`/table-shares/${shareId}`, data);
    return (updated as unknown as TableShare) || {};
  },

  async deleteTableShare(shareId: string): Promise<void> {
    await apiClient.delete(`/table-shares/${shareId}`);
  },

  async getTableShareMembers(shareId: string): Promise<TableShareMember[]> {
    const data = await apiClient.get<TableShareMember[]>(
      `/table-shares/${shareId}/members`
    );
    return (data as unknown as TableShareMember[]) || [];
  },

  /** 将用户从表分享成员中移除（回收其对该表的分享访问权限） */
  async removeTableShareMember(shareId: string, userId: string): Promise<void> {
    await apiClient.delete(`/table-shares/${shareId}/members/${userId}`);
  },

  /** 公开接口：通过 token 获取分享落地页信息，无需登录 */
  async accessTableShare(token: string): Promise<TableShareAccessInfo> {
    const data = await apiClient.get<TableShareAccessInfo>(`/share/table/${token}`);
    return (data as unknown as TableShareAccessInfo) || {};
  },

  /** 需登录：通过 token 加入数据表分享 */
  async joinTableShare(token: string): Promise<TableShareJoinResult> {
    const data = await apiClient.post<TableShareJoinResult>(
      `/share/table/${token}/join`
    );
    return (data as unknown as TableShareJoinResult) || {};
  },

  /** 需登录：获取当前用户通过表分享加入的数据表列表（"分享给我的"） */
  async getTableSharesSharedWithMe(): Promise<TableShareMembership[]> {
    const data = await apiClient.get<TableShareMembership[]>(
      '/table-shares/shared-with-me'
    );
    return (data as unknown as TableShareMembership[]) || [];
  }
};
