/**
 * 附件图片预览「上一张/下一张」导航测试
 * 覆盖 AttachmentField 与 AttachmentManager（两组件预览逻辑同构）
 */
import { describe, it, expect, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import AttachmentField from '../AttachmentField.vue';
import AttachmentManager from '../AttachmentManager.vue';
import type { FieldEntity } from '@/db/schema';
import type { AttachmentFile } from '@/types/attachment';

// mock attachmentService，避免触发真实的 IndexedDB / API 调用
vi.mock('@/db/services', () => ({
  attachmentService: {
    getAttachment: vi.fn().mockResolvedValue(undefined),
    getAttachmentUrl: vi.fn().mockImplementation(async (id: string) => `blob:mock-${id}`),
    deleteAttachment: vi.fn().mockResolvedValue(undefined),
    uploadFiles: vi.fn().mockResolvedValue([]),
    downloadAttachment: vi.fn().mockResolvedValue(undefined),
  },
}));

// mock baseStore（组件内仅用 currentBaseId）
vi.mock('@/stores', () => ({
  useBaseStore: () => ({ currentBaseId: 'base-1' }),
}));

// mock AttachmentError（utils/attachment 会拉起 IndexedDB 工具链）
vi.mock('@/utils/attachment', () => ({
  AttachmentError: class AttachmentError extends Error {},
}));

// mock router（PDF 预览新开标签页用，本测试不触达）
vi.mock('vue-router', () => ({
  useRouter: () => ({ resolve: () => ({ href: '#pdf-preview' }) }),
}));

/** 构造附件字段 FieldEntity */
function buildField(): FieldEntity {
  return {
    id: 'field-attach-1',
    tableId: 'table-1',
    name: 'images',
    type: 'attachment',
    config: {},
    isPrimary: false,
    isSystem: false,
    isRequired: false,
    isVisible: true,
    order: 0,
    createdAt: 0,
    updatedAt: 0,
  } as unknown as FieldEntity;
}

/** 构造图片类型附件 */
function img(id: string, name: string): AttachmentFile {
  return {
    id,
    name,
    originalName: name,
    size: 1024,
    type: 'image/png',
    fileType: 'image',
    extension: 'png',
    thumbnail: `data:image/png;base64,thumb-${id}`,
    url: `blob:url-${id}`,
    createdAt: 1700000000000,
  };
}

/** 构造视频类型附件（用于混合类型场景） */
function video(id: string, name: string): AttachmentFile {
  return {
    id,
    name,
    originalName: name,
    size: 2048,
    type: 'video/mp4',
    fileType: 'video',
    extension: 'mp4',
    createdAt: 1700000000000,
  };
}

/** 挂载 AttachmentField 并等待 modelValue 异步处理完成 */
function mountField(modelValue: AttachmentFile[]) {
  return mount(AttachmentField, {
    props: {
      modelValue: modelValue as any,
      field: buildField(),
      recordId: 'record-1',
    },
  });
}

/** 挂载 AttachmentManager 并等待 modelValue 异步处理完成 */
function mountManager(modelValue: AttachmentFile[]) {
  return mount(AttachmentManager, {
    props: {
      modelValue: modelValue as any,
      field: buildField(),
      recordId: 'record-1',
      position: { x: 0, y: 0 },
    },
  });
}

/** 打开指定索引附件的预览弹窗 */
async function openPreview(wrapper: ReturnType<typeof mount>, index = 0) {
  await wrapper.findAll('.file-preview')[index].trigger('click');
  await flushPromises();
}

/** 归一化计数文本（"1 / 3"） */
function counterText(wrapper: ReturnType<typeof mount>): string {
  return wrapper.find('.image-counter').text().replace(/\s+/g, ' ').trim();
}

/** 当前预览图 alt（即 originalName） */
function previewAlt(wrapper: ReturnType<typeof mount>): string {
  return wrapper.find('.preview-image').attributes('alt') || '';
}

/** 向 document 派发方向键 */
function pressKey(key: string) {
  document.dispatchEvent(new KeyboardEvent('keydown', { key }));
}

describe('AttachmentField 图片预览上一张/下一张导航', () => {
  it('多图预览显示左右导航按钮与计数指示', async () => {
    const wrapper = mountField([img('a1', 'red.png'), img('a2', 'green.png'), img('a3', 'blue.png')]);
    await flushPromises();
    await openPreview(wrapper, 0);

    expect(wrapper.findAll('.image-nav-btn')).toHaveLength(2);
    expect(wrapper.find('.image-nav-btn.is-prev').exists()).toBe(true);
    expect(wrapper.find('.image-nav-btn.is-next').exists()).toBe(true);
    expect(counterText(wrapper)).toBe('1 / 3');
    expect(previewAlt(wrapper)).toBe('red.png');
  });

  it('下一张按钮顺序切换并首尾循环', async () => {
    const wrapper = mountField([img('a1', 'red.png'), img('a2', 'green.png'), img('a3', 'blue.png')]);
    await flushPromises();
    await openPreview(wrapper, 0);

    await wrapper.find('.image-nav-btn.is-next').trigger('click');
    await flushPromises();
    expect(previewAlt(wrapper)).toBe('green.png');
    expect(counterText(wrapper)).toBe('2 / 3');

    await wrapper.find('.image-nav-btn.is-next').trigger('click');
    await flushPromises();
    expect(previewAlt(wrapper)).toBe('blue.png');
    expect(counterText(wrapper)).toBe('3 / 3');

    // 末尾循环回首张
    await wrapper.find('.image-nav-btn.is-next').trigger('click');
    await flushPromises();
    expect(previewAlt(wrapper)).toBe('red.png');
    expect(counterText(wrapper)).toBe('1 / 3');
  });

  it('上一张按钮切换并从首张循环回末张', async () => {
    const wrapper = mountField([img('a1', 'red.png'), img('a2', 'green.png'), img('a3', 'blue.png')]);
    await flushPromises();
    await openPreview(wrapper, 0);

    await wrapper.find('.image-nav-btn.is-prev').trigger('click');
    await flushPromises();
    expect(previewAlt(wrapper)).toBe('blue.png');
    expect(counterText(wrapper)).toBe('3 / 3');
  });

  it('键盘左右方向键切换（仅图片预览时生效）', async () => {
    const wrapper = mountField([img('a1', 'red.png'), img('a2', 'green.png')]);
    await flushPromises();
    await openPreview(wrapper, 0);

    pressKey('ArrowRight');
    await flushPromises();
    expect(previewAlt(wrapper)).toBe('green.png');

    pressKey('ArrowLeft');
    await flushPromises();
    expect(previewAlt(wrapper)).toBe('red.png');
  });

  it('切换图片后缩放与拖拽位置重置', async () => {
    const wrapper = mountField([img('a1', 'red.png'), img('a2', 'green.png')]);
    await flushPromises();
    await openPreview(wrapper, 0);

    // 滚轮放大（deltaY < 0 放大一档 1.25）
    await wrapper.find('.image-preview-wrapper').trigger('wheel', { deltaY: -100 });
    await flushPromises();
    expect(wrapper.find('.preview-image').attributes('style')).toContain('scale(1.25)');

    // 切换下一张后缩放重置为 1
    await wrapper.find('.image-nav-btn.is-next').trigger('click');
    await flushPromises();
    const style = wrapper.find('.preview-image').attributes('style') || '';
    expect(style).toContain('scale(1)');
    expect(style).not.toContain('scale(1.25)');
  });

  it('混合类型附件时导航仅在图片之间切换（跳过视频）', async () => {
    const wrapper = mountField([img('a1', 'red.png'), video('v1', 'demo.mp4'), img('a2', 'green.png')]);
    await flushPromises();
    await openPreview(wrapper, 0);

    expect(counterText(wrapper)).toBe('1 / 2');

    // 下一张应跳过视频直达第二张图
    await wrapper.find('.image-nav-btn.is-next').trigger('click');
    await flushPromises();
    expect(previewAlt(wrapper)).toBe('green.png');
    expect(counterText(wrapper)).toBe('2 / 2');

    // 循环回首张图（视频不在导航序列内）
    await wrapper.find('.image-nav-btn.is-next').trigger('click');
    await flushPromises();
    expect(previewAlt(wrapper)).toBe('red.png');
    expect(counterText(wrapper)).toBe('1 / 2');
  });

  it('单图预览不显示导航按钮与计数', async () => {
    const wrapper = mountField([img('a1', 'only.png')]);
    await flushPromises();
    await openPreview(wrapper, 0);

    expect(wrapper.find('.preview-image').exists()).toBe(true);
    expect(wrapper.findAll('.image-nav-btn')).toHaveLength(0);
    expect(wrapper.find('.image-counter').exists()).toBe(false);
  });
});

describe('AttachmentManager 图片预览上一张/下一张导航（同构逻辑）', () => {
  it('按钮与键盘均可切换且计数正确', async () => {
    const wrapper = mountManager([img('b1', 'red.png'), img('b2', 'green.png'), img('b3', 'blue.png')]);
    await flushPromises();
    await openPreview(wrapper, 0);

    expect(counterText(wrapper)).toBe('1 / 3');

    await wrapper.find('.image-nav-btn.is-next').trigger('click');
    await flushPromises();
    expect(previewAlt(wrapper)).toBe('green.png');
    expect(counterText(wrapper)).toBe('2 / 3');

    pressKey('ArrowLeft');
    await flushPromises();
    expect(previewAlt(wrapper)).toBe('red.png');
    expect(counterText(wrapper)).toBe('1 / 3');
  });

  it('单图不显示导航按钮', async () => {
    const wrapper = mountManager([img('b1', 'only.png')]);
    await flushPromises();
    await openPreview(wrapper, 0);

    expect(wrapper.findAll('.image-nav-btn')).toHaveLength(0);
    expect(wrapper.find('.image-counter').exists()).toBe(false);
  });

  it('预览弹窗 append-to-body 且遮罩层叠高于附件面板（z-index 1999）', async () => {
    // 禁用 teleport stub 并挂到 document（test-utils 默认在内存中渲染），验证真实挂载位置与层叠
    const wrapper = mount(AttachmentManager, {
      props: {
        modelValue: [img('b1', 'red.png'), img('b2', 'green.png')] as any,
        field: buildField(),
        recordId: 'record-1',
        position: { x: 0, y: 0 },
      },
      attachTo: document.body,
      global: { stubs: { teleport: false } },
    });
    await flushPromises();

    // 面板与弹窗均 teleport 到 body，从 document 上触发预览
    const filePreview = document.querySelector('.file-preview') as HTMLElement | null;
    expect(filePreview).not.toBeNull();
    filePreview!.click();
    await flushPromises();

    // append-to-body：弹窗遮罩直接挂在 body 下，不被面板层叠上下文压制
    const overlay = document.body.querySelector('.el-overlay') as HTMLElement | null;
    expect(overlay).not.toBeNull();
    expect(overlay!.parentElement).toBe(document.body);
    // Element Plus popup manager 以 inline z-index 分配遮罩层级（2000 起），须高于面板的 1999
    const zOverlay = parseInt(getComputedStyle(overlay!).zIndex, 10);
    expect(zOverlay).toBeGreaterThan(1999);

    wrapper.unmount();
  });
});
