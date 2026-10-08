/**
 * 公式字段日期/日期时间显示格式单元测试
 *
 * 覆盖 formatFormulaDateByConfig 的各类值形态与边界情况，
 * 以及 calculateFormulaDisplay 在配置日期格式后的导出链路行为。
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useAdminStore } from "@/stores/adminStore";
import {
  formatFormulaDateByConfig,
  calculateFormulaDisplay,
} from "../formatFormula";
import type { FieldEntity, RecordEntity } from "@/db/schema";

// 固定时区为 Asia/Shanghai（local 模式），保证断言与运行环境时区无关
const FIXED_TZ_CONFIG = {
  timezone_mode: { value: "local" },
  timezone_name: { value: "Asia/Shanghai" },
} as any;

// 2026-10-08 12:00:00 +08:00 对应的 UTC 毫秒时间戳
const TS_20261008_1200_SH = Date.UTC(2026, 9, 8, 4, 0, 0);

const dateOpts = { format: "date" };
const dateTimeOpts = { format: "datetime" };

describe("formatFormulaDateByConfig", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    const adminStore = useAdminStore();
    adminStore.systemConfigs = FIXED_TZ_CONFIG;
  });

  describe("未配置日期类格式时回退（返回 null）", () => {
    it("number/currency/percent/text/未配置 均返回 null", () => {
      expect(formatFormulaDateByConfig(TS_20261008_1200_SH, { format: "number" })).toBeNull();
      expect(formatFormulaDateByConfig(TS_20261008_1200_SH, { format: "currency" })).toBeNull();
      expect(formatFormulaDateByConfig(TS_20261008_1200_SH, { format: "percent" })).toBeNull();
      expect(formatFormulaDateByConfig(TS_20261008_1200_SH, { format: "text" })).toBeNull();
      expect(formatFormulaDateByConfig(TS_20261008_1200_SH, undefined)).toBeNull();
      expect(formatFormulaDateByConfig(TS_20261008_1200_SH, null)).toBeNull();
      expect(formatFormulaDateByConfig(TS_20261008_1200_SH, {})).toBeNull();
    });
  });

  describe("空值与无效值边界", () => {
    it("null/undefined/空串 返回空字符串", () => {
      expect(formatFormulaDateByConfig(null, dateOpts)).toBe("");
      expect(formatFormulaDateByConfig(undefined, dateTimeOpts)).toBe("");
      expect(formatFormulaDateByConfig("", dateOpts)).toBe("");
      expect(formatFormulaDateByConfig("   ", dateOpts)).toBe("");
    });

    it("#ERROR 计算错误原样透传", () => {
      expect(formatFormulaDateByConfig("#ERROR: divide by zero", dateOpts)).toBe(
        "#ERROR: divide by zero",
      );
    });

    it("NaN/Infinity 返回空字符串", () => {
      expect(formatFormulaDateByConfig(NaN, dateOpts)).toBe("");
      expect(formatFormulaDateByConfig(Infinity, dateTimeOpts)).toBe("");
    });

    it("无法解析的日期字符串返回 '-'（与系统日期展示约定一致）", () => {
      expect(formatFormulaDateByConfig("not-a-date", dateOpts)).toBe("-");
    });

    it("布尔等其它类型原样转字符串", () => {
      expect(formatFormulaDateByConfig(true, dateOpts)).toBe("true");
    });
  });

  describe("日期格式（YYYY-MM-DD）", () => {
    it("毫秒时间戳（number，前端引擎计算结果）", () => {
      expect(formatFormulaDateByConfig(TS_20261008_1200_SH, dateOpts)).toBe("2026-10-08");
    });

    it("秒级时间戳（10 位 number）自动 ×1000", () => {
      expect(formatFormulaDateByConfig(1791432000, dateOpts)).toBe("2026-10-08");
    });

    it("秒级时间戳（10 位纯数字字符串）自动 ×1000", () => {
      expect(formatFormulaDateByConfig("1791432000", dateOpts)).toBe("2026-10-08");
    });

    it("毫秒时间戳（13 位纯数字字符串）", () => {
      expect(formatFormulaDateByConfig(String(TS_20261008_1200_SH), dateOpts)).toBe(
        "2026-10-08",
      );
    });

    it("UTC ISO 字符串（后端 computed_values 形态，带 Z）", () => {
      expect(formatFormulaDateByConfig("2026-10-08T04:00:00.000Z", dateOpts)).toBe(
        "2026-10-08",
      );
    });

    it("无时区标记的长日期串按 UTC 解析（后端 naive isoformat 形态）", () => {
      // 2026-10-08T04:00:00（UTC）→ 上海时间 12:00
      expect(formatFormulaDateByConfig("2026-10-08T04:00:00", dateOpts)).toBe("2026-10-08");
    });

    it("Date 对象", () => {
      expect(formatFormulaDateByConfig(new Date(TS_20261008_1200_SH), dateOpts)).toBe(
        "2026-10-08",
      );
    });
  });

  describe("日期时间格式（YYYY-MM-DD HH:mm:ss）", () => {
    it("毫秒时间戳（number）", () => {
      expect(formatFormulaDateByConfig(TS_20261008_1200_SH, dateTimeOpts)).toBe(
        "2026-10-08 12:00:00",
      );
    });

    it("UTC ISO 字符串（带 Z）转换到配置时区", () => {
      expect(formatFormulaDateByConfig("2026-10-08T04:00:00Z", dateTimeOpts)).toBe(
        "2026-10-08 12:00:00",
      );
    });

    it("无时区标记的长日期串按 UTC 解析", () => {
      expect(formatFormulaDateByConfig("2026-10-08 04:00:00", dateTimeOpts)).toBe(
        "2026-10-08 12:00:00",
      );
    });

    it("秒级时间戳（10 位字符串）", () => {
      expect(formatFormulaDateByConfig("1791432000", dateTimeOpts)).toBe(
        "2026-10-08 12:00:00",
      );
    });
  });
});

describe("calculateFormulaDisplay 日期格式配置集成", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    const adminStore = useAdminStore();
    adminStore.systemConfigs = FIXED_TZ_CONFIG;
  });

  const makeField = (options: Record<string, unknown>) =>
    ({ name: "f1", type: "formula", options }) as unknown as FieldEntity;
  const makeRecord = (computed: unknown) =>
    ({
      id: "r1",
      tableId: "t1",
      values: {},
      computed_values: { f1: computed },
    }) as unknown as RecordEntity;

  it("配置 datetime 格式时按配置格式化后端 ISO 结果（导出 Excel/CSV 链路）", () => {
    const field = makeField({ formula: "NOW()", format: "datetime" });
    expect(calculateFormulaDisplay(field, makeRecord("2026-10-08T04:00:00Z"), [])).toBe(
      "2026-10-08 12:00:00",
    );
  });

  it("配置 date 格式时数字结果按日期显示", () => {
    const field = makeField({ formula: "TODAY()", format: "date" });
    expect(calculateFormulaDisplay(field, makeRecord(TS_20261008_1200_SH), [])).toBe(
      "2026-10-08",
    );
  });

  it("未配置日期格式时保持原有行为（ISO 串只取日期部分）", () => {
    const field = makeField({ formula: "NOW()" });
    expect(calculateFormulaDisplay(field, makeRecord("2026-10-08T04:00:00Z"), [])).toBe(
      "2026-10-08",
    );
  });

  it("未配置日期格式时数字结果仍走数值精度格式化", () => {
    const field = makeField({ formula: "{a}+{b}", precision: 2 });
    expect(calculateFormulaDisplay(field, makeRecord(1234.5), [])).toBe("1,234.50");
  });
});
