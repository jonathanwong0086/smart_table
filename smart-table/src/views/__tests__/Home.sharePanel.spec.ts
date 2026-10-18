/**
 * Home.vue「分享给我的」合并列表面板挂载测试
 *
 * 目的：复现并守护「分享页签点击后面板渲染异常」问题——
 * 点击「分享给我的」页签后应渲染 Base 分享条目与数据表分享条目的合并列表。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises, type VueWrapper } from "@vue/test-utils";
import { nextTick } from "vue";
import { createPinia, type Pinia } from "pinia";

// ---- mock stores ----
const fetchSharedWithMeMock = vi.fn();
const fetchSharedByMeMock = vi.fn();
const fetchSharedWithMeTablesMock = vi.fn();
const fetchBasesMock = vi.fn();

vi.mock("@/stores", () => ({
  useBaseStore: () => ({ bases: [], fetchBases: fetchBasesMock }),
}));
vi.mock("@/stores/authStore", () => ({
  useAuthStore: () => ({ user: { id: "user-a" } }),
}));
vi.mock("@/stores/shareStore", () => ({
  useShareStore: () => ({
    fetchSharedWithMe: fetchSharedWithMeMock,
    fetchSharedByMe: fetchSharedByMeMock,
  }),
}));
vi.mock("@/stores/tableShareStore", () => ({
  useTableShareStore: () => ({
    fetchSharedWithMeTables: fetchSharedWithMeTablesMock,
  }),
}));

// ---- mock 路由与重依赖 ----
const pushMock = vi.fn();
vi.mock("vue-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("vue-router")>();
  return {
    ...actual,
    useRouter: () => ({ push: pushMock }),
    useRoute: () => ({ params: {}, query: {} }),
  };
});
vi.mock("@/db/services", () => ({ templateService: { getAll: vi.fn() } }));
vi.mock("@/utils/tableTemplates", () => ({
  getTableTemplates: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/services/api/baseApiService", () => ({ copyBase: vi.fn() }));
vi.mock("@/services/api/shareApiService", async () => {
  const actual = await vi.importActual<
    typeof import("@/services/api/shareApiService")
  >("@/services/api/shareApiService");
  return actual;
});
vi.mock("element-plus", async () => {
  const actual =
    await vi.importActual<typeof import("element-plus")>("element-plus");
  return {
    ...actual,
    ElMessage: { success: vi.fn(), warning: vi.fn(), error: vi.fn() },
    ElMessageBox: { confirm: vi.fn() },
  };
});

import Home from "../Home.vue";
import i18n from "@/i18n";
import type { Base } from "@/api/types";

const mockBase: Base = {
  id: "base-1",
  name: "分享列表验收Base",
  description: "",
  color: "#3B82F6",
  icon: "📊",
  owner_id: "user-a",
  is_starred: false,
  updated_at: "2026-10-17T10:00:00Z",
  created_at: "2026-10-17T09:00:00Z",
} as unknown as Base;

const mockMembership = {
  share_id: "share-1",
  share_token: "token-1",
  permission: "editor" as const,
  view_scope: "all" as const,
  view_count: null,
  joined_at: "2026-10-17T10:00:00Z",
  table: { id: "table-1", name: "销售数据表", updated_at: "2026-10-17T10:00:00Z" },
  base: { id: "base-1", name: "分享列表验收Base", color: "#3B82F6", icon: "📊" },
};

let wrapper: VueWrapper | null = null;
let pinia: Pinia;

async function mountHome() {
  wrapper = mount(Home, {
    global: {
      plugins: [pinia, i18n],
      stubs: {
        TemplatePreviewDialog: true,
        PluginHomeMenu: true,
        teleport: true,
        // jsdom 下 ElSelect（分页每页条数选择器）会触发递归更新伪影，与被测逻辑无关
        "el-select": true,
        "el-option": true,
        "el-pagination": true,
      },
      config: {
        // 让渲染异常直接抛出，而不是被 Vue 吞掉只打日志
        errorHandler: (err: unknown) => {
          throw err;
        },
      },
    },
  });
  await flushPromises();
  return wrapper;
}

describe("Home 分享给我的合并列表", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pinia = createPinia();
    i18n.global.locale.value = "zh-CN";
    fetchSharedWithMeMock.mockResolvedValue([mockBase]);
    fetchSharedByMeMock.mockResolvedValue([]);
    fetchSharedWithMeTablesMock.mockResolvedValue([mockMembership]);
    fetchBasesMock.mockResolvedValue([]);
  });

  it("点击「分享给我的」页签后渲染 Base 与数据表合并条目", async () => {
    const w = await mountHome();

    // 通过 setupState 切换到分享视图（等价于点击左侧导航「分享」）
    (w.vm.$.setupState as Record<string, unknown>).currentNav = "shares";
    await flushPromises();
    await nextTick();

    const tabs = w.findAll(".tab-item");
    expect(tabs.length).toBe(2);
    // 分享给我的角标 = 2（1 条 Base + 1 条数据表）
    expect(tabs[1].text()).toContain("分享给我的");
    expect(tabs[1].text()).toContain("2");

    // 渲染异常守卫：切页签前应无错误
    tabs[1].trigger("click");
    await flushPromises();
    await nextTick();

    // 页签高亮
    expect(tabs[1].classes()).toContain("active");

    // 合并列表应包含 Base 条目与数据表条目
    const items = w.findAll(".tab-panel .table-list-item");
    expect(items.length).toBe(2);
    const texts = items.map((i) => i.text());
    expect(texts.some((t) => t.includes("分享列表验收Base"))).toBe(true);
    expect(texts.some((t) => t.includes("销售数据表"))).toBe(true);
    expect(texts.some((t) => t.includes("编辑者"))).toBe(true);
    expect(texts.some((t) => t.includes("来自 分享列表验收Base"))).toBe(true);
  });
});
