import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { nextTick } from "vue";
import { createPinia } from "pinia";
import TableShareDialog from "../TableShareDialog.vue";
import type { TableShare, TableShareMember } from "@/services/api/shareApiService";

// Mock tableShareStore，便于断言调用
const fetchSharesMock = vi.fn();
const createShareMock = vi.fn();
const updateShareMock = vi.fn();
const deleteShareMock = vi.fn();
const fetchMembersMock = vi.fn();
const removeMemberMock = vi.fn();

vi.mock("@/stores/tableShareStore", () => ({
  useTableShareStore: () => ({
    fetchShares: fetchSharesMock,
    createShare: createShareMock,
    updateShare: updateShareMock,
    deleteShare: deleteShareMock,
    fetchMembers: fetchMembersMock,
    removeMember: removeMemberMock,
  }),
}));

// Mock authStore（当前用户，用于自身行隐藏移除按钮）
const { mockAuthUser } = vi.hoisted(() => ({
  mockAuthUser: { current: null as { id: string } | null },
}));

vi.mock("@/stores/authStore", () => ({
  useAuthStore: () => ({
    get user() {
      return mockAuthUser.current;
    },
  }),
}));

// Mock viewStore（视图多选选项）
vi.mock("@/stores/viewStore", () => ({
  useViewStore: () => ({
    views: [],
    sortedViews: [
      { id: "view-1", name: "表格视图", order: 0 },
      { id: "view-2", name: "看板视图", order: 1 },
    ],
    loadViews: vi.fn(),
  }),
}));

// Mock ElMessage / ElMessageBox，避免依赖弹层交互
vi.mock("element-plus", async () => {
  const actual = await vi.importActual<typeof import("element-plus")>("element-plus");
  return {
    ...actual,
    ElMessage: {
      success: vi.fn(),
      warning: vi.fn(),
      error: vi.fn(),
    },
    ElMessageBox: {
      confirm: vi.fn(),
    },
  };
});

import { ElMessage, ElMessageBox } from "element-plus";

const mockShare: TableShare = {
  id: "share-1",
  table_id: "table-1",
  share_token: "token-abc",
  created_by: "user-1",
  permission: "editor",
  view_scope: "all",
  view_ids: null,
  expires_at: null,
  access_count: 5,
  is_active: true,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  last_accessed_at: null,
};

const mockMembers: TableShareMember[] = [
  {
    user_id: "u-1",
    joined_at: "2026-01-02T00:00:00Z",
    user: { id: "u-1", name: "张三", avatar: undefined, email: "zhang@example.com" },
  },
];

function mountDialog(props: Record<string, any> = {}) {
  return mount(TableShareDialog, {
    props: {
      tableId: "table-1",
      tableName: "测试表",
      visible: false,
      ...props,
    },
    global: {
      // formatDateTime 依赖 Pinia（adminStore），挂载时提供
      plugins: [createPinia()],
      // jsdom 下真实 ElSelect 会触发递归更新，按项目惯例用轻量 stub
      stubs: {
        teleport: true,
        "el-select": {
          template:
            '<select class="el-select" :value="modelValue" @change="$emit(\'update:modelValue\', $event.target.value)"><slot /></select>',
          props: ["modelValue"],
          emits: ["update:modelValue"],
        },
        "el-option": { template: "<option><slot /></option>" },
      },
    },
  });
}

async function openDialog(wrapper: ReturnType<typeof mountDialog>) {
  await wrapper.setProps({ visible: true });
  await flushPromises();
  await nextTick();
}

describe("TableShareDialog", () => {
  let wrapper: ReturnType<typeof mountDialog> | null = null;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthUser.current = null;
  });

  afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
  });

  describe("引导态（未开启分享）", () => {
    it("visible=false 时不渲染弹窗内容", () => {
      wrapper = mountDialog();
      expect(wrapper.find(".table-share-dialog").exists()).toBe(false);
    });

    it("无分享记录时显示开启分享引导", async () => {
      fetchSharesMock.mockResolvedValue([]);
      wrapper = mountDialog();
      await openDialog(wrapper);

      expect(fetchSharesMock).toHaveBeenCalledWith("table-1");
      expect(wrapper!.find(".enable-guide").exists()).toBe(true);
      expect(wrapper!.find(".enable-guide .el-button").exists()).toBe(true);
    });

    it("点击开启分享后调用 createShare 并展示链接", async () => {
      fetchSharesMock.mockResolvedValue([]);
      createShareMock.mockResolvedValue({ ...mockShare, id: "share-new" });
      fetchMembersMock.mockResolvedValue([]);

      wrapper = mountDialog();
      await openDialog(wrapper);

      await wrapper!.find(".enable-guide .el-button").trigger("click");
      await flushPromises();

      expect(createShareMock).toHaveBeenCalledWith("table-1", {
        permission: "viewer",
        view_scope: "all",
        view_ids: null,
        expires_at: null,
      });
      expect(ElMessage.success).toHaveBeenCalled();
      expect(wrapper!.find(".share-config").exists()).toBe(true);
      expect(wrapper!.find(".link-input input").element as HTMLInputElement).toBeTruthy();
    });
  });

  describe("已开启态", () => {
    it("加载最新一条分享并展示链接与配置", async () => {
      const older = { ...mockShare, id: "share-0", created_at: "2025-01-01T00:00:00Z" };
      fetchSharesMock.mockResolvedValue([older, mockShare]);
      fetchMembersMock.mockResolvedValue(mockMembers);

      wrapper = mountDialog();
      await openDialog(wrapper);

      expect(wrapper!.find(".enable-guide").exists()).toBe(false);
      expect(wrapper!.find(".share-config").exists()).toBe(true);
      const input = wrapper!.find(".link-input input").element as HTMLInputElement;
      expect(input.value).toContain("/#/share/table/token-abc");
      expect(fetchMembersMock).toHaveBeenCalledWith("share-1");
      // 已加入用户
      expect(wrapper!.text()).toContain("张三");
      expect(wrapper!.text()).toContain("zhang@example.com");
    });

    it("复制链接写入剪贴板并提示成功", async () => {
      const writeText = vi.fn().mockResolvedValue(undefined);
      Object.assign(navigator, { clipboard: { writeText } });

      fetchSharesMock.mockResolvedValue([mockShare]);
      fetchMembersMock.mockResolvedValue([]);

      wrapper = mountDialog();
      await openDialog(wrapper);

      const copyBtn = wrapper!.find(".link-row .el-button");
      expect(copyBtn.exists()).toBe(true);
      await copyBtn.trigger("click");
      await flushPromises();

      expect(writeText).toHaveBeenCalledWith(expect.stringContaining("/#/share/table/token-abc"));
      expect(ElMessage.success).toHaveBeenCalled();
    });

    it("删除分享需确认，确认后调用 deleteShare 并回到引导态", async () => {
      (ElMessageBox.confirm as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(true);
      deleteShareMock.mockResolvedValue(undefined);

      fetchSharesMock.mockResolvedValue([mockShare]);
      fetchMembersMock.mockResolvedValue([]);

      wrapper = mountDialog();
      await openDialog(wrapper);

      const deleteBtn = wrapper!.find(".danger-row .el-button");
      expect(deleteBtn.exists()).toBe(true);
      await deleteBtn.trigger("click");
      await flushPromises();

      expect(ElMessageBox.confirm).toHaveBeenCalled();
      expect(deleteShareMock).toHaveBeenCalledWith("share-1");
      expect(wrapper!.find(".enable-guide").exists()).toBe(true);
    });

    it("加载失败时提示错误", async () => {
      fetchSharesMock.mockRejectedValue(new Error("boom"));

      wrapper = mountDialog();
      await openDialog(wrapper);

      expect(ElMessage.error).toHaveBeenCalled();
    });
  });

  describe("配置保存链路（回归）", () => {
    it("点击权限单选（编辑者）后防抖触发 updateShare 且 permission=editor", async () => {
      vi.useFakeTimers();
      const viewerShare = { ...mockShare, permission: "viewer" as const };
      fetchSharesMock.mockResolvedValue([viewerShare]);
      fetchMembersMock.mockResolvedValue([]);

      wrapper = mountDialog();
      await openDialog(wrapper);

      const radios = wrapper!.findAll('.permission-block input[type="radio"]');
      const editorRadio = radios.find((i) => i.attributes("value") === "editor");
      expect(editorRadio).toBeTruthy();
      await editorRadio!.setValue();

      // 防抖 500ms
      await vi.advanceTimersByTimeAsync(600);
      await flushPromises();

      expect(updateShareMock).toHaveBeenCalledTimes(1);
      expect(updateShareMock).toHaveBeenCalledWith(
        "share-1",
        expect.objectContaining({ permission: "editor" })
      );
      vi.useRealTimers();
    });

    it("指定视图但未选择视图时不触发保存（空 viewIds 守卫）", async () => {
      vi.useFakeTimers();
      fetchSharesMock.mockResolvedValue([mockShare]);
      fetchMembersMock.mockResolvedValue([]);

      wrapper = mountDialog();
      await openDialog(wrapper);

      const scopeRadios = wrapper!.findAll('.view-scope-block input[type="radio"]');
      const specifiedRadio = scopeRadios.find((i) => i.attributes("value") === "specified");
      expect(specifiedRadio).toBeTruthy();
      await specifiedRadio!.setValue();

      await vi.advanceTimersByTimeAsync(600);
      await flushPromises();

      expect(updateShareMock).not.toHaveBeenCalled();
      vi.useRealTimers();
    });

    it("防抖窗口内关闭弹窗时 flush 未保存的变更（不再静默丢弃）", async () => {
      vi.useFakeTimers();
      const viewerShare = { ...mockShare, permission: "viewer" as const };
      fetchSharesMock.mockResolvedValue([viewerShare]);
      fetchMembersMock.mockResolvedValue([]);

      wrapper = mountDialog();
      await openDialog(wrapper);

      const radios = wrapper!.findAll('.permission-block input[type="radio"]');
      const editorRadio = radios.find((i) => i.attributes("value") === "editor");
      await editorRadio!.setValue();

      // 未等防抖到期立即关闭弹窗
      const dialog = wrapper.findComponent({ name: "ElDialog" });
      expect(dialog.exists()).toBe(true);
      (dialog.vm as unknown as { $emit: (e: string) => void }).$emit("closed");
      await flushPromises();

      expect(updateShareMock).toHaveBeenCalledTimes(1);
      expect(updateShareMock).toHaveBeenCalledWith(
        "share-1",
        expect.objectContaining({ permission: "editor" })
      );
      vi.useRealTimers();
    });
  });

  describe("移除已加入用户", () => {
    const secondMember: TableShareMember = {
      user_id: "u-2",
      joined_at: "2026-01-03T00:00:00Z",
      user: { id: "u-2", name: "李四", avatar: undefined, email: "li@example.com" },
    };

    it("非自身行展示移除按钮，自身行不展示", async () => {
      mockAuthUser.current = { id: "u-1" };
      fetchSharesMock.mockResolvedValue([mockShare]);
      fetchMembersMock.mockResolvedValue([mockMembers[0], secondMember]);

      wrapper = mountDialog();
      await openDialog(wrapper);

      const items = wrapper!.findAll(".member-item");
      expect(items.length).toBe(2);
      // 当前用户（u-1）的行不展示移除按钮
      expect(items[0].text()).toContain("张三");
      expect(items[0].find(".member-remove").exists()).toBe(false);
      expect(items[1].find(".member-remove").exists()).toBe(true);
    });

    it("确认后调用 removeMember 并从列表移除、提示成功", async () => {
      mockAuthUser.current = { id: "u-1" };
      (ElMessageBox.confirm as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(true);
      removeMemberMock.mockResolvedValue(undefined);
      fetchSharesMock.mockResolvedValue([mockShare]);
      fetchMembersMock.mockResolvedValue([mockMembers[0], secondMember]);

      wrapper = mountDialog();
      await openDialog(wrapper);

      const removeBtn = wrapper!.find(".member-remove");
      expect(removeBtn.exists()).toBe(true);
      await removeBtn.trigger("click");
      await flushPromises();

      expect(ElMessageBox.confirm).toHaveBeenCalled();
      expect(removeMemberMock).toHaveBeenCalledWith("share-1", "u-2");
      expect(wrapper!.findAll(".member-item").length).toBe(1);
      expect(wrapper!.text()).not.toContain("李四");
      expect(ElMessage.success).toHaveBeenCalled();
    });

    it("取消确认时不调用移除接口", async () => {
      (ElMessageBox.confirm as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error("cancel")
      );
      fetchSharesMock.mockResolvedValue([mockShare]);
      fetchMembersMock.mockResolvedValue([secondMember]);

      wrapper = mountDialog();
      await openDialog(wrapper);

      await wrapper!.find(".member-remove").trigger("click");
      await flushPromises();

      expect(ElMessageBox.confirm).toHaveBeenCalled();
      expect(removeMemberMock).not.toHaveBeenCalled();
      expect(wrapper!.findAll(".member-item").length).toBe(1);
    });

    it("移除失败时提示错误并重新拉取成员列表", async () => {
      (ElMessageBox.confirm as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(true);
      removeMemberMock.mockRejectedValue(new Error("网络异常，请稍后重试"));
      fetchSharesMock.mockResolvedValue([mockShare]);
      fetchMembersMock.mockResolvedValue([secondMember]);

      wrapper = mountDialog();
      await openDialog(wrapper);

      await wrapper!.find(".member-remove").trigger("click");
      await flushPromises();

      expect(removeMemberMock).toHaveBeenCalledWith("share-1", "u-2");
      expect(ElMessage.error).toHaveBeenCalledWith("网络异常，请稍后重试");
      // 失败后重新拉取成员列表（初次加载 + 失败重拉）
      expect(fetchMembersMock).toHaveBeenCalledTimes(2);
      expect(wrapper!.findAll(".member-item").length).toBe(1);
    });
  });
});
