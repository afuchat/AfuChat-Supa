module.exports = function localizedTextPlugin({ types: t }) {
  return {
    name: "localized-text",
    visitor: {
      Program: {
        enter(path, state) {
          state.localizedTextUsed = false;
          state.localizeUiUsed = false;
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
              "subtitle",
              "description",
              "message",
              "buttonText",
            ].includes(path.node.name) &&
            t.isStringLiteral(attribute.node.value)
          ) {
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
        // Only static JSX copy should be sent to the global UI translator.
        // Dynamic children may be user names, post content, amounts, or other
        // values that must remain exactly as supplied by the app.
        if (parent.isJSXOpeningElement()) {
          const element = parent.parentPath;
          const children = element.isJSXElement() ? element.node.children : [];
          const hasStaticText = children.some(
            (child) => t.isJSXText(child) && child.value.trim().length > 0,
          );
          const hasDynamicOrNestedChildren = children.some(
            (child) => !t.isJSXText(child),
          );
          if (hasStaticText && !hasDynamicOrNestedChildren) {
            parent.node.attributes.push(
              t.jsxAttribute(
                t.jsxIdentifier("__afuchatStaticText"),
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