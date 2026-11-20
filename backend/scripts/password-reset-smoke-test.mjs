import "dotenv/config";
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const backendDir = dirname(dirname(fileURLToPath(import.meta.url)));
const configuredDatabaseUrl = process.env.DATABASE_URL;
if (!configuredDatabaseUrl) {
  throw new Error("DATABASE_URL wajib tersedia untuk membuat database pengujian sementara.");
}

const sourceUrl = new URL(configuredDatabaseUrl);
if (!["localhost", "127.0.0.1", "::1"].includes(sourceUrl.hostname)) {
  throw new Error("Pengujian password reset hanya diizinkan pada MySQL localhost.");
}

const databaseName = `ruangku_reset_test_${randomBytes(6).toString("hex")}`;
if (!/^ruangku_reset_test_[a-f0-9]{12}$/.test(databaseName)) {
  throw new Error("Nama database pengujian tidak aman.");
}
const testUrl = new URL(sourceUrl);
testUrl.pathname = `/${databaseName}`;
const testDatabaseUrl = testUrl.toString();
const runId = randomBytes(6).toString("hex");
const adminEmail = `reset-test-admin-${runId}@example.test`;
const adminPassword = randomBytes(32).toString("base64url");
const userEmail = `reset-test-user-${runId}@example.test`;
const inactiveEmail = `reset-test-inactive-${runId}@example.test`;
const oldPassword = "Old-password-123";
const newPassword = "New-password-456";
const genericMessage = "Jika email terdaftar, tautan reset telah dikirim";
const invalidMessage = "Tautan reset tidak valid atau sudah kedaluwarsa";

let databaseCreated = false;
let testPrisma;
let server;
let serverOutput = "";
let apiBaseUrl;
let testUploadDir;

function logSafe(text) {
  return text.replace(/(reset-password\?token=)[a-f0-9]+/gi, "$1[redacted]");
}

async function getFreePort() {
  const listener = createServer();
  await new Promise((resolve, reject) => {
    listener.once("error", reject);
    listener.listen(0, "127.0.0.1", resolve);
  });
  const address = listener.address();
  if (!address || typeof address === "string") throw new Error("Tidak dapat memilih port uji.");
  const port = address.port;
  await new Promise((resolve, reject) => listener.close((error) => error ? reject(error) : resolve()));
  return port;
}

function runProcess(command, args, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { ...options, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk) => {
      stdout += chunk;
      process.stdout.write(chunk);
    });
    child.stderr.setEncoding("utf8").on("data", (chunk) => {
      stderr += chunk;
      process.stderr.write(chunk);
    });
    child.once("error", reject);
    child.once("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(" ")} gagal (exit ${code}).\n${stderr || stdout}`));
    });
  });
}

async function call(method, path, bodyOrToken, maybeBody) {
  const token = typeof bodyOrToken === "string" ? bodyOrToken : undefined;
  const body = typeof bodyOrToken === "string" ? maybeBody : bodyOrToken;
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, json: await response.json() };
}

async function waitForServer() {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error(`Backend pengujian berhenti: ${logSafe(serverOutput)}`);
    try {
      const response = await fetch(`${apiBaseUrl}/health`);
      if (response.ok) return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  throw new Error(`Backend pengujian tidak siap: ${logSafe(serverOutput)}`);
}

async function waitForResetToken(previousTokens = []) {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const matches = [...serverOutput.matchAll(/\/reset-password\?token=([a-f0-9]{64})/g)];
    const token = matches.map((match) => match[1]).find((value) => !previousTokens.includes(value));
    if (token) return token;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Tautan development tidak muncul pada output backend: ${logSafe(serverOutput)}`);
}

async function runResetFlow() {
  const unknown = await call("POST", "/auth/forgot-password", { email: `unknown-${runId}@example.test` });
  assert.equal(unknown.status, 200);
  assert.equal(unknown.json.message, genericMessage);

  const registration = await call("POST", "/auth/register", {
    name: "Uji Reset Password",
    email: userEmail,
    password: oldPassword,
  });
  assert.equal(registration.status, 201);

  const firstRequest = await call("POST", "/auth/forgot-password", { email: userEmail });
  assert.equal(firstRequest.status, 200);
  assert.equal(firstRequest.json.message, genericMessage);
  const firstToken = await waitForResetToken();
  const firstHash = createHash("sha256").update(firstToken).digest("hex");
  const [firstRecord] = await testPrisma.$queryRaw`
    SELECT \`tokenHash\`, \`expiresAt\`, \`usedAt\`
    FROM \`PasswordResetToken\`
    WHERE \`tokenHash\` = ${firstHash}
    LIMIT 1
  `;
  assert.ok(firstRecord);
  assert.equal(firstRecord.tokenHash, firstHash);
  assert.notEqual(firstRecord.tokenHash, firstToken);
  assert.equal(firstRecord.usedAt, null);
  assert.ok(firstRecord.expiresAt.getTime() > Date.now());
  assert.ok(firstRecord.expiresAt.getTime() <= Date.now() + 30 * 60_000 + 5_000);

  const secondRequest = await call("POST", "/auth/forgot-password", { email: userEmail });
  assert.equal(secondRequest.status, 200);
  const secondToken = await waitForResetToken([firstToken]);
  assert.notEqual(secondToken, firstToken);

  const staleReset = await call("POST", "/auth/reset-password", {
    token: firstToken,
    password: newPassword,
  });
  assert.equal(staleReset.status, 400);
  assert.equal(staleReset.json.message, invalidMessage);

  const reset = await call("POST", "/auth/reset-password", {
    token: secondToken,
    password: newPassword,
  });
  assert.equal(reset.status, 200);
  assert.match(reset.json.message, /berhasil diperbarui/i);
  const [consumed] = await testPrisma.$queryRaw`
    SELECT \`usedAt\`
    FROM \`PasswordResetToken\`
    WHERE \`tokenHash\` = ${createHash("sha256").update(secondToken).digest("hex")}
    LIMIT 1
  `;
  assert.ok(consumed?.usedAt);

  assert.equal((await call("POST", "/auth/login", { email: userEmail, password: newPassword })).status, 200);
  assert.equal((await call("POST", "/auth/login", { email: userEmail, password: oldPassword })).status, 401);
  const reused = await call("POST", "/auth/reset-password", {
    token: secondToken,
    password: "Another-password-789",
  });
  assert.equal(reused.status, 400);
  assert.equal(reused.json.message, invalidMessage);

  const expiredToken = randomBytes(32).toString("hex");
  await testPrisma.$executeRaw`
    INSERT INTO \`PasswordResetToken\` (\`userId\`, \`tokenHash\`, \`expiresAt\`)
    VALUES (
      ${registration.json.data.id},
      ${createHash("sha256").update(expiredToken).digest("hex")},
      ${new Date(Date.now() - 1_000)}
    )
  `;
  const expired = await call("POST", "/auth/reset-password", {
    token: expiredToken,
    password: "Another-password-789",
  });
  assert.equal(expired.status, 400);
  assert.equal(expired.json.message, invalidMessage);

  const inactiveRegistration = await call("POST", "/auth/register", {
    name: "Uji Akun Nonaktif",
    email: inactiveEmail,
    password: oldPassword,
  });
  assert.equal(inactiveRegistration.status, 201);
  const inactiveUserId = inactiveRegistration.json.data.id;
  await testPrisma.user.update({ where: { id: inactiveUserId }, data: { isActive: false } });
  const [{ tokenCount: tokensBefore }] = await testPrisma.$queryRaw`
    SELECT COUNT(*) AS \`tokenCount\` FROM \`PasswordResetToken\` WHERE \`userId\` = ${inactiveUserId}
  `;
  const inactiveRequest = await call("POST", "/auth/forgot-password", { email: inactiveEmail });
  assert.equal(inactiveRequest.status, 200);
  assert.equal(inactiveRequest.json.message, genericMessage);
  const [{ tokenCount: tokensAfter }] = await testPrisma.$queryRaw`
    SELECT COUNT(*) AS \`tokenCount\` FROM \`PasswordResetToken\` WHERE \`userId\` = ${inactiveUserId}
  `;
  assert.equal(Number(tokensAfter), Number(tokensBefore));

  console.log("Password-reset flow passed: generic response, hashed/rotated/expired/one-time tokens, active account, and login.");
}

async function runBookingOperationsFlow() {
  const adminLogin = await call("POST", "/auth/login", { email: adminEmail, password: adminPassword });
  const studentLogin = await call("POST", "/auth/login", { email: userEmail, password: newPassword });
  assert.equal(adminLogin.status, 200);
  assert.equal(studentLogin.status, 200);
  const adminToken = adminLogin.json.data.token;
  const studentToken = studentLogin.json.data.token;
  const defaultHours = await testPrisma.globalOperatingHours.findUnique({ where: { id: 1 } });
  assert.equal(defaultHours.openTime, "07:00");
  assert.equal(defaultHours.closeTime, "21:00");
  assert.equal(defaultHours.operatingDays, "1,2,3,4,5,6");

  const runId = randomBytes(5).toString("hex");
  const roomResult = await call("POST", "/admin/rooms", adminToken, {
    name: `Reset Ops ${runId}`,
    code: `OPS-${runId}`.toUpperCase(),
    location: "Gedung Uji",
    capacity: 8,
  });
  assert.equal(roomResult.status, 201);
  const roomId = roomResult.json.data.id;
  const futureKey = (offset) => new Date(Date.now() + 7 * 60 * 60_000 + offset * 86_400_000).toISOString().slice(0, 10);
  const wib = (dayOffset, hour, minute = 0) => new Date(`${futureKey(dayOffset)}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00+07:00`).toISOString();
  const weekdayOffset = Array.from({ length: 7 }, (_, index) => index + 1)
    .find((offset) => {
      const weekday = new Date(`${futureKey(offset)}T00:00:00Z`).getUTCDay();
      return weekday >= 1 && weekday <= 6;
    });
  const sundayOffset = Array.from({ length: 7 }, (_, index) => index + 1)
    .find((offset) => new Date(`${futureKey(offset)}T00:00:00Z`).getUTCDay() === 0);
  assert.ok(weekdayOffset);
  assert.ok(sundayOffset);

  const bookingBody = (startTime, endTime, attendees = 4) => ({
    roomId, title: "Peminjaman uji operasi", purpose: "Uji peserta dan penutupan",
    attendees, startTime, endTime,
  });
  const overCapacity = await call("POST", "/bookings", studentToken, bookingBody(wib(weekdayOffset, 9), wib(weekdayOffset, 10), 9));
  assert.equal(overCapacity.status, 400);
  assert.match(overCapacity.json.message, /kapasitas ruangan.*8/i);
  const outsideHours = await call("POST", "/bookings", studentToken, bookingBody(wib(weekdayOffset, 6), wib(weekdayOffset, 7)));
  assert.equal(outsideHours.status, 400);
  assert.match(outsideHours.json.message, /07:00.*21:00/);
  const closedSunday = await call("POST", "/bookings", studentToken, bookingBody(wib(sundayOffset, 9), wib(sundayOffset, 10)));
  assert.equal(closedSunday.status, 400);
  assert.match(closedSunday.json.message, /tutup/i);

  const closureDay = futureKey(weekdayOffset + 7);
  const closureResponse = await call("POST", "/admin/closures", adminToken, {
    roomId, startDate: closureDay, endDate: closureDay, reason: "Perawatan terjadwal",
  });
  assert.equal(closureResponse.status, 201);
  const blockedByClosure = await call("POST", "/bookings", studentToken, bookingBody(
    new Date(`${closureDay}T09:00:00+07:00`).toISOString(),
    new Date(`${closureDay}T10:00:00+07:00`).toISOString()
  ));
  assert.equal(blockedByClosure.status, 400);
  assert.match(blockedByClosure.json.message, /Perawatan terjadwal/);

  const bookingDayOffset = weekdayOffset + 14;
  const startTime = wib(bookingDayOffset, 11);
  const endTime = wib(bookingDayOffset, 12);
  const booked = await call("POST", "/bookings", studentToken, bookingBody(startTime, endTime));
  assert.equal(booked.status, 201);
  assert.equal(booked.json.data.attendees, 4);
  await testPrisma.booking.update({ where: { id: booked.json.data.id }, data: { attendees: null } });
  const legacyDetail = await call("GET", `/bookings/${booked.json.data.id}`, studentToken);
  assert.equal(legacyDetail.status, 200);
  assert.equal(legacyDetail.json.data.attendees, null);

  const queued = await call("POST", "/bookings/waitlist", studentToken, bookingBody(startTime, endTime, 3));
  assert.equal(queued.status, 201);
  const targetDay = futureKey(bookingDayOffset);
  const preflight = await call("POST", "/admin/closures", adminToken, {
    roomId, startDate: targetDay, endDate: targetDay, reason: "Acara kampus",
  });
  assert.equal(preflight.status, 409);
  assert.equal(preflight.json.confirmationRequired, true);
  assert.equal(preflight.json.affectedBookings.length, 1);
  const confirmed = await call("POST", "/admin/closures", adminToken, {
    roomId, startDate: targetDay, endDate: targetDay, reason: "Acara kampus", confirmAffected: true,
  });
  assert.equal(confirmed.status, 201);
  assert.deepEqual(confirmed.json.data.cancelledBookingIds, [booked.json.data.id]);
  assert.equal((await testPrisma.booking.findUnique({ where: { id: booked.json.data.id } })).status, "CANCELLED");
  assert.equal((await testPrisma.bookingQueue.findUnique({ where: { id: queued.json.data.id } })).status, "CANCELLED");
  const userNotifications = await call("GET", "/notifications?pageSize=100", studentToken);
  assert.ok(userNotifications.json.data.some((notification) =>
    notification.type === "BOOKING_CANCELLED" && notification.message.includes("Acara kampus")
  ));

  const profileOff = await call("PUT", "/users/profile", studentToken, { emailNotifications: false });
  assert.equal(profileOff.status, 200);
  assert.equal(profileOff.json.data.emailNotifications, false);
  assert.equal((await testPrisma.user.findUnique({ where: { email: userEmail } })).emailNotifications, false);
  const globalUpdate = await call("PUT", "/admin/settings/operating-hours", adminToken, {
    openTime: "00:00", closeTime: "23:59", operatingDays: [0, 1, 2, 3, 4, 5, 6],
  });
  assert.equal(globalUpdate.status, 200);
  console.log("Booking-operations flow passed: capacity, WIB hours, closure confirmation/cancellation, queue handling, legacy attendees, and email preference.");
}

async function cleanup() {
  if (server && server.exitCode === null) {
    server.kill("SIGTERM");
    await new Promise((resolve) => {
      const timeout = setTimeout(resolve, 5_000);
      server.once("close", () => {
        clearTimeout(timeout);
        resolve();
      });
    });
  }
  if (testPrisma) await testPrisma.$disconnect();
  if (databaseCreated) {
    const adminPrisma = new PrismaClient({
      datasources: { db: { url: configuredDatabaseUrl } },
    });
    try {
      await adminPrisma.$executeRawUnsafe(`DROP DATABASE IF EXISTS \`${databaseName}\``);
      console.log("Database pengujian sementara telah dihapus.");
    } finally {
      await adminPrisma.$disconnect();
    }
  }
  if (testUploadDir && testUploadDir.startsWith(join(tmpdir(), `ruangku-reset-test-${runId}-`))) {
    await rm(testUploadDir, { recursive: true, force: true });
  }
}

try {
  const adminPrisma = new PrismaClient({
    datasources: { db: { url: configuredDatabaseUrl } },
  });
  try {
    await adminPrisma.$executeRawUnsafe(
      `CREATE DATABASE \`${databaseName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    );
    databaseCreated = true;
  } finally {
    await adminPrisma.$disconnect();
  }

  const testEnv = { ...process.env, DATABASE_URL: testDatabaseUrl };
  await runProcess(
    process.execPath,
    [join(backendDir, "node_modules", "prisma", "build", "index.js"), "migrate", "deploy"],
    { cwd: backendDir, env: testEnv }
  );
  testPrisma = new PrismaClient({ datasources: { db: { url: testDatabaseUrl } } });
  const port = await getFreePort();
  apiBaseUrl = `http://127.0.0.1:${port}/api/v1`;
  testUploadDir = await mkdtemp(join(tmpdir(), `ruangku-reset-test-${runId}-`));
  const serverEnv = {
    ...testEnv,
    NODE_ENV: "development",
    PORT: String(port),
    JWT_SECRET: randomBytes(32).toString("hex"),
    APP_WEB_URL: "http://localhost:5173",
    UPLOAD_DIR: testUploadDir,
    CORS_ORIGIN: "http://localhost:5173",
    TRUST_PROXY: "0",
  };
  for (const key of ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS", "MAIL_FROM"]) {
    delete serverEnv[key];
  }
  server = spawn(process.execPath, [join(backendDir, "node_modules", "tsx", "dist", "cli.mjs"), "src/server.ts"], {
    cwd: backendDir,
    env: serverEnv,
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.stdout.setEncoding("utf8").on("data", (chunk) => { serverOutput += chunk; });
  server.stderr.setEncoding("utf8").on("data", (chunk) => { serverOutput += chunk; });
  await waitForServer();

  await testPrisma.user.create({
    data: {
      name: "Isolated Reset Test Admin",
      email: adminEmail,
      password: await bcrypt.hash(adminPassword, 12),
      role: "ADMIN",
    },
  });
  await runResetFlow();
  await runBookingOperationsFlow();

  for (const script of ["test:api", "test:workflows"]) {
    const npmCommand = process.platform === "win32" ? process.env.ComSpec || "cmd.exe" : "npm";
    const args = process.platform === "win32"
      ? ["/d", "/s", "/c", `npm run ${script}`]
      : ["run", script];
    await runProcess(npmCommand, args, {
      cwd: backendDir,
      env: {
        ...serverEnv,
        API_URL: apiBaseUrl,
        ADMIN_EMAIL: adminEmail,
        ADMIN_PASSWORD: adminPassword,
      },
    });
  }

  const studentPassword = randomBytes(24).toString("base64url");
  const lecturerPassword = randomBytes(24).toString("base64url");
  const seededEnv = {
    ...serverEnv,
    SEED_ADMIN_EMAIL: adminEmail,
    SEED_ADMIN_PASSWORD: adminPassword,
    SEED_DEMO: "true",
    SEED_DEMO_STUDENT_PASSWORD: studentPassword,
    SEED_DEMO_LECTURER_PASSWORD: lecturerPassword,
  };
  await runProcess(
    process.execPath,
    [join(backendDir, "node_modules", "tsx", "dist", "cli.mjs"), "prisma/seed.ts"],
    { cwd: backendDir, env: seededEnv }
  );
  const npmCommand = process.platform === "win32" ? process.env.ComSpec || "cmd.exe" : "npm";
  const mobileArgs = process.platform === "win32"
    ? ["/d", "/s", "/c", "npm run test:mobile"]
    : ["run", "test:mobile"];
  await runProcess(npmCommand, mobileArgs, {
    cwd: backendDir,
    env: {
      ...seededEnv,
      API_URL: apiBaseUrl,
      ADMIN_EMAIL: adminEmail,
      ADMIN_PASSWORD: adminPassword,
      STUDENT_EMAIL: "mahasiswa@ruangku.test",
      STUDENT_PASSWORD: studentPassword,
    },
  });
} catch (error) {
  console.error(error instanceof Error ? error.message : "Pengujian password reset gagal.");
  if (serverOutput) console.error(logSafe(serverOutput));
  process.exitCode = 1;
} finally {
  try {
    await cleanup();
  } catch (error) {
    console.error("Gagal membersihkan resource pengujian:", error instanceof Error ? error.message : "unknown error");
    process.exitCode = 1;
  }
}
