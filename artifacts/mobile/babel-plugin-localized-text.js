module.exports = function localizedTextPlugin({ types: t }) {
  function isUiTranslationCall(node) {
    return (
      t.isCallExpression(node) &&
      ((t.isIdentifier(node.callee) &&
        ["t", "localizeUi"].includes(node.callee.name)) ||
        (t.isMemberExpression(node.callee) &&
          t.isIdentifier(node.callee.property) &&
          ["t", "localizeUi"].includes(node.callee.property.name)))
    );
  }

  // Conditional labels such as loading ? "Saving…" : "Save" are UI copy,
  // while {profile.display_name} is user data. Only the former gets the
  // asynchronous global translation fallback.
  function isUiStringExpression(node) {
    if (isUiTranslationCall(node) || t.isStringLiteral(node)) return true;
    if (t.isConditionalExpression(node)) {
      return isUiStringExpression(node.consequent) && isUiStringExpression(node.alternate);
    }
    if (t.isLogicalExpression(node)) {
      return isUiStringExpression(node.left) && isUiStringExpression(node.right);
    }
    if (t.isTemplateLiteral(node)) {
      return node.expressions.length === 0;
    }
    return false;
  }

  return {
    name: "localized-text",
    visitor: {
      Program: {
        enter(path, state) {
          state.localizedTextUsed = false;
          state.localizeUiUsed = false;
          state.uiTextLiterals = new Set();
          const filename = state.filename || state.file?.opts?.filename || "";
          state.isAppSource =
            !filename.includes("node_modules") &&
            !filename.includes(`${require("path").sep}vendor${require("path").sep}`);
        },
        exit(path, state) {
          if (!state.isAppSource) return;
          if (state.localizedTextUsed) {
            const alreadyImported = path.node.body.some(
              (node) =>
                t.isImportDeclaration(node) &&
                node.source.value === "@/components/ui/LocalizedText",
            );
            if (!alreadyImported) {
              path.unshiftContainer(
                "body",
                t.importDeclaration(
                  [t.importDefaultSpecifier(t.identifier("LocalizedText"))],
                  t.stringLiteral("@/components/ui/LocalizedText"),
                ),
              );
            }
          }
          if (state.localizeUiUsed) {
            const alreadyUiImport = path.node.body.some(
              (node) =>
                t.isImportDeclaration(node) &&
                node.source.value === "@/lib/uiTranslations" &&
                node.specifiers.some(
                  (specifier) =>
                    t.isImportSpecifier(specifier) &&
                    specifier.imported.name === "localizeUi",
                ),
            );
            if (!alreadyUiImport) {
              path.unshiftContainer(
                "body",
                t.importDeclaration(
                  [
                    t.importSpecifier(
                      t.identifier("localizeUi"),
                      t.identifier("localizeUi"),
                    ),
                  ],
                  t.stringLiteral("@/lib/uiTranslations"),
                ),
              );
            }
          }
          if (state.uiTextLiterals.size > 0) {
            const alreadyRegistryImport = path.node.body.some(
              (node) =>
                t.isImportDeclaration(node) &&
                node.source.value === "@/lib/uiTranslations" &&
                node.specifiers.some(
                  (specifier) =>
                    t.isImportSpecifier(specifier) &&
                    specifier.imported.name === "registerUiTexts",
                ),
            );
            if (!alreadyRegistryImport) {
              path.unshiftContainer(
                "body",
                t.importDeclaration(
                  [
                    t.importSpecifier(
                      t.identifier("registerUiTexts"),
                      t.identifier("registerUiTexts"),
                    ),
                  ],
                  t.stringLiteral("@/lib/uiTranslations"),
                ),
              );
            }
            path.pushContainer(
              "body",
              t.expressionStatement(
                t.callExpression(t.identifier("registerUiTexts"), [
                  t.arrayExpression(
                    Array.from(state.uiTextLiterals).map((text) => t.stringLiteral(text)),
                  ),
                ]),
              ),
            );
          }
        },
      },
      JSXIdentifier(path, state) {
        if (!state.isAppSource) return;
        if (path.node.name !== "Text") {
          const attribute = path.parentPath;
          if (
            attribute.isJSXAttribute() &&
            [
              "placeholder",
              "accessibilityLabel",
              "accessibilityHint",
              "title",
              "label",
              "sublabel",
              "sub",
              "desc",
              "subtitle",
              "description",
              "note",
              "text",
              "message",
              "buttonText",
            ].includes(path.node.name) &&
            t.isStringLiteral(attribute.node.value)
          ) {
            state.uiTextLiterals.add(attribute.node.value.value);
            attribute.node.value = t.jsxExpressionContainer(
              t.callExpression(t.identifier("localizeUi"), [
                t.stringLiteral(attribute.node.value.value),
              ]),
            );
            state.localizeUiUsed = true;
          }
          return;
        }
        const parent = path.parentPath;
        if (
          !parent.isJSXOpeningElement() &&
          !parent.isJSXClosingElement()
        ) {
          return;
        }
        // Only static JSX copy and expressions that clearly produce UI copy
        // should be sent to the global UI translator. Dynamic children may be
        // user names, post content, amounts, or other values that must remain
        // exactly as supplied by the app.
        if (parent.isJSXOpeningElement()) {
          const element = parent.parentPath;
          const children = element.isJSXElement() ? element.node.children : [];
          const hasStaticText = children.some(
            (child) => t.isJSXText(child) && child.value.trim().length > 0,
          );
          const isUiExpressionChildren =
            children.length > 0 &&
            children.every(
              (child) =>
                t.isJSXExpressionContainer(child) &&
                isUiStringExpression(child.expression),
            );
          const hasNestedChildren = children.some(
            (child) => t.isJSXElement(child) || t.isJSXFragment(child),
          );
          if (hasStaticText && !hasNestedChildren) {
            children
              .filter((child) => t.isJSXText(child))
              .forEach((child) => state.uiTextLiterals.add(child.value));
            parent.node.attributes.push(
              t.jsxAttribute(
                t.jsxIdentifier("__afuchatStaticText"),
                t.jsxExpressionContainer(t.booleanLiteral(true)),
              ),
            );
            parent.node.attributes.push(
              t.jsxAttribute(
                t.jsxIdentifier("__afuchatStaticParts"),
                t.jsxExpressionContainer(
                  t.arrayExpression(
                    children
                      .filter((child) => t.isJSXText(child))
                      .map((child) => t.stringLiteral(child.value)),
                  ),
                ),
              ),
            );
          } else if (isUiExpressionChildren) {
            children.forEach((child) => {
              if (!t.isJSXExpressionContainer(child)) return;
              const expression = child.expression;
              if (
                isUiTranslationCall(expression) &&
                expression.arguments[0] &&
                t.isStringLiteral(expression.arguments[0])
              ) {
                state.uiTextLiterals.add(expression.arguments[0].value);
              }
            });
            parent.node.attributes.push(
              t.jsxAttribute(
                t.jsxIdentifier("__afuchatStaticText"),
                t.jsxExpressionContainer(t.booleanLiteral(true)),
              ),
            );
            parent.node.attributes.push(
              t.jsxAttribute(
                t.jsxIdentifier("__afuchatTranslateAllText"),
                t.jsxExpressionContainer(t.booleanLiteral(true)),
              ),
            );
          }
        }
        path.node.name = "LocalizedText";
        state.localizedTextUsed = true;
      },
    },
  };
};