import { describe, expect, it } from "vitest";
import {
  evaluateTypedCondition,
  isEmptyConditionValue,
  isNullishValue,
  resolveConditionOperand,
} from "../src/condition.js";

describe("Condition Helpers (null / empty / operand resolution)", () => {
  it("isNullishValue identifica únicamente null y undefined", () => {
    expect(isNullishValue(null)).toBe(true);
    expect(isNullishValue(undefined)).toBe(true);
    expect(isNullishValue("")).toBe(false);
    expect(isNullishValue(0)).toBe(false);
    expect(isNullishValue(false)).toBe(false);
    expect(isNullishValue([])).toBe(false);
    expect(isNullishValue({})).toBe(false);
  });

  it("isEmptyConditionValue identifica vacíos reales sin confundir 0, false ni Date", () => {
    expect(isEmptyConditionValue(null)).toBe(true);
    expect(isEmptyConditionValue(undefined)).toBe(true);
    expect(isEmptyConditionValue("")).toBe(true);
    expect(isEmptyConditionValue("   \t\n ")).toBe(true);
    expect(isEmptyConditionValue([])).toBe(true);
    expect(isEmptyConditionValue({})).toBe(true);

    expect(isEmptyConditionValue(0)).toBe(false);
    expect(isEmptyConditionValue(false)).toBe(false);
    expect(isEmptyConditionValue("hola")).toBe(false);
    expect(isEmptyConditionValue(["a"])).toBe(false);
    expect(isEmptyConditionValue({ ok: true })).toBe(false);
    expect(isEmptyConditionValue(new Date())).toBe(false);
    expect(isEmptyConditionValue(/abc/)).toBe(false);
  });

  it("resolveConditionOperand preserva null explícito, resuelve rutas con corchetes y devuelve undefined si falta", () => {
    const ctx = {
      variables: {
        nulo: null,
        vacio: "",
        cero: 0,
        falso: false,
        items: [{ nombre: null }, { nombre: "Ana" }],
      },
      stepResults: {
        http_1: { data: { user: { phone: null } } },
      },
      webhookOutput: { body: { token: "" } },
    };

    expect(resolveConditionOperand("{{variables.nulo}}", ctx)).toEqual({ value: null });
    expect(resolveConditionOperand("variables.nulo", ctx)).toEqual({ value: null });
    expect(resolveConditionOperand("{{variables.cero}}", ctx)).toEqual({ value: 0 });
    expect(resolveConditionOperand("{{variables.falso}}", ctx)).toEqual({ value: false });
    expect(resolveConditionOperand("{{variables.items[0].nombre}}", ctx)).toEqual({ value: null });
    expect(resolveConditionOperand("{{steps.http_1.output.data.user.phone}}", ctx)).toEqual({
      value: null,
    });
    expect(resolveConditionOperand("{{webhook.body.token}}", ctx)).toEqual({ value: "" });

    expect(resolveConditionOperand("{{variables.inexistente}}", ctx)).toEqual({
      value: undefined,
      missingToken: "variables.inexistente",
    });
    expect(resolveConditionOperand("variables.inexistente", ctx)).toEqual({
      value: undefined,
    });
    expect(resolveConditionOperand("steps.inexistente.output.campo", ctx)).toEqual({
      value: undefined,
    });

    expect(resolveConditionOperand("null", ctx)).toEqual({ value: null });
    expect(resolveConditionOperand("undefined", ctx)).toEqual({ value: undefined });
  });

  it("evaluateTypedCondition evalúa is_null, is_not_null, is_empty, is_not_empty, is_null_or_empty y is_not_null_or_empty en cualquier tipo", () => {
    expect(evaluateTypedCondition("exists", "is_null", null)).toBe(true);
    expect(evaluateTypedCondition("exists", "is_null", undefined)).toBe(true);
    expect(evaluateTypedCondition("exists", "is_null", "")).toBe(false);
    expect(evaluateTypedCondition("exists", "is_null", 0)).toBe(false);

    expect(evaluateTypedCondition("string", "is_not_null", "")).toBe(true);
    expect(evaluateTypedCondition("string", "is_not_null", null)).toBe(false);

    expect(evaluateTypedCondition("string", "is_empty", "   ")).toBe(true);
    expect(evaluateTypedCondition("string", "is_not_empty", "   ")).toBe(false);

    expect(evaluateTypedCondition("array", "is_null_or_empty", [])).toBe(true);
    expect(evaluateTypedCondition("array", "is_null_or_empty", null)).toBe(true);
    expect(evaluateTypedCondition("array", "is_not_null_or_empty", ["x"])).toBe(true);

    expect(evaluateTypedCondition("exists", "is_null_or_empty", {})).toBe(true);
    expect(evaluateTypedCondition("exists", "is_null_or_empty", 0)).toBe(false);
    expect(evaluateTypedCondition("exists", "is_not_null_or_empty", false)).toBe(true);
  });

  it("evaluateTypedCondition evita que null o string vacío igualen a 0 en comparaciones numéricas", () => {
    expect(evaluateTypedCondition("number", "equals", null, 0)).toBe(false);
    expect(evaluateTypedCondition("number", "not_equals", null, 0)).toBe(true);
    expect(evaluateTypedCondition("number", "equals", "", 0)).toBe(false);
    expect(evaluateTypedCondition("number", "equals", null, undefined)).toBe(true);
    expect(evaluateTypedCondition("number", "equals", 0, 0)).toBe(true);
  });
});
