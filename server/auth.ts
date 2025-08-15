import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Express } from "express";
import session from "express-session";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { storage } from "./storage";
import { User as SelectUser, insertUserSchema } from "@shared/schema";
import { z } from "zod";

declare global {
  namespace Express {
    interface User extends SelectUser {}
  }
}

const scryptAsync = promisify(scrypt);

async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

async function comparePasswords(supplied: string, stored: string) {
  const [hashed, salt] = stored.split(".");
  const hashedBuf = Buffer.from(hashed, "hex");
  const suppliedBuf = (await scryptAsync(supplied, salt, 64)) as Buffer;
  return timingSafeEqual(hashedBuf, suppliedBuf);
}

export function setupAuth(app: Express) {
  const sessionSettings: session.SessionOptions = {
    secret: process.env.SESSION_SECRET || "bedi-enterprises-secret-key-2025",
    resave: false,
    saveUninitialized: false,
    store: storage.sessionStore,
    cookie: {
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
      maxAge: 2 * 60 * 60 * 1000, // 2 hours
    },
  };

  app.set("trust proxy", 1);
  app.use(session(sessionSettings));
  app.use(passport.initialize());
  app.use(passport.session());

  passport.use(
    new LocalStrategy(async (username, password, done) => {
      try {
        const user = await storage.getUserByUsername(username);
        if (!user || !(await comparePasswords(password, user.password))) {
          return done(null, false, { message: "Invalid username or password" });
        }
        return done(null, user);
      } catch (error) {
        return done(error);
      }
    }),
  );

  passport.serializeUser((user, done) => done(null, user.id));
  passport.deserializeUser(async (id: string, done) => {
    try {
      const user = await storage.getUser(id);
      done(null, user);
    } catch (error) {
      done(error);
    }
  });

  // Employee registration disabled - only admin can create accounts

  app.post("/api/login", (req, res, next) => {
    passport.authenticate("local", (err: any, user: SelectUser | false, info: any) => {
      if (err) return next(err);
      if (!user) {
        return res.status(401).json({ message: info?.message || "Invalid credentials" });
      }
      
      req.login(user, (err) => {
        if (err) return next(err);
        res.status(200).json(user);
      });
    })(req, res, next);
  });

  app.post("/api/logout", (req, res, next) => {
    req.logout((err) => {
      if (err) return next(err);
      res.sendStatus(200);
    });
  });

  app.get("/api/user", (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    res.json(req.user);
  });

  // Admin login endpoint
  app.post("/api/admin/login", async (req, res, next) => {
    const { username, password, audioPassword } = req.body;
    
    try {
      if (username !== "bediAdmin" || password !== "bediMain2025") {
        return res.status(401).json({ message: "Invalid admin credentials" });
      }

      // Create a mock admin user for session
      const adminUser: SelectUser = {
        id: "admin-user",
        username: "bediAdmin",
        password: "", // Don't store actual password
        role: "admin",
        employeeId: null,
        department: null,
        joinDate: null,
        isActive: true,
        createdAt: null,
      };

      req.login(adminUser, (err) => {
        if (err) return next(err);
        
        // Store audio access in session if provided
        if (audioPassword === "audioAccess2025") {
          (req.session as any).audioAccess = true;
          (req.session as any).audioAccessTime = Date.now();
        }
        
        res.status(200).json(adminUser);
      });
    } catch (error) {
      next(error);
    }
  });

  // Audio access verification
  app.post("/api/admin/audio-access", (req, res) => {
    if (!req.isAuthenticated() || req.user?.role !== "admin") {
      return res.status(401).json({ message: "Admin access required" });
    }

    const { audioPassword } = req.body;
    if (audioPassword !== "audioAccess2025") {
      return res.status(401).json({ message: "Invalid audio access password" });
    }

    (req.session as any).audioAccess = true;
    (req.session as any).audioAccessTime = Date.now();
    res.status(200).json({ success: true });
  });

  // Middleware to check audio access
  app.use("/api/admin/audio", (req, res, next) => {
    if (!req.isAuthenticated() || req.user?.role !== "admin") {
      return res.status(401).json({ message: "Admin access required" });
    }

    const session = req.session as any;
    const now = Date.now();
    const audioAccessTime = session.audioAccessTime;
    const thirtyMinutes = 30 * 60 * 1000;

    if (!session.audioAccess || !audioAccessTime || (now - audioAccessTime) > thirtyMinutes) {
      return res.status(401).json({ message: "Audio access expired or not granted" });
    }

    next();
  });
}
