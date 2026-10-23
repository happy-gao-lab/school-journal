import { describe, expect, it } from "vitest";

import { Role, ROLES } from "./role.js";
import { USER_STATUSES, UserStatus } from "./user-status.js";

describe("enum tuples", () => {
    it("ROLES lists exactly the Role values, in declaration order", () => {
        expect(ROLES).toEqual(Object.values(Role));
    });

    it("USER_STATUSES lists exactly the UserStatus values, in declaration order", () => {
        expect(USER_STATUSES).toEqual(Object.values(UserStatus));
    });
});
