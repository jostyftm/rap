"use client";

import React from "react";
import type { ConditionNode, ConditionDataType, ConditionOperator } from "@rpa/dsl";
import type { NodeInspectorProps } from "../types";
import { VariablePicker } from "../../variable-picker";
import { GitBranch } from "lucide-react";
import { Field, Select, TextInput } from "@/components/ui/primitives";

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
    const params = {
      ...node.params,
      dataType: newType,
      operator: firstOp,
      expression:
        newType !== "custom" && firstOp
          ? buildExpression(newType, firstOp, leftOperand, rightOperand)
          : node.params.expression,
    };
    updateNode({ params });
  };

  const handleOperatorChange = (newOp: ConditionOperator) => {
    const newExpr = buildExpression(currentDataType, newOp, leftOperand, rightOperand);
    updateNode({
      params: {
        ...node.params,
        operator: newOp,
        expression: newExpr,
      },
    });
  };

  const handleLeftChange = (val: string) => {
    const newExpr = buildExpression(currentDataType, currentOperator, val, rightOperand);
    updateNode({
      params: {
        ...node.params,
        leftOperand: val,
        expression: newExpr,
      },
    });
  };

  const handleRightChange = (val: string) => {
    const newExpr = buildExpression(currentDataType, currentOperator, leftOperand, val);
    updateNode({
      params: {
        ...node.params,
        rightOperand: val,
        expression: newExpr,
      },
    });
  };

  return (
    <div className="space-y-4">
      <Field
        label="Naturaleza del dato"
        htmlFor="condition-data-type"
        hint="Determina los operadores disponibles para la comparación."
      >
        <Select
          id="condition-data-type"
          value={currentDataType}
          onChange={(e) => handleDataTypeChange(e.target.value as ConditionDataType)}
        >
          {DATA_TYPES.map((dt) => (
            <option key={dt.value} value={dt.value}>
              {dt.label}
            </option>
          ))}
        </Select>
      </Field>

      {currentDataType !== "custom" ? (
        <>
          <Field label="Operación" htmlFor="condition-operator">
            <Select
              id="condition-operator"
              value={currentOperator}
              onChange={(e) => handleOperatorChange(e.target.value as ConditionOperator)}
              className="font-mono text-[12px]"
            >
              {operators.map((op) => (
                <option key={op.value} value={op.value}>
                  {op.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label="Valor o variable a comparar"
            htmlFor="condition-left"
            action={<VariablePicker onSelect={(token) => handleLeftChange(token)} />}
          >
            <TextInput
              id="condition-left"
              type="text"
              value={leftOperand}
              onChange={(e) => handleLeftChange(e.target.value)}
              placeholder="ej. {{steps.extract_1.output}} o miVariable"
              className="font-mono"
            />
          </Field>

          {!isUnary && (
            <Field
              label="Valor esperado"
              htmlFor="condition-right"
              action={<VariablePicker onSelect={(token) => handleRightChange(token)} />}
            >
              <TextInput
                id="condition-right"
                type="text"
                value={rightOperand}
                onChange={(e) => handleRightChange(e.target.value)}
                placeholder={currentDataType === "number" ? "100" : "texto esperado"}
                className="font-mono"
              />
            </Field>
          )}
        </>
      ) : (
        <Field
          label="Expresión JSONata / JS"
          htmlFor="condition-expression"
          hint="Debe devolver un valor booleano."
          action={
            <VariablePicker
              onSelect={(token) =>
                updateParam("expression", `${node.params.expression || ""} ${token}`)
              }
            />
          }
        >
          <TextInput
            id="condition-expression"
            type="text"
            value={node.params.expression || ""}
            onChange={(e) => updateParam("expression", e.target.value)}
            placeholder="total > 100 and status = 'active'"
            className="font-mono"
          />
        </Field>
      )}

      <div className="space-y-1.5 rounded-card border border-line bg-card px-4 py-3 text-[11px] text-fg-muted">
        <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-fg-subtle">
          <GitBranch className="h-3 w-3" />
          Bifurcaciones del flujo
        </span>
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-success" />
          <span>Si se cumple: salida izquierda (then)</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-danger" />
          <span>Si no se cumple: salida derecha (else)</span>
        </div>
      </div>
    </div>
  );
}
