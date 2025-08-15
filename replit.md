# Overview

This is an employee attendance and audio monitoring system for Bedi Enterprises. The application features a mobile-first employee check-in interface using geolocation verification and an admin dashboard with hidden audio recording capabilities. The system is designed to track employee attendance within a specific geographical location (shop coordinates) and provides silent audio monitoring functionality accessible only to authorized administrators.

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Frontend Architecture
- **Framework**: React 18 with TypeScript and Vite for build tooling
- **UI Framework**: Shadcn/ui components built on Radix UI primitives with Tailwind CSS for styling
- **State Management**: TanStack Query (React Query) for server state management and caching
- **Authentication**: Context-based auth provider with session management
- **Routing**: Wouter for lightweight client-side routing
- **Real-time Communication**: WebSocket connection for live audio control features

## Backend Architecture
- **Runtime**: Node.js with Express.js framework using ESM modules
- **Authentication**: Passport.js with local strategy using scrypt for password hashing
- **Session Management**: Express sessions with PostgreSQL session store
- **Real-time Features**: WebSocket server for bidirectional communication
- **API Design**: RESTful endpoints with role-based access control (employee/admin)

## Database Design
- **ORM**: Drizzle ORM with PostgreSQL dialect
- **Schema**: Three main entities - users, attendance_records, and audio_recordings
- **Relationships**: Users have many attendance records and audio recordings
- **Data Types**: UUID primary keys, timestamp fields for temporal data, decimal for precise hour calculations

## Geolocation & Audio Features
- **Location Services**: Browser Geolocation API with high accuracy settings and distance calculations
- **Audio Recording**: Web Audio API with MediaRecorder for silent background recording
- **File Format**: WebM with Opus codec for efficient audio compression
- **Location Validation**: 150-meter geofence around shop coordinates (29.394155353241377, 76.96982203495648)

## Security Architecture
- **Role-Based Access**: Two-tier admin access (basic admin + audio access with secondary password)
- **Password Security**: Scrypt hashing with salt for credential storage
- **Session Security**: HTTP-only cookies with secure flags in production
- **Data Privacy**: Automatic audio file cleanup after 7 days

## Development Environment
- **Build System**: Vite with TypeScript compilation and hot module replacement
- **Database Migrations**: Drizzle Kit for schema management and migrations
- **Development Server**: Concurrent Express server with Vite middleware integration
- **Error Handling**: Runtime error overlay and structured error responses

# External Dependencies

## Database & Hosting
- **Neon Database**: PostgreSQL serverless database with connection pooling
- **Railway/Vercel**: Deployment targets for production hosting

## Authentication & Storage
- **Google OAuth**: Employee authentication option (configured but not fully implemented)
- **Firebase Storage**: Audio file storage solution for recorded sessions
- **Connect-pg-simple**: PostgreSQL session store for Express sessions

## UI & Development
- **Radix UI**: Accessible component primitives for all interactive elements
- **Tailwind CSS**: Utility-first CSS framework with custom design tokens
- **Shadcn/ui**: Pre-built component library following design system patterns
- **Lucide React**: Icon library for consistent iconography

## Build & Development Tools
- **TypeScript**: Type safety across client, server, and shared code
- **ESBuild**: Fast bundling for production server builds
- **Replit Integration**: Development environment plugins and error handling
- **WebSocket (ws)**: Server-side WebSocket implementation for real-time features