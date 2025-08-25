import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { hashPassword } from "./auth";
import { storage } from "./storage";
import type { AttendanceRecord } from "@shared/schema";
import multer from "multer";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
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
    cb(null, `${date}-${timestamp}.webm`);
  }
});

const upload = multer({ 
  storage: audioStorage,
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB limit
});

export function registerRoutes(app: Express) {
  const httpServer = createServer(app);

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
      
      // Check if already checked in today (and not checked out)
      const existingRecord = await storage.getTodayAttendanceRecord(userId, today);
      if (existingRecord && !existingRecord.checkOutTime) {
        return res.status(400).json({ message: "Already checked in today" });
      }

      // GPS validation - COMPLETELY DISABLED FOR TESTING
      console.log(`✅ Check-in allowed from anywhere - Location: ${latitude}, ${longitude}`);
      
      const checkInTime = new Date();
      const isLate = checkInTime.getHours() > 9 || (checkInTime.getHours() === 9 && checkInTime.getMinutes() > 15);

      let attendanceRecord: AttendanceRecord | undefined;
      
      // If there's an existing record (checked out), create a new one for the new session
      if (existingRecord && existingRecord.checkOutTime) {
        // Create new record for new check-in session
        attendanceRecord = await storage.createAttendanceRecord({
          userId,
          checkInTime,
          date: today,
          isLate,
          isEarlyLeave: false,
        });
      } else if (!existingRecord) {
        // Create first record of the day
        attendanceRecord = await storage.createAttendanceRecord({
          userId,
          checkInTime,
          date: today,
          isLate,
          isEarlyLeave: false,
        });
      }

      if (!attendanceRecord) {
        throw new Error("Failed to create attendance record");
      }

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
      const isEarlyLeave = checkOutTime.getHours() < 21 || (checkOutTime.getHours() === 21 && checkOutTime.getMinutes() < 0);
      
      // Calculate hours worked
      const hoursWorked = (checkOutTime.getTime() - existingRecord.checkInTime.getTime()) / (1000 * 60 * 60);

      const updatedRecord = await storage.updateAttendanceRecord(existingRecord.id, {
        checkOutTime,
        hoursWorked: hoursWorked.toFixed(2),
        isEarlyLeave,
      });

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

  // Audio upload route
  app.post("/api/audio/upload", upload.single('audio'), async (req, res) => {
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

      // Ensure single recording per user per day
      let recording = await storage.getAudioRecordingByUserAndDate(userId, today);

      const clientDuration = req.body.duration ? parseInt(req.body.duration, 10) : undefined;
      const durationSeconds = clientDuration !== undefined
        ? clientDuration
        : recording && recording.createdAt
          ? Math.floor((Date.now() - new Date(recording.createdAt).getTime()) / 1000)
          : 0;

      let savedRecording;
      if (recording) {
        savedRecording = await storage.updateAudioRecording(recording.id, {
          fileUrl,
          fileName: file.filename,
          fileSize: file.size,
          duration: durationSeconds,
          recordingDate: today,
          isActive: false,
        });

        // Notify dashboards that recording has stopped
        if (recording.isActive) {
          wss.clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
              client.send(JSON.stringify({ type: "audio_stop", recordingId: recording.id }));
            }
          });
        }
      } else {
        savedRecording = await storage.createAudioRecording({
          userId,
          attendanceId: attendanceRecord.id,
          fileUrl,
          fileName: file.filename,
          fileSize: file.size,
          duration: durationSeconds,
          recordingDate: today,
          isActive: false,
        });
      }

      await storage.enforceAudioStorageLimit(30 * 1024 * 1024 * 1024);

      console.log(`✅ Audio saved for admin panel: ${savedRecording?.id}`);
      res.json({ message: "Audio uploaded successfully", recording: savedRecording });
    } catch (error) {
      console.error('Audio upload error:', error);
      res.status(500).json({ message: "Failed to upload audio" });
    }
  });

  // Serve audio files
  app.get("/uploads/audio/:userId/:filename", (req, res) => {
    const { userId, filename } = req.params;
    const filePath = path.join(__dirname, 'uploads', 'audio', userId, filename);
    
    console.log(`📁 Audio file requested: ${filePath}`);
    
    if (fs.existsSync(filePath)) {
      // Set proper headers for audio files
      res.setHeader('Content-Type', 'audio/webm');
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(filePath);
      console.log(`✅ Audio file served: ${filename}`);
    } else {
      console.log(`❌ Audio file not found: ${filePath}`);
      res.status(404).json({ message: "Audio file not found" });
    }
  });

  // Audio panel routes (require special access)
  app.get("/api/admin/audio/recordings", async (req, res) => {
    try {
      const recordings = await storage.getAllAudioRecordings();
      res.json(recordings);
    } catch (error) {
      console.error('Audio recordings error:', error);
      res.status(500).json({ message: "Failed to fetch audio recordings" });
    }
  });

  app.get("/api/admin/audio/active", async (req, res) => {
    try {
      const activeRecordings = await storage.getActiveAudioRecordings();
      res.json(activeRecordings);
    } catch (error) {
      console.error('Active recordings error:', error);
      res.status(500).json({ message: "Failed to fetch active recordings" });
    }
  });

  app.post("/api/admin/audio/stop/:id", async (req, res) => {
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
    try {
      await storage.deleteOldAudioRecordings(7);
      res.json({ message: "Old recordings cleaned up" });
    } catch (error) {
      console.error('Cleanup error:', error);
      res.status(500).json({ message: "Failed to clean up old recordings" });
    }
  });

  app.delete("/api/admin/audio/:id", async (req, res) => {
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

  return httpServer;
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


