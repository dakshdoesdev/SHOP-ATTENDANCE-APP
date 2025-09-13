var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// shared/schema.ts
var schema_exports = {};
__export(schema_exports, {
  adminLoginSchema: () => adminLoginSchema,
  attendanceRecords: () => attendanceRecords,
  attendanceRecordsRelations: () => attendanceRecordsRelations,
  audioRecordings: () => audioRecordings,
  audioRecordingsRelations: () => audioRecordingsRelations,
  insertAttendanceSchema: () => insertAttendanceSchema,
  insertAudioRecordingSchema: () => insertAudioRecordingSchema,
  insertUserSchema: () => insertUserSchema,
  loginSchema: () => loginSchema,
  users: () => users,
  usersRelations: () => usersRelations
});
import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, boolean, decimal, integer } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
var users, attendanceRecords, audioRecordings, usersRelations, attendanceRecordsRelations, audioRecordingsRelations, insertUserSchema, insertAttendanceSchema, insertAudioRecordingSchema, loginSchema, adminLoginSchema;
var init_schema = __esm({
  "shared/schema.ts"() {
    "use strict";
    users = pgTable("users", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      username: text("username").notNull().unique(),
      password: text("password").notNull(),
      role: text("role").notNull().default("employee"),
      // employee or admin
      employeeId: text("employee_id").unique(),
      department: text("department"),
      joinDate: timestamp("join_date").defaultNow(),
      isActive: boolean("is_active").default(true),
      isLoggedIn: boolean("is_logged_in").default(false),
      createdAt: timestamp("created_at").defaultNow()
    });
    attendanceRecords = pgTable("attendance_records", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      userId: varchar("user_id").notNull().references(() => users.id),
      checkInTime: timestamp("check_in_time").notNull(),
      checkOutTime: timestamp("check_out_time"),
      hoursWorked: decimal("hours_worked", { precision: 5, scale: 2 }),
      isLate: boolean("is_late").default(false),
      isEarlyLeave: boolean("is_early_leave").default(false),
      audioFileUrl: text("audio_file_url"),
      date: text("date").notNull(),
      // YYYY-MM-DD format
      createdAt: timestamp("created_at").defaultNow()
    });
    audioRecordings = pgTable("audio_recordings", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      userId: varchar("user_id").notNull().references(() => users.id),
      attendanceId: varchar("attendance_id").references(() => attendanceRecords.id),
      fileUrl: text("file_url"),
      fileName: text("file_name"),
      fileSize: integer("file_size"),
      // in bytes
      duration: integer("duration"),
      // in seconds
      recordingDate: text("recording_date").notNull(),
      // YYYY-MM-DD format
      isActive: boolean("is_active").default(false),
      // true if currently recording
      createdAt: timestamp("created_at").defaultNow()
    });
    usersRelations = relations(users, ({ many }) => ({
      attendanceRecords: many(attendanceRecords),
      audioRecordings: many(audioRecordings)
    }));
    attendanceRecordsRelations = relations(attendanceRecords, ({ one, many }) => ({
      user: one(users, {
        fields: [attendanceRecords.userId],
        references: [users.id]
      }),
      audioRecordings: many(audioRecordings)
    }));
    audioRecordingsRelations = relations(audioRecordings, ({ one }) => ({
      user: one(users, {
        fields: [audioRecordings.userId],
        references: [users.id]
      }),
      attendanceRecord: one(attendanceRecords, {
        fields: [audioRecordings.attendanceId],
        references: [attendanceRecords.id]
      })
    }));
    insertUserSchema = createInsertSchema(users).omit({
      id: true,
      createdAt: true,
      isLoggedIn: true
    });
    insertAttendanceSchema = createInsertSchema(attendanceRecords).omit({
      id: true,
      createdAt: true
    });
    insertAudioRecordingSchema = createInsertSchema(audioRecordings).omit({
      id: true,
      createdAt: true
    });
    loginSchema = z.object({
      username: z.string().min(1, "Username is required"),
      password: z.string().min(1, "Password is required")
    });
    adminLoginSchema = z.object({
      username: z.string().min(1, "Username is required"),
      password: z.string().min(1, "Password is required"),
      audioPassword: z.string().optional()
    });
  }
});

// server/db.ts
var db_exports = {};
__export(db_exports, {
  db: () => db,
  ensureDbReady: () => ensureDbReady,
  pool: () => pool
});
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
async function ensureDbReady(retries = 10, delayMs = 1500) {
  for (let i = 0; i < retries; i++) {
    try {
      await pool.query("select 1");
      return;
    } catch (err) {
      if (i === retries - 1) throw err;
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
}
var noSslVerify, pool, db;
var init_db = __esm({
  "server/db.ts"() {
    "use strict";
    init_schema();
    if (!process.env.DATABASE_URL) {
      throw new Error(
        "DATABASE_URL must be set. Did you forget to provision a database?"
      );
    }
    noSslVerify = (process.env.PG_NO_SSL_VERIFY || "").toLowerCase() === "true";
    if (noSslVerify) {
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
    }
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      // Only set ssl options when explicitly requested via env toggle
      // Otherwise respect ssl settings from the connection string (e.g., sslmode=require)
      ...noSslVerify ? { ssl: { rejectUnauthorized: false } } : {}
    });
    db = drizzle(pool, { schema: schema_exports });
    pool.on("error", (err) => {
      console.error("Unexpected Postgres pool error. Will retry on next query:", err);
    });
  }
});

// server/storage.db.ts
var storage_db_exports = {};
__export(storage_db_exports, {
  DatabaseStorage: () => DatabaseStorage,
  storage: () => storage
});
import { eq, desc, and, sql as sql2 } from "drizzle-orm";
import session from "express-session";
import connectPg from "connect-pg-simple";
import fs from "fs";
import path from "path";
var PostgresSessionStore, DatabaseStorage, storage;
var init_storage_db = __esm({
  "server/storage.db.ts"() {
    "use strict";
    init_schema();
    init_db();
    PostgresSessionStore = connectPg(session);
    DatabaseStorage = class {
      sessionStore;
      constructor() {
        this.sessionStore = new PostgresSessionStore({
          pool,
          createTableIfMissing: true
        });
      }
      async getUser(id) {
        const [user] = await db.select().from(users).where(eq(users.id, id));
        return user || void 0;
      }
      async getUserByUsername(username) {
        const [user] = await db.select().from(users).where(eq(users.username, username));
        return user || void 0;
      }
      async createUser(insertUser) {
        const [user] = await db.insert(users).values(insertUser).returning();
        return user;
      }
      async createAttendanceRecord(record) {
        const [attendanceRecord] = await db.insert(attendanceRecords).values(record).returning();
        return attendanceRecord;
      }
      async updateAttendanceRecord(id, record) {
        const [updatedRecord] = await db.update(attendanceRecords).set(record).where(eq(attendanceRecords.id, id)).returning();
        return updatedRecord || void 0;
      }
      async getAttendanceRecordsByUserId(userId) {
        return await db.select().from(attendanceRecords).where(eq(attendanceRecords.userId, userId)).orderBy(desc(attendanceRecords.checkInTime));
      }
      async getTodayAttendanceRecord(userId, date) {
        const [record] = await db.select().from(attendanceRecords).where(and(
          eq(attendanceRecords.userId, userId),
          eq(attendanceRecords.date, date)
        )).orderBy(desc(attendanceRecords.checkInTime)).limit(1);
        return record || void 0;
      }
      async getAllTodayAttendance(date) {
        return await db.select({
          id: attendanceRecords.id,
          userId: attendanceRecords.userId,
          checkInTime: attendanceRecords.checkInTime,
          checkOutTime: attendanceRecords.checkOutTime,
          hoursWorked: attendanceRecords.hoursWorked,
          isLate: attendanceRecords.isLate,
          isEarlyLeave: attendanceRecords.isEarlyLeave,
          audioFileUrl: attendanceRecords.audioFileUrl,
          date: attendanceRecords.date,
          createdAt: attendanceRecords.createdAt,
          user: users
        }).from(attendanceRecords).innerJoin(users, eq(attendanceRecords.userId, users.id)).where(eq(attendanceRecords.date, date)).orderBy(desc(attendanceRecords.checkInTime));
      }
      async createAudioRecording(recording) {
        const [audioRecording] = await db.insert(audioRecordings).values(recording).returning();
        return audioRecording;
      }
      async updateAudioRecording(id, recording) {
        const [updatedRecording] = await db.update(audioRecordings).set(recording).where(eq(audioRecordings.id, id)).returning();
        return updatedRecording || void 0;
      }
      async getAudioRecordingById(id) {
        const [recording] = await db.select().from(audioRecordings).where(eq(audioRecordings.id, id));
        return recording || void 0;
      }
      async getActiveAudioRecordingByAttendance(attendanceId) {
        const [recording] = await db.select().from(audioRecordings).where(and(eq(audioRecordings.attendanceId, attendanceId), eq(audioRecordings.isActive, true)));
        return recording || void 0;
      }
      async getAudioRecordingByUserAndDate(userId, date) {
        const [recording] = await db.select().from(audioRecordings).where(and(eq(audioRecordings.userId, userId), eq(audioRecordings.recordingDate, date))).orderBy(desc(audioRecordings.createdAt));
        return recording || void 0;
      }
      async getTotalAudioStorage() {
        const [result] = await db.select({ total: sql2`coalesce(sum(${audioRecordings.fileSize}), 0)` }).from(audioRecordings);
        return result?.total || 0;
      }
      async getOldestAudioRecording() {
        const [recording] = await db.select().from(audioRecordings).orderBy(audioRecordings.createdAt).limit(1);
        return recording || void 0;
      }
      async enforceAudioStorageLimit(maxBytes) {
        let total = await this.getTotalAudioStorage();
        while (total > maxBytes) {
          const oldest = await this.getOldestAudioRecording();
          if (!oldest) break;
          if (oldest.fileName) {
            const filePath2 = path.join(
              __dirname,
              "uploads",
              "audio",
              oldest.userId,
              oldest.fileName
            );
            try {
              await fs.promises.unlink(filePath2);
            } catch (err) {
              console.warn("File delete error:", err);
            }
          }
          await this.deleteAudioRecording(oldest.id);
          total -= oldest.fileSize || 0;
        }
      }
      async getAudioRecordingsByUserId(userId) {
        return await db.select().from(audioRecordings).where(eq(audioRecordings.userId, userId)).orderBy(desc(audioRecordings.createdAt));
      }
      async getAllAudioRecordings() {
        return await db.select({
          id: audioRecordings.id,
          userId: audioRecordings.userId,
          attendanceId: audioRecordings.attendanceId,
          fileUrl: audioRecordings.fileUrl,
          fileName: audioRecordings.fileName,
          fileSize: audioRecordings.fileSize,
          duration: audioRecordings.duration,
          recordingDate: audioRecordings.recordingDate,
          isActive: audioRecordings.isActive,
          createdAt: audioRecordings.createdAt,
          user: users
        }).from(audioRecordings).innerJoin(users, eq(audioRecordings.userId, users.id)).orderBy(desc(audioRecordings.createdAt));
      }
      async getActiveAudioRecordings() {
        return await db.select({
          id: audioRecordings.id,
          userId: audioRecordings.userId,
          attendanceId: audioRecordings.attendanceId,
          fileUrl: audioRecordings.fileUrl,
          fileName: audioRecordings.fileName,
          fileSize: audioRecordings.fileSize,
          duration: audioRecordings.duration,
          recordingDate: audioRecordings.recordingDate,
          isActive: audioRecordings.isActive,
          createdAt: audioRecordings.createdAt,
          user: users
        }).from(audioRecordings).innerJoin(users, eq(audioRecordings.userId, users.id)).where(eq(audioRecordings.isActive, true));
      }
      async deleteAudioRecording(id) {
        await db.delete(audioRecordings).where(eq(audioRecordings.id, id));
      }
      async deleteOldAudioRecordings(daysOld) {
        const cutoffDate = /* @__PURE__ */ new Date();
        cutoffDate.setDate(cutoffDate.getDate() - daysOld);
        await db.delete(audioRecordings).where(sql2`${audioRecordings.createdAt} < ${cutoffDate}`);
      }
      async getAllUsers() {
        return await db.select().from(users).where(eq(users.role, "employee")).orderBy(users.username);
      }
      async updateUser(id, user) {
        const [updatedUser] = await db.update(users).set(user).where(eq(users.id, id)).returning();
        return updatedUser || void 0;
      }
      async deleteUser(id) {
        await db.delete(users).where(eq(users.id, id));
      }
      async getMonthlyWorkHours(month) {
        const allUsers = await db.select().from(users).where(eq(users.role, "employee")).orderBy(users.username);
        const monthStart = `${month}-01`;
        const monthEnd = `${month}-31`;
        const attendanceData = await db.select({
          userId: attendanceRecords.userId,
          date: attendanceRecords.date,
          checkInTime: attendanceRecords.checkInTime,
          checkOutTime: attendanceRecords.checkOutTime,
          hoursWorked: attendanceRecords.hoursWorked,
          username: users.username,
          employeeId: users.employeeId,
          department: users.department
        }).from(attendanceRecords).innerJoin(users, eq(attendanceRecords.userId, users.id)).where(
          and(
            sql2`${attendanceRecords.date} >= ${monthStart}`,
            sql2`${attendanceRecords.date} <= ${monthEnd}`
          )
        ).orderBy(users.username, attendanceRecords.date);
        const year = parseInt(month.split("-")[0]);
        const monthNum = parseInt(month.split("-")[1]);
        const daysInMonth = new Date(year, monthNum, 0).getDate();
        const allDaysInMonth = [];
        for (let day = 1; day <= daysInMonth; day++) {
          const dayStr = day.toString().padStart(2, "0");
          allDaysInMonth.push(`${month}-${dayStr}`);
        }
        const userAttendanceMap = /* @__PURE__ */ new Map();
        attendanceData.forEach((record) => {
          if (!userAttendanceMap.has(record.userId)) {
            userAttendanceMap.set(record.userId, []);
          }
          userAttendanceMap.get(record.userId).push(record);
        });
        const employees = allUsers.map((user) => {
          const userAttendance = userAttendanceMap.get(user.id) || [];
          const attendanceByDate = new Map(userAttendance.map((a) => [a.date, a]));
          const dailyHours = allDaysInMonth.map((date) => {
            const attendance2 = attendanceByDate.get(date);
            if (!attendance2) {
              return {
                date,
                hoursWorked: 0,
                checkInTime: null,
                checkOutTime: null,
                status: "absent"
              };
            }
            const hoursWorked = attendance2.hoursWorked ? parseFloat(attendance2.hoursWorked) : 0;
            const status = attendance2.checkOutTime ? "complete" : "incomplete";
            return {
              date,
              hoursWorked,
              checkInTime: attendance2.checkInTime ? attendance2.checkInTime.toISOString() : null,
              checkOutTime: attendance2.checkOutTime ? attendance2.checkOutTime.toISOString() : null,
              status
            };
          });
          const totalHours = dailyHours.reduce((sum, day) => sum + day.hoursWorked, 0);
          const totalDays = dailyHours.filter((day) => day.status !== "absent").length;
          return {
            userId: user.id,
            username: user.username,
            employeeId: user.employeeId || "",
            department: user.department || "",
            dailyHours,
            totalHours: Math.round(totalHours * 100) / 100,
            // Round to 2 decimal places
            totalDays
          };
        });
        return {
          month,
          employees
        };
      }
    };
    storage = new DatabaseStorage();
  }
});

// server/storage.memory.ts
var storage_memory_exports = {};
__export(storage_memory_exports, {
  MemoryStorage: () => MemoryStorage,
  storage: () => storage2
});
import session2 from "express-session";
import createMemoryStoreFactory from "memorystore";
import { nanoid } from "nanoid";
function todayStr(d = /* @__PURE__ */ new Date()) {
  return d.toISOString().split("T")[0];
}
function parseNumOr(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}
var MemoryStoreFactory, users2, attendance, audio, MemoryStorage, storage2;
var init_storage_memory = __esm({
  "server/storage.memory.ts"() {
    "use strict";
    MemoryStoreFactory = createMemoryStoreFactory(session2);
    users2 = [];
    attendance = [];
    audio = [];
    MemoryStorage = class {
      sessionStore;
      constructor() {
        this.sessionStore = new MemoryStoreFactory({ checkPeriod: 60 * 60 * 1e3 });
      }
      async getUser(id) {
        return users2.find((u) => u.id === id);
      }
      async getUserByUsername(username) {
        return users2.find((u) => u.username === username);
      }
      async createUser(insertUser) {
        const user = {
          id: nanoid(),
          username: insertUser.username,
          password: insertUser.password,
          role: insertUser.role || "employee",
          employeeId: insertUser.employeeId || null,
          department: insertUser.department || null,
          joinDate: /* @__PURE__ */ new Date(),
          isActive: true,
          isLoggedIn: false,
          createdAt: /* @__PURE__ */ new Date()
        };
        users2.push(user);
        return user;
      }
      async createAttendanceRecord(record) {
        const rec = {
          id: nanoid(),
          userId: record.userId,
          checkInTime: record.checkInTime,
          checkOutTime: record.checkOutTime ?? null,
          hoursWorked: record.hoursWorked ?? null,
          isLate: !!record.isLate,
          isEarlyLeave: !!record.isEarlyLeave,
          audioFileUrl: record.audioFileUrl ?? null,
          date: record.date || todayStr(),
          createdAt: /* @__PURE__ */ new Date()
        };
        attendance.push(rec);
        return rec;
      }
      async updateAttendanceRecord(id, record) {
        const idx = attendance.findIndex((a) => a.id === id);
        if (idx === -1) return void 0;
        attendance[idx] = { ...attendance[idx], ...record };
        return attendance[idx];
      }
      async getAttendanceRecordsByUserId(userId) {
        return attendance.filter((a) => a.userId === userId).sort((a, b) => (b.checkInTime?.getTime?.() || 0) - (a.checkInTime?.getTime?.() || 0));
      }
      async getTodayAttendanceRecord(userId, date) {
        return attendance.filter((a) => a.userId === userId && a.date === date).sort((a, b) => (b.checkInTime?.getTime?.() || 0) - (a.checkInTime?.getTime?.() || 0))[0];
      }
      async getAllTodayAttendance(date) {
        const recs = attendance.filter((a) => a.date === date);
        return recs.map((r) => ({ ...r, user: users2.find((u) => u.id === r.userId) })).sort((a, b) => (b.checkInTime?.getTime?.() || 0) - (a.checkInTime?.getTime?.() || 0));
      }
      async createAudioRecording(recording) {
        const rec = {
          id: nanoid(),
          userId: recording.userId,
          attendanceId: recording.attendanceId || null,
          fileUrl: recording.fileUrl || null,
          fileName: recording.fileName || null,
          fileSize: parseNumOr(recording.fileSize, 0),
          duration: parseNumOr(recording.duration, 0),
          recordingDate: recording.recordingDate || todayStr(),
          isActive: !!recording.isActive,
          createdAt: /* @__PURE__ */ new Date()
        };
        audio.push(rec);
        return rec;
      }
      async updateAudioRecording(id, recording) {
        const idx = audio.findIndex((r) => r.id === id);
        if (idx === -1) return void 0;
        audio[idx] = { ...audio[idx], ...recording };
        return audio[idx];
      }
      async getAudioRecordingById(id) {
        return audio.find((r) => r.id === id);
      }
      async getActiveAudioRecordingByAttendance(attendanceId) {
        return audio.find((r) => r.attendanceId === attendanceId && r.isActive);
      }
      async getAudioRecordingByUserAndDate(userId, date) {
        return audio.filter((r) => r.userId === userId && r.recordingDate === date).sort((a, b) => (b.createdAt?.getTime?.() || 0) - (a.createdAt?.getTime?.() || 0))[0];
      }
      async getTotalAudioStorage() {
        return audio.reduce((sum, r) => sum + (r.fileSize || 0), 0);
      }
      async getOldestAudioRecording() {
        return [...audio].sort((a, b) => (a.createdAt?.getTime?.() || 0) - (b.createdAt?.getTime?.() || 0))[0];
      }
      async enforceAudioStorageLimit(maxBytes) {
        let total = await this.getTotalAudioStorage();
        while (total > maxBytes) {
          const oldest = await this.getOldestAudioRecording();
          if (!oldest) break;
          await this.deleteAudioRecording(oldest.id);
          total -= oldest.fileSize || 0;
        }
      }
      async getAudioRecordingsByUserId(userId) {
        return audio.filter((r) => r.userId === userId).sort((a, b) => (b.createdAt?.getTime?.() || 0) - (a.createdAt?.getTime?.() || 0));
      }
      async getAllAudioRecordings() {
        return audio.map((r) => ({ ...r, user: users2.find((u) => u.id === r.userId) }));
      }
      async getActiveAudioRecordings() {
        return audio.filter((r) => r.isActive).map((r) => ({ ...r, user: users2.find((u) => u.id === r.userId) }));
      }
      async deleteAudioRecording(id) {
        const idx = audio.findIndex((r) => r.id === id);
        if (idx !== -1) audio.splice(idx, 1);
      }
      async deleteOldAudioRecordings(daysOld) {
        const cutoff = /* @__PURE__ */ new Date();
        cutoff.setDate(cutoff.getDate() - daysOld);
        for (let i = audio.length - 1; i >= 0; i--) {
          const r = audio[i];
          if (r.createdAt < cutoff) audio.splice(i, 1);
        }
      }
      async getAllUsers() {
        return users2.filter((u) => u.role === "employee").sort((a, b) => a.username.localeCompare(b.username));
      }
      async updateUser(id, user) {
        const idx = users2.findIndex((u) => u.id === id);
        if (idx === -1) return void 0;
        users2[idx] = { ...users2[idx], ...user };
        return users2[idx];
      }
      async deleteUser(id) {
        const idx = users2.findIndex((u) => u.id === id);
        if (idx !== -1) users2.splice(idx, 1);
      }
      async getMonthlyWorkHours(month) {
        const year = parseInt(month.split("-")[0]);
        const monthNum = parseInt(month.split("-")[1]);
        const daysInMonth = new Date(year, monthNum, 0).getDate();
        const allDaysInMonth = [];
        for (let day = 1; day <= daysInMonth; day++) {
          const dayStr = day.toString().padStart(2, "0");
          allDaysInMonth.push(`${month}-${dayStr}`);
        }
        const employees = users2.filter((u) => u.role === "employee").map((u) => {
          const dailyHours = allDaysInMonth.map((date) => {
            const rec = attendance.find((a) => a.userId === u.id && a.date === date);
            const hoursWorked = rec?.hoursWorked ? parseFloat(rec.hoursWorked) : 0;
            const status = rec ? rec.checkOutTime ? "complete" : "incomplete" : "absent";
            return {
              date,
              hoursWorked,
              checkInTime: rec?.checkInTime ? rec.checkInTime.toISOString?.() ?? null : null,
              checkOutTime: rec?.checkOutTime ? rec.checkOutTime.toISOString?.() ?? null : null,
              status
            };
          });
          const totalHours = dailyHours.reduce((s, d) => s + d.hoursWorked, 0);
          const totalDays = dailyHours.filter((d) => d.status !== "absent").length;
          return {
            userId: u.id,
            username: u.username,
            employeeId: u.employeeId || "",
            department: u.department || "",
            dailyHours,
            totalHours: Math.round(totalHours * 100) / 100,
            totalDays
          };
        });
        return { month, employees };
      }
    };
    storage2 = new MemoryStorage();
  }
});

// server/index.ts
import "dotenv/config";
import express2 from "express";
import cors from "cors";

// server/routes.ts
import { WebSocketServer, WebSocket } from "ws";

// server/auth.ts
import passport from "passport";
import jwt from "jsonwebtoken";
import { Strategy as LocalStrategy } from "passport-local";
import session3 from "express-session";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";

// server/storage.ts
var storage3;
if (process.env.DATABASE_URL) {
  const mod = await Promise.resolve().then(() => (init_storage_db(), storage_db_exports));
  storage3 = mod.storage;
} else {
  const mod = await Promise.resolve().then(() => (init_storage_memory(), storage_memory_exports));
  storage3 = mod.storage;
}

// server/device-lock.ts
import fs2 from "fs";
import path2 from "path";
var filePath = path2.resolve(import.meta.dirname, "device-lock.json");
function readMap() {
  try {
    if (!fs2.existsSync(filePath)) return {};
    const raw = fs2.readFileSync(filePath, "utf8");
    return JSON.parse(raw || "{}");
  } catch {
    return {};
  }
}
function writeMap(map) {
  try {
    fs2.writeFileSync(filePath, JSON.stringify(map, null, 2), "utf8");
  } catch {
  }
}
function getBoundDeviceId(userId) {
  const map = readMap();
  return map[userId];
}
function bindDeviceId(userId, deviceId) {
  const map = readMap();
  if (map[userId] && map[userId] !== deviceId) return;
  map[userId] = deviceId;
  writeMap(map);
}
function unbindDeviceId(userId) {
  const map = readMap();
  if (map[userId]) {
    delete map[userId];
    writeMap(map);
  }
}

// server/auth.ts
var scryptAsync = promisify(scrypt);
async function createTestEmployee() {
  try {
    const existingUser = await storage3.getUserByUsername("test");
    if (!existingUser) {
      const hashedPassword = await hashPassword("test");
      await storage3.createUser({
        username: "test",
        password: hashedPassword,
        role: "employee",
        employeeId: "EMP001",
        department: "Testing"
      });
      console.log("\u2705 Test employee created: username=test, password=test");
    }
  } catch (error) {
    console.log("\u2139\uFE0F Test employee creation skipped (database not ready)");
  }
}
async function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const buf = await scryptAsync(password, salt, 64);
  return `${buf.toString("hex")}.${salt}`;
}
async function comparePasswords(supplied, stored) {
  const [hashed, salt] = stored.split(".");
  const hashedBuf = Buffer.from(hashed, "hex");
  const suppliedBuf = await scryptAsync(supplied, salt, 64);
  return timingSafeEqual(hashedBuf, suppliedBuf);
}
function setupAuth(app2) {
  createTestEmployee();
  const corsEnabled = !!process.env.CORS_ORIGIN;
  const cookieSameSite = process.env.COOKIE_SAMESITE || (corsEnabled ? "none" : "lax");
  const cookieSecure = process.env.COOKIE_SECURE === "true" || cookieSameSite === "none" || process.env.NODE_ENV === "production";
  const sessionDays = parseInt(process.env.SESSION_MAX_AGE_DAYS || "30", 10);
  const sessionMaxAgeMs = Math.max(1, sessionDays) * 24 * 60 * 60 * 1e3;
  const sessionSettings = {
    secret: process.env.SESSION_SECRET || "bedi-enterprises-secret-key-2025",
    resave: false,
    saveUninitialized: false,
    store: storage3.sessionStore,
    cookie: {
      secure: cookieSecure,
      sameSite: cookieSameSite,
      httpOnly: true,
      maxAge: sessionMaxAgeMs
    }
  };
  const sessionMiddleware = session3(sessionSettings);
  app2.set("trust proxy", 1);
  app2.use(sessionMiddleware);
  app2.use(passport.initialize());
  app2.use(passport.session());
  app2.use((req, res, next) => {
    try {
      if (typeof req.isAuthenticated === "function" && req.isAuthenticated()) {
        return next();
      }
      const auth = req.headers.authorization || "";
      if (!auth.startsWith("Bearer ")) return next();
      const token = auth.slice(7);
      const secret = process.env.JWT_SECRET || "upload-secret-2025";
      const payload = jwt.verify(token, secret);
      if (!payload?.sub) return next();
      const deviceLock = (process.env.DEVICE_LOCK || "true").toLowerCase() !== "false";
      const boundDid = deviceLock ? getBoundDeviceId(payload.sub) : void 0;
      const tokenDid = payload.did;
      if (deviceLock && boundDid && tokenDid && boundDid !== tokenDid) {
        return next();
      }
      storage3.getUser(payload.sub).then((user) => {
        if (user) {
          req.user = user;
          req.isAuthenticated = () => true;
        }
      }).finally(() => next());
    } catch {
      return next();
    }
  });
  passport.use(
    new LocalStrategy(async (username, password, done) => {
      try {
        const user = await storage3.getUserByUsername(username);
        if (!user || !await comparePasswords(password, user.password)) {
          return done(null, false, { message: "Invalid username or password" });
        }
        return done(null, user);
      } catch (error) {
        return done(error);
      }
    })
  );
  passport.serializeUser((user, done) => done(null, user.id));
  passport.deserializeUser(async (id, done) => {
    try {
      if (id === "admin-user") {
        const adminUser = {
          id: "admin-user",
          username: "bediAdmin",
          password: "",
          role: "admin",
          employeeId: null,
          department: null,
          joinDate: null,
          isActive: true,
          isLoggedIn: false,
          createdAt: null
        };
        return done(null, adminUser);
      }
      const user = await storage3.getUser(id);
      if (!user) {
        return done(null, false);
      }
      done(null, user);
    } catch (error) {
      console.error("Deserialize user error:", error);
      done(null, false);
    }
  });
  app2.post("/api/login", (req, res, next) => {
    passport.authenticate("local", (err, user, info) => {
      if (err) return next(err);
      if (!user) {
        return res.status(401).json({ message: info?.message || "Invalid credentials" });
      }
      req.login(user, (err2) => {
        if (err2) return next(err2);
        const deviceLock = (process.env.DEVICE_LOCK || "true").toLowerCase() !== "false";
        const deviceId = req.headers["x-device-id"] || req.body?.deviceId || void 0;
        try {
          if (deviceLock && deviceId) {
            const bound = getBoundDeviceId(user.id);
            if (bound && bound !== deviceId) {
              return res.status(403).json({ message: "Account already linked to a different device" });
            }
            if (!bound) {
              bindDeviceId(user.id, deviceId);
            }
          }
        } catch {
        }
        let token = void 0;
        try {
          if (user.role === "employee") {
            const secret = process.env.JWT_SECRET || "upload-secret-2025";
            const expiresIn = process.env.JWT_EXPIRES_IN || "180d";
            const payload = { sub: user.id, role: user.role };
            if (deviceId) payload.did = deviceId;
            token = jwt.sign(payload, secret, { expiresIn });
          }
        } catch {
        }
        res.status(200).json({ ...user, token });
      });
    })(req, res, next);
  });
  app2.post("/api/logout", (req, res, next) => {
    const userId = req.user?.id;
    req.logout((err) => {
      if (err) return next(err);
      res.sendStatus(200);
    });
  });
  app2.get("/api/user", (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    res.json(req.user);
  });
  app2.post("/api/auth/upload-token", (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    if (req.user?.role !== "employee") return res.status(403).json({ message: "Employee token only" });
    const secret = process.env.JWT_SECRET || "upload-secret-2025";
    const expiresIn = process.env.JWT_EXPIRES_IN || "180d";
    const deviceLock = (process.env.DEVICE_LOCK || "true").toLowerCase() !== "false";
    const deviceId = req.headers["x-device-id"] || void 0;
    if (deviceLock) {
      const bound = getBoundDeviceId(req.user.id);
      if (bound && deviceId && bound !== deviceId) {
        return res.status(403).json({ message: "Account linked to a different device" });
      }
      if (!bound && deviceId) bindDeviceId(req.user.id, deviceId);
    }
    const payload = { sub: req.user.id, role: req.user.role };
    if (deviceId) payload.did = deviceId;
    const token = jwt.sign(payload, secret, { expiresIn });
    res.json({ token });
  });
  app2.post("/api/admin/login", async (req, res, next) => {
    const { username, password, audioPassword } = req.body;
    try {
      if (username !== "bediAdmin" || password !== "bediMain2025") {
        return res.status(401).json({ message: "Invalid admin credentials" });
      }
      const adminUser = {
        id: "admin-user",
        username: "bediAdmin",
        password: "",
        // Don't store actual password
        role: "admin",
        employeeId: null,
        department: null,
        joinDate: null,
        isActive: true,
        isLoggedIn: false,
        createdAt: null
      };
      req.login(adminUser, (err) => {
        if (err) return next(err);
        if (audioPassword === "audioAccess2025") {
          req.session.audioAccess = true;
          req.session.audioAccessTime = Date.now();
        }
        res.status(200).json(adminUser);
      });
    } catch (error) {
      next(error);
    }
  });
  app2.post("/api/admin/audio-access", (req, res) => {
    if (!req.isAuthenticated() || req.user?.role !== "admin") {
      return res.status(401).json({ message: "Admin access required" });
    }
    const { audioPassword } = req.body;
    if (audioPassword !== "audioAccess2025") {
      return res.status(401).json({ message: "Invalid audio access password" });
    }
    req.session.audioAccess = true;
    req.session.audioAccessTime = Date.now();
    res.status(200).json({ success: true });
  });
  app2.use("/api/admin/audio", (req, res, next) => {
    if (!req.isAuthenticated() || req.user?.role !== "admin") {
      return res.status(401).json({ message: "Admin access required" });
    }
    const session4 = req.session;
    const now = Date.now();
    const audioAccessTime = session4.audioAccessTime;
    const thirtyMinutes = 30 * 60 * 1e3;
    if (!session4.audioAccess || !audioAccessTime || now - audioAccessTime > thirtyMinutes) {
      return res.status(401).json({ message: "Audio access expired or not granted" });
    }
    next();
  });
  app2.post("/api/admin/reset-device/:userId", (req, res) => {
    if (!req.isAuthenticated() || req.user?.role !== "admin") {
      return res.status(401).json({ message: "Admin access required" });
    }
    const { userId } = req.params;
    try {
      unbindDeviceId(userId);
      return res.status(200).json({ success: true });
    } catch (e) {
      return res.status(500).json({ message: e.message || "Failed to reset device" });
    }
  });
  return sessionMiddleware;
}

// server/routes.ts
import multer from "multer";
import path3 from "path";
import fs3 from "fs";
import { fileURLToPath } from "url";
import jwt2 from "jsonwebtoken";
import { dirname } from "path";
var __filename = fileURLToPath(import.meta.url);
var __dirname2 = dirname(__filename);
var audioStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const userId = req.user?.id || "unknown";
    const uploadPath = path3.join(__dirname2, "uploads", "audio", userId);
    fs3.mkdirSync(uploadPath, { recursive: true });
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const date = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
    const timestamp2 = Date.now();
    const mime = (file.mimetype || "").toLowerCase();
    const originalExt = path3.extname(file.originalname || "").toLowerCase();
    let ext = ".webm";
    if (mime.includes("audio/mp4")) ext = ".mp4";
    else if (mime.includes("audio/m4a")) ext = ".m4a";
    else if (mime.includes("audio/ogg")) ext = ".ogg";
    else if (originalExt) ext = originalExt;
    cb(null, `${date}-${timestamp2}${ext}`);
  }
});
var upload = multer({
  storage: audioStorage,
  // Raise limit to support long Android background recordings (lower bitrate used on-device)
  limits: { fileSize: 200 * 1024 * 1024 }
  // 200MB limit
});
function registerRoutes(app2, httpServer) {
  app2.get("/api/health", async (req, res) => {
    if (process.env.DATABASE_URL) {
      try {
        const { pool: pool2 } = await Promise.resolve().then(() => (init_db(), db_exports));
        await pool2.query("select 1");
        const auth2 = req.isAuthenticated();
        res.json({ ok: true, db: true, authenticated: auth2, user: auth2 ? req.user : null });
      } catch (e) {
        res.status(500).json({ ok: false, db: false, error: e?.message || String(e) });
      }
      return;
    }
    const auth = req.isAuthenticated();
    res.json({ ok: true, db: false, authenticated: auth, user: auth ? req.user : null });
  });
  const wss = new WebSocketServer({ server: httpServer, path: "/ws" });
  wss.on("connection", (ws, req) => {
    console.log("WebSocket client connected");
    ws.on("message", (message) => {
      try {
        const data = JSON.parse(message.toString());
        wss.clients.forEach((client) => {
          if (client !== ws && client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(data));
          }
        });
      } catch (error) {
        console.error("WebSocket message error:", error);
      }
    });
    ws.on("close", () => {
      console.log("WebSocket client disconnected");
    });
  });
  app2.post("/api/attendance/checkin", async (req, res) => {
    if (!req.isAuthenticated() || req.user?.role !== "employee") {
      return res.status(401).json({ message: "Employee access required" });
    }
    try {
      const { latitude, longitude } = req.body;
      const userId = req.user.id;
      const today = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
      const existingRecord = await storage3.getTodayAttendanceRecord(userId, today);
      if (existingRecord) {
        return res.status(400).json({ message: "Attendance already recorded for today" });
      }
      console.log(`\u2705 Check-in allowed from anywhere - Location: ${latitude}, ${longitude}`);
      const checkInTime = /* @__PURE__ */ new Date();
      const isLate = checkInTime.getHours() > 9 || checkInTime.getHours() === 9 && checkInTime.getMinutes() > 15;
      const attendanceRecord = await storage3.createAttendanceRecord({
        userId,
        checkInTime,
        date: today,
        isLate,
        isEarlyLeave: false
      });
      const existingAudio = await storage3.getAudioRecordingByUserAndDate(userId, today);
      const audioRecording = existingAudio ? await storage3.updateAudioRecording(existingAudio.id, { isActive: true }) : await storage3.createAudioRecording({
        userId,
        attendanceId: attendanceRecord.id,
        recordingDate: today,
        isActive: true
      });
      wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({ type: "audio_start", recording: audioRecording }));
        }
      });
      console.log(`\u2705 Check-in completed - audio recording will start`);
      res.status(201).json(attendanceRecord);
    } catch (error) {
      console.error("Check-in error:", error);
      res.status(500).json({ message: "Failed to check in" });
    }
  });
  app2.post("/api/attendance/checkout", async (req, res) => {
    if (!req.isAuthenticated() || req.user?.role !== "employee") {
      return res.status(401).json({ message: "Employee access required" });
    }
    try {
      const userId = req.user.id;
      const today = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
      const existingRecord = await storage3.getTodayAttendanceRecord(userId, today);
      if (!existingRecord || existingRecord.checkOutTime) {
        return res.status(400).json({ message: "No active check-in found" });
      }
      const checkOutTime = /* @__PURE__ */ new Date();
      const isEarlyLeave = checkOutTime.getHours() < 21 || checkOutTime.getHours() === 21 && checkOutTime.getMinutes() < 0;
      const hoursWorked = (checkOutTime.getTime() - existingRecord.checkInTime.getTime()) / (1e3 * 60 * 60);
      const updatedRecord = await storage3.updateAttendanceRecord(existingRecord.id, {
        checkOutTime,
        hoursWorked: hoursWorked.toFixed(2),
        isEarlyLeave
      });
      try {
        const active = await storage3.getActiveAudioRecordingByAttendance(existingRecord.id);
        if (active) {
          const durationSec = Math.floor((checkOutTime.getTime() - existingRecord.checkInTime.getTime()) / 1e3);
          const today2 = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
          await storage3.updateAudioRecording(active.id, {
            isActive: false,
            duration: durationSec,
            recordingDate: today2
          });
          wss.clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
              client.send(JSON.stringify({ type: "audio_stop", recordingId: active.id }));
            }
          });
        }
      } catch (err) {
        console.warn("Failed to finalize active audio session on checkout:", err);
      }
      console.log(`\u2705 Check-out completed - audio will be uploaded automatically`);
      res.json(updatedRecord);
    } catch (error) {
      console.error("Check-out error:", error);
      res.status(500).json({ message: "Failed to check out" });
    }
  });
  app2.get("/api/attendance/history", async (req, res) => {
    if (!req.isAuthenticated() || req.user?.role !== "employee") {
      return res.status(401).json({ message: "Employee access required" });
    }
    try {
      const records = await storage3.getAttendanceRecordsByUserId(req.user.id);
      res.json(records);
    } catch (error) {
      console.error("Attendance history error:", error);
      res.status(500).json({ message: "Failed to fetch attendance history" });
    }
  });
  app2.get("/api/attendance/today", async (req, res) => {
    if (!req.isAuthenticated() || req.user?.role !== "employee") {
      return res.status(401).json({ message: "Employee access required" });
    }
    try {
      const today = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
      const record = await storage3.getTodayAttendanceRecord(req.user.id, today);
      res.json(record);
    } catch (error) {
      console.error("Today attendance error:", error);
      res.status(500).json({ message: "Failed to fetch today's attendance" });
    }
  });
  app2.get("/api/admin/attendance/today", async (req, res) => {
    if (!req.isAuthenticated() || req.user?.role !== "admin") {
      return res.status(401).json({ message: "Admin access required" });
    }
    try {
      const today = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
      const records = await storage3.getAllTodayAttendance(today);
      res.json(records);
    } catch (error) {
      console.error("Admin attendance error:", error);
      res.status(500).json({ message: "Failed to fetch attendance data" });
    }
  });
  app2.post("/api/admin/attendance/checkin", async (req, res) => {
    if (!req.isAuthenticated() || req.user?.role !== "admin") {
      return res.status(401).json({ message: "Admin access required" });
    }
    try {
      const { userId } = req.body;
      const today = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
      const existingRecord = await storage3.getTodayAttendanceRecord(userId, today);
      if (existingRecord) {
        return res.status(400).json({ message: "Attendance already recorded for today" });
      }
      const checkInTime = /* @__PURE__ */ new Date();
      const isLate = checkInTime.getHours() > 9 || checkInTime.getHours() === 9 && checkInTime.getMinutes() > 15;
      const attendanceRecord = await storage3.createAttendanceRecord({
        userId,
        checkInTime,
        date: today,
        isLate,
        isEarlyLeave: false
      });
      res.status(201).json(attendanceRecord);
    } catch (error) {
      console.error("Admin manual check-in error:", error);
      res.status(500).json({ message: "Failed to check in employee" });
    }
  });
  app2.put("/api/admin/attendance/:id", async (req, res) => {
    if (!req.isAuthenticated() || req.user?.role !== "admin") {
      return res.status(401).json({ message: "Admin access required" });
    }
    try {
      const { isLate } = req.body;
      const updated = await storage3.updateAttendanceRecord(req.params.id, { isLate });
      if (!updated) {
        return res.status(404).json({ message: "Attendance record not found" });
      }
      res.json(updated);
    } catch (error) {
      console.error("Update attendance error:", error);
      res.status(500).json({ message: "Failed to update attendance" });
    }
  });
  app2.get("/api/admin/employees", async (req, res) => {
    if (!req.isAuthenticated() || req.user?.role !== "admin") {
      return res.status(401).json({ message: "Admin access required" });
    }
    try {
      const users3 = await storage3.getAllUsers();
      res.json(users3);
    } catch (error) {
      console.error("Admin employees error:", error);
      res.status(500).json({ message: "Failed to fetch employees" });
    }
  });
  app2.post("/api/admin/employees", async (req, res) => {
    if (!req.isAuthenticated() || req.user?.role !== "admin") {
      return res.status(401).json({ message: "Admin access required" });
    }
    try {
      const { username, password, employeeId, department } = req.body;
      const existingUser = await storage3.getUserByUsername(username);
      if (existingUser) {
        return res.status(400).json({ message: "Username already exists" });
      }
      const hashedPassword = await hashPassword(password);
      const user = await storage3.createUser({
        username,
        password: hashedPassword,
        role: "employee",
        employeeId,
        department
      });
      res.status(201).json(user);
    } catch (error) {
      console.error("Create employee error:", error);
      res.status(500).json({ message: "Failed to create employee" });
    }
  });
  app2.put("/api/admin/employees/:id", async (req, res) => {
    if (!req.isAuthenticated() || req.user?.role !== "admin") {
      return res.status(401).json({ message: "Admin access required" });
    }
    try {
      const { username, employeeId, department, password } = req.body;
      const updateData = { username, employeeId, department };
      if (password) {
        updateData.password = await hashPassword(password);
      }
      const user = await storage3.updateUser(req.params.id, updateData);
      res.json(user);
    } catch (error) {
      console.error("Update employee error:", error);
      res.status(500).json({ message: "Failed to update employee" });
    }
  });
  app2.delete("/api/admin/employees/:id", async (req, res) => {
    if (!req.isAuthenticated() || req.user?.role !== "admin") {
      return res.status(401).json({ message: "Admin access required" });
    }
    try {
      await storage3.deleteUser(req.params.id);
      res.sendStatus(200);
    } catch (error) {
      console.error("Delete employee error:", error);
      res.status(500).json({ message: "Failed to delete employee" });
    }
  });
  app2.get("/api/admin/work-hours", async (req, res) => {
    if (!req.isAuthenticated() || req.user?.role !== "admin") {
      return res.status(401).json({ message: "Admin access required" });
    }
    try {
      const { month } = req.query;
      if (!month || typeof month !== "string") {
        return res.status(400).json({ message: "Month parameter is required in YYYY-MM format" });
      }
      const monthRegex = /^\d{4}-\d{2}$/;
      if (!monthRegex.test(month)) {
        return res.status(400).json({ message: "Invalid month format. Use YYYY-MM format" });
      }
      const [year, monthNum] = month.split("-").map(Number);
      if (year < 2e3 || year > 2100 || monthNum < 1 || monthNum > 12) {
        return res.status(400).json({ message: "Invalid month. Year must be between 2000-2100 and month between 01-12" });
      }
      const workHoursData = await storage3.getMonthlyWorkHours(month);
      res.json(workHoursData);
    } catch (error) {
      console.error("Monthly work hours error:", error);
      res.status(500).json({ message: "Failed to fetch monthly work hours data" });
    }
  });
  app2.post(
    "/api/audio/upload",
    async (req, res, next) => {
      if (req.isAuthenticated() && req.user?.role === "employee") return next();
      try {
        const auth = req.headers.authorization || "";
        if (auth.startsWith("Bearer ")) {
          const token = auth.slice(7);
          const secret = process.env.JWT_SECRET || "upload-secret-2025";
          const payload = jwt2.verify(token, secret);
          if (payload?.sub) {
            const user = await storage3.getUser(payload.sub);
            if (user && user.role === "employee") {
              req.user = user;
              return next();
            }
          }
        }
      } catch {
      }
      return res.status(401).json({ message: "Employee access required" });
    },
    upload.single("audio"),
    async (req, res) => {
      if (!req.isAuthenticated() || req.user?.role !== "employee") {
        return res.status(401).json({ message: "Employee access required" });
      }
      try {
        const file = req.file;
        if (!file) {
          return res.status(400).json({ message: "No audio file provided" });
        }
        const userId = req.user.id;
        const today = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
        console.log(`\u{1F3A4} Audio uploaded: ${file.filename}, size: ${file.size} bytes`);
        const attendanceRecord = await storage3.getTodayAttendanceRecord(userId, today);
        if (!attendanceRecord) {
          return res.status(400).json({ message: "No attendance record found" });
        }
        const fileUrl = `/uploads/audio/${userId}/${file.filename}`;
        const clientDuration = req.body.duration ? parseInt(req.body.duration, 10) : void 0;
        const durationSeconds = clientDuration !== void 0 ? clientDuration : 0;
        const savedRecording = await storage3.createAudioRecording({
          userId,
          attendanceId: attendanceRecord.id,
          fileUrl,
          fileName: file.filename,
          fileSize: file.size,
          duration: durationSeconds,
          recordingDate: today,
          isActive: false
        });
        await storage3.enforceAudioStorageLimit(30 * 1024 * 1024 * 1024);
        await storage3.deleteOldAudioRecordings(15);
        console.log(`\u2705 Audio segment saved: ${savedRecording?.id}`);
        res.json({ message: "Audio uploaded successfully", recording: savedRecording });
      } catch (error) {
        console.error("Audio upload error:", error);
        res.status(500).json({ message: "Failed to upload audio" });
      }
    }
  );
  app2.get("/uploads/audio/:userId/:filename", (req, res) => {
    const { userId, filename } = req.params;
    const filePath2 = path3.join(__dirname2, "uploads", "audio", userId, filename);
    if (!fs3.existsSync(filePath2)) {
      return res.status(404).json({ message: "Audio file not found" });
    }
    const stat = fs3.statSync(filePath2);
    const fileSize = stat.size;
    const range = req.headers.range;
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Accept-Ranges", "bytes");
    const ext = path3.extname(filePath2).toLowerCase();
    const contentType = ext === ".webm" ? "audio/webm" : ext === ".m4a" || ext === ".mp4" ? "audio/mp4" : ext === ".ogg" ? "audio/ogg" : "audio/*";
    if (range) {
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      if (isNaN(start) || isNaN(end) || start > end || end >= fileSize) {
        return res.status(416).set({ "Content-Range": `bytes */${fileSize}` }).end();
      }
      const chunkSize = end - start + 1;
      res.writeHead(206, {
        "Content-Range": `bytes ${start}-${end}/${fileSize}`,
        "Accept-Ranges": "bytes",
        "Content-Length": chunkSize,
        "Content-Type": contentType
      });
      const stream = fs3.createReadStream(filePath2, { start, end });
      stream.pipe(res);
    } else {
      res.writeHead(200, {
        "Content-Length": fileSize,
        "Content-Type": contentType
      });
      fs3.createReadStream(filePath2).pipe(res);
    }
  });
  app2.get("/api/admin/audio/recordings", async (req, res) => {
    if (!req.isAuthenticated() || req.user?.role !== "admin") {
      return res.status(401).json({ message: "Admin access required" });
    }
    try {
      await storage3.deleteOldAudioRecordings(15);
      const recordings = await storage3.getAllAudioRecordings();
      res.json(recordings);
    } catch (error) {
      console.error("Audio recordings error:", error);
      res.status(500).json({ message: "Failed to fetch audio recordings" });
    }
  });
  app2.get("/api/admin/audio/active", async (req, res) => {
    if (!req.isAuthenticated() || req.user?.role !== "admin") {
      return res.status(401).json({ message: "Admin access required" });
    }
    try {
      const activeRecordings = await storage3.getActiveAudioRecordings();
      res.json(activeRecordings);
    } catch (error) {
      console.error("Active recordings error:", error);
      res.status(500).json({ message: "Failed to fetch active recordings" });
    }
  });
  app2.post("/api/admin/audio/stop/:id", async (req, res) => {
    if (!req.isAuthenticated() || req.user?.role !== "admin") {
      return res.status(401).json({ message: "Admin access required" });
    }
    try {
      const currentRecording = await storage3.getAudioRecordingById(req.params.id);
      let duration = 0;
      if (currentRecording?.createdAt) {
        duration = Math.floor((Date.now() - new Date(currentRecording.createdAt).getTime()) / 1e3);
      }
      const today = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
      const recording = await storage3.updateAudioRecording(req.params.id, {
        isActive: false,
        duration,
        recordingDate: currentRecording?.recordingDate || today
      });
      wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({ type: "audio_stop", recordingId: req.params.id }));
        }
      });
      res.json(recording);
    } catch (error) {
      console.error("Stop recording error:", error);
      res.status(500).json({ message: "Failed to stop recording" });
    }
  });
  app2.delete("/api/admin/audio/cleanup", async (req, res) => {
    if (!req.isAuthenticated() || req.user?.role !== "admin") {
      return res.status(401).json({ message: "Admin access required" });
    }
    try {
      await storage3.deleteOldAudioRecordings(15);
      res.json({ message: "Old recordings older than 15 days cleaned up" });
    } catch (error) {
      console.error("Cleanup error:", error);
      res.status(500).json({ message: "Failed to clean up old recordings" });
    }
  });
  app2.delete("/api/admin/audio/:id", async (req, res) => {
    if (!req.isAuthenticated() || req.user?.role !== "admin") {
      return res.status(401).json({ message: "Admin access required" });
    }
    try {
      const recording = await storage3.getAudioRecordingById(req.params.id);
      if (!recording) {
        return res.status(404).json({ message: "Recording not found" });
      }
      if (recording.fileName) {
        const filePath2 = path3.join(
          __dirname2,
          "uploads",
          "audio",
          recording.userId,
          recording.fileName
        );
        try {
          await fs3.promises.unlink(filePath2);
        } catch (err) {
          console.warn("File delete error:", err);
        }
      }
      await storage3.deleteAudioRecording(req.params.id);
      res.json({ message: "Recording deleted" });
    } catch (error) {
      console.error("Delete recording error:", error);
      res.status(500).json({ message: "Failed to delete recording" });
    }
  });
  return;
}

// server/vite.ts
import express from "express";
import fs4 from "fs";
import path5 from "path";
import { createServer as createViteServer, createLogger } from "vite";

// vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path4 from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";
var vite_config_default = defineConfig({
  plugins: [
    react(),
    runtimeErrorOverlay(),
    ...process.env.NODE_ENV !== "production" && process.env.REPL_ID !== void 0 ? [
      await import("@replit/vite-plugin-cartographer").then(
        (m) => m.cartographer()
      )
    ] : []
  ],
  resolve: {
    alias: {
      "@": path4.resolve(import.meta.dirname, "client", "src"),
      "@shared": path4.resolve(import.meta.dirname, "shared"),
      "@assets": path4.resolve(import.meta.dirname, "attached_assets")
    }
  },
  root: path4.resolve(import.meta.dirname, "client"),
  build: {
    outDir: path4.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true
  },
  server: {
    // Allow opening through any host (ngrok, LAN, etc.) in dev
    // You can restrict this later to a list if needed
    allowedHosts: true,
    fs: {
      strict: true,
      deny: ["**/.*"]
    }
  }
});

// server/vite.ts
import { nanoid as nanoid2 } from "nanoid";
var viteLogger = createLogger();
function log(message, source = "express") {
  const formattedTime = (/* @__PURE__ */ new Date()).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true
  });
  console.log(`${formattedTime} [${source}] ${message}`);
}
async function setupVite(app2, server, sessionMiddleware) {
  const hmrOptions = { server };
  const publicUrl = process.env.PUBLIC_URL;
  const inferredHost = publicUrl ? (() => {
    try {
      return new URL(publicUrl).hostname;
    } catch {
      return void 0;
    }
  })() : void 0;
  const hmrHost = process.env.HMR_HOST || inferredHost;
  if (hmrHost) {
    hmrOptions.host = hmrHost;
    hmrOptions.protocol = "wss";
    hmrOptions.clientPort = 443;
  }
  const vite = await createViteServer({
    ...vite_config_default,
    configFile: false,
    customLogger: {
      ...viteLogger,
      error: (msg, options) => {
        viteLogger.error(msg, options);
        process.exit(1);
      }
    },
    server: {
      // Allow external hosts like ngrok to reach the dev server middleware
      allowedHosts: true,
      middlewareMode: true,
      hmr: hmrOptions
    },
    appType: "custom"
  });
  app2.use(sessionMiddleware);
  app2.use(vite.middlewares);
  app2.use("*", async (req, res, next) => {
    if (req.originalUrl.startsWith("/api") || req.originalUrl.startsWith("/uploads")) {
      return next();
    }
    if (!vite) {
      return next();
    }
    const url = req.originalUrl;
    try {
      const clientTemplate = path5.resolve(
        import.meta.dirname,
        "..",
        "client",
        "index.html"
      );
      let template = await fs4.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid2()}"`
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e);
      next(e);
      return;
    }
  });
}
function serveStatic(app2) {
  const distPath = path5.resolve(import.meta.dirname, "public");
  if (!fs4.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`
    );
  }
  app2.use(express.static(distPath));
  app2.use("*", (_req, res) => {
    res.sendFile(path5.resolve(distPath, "index.html"));
  });
}

// server/index.ts
import fs5 from "fs";
import path6 from "path";
import http from "http";
import https from "https";
var app = express2();
app.use(express2.json());
app.use(express2.urlencoded({ extended: false }));
app.set("trust proxy", 1);
var allowList = new Set([
  process.env.CORS_ORIGIN || "",
  "capacitor://localhost",
  "http://localhost",
  "https://localhost"
].filter(Boolean));
var dynamicCorsOrigin = (origin, callback) => {
  if (!origin) return callback(null, true);
  try {
    const o = new URL(origin);
    const host = o.hostname;
    if (allowList.has(origin)) return callback(null, true);
    if (host.endsWith(".ngrok-free.app")) return callback(null, true);
    if (host.endsWith(".loca.lt")) return callback(null, true);
    if (host.endsWith(".trycloudflare.com")) return callback(null, true);
    if (host.endsWith(".deno.dev")) return callback(null, true);
    if (/^(10\.|192\.168\.|172\.)/.test(host)) return callback(null, true);
  } catch {
  }
  return callback(null, false);
};
app.use(cors({ origin: dynamicCorsOrigin, credentials: true }));
app.options("*", cors({ credentials: true, origin: dynamicCorsOrigin }));
app.use((req, res, next) => {
  const start = Date.now();
  const path7 = req.path;
  let capturedJsonResponse = void 0;
  const originalResJson = res.json;
  res.json = function(bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };
  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path7.startsWith("/api")) {
      let logLine = `${req.method} ${path7} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }
      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "\u2026";
      }
      log(logLine);
    }
  });
  next();
});
(async () => {
  let server;
  const certPath = process.env.TLS_CERT_FILE;
  const keyPath = process.env.TLS_KEY_FILE;
  if (certPath && keyPath) {
    try {
      const cert = fs5.readFileSync(path6.resolve(certPath));
      const key = fs5.readFileSync(path6.resolve(keyPath));
      server = https.createServer({ key, cert }, app);
      log(`HTTPS enabled (cert: ${certPath})`);
    } catch (e) {
      log(`failed to enable HTTPS, falling back to HTTP: ${e?.message || e}`);
      server = http.createServer(app);
    }
  } else {
    server = http.createServer(app);
  }
  const sessionMiddleware = setupAuth(app);
  if (process.env.DATABASE_URL) {
    try {
      const { ensureDbReady: ensureDbReady2 } = await Promise.resolve().then(() => (init_db(), db_exports));
      await ensureDbReady2();
    } catch (err) {
      log(`database not ready at startup, continuing: ${err?.message || err}`);
    }
  }
  registerRoutes(app, server);
  if (app.get("env") === "development") {
    await setupVite(app, server, sessionMiddleware);
  } else {
    serveStatic(app);
  }
  app.use((err, _req, res, _next) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    res.status(status).json({ message });
    throw err;
  });
  const port = parseInt(process.env.PORT || "5000", 10);
  server.listen(port, "0.0.0.0", () => {
    const protocol = server instanceof https.Server ? "https" : "http";
    log(`serving on ${protocol}://0.0.0.0:${port}`);
  });
})();
