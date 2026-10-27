export const effectBlockBody = {
  meta: { type: 'problem', schema: [], messages: { block: 'React effects must use a function with a block body.' } },
  create(context) {
    const names = new Set(['useEffect', 'useLayoutEffect', 'useInsertionEffect']);
    return {
      ImportSpecifier(node) {
        if (node.parent.source.value === 'react' && names.has(node.imported.name)) names.add(node.local.name);
      },
      CallExpression(node) {
        const callee = node.callee;
        const effect = (callee.type === 'Identifier' && names.has(callee.name))
          || (callee.type === 'MemberExpression' && !callee.computed && names.has(callee.property.name));
        if (!effect) return;
        const callback = node.arguments[0];
        if (!callback || !['ArrowFunctionExpression', 'FunctionExpression'].includes(callback.type) || callback.body.type !== 'BlockStatement') {
          context.report({ node, messageId: 'block' });
        }
      },
    };
  },
};
