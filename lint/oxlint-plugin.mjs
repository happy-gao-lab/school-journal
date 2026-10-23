// Project-specific oxlint rules (JS plugin API, ESLint-compatible).

const HOOK_NAME = /^use[A-Z]/;
const EVENT_HANDLER_PROP = /^on[A-Z]/;

// Calls whose callback is the API itself: extracting it doesn't make the code clearer.
const CALLBACK_METHODS = new Set(["transaction"]);
const CALLBACK_CONSTRUCTORS = new Set(["Promise"]);

const isFunctionNode = (node) =>
    node.type === "ArrowFunctionExpression" || node.type === "FunctionExpression";

// React hooks need inline callbacks: `react/exhaustive-deps` can't check a function reference.
const isHookCall = ({ callee }) => {
    if (callee.type === "Identifier") return HOOK_NAME.test(callee.name);
    return (
        callee.type === "MemberExpression" &&
        callee.object.type === "Identifier" &&
        callee.object.name === "React" &&
        callee.property.type === "Identifier" &&
        HOOK_NAME.test(callee.property.name)
    );
};

const isAllowedCallback = (call) => {
    const { callee } = call;
    if (call.type === "NewExpression") {
        return callee.type === "Identifier" && CALLBACK_CONSTRUCTORS.has(callee.name);
    }
    if (isHookCall(call)) return true;
    return (
        callee.type === "MemberExpression" &&
        callee.property.type === "Identifier" &&
        CALLBACK_METHODS.has(callee.property.name)
    );
};

const isCheckedCallArgument = (node) => {
    const { parent } = node;
    const isCall = parent?.type === "CallExpression" || parent?.type === "NewExpression";
    return isCall && parent.arguments.includes(node) && !isAllowedCallback(parent);
};

const noBlockArrowArgument = {
    meta: {
        type: "suggestion",
        docs: {
            description:
                "Disallow anonymous functions with a block body passed as arguments; extract a named function instead. One-line arrows, React hooks, `.transaction()` and `new Promise()` are allowed.",
        },
    },
    create: (context) => {
        const check = (node) => {
            if (node.body.type !== "BlockStatement" || !isCheckedCallArgument(node)) return;
            context.report({
                node,
                message:
                    "Anonymous function with a block body passed as an argument. Extract it into a named function.",
            });
        };
        return { ArrowFunctionExpression: check, FunctionExpression: check };
    },
};

const noInlineJsxFunction = {
    meta: {
        type: "suggestion",
        docs: {
            description:
                "Disallow functions created inline in JSX event-handler props (`on*`); pass a named handler instead. Render props are allowed.",
        },
    },
    create: (context) => ({
        JSXAttribute: (attribute) => {
            const { name, value } = attribute;
            if (name.type !== "JSXIdentifier" || !EVENT_HANDLER_PROP.test(name.name)) return;
            if (value?.type !== "JSXExpressionContainer" || !isFunctionNode(value.expression)) {
                return;
            }
            context.report({
                node: value.expression,
                message: "Inline function in a JSX event handler. Pass a named handler instead.",
            });
        },
    }),
};

const plugin = {
    meta: { name: "school-journal" },
    rules: {
        "no-block-arrow-argument": noBlockArrowArgument,
        "no-inline-jsx-function": noInlineJsxFunction,
    },
};

export default plugin;
