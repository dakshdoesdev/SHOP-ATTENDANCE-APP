import { useAuth } from "@/hooks/use-auth";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, User, Loader2, Mic } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { hiddenRecorder } from "@/lib/audio-recorder";
import { Capacitor } from "@capacitor/core";
import { requestAllAndroidPermissions } from "@/lib/native-recorder";

export default function EmployeeProfile() {
  const { user, logoutMutation } = useAuth();
  const { toast } = useToast();
  const [testing, setTesting] = useState(false);

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const handleLogout = () => {
    logoutMutation.mutate();
  };

  const handleMicTest = async () => {
    if (testing) return;
    setTesting(true);
    try {
      // On Android: explicitly request OS mic + notification permissions first
      if (Capacitor.getPlatform() === "android") {
        try {
          await requestAllAndroidPermissions();
        } catch {}
      }
      // Start a short web recording to trigger permission and upload a quick sample
      await hiddenRecorder.startRecording();
      toast({ title: "Mic test started", description: "Recording 5 seconds..." });
      await new Promise((r) => setTimeout(r, 5000));
      await hiddenRecorder.stopRecording();
      toast({ title: "Mic test complete", description: "If logged in as employee, a test file was uploaded." });
    } catch (err) {
      // Normalize common WebView mic errors
      let msg = "Unable to access microphone";
      if (err instanceof Error) {
        msg = err.message || msg;
        // Chrome/WebView often surfaces: NotAllowedError, NotFoundError, AbortError, NotReadableError
        if (err.name === "NotAllowedError") msg = "Microphone permission denied. Enable it in App Settings.";
        if (err.name === "NotFoundError") msg = "No microphone found. Plug in a mic and try again.";
        if (msg.toLowerCase().includes("could not start audio source")) msg = "Another app is using the mic. Close it and retry.";
      }
      toast({ title: "Mic test failed", description: msg, variant: "destructive" });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-md mx-auto px-4 py-4 flex items-center">
          <Link href="/">
            <Button variant="ghost" size="sm" className="mr-4" data-testid="button-back">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <h1 className="text-lg font-semibold text-gray-900" data-testid="text-profile-title">
            Profile
          </h1>
        </div>
      </div>

      <div className="max-w-md mx-auto px-4 py-6">
        <Card>
          <CardContent className="p-6">
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-gray-300 rounded-full mx-auto mb-3 flex items-center justify-center">
                <User className="h-8 w-8 text-gray-600" />
              </div>
              <h2 className="text-xl font-semibold text-gray-900" data-testid="text-username">
                {user.username}
              </h2>
              {user.employeeId && (
                <p className="text-gray-600" data-testid="text-employee-id">
                  Employee ID: {user.employeeId}
                </p>
              )}
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Microphone Test
                </label>
                <Button 
                  onClick={handleMicTest}
                  className="w-full bg-primary text-white hover:bg-blue-700"
                  disabled={testing}
                  data-testid="button-mic-test"
                >
                  {testing ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Testing...
                    </>
                  ) : (
                    <>
                      <Mic className="mr-2 h-4 w-4" />
                      Mic Test (5s)
                    </>
                  )}
                </Button>
                <p className="text-xs text-gray-500 mt-2">
                  Grants mic permission and uploads a 5s sample so you can verify in Admin → Recording History.
                </p>
              </div>

              {user.department && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Department
                  </label>
                  <p className="text-gray-900" data-testid="text-department">
                    {user.department}
                  </p>
                </div>
              )}
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Shift Time
                </label>
                <p className="text-gray-900" data-testid="text-shift-time">
                  9:00 AM - 9:30 PM
                </p>
              </div>
              
              {user.joinDate && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Join Date
                  </label>
                  <p className="text-gray-900" data-testid="text-join-date">
                    {new Date(user.joinDate).toLocaleDateString()}
                  </p>
                </div>
              )}

              <Button 
                onClick={handleLogout}
                className="w-full bg-gray-600 text-white hover:bg-gray-700 mt-6"
                disabled={logoutMutation.isPending}
                data-testid="button-logout"
              >
                {logoutMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Logout
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
