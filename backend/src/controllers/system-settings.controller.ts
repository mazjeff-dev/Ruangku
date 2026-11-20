import type { Response } from "express";
import { prisma } from "../lib/prisma";
import { getEffectiveBookingRules } from "../lib/rules";
import { HttpError, parse } from "../lib/http";
import type { AuthRequest } from "../middleware/auth.middleware";
import { bookingRuleSettingsSchema } from "../validators/system-settings";
import { globalOperatingHoursSchema } from "../validators/room-schedule";

export async function getBookingRuleSettings(_req: AuthRequest, res: Response) {
  const [rules, setting] = await Promise.all([
    getEffectiveBookingRules(),
    prisma.bookingRuleSetting.findUnique({
      where: { id: 1 },
      select: { updatedAt: true, updater: { select: { name: true } } },
    }),
  ]);
  return res.status(200).json({
    success: true,
    data: {
      rules,
      source: setting ? "admin" : "environment",
      updatedAt: setting?.updatedAt ?? null,
      updatedBy: setting?.updater?.name ?? null,
    },
  });
}

export async function updateBookingRuleSettings(req: AuthRequest, res: Response) {
  const rules = parse<{
    minMinutes: number;
    maxHours: number;
    maxDaysAhead: number;
    maxActiveBookings: number;
    maxQueueEntries: number;
    gracePeriodMinutes: number;
    noShowPoints: number;
    overstayPoints: number;
    lateCancelPoints: number;
    suspendThreshold: number;
    suspendDays: number;
    lateCancelWindowMinutes: number;
  }>(bookingRuleSettingsSchema, req.body);
  if (!req.user) throw new HttpError(401, "Sesi pengguna tidak valid");

  const setting = await prisma.bookingRuleSetting.upsert({
    where: { id: 1 },
    create: { id: 1, ...rules, updatedBy: req.user.userId },
    update: { ...rules, updatedBy: req.user.userId },
    select: {
      minMinutes: true, maxHours: true, maxDaysAhead: true, maxActiveBookings: true, maxQueueEntries: true,
      gracePeriodMinutes: true, noShowPoints: true, overstayPoints: true, lateCancelPoints: true,
      suspendThreshold: true, suspendDays: true, lateCancelWindowMinutes: true, updatedAt: true,
    },
  });
  return res.status(200).json({
    success: true,
    message: "Aturan peminjaman berhasil diperbarui",
    data: setting,
  });
}

export async function resetBookingRuleSettings(_req: AuthRequest, res: Response) {
  await prisma.bookingRuleSetting.deleteMany({ where: { id: 1 } });
  const rules = await getEffectiveBookingRules();
  return res.status(200).json({
    success: true,
    message: "Aturan peminjaman dikembalikan ke nilai environment",
    data: rules,
  });
}

const defaultOperatingHours = { openTime: "07:00", closeTime: "21:00", operatingDays: [1, 2, 3, 4, 5, 6] };

export async function getGlobalOperatingHours(_req: AuthRequest, res: Response) {
  const setting = await prisma.globalOperatingHours.findUnique({ where: { id: 1 } });
  return res.status(200).json({
    success: true,
    data: setting
      ? { ...setting, operatingDays: setting.operatingDays.split(",").map(Number) }
      : defaultOperatingHours,
  });
}

export async function updateGlobalOperatingHours(req: AuthRequest, res: Response) {
  const hours = parse<{ openTime: string; closeTime: string; operatingDays: number[] }>(
    globalOperatingHoursSchema,
    req.body
  );
  const data = await prisma.globalOperatingHours.upsert({
    where: { id: 1 },
    create: { id: 1, ...hours, operatingDays: hours.operatingDays.join(",") },
    update: { ...hours, operatingDays: hours.operatingDays.join(",") },
  });
  return res.status(200).json({
    success: true,
    message: "Jam operasional global diperbarui",
    data: { ...data, operatingDays: data.operatingDays.split(",").map(Number) },
  });
}
