// GENERATED FILE — DO NOT EDIT. Source: docs/frontend-workflow/_meta/lint-policy.yaml. Regenerate with npm run workflow:lint-gen.
// Workflow lint fragment: append this flat-config array after the project ESLint flat config.
// Parser and languageOptions remain project-owned; this fragment does not replace JS/JSX/TS/TSX setup.

import path from "node:path";

const workflowPolicyDefaults = {
  "paths": {
    "api": "src/api",
    "screens": "src/features/*/screens",
    "ui": "src/components/ui"
  }
};

const workflowPolicyMetadata = {
  "layer-boundaries": {
    "emitted_severity": "error",
    "files": [
      "src/api/**/*.{js,jsx,ts,tsx}",
      "src/components/ui/**/*.{js,jsx,ts,tsx}",
      "src/features/*/screens/**/*.{js,jsx,ts,tsx}"
    ],
    "ignores": [],
    "implementation": "auto",
    "rollout": "all",
    "target_severity": "error",
    "tier": "architecture"
  },
  "no-arbitrary-style-values": {
    "emitted_severity": "warn",
    "files": [
      "src/features/*/screens/**/*.{js,jsx,ts,tsx}"
    ],
    "ignores": [],
    "implementation": "auto",
    "rollout": "all",
    "target_severity": "warn",
    "tier": "style"
  },
  "no-fetch-in-screens": {
    "baseline": 3,
    "emitted_severity": "warn",
    "files": [
      "src/features/*/screens/**/*.{js,jsx,ts,tsx}"
    ],
    "ignores": [],
    "implementation": "auto",
    "rollout": "ratchet",
    "target_severity": "error",
    "tier": "safety"
  }
};

function toWorkflowPosixPath(value) {
  return String(value || "").replace(/\\/g, "/");
}

function escapeWorkflowRegExp(value) {
  return String(value).replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
}

function workflowPathPatternToRegExp(pattern) {
  const source = String(pattern || "")
    .replace(/\\/g, "/")
    .replace(/^\.\/+/, "")
    .replace(/\/+$/, "")
    .split("/")
    .map((segment) => escapeWorkflowRegExp(segment).replace(/\*/g, "[^/]*"))
    .join("/");
  return new RegExp("^" + source + "(?:/|$)");
}

const workflowPathMatchers = {
  api: workflowPathPatternToRegExp(workflowPolicyDefaults.paths.api),
  screens: workflowPathPatternToRegExp(workflowPolicyDefaults.paths.screens),
  ui: workflowPathPatternToRegExp(workflowPolicyDefaults.paths.ui)
};

function workflowFilename(context) {
  return (
    context.physicalFilename ||
    context.filename ||
    (typeof context.getFilename === "function" ? context.getFilename() : "")
  );
}

function workflowRelativeFilename(context) {
  const file = toWorkflowPosixPath(workflowFilename(context));
  const cwd = toWorkflowPosixPath(process.cwd()).replace(/\/+$/, "");
  if (file.startsWith(cwd + "/")) return file.slice(cwd.length + 1);
  return file.replace(/^\/+/, "");
}

function workflowPathKind(relPath) {
  const normalized = toWorkflowPosixPath(relPath);
  for (const key of ["api", "screens", "ui"]) {
    if (workflowPathMatchers[key].test(normalized)) return key;
  }
  return null;
}

function workflowResolveImport(context, source) {
  if (typeof source !== "string" || !source) return null;
  const value = toWorkflowPosixPath(source);
  if (value.startsWith(".")) {
    const base = path.posix.dirname(workflowRelativeFilename(context));
    return path.posix.normalize(path.posix.join(base, value)).replace(/^\.\//, "");
  }
  if (value.startsWith("@/")) return "src/" + value.slice(2);
  return value.replace(/^\.\//, "");
}

function workflowJsxName(node) {
  if (!node) return "";
  if (node.type === "JSXIdentifier") return node.name;
  if (node.type === "JSXMemberExpression") return workflowJsxName(node.object) + "." + workflowJsxName(node.property);
  if (node.type === "JSXNamespacedName") return workflowJsxName(node.namespace) + ":" + workflowJsxName(node.name);
  return "";
}

function workflowIsObjectStyleExpression(node) {
  if (!node) return false;
  if (node.type === "ObjectExpression") return true;
  if (node.type === "ArrayExpression") {
    return node.elements.some((element) => workflowIsObjectStyleExpression(element));
  }
  return false;
}

const workflowRules = {
  "layer-boundaries": {
    meta: {
      type: "problem",
      docs: { description: "Workflow API/UI/screen layers do not import upward across documented paths." },
      schema: []
    },
    create(context) {
      function checkImport(node) {
        const source = node.source && node.source.value;
        const target = workflowResolveImport(context, source);
        if (!target) return;

        const fromKind = workflowPathKind(workflowRelativeFilename(context));
        const toKind = workflowPathKind(target);
        if (!fromKind || !toKind) return;

        const apiViolation = fromKind === "api" && (toKind === "screens" || toKind === "ui");
        const uiViolation = fromKind === "ui" && (toKind === "screens" || toKind === "api");
        if (apiViolation || uiViolation) {
          context.report({
            node,
            message: "Workflow layer boundary violation: {{fromKind}} files must not import {{toKind}} layer files.",
            data: { fromKind, toKind }
          });
        }
      }
      return {
        ImportDeclaration: checkImport,
        ExportAllDeclaration: checkImport,
        ExportNamedDeclaration: checkImport
      };
    }
  },
  "no-arbitrary-style-values": {
    meta: {
      type: "suggestion",
      docs: { description: "Workflow screens avoid ad hoc inline style object values when local tokens/components exist." },
      schema: []
    },
    create(context) {
      return {
        JSXAttribute(node) {
          if (workflowJsxName(node.name) !== "style") return;
          const expression = node.value && node.value.type === "JSXExpressionContainer" ? node.value.expression : null;
          if (workflowIsObjectStyleExpression(expression)) {
            context.report({
              node,
              message: "Avoid arbitrary inline style object values in workflow screens; prefer local tokens or catalogued components."
            });
          }
        }
      };
    }
  },
  "no-fetch-in-screens": {
    meta: {
      type: "problem",
      docs: { description: "Workflow screens do not call raw fetch or axios directly." },
      schema: []
    },
    create(context) {
      function report(node) {
        context.report({
          node,
          message: "Screens must route data access through approved API/query/state layers instead of raw fetch or axios."
        });
      }
      return {
        ImportDeclaration(node) {
          if (!node.source || node.source.value !== "axios") return;
          if (node.importKind === "type") return;
          const specifiers = node.specifiers || [];
          if (specifiers.length && specifiers.every((specifier) => specifier.importKind === "type")) return;
          report(node);
        },
        CallExpression(node) {
          const callee = node.callee;
          if (callee && callee.type === "Identifier" && (callee.name === "fetch" || callee.name === "axios")) report(node);
          if (
            callee &&
            callee.type === "MemberExpression" &&
            callee.object &&
            callee.object.type === "Identifier" &&
            callee.object.name === "axios"
          ) {
            report(node);
          }
        }
      };
    }
  }
};

const frontendWorkflowPlugin = {
  rules: workflowRules
};

export { workflowPolicyMetadata };

export default [
  {
    name: "frontend-workflow/plugin",
    plugins: {
      "frontend-workflow": frontendWorkflowPlugin
    }
  },
  {
    name: "frontend-workflow/layer-boundaries",
    files: ["src/api/**/*.{js,jsx,ts,tsx}","src/components/ui/**/*.{js,jsx,ts,tsx}","src/features/*/screens/**/*.{js,jsx,ts,tsx}"],
    rules: {
      "frontend-workflow/layer-boundaries": "error"
    }
  },
  {
    name: "frontend-workflow/no-arbitrary-style-values",
    files: ["src/features/*/screens/**/*.{js,jsx,ts,tsx}"],
    rules: {
      "frontend-workflow/no-arbitrary-style-values": "warn"
    }
  },
  {
    name: "frontend-workflow/no-fetch-in-screens",
    files: ["src/features/*/screens/**/*.{js,jsx,ts,tsx}"],
    rules: {
      "frontend-workflow/no-fetch-in-screens": "warn"
    }
  }
];
