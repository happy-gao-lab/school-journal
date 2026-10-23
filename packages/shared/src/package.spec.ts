import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

import * as source from "./index.js";

const run = promisify(execFile);

const PACKAGE_DIR = new URL("..", import.meta.url);
const EXPECTED_EXPORTS = Object.keys(source).toSorted();

// Runs a script in a separate Node process so the package resolves through its
// `exports` map and the built `dist/`, exactly as an app would load it.
const loadExportsWith = async (args: string[]) => {
    const { stdout } = await run(process.execPath, args, { cwd: PACKAGE_DIR });
    return (JSON.parse(stdout) as string[]).toSorted();
};

describe("built package", () => {
    it("loads through ESM import", async () => {
        const exportNames = await loadExportsWith([
            "--input-type=module",
            "-e",
            "const shared = await import('@school-journal/shared'); process.stdout.write(JSON.stringify(Object.keys(shared)));",
        ]);

        expect(exportNames).toEqual(EXPECTED_EXPORTS);
    });

    it("loads through require", async () => {
        const exportNames = await loadExportsWith([
            "-e",
            "process.stdout.write(JSON.stringify(Object.keys(require('@school-journal/shared'))));",
        ]);

        expect(exportNames).toEqual(EXPECTED_EXPORTS);
    });
});
