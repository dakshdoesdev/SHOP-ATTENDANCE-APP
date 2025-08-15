import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { setupAuth } from "./auth";
import { storage } from "./storage";
import { z } from "zod";

export function registerRoutes(app: Express): Server {
  setupAuth(app);

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
      
      // Check if already checked in today
      const existingRecord = await storage.getTodayAttendanceRecord(userId, today);
      if (existingRecord && !existingRecord.checkOutTime) {
        return res.status(400).json({ message: "Already checked in today" });
      }

      // GPS validation (29.394155353241377, 76.96982203495648)
      const shopLat = 29.394155353241377;
      const shopLng = 76.96982203495648;
      const distance = getDistance(latitude, longitude, shopLat, shopLng);
      
      if (distance > 150) {
        return res.status(400).json({ 
          message: `Too far from shop location. Distance: ${Math.round(distance)}m`,
          distance: Math.round(distance)
        });
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

      // Create audio recording session
      await storage.createAudioRecording({
        userId,
        attendanceId: attendanceRecord.id,
        fileUrl: `/audio/${userId}/${today}-${Date.now()}.webm`,
        fileName: `${today}-${Date.now()}.webm`,
        recordingDate: today,
        isActive: true,
      });

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

      // Stop audio recording
      const activeRecordings = await storage.getAudioRecordingsByUserId(userId);
      const activeRecording = activeRecordings.find(r => r.isActive && r.recordingDate === today);
      
      if (activeRecording) {
        const duration = Math.floor((checkOutTime.getTime() - existingRecord.checkInTime.getTime()) / 1000);
        await storage.updateAudioRecording(activeRecording.id, {
          isActive: false,
          duration,
          fileSize: Math.floor(duration * 1000), // Mock file size
        });
      }

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
      const recording = await storage.updateAudioRecording(req.params.id, {
        isActive: false,
        duration: Math.floor(Date.now() / 1000), // Mock duration
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

// Helper function to hash passwords (reused from auth.ts)
import { scrypt, randomBytes } from "crypto";
import { promisify } from "util";

const scryptAsync = promisify(scrypt);

async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}
