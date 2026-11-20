import assert from "node:assert/strict";
import { dashboardForRole, isPublicAuthPath, roleCanAccessPath } from "../src/lib/auth-routing.js";

assert.equal(dashboardForRole("ADMIN"), "/");
assert.equal(dashboardForRole("DOSEN"), "/lecturer");
assert.equal(dashboardForRole("STUDENT"), "/student");
assert.equal(dashboardForRole("PIMPINAN"), "/leadership");
assert.equal(dashboardForRole("UNKNOWN"), null);
assert.equal(isPublicAuthPath("/forgot-password"), true);
assert.equal(isPublicAuthPath("/reset-password"), true);
assert.equal(roleCanAccessPath("ADMIN", "/forgot-password"), true);
assert.equal(roleCanAccessPath("DOSEN", "/reset-password"), true);
assert.equal(isPublicAuthPath("/forgot-password/other"), false);

for (const path of [
  "/",
  "/bookings",
  "/schedule",
  "/rooms",
  "/students",
  "/reports",
  "/notifications",
  "/settings",
  "/lecturers"
]) {
  assert.equal(roleCanAccessPath("ADMIN", path), true, `ADMIN should access ${path}`);
}
assert.equal(roleCanAccessPath("ADMIN", "/lecturers/12"), true);
assert.equal(roleCanAccessPath("ADMIN", "/students/12"), true);
assert.equal(roleCanAccessPath("ADMIN", "/lecturer"), false);
assert.equal(roleCanAccessPath("ADMIN", "/lecturer/bookings"), false);
assert.equal(roleCanAccessPath("ADMIN", "/student"), false);
assert.equal(roleCanAccessPath("DOSEN", "/lecturer/bookings"), true);
assert.equal(roleCanAccessPath("DOSEN", "/rooms"), false);
assert.equal(roleCanAccessPath("STUDENT", "/student/rooms"), true);
assert.equal(roleCanAccessPath("STUDENT", "/admin/bookings"), false);
assert.equal(roleCanAccessPath("STUDENT", "/notifications"), true);
assert.equal(roleCanAccessPath("PIMPINAN", "/leadership"), true);
assert.equal(roleCanAccessPath("PIMPINAN", "/leadership/rooms"), true);
assert.equal(roleCanAccessPath("PIMPINAN", "/leadership/users"), false);
assert.equal(roleCanAccessPath("PIMPINAN", "/bookings"), false);
assert.equal(roleCanAccessPath("STUDENT", "/leadership"), false);
assert.equal(roleCanAccessPath("DOSEN", "/leadership"), false);

console.log("Role routing passed: ADMIN, DOSEN, STUDENT, PIMPINAN dashboards and protected routes.");
