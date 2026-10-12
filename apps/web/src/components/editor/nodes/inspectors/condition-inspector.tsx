"use client";

import React from "react";
import type { ConditionNode, ConditionDataType, ConditionOperator } from "@rpa/dsl";
import type { NodeInspectorProps } from "../types";
import { VariablePicker } from "../../variable-picker";
import { GitBranch, SlidersHorizontal, Code2 } from "lucide-react";

interface DataTypeOption {
  value: ConditionDataType;
  label: string;
}

const DATA_TYPES: DataTypeOption[] = [
  { value: "string", label: "Texto (String)" },
  { value: "number", label: "Número" },
  { value: "boolean", label: "Booleano" },
  { value: "array", label: "Lista / Arreglo" },
  { value: "exists", label: "Existe / No vacío" },
  { value: "custom", label: "Expresión avanzada" },
];

const OPERATORS_BY_TYPE: Record<ConditionDataType, Array<{ value: ConditionOperator; label: string; unary?: boolean }>> = {
  string: [
    { value: "contains", label: "Contiene texto" },
    { value: "not_contains", label: "No contiene texto" },
    { value: "equals", label: "Es exactamente igual a" },
    { value: "not_equals", label: "Es diferente de" },
    { value: "starts_with", label: "Empieza con" },
    { value: "ends_with", label: "Termina con" },
    { value: "regex_match", label: "Coincide con RegExp" },
  ],
  number: [
    { value: "equals", label: "Igual a (=)" },
    { value: "not_equals", label: "Diferente de (!=)" },
    { value: "greater_than", label: "Mayor que (>)" },
    { value: "greater_than_or_equal", label: "Mayor o igual (>=)" },
    { value: "less_than", label: "Menor que (<)" },
    { value: "less_than_or_equal", label: "Menor o igual (<=)" },
  ],
  boolean: [
    { value: "is_true", label: "Es verdadero (true)", unary: true },
    { value: "is_false", label: "Es falso (false)", unary: true },
    { value: "equals", label: "Es igual a" },
    { value: "not_equals", label: "Es diferente de" },
  ],
  array: [
    { value: "array_contains", label: "Contiene elemento" },
    { value: "array_not_empty", label: "Tiene elementos (no vacío)", unary: true },
    { value: "array_is_empty", label: "Está vacío (0 elementos)", unary: true },
  ],
  exists: [
    { value: "is_not_null_or_empty", label: "Existe y no está vacío", unary: true },
    { value: "is_null_or_empty", label: "Es nulo, indefinido o vacío", unary: true },
  ],
  custom: [],
};

// Generar una expresión equivalente para serialización DSL
function buildExpression(
  dataType: ConditionDataType,
  operator: ConditionOperator,
  left: string,
  right: string
): string {
  const cleanLeft = left.replace(/^\{\{|\}\}$/g, "").trim() || "val";
  const cleanRight = right.replace(/^\{\{|\}\}$/g, "").trim();

  switch (dataType) {
    case "number": {
      const opMap: Record<string, string> = {
        equals: "=",
        not_equals: "!=",
        greater_than: ">",
        greater_than_or_equal: ">=",
        less_than: "<",
        less_than_or_equal: "<=",
      };
      return `${cleanLeft} ${opMap[operator] || "="} ${cleanRight || 0}`;
    }
    case "string": {
      if (operator === "contains") return `$contains(${cleanLeft}, "${cleanRight}")`;
      if (operator === "not_contains") return `not($contains(${cleanLeft}, "${cleanRight}"))`;
      if (operator === "starts_with") return `$substring(${cleanLeft}, 0, ${cleanRight.length}) = "${cleanRight}"`;
      if (operator === "not_equals") return `${cleanLeft} != "${cleanRight}"`;
      return `${cleanLeft} = "${cleanRight}"`;
    }
    case "boolean": {
      if (operator === "is_false") return `not(${cleanLeft})`;
      return `Boolean(${cleanLeft}) = true`;
    }
    case "array": {
      if (operator === "array_is_empty") return `$count(${cleanLeft}) = 0`;
      if (operator === "array_not_empty") return `$count(${cleanLeft}) > 0`;
      return `"${cleanRight}" in ${cleanLeft}`;
    }
    case "exists": {
      if (operator === "is_null_or_empty") return `$not(${cleanLeft}) or ${cleanLeft} = ""`;
      return `Boolean(${cleanLeft}) and ${cleanLeft} != ""`;
    }
    default:
      return `${cleanLeft} != null`;
  }
}

export function ConditionInspectorForm({
  node,
  updateParam,
  updateNode,
}: NodeInspectorProps<ConditionNode>) {
  const currentDataType: ConditionDataType = node.params.dataType || "string";
  const currentOperator: ConditionOperator =
    (node.params.operator as ConditionOperator) ||
    OPERATORS_BY_TYPE[currentDataType][0]?.value ||
    "contains";
  const leftOperand = node.params.leftOperand ?? "";
  const rightOperand = node.params.rightOperand ?? "";

  const operators = OPERATORS_BY_TYPE[currentDataType] || [];
  const selectedOpMeta = operators.find((op) => op.value === currentOperator);
  const isUnary = selectedOpMeta?.unary || false;

  const handleDataTypeChange = (newType: ConditionDataType) => {
    const firstOp = OPERATORS_BY_TYPE[newType][0]?.value;
    const updates: any = {
      params: {
        ...node.params,
        dataType: newType,
        operator: firstOp,
      },
    };
    if (newType !== "custom" && firstOp) {
      updates.params.expression = buildExpression(newType, firstOp, leftOperand, rightOperand);
    }
    updateNode(updates);
  };

  const handleOperatorChange = (newOp: ConditionOperator) => {
    const newExpr = buildExpression(currentDataType, newOp, leftOperand, rightOperand);
    updateNode({
      params: {
        ...node.params,
        operator: newOp,
        expression: newExpr,
      },
    } as any);
  };

  const handleLeftChange = (val: string) => {
    const newExpr = buildExpression(currentDataType, currentOperator, val, rightOperand);
    updateNode({
      params: {
        ...node.params,
        leftOperand: val,
        expression: newExpr,
      },
    } as any);
  };

  const handleRightChange = (val: string) => {
    const newExpr = buildExpression(currentDataType, currentOperator, leftOperand, val);
    updateNode({
      params: {
        ...node.params,
        rightOperand: val,
        expression: newExpr,
      },
    } as any);
  };

  return (
    <div className="space-y-3.5">
      {/* Selector de Naturaleza del Dato */}
      <div>
        <label className="block text-[11px] font-medium text-zinc-400 mb-1">
          Naturaleza del dato
        </label>
        <select
          value={currentDataType}
          onChange={(e) => handleDataTypeChange(e.target.value as ConditionDataType)}
          className="w-full bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-zinc-600 transition-colors"
        >
          {DATA_TYPES.map((dt) => (
            <option key={dt.value} value={dt.value}>
              {dt.label}
            </option>
          ))}
        </select>
      </div>

      {currentDataType !== "custom" ? (
        <>
          {/* Operación según el tipo seleccionado */}
          <div>
            <label className="block text-[11px] font-medium text-zinc-400 mb-1">
              Operación
            </label>
            <select
              value={currentOperator}
              onChange={(e) => handleOperatorChange(e.target.value as ConditionOperator)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1.5 text-xs text-zinc-200 font-mono focus:outline-none focus:border-zinc-600 transition-colors"
            >
              {operators.map((op) => (
                <option key={op.value} value={op.value}>
                  {op.label}
                </option>
              ))}
            </select>
          </div>

          {/* Operando Izquierdo con Selector de Variables */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[11px] font-medium text-zinc-400">
                Valor o variable a comparar
              </label>
              <VariablePicker onSelect={(token) => handleLeftChange(token)} />
            </div>
            <input
              type="text"
              value={leftOperand}
              onChange={(e) => handleLeftChange(e.target.value)}
              placeholder="ej. {{steps.extract_1.output}} o miVariable"
              className="w-full bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1.5 text-xs text-zinc-200 font-mono placeholder-zinc-500 focus:outline-none focus:border-zinc-600 transition-colors"
            />
          </div>

          {/* Operando Derecho (si la operación no es unaria) */}
          {!isUnary && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11px] font-medium text-zinc-400">
                  Valor esperado
                </label>
                <VariablePicker onSelect={(token) => handleRightChange(token)} />
              </div>
              <input
                type="text"
                value={rightOperand}
                onChange={(e) => handleRightChange(e.target.value)}
                placeholder={currentDataType === "number" ? "100" : "texto esperado"}
                className="w-full bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1.5 text-xs text-zinc-200 font-mono placeholder-zinc-500 focus:outline-none focus:border-zinc-600 transition-colors"
              />
            </div>
          )}
        </>
      ) : (
        /* Modo expresión JSONata / Avanzada */
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-[11px] font-medium text-zinc-400">
              Expresión JSONata / JS
            </label>
            <VariablePicker onSelect={(token) => updateParam("expression", `${node.params.expression || ""} ${token}`)} />
          </div>
          <input
            type="text"
            value={node.params.expression || ""}
            onChange={(e) => updateParam("expression", e.target.value)}
            placeholder="total > 100 and status = 'active'"
            className="w-full bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1.5 text-xs text-zinc-200 font-mono focus:outline-none focus:border-zinc-600 transition-colors"
          />
        </div>
      )}

      {/* Referencia visual de bifurcación */}
      <div className="p-2.5 rounded bg-zinc-950/80 border border-zinc-800/80 text-[11px] text-zinc-400 space-y-1.5">
        <span className="font-mono text-[10px] text-zinc-500 uppercase tracking-wider block">
          Bifurcaciones del flujo
        </span>
        <div className="flex items-center space-x-2">
          <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
          <span>Si se cumple: salida izquierda (Verde / then)</span>
        </div>
        <div className="flex items-center space-x-2">
          <span className="w-2 h-2 rounded-full bg-rose-500"></span>
          <span>Si no se cumple: salida derecha (Roja / else)</span>
        </div>
      </div>
    </div>
  );
}
