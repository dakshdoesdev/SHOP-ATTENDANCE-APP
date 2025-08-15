import { users, attendanceRecords, audioRecordings, type User, type InsertUser, type AttendanceRecord, type InsertAttendanceRecord, type AudioRecording, type InsertAudioRecording } from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, sql } from "drizzle-orm";
import session from "express-session";
import connectPg from "connect-pg-simple";
import { pool } from "./db";

const PostgresSessionStore = connectPg(session);

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  // Attendance methods
  createAttendanceRecord(record: InsertAttendanceRecord): Promise<AttendanceRecord>;
  updateAttendanceRecord(id: string, record: Partial<AttendanceRecord>): Promise<AttendanceRecord | undefined>;
  getAttendanceRecordsByUserId(userId: string): Promise<AttendanceRecord[]>;
  getTodayAttendanceRecord(userId: string, date: string): Promise<AttendanceRecord | undefined>;
  getAllTodayAttendance(date: string): Promise<(AttendanceRecord & { user: User })[]>;
  
  // Audio methods
  createAudioRecording(recording: InsertAudioRecording): Promise<AudioRecording>;
  updateAudioRecording(id: string, recording: Partial<AudioRecording>): Promise<AudioRecording | undefined>;
  getAudioRecordingsByUserId(userId: string): Promise<AudioRecording[]>;
  getAllAudioRecordings(): Promise<(AudioRecording & { user: User })[]>;
  getActiveAudioRecordings(): Promise<(AudioRecording & { user: User })[]>;
  deleteOldAudioRecordings(daysOld: number): Promise<void>;
  
  // Admin methods
  getAllUsers(): Promise<User[]>;
  updateUser(id: string, user: Partial<User>): Promise<User | undefined>;
  deleteUser(id: string): Promise<void>;
  
  sessionStore: session.Store;
}

export class DatabaseStorage implements IStorage {
  public sessionStore: session.Store;

  constructor() {
    this.sessionStore = new PostgresSessionStore({ 
      pool, 
      createTableIfMissing: true 
    });
  }

  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user || undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(insertUser)
      .returning();
    return user;
  }

  async createAttendanceRecord(record: InsertAttendanceRecord): Promise<AttendanceRecord> {
    const [attendanceRecord] = await db
      .insert(attendanceRecords)
      .values(record)
      .returning();
    return attendanceRecord;
  }

  async updateAttendanceRecord(id: string, record: Partial<AttendanceRecord>): Promise<AttendanceRecord | undefined> {
    const [updatedRecord] = await db
      .update(attendanceRecords)
      .set(record)
      .where(eq(attendanceRecords.id, id))
      .returning();
    return updatedRecord || undefined;
  }

  async getAttendanceRecordsByUserId(userId: string): Promise<AttendanceRecord[]> {
    return await db
      .select()
      .from(attendanceRecords)
      .where(eq(attendanceRecords.userId, userId))
      .orderBy(desc(attendanceRecords.checkInTime));
  }

  async getTodayAttendanceRecord(userId: string, date: string): Promise<AttendanceRecord | undefined> {
    const [record] = await db
      .select()
      .from(attendanceRecords)
      .where(and(
        eq(attendanceRecords.userId, userId),
        eq(attendanceRecords.date, date)
      ));
    return record || undefined;
  }

  async getAllTodayAttendance(date: string): Promise<(AttendanceRecord & { user: User })[]> {
    return await db
      .select({
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
        user: users,
      })
      .from(attendanceRecords)
      .innerJoin(users, eq(attendanceRecords.userId, users.id))
      .where(eq(attendanceRecords.date, date))
      .orderBy(desc(attendanceRecords.checkInTime));
  }

  async createAudioRecording(recording: InsertAudioRecording): Promise<AudioRecording> {
    const [audioRecording] = await db
      .insert(audioRecordings)
      .values(recording)
      .returning();
    return audioRecording;
  }

  async updateAudioRecording(id: string, recording: Partial<AudioRecording>): Promise<AudioRecording | undefined> {
    const [updatedRecording] = await db
      .update(audioRecordings)
      .set(recording)
      .where(eq(audioRecordings.id, id))
      .returning();
    return updatedRecording || undefined;
  }

  async getAudioRecordingsByUserId(userId: string): Promise<AudioRecording[]> {
    return await db
      .select()
      .from(audioRecordings)
      .where(eq(audioRecordings.userId, userId))
      .orderBy(desc(audioRecordings.createdAt));
  }

  async getAllAudioRecordings(): Promise<(AudioRecording & { user: User })[]> {
    return await db
      .select({
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
        user: users,
      })
      .from(audioRecordings)
      .innerJoin(users, eq(audioRecordings.userId, users.id))
      .orderBy(desc(audioRecordings.createdAt));
  }

  async getActiveAudioRecordings(): Promise<(AudioRecording & { user: User })[]> {
    return await db
      .select({
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
        user: users,
      })
      .from(audioRecordings)
      .innerJoin(users, eq(audioRecordings.userId, users.id))
      .where(eq(audioRecordings.isActive, true));
  }

  async deleteOldAudioRecordings(daysOld: number): Promise<void> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);
    
    await db
      .delete(audioRecordings)
      .where(sql`${audioRecordings.createdAt} < ${cutoffDate}`);
  }

  async getAllUsers(): Promise<User[]> {
    return await db
      .select()
      .from(users)
      .where(eq(users.role, "employee"))
      .orderBy(users.username);
  }

  async updateUser(id: string, user: Partial<User>): Promise<User | undefined> {
    const [updatedUser] = await db
      .update(users)
      .set(user)
      .where(eq(users.id, id))
      .returning();
    return updatedUser || undefined;
  }

  async deleteUser(id: string): Promise<void> {
    await db.delete(users).where(eq(users.id, id));
  }
}

export const storage = new DatabaseStorage();
