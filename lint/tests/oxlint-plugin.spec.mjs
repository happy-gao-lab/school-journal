import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const run = promisify(execFile);

const ROOT = resolve(import.meta.dirname, "../..");
const OXLINT = join(ROOT, "node_modules/.bin/oxlint");
const PLUGIN = join(ROOT, "lint/oxlint-plugin.mjs");

const BLOCK_ARROW = "school-journal(no-block-arrow-argument)";
const INLINE_JSX = "school-journal(no-inline-jsx-function)";

let workDir;

beforeEach(async () => {
    workDir = await mkdtemp(join(tmpdir(), "oxlint-plugin-"));
    const config = {
        plugins: [],
        categories: { correctness: "off" },
        jsPlugins: [PLUGIN],
        rules: {
            "school-journal/no-block-arrow-argument": "warn",
            "school-journal/no-inline-jsx-function": "warn",
        },
    };
    await writeFile(join(workDir, "config.json"), JSON.stringify(config));
});

afterEach(async () => {
    await rm(workDir, { recursive: true, force: true });
});

// Runs the real oxlint binary on `code` and returns the reported rules with their lines.
const lint = async (code, fileName = "sample.tsx") => {
    const filePath = join(workDir, fileName);
    await writeFile(filePath, code);
    const args = ["-c", join(workDir, "config.json"), "-f", "json", filePath];
    const { stdout } = await run(OXLINT, args);
    const { diagnostics } = JSON.parse(stdout);
    const toReport = (diagnostic) => ({
        rule: diagnostic.code,
        line: diagnostic.labels[0].span.line,
    });
    return diagnostics.map(toReport);
};

describe("no-block-arrow-argument", () => {
    it("allows a one-line arrow as an argument", async () => {
        expect(
            await lint("export const double = (items) => items.map((item) => item * 2);\n"),
        ).toEqual([]);
    });

    it("reports a block-body arrow passed as an argument", async () => {
        const code = [
            "export const double = (items) =>",
            "    items.map((item) => {",
            "        return item * 2;",
            "    });",
        ].join("\n");
        expect(await lint(code)).toEqual([{ rule: BLOCK_ARROW, line: 2 }]);
    });

    it("reports a block-body function expression passed as an argument", async () => {
        const code = [
            "export const double = (items) =>",
            "    items.map(function (item) {",
            "        return item * 2;",
            "    });",
        ].join("\n");
        expect(await lint(code)).toEqual([{ rule: BLOCK_ARROW, line: 2 }]);
    });

    it("allows React hook callbacks, called directly or through React", async () => {
        const code = [
            'import React, { useEffect } from "react";',
            "export const useTitle = (title) => {",
            "    useEffect(() => {",
            "        document.title = title;",
            "    }, [title]);",
            "    React.useLayoutEffect(() => {",
            "        document.title = title;",
            "    }, [title]);",
            "};",
        ].join("\n");
        expect(await lint(code)).toEqual([]);
    });

    it("reports a member call that only looks like a hook", async () => {
        const code = [
            "export const setup = (app) =>",
            "    app.useGlobalPipes(() => {",
            "        return app;",
            "    });",
        ].join("\n");
        expect(await lint(code)).toEqual([{ rule: BLOCK_ARROW, line: 2 }]);
    });

    it("allows a block-body callback in db.transaction()", async () => {
        const code = [
            "export const save = (db) =>",
            "    db.transaction(async (tx) => {",
            "        await tx.insert();",
            "    });",
        ].join("\n");
        expect(await lint(code)).toEqual([]);
    });

    it("allows new Promise() but reports other constructors", async () => {
        const code = [
            "export const wait = () =>",
            "    new Promise((resolve) => {",
            "        setTimeout(resolve, 10);",
            "    });",
            "export const start = () =>",
            "    new Worker(() => {",
            "        return 1;",
            "    });",
        ].join("\n");
        expect(await lint(code)).toEqual([{ rule: BLOCK_ARROW, line: 6 }]);
    });

    it("allows block-body functions that are not direct arguments", async () => {
        const code = [
            "export const save = () => {",
            "    return 1;",
            "};",
            "export const useSave = (useMutation) =>",
            "    useMutation({",
            "        onSuccess: () => {",
            "            save();",
            "        },",
            "    });",
            "export const run = (callback) => callback({ onDone: () => { save(); } });",
        ].join("\n");
        expect(await lint(code)).toEqual([]);
    });
});

describe("no-inline-jsx-function", () => {
    it("reports inline arrow and function expressions in on* props", async () => {
        const code = [
            "export const Form = ({ setValue }) => (",
            "    <form>",
            "        <button onClick={() => setValue(0)} />",
            "        <input onChange={function (event) { setValue(event.target.value); }} />",
            "    </form>",
            ");",
        ].join("\n");
        expect(await lint(code)).toEqual([
            { rule: INLINE_JSX, line: 3 },
            { rule: INLINE_JSX, line: 4 },
        ]);
    });

    it("allows named handlers and handler factories", async () => {
        const code = [
            "export const Row = ({ item, handleSave, handleDelete }) => (",
            "    <div>",
            "        <button onClick={handleSave} />",
            "        <button onClick={handleDelete(item.id)} />",
            "    </div>",
            ");",
        ].join("\n");
        expect(await lint(code)).toEqual([]);
    });

    it("allows render props", async () => {
        const code = [
            "export const Field = ({ FormField }) => (",
            "    <FormField render={({ field }) => <input value={field.value} />} />",
            ");",
        ].join("\n");
        expect(await lint(code)).toEqual([]);
    });

    it("only checks props named on + capital letter", async () => {
        const code = [
            "export const Timer = ({ Countdown, stop }) => (",
            "    <Countdown once={() => stop()} />",
            ");",
        ].join("\n");
        expect(await lint(code)).toEqual([]);
    });
});
