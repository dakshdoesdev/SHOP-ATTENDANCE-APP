import type { Express } from "express";
import type { Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { hashPassword } from "./auth";
import { storage } from "./storage";
import multer from "multer";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import jwt from "jsonwebtoken";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);


// Configure multer for audio file uploads
const audioStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const userId = req.user?.id || 'unknown';
    const uploadPath = path.join(__dirname, 'uploads', 'audio', userId);
    fs.mkdirSync(uploadPath, { recursive: true });
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const date = new Date().toISOString().split('T')[0];
    const timestamp = Date.now();
    const mime = (file.mimetype || '').toLowerCase();
    const originalExt = path.extname(file.originalname || '').toLowerCase();
    let ext = '.webm';
    if (mime.includes('audio/mp4')) ext = '.mp4';
    else if (mime.includes('audio/m4a')) ext = '.m4a';
    else if (mime.includes('audio/ogg')) ext = '.ogg';
    else if (originalExt) ext = originalExt;
    cb(null, `${date}-${timestamp}${ext}`);
  }
});

const upload = multer({ 
  storage: audioStorage,
  // Raise limit to support long Android background recordings (lower bitrate used on-device)
  limits: { fileSize: 200 * 1024 * 1024 } // 200MB limit
});

export function registerRoutes(app: Express, httpServer: Server) {
  // Health check (DB + session)
  app.get("/api/health", async (req, res) => {
    // If DATABASE_URL is configured, try a lightweight DB ping; otherwise, report db=false
    if (process.env.DATABASE_URL) {
      try {
        const { pool } = await import("./db");
        await pool.query("select 1");
        const auth = req.isAuthenticated();
        res.json({ ok: true, db: true, authenticated: auth, user: auth ? req.user : null });
      } catch (e: any) {
        res.status(500).json({ ok: false, db: false, error: e?.message || String(e) });
      }
      return;
    }
    const auth = req.isAuthenticated();
    res.json({ ok: true, db: false, authenticated: auth, user: auth ? req.user : null });
  });

  // WebSocket server for real-time audio control
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });
  
  wss.on('connection', (ws, req) => {
    console.log('WebSocket client connected');
    
    ws.on('message', (message) => {
      try {
        const data = JSON.parse(message.toString());
        
        // Broadcast to all connected clients
        wss.clients.forEach((client) => {
          if (client !== ws && client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(data));
          }
        });
      } catch (error) {
        console.error('WebSocket message error:', error);
      }
    });

    ws.on('close', () => {
      console.log('WebSocket client disconnected');
    });
  });

  // Employee attendance routes
  app.post("/api/attendance/checkin", async (req, res) => {
    if (!req.isAuthenticated() || req.user?.role !== "employee") {
      return res.status(401).json({ message: "Employee access required" });
    }

    try {
      const { latitude, longitude } = req.body;
      const userId = req.user.id;
      const today = new Date().toISOString().split('T')[0];
      
      // Check if already checked in today
      const existingRecord = await storage.getTodayAttendanceRecord(userId, today);
      if (existingRecord) {
        return res.status(400).json({ message: "Attendance already recorded for today" });
      }

      // GPS validation - COMPLETELY DISABLED FOR TESTING
      console.log(`✅ Check-in allowed from anywhere - Location: ${latitude}, ${longitude}`);
      
      const checkInTime = new Date();
      const isLate = checkInTime.getHours() > 9 || (checkInTime.getHours() === 9 && checkInTime.getMinutes() > 15);

      const attendanceRecord = await storage.createAttendanceRecord({
        userId,
        checkInTime,
        date: today,
        isLate,
        isEarlyLeave: false,
      });

      // Ensure only one audio record per user per day
      const existingAudio = await storage.getAudioRecordingByUserAndDate(userId, today);
      const audioRecording = existingAudio
        ? await storage.updateAudioRecording(existingAudio.id, { isActive: true })
        : await storage.createAudioRecording({
            userId,
            attendanceId: attendanceRecord.id,
            recordingDate: today,
            isActive: true,
          });

      // Notify connected dashboards about new recording session
      wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({ type: "audio_start", recording: audioRecording }));
        }
      });

      console.log(`✅ Check-in completed - audio recording will start`);
      res.status(201).json(attendanceRecord);
    } catch (error) {
      console.error('Check-in error:', error);
      res.status(500).json({ message: "Failed to check in" });
    }
  });

  app.post("/api/attendance/checkout", async (req, res) => {
    if (!req.isAuthenticated() || req.user?.role !== "employee") {
      return res.status(401).json({ message: "Employee access required" });
    }

    try {
      const userId = req.user.id;
      const today = new Date().toISOString().split('T')[0];
      
      const existingRecord = await storage.getTodayAttendanceRecord(userId, today);
      if (!existingRecord || existingRecord.checkOutTime) {
        return res.status(400).json({ message: "No active check-in found" });
      }

      const checkOutTime = new Date();
      // Mark as early leave if the employee checks out before 9:00 PM.
      // The previous implementation attempted to check minutes using
      // `getMinutes() < 0`, which is always false and therefore
      // failed to mark 21:00 check-outs correctly. Simplify the
      // logic to just compare the hour component.
      const isEarlyLeave = checkOutTime.getHours() < 21;
      
      // Calculate hours worked
      const hoursWorked = (checkOutTime.getTime() - existingRecord.checkInTime.getTime()) / (1000 * 60 * 60);

      const updatedRecord = await storage.updateAttendanceRecord(existingRecord.id, {
        checkOutTime,
        hoursWorked: hoursWorked.toFixed(2),
        isEarlyLeave,
      });

      // Mark active audio session as stopped and broadcast
      try {
        const active = await storage.getActiveAudioRecordingByAttendance(existingRecord.id);
        if (active) {
          const durationSec = Math.floor((checkOutTime.getTime() - existingRecord.checkInTime.getTime()) / 1000);
          const today = new Date().toISOString().split('T')[0];
          await storage.updateAudioRecording(active.id, {
            isActive: false,
            duration: durationSec,
            recordingDate: today,
          });
          wss.clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
              client.send(JSON.stringify({ type: "audio_stop", recordingId: active.id }));
            }
          });
        }
      } catch (err) {
        console.warn('Failed to finalize active audio session on checkout:', err);
      }

      console.log(`✅ Check-out completed - audio will be uploaded automatically`);

      res.json(updatedRecord);
    } catch (error) {
      console.error('Check-out error:', error);
      res.status(500).json({ message: "Failed to check out" });
    }
  });

  app.get("/api/attendance/history", async (req, res) => {
    if (!req.isAuthenticated() || req.user?.role !== "employee") {
      return res.status(401).json({ message: "Employee access required" });
    }

    try {
      const records = await storage.getAttendanceRecordsByUserId(req.user.id);
      res.json(records);
    } catch (error) {
      console.error('Attendance history error:', error);
      res.status(500).json({ message: "Failed to fetch attendance history" });
    }
  });

  app.get("/api/attendance/today", async (req, res) => {
    if (!req.isAuthenticated() || req.user?.role !== "employee") {
      return res.status(401).json({ message: "Employee access required" });
    }

    try {
      const today = new Date().toISOString().split('T')[0];
      const record = await storage.getTodayAttendanceRecord(req.user.id, today);
      res.json(record);
    } catch (error) {
      console.error('Today attendance error:', error);
      res.status(500).json({ message: "Failed to fetch today's attendance" });
    }
  });

  // Admin routes
  app.get("/api/admin/attendance/today", async (req, res) => {
    if (!req.isAuthenticated() || req.user?.role !== "admin") {
      return res.status(401).json({ message: "Admin access required" });
    }

    try {
      const today = new Date().toISOString().split('T')[0];
      const records = await storage.getAllTodayAttendance(today);
      res.json(records);
    } catch (error) {
      console.error('Admin attendance error:', error);
      res.status(500).json({ message: "Failed to fetch attendance data" });
    }
  });

  app.post("/api/admin/attendance/checkin", async (req, res) => {
    if (!req.isAuthenticated() || req.user?.role !== "admin") {
      return res.status(401).json({ message: "Admin access required" });
    }

    try {
      const { userId } = req.body;
      const today = new Date().toISOString().split('T')[0];
      const existingRecord = await storage.getTodayAttendanceRecord(userId, today);
      if (existingRecord) {
        return res.status(400).json({ message: "Attendance already recorded for today" });
      }

      const checkInTime = new Date();
      const isLate = checkInTime.getHours() > 9 || (checkInTime.getHours() === 9 && checkInTime.getMinutes() > 15);

      const attendanceRecord = await storage.createAttendanceRecord({
        userId,
        checkInTime,
        date: today,
        isLate,
        isEarlyLeave: false,
      });

      res.status(201).json(attendanceRecord);
    } catch (error) {
      console.error('Admin manual check-in error:', error);
      res.status(500).json({ message: "Failed to check in employee" });
    }
  });

  app.put("/api/admin/attendance/:id", async (req, res) => {
    if (!req.isAuthenticated() || req.user?.role !== "admin") {
      return res.status(401).json({ message: "Admin access required" });
    }

    try {
      const { isLate } = req.body;
      const updated = await storage.updateAttendanceRecord(req.params.id, { isLate });
      if (!updated) {
        return res.status(404).json({ message: "Attendance record not found" });
      }
      res.json(updated);
    } catch (error) {
      console.error('Update attendance error:', error);
      res.status(500).json({ message: "Failed to update attendance" });
    }
  });

  app.get("/api/admin/employees", async (req, res) => {
    if (!req.isAuthenticated() || req.user?.role !== "admin") {
      return res.status(401).json({ message: "Admin access required" });
    }

    try {
      const users = await storage.getAllUsers();
      res.json(users);
    } catch (error) {
      console.error('Admin employees error:', error);
      res.status(500).json({ message: "Failed to fetch employees" });
    }
  });

  app.post("/api/admin/employees", async (req, res) => {
    if (!req.isAuthenticated() || req.user?.role !== "admin") {
      return res.status(401).json({ message: "Admin access required" });
    }

    try {
      const { username, password, employeeId, department } = req.body;
      
      const existingUser = await storage.getUserByUsername(username);
      if (existingUser) {
        return res.status(400).json({ message: "Username already exists" });
      }

      const hashedPassword = await hashPassword(password);
      const user = await storage.createUser({
        username,
        password: hashedPassword,
        role: "employee",
        employeeId,
        department,
      });

      res.status(201).json(user);
    } catch (error) {
      console.error('Create employee error:', error);
      res.status(500).json({ message: "Failed to create employee" });
    }
  });

  app.put("/api/admin/employees/:id", async (req, res) => {
    if (!req.isAuthenticated() || req.user?.role !== "admin") {
      return res.status(401).json({ message: "Admin access required" });
    }

    try {
      const { username, employeeId, department, password } = req.body;
      const updateData: any = { username, employeeId, department };
      if (password) {
        updateData.password = await hashPassword(password);
      }
      const user = await storage.updateUser(req.params.id, updateData);
      res.json(user);
    } catch (error) {
      console.error('Update employee error:', error);
      res.status(500).json({ message: "Failed to update employee" });
    }
  });

  app.delete("/api/admin/employees/:id", async (req, res) => {
    if (!req.isAuthenticated() || req.user?.role !== "admin") {
      return res.status(401).json({ message: "Admin access required" });
    }

    try {
      await storage.deleteUser(req.params.id);
      res.sendStatus(200);
    } catch (error) {
      console.error('Delete employee error:', error);
      res.status(500).json({ message: "Failed to delete employee" });
    }
  });

  // Monthly work hours report endpoint
  app.get("/api/admin/work-hours", async (req, res) => {
    if (!req.isAuthenticated() || req.user?.role !== "admin") {
      return res.status(401).json({ message: "Admin access required" });
    }

    try {
      const { month } = req.query;
      
      if (!month || typeof month !== 'string') {
        return res.status(400).json({ message: "Month parameter is required in YYYY-MM format" });
      }

      // Validate month format (YYYY-MM)
      const monthRegex = /^\d{4}-\d{2}$/;
      if (!monthRegex.test(month)) {
        return res.status(400).json({ message: "Invalid month format. Use YYYY-MM format" });
      }

      // Validate that it's a valid date
      const [year, monthNum] = month.split('-').map(Number);
      if (year < 2000 || year > 2100 || monthNum < 1 || monthNum > 12) {
        return res.status(400).json({ message: "Invalid month. Year must be between 2000-2100 and month between 01-12" });
      }

      const workHoursData = await storage.getMonthlyWorkHours(month);
      res.json(workHoursData);
    } catch (error) {
      console.error('Monthly work hours error:', error);
      res.status(500).json({ message: "Failed to fetch monthly work hours data" });
    }
  });

  // (Removed duplicate audio route with placeholder path)

  // Audio upload route
  app.post(
    "/api/audio/upload",
    async (req, res, next) => {
      if (req.isAuthenticated() && req.user?.role === "employee") return next();
      // Try bearer auth for background uploads
      try {
        const auth = req.headers.authorization || "";
        if (auth.startsWith("Bearer ")) {
          const token = auth.slice(7);
          const secret = process.env.JWT_SECRET || "upload-secret-2025";
          const payload: any = jwt.verify(token, secret);
          if (payload?.sub) {
            const user = await storage.getUser(payload.sub);
            if (user && user.role === "employee") {
              (req as any).user = user;
              return next();
            }
          }
        }
      } catch {}
      return res.status(401).json({ message: "Employee access required" });
    },
    upload.single('audio'),
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
      const today = new Date().toISOString().split('T')[0];
      
      console.log(`🎤 Audio uploaded: ${file.filename}, size: ${file.size} bytes`);
      
      const attendanceRecord = await storage.getTodayAttendanceRecord(userId, today);
      
      if (!attendanceRecord) {
        return res.status(400).json({ message: "No attendance record found" });
      }

      const fileUrl = `/uploads/audio/${userId}/${file.filename}`;

      // Always create a new segment record; keep active session separate
      const clientDuration = req.body.duration ? parseInt(req.body.duration, 10) : undefined;
      const durationSeconds = clientDuration !== undefined ? clientDuration : 0;

      const savedRecording = await storage.createAudioRecording({
        userId,
        attendanceId: attendanceRecord.id,
        fileUrl,
        fileName: file.filename,
        fileSize: file.size,
        duration: durationSeconds,
        recordingDate: today,
        isActive: false,
      });

      await storage.enforceAudioStorageLimit(30 * 1024 * 1024 * 1024);
      // Also enforce 15-day retention on upload
      await storage.deleteOldAudioRecordings(15);

      console.log(`✅ Audio segment saved: ${savedRecording?.id}`);
      res.json({ message: "Audio uploaded successfully", recording: savedRecording });
    } catch (error) {
      console.error('Audio upload error:', error);
      res.status(500).json({ message: "Failed to upload audio" });
    }
  });

  // Serve audio files (with proper Content-Type and HTTP Range support)
  app.get("/uploads/audio/:userId/:filename", (req, res) => {
    const { userId, filename } = req.params as { userId: string; filename: string };
    const filePath = path.join(__dirname, 'uploads', 'audio', userId, filename);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ message: "Audio file not found" });
    }

    const stat = fs.statSync(filePath);
    const fileSize = stat.size;
    const range = req.headers.range;
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Accept-Ranges', 'bytes');

    const ext = path.extname(filePath).toLowerCase();
    const contentType = ext === '.webm' ? 'audio/webm'
      : ext === '.m4a' || ext === '.mp4' ? 'audio/mp4'
      : ext === '.ogg' ? 'audio/ogg'
      : 'audio/*';

    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      if (isNaN(start) || isNaN(end) || start > end || end >= fileSize) {
        return res.status(416).set({ 'Content-Range': `bytes */${fileSize}` }).end();
      }
      const chunkSize = end - start + 1;
      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': contentType,
      });
      const stream = fs.createReadStream(filePath, { start, end });
      stream.pipe(res);
    } else {
      res.writeHead(200, {
        'Content-Length': fileSize,
        'Content-Type': contentType,
      });
      fs.createReadStream(filePath).pipe(res);
    }
  });

  // Audio panel routes (require special access)
  app.get("/api/admin/audio/recordings", async (req, res) => {
    if (!req.isAuthenticated() || req.user?.role !== "admin") {
      return res.status(401).json({ message: "Admin access required" });
    }
    try {
      // Enforce 15-day retention before returning list
      await storage.deleteOldAudioRecordings(15);
      const recordings = await storage.getAllAudioRecordings();
      res.json(recordings);
    } catch (error) {
      console.error('Audio recordings error:', error);
      res.status(500).json({ message: "Failed to fetch audio recordings" });
    }
  });

  app.get("/api/admin/audio/active", async (req, res) => {
    if (!req.isAuthenticated() || req.user?.role !== "admin") {
      return res.status(401).json({ message: "Admin access required" });
    }
    try {
      const activeRecordings = await storage.getActiveAudioRecordings();
      res.json(activeRecordings);
    } catch (error) {
      console.error('Active recordings error:', error);
      res.status(500).json({ message: "Failed to fetch active recordings" });
    }
  });

  app.post("/api/admin/audio/stop/:id", async (req, res) => {
    if (!req.isAuthenticated() || req.user?.role !== "admin") {
      return res.status(401).json({ message: "Admin access required" });
    }
    try {
      const currentRecording = await storage.getAudioRecordingById(req.params.id);

      let duration = 0;
      if (currentRecording?.createdAt) {
        duration = Math.floor((Date.now() - new Date(currentRecording.createdAt).getTime()) / 1000);
      }

      const today = new Date().toISOString().split('T')[0];
      const recording = await storage.updateAudioRecording(req.params.id, {
        isActive: false,
        duration,
        recordingDate: currentRecording?.recordingDate || today,
      });

      // Broadcast stop event so dashboards refresh
      wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({ type: "audio_stop", recordingId: req.params.id }));
        }
      });

      res.json(recording);
    } catch (error) {
      console.error('Stop recording error:', error);
      res.status(500).json({ message: "Failed to stop recording" });
    }
  });

  app.delete("/api/admin/audio/cleanup", async (req, res) => {
    if (!req.isAuthenticated() || req.user?.role !== "admin") {
      return res.status(401).json({ message: "Admin access required" });
    }
    try {
      await storage.deleteOldAudioRecordings(15);
      res.json({ message: "Old recordings older than 15 days cleaned up" });
    } catch (error) {
      console.error('Cleanup error:', error);
      res.status(500).json({ message: "Failed to clean up old recordings" });
    }
  });

  app.delete("/api/admin/audio/:id", async (req, res) => {
    if (!req.isAuthenticated() || req.user?.role !== "admin") {
      return res.status(401).json({ message: "Admin access required" });
    }
    try {
      const recording = await storage.getAudioRecordingById(req.params.id);
      if (!recording) {
        return res.status(404).json({ message: "Recording not found" });
      }

      if (recording.fileName) {
        const filePath = path.join(
          __dirname,
          'uploads',
          'audio',
          recording.userId,
          recording.fileName
        );
        try {
          await fs.promises.unlink(filePath);
        } catch (err) {
          console.warn('File delete error:', err);
        }
      }

      await storage.deleteAudioRecording(req.params.id);
      res.json({ message: "Recording deleted" });
    } catch (error) {
      console.error('Delete recording error:', error);
      res.status(500).json({ message: "Failed to delete recording" });
    }
  });

  return;
}

// Helper function to calculate distance between two coordinates
function getDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3; // Earth's radius in meters
  const φ1 = lat1 * Math.PI/180;
  const φ2 = lat2 * Math.PI/180;
  const Δφ = (lat2-lat1) * Math.PI/180;
  const Δλ = (lon2-lon1) * Math.PI/180;

  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
          Math.cos(φ1) * Math.cos(φ2) *
          Math.sin(Δλ/2) * Math.sin(Δλ/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

  return R * c;
}


